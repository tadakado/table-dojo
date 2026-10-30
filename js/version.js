// Show the deployed version (commit time in JST, e.g. 2026.10.30.2056).
// version.json is written by the Pages workflow (.github/workflows/pages.yml) and by
// tools/build-single.mjs; a local checkout has none and shows "dev".
export async function showVersion(el) {
  if (!el) return;
  let v = null;
  try {
    const r = await fetch('version.json', { cache: 'no-cache' });
    if (r.ok) v = await r.json();
  } catch (e) { /* not deployed */ }
  if (!v || !v.version) { el.textContent = 'dev'; el.title = 'ローカルの作業コピー'; return; }
  el.textContent = v.version;
  if (v.commit) {
    el.title = `commit ${v.commit.slice(0, 7)}`;
    if (v.repo) el.href = `https://github.com/${v.repo}/commit/${v.commit}`;
  }
}
