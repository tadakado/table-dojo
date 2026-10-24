import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Engine, Solver, STD, stdEntries, parseTable, parseWords, solve, makePlan, chunksOf, stdMin, toHalf, toHira,
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
