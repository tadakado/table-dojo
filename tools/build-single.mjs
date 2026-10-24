// Build single-file versions of the two pages into dist/:
//   dist/table-dojo.html         practice page
//   dist/table-dojo-editor.html  physical layout editor
//
//   node tools/build-single.mjs      (npm run build)
//
// Everything the pages load from this repository is inlined: CSS, the ES modules
// (bundled into one classic script), js-yaml, the word list, the AZIK table and the
// default keyboard. The result works when opened directly from disk (file://).
// Only Google Fonts and the optional GitHub look-ups (keyboard from a repository)
// still go to the network; without it the pages fall back to system fonts and the
// bundled keyboard.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');

/** Bundle ES modules (static named imports/exports only) into one script. */
function bundle(entry) {
  const order = [], seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = read(file);
    for (const m of src.matchAll(/^import\s*\{[\s\S]*?\}\s*from\s*'(\.\/[^']+)';/gm)) visit(join(dirname(file), m[1]));
    order.push(file);
  };
  visit(entry);
  const id = f => '__m_' + f.replace(/\W/g, '_');
  return order.map(file => {
    let src = read(file);
    src = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*'(\.\/[^']+)';/gm, (_, names, from) =>
      `const {${names.replace(/\s+as\s+/g, ': ')}} = ${id(join(dirname(file), from))};`);
    const exported = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    src = src.replace(/^export\s+/gm, '');
    if (/^\s*export\b/m.test(src)) throw new Error(`${file}: unsupported export form`);
    return `const ${id(file)} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();`;
  }).join('\n\n');
}

/** Files the pages fetch at run time, served from memory instead. */
function bundledFiles() {
  const files = { 'words/basic.tsv': read('words/basic.tsv'), 'tables/azik.tsv': read('tables/azik.tsv'), 'keyboards/index.json': read('keyboards/index.json') };
  for (const k of JSON.parse(files['keyboards/index.json']).keyboards) { files[k.yaml] = read(k.yaml); files[k.layout] = read(k.layout); }
  return files;
}

// fetch() for relative paths answers from the bundled files; everything else goes to the network.
const FETCH_SHIM = files => `
(() => {
  const FILES = ${JSON.stringify(files).replace(/</g, '\\u003c')};
  const netFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    const u = String(url);
    if (!/^[a-z]+:/i.test(u) && Object.prototype.hasOwnProperty.call(FILES, u.replace(/^\\.\\//, ''))) {
      return Promise.resolve(new Response(FILES[u.replace(/^\\.\\//, '')], { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    }
    return netFetch(url, opts);
  };
})();`;

const inlineScript = code => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;

function build(page, entry, out) {
  let html = read(page);
  // stylesheets
  html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) => `<style>\n${read(href)}</style>`);
  // the "opened from file://" warning is not needed any more
  html = html.replace(/<script>\s*\/\/ ES modules do not load from file:\/\/[\s\S]*?<\/script>\s*/, '');
  // libraries and app code
  html = html.replace('<script src="vendor/js-yaml.min.js"></script>', inlineScript(read('vendor/js-yaml.min.js')));
  html = html.replace(new RegExp(`<script type="module" src="${entry}"></script>`),
    inlineScript(FETCH_SHIM(bundledFiles())) + '\n' + inlineScript(`(() => {\n${bundle(entry)}\n})();`));
  // links between the two pages
  html = html.replace(/href="\.\/"/g, 'href="table-dojo.html"')
             .replace(/href="editor\.html"/g, 'href="table-dojo-editor.html"');
  html = html.replace('</head>', `<meta name="generator" content="table-dojo tools/build-single.mjs">\n</head>`);
  if (/<script[^>]+src="(?!https?:)/.test(html) || /<link rel="stylesheet" href="(?!https?:)/.test(html)) throw new Error(`${out}: local reference left`);
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist', out), html);
  console.log(`dist/${out}  ${(html.length / 1024).toFixed(0)} KB`);
}

build('index.html', 'js/app.js', 'table-dojo.html');
build('editor.html', 'js/editor.js', 'table-dojo-editor.html');
