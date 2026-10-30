import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Engine, Solver, STD, stdEntries, parseTable, parseWords, solve, makePlan, chunksOf, chunkAlternatives, stdMin, toHalf, toHira,
} from '../js/engine.js';

const fixture = readFileSync(new URL('./fixtures/azik-mini.tsv', import.meta.url), 'utf8');
const AZIK = new Engine(stdEntries().concat(parseTable(fixture)));
const plan = (eng, y) => makePlan(solve(eng, y).start).join('');

test('standard romaji: shortest plans', () => {
  assert.equal(plan(STD, 'にゅうじょうけん'), 'nyuujouken');
  assert.equal(plan(STD, 'よっつ'), 'yottu');
  assert.equal(plan(STD, 'ほん'), 'hon');            // trailing n is flushed at the end of the word
  assert.equal(stdMin('いっしょうけんめい'), 12);
});

test('AZIK rules shorten words', () => {
  const s = solve(AZIK, 'にゅうじょうけん');
  assert.equal(s.min, 7);
  assert.equal(makePlan(s.start).join(''), 'nyhjpkd');
  assert.deepEqual(chunksOf(s, makePlan(s.start)).map(c => c.keys + ':' + c.kana), ['nyh:にゅう', 'jp:じょう', 'kd:けん']);
});

test('3rd column (next input): kk -> っ + k', () => {
  const [out, buf] = STD.feed('k', 'k');
  assert.equal(out, 'っ');
  assert.equal(buf, 'k');
});

test('full-width symbols in a table are folded to half-width', () => {
  assert.equal(toHalf('：'), ':');
  const e = parseTable('：\tー\n');
  assert.deepEqual(e, [{ in: ':', out: 'ー', next: '' }]);
  assert.equal(AZIK.feed('', ':')[0], 'ー');
});

test('every shortest way is accepted, not only the displayed one', () => {
  const s = solve(AZIK, 'よっつ');
  const ways = [];
  (function dfs(n, p) { if (n.goal) { ways.push(p); return; } for (const [c, t] of n.edges) if (t.dist === n.dist - 1) dfs(t, p + c); })(s.start, '');
  assert.ok(ways.includes('yottu'));
  assert.ok(ways.includes('yo;tu'));
});

test('usesExt: keeps words that save keys or use symbol-key rules', () => {
  const sv = new Solver(AZIK);
  assert.equal(sv.usesExt('にゅうじょうけん'), true);  // fewer keys
  assert.equal(sv.usesExt('よっつ'), true);            // same count, but ; for っ
  assert.equal(sv.usesExt('こーひー'), true);          // same count, but : for ー
  assert.equal(sv.usesExt('きせつ'), false);           // only kf (letters) ties with ki
  assert.equal(sv.usesExt('いみ'), false);
});

test('word list parsing', () => {
  assert.deepEqual(parseWords('入場券\tにゅうじょうけん\n量子ビット,リョウシビット\n# comment\nきっぷ\n'), [
    { w: '入場券', y: 'にゅうじょうけん' },
    { w: '量子ビット', y: 'りょうしびっと' },
    { w: 'きっぷ', y: 'きっぷ' },
  ]);
  assert.equal(toHira('カタカナ'), 'かたかな');
});

test('bundled basic vocabulary is fully typeable with standard romaji', () => {
  const words = parseWords(readFileSync(new URL('../words/basic.tsv', import.meta.url), 'utf8'));
  assert.ok(words.length >= 1000);
  const readings = new Set(words.map(w => w.y));
  assert.equal(readings.size, words.length, 'duplicate readings');
  const ng = words.filter(w => !/^[ぁ-ゖー]+$/.test(w.y) || stdMin(w.y) === Infinity).map(w => w.w);
  assert.deepEqual(ng, []);
});

test('display units: a lone n for ん is its own unit', () => {
  const units = (eng, y) => { const s = solve(eng, y); return chunksOf(s, makePlan(s.start)).map(c => c.keys + ':' + c.kana); };
  assert.deepEqual(units(STD, 'いしんでんしん'), ['i:い', 'si:し', 'n:ん', 'de:で', 'n:ん', 'si:し', 'n:ん']);
  assert.deepEqual(units(STD, 'がっこう'), ['ga:が', 'kko:っこ', 'u:う']);   // kk -> っ stays with its kana
  assert.deepEqual(units(STD, 'こんにちは').join(' '), 'ko:こ nn:ん ni:に ti:ち ha:は');
  assert.deepEqual(units(AZIK, 'にゅうじょうけん'), ['nyh:にゅう', 'jp:じょう', 'kd:けん']);
});

test('bundled AZIK table (from azooKey) works with the engine', () => {
  const az = new Engine(parseTable(readFileSync(new URL('../tables/azik.tsv', import.meta.url), 'utf8')));
  assert.equal(plan(az, 'にゅうじょうけん'), 'nyhjpkd');
  assert.equal(plan(az, 'しんかんせん'), 'skknsd');
  assert.equal(plan(az, 'よっつ'), 'yo;tu');
  assert.equal(plan(az, 'こーひー'), 'ko:hi:');
  const words = parseWords(readFileSync(new URL('../words/basic.tsv', import.meta.url), 'utf8'));
  assert.deepEqual(words.filter(w => solve(az, w.y).min === Infinity).map(w => w.w), []);
});

test('equally short: standard romaji is preferred over alternative spellings', () => {
  const az = new Engine(parseTable(readFileSync(new URL('../tables/azik.tsv', import.meta.url), 'utf8')));
  const shown = y => { const s = solve(az, y); return makePlan(s.start, [], s).join(''); };
  assert.equal(shown('きょねん'), 'kyond');      // not kgond
  assert.equal(shown('きょう'), 'kyp');          // not kgp
  assert.equal(shown('ふね'), 'hune');           // not hfne
  assert.equal(shown('でんき'), 'ddki');         // not ddkf
  // A table whose key order would pick the alternative first: `ak` = か ties with `ka`.
  const odd = new Engine(stdEntries().concat(parseTable('ak\tか\n')));
  const s = solve(odd, 'かさ');
  assert.equal(makePlan(s.start).join(''), 'aksa');               // key order alone
  assert.equal(makePlan(s.start, [], s).join(''), 'kasa');        // standard romaji preferred
});

test('alternatives per display unit: equally short and still finishing the word', () => {
  const az = new Engine(parseTable(readFileSync(new URL('../tables/azik.tsv', import.meta.url), 'utf8')));
  const show = (eng, y) => {
    const s = solve(eng, y), p = makePlan(s.start, [], s), al = chunkAlternatives(s, p);
    return chunksOf(s, p).map((c, i) => c.keys + (al[i].length ? '[' + al[i].join('/') + ']' : '')).join(' ');
  };
  assert.equal(show(az, 'きょねん'), 'kyo[kgo] nd');
  assert.equal(show(az, 'かんきょう'), 'kn[kz] kyp[kgp]');
  assert.equal(show(AZIK, 'よっつ'), 'yo ttu[;tu]');            // test table: kk-style っ and ; both work
  assert.equal(show(AZIK, 'いんしょう'), 'i n[q] sho[syo] u');   // a lone n and q are both ん
  // every alternative really works in place of the shown keys
  for (const y of ['しんかんせん', 'せっきょくてき', 'にゅうじょうけん']) {
    const s = solve(az, y), p = makePlan(s.start, [], s), units = chunksOf(s, p), al = chunkAlternatives(s, p);
    units.forEach((u, i) => al[i].forEach(alt => {
      const keys = [...p.slice(0, u.i), ...alt, ...p.slice(u.i + u.keys.length)];
      let n = s.start;
      for (const c of keys) n = n.edges.find(e => e[0] === c)[1];
      assert.equal(n.dist, 0, `${y}: ${keys.join('')}`);
      assert.equal(keys.length, s.min);
    }));
  }
});
