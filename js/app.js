// Practice page: UI, game loop, settings. Logic lives in engine.js / keyboard.js.
import {
  Engine, Solver, STD, stdMin, parseTable, parseWords, makePlan, chunksOf, toHalf, toHira,
} from './engine.js';
import { parseKeyboard, legendAt, legendChar, findKey } from './keyboard.js';
import { fetchKeyboard } from './remote.js';

const $ = s => document.querySelector(s);
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
};
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ---------- state ---------- */
const STD_LABEL = 'ローマ字';
let solver = new Solver(STD), tblLabel = STD_LABEL, tblNote = '標準';
// Preset tables. AZIK is not bundled (the source repository has no license),
// so the viewer's browser fetches it from GitHub and keeps a copy for offline use.
const PRESETS = {
  azik: {
    label: 'AZIK',
    url: 'https://raw.githubusercontent.com/toriwasa/azik-roman-table/main/azik_romantable.txt',
    source: 'toriwasa/azik-roman-table',
  },
};
let tableMode = LS.get('dojo-table-mode') || (LS.get('dojo-table') ? 'custom' : 'std');
let BASIC = [];            // words/basic.tsv
let wordsLoaded = false;
let DEF_KB = null;         // { id, name, base, yaml, layout } from keyboards/index.json
let customWords = null;
let view = 'idle', G = null;
const cfg = {
  time: +(LS.get('dojo-time') || 60),
  strict: (LS.get('dojo-strict') ?? '1') === '1',
  words: LS.get('dojo-words') || 'basic',
  skipPlain: LS.get('dojo-skip') === '1',
};
const eng = () => solver.eng;
const sol = y => solver.sol(y);

/* ---------- table ---------- */
function showTblStatus(h) { $('#tblStatus').innerHTML = h; }
function showTblMsg(text) { const m = $('#tblMsg'); m.textContent = text || ''; m.hidden = !text; }
function setTable(entries, label, note = '') {   // entries === null: the built-in standard table
  if (entries !== null && entries.length < 5) {
    showTblStatus('<span class="ng">読み込めませんでした。</span> タブ区切り（入力⇥出力⇥次の入力）の形式か確認してください。');
    return false;
  }
  solver = new Solver(entries === null ? STD : new Engine(entries));
  tblLabel = label; tblNote = note;
  $('#tblName').textContent = label;
  refreshAll();
  return true;
}
let tableGen = 0;
/** Switch between the standard table, a preset (AZIK) and the user's own table. */
async function applyTable(mode) {
  const gen = ++tableGen, prev = tableMode;
  tableMode = mode; syncSeg(); showTblMsg('');
  if (mode === 'std') { setTable(null, STD_LABEL, '標準'); }
  else if (mode === 'custom') {
    const raw = LS.get('dojo-table');
    if (!raw || !setTable(parseTable(raw), LS.get('dojo-table-name') || 'カスタム', 'カスタム')) { tableMode = prev === 'custom' ? 'std' : prev; syncSeg(); return; }
  } else {
    const P = PRESETS[mode], cacheKey = 'dojo-preset-' + mode, cached = LS.get(cacheKey);
    if (cached) setTable(parseTable(cached), P.label, `${P.source}（保存済み）`);   // instant, then refresh
    else showTblStatus(`${P.label} を ${esc(P.source)} から取得中…`);
    try {
      const r = await Promise.race([fetch(P.url, { cache: 'no-cache' }), new Promise((_, ng) => setTimeout(() => ng(new Error('timeout')), 10000))]);
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      if (gen !== tableGen) return;
      LS.set(cacheKey, text);
      if (text !== cached || !cached) setTable(parseTable(text), P.label, `${P.source} から取得`);
      else { tblNote = `${P.source} から取得`; analyseAsync(); }
    } catch (err) {
      if (gen !== tableGen) return;
      if (cached) { tblNote = `${P.source}（取得できなかったため保存済み）`; analyseAsync(); }
      else {
        tableMode = prev === mode ? 'std' : prev; syncSeg();
        if (tableMode === 'std') setTable(null, STD_LABEL, '標準');
        showTblMsg(`${P.label} を取得できませんでした。ネットワークを確認してください。`);
        return;
      }
    }
  }
  if (gen === tableGen) LS.set('dojo-table-mode', tableMode);
}

function pool() {
  const src = (cfg.words === 'custom' && customWords && customWords.length) ? customWords : BASIC;
  return src.filter(o => sol(o.y).min < Infinity && (!cfg.skipPlain || solver.usesExt(o.y)));
}

/* Analyse word lists in small slices so the page never freezes. */
let anaGen = 0;
function analyseAsync() {
  const gen = ++anaGen, list = BASIC.concat(customWords || []);
  const head = `<span class="ok">${esc(tblLabel)}</span>${tblNote ? `（${esc(tblNote)}）` : ''} ・ ${eng().size}項目 ・ `;
  if (!wordsLoaded) { showTblStatus(head + '単語を読み込み中…'); return; }
  let i = 0;
  const step = () => {
    if (gen !== anaGen) return;
    const t0 = performance.now();
    while (i < list.length && performance.now() - t0 < 12) { const y = list[i++].y; if (sol(y).min < Infinity) solver.usesExt(y); }
    if (i < list.length) { showTblStatus(head + `単語を解析中… ${Math.floor(i / list.length * 100)}%`); setTimeout(step, 0); return; }
    const ok = BASIC.filter(o => sol(o.y).min < Infinity).length, ex = BASIC.filter(o => solver.usesExt(o.y)).length;
    showTblStatus(head + `基本語彙 ${ok}/${BASIC.length}語が入力可能（打鍵が減るか記号キーの規則を使う語 ${ex}）`);
    if (customWords) {
      const c = customWords.filter(o => sol(o.y).min < Infinity).length;
      $('#wordsStatus').innerHTML = `<span class="ok">${customWords.length}語</span>（このテーブルで入力可能: ${c}語）`;
    }
  };
  step();
}
function refreshAll() {
  buildKb();
  if (view === 'idle') showSample();
  convRender(); syncSeg();
  analyseAsync();
}

/* ---------- guide ---------- */
function renderGuide(el, s, typed, plan, showNext) {
  const seq = typed.concat(plan), cs = chunksOf(s, seq), n = typed.length;
  el.innerHTML = '';
  for (const c of cs) {
    const d = document.createElement('span'); d.className = 'ch';
    if (showNext && n >= c.i && n < c.i + c.keys.length) d.classList.add('cur');
    const k = document.createElement('span'); k.className = 'k';
    [...c.keys].forEach((ch, j) => {
      const i = document.createElement('i'), g = c.i + j;
      i.textContent = ch === ' ' ? '␣' : ch;
      if (g < n) i.className = 't'; else if (showNext && g === n) i.className = 'n';
      k.appendChild(i);
    });
    const a = document.createElement('span'); a.className = 'a'; a.textContent = c.kana;
    d.append(k, a); el.appendChild(d);
  }
}
function cmpText(y, s) {
  const st = stdMin(y);
  return st < Infinity && st !== s.min ? `このテーブルで ${s.min}打 ・ 標準ローマ字なら ${st}打` : `${s.min}打`;
}
function showSample() {
  const y = 'にゅうじょうけん', s = sol(y);
  $('#wKanji').textContent = '入場券'; $('#wYomi').textContent = y;
  if (s.min < Infinity) { renderGuide($('#guide'), s, [], makePlan(s.start), false); $('#wCmp').textContent = cmpText(y, s); }
  else { $('#guide').textContent = ''; $('#wCmp').textContent = 'このテーブルでは入力できない語です'; }
  setNextKey(null);
}

/* ---------- keyboards ---------- */
const KBS = {
  us: ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
  jis: ['1234567890-^\\', 'qwertyuiop@[', 'asdfghjkl;:]', 'zxcvbnm,./'],
};
let kbLayout = LS.get('dojo-kb') || 'us';
let CK = null, ckBase = 0, ckShown = -1;
const SVGNS = 'http://www.w3.org/2000/svg';
const useCustom = () => kbLayout === 'custom' && CK;

function buildCustom() {
  const kb = $('#kb'); kb.innerHTML = ''; kb.classList.add('custom');
  const G0 = CK.geom.filter(Boolean), pad = 4;
  const minX = Math.min(...G0.map(g => g.x + g.rx)) - pad, minY = Math.min(...G0.map(g => g.y + g.ry)) - pad;
  const maxX = Math.max(...G0.map(g => g.x + g.rx + g.w)) + pad, maxY = Math.max(...G0.map(g => g.y + g.ry + g.h)) + pad;
  const lab = document.createElement('div'); lab.className = 'cklab'; lab.id = 'ckLab'; kb.appendChild(lab);
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`); svg.setAttribute('class', 'cksvg');
  CK.geom.forEach((g, pos) => {
    if (!g) return;
    const e = document.createElementNS(SVGNS, 'g');
    e.setAttribute('transform', `translate(${g.x} ${g.y})${g.rot ? ` rotate(${g.rot})` : ''}`);
    e.setAttribute('class', 'ck'); e.dataset.pos = pos;
    const r = document.createElementNS(SVGNS, 'rect');
    Object.entries({ x: g.rx + 1, y: g.ry + 1, width: g.w - 2, height: g.h - 2, rx: 7 }).forEach(([k, v]) => r.setAttribute(k, v));
    const t = document.createElementNS(SVGNS, 'text'); t.setAttribute('class', 'ckt'); t.setAttribute('y', -2);
    const h = document.createElementNS(SVGNS, 'text'); h.setAttribute('class', 'ckh'); h.setAttribute('y', g.ry + g.h - 8);
    e.append(r, t, h); svg.appendChild(e);
  });
  kb.appendChild(svg); ckShown = -1; showCKLayer(ckBase, null);
}
function showCKLayer(li, holdPos) {
  if (ckShown !== li) {
    document.querySelectorAll('#kb .ck').forEach(e => {
      const L = legendAt(CK, li, +e.dataset.pos, ckBase);
      const [t, h] = e.querySelectorAll('text'); t.textContent = L.t; h.textContent = L.h;
      const ch = legendChar(L.t);
      e.classList.toggle('off', !L.t || (ch != null && !eng().alphaSet.has(ch) && ch !== ' '));
    });
    ckShown = li;
  }
  const lab = $('#ckLab');
  if (lab) {
    const nm = CK.layers[li] ? CK.layers[li].name : '';
    if (li === ckBase) lab.textContent = `${CK.label} ・ レイヤー ${nm}`;
    else {
      const hl = legendAt(CK, ckBase, holdPos, ckBase);
      lab.innerHTML = '';
      const s = document.createElement('b'); s.textContent = `${hl.t === nm || hl.h === nm ? nm : hl.t} を押しながら`;
      lab.append(`${CK.label} ・ レイヤー ${nm} ・ `, s);
    }
  }
  document.querySelectorAll('#kb .ck.hold').forEach(e => e.classList.remove('hold'));
  if (holdPos != null) { const e = document.querySelector(`#kb .ck[data-pos="${holdPos}"]`); if (e) e.classList.add('hold'); }
}
function buildKb() {
  const kb = $('#kb'); kb.innerHTML = ''; kb.classList.remove('custom');
  if (useCustom()) { buildCustom(); return; }
  KBS[kbLayout === 'jis' ? 'jis' : 'us'].forEach(r => {
    const row = document.createElement('div'); row.className = 'kr';
    for (const c of r) {
      const k = document.createElement('div'); k.className = 'key'; k.dataset.k = c; k.textContent = c;
      if (!eng().alphaSet.has(c)) k.classList.add('off');
      if ('fj'.includes(c)) k.classList.add('home');
      row.appendChild(k);
    }
    kb.appendChild(row);
  });
}
function keyEl(c) {
  if (c == null) return null;
  if (useCustom()) { const f = findKey(CK, ckBase, c); return f ? document.querySelector(`#kb .ck[data-pos="${f.pos}"]`) : null; }
  return document.querySelector(`.key[data-k="${CSS.escape(c)}"]`);
}
function setNextKey(c) {
  document.querySelectorAll('#kb .next').forEach(k => k.classList.remove('next'));
  if (useCustom()) {
    const f = c == null ? null : findKey(CK, ckBase, c);
    if (!f) { showCKLayer(ckBase, null); return; }
    showCKLayer(f.layer, f.hold);
    const e = document.querySelector(`#kb .ck[data-pos="${f.pos}"]`); if (e) e.classList.add('next');
    return;
  }
  const k = keyEl(c); if (k) k.classList.add('next');
}

/* ---------- game ---------- */
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function start() {
  const p = pool();
  if (!p.length) {
    $('#wCmp').textContent = cfg.skipPlain
      ? 'このテーブルでは、打鍵が減る語も記号キーの規則を使う語もありません。「対象: すべて」にするか、テーブルを読み込んでください。'
      : '出題できる単語がありません。テーブルか単語リストを確認してください。';
    return;
  }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  G = {
    words: shuffle(p.slice()), idx: -1, endAt: performance.now() + cfg.time * 1000, typed: [], plan: [], node: null, s: null, prev: null,
    st: { keys: 0, miss: 0, words: 0, mine: 0, std: 0, missKey: {}, missed: [] }, curMiss: false,
  };
  view = 'game';
  $('#idlePanel').hidden = true; $('#viewResult').hidden = true; $('#viewPlay').hidden = false;
  $('#gameBar').hidden = false; $('#timebarWrap').hidden = false; $('#wCount').innerHTML = '0<span>単語</span>';
  nextWord(); requestAnimationFrame(tick);
}
function nextWord() {
  G.idx++;
  if (G.idx >= G.words.length) { shuffle(G.words); G.idx = 0; }
  const w = G.words[G.idx];
  G.w = w; G.s = sol(w.y); G.node = G.s.start; G.typed = []; G.plan = makePlan(G.node); G.curMiss = false;
  $('#wKanji').textContent = w.w; $('#wYomi').textContent = w.y; $('#wCmp').textContent = cmpText(w.y, G.s);
  $('#missInfo').hidden = true;
  draw();
}
function draw() { renderGuide($('#guide'), G.s, G.typed, G.plan, true); setNextKey(G.plan[0]); }
function tick(now) {
  if (view !== 'game') return;
  const left = Math.max(0, (G.endAt - now) / 1000);
  $('#tLeft').innerHTML = Math.ceil(left) + '<span>秒</span>';
  $('#timebar').style.width = (left / cfg.time * 100) + '%';
  if (left <= 0) { finish(); return; }
  requestAnimationFrame(tick);
}
let flashT;
function flash(c) {
  const st = $('#stage'); st.classList.add('flash');
  const k = keyEl(c); if (k) k.classList.add('bad');
  clearTimeout(flashT);
  flashT = setTimeout(() => { st.classList.remove('flash'); document.querySelectorAll('#kb .bad').forEach(x => x.classList.remove('bad')); }, 140);
}
function showMiss(c, code, n, e) {
  const exp = G.plan[0], vis = x => x === ' ' ? '␣' : x;
  let why;
  if (!e) why = 'このキーはテーブルでこの位置から使えません';
  else if (e[1].dist === Infinity) why = 'この先が読みと合わなくなります';
  else why = `有効だが最短ではありません（残り${e[1].dist + 1}打 > ${n.dist}打）`;
  const m = $('#missInfo');
  m.textContent = `届いたキー「${vis(c)}」(${code}) ／ 次のキー「${vis(exp || '')}」 ・ ${why}`;
  m.hidden = false;
}
function onType(c, code = '') {
  // A word can end with keys still pending (e.g. `n`); the next word may start by completing them.
  if (G.prev) { const p = G.prev; G.prev = null; const [o, nb] = eng().feed(p.b, c); if (nb === '' && o === p.rest) return; }
  const n = G.node, e = n.edges.find(x => x[0] === c);
  const ok = e && (cfg.strict ? e[1].dist === n.dist - 1 : e[1].dist < Infinity);
  if (!ok) {
    showMiss(c, code, n, e);
    G.st.miss++;
    const exp = G.plan[0]; if (exp) G.st.missKey[exp] = (G.st.missKey[exp] || 0) + 1;
    G.curMiss = true; flash(c); return;
  }
  $('#missInfo').hidden = true;
  G.st.keys++; G.typed.push(c); G.node = e[1];
  G.plan = (c === G.plan[0]) ? G.plan.slice(1) : makePlan(G.node);
  if (G.node.goal) {
    G.st.words++; G.st.mine += G.s.min;
    const sm = stdMin(G.w.y); G.st.std += sm < Infinity ? sm : G.s.min;
    if (G.curMiss) G.st.missed.push({ w: G.w.w, g: makePlan(G.s.start).join('') });
    if (G.node.b !== '') G.prev = { b: G.node.b, rest: G.s.target.slice(G.node.p) };
    $('#wCount').innerHTML = G.st.words + '<span>単語</span>';
    nextWord();
  } else draw();
}
function finish() {
  view = 'result';
  const s = G.st, T = cfg.time, acc = s.keys + s.miss ? s.keys / (s.keys + s.miss) * 100 : 0;
  $('#viewPlay').hidden = true; $('#gameBar').hidden = true; $('#timebarWrap').hidden = true; setNextKey(null);
  const best = +(LS.get('dojo-best-' + T) || 0), isBest = s.keys > best;
  if (isBest) LS.set('dojo-best-' + T, String(s.keys));
  const weak = Object.entries(s.missKey).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const r = $('#viewResult'); r.innerHTML = '';
  const stats = document.createElement('div'); stats.className = 'stats';
  [[s.words, '単語'], [s.keys, '正しい打鍵' + (isBest ? '（自己ベスト）' : '')], [s.miss, 'ミス'], [acc.toFixed(1) + '%', '正確率'], [(s.keys / T).toFixed(2), '打鍵 / 秒']]
    .forEach(([v, l]) => {
      const d = document.createElement('div'); d.className = 'stat';
      d.innerHTML = '<div class="v"></div><div class="l"></div>';
      d.firstChild.textContent = v; d.lastChild.textContent = l; stats.appendChild(d);
    });
  r.appendChild(stats);
  if (s.words && s.std > s.mine) {
    const p = document.createElement('p'); p.className = 'saving';
    p.innerHTML = `完了した${s.words}語は標準ローマ字なら <b>${s.std}</b> 打、このテーブルでは <b>${s.mine}</b> 打（${((1 - s.mine / s.std) * 100).toFixed(0)}% 削減）`;
    r.appendChild(p);
  }
  if (weak.length) {
    const d = document.createElement('div'); d.innerHTML = '<p class="sub">ミスしたときに打つべきだったキー</p><div class="tags"></div>';
    weak.forEach(([k, n]) => {
      const t = document.createElement('span'); t.className = 'tag'; t.textContent = k === ' ' ? '␣' : k;
      const em = document.createElement('em'); em.textContent = '×' + n; t.appendChild(em); d.lastChild.appendChild(t);
    });
    r.appendChild(d);
  }
  if (s.missed.length) {
    const d = document.createElement('div'); d.innerHTML = '<p class="sub">ミスのあった単語</p><div class="missed"></div>';
    s.missed.slice(0, 10).forEach(m => {
      const row = document.createElement('div'), a = document.createElement('span'), c = document.createElement('code');
      a.textContent = m.w; c.textContent = m.g; row.append(a, c); d.lastChild.appendChild(row);
    });
    r.appendChild(d);
  }
  r.hidden = false; r.style.display = 'grid'; r.style.gap = '18px';
  $('#idlePanel').hidden = false; $('#startBtn').textContent = 'もう一度';
}
function abort() {
  view = 'idle';
  $('#gameBar').hidden = true; $('#timebarWrap').hidden = true; $('#viewResult').hidden = true;
  $('#viewPlay').hidden = false; $('#idlePanel').hidden = false; $('#startBtn').textContent = '練習を始める';
  showSample();
}

document.addEventListener('keydown', e => {
  const inField = e.target.closest && e.target.closest('input,textarea,select');
  if (view !== 'game') {
    if (!inField && (e.key === ' ' || e.key === 'Enter') && !(e.target.closest && e.target.closest('button,label,a'))) { e.preventDefault(); start(); }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); abort(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Process' || e.isComposing || e.keyCode === 229) { $('#imeWarn').hidden = false; e.preventDefault(); return; }
  if (e.key.length !== 1) return;
  e.preventDefault(); $('#imeWarn').hidden = true;
  // A JIS keyboard sends ':' from the Quote key etc.; switch the drawing once, unless chosen by hand.
  if (!LS.get('dojo-kb-manual') && kbLayout === 'us' &&
      ((e.code === 'Quote' && e.key === ':') || (e.code === 'BracketLeft' && e.key === '@') || (e.code === 'Equal' && e.key === '^'))) {
    kbLayout = 'jis'; LS.set('dojo-kb', 'jis'); buildKb(); syncSeg();
  }
  let c = toHalf(e.key);
  if (!eng().alphaSet.has(c) && eng().alphaSet.has(c.toLowerCase())) c = c.toLowerCase();
  onType(c, e.code);
});

/* ---------- controls ---------- */
function syncSeg() {
  document.querySelectorAll('#segTime button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === cfg.time));
  if (document.activeElement !== $('#timeIn')) $('#timeIn').value = cfg.time;
  document.querySelectorAll('#segKb button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === kbLayout));
  const hasT = !!LS.get('dojo-table');
  $('#btnCustomTable').disabled = !hasT;
  $('#btnCustomTable').title = hasT ? (LS.get('dojo-table-name') || '') : '下の「ローマ字テーブル」でファイルを読み込むと選べます';
  $('#clearTable').hidden = !hasT;
  document.querySelectorAll('#segTable button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === tableMode));
  document.querySelectorAll('#segStrict button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === '1') === cfg.strict));
  const hasC = !!(customWords && customWords.length);
  $('#btnCustomWords').disabled = !hasC;
  if (!hasC && cfg.words === 'custom') cfg.words = 'basic';
  document.querySelectorAll('#segWords button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === cfg.words));
  document.querySelectorAll('#segSkip button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === '1') === cfg.skipPlain));
}
const seg = (id, fn) => { $(id).onclick = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; fn(b.dataset.v); syncSeg(); }; };
seg('#segTime', v => { cfg.time = +v; LS.set('dojo-time', cfg.time); });
seg('#segTable', v => { if (v !== tableMode) applyTable(v); });
seg('#segStrict', v => { cfg.strict = v === '1'; LS.set('dojo-strict', v); });
seg('#segSkip', v => { cfg.skipPlain = v === '1'; LS.set('dojo-skip', v); });
seg('#segWords', v => { cfg.words = v; LS.set('dojo-words', v); });
seg('#segKb', v => { kbLayout = v; LS.set('dojo-kb', v); LS.set('dojo-kb-manual', '1'); buildKb(); if (view === 'game') setNextKey(G.plan[0]); });
$('#timeIn').addEventListener('change', e => {
  let v = Math.round(+e.target.value);
  if (!(v > 0)) { syncSeg(); return; }
  v = Math.min(3600, Math.max(5, v)); cfg.time = v; LS.set('dojo-time', v); e.target.value = v; syncSeg();
});
$('#timeIn').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('#startBtn').onclick = () => start();

function readFile(f) {
  return new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ng; r.readAsText(f, 'utf-8'); });
}
function dropify(el, fn) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer.files.length) fn(e.dataTransfer.files); });
}

/* table file */
async function loadTableFile(files) {
  const f = files[0], t = await readFile(f);
  if (parseTable(t).length < 5) { showTblMsg(`${f.name} を読み込めませんでした。タブ区切り（入力⇥出力⇥次の入力）の形式か確認してください。`); return; }
  LS.set('dojo-table', t); LS.set('dojo-table-name', f.name);
  applyTable('custom');
}
$('#fileTable').onchange = e => { if (e.target.files.length) loadTableFile(e.target.files); e.target.value = ''; };
dropify($('#drop'), loadTableFile);
$('#clearTable').onclick = () => {
  LS.del('dojo-table'); LS.del('dojo-table-name');
  if (tableMode === 'custom') applyTable('std'); else syncSeg();
};

/* word list file */
async function loadWordsFile(files) {
  const t = await readFile(files[0]), w = parseWords(t);
  if (!w.length) { $('#wordsStatus').innerHTML = '<span class="ng">単語が見つかりませんでした</span>'; return; }
  customWords = w; LS.set('dojo-words-list', t);
  cfg.words = 'custom'; LS.set('dojo-words', 'custom');
  $('#clearWords').hidden = false; refreshAll();
}
$('#fileWords').onchange = e => { if (e.target.files.length) loadWordsFile(e.target.files); e.target.value = ''; };
dropify($('#dropWords'), loadWordsFile);
$('#clearWords').onclick = () => {
  customWords = null; LS.del('dojo-words-list');
  $('#wordsStatus').textContent = '未登録'; $('#clearWords').hidden = true; cfg.words = 'basic'; refreshAll();
};

/* converter */
function convRender() {
  const out = $('#convOut'), y = toHira($('#convIn').value);
  out.innerHTML = '';
  if (!y) { out.innerHTML = '<div class="cmp">ひらがなを入れると最短の打ち方を表示します</div>'; return; }
  const s = sol(y);
  if (s.min === Infinity) { out.innerHTML = '<div class="cmp ng">このテーブルでは入力できない文字が含まれています</div>'; return; }
  const g = document.createElement('div'); g.className = 'guide'; renderGuide(g, s, [], makePlan(s.start), false);
  const c = document.createElement('div'); c.className = 'cmp'; c.textContent = cmpText(y, s);
  out.append(g, c);
}
$('#convIn').addEventListener('input', convRender);

/* custom keyboard: files, web, default */
function ckStatus(h) { $('#ckStatus').innerHTML = h; }
function ckError(msg) { ckStatus('<span class="ng"></span>'); $('#ckStatus .ng').textContent = msg; }
// save: 'file' | 'url' | false (default keyboard, nothing to keep)
function setCK(yamlText, layoutText, label, save, note = '') {
  try { CK = parseKeyboard(window.jsyaml, yamlText, layoutText, label); }
  catch (err) { ckError(err.message); return false; }
  const names = CK.layers.map(l => l.name);
  let b = +(LS.get('dojo-ck-base-' + label) ?? NaN);
  if (!(b >= 0 && b < names.length)) {
    b = DEF_KB && label === DEF_KB.name ? names.indexOf(DEF_KB.base) : -1;
    if (b < 0) b = names.findIndex(n => /^JA/i.test(n));
    if (b < 0) b = 0;
  }
  ckBase = b;
  const sel = $('#ckBaseSel'); sel.innerHTML = '';
  names.forEach((n, i) => { const o = document.createElement('option'); o.value = i; o.textContent = n; sel.appendChild(o); });
  sel.value = b;
  ckStatus('');
  const ok = document.createElement('span'); ok.className = 'ok'; ok.textContent = label;
  $('#ckStatus').append(ok, ` ・ ${CK.geom.filter(Boolean).length}キー ・ ${names.length}レイヤー` + (note ? ` ・ ${note}` : ''));
  if (save) { LS.set('dojo-ck-yaml', yamlText); LS.set('dojo-ck-svg', layoutText); LS.set('dojo-ck-name', label); }
  if (save === 'file') { LS.del('dojo-ck-url'); LS.del('dojo-ck-url-layout'); }
  $('#resetCK').hidden = !save;
  return true;
}
function afterCK() { if (kbLayout === 'custom') { buildKb(); if (view === 'game') setNextKey(G.plan[0]); } }
function useCustomLayout() { kbLayout = 'custom'; LS.set('dojo-kb', 'custom'); LS.set('dojo-kb-manual', '1'); syncSeg(); buildKb(); }
$('#ckBaseSel').onchange = e => { ckBase = +e.target.value; if (CK) LS.set('dojo-ck-base-' + CK.label, String(ckBase)); afterCK(); };

async function loadCKFiles(files) {
  ckUser++;
  const fs = [...files];
  const fy = fs.find(f => /\.ya?ml$/i.test(f.name));
  const fv = fs.find(f => /\.(dtsi|dts|overlay)$/i.test(f.name)) || fs.find(f => /\.svg$/i.test(f.name));
  if (!fy && fv && DEF_KB && LS.get('dojo-ck-yaml') == null) {
    // Layout only: keep the default keyboard's legends, swap its geometry.
    const st = await readFile(fv);
    if (setCK(DEF_KB.yaml, st, DEF_KB.name, false, `配置: ${fv.name}`)) { LS.set('dojo-ck-geo', st); $('#resetCK').hidden = false; afterCK(); }
    return;
  }
  if (!fy || !fv) { ckError('YAML と、dtsi か SVG を同時に選んでください'); return; }
  const yt = await readFile(fy), st = await readFile(fv);
  if (setCK(yt, st, fy.name.replace(/\.ya?ml$/i, ''), 'file')) useCustomLayout();
}
$('#fileCK').onchange = e => { loadCKFiles(e.target.files); e.target.value = ''; };
dropify($('#dropCK'), loadCKFiles);

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, ng) => setTimeout(() => ng(new Error('タイムアウトしました')), ms))]);
const fetched = () => `${new Date().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 取得`;

/** Fetch a keyboard from GitHub / a URL and remember the address so it is re-fetched on every visit. */
async function loadRemote(spec, layoutUrl = '') {
  ckStatus('取得中…');
  const kb = await withTimeout(fetchKeyboard(spec, { yaml: window.jsyaml, layoutUrl }), 15000);
  if (!setCK(kb.yamlText, kb.layoutText, kb.name, 'url', `${kb.source} から${fetched()}`)) return false;
  LS.set('dojo-ck-url', spec); LS.set('dojo-ck-url-layout', layoutUrl);
  return true;
}
let ckUser = 0;   // bumped on every user action, so a slow boot-time load never overwrites it
$('#ckUrlForm').addEventListener('submit', async e => {
  e.preventDefault(); ckUser++;
  const spec = $('#ckUrl').value.trim(), lu = $('#ckLayoutUrl').value.trim();
  const btn = $('#ckUrlBtn'); btn.disabled = true;
  try { if (await loadRemote(spec, lu)) useCustomLayout(); }
  catch (err) { ckError(err.message); }
  finally { btn.disabled = false; }
});

async function loadDefaultCK() {
  if (!DEF_KB) return false;
  const g = LS.get('dojo-ck-geo');
  if (g && setCK(DEF_KB.yaml, g, DEF_KB.name, false, '配置を差し替え中')) { $('#resetCK').hidden = false; return true; }
  return setCK(DEF_KB.yaml, DEF_KB.layout, DEF_KB.name, false, DEF_KB.note);
}
$('#resetCK').onclick = async () => {
  ckUser++;
  ['dojo-ck-yaml', 'dojo-ck-svg', 'dojo-ck-name', 'dojo-ck-geo', 'dojo-ck-url', 'dojo-ck-url-layout'].forEach(k => LS.del(k));
  $('#ckUrl').value = ''; $('#ckLayoutUrl').value = '';
  if (!DEF_KB) {
    ckStatus('既定のキーボードを取得中…');
    try { DEF_KB = await loadDefaultKeyboard(); } catch (err) { ckError('既定のキーボードを読み込めませんでした'); return; }
  }
  await loadDefaultCK(); $('#resetCK').hidden = true; afterCK();
};

/* ---------- boot ---------- */
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}
/** Default keyboard: latest from its GitHub repository, else the copy bundled in keyboards/. */
async function loadDefaultKeyboard() {
  const idx = JSON.parse(await fetchText('keyboards/index.json'));
  const k = idx.keyboards.find(x => x.id === idx.default) || idx.keyboards[0];
  if (!k) return null;
  if (k.repo) {
    try {
      const kb = await withTimeout(fetchKeyboard(k.repo, { yaml: window.jsyaml }), 8000);
      return { ...k, yaml: kb.yamlText, layout: kb.layoutText, note: `${kb.source} から${fetched()}` };
    } catch (err) { /* offline or not found: use the bundled copy */ }
  }
  const [yaml, layout] = await Promise.all([fetchText(k.yaml), fetchText(k.layout)]);
  return { ...k, yaml, layout, note: '同梱データ' };
}
function bootError(err) {
  const d = document.createElement('div'); d.className = 'boot-error';
  d.innerHTML = '単語リストを読み込めませんでした。ファイルを直接開いている場合は、フォルダで <code>python3 -m http.server</code> を実行して <code>http://localhost:8000/</code> から開いてください。';
  const c = document.createElement('div'); c.textContent = String(err && err.message || err); c.style.marginTop = '6px';
  d.appendChild(c);
  document.body.prepend(d);
}

async function boot() {
  applyTable(tableMode);
  const sw = LS.get('dojo-words-list');
  if (sw) { customWords = parseWords(sw); $('#clearWords').hidden = false; }
  refreshAll();   // usable right away with the sample word

  try { BASIC = parseWords(await fetchText('words/basic.tsv')); }
  catch (err) { bootError(err); }
  wordsLoaded = true;
  refreshAll();

  const gen = ckUser;
  const url = LS.get('dojo-ck-url'), urlLayout = LS.get('dojo-ck-url-layout') || '';
  const yy = LS.get('dojo-ck-yaml'), ss = LS.get('dojo-ck-svg');
  if (url) {
    $('#ckUrl').value = url; $('#ckLayoutUrl').value = urlLayout;
    let ok = false;
    try { ok = await loadRemote(url, urlLayout); } catch (err) { /* fall back below */ }
    if (!ok && yy && ss) ok = setCK(yy, ss, LS.get('dojo-ck-name') || '自作', 'url', '取得できなかったため前回の取得分');
    if (ok) { afterCK(); return; }
  } else if (yy && ss && setCK(yy, ss, LS.get('dojo-ck-name') || '自作', 'file', 'ファイルから読み込み')) { afterCK(); return; }

  ckStatus('既定のキーボードを取得中…');
  let def = null;
  try { def = await loadDefaultKeyboard(); }
  catch (err) { if (gen === ckUser) ckError('既定のキーボードを読み込めませんでした'); }
  if (!DEF_KB) DEF_KB = def;
  if (gen !== ckUser) return;   // the user loaded something meanwhile
  await loadDefaultCK();
  afterCK();
}
boot();
