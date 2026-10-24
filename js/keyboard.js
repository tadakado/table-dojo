// Custom keyboard data: legends from a keymap-drawer YAML, key geometry from
// a ZMK physical layout (dtsi) or a keymap-drawer SVG.
import { toHalf } from './engine.js';

const S = 0.56; // px per 1/100 u when drawing from a dtsi (100 -> 56px, same as keymap-drawer's default)

const norm = v => {
  if (v == null) return { t: '', h: '', trans: false };
  if (typeof v !== 'object') return { t: String(v), h: '', trans: false };
  return { t: v.t == null ? '' : String(v.t), h: v.h == null ? '' : String(v.h), trans: v.type === 'trans' };
};

/** Key geometry from `&key_physical_attrs w h x y rot rx ry` (ZMK units: 1/100 u, 1/100 deg). */
export function geometryFromDts(text) {
  const geom = [...text.matchAll(/&key_physical_attrs\s+([^>]+)>/g)].map(m => {
    const [w, h, x, y, r, rx, ry] = m[1].trim().split(/\s+/).map(t => parseInt(t.replace(/[()]/g, ''), 10));
    const deg = (r || 0) / 100, c = { x: x + w / 2, y: y + h / 2 };
    let cx = c.x, cy = c.y;
    if (deg) {
      const a = deg * Math.PI / 180, dx = c.x - rx, dy = c.y - ry;
      cx = rx + dx * Math.cos(a) - dy * Math.sin(a);
      cy = ry + dx * Math.sin(a) + dy * Math.cos(a);
    }
    // centre position, rotation, and the rect relative to the centre
    return { x: cx * S, y: cy * S, rot: deg, rx: -w * S / 2, ry: -h * S / 2, w: w * S, h: h * S };
  });
  if (!geom.length) throw new Error('dtsi に key_physical_attrs が見つかりません');
  return geom;
}

/** Key geometry from the first layer of a keymap-drawer SVG (needs DOMParser). */
export function geometryFromSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const L = [...doc.querySelectorAll('g')].find(g => /(^|\s)layer-/.test(g.getAttribute('class') || ''));
  if (!L) throw new Error('SVGにレイヤーが見つかりません（keymap-drawer の出力か確認してください）');
  const geom = [];
  for (const g of L.querySelectorAll('g')) {
    const cls = g.getAttribute('class') || '', m = /keypos-(\d+)/.exec(cls);
    if (!m || /combo/.test(cls)) continue;
    const tr = g.getAttribute('transform') || '';
    const t = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(tr), r = /rotate\(\s*([-\d.]+)/.exec(tr), rc = g.querySelector('rect');
    if (!t || !rc) continue;
    geom[+m[1]] = { x: +t[1], y: +t[2], rot: r ? +r[1] : 0, rx: +rc.getAttribute('x'), ry: +rc.getAttribute('y'), w: +rc.getAttribute('width'), h: +rc.getAttribute('height') };
  }
  if (!geom.filter(Boolean).length) throw new Error('SVGにキー（keypos-N）が見つかりません');
  return geom;
}

/**
 * Build a keyboard from a keymap-drawer YAML and a layout file (dtsi or SVG).
 * `yaml` is a js-yaml compatible parser (window.jsyaml in the browser).
 */
export function parseKeyboard(yaml, yamlText, layoutText, label) {
  if (!yaml) throw new Error('YAMLの読込ライブラリを読み込めませんでした');
  const y = yaml.load(yamlText);
  if (!y || !y.layers) throw new Error('YAMLに layers がありません');
  const layers = Object.entries(y.layers).map(([name, rows]) => ({ name, keys: (Array.isArray(rows) ? rows : []).flat(2).map(norm) }));
  const geom = /key_physical_attrs/.test(layoutText) ? geometryFromDts(layoutText) : geometryFromSvg(layoutText);
  return { label, layers, geom };
}

/** Legend of key `pos` on layer `li`; transparent keys fall through to the base layer, then layer 0. */
export function legendAt(kb, li, pos, base) {
  const k = kb.layers[li] && kb.layers[li].keys[pos];
  if (!k) return { t: '', h: '' };
  if (!k.trans) return k;
  if (li !== base) return legendAt(kb, base, pos, base);
  return li !== 0 ? legendAt(kb, 0, pos, 0) : { t: '', h: '' };
}

/** The character a legend types, or null for multi-character legends (Esc, Lower, ...). */
export function legendChar(t) {
  if (t === 'Space' || t === 'SPACE' || t === '␣') return ' ';
  if ([...t].length !== 1) return null;
  return toHalf(t).toLowerCase();
}

/**
 * Where to type `c`: on the base layer, or on another layer reached by holding
 * the key whose legend (tap or hold) equals that layer's name.
 * Returns { layer, pos, hold } or null.
 */
export function findKey(kb, base, c) {
  if (!kb || c == null) return null;
  const n = kb.geom.length;
  for (let p = 0; p < n; p++) if (legendChar(legendAt(kb, base, p, base).t) === c) return { layer: base, pos: p, hold: null };
  for (let li = 0; li < kb.layers.length; li++) {
    if (li === base) continue;
    const nm = kb.layers[li].name;
    let act = null;
    for (let p = 0; p < n; p++) { const L = legendAt(kb, base, p, base); if (L.t === nm || L.h === nm) { act = p; break; } }
    if (act == null) continue;
    for (let p = 0; p < n; p++) if (legendChar(legendAt(kb, li, p, base).t) === c) return { layer: li, pos: p, hold: act };
  }
  return null;
}
