// Lookup widget: type kana (or standard romaji with the IME off) and see how to type it with the chosen table.
// Shares the table and style settings with the practice page (same localStorage keys).
import {
  Engine, STD, parseTable, solve, makePlan, chunksOf, chunkAlternatives, stdMin, toHira, romajiToKana, setPlanStyle,
} from './engine.js';
import { showVersion } from './version.js';

const $ = s => document.querySelector(s);
const EL = {};   // looked up once: the widget may move into a picture-in-picture window
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
};
const AZIK_URL = 'tables/azik.tsv';

let eng = STD, mode = 'std', gen = 0;
for (const id of ['lkIn', 'lkClear', 'lkOut', 'lkTable', 'lkStyle', 'lkPip', 'lk']) EL[id] = $('#' + id);

async function loadTable(m) {
  const g = ++gen;
  if (m === 'custom') {
    const raw = LS.get('dojo-table');
    if (!raw) m = 'std';
    else eng = new Engine(parseTable(raw));
  }
  if (m === 'azik') {
    let text = LS.get('dojo-preset-azik');
    if (!text) {
      EL.lkOut.textContent = 'AZIK を読み込み中…';
      try { const r = await fetch(AZIK_URL); if (!r.ok) throw new Error(r.status); text = await r.text(); LS.set('dojo-preset-azik', text); }
      catch (e) { if (g === gen) { EL.lkOut.textContent = 'AZIK のテーブルを読み込めませんでした'; } m = 'std'; }
    }
    if (g !== gen) return;
    if (text) eng = new Engine(parseTable(text));
  }
  if (m === 'std') eng = STD;
  mode = m;
  sync(); render();
}

function sync() {
  const hasCustom = !!LS.get('dojo-table');
  EL.lkTable.querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.v === mode);
    if (b.dataset.v === 'custom') { b.disabled = !hasCustom; b.title = hasCustom ? (LS.get('dojo-table-name') || '') : '練習ページの「ローマ字テーブル」で読み込むと選べます'; }
  });
  const style = LS.get('dojo-plan-style') === 'special' ? 'special' : 'regular';
  setPlanStyle(style);
  EL.lkStyle.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === style));
}

/** One line per word: the guide (keys over kana, other spellings below) and the key count. */
function render() {
  const out = EL.lkOut, raw = EL.lkIn.value;
  EL.lkClear.hidden = !raw;
  out.textContent = '';
  const words = raw.split(/[\s、。,]+/).map(w => w.trim()).filter(Boolean).slice(0, 8);
  if (!words.length) { out.innerHTML = '<div class="lk-empty">ひらがなを入れると打ち方を表示します</div>'; return; }
  for (const w of words) {
    const y = toHira(/[A-Za-z]/.test(w) ? romajiToKana(w) : w).slice(0, 40);
    const row = document.createElement('div'); row.className = 'lk-row';
    const s = solve(eng, y);
    if (s.min === Infinity) {
      row.innerHTML = '<div class="lk-meta ng"></div>';
      row.firstChild.textContent = `${y}：このテーブルでは入力できない文字が含まれています`;
      out.appendChild(row); continue;
    }
    const plan = makePlan(s.start, [], s), units = chunksOf(s, plan), alts = chunkAlternatives(s, plan);
    const g = document.createElement('div'); g.className = 'guide';
    units.forEach((c, i) => {
      const d = document.createElement('span'); d.className = 'ch';
      const k = document.createElement('span'); k.className = 'k'; k.textContent = c.keys;
      const a = document.createElement('span'); a.className = 'a'; a.textContent = c.kana;
      d.append(k, a);
      if (alts[i].length) { const o = document.createElement('span'); o.className = 'alt'; o.textContent = alts[i].join(' '); d.appendChild(o); }
      g.appendChild(d);
    });
    const st = stdMin(y), meta = document.createElement('div'); meta.className = 'lk-meta';
    const keys = document.createElement('code'); keys.textContent = plan.join('');
    meta.append(keys, ` ・ ${s.min}打` + (eng !== STD && st < Infinity && st !== s.min ? `（標準ローマ字なら ${st}打）` : ''));
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'lk-copy'; copy.textContent = 'コピー';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(plan.join('')); copy.textContent = 'コピーしました'; setTimeout(() => { copy.textContent = 'コピー'; }, 1200); } catch (e) { /* clipboard unavailable */ } };
    meta.appendChild(copy);
    row.append(g, meta);
    out.appendChild(row);
  }
}

EL.lkIn.addEventListener('input', render);
EL.lkIn.addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; render(); } });
EL.lkClear.onclick = () => { EL.lkIn.value = ''; render(); EL.lkIn.focus(); };
EL.lkTable.onclick = e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  LS.set('dojo-table-mode', b.dataset.v); loadTable(b.dataset.v);
};
EL.lkStyle.onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  LS.set('dojo-plan-style', b.dataset.v); sync(); render();
};
// settings changed on the practice page (another tab)
window.addEventListener('storage', e => {
  if (e.key === 'dojo-table-mode' || e.key === 'dojo-table') loadTable(LS.get('dojo-table-mode') || 'std');
  else if (e.key === 'dojo-plan-style') { sync(); render(); }
});

/* Always-on-top mini window (Document Picture-in-Picture, Chrome / Edge on desktop) */
if ('documentPictureInPicture' in window) {
  const btn = EL.lkPip, lk = EL.lk, home = lk.parentNode, next = lk.nextSibling;
  btn.hidden = false;
  btn.onclick = async () => {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 180, height: 80 });
    for (const sheet of document.styleSheets) {
      try {
        const st = pip.document.createElement('style');
        st.textContent = [...sheet.cssRules].map(r => r.cssText).join('\n');
        pip.document.head.appendChild(st);
      } catch (e) {   // cross-origin (fonts): link it instead
        if (sheet.href) { const l = pip.document.createElement('link'); l.rel = 'stylesheet'; l.href = sheet.href; pip.document.head.appendChild(l); }
      }
    }
    const t = document.documentElement.dataset.theme; if (t) pip.document.documentElement.dataset.theme = t;
    pip.document.title = '打ち方';
    pip.document.body.className = 'lookup-page lk-pip';
    pip.document.body.appendChild(lk);
    btn.hidden = true;
    EL.lkIn.focus();
    pip.addEventListener('pagehide', () => { home.insertBefore(lk, next); btn.hidden = false; });
  };
}

const q = new URLSearchParams(location.search).get('q');
if (q) EL.lkIn.value = q;
sync();
showVersion($('#appVersion'));
loadTable(LS.get('dojo-table-mode') || (LS.get('dojo-table') ? 'custom' : 'std'));
