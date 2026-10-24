// Romaji-table engine: IME simulator + shortest-keystroke solver.
// No DOM access, so it runs in the browser and under `node --test`.

/** Fold full-width ASCII (as found in some Google IME exports) to half-width. */
export const toHalf = s =>
  s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/[￥¥]/g, '\\');

/** Katakana -> hiragana, whitespace removed. */
export const toHira = s =>
  s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');

/** Built-in table close to Google Japanese Input's default romaji table. */
export function stdEntries() {
  const E = [], add = (i, o, n = '') => E.push({ in: i, out: o, next: n }), V = 'aiueo';
  const rows = {
    '': 'あいうえお', k: 'かきくけこ', s: 'さしすせそ', t: 'たちつてと', n: 'なにぬねの', h: 'はひふへほ',
    m: 'まみむめも', r: 'らりるれろ', g: 'がぎぐげご', z: 'ざじずぜぞ', d: 'だぢづでど', b: 'ばびぶべぼ',
    p: 'ぱぴぷぺぽ', x: 'ぁぃぅぇぉ', l: 'ぁぃぅぇぉ', c: 'かしくせこ',
  };
  for (const [c, ks] of Object.entries(rows)) [...ks].forEach((k, i) => add(c + V[i], k));
  const multi = {
    y: ['や', 'い', 'ゆ', 'いぇ', 'よ'], w: ['わ', 'うぃ', 'う', 'うぇ', 'を'],
    f: ['ふぁ', 'ふぃ', 'ふ', 'ふぇ', 'ふぉ'], j: ['じゃ', 'じ', 'じゅ', 'じぇ', 'じょ'],
    v: ['ゔぁ', 'ゔぃ', 'ゔ', 'ゔぇ', 'ゔぉ'], sh: ['しゃ', 'し', 'しゅ', 'しぇ', 'しょ'],
    ch: ['ちゃ', 'ち', 'ちゅ', 'ちぇ', 'ちょ'], ts: ['つぁ', 'つぃ', 'つ', 'つぇ', 'つぉ'],
    th: ['てゃ', 'てぃ', 'てゅ', 'てぇ', 'てょ'], dh: ['でゃ', 'でぃ', 'でゅ', 'でぇ', 'でょ'],
    q: ['くぁ', 'くぃ', 'く', 'くぇ', 'くぉ'], wh: ['うぁ', 'うぃ', 'う', 'うぇ', 'うぉ'],
    tw: ['とぁ', 'とぃ', 'とぅ', 'とぇ', 'とぉ'], dw: ['どぁ', 'どぃ', 'どぅ', 'どぇ', 'どぉ'],
  };
  for (const [c, a] of Object.entries(multi)) a.forEach((k, i) => add(c + V[i], k));
  const sm = 'ゃぃゅぇょ';
  const yo = { k: 'き', g: 'ぎ', s: 'し', z: 'じ', t: 'ち', c: 'ち', d: 'ぢ', n: 'に', h: 'ひ', b: 'び', p: 'ぴ', m: 'み', r: 'り', f: 'ふ', v: 'ゔ', j: 'じ' };
  for (const [c, i] of Object.entries(yo)) [...sm].forEach((s, k) => add(c + 'y' + V[k], i + s));
  [['nn', 'ん'], ['n', 'ん'], ["n'", 'ん'], ['xn', 'ん'], ['xtu', 'っ'], ['ltu', 'っ'], ['xtsu', 'っ'], ['ltsu', 'っ'],
   ['xya', 'ゃ'], ['xyu', 'ゅ'], ['xyo', 'ょ'], ['lya', 'ゃ'], ['lyu', 'ゅ'], ['lyo', 'ょ'], ['xwa', 'ゎ'], ['lwa', 'ゎ'],
   ['-', 'ー'], [',', '、'], ['.', '。'], ['[', '「'], [']', '」'], ['/', '・'], ['~', '〜']].forEach(([i, o]) => add(i, o));
  for (const c of 'bcdfghjklmpqrstvwxyz') add(c + c, 'っ', c);
  return E;
}

/**
 * Parse a Google Japanese Input romaji table export:
 * one rule per line, `input<TAB>output[<TAB>next input]`.
 */
export function parseTable(text) {
  return text.replace(/^﻿/, '').split(/\n/).map(l => l.replace(/\r$/, ''))
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const p = l.split('\t'); return { in: toHalf(p[0]), out: p[1] ?? '', next: toHalf(p[2] ?? '') }; })
    .filter(e => e.in && (e.out || e.next));
}

/** Word list: `表記<TAB or ,>よみ` per line, or a reading alone. */
export function parseWords(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
    const p = l.split(/\t|,/).map(s => s.trim()).filter(Boolean);
    return p.length >= 2 ? { w: p[0], y: toHira(p[1]) } : { w: p[0], y: toHira(p[0]) };
  }).filter(o => o.y);
}

/** Simulates how the IME converts a stream of keys with a given table. */
export class Engine {
  constructor(entries) {
    this.exact = new Map(); this.prefix = new Set(); this.memo = new Map();
    const a = new Set();
    for (const e of entries) {
      if (!e.in) continue;
      this.exact.set(e.in, e);
      for (let i = 1; i < e.in.length; i++) this.prefix.add(e.in.slice(0, i));
      for (const ch of e.in) a.add(ch);
    }
    // Order keys so that, among equally short ways, plain romaji comes first.
    const ORD = 'aiueoknstmhyrwgzdbpjfv';
    const rank = c => { const i = ORD.indexOf(c); return i >= 0 ? i : /[a-z]/.test(c) ? 40 : 30; };
    this.alpha = [...a].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
    this.alphaSet = new Set(this.alpha);
    this.size = this.exact.size;
  }

  /** Feed one key into the pending buffer. Returns [committed kana, new buffer]. */
  feed(buf, c) {
    const mk = buf + '\u0000' + c, m = this.memo.get(mk);
    if (m) return m;
    let out = '', b = buf, q = c, guard = 0;
    while (q.length && guard++ < 64) {
      const ch = q[0]; q = q.slice(1);
      const b2 = b + ch;
      if (this.prefix.has(b2)) { b = b2; continue; }
      const ex = this.exact.get(b2);
      if (ex) { out += ex.out; b = ex.next || ''; continue; }
      if (b === '') { out += ch; continue; }
      const eb = this.exact.get(b);
      if (eb) { out += eb.out; b = eb.next || ''; q = ch + q; }
      else { out += b[0]; q = b.slice(1) + ch + q; b = ''; }
    }
    const r = [out, b];
    this.memo.set(mk, r);
    return r;
  }

  /** What the pending buffer becomes when the word is finished (e.g. a trailing `n`). */
  flush(buf) {
    let out = '', b = buf;
    for (let g = 0; b && g < 16; g++) {
      const ex = this.exact.get(b);
      if (ex) {
        out += ex.out;
        if ((ex.next || '') === b) { out += b; break; }
        b = ex.next || '';
        if (b && !this.exact.get(b) && !this.prefix.has(b)) { out += b; b = ''; }
      } else {
        out += b[0];
        let nb = '';
        for (const ch of b.slice(1)) { const r = this.feed(nb, ch); out += r[0]; nb = r[1]; }
        b = nb;
      }
    }
    return out;
  }
}

/**
 * Shortest keystrokes to type `target` (hiragana) with `eng`.
 * Graph over (kana position, pending buffer); BFS backwards from goal states.
 * Returns { start, target, len, min } where every node has `.dist` to a goal.
 */
export function solve(eng, target) {
  const len = target.length, nodes = new Map(), order = [];
  const isGoal = (p, b) => (p === len && b === '') || (b !== '' && eng.flush(b) === target.slice(p));
  const get = (p, b) => {
    const k = p + '\u0001' + b;
    let n = nodes.get(k);
    if (!n) { n = { p, b, edges: [], goal: isGoal(p, b), dist: Infinity }; nodes.set(k, n); order.push(n); }
    return n;
  };
  const start = get(0, '');
  for (let i = 0; i < order.length && order.length < 8000; i++) {
    const n = order[i];
    if (n.goal) continue;
    for (const c of eng.alpha) {
      const [o, nb] = eng.feed(n.b, c);
      if (o && target.substr(n.p, o.length) !== o) continue;
      n.edges.push([c, get(n.p + o.length, nb)]);
    }
  }
  const rev = new Map();
  for (const n of order) for (const [, t] of n.edges) { let r = rev.get(t); if (!r) rev.set(t, r = []); r.push(n); }
  const q = order.filter(n => n.goal);
  q.forEach(n => { n.dist = 0; });
  for (let i = 0; i < q.length; i++) {
    const t = q[i];
    for (const s of rev.get(t) || []) if (s.dist === Infinity) { s.dist = t.dist + 1; q.push(s); }
  }
  return { start, target, len, min: start.dist, eng, nodes };
}

/**
 * One shortest key sequence from `node`.
 * Among equally short choices it follows, in order:
 *   1. `prefer` (what the user has been typing), as long as it stays shortest;
 *   2. standard romaji, when `sol` is given and plain romaji is among the shortest ways
 *      (AZIK's `kgo` and `kyo` are both きょ in 3 keys; `kyo` is shown);
 *   3. the engine's key order.
 */
export function makePlan(node, prefer = [], sol = null) {
  const keys = [];
  let cur = node, i = 0, pref = prefer;
  // Standard romaji typed in parallel: { p, b } in the standard table's graph for the same word.
  const stdG = sol && sol.eng !== STD ? stdSolution(sol.target) : null;
  let std = stdG && cur.b === '' ? { p: cur.p, b: '' } : null;
  while (cur.dist > 0 && cur.dist < Infinity) {
    const cands = cur.edges.filter(e => e[1].dist === cur.dist - 1);
    let pick = cands.find(e => e[0] === pref[i]) || null;
    if (!pick && std) {
      const sn = stdG.nodes.get(std.p + '\u0001' + std.b);
      if (sn && sn.dist < Infinity) {
        const good = new Set(sn.edges.filter(e => e[1].dist === sn.dist - 1).map(e => e[0]));
        pick = cands.find(e => good.has(e[0])) || null;
      }
    }
    if (!pick) pick = cands[0];
    if (!pick) break;
    if (pick[0] !== pref[i]) pref = [];
    // advance the parallel standard-romaji state; drop it when this key is not plain romaji
    if (std) {
      const [o, nb] = STD.feed(std.b, pick[0]);
      std = o && sol.target.substr(std.p, o.length) !== o ? null : { p: std.p + o.length, b: nb };
    }
    keys.push(pick[0]); cur = pick[1]; i++;
    if (!std && stdG && cur.b === '') std = { p: cur.p, b: '' };   // resync at a commit boundary
  }
  return keys;
}

/**
 * Split a key sequence into display units: [{ keys, i (start index), kana }].
 * A unit ends when the IME buffer empties, and also when pending keys are
 * committed as they are and the next key starts afresh (a lone `n` for ん
 * before `d` gives `n|de`, not `nde`).
 */
export function chunksOf(sol, seq) {
  const out = [], eng = sol.eng;
  let cur = sol.start, ch = { keys: '', p: 0, i: 0 };
  seq.forEach((c, idx) => {
    const e = cur.edges.find(x => x[0] === c);
    if (!e) return;
    if (ch.keys && cur.b !== '' && eng) {
      const f = eng.flush(cur.b), [o, nb] = eng.feed(cur.b, c), [o2, nb2] = eng.feed('', c);
      if (f && o === f + o2 && nb === nb2 && sol.target.substr(ch.p, f.length) === f) {
        out.push({ keys: ch.keys, i: ch.i, kana: f });
        ch = { keys: '', p: ch.p + f.length, i: idx };
      }
    }
    if (!ch.keys) { ch.p = ch.p > cur.p ? ch.p : cur.p; ch.i = idx; }
    ch.keys += c; cur = e[1];
    if (cur.b === '') { out.push({ keys: ch.keys, i: ch.i, kana: sol.target.slice(ch.p, cur.p) }); ch = { keys: '', p: cur.p, i: idx + 1 }; }
  });
  if (ch.keys) out.push({ keys: ch.keys, i: ch.i, kana: sol.target.slice(ch.p, cur.goal ? sol.len : cur.p) });
  return out;
}

/** The built-in standard table, used as the baseline for comparisons. */
export const STD = new Engine(stdEntries());
const stdCache = new Map();
/** Full standard-romaji solution for `y` (cached). */
export function stdSolution(y) {
  let s = stdCache.get(y);
  if (!s) { s = solve(STD, y); stdCache.set(y, s); }
  return s;
}
/** Shortest keystrokes with standard romaji. */
export const stdMin = y => stdSolution(y).min;

/** Caches solutions for one table and answers word-level questions. */
export class Solver {
  constructor(eng) { this.eng = eng; this.cache = new Map(); }

  sol(y) {
    let s = this.cache.get(y);
    if (!s) { s = solve(this.eng, y); this.cache.set(y, s); }
    return s;
  }

  /**
   * True if the table's own rules matter for `y`: either it saves keystrokes
   * over standard romaji, or a shortest way uses a symbol-key rule
   * (e.g. `;` for っ, `:` for ー). Words where only an alternative letter
   * spelling ties with plain romaji (e.g. AZIK `kf` for き) return false.
   */
  usesExt(y) {
    const s = this.sol(y);
    if (s.min === Infinity) return false;
    if (s.ext !== undefined) return s.ext;
    if (s.min < stdMin(y)) { s.ext = true; return true; }
    const len = y.length, seen = new Set(), st = [[s.start, 0, '']];
    let ext = false;
    while (st.length && !ext) {
      const [n, sp, sb] = st.pop();
      for (const [c, t] of n.edges) {
        if (t.dist !== n.dist - 1) continue;
        const [o, nb] = STD.feed(sb, c);
        const np = sp + o.length;
        const bad = (o && y.substr(sp, o.length) !== o) ||
          (t.goal && !((np === len && nb === '') || (nb !== '' && STD.flush(nb) === y.slice(np))));
        if (bad) { if (/[^a-z]/.test(c)) { ext = true; break; } continue; }
        if (t.goal) continue;
        const k = t.p + '|' + t.b + '|' + np + '|' + nb;
        if (!seen.has(k)) { seen.add(k); st.push([t, np, nb]); }
      }
    }
    s.ext = ext;
    return ext;
  }
}
