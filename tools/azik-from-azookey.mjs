// Convert azooKey's AZIK table (Swift) into a Google Japanese Input style TSV.
//
//   node tools/azik-from-azookey.mjs [defaultAzik.swift] > tables/azik.tsv
//
// Source: https://github.com/azooKey/AzooKeyKanaKanjiConverter
//   Sources/KanaKanjiConverterModule/InputManagement/InputTables/defaultAzik.swift (MIT License)
// Without an argument the file is downloaded at the pinned commit below.
import { readFileSync } from 'node:fs';

export const COMMIT = '04ce2ec3afe2bd6f92fcae1dc15a2357d332c27a';
export const URL_ = `https://raw.githubusercontent.com/azooKey/AzooKeyKanaKanjiConverter/${COMMIT}/Sources/KanaKanjiConverterModule/InputManagement/InputTables/defaultAzik.swift`;

// azooKey stores keys as the characters the typed keys turn into (KeyMap.h2zMap in azooKey-Desktop:
// ";"->"；", "-"->"ー", "."->"。", "["->"「", ...). Map them back to the keys themselves.
const Z2H = {
  '！': '!', '”': '"', '＃': '#', '＄': '$', '％': '%', '＆': '&', '’': "'", '（': '(', '）': ')', '＝': '=',
  '〜': '~', '｜': '|', '｀': '`', '『': '{', '＋': '+', '＊': '*', '』': '}', '＜': '<', '＞': '>', '？': '?',
  '＿': '_', 'ー': '-', '＾': '^', '＼': '\\', '￥': '\\', '＠': '@', '「': '[', '；': ';', '：': ':', '」': ']',
  '、': ',', '。': '.', '・': '/',
};
const keyToHalf = s => [...s].map(c => Z2H[c] ?? c).join('');

/** Parse `"key": "value",` pairs; azooKey writes symbol keys full-width and the hyphen key as ー. */
export function convert(swift) {
  const rows = [];
  for (const m of swift.matchAll(/^\s*"((?:[^"\\]|\\.)+)":\s*"((?:[^"\\]|\\.)*)",?\s*(?:\/\/.*)?$/gm)) {
    const key = keyToHalf(m[1]);
    // Trailing ASCII letters in the value are pending input (Google IME's 3rd column), e.g. "kk": "っk".
    const v = /^(.*?)([a-z]*)$/.exec(m[2]);
    rows.push([key, v[1], v[2]]);
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await (await fetch(URL_)).text();
  const rows = convert(src);
  if (rows.length < 100) throw new Error(`only ${rows.length} rules parsed`);
  process.stdout.write(
    `# AZIK romaji table converted from azooKey (AzooKeyKanaKanjiConverter ${COMMIT.slice(0, 7)}, MIT License)\n` +
    `# https://github.com/azooKey/AzooKeyKanaKanjiConverter  — see tables/azik.LICENSE\n` +
    rows.map(r => (r[2] ? r.join('\t') : r[0] + '\t' + r[1])).join('\n') + '\n');
}
