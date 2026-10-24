// Fetch a custom keyboard (keymap-drawer YAML + ZMK dtsi) from the web.
//
// Accepted inputs:
//   owner/repo  owner/repo@ref                      GitHub repository
//   https://github.com/owner/repo[/tree/ref]        GitHub repository
//   https://github.com/owner/repo/blob/ref/path.yaml
//   https://raw.githubusercontent.com/owner/repo/ref/path.yaml
//   any other https URL of a keymap-drawer YAML
//
// The layout comes from the YAML's `layout: {dts_layout: <path>}` (resolved
// against the repository root on GitHub, or against the YAML URL elsewhere),
// unless a layout URL is given explicitly.

const RAW = 'https://raw.githubusercontent.com';

/** Parse the user's input into { kind: 'github', owner, repo, ref, path } or { kind: 'url', url }. */
export function parseSpec(input) {
  const s = (input || '').trim();
  if (!s) throw new Error('リポジトリ名か URL を入力してください');
  let m = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:@([\w./-]+))?$/.exec(s);
  if (m) return { kind: 'github', owner: m[1], repo: m[2], ref: m[3] || 'HEAD', path: '' };
  let u;
  try { u = new URL(s); } catch (e) { throw new Error('「owner/repo」か https の URL を入力してください'); }
  if (u.protocol !== 'https:') throw new Error('https の URL を指定してください');
  const parts = u.pathname.split('/').filter(Boolean);
  if (u.hostname === 'github.com' && parts.length >= 2) {
    const [owner, repo0, kind, ref, ...rest] = parts;
    const repo = repo0.replace(/\.git$/, '');
    if (!kind) return { kind: 'github', owner, repo, ref: 'HEAD', path: '' };
    if ((kind === 'tree' || kind === 'blob') && ref) return { kind: 'github', owner, repo, ref, path: rest.join('/') };
  }
  if (u.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
    const [owner, repo, ref, ...rest] = parts;
    return { kind: 'github', owner, repo, ref, path: rest.join('/') };
  }
  return { kind: 'url', url: u.href };
}

export const rawUrl = (g, path) => `${RAW}/${g.owner}/${g.repo}/${g.ref}/${path.replace(/^\/+/, '')}`;

/** `layout: {dts_layout: path}` from a keymap-drawer YAML, or null. */
export function dtsLayoutOf(yaml, yamlText) {
  const y = yaml.load(yamlText);
  const p = y && y.layout && y.layout.dts_layout;
  return typeof p === 'string' && p ? p : null;
}

async function defaultFetchText(url) {
  let r;
  try { r = await fetch(url, { cache: 'no-cache' }); }
  catch (e) { throw netError(); }
  if (!r.ok) { const err = new Error(`${url} を取得できませんでした（${r.status}）`); err.status = r.status; throw err; }
  return r.text();
}
const netError = () => Object.assign(new Error('GitHub / URL に接続できませんでした。ネットワークを確認してください'), { network: true });

/** Find the keymap YAML in a repository: keymap/<repo>.yaml, else any YAML in keymap/ (GitHub API). */
async function findYamlInRepo(g, fetchText) {
  for (const p of [`keymap/${g.repo}.yaml`, `keymap/${g.repo}.yml`]) {
    try { return { path: p, text: await fetchText(rawUrl(g, p)) }; } catch (e) { if (e.network) throw e; /* else try next */ }
  }
  const ref = g.ref === 'HEAD' ? '' : `?ref=${encodeURIComponent(g.ref)}`;
  let list;
  try { list = JSON.parse(await fetchText(`https://api.github.com/repos/${g.owner}/${g.repo}/contents/keymap${ref}`)); }
  catch (e) {
    if (e.network) throw e;
    if (e.status === 403) throw new Error('GitHub API の利用回数の上限に達しました。しばらく待つか、YAML の URL を直接指定してください');
    throw new Error(`${g.owner}/${g.repo} の keymap/ に YAML が見つかりません（リポジトリ名か、公開設定を確認してください）。YAML の URL を直接指定することもできます`);
  }
  const f = Array.isArray(list) && list.find(x => x.type === 'file' && /\.ya?ml$/i.test(x.name) && x.name !== 'config.yaml');
  if (!f) throw new Error(`${g.owner}/${g.repo} の keymap/ に刻印 YAML が見つかりません`);
  return { path: f.path, text: await fetchText(rawUrl(g, f.path)) };
}

/**
 * Resolve and download a keyboard.
 * Returns { name, source, yamlUrl, yamlText, layoutUrl, layoutText }.
 */
export async function fetchKeyboard(input, { yaml, layoutUrl = '', fetchText = defaultFetchText } = {}) {
  if (!yaml) throw new Error('YAMLの読込ライブラリを読み込めませんでした');
  const spec = parseSpec(input);
  let yamlUrl, yamlText, name, resolve;
  if (spec.kind === 'github') {
    if (spec.path && /\.ya?ml$/i.test(spec.path)) {
      yamlUrl = rawUrl(spec, spec.path); yamlText = await fetchText(yamlUrl);
    } else {
      const f = await findYamlInRepo(spec, fetchText);
      yamlUrl = rawUrl(spec, f.path); yamlText = f.text;
    }
    name = spec.repo;
    resolve = p => rawUrl(spec, p);           // dts_layout paths are repo-relative
  } else {
    yamlUrl = spec.url; yamlText = await fetchText(yamlUrl);
    name = decodeURIComponent(new URL(yamlUrl).pathname.split('/').pop() || 'keyboard').replace(/\.ya?ml$/i, '');
    resolve = p => new URL(p, yamlUrl).href;  // relative to the YAML
  }
  let lu = (layoutUrl || '').trim();
  if (lu) {
    const ls = parseSpec(lu);
    lu = ls.kind === 'github' ? rawUrl(ls, ls.path) : ls.url;
  } else {
    const p = dtsLayoutOf(yaml, yamlText);
    if (!p) throw new Error('YAML に layout: {dts_layout: …} がありません。配置ファイル（dtsi）の URL も指定してください');
    lu = /^https:\/\//.test(p) ? p : resolve(p);
  }
  const layoutText = await fetchText(lu);
  const source = spec.kind === 'github' ? `${spec.owner}/${spec.repo}${spec.ref === 'HEAD' ? '' : '@' + spec.ref}` : yamlUrl;
  return { name, source, yamlUrl, yamlText, layoutUrl: lu, layoutText };
}
