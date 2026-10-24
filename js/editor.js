// ZMK physical layout editor (key_physical_attrs). Values are kept in dtsi units: 1u = 100, rotation in degrees.
import { fetchKeyboard } from './remote.js';
const $=s=>document.querySelector(s),NS='http://www.w3.org/2000/svg';
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

/* ---------- model: values in dtsi units (1u = 100), r in degrees ---------- */
let keys=[],sel=new Set(),pivot=null,legends=[],layerNames=[],yamlLayers=null,layoutMeta={name:'physical_layout0'};
const hist=[],fut=[];
const clone=a=>a.map(k=>({...k}));
function commit(){hist.push(JSON.stringify(keys));if(hist.length>300)hist.shift();fut.length=0;save();renderOut();syncHist();}
function syncHist(){$('#bUndo').disabled=hist.length<2;$('#bRedo').disabled=!fut.length;}
function undo(){if(hist.length<2)return;fut.push(hist.pop());keys=JSON.parse(hist[hist.length-1]);after();}
function redo(){if(!fut.length)return;const s=fut.pop();hist.push(s);keys=JSON.parse(s);after();}
function after(){sel=new Set([...sel].filter(i=>i<keys.length));save();render();renderOut();syncHist();}
function save(){LS.set('ple-keys',JSON.stringify(keys));}

function defaultKeys(){const a=[];for(let r=0;r<4;r++)for(let c=0;c<12;c++)a.push({w:100,h:100,x:c*100,y:r*100,r:0,rx:0,ry:0});return a;}

/* ---------- dtsi parse / emit ---------- */
function parseDts(text){
  const m=[...text.matchAll(/&key_physical_attrs\s+([^>]+)>/g)];
  if(!m.length)throw new Error('key_physical_attrs が見つかりません');
  const ks=m.map(x=>{const v=x[1].trim().split(/\s+/).map(t=>parseInt(t.replace(/[()]/g,''),10));
    if(v.length<7||v.some(n=>Number.isNaN(n)))throw new Error('値を読めない行があります: '+x[0].slice(0,60));
    return {w:v[0],h:v[1],x:v[2],y:v[3],r:v[4]/100,rx:v[5],ry:v[6]};});
  const col=/columns\s*=\s*<\s*(\d+)\s*>/.exec(text);if(col)$('#mCols').value=col[1];
  return ks;
}
function fmt(n){n=Math.round(n);return n<0?`(${n})`:String(n);}
function emit(){
  const rows=keys.map(k=>{const r=Math.round(k.r*100);const on=r!==0;
    return [k.w,k.h,k.x,k.y,r,on?k.rx:0,on?k.ry:0].map(fmt);});
  const wd=[0,1,2,3,4,5,6].map(i=>Math.max(...rows.map(r=>r[i].length),i<2?3:4));
  const head='        keys  //                    '+['w','h','x','y','rot','rx','ry'].map((t,i)=>t.padStart(wd[i]+(i?1:0))).join('');
  const lines=rows.map((r,i)=>`            ${i?',':'='} <&key_physical_attrs ${r.map((v,j)=>v.padStart(wd[j])).join(' ')}>`);
  return head+'\n'+lines.join('\n')+'\n            ;';
}
function renderOut(){$('#out').value=emit();}

/* ---------- geometry ---------- */
const rad=d=>d*Math.PI/180;
function rot(p,deg,c){const a=rad(deg),s=Math.sin(a),co=Math.cos(a),dx=p.x-c.x,dy=p.y-c.y;return{x:c.x+dx*co-dy*s,y:c.y+dx*s+dy*co};}
function corners(k){const c=k.r?{x:k.rx,y:k.ry}:null;return [[0,0],[1,0],[1,1],[0,1]].map(([a,b])=>{const p={x:k.x+a*k.w,y:k.y+b*k.h};return c?rot(p,k.r,c):p;});}
function center(k){const p={x:k.x+k.w/2,y:k.y+k.h/2};return k.r?rot(p,k.r,{x:k.rx,y:k.ry}):p;}
function bbox(idx){const pts=idx.flatMap(i=>corners(keys[i]));if(!pts.length)return null;
  return{x0:Math.min(...pts.map(p=>p.x)),y0:Math.min(...pts.map(p=>p.y)),x1:Math.max(...pts.map(p=>p.x)),y1:Math.max(...pts.map(p=>p.y))};}
function selCenter(){const b=bbox([...sel]);return b?{x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2}:null;}
/* rigid rotation of key k by d degrees about P (ZMK form: rect at x,y rotated by r about rx,ry) */
function rotateKey(k,d,P){
  if(!k.r){k.r=d;k.rx=P.x;k.ry=P.y;}
  else{const Q={x:k.rx,y:k.ry},Q2=rot(Q,d,P);k.x+=Q2.x-Q.x;k.y+=Q2.y-Q.y;k.rx=Q2.x;k.ry=Q2.y;k.r+=d;}
  k.r=Math.round(k.r*100)/100;if(Math.abs(k.r)<1e-9)k.r=0;
}
function moveKey(k,dx,dy){k.x+=dx;k.y+=dy;if(k.r){k.rx+=dx;k.ry+=dy;}}

/* ---------- legends ---------- */
function loadYaml(text){
  if(!window.jsyaml)return;
  const y=jsyaml.load(text);if(!y||!y.layers)throw new Error('YAML に layers がありません');
  const norm=v=>v==null?{t:'',h:''}:typeof v!=='object'?{t:String(v),h:''}:{t:v.t==null?'':String(v.t),h:v.h==null?'':String(v.h),tr:v.type==='trans'};
  yamlLayers=Object.entries(y.layers).map(([n,rows])=>({n,k:(Array.isArray(rows)?rows:[]).flat(2).map(norm)}));
  layerNames=yamlLayers.map(l=>l.n);
  const s=$('#selLayer');s.innerHTML='';layerNames.forEach((n,i)=>{const o=document.createElement('option');o.value=i;o.textContent=n;s.appendChild(o);});
  const saved=+(LS.get('ple-layer')??NaN);s.value=saved>=0&&saved<layerNames.length?saved:Math.max(0,layerNames.findIndex(n=>/^JA/i.test(n)));
  setLegends();
}
function setLegends(){
  if(!yamlLayers){legends=[];return;}
  const li=+$('#selLayer').value||0,L=yamlLayers[li],B=yamlLayers[0];
  legends=keys.map((_,i)=>{let e=L.k[i]||{t:'',h:''};if(e.tr)e=B.k[i]||{t:'',h:''};return e;});
}

/* ---------- view ---------- */
const svg=$('#svg');let VB={x:-100,y:-100,w:1400,h:700};
function setVB(){svg.setAttribute('viewBox',`${VB.x} ${VB.y} ${VB.w} ${VB.h}`);drawGrid();}
function fit(){
  const b=bbox(keys.map((_,i)=>i))||{x0:0,y0:0,x1:1200,y1:400};
  const r=svg.getBoundingClientRect(),asp=r.width/Math.max(1,r.height)||2;
  let w=b.x1-b.x0+160,h=b.y1-b.y0+160;if(w/h<asp)w=h*asp;else h=w/asp;
  VB={x:(b.x0+b.x1)/2-w/2,y:(b.y0+b.y1)/2-h/2,w,h};setVB();
}
function drawGrid(){
  const g=$('#gGrid');g.innerHTML='';const step=+$('#selSnap').value>=25?+$('#selSnap').value:25;
  const x0=Math.floor(VB.x/step)*step,y0=Math.floor(VB.y/step)*step;let n=0;
  for(let x=x0;x<=VB.x+VB.w&&n<400;x+=step,n++){const l=document.createElementNS(NS,'line');l.setAttribute('x1',x);l.setAttribute('x2',x);l.setAttribute('y1',VB.y);l.setAttribute('y2',VB.y+VB.h);l.setAttribute('class',x%100===0?'gridmajor':'gridline');g.appendChild(l);}
  for(let y=y0;y<=VB.y+VB.h&&n<800;y+=step,n++){const l=document.createElementNS(NS,'line');l.setAttribute('y1',y);l.setAttribute('y2',y);l.setAttribute('x1',VB.x);l.setAttribute('x2',VB.x+VB.w);l.setAttribute('class',y%100===0?'gridmajor':'gridline');g.appendChild(l);}
  drawAxis();
}
function drawAxis(){const a=+$('#mAxis').value*100,l=$('#axis');l.setAttribute('x1',a);l.setAttribute('x2',a);l.setAttribute('y1',VB.y);l.setAttribute('y2',VB.y+VB.h);}
function render(){
  const g=$('#gKeys');g.innerHTML='';
  keys.forEach((k,i)=>{
    const e=document.createElementNS(NS,'g');e.dataset.i=i;
    const lg=legends[i];const none=yamlLayers&&lg&&!lg.t&&!lg.h;
    e.setAttribute('class','k'+(sel.has(i)?' sel':'')+(none?' none':''));
    if(k.r)e.setAttribute('transform',`rotate(${k.r} ${k.rx} ${k.ry})`);
    const r=document.createElementNS(NS,'rect');Object.entries({x:k.x+3,y:k.y+3,width:k.w-6,height:k.h-6,rx:10}).forEach(([a,v])=>r.setAttribute(a,v));
    const p=document.createElementNS(NS,'text');p.setAttribute('class','pos');p.setAttribute('x',k.x+11);p.setAttribute('y',k.y+22);p.textContent=i;
    const t=document.createElementNS(NS,'text');t.setAttribute('class','lg');t.setAttribute('x',k.x+k.w/2);t.setAttribute('y',k.y+k.h/2+2);t.textContent=lg?lg.t:'';
    const h=document.createElementNS(NS,'text');h.setAttribute('class','hl');h.setAttribute('x',k.x+k.w/2);h.setAttribute('y',k.y+k.h-12);h.textContent=lg?lg.h:'';
    e.append(r,p,t,h);g.appendChild(e);
  });
  drawPivot();renderProps();
}
function drawPivot(){
  const P=pivot||selCenter(),g=$('#pivot');
  if(!P||!sel.size){g.setAttribute('visibility','hidden');return;}
  g.setAttribute('visibility','visible');
  g.querySelector('circle').setAttribute('cx',P.x);g.querySelector('circle').setAttribute('cy',P.y);
  const h=$('#pvh'),v=$('#pvv');h.setAttribute('x1',P.x-22);h.setAttribute('x2',P.x+22);h.setAttribute('y1',P.y);h.setAttribute('y2',P.y);
  v.setAttribute('y1',P.y-22);v.setAttribute('y2',P.y+22);v.setAttribute('x1',P.x);v.setAttribute('x2',P.x);
}
const U=n=>Math.round(n)/100;
function renderProps(){
  const ids=['px','py','pw','ph','pr','prx','pry'],ins=ids.map(i=>$('#'+i));
  if(document.activeElement&&ins.includes(document.activeElement))return;
  const s=[...sel];
  if(!s.length){$('#selTitle').textContent=`選択なし ・ ${keys.length}キー`;ins.forEach(i=>{i.value='';i.disabled=true;});return;}
  if(s.length===1){const k=keys[s[0]];$('#selTitle').textContent=`keypos ${s[0]}`+(legends[s[0]]&&legends[s[0]].t?` ・ ${legends[s[0]].t}`:'');
    [U(k.x),U(k.y),U(k.w),U(k.h),k.r,k.r?U(k.rx):'',k.r?U(k.ry):''].forEach((v,j)=>{ins[j].value=v;ins[j].disabled=false;});
    if(!k.r){ins[5].disabled=true;ins[6].disabled=true;}return;}
  const b=bbox(s);$('#selTitle').textContent=`${s.length}キーを選択`;
  const rs=new Set(s.map(i=>keys[i].r));
  [U(b.x0),U(b.y0),'','',rs.size===1?keys[s[0]].r:'','',''].forEach((v,j)=>{ins[j].value=v;ins[j].disabled=j>=2&&j!==4;});
}
function hud(t){$('#hud').textContent=t;}

/* ---------- property edits ---------- */
function onProp(id){
  const s=[...sel];if(!s.length)return;const v=parseFloat($('#'+id).value);if(Number.isNaN(v))return;
  if(s.length===1){const k=keys[s[0]];
    if(id==='px')moveKey(k,v*100-k.x,0);else if(id==='py')moveKey(k,0,v*100-k.y);
    else if(id==='pw')k.w=Math.max(25,v*100);else if(id==='ph')k.h=Math.max(25,v*100);
    else if(id==='pr'){if(!k.r&&v){const c=center(k);k.rx=c.x;k.ry=c.y;}k.r=v;}
    else if(id==='prx'){if(k.r)k.rx=v*100;}else if(id==='pry'){if(k.r)k.ry=v*100;}
  }else{const b=bbox(s);
    if(id==='px')s.forEach(i=>moveKey(keys[i],v*100-b.x0,0));
    else if(id==='py')s.forEach(i=>moveKey(keys[i],0,v*100-b.y0));
    else if(id==='pr'){const P=pivot||selCenter(),cur=keys[s[0]].r;s.forEach(i=>rotateKey(keys[i],v-cur,P));}
  }
  commit();render();
}
['px','py','pw','ph','pr','prx','pry'].forEach(id=>$('#'+id).addEventListener('change',()=>onProp(id)));

/* ---------- pointer interaction ---------- */
function pt(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
const snapStep=()=>+$('#selSnap').value;
let drag=null;
svg.addEventListener('pointerdown',e=>{
  const P=pt(e);svg.setPointerCapture(e.pointerId);
  if(e.target.closest('#pivot')){drag={mode:'pivot'};return;}
  const kg=e.target.closest('.k');
  if(kg){const i=+kg.dataset.i;
    if(e.shiftKey){sel.has(i)?sel.delete(i):sel.add(i);render();drag=null;return;}
    if(!sel.has(i)){sel=new Set([i]);pivot=null;}
    drag={mode:'move',start:P,orig:new Map([...sel].map(j=>[j,{...keys[j]}])),pv:pivot&&{...pivot},moved:false,anchor:{...keys[i]}};render();return;}
  drag={mode:'band',start:P,add:e.shiftKey,base:new Set(sel)};
  if(!e.shiftKey){sel.clear();pivot=null;render();}
});
svg.addEventListener('pointermove',e=>{
  const P=pt(e);hud(`x ${U(P.x).toFixed(2)}u  y ${U(P.y).toFixed(2)}u`);
  if(!drag)return;
  if(drag.mode==='pivot'){const s=e.altKey?1:snapStep()/2;pivot={x:Math.round(P.x/s)*s,y:Math.round(P.y/s)*s};drawPivot();return;}
  if(drag.mode==='move'){
    let dx=P.x-drag.start.x,dy=P.y-drag.start.y;
    if(!e.altKey){const s=snapStep(),a=drag.anchor;dx=Math.round((a.x+dx)/s)*s-a.x;dy=Math.round((a.y+dy)/s)*s-a.y;}
    else{dx=Math.round(dx);dy=Math.round(dy);}
    drag.moved=drag.moved||dx||dy;
    for(const [j,o] of drag.orig){const k=keys[j];Object.assign(k,o);moveKey(k,dx,dy);}
    if(drag.pv)pivot={x:drag.pv.x+dx,y:drag.pv.y+dy};
    render();hud(`Δx ${U(dx).toFixed(2)}u  Δy ${U(dy).toFixed(2)}u`);return;}
  if(drag.mode==='band'){
    const x0=Math.min(P.x,drag.start.x),y0=Math.min(P.y,drag.start.y),w=Math.abs(P.x-drag.start.x),h=Math.abs(P.y-drag.start.y);
    const b=$('#band');b.setAttribute('visibility','visible');b.setAttribute('x',x0);b.setAttribute('y',y0);b.setAttribute('width',w);b.setAttribute('height',h);
    sel=new Set(drag.add?drag.base:[]);keys.forEach((k,i)=>{const c=center(k);if(c.x>=x0&&c.x<=x0+w&&c.y>=y0&&c.y<=y0+h)sel.add(i);});render();
  }
});
function endDrag(){
  if(!drag)return;
  if(drag.mode==='move'&&drag.moved)commit();
  if(drag.mode==='band')$('#band').setAttribute('visibility','hidden');
  drag=null;
}
svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('wheel',e=>{e.preventDefault();const P=pt(e),f=Math.exp(e.deltaY*0.0015);
  VB={x:P.x-(P.x-VB.x)*f,y:P.y-(P.y-VB.y)*f,w:VB.w*f,h:VB.h*f};setVB();},{passive:false});

/* ---------- commands ---------- */
function rotateSel(d){const s=[...sel];if(!s.length)return;const P=pivot||selCenter();s.forEach(i=>rotateKey(keys[i],d,P));if(!pivot)pivot=P;commit();render();}
function nudge(dx,dy){const s=[...sel];if(!s.length)return;s.forEach(i=>moveKey(keys[i],dx,dy));if(pivot){pivot.x+=dx;pivot.y+=dy;}commit();render();}
function mirrorSel(){
  const N=Math.max(2,parseInt($('#mCols').value,10)||12),A=+$('#mAxis').value*100,s=[...sel];if(!s.length){msg('鏡映するキーを選んでください',true);return;}
  let n=0;
  for(const i of s){const r=Math.floor(i/N),c=i%N,j=r*N+(N-1-c);if(j===i||j>=keys.length)continue;
    const k=keys[i];keys[j]={w:k.w,h:k.h,x:2*A-k.x-k.w,y:k.y,r:k.r?-k.r:0,rx:k.r?2*A-k.rx:0,ry:k.r?k.ry:0};n++;}
  commit();render();msg(`${n}キーを反対側に写しました`);
}
$('#bRotL').onclick=()=>rotateSel(-+$('#selRot').value);
$('#bRotR').onclick=()=>rotateSel(+$('#selRot').value);
$('#bPivot').onclick=()=>{pivot=null;drawPivot();};
$('#bMirror').onclick=mirrorSel;
$('#bAxisAuto').onclick=()=>{const b=bbox(keys.map((_,i)=>i));if(b){$('#mAxis').value=U((b.x0+b.x1)/2);drawAxis();}};
$('#mAxis').addEventListener('input',drawAxis);
$('#bUndo').onclick=undo;$('#bRedo').onclick=redo;$('#bFit').onclick=fit;
$('#selSnap').onchange=drawGrid;
$('#selLayer').onchange=()=>{LS.set('ple-layer',$('#selLayer').value);setLegends();render();};
let msgT;function msg(t,err){const m=$('#msg');m.textContent=t;m.className='msg'+(err?' err':'');clearTimeout(msgT);msgT=setTimeout(()=>m.textContent='',3200);}
$('#bCopy').onclick=()=>{const t=$('#out');
  (navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(()=>msg('コピーしました'),()=>{t.focus();t.select();msg('選択しました。⌘C でコピーしてください');});};

document.addEventListener('keydown',e=>{
  if(e.target.closest&&e.target.closest('input,textarea,select'))return;
  const mod=e.metaKey||e.ctrlKey;
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();sel=new Set(keys.map((_,i)=>i));pivot=null;render();return;}
  if(e.key==='Escape'){sel.clear();pivot=null;render();return;}
  const st=e.altKey?1:snapStep()*(e.shiftKey?4:1);
  const mv={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];
  if(mv&&sel.size){e.preventDefault();nudge(...mv);return;}
  if(e.key.toLowerCase()==='r'&&!mod&&sel.size){e.preventDefault();rotateSel((e.shiftKey?-1:1)*+$('#selRot').value);}
});

/* ---------- files ---------- */
function readFile(f,cb){const r=new FileReader();r.onload=()=>cb(String(r.result));r.readAsText(f,'utf-8');}
$('#fDts').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  readFile(f,t=>{try{const ks=parseDts(t);keys=ks;sel.clear();pivot=null;setLegends();commit();render();fit();
    if(yamlLayers&&yamlLayers[0].k.length!==keys.length)msg(`キー数 ${keys.length} と YAML の ${yamlLayers[0].k.length} が一致しません`,true);else msg(`${f.name} から ${keys.length}キーを読み込みました`);}
    catch(err){msg(err.message,true);}});};
$('#fYaml').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  readFile(f,t=>{try{loadYaml(t);LS.set('ple-yaml',t);render();msg('刻印を読み込みました');}catch(err){msg(err.message,true);}});};

/* web: GitHub repo or YAML URL -> layout (dts_layout) + legends */
function applyKeyboard(layoutText,yamlText,label){
  keys=parseDts(layoutText);sel.clear();pivot=null;
  if(yamlText){loadYaml(yamlText);LS.set('ple-yaml',yamlText);}
  setLegends();
  {const b=bbox(keys.map((_,i)=>i));if(b){$('#mAxis').value=U((b.x0+b.x1)/2);drawAxis();}}
  commit();render();fit();msg(`${label} から ${keys.length}キーを読み込みました`);
}
$('#webForm').addEventListener('submit',async e=>{
  e.preventDefault();const spec=$('#webSpec').value.trim(),btn=$('#webBtn');btn.disabled=true;msg('取得中…');
  try{const kb=await fetchKeyboard(spec,{yaml:window.jsyaml});LS.set('ple-web',spec);applyKeyboard(kb.layoutText,kb.yamlText,kb.source);}
  catch(err){msg(err.message,true);}
  finally{btn.disabled=false;}
});

/* ---------- init ---------- */
async function fetchText(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url}: ${r.status}`);return r.text();}
async function boot(){
  let def=null;
  try{const idx=JSON.parse(await fetchText('keyboards/index.json'));const k=idx.keyboards.find(x=>x.id===idx.default)||idx.keyboards[0];
    if(k&&k.repo){try{const kb=await fetchKeyboard(k.repo,{yaml:window.jsyaml});def={yaml:kb.yamlText,layout:kb.layoutText,name:k.name};}catch(e){/* use bundled copy */}}
    if(k&&!def){const [y,l]=await Promise.all([fetchText(k.yaml),fetchText(k.layout)]);def={yaml:y,layout:l,name:k.name};}
    if(k&&k.repo)$('#webSpec').value=LS.get('ple-web')||k.repo;}
  catch(e){msg('既定のキーボードを読み込めませんでした（http サーバー経由で開いてください）',true);}
  let saved=null;try{saved=JSON.parse(LS.get('ple-keys')||'null');}catch(e){}
  if(Array.isArray(saved)&&saved.length)keys=saved;
  else if(def){try{keys=parseDts(def.layout);}catch(e){keys=defaultKeys();}}
  else keys=defaultKeys();
  try{const y=LS.get('ple-yaml')||(def&&def.yaml);if(y)loadYaml(y);}catch(e){}
  {const b=bbox(keys.map((_,i)=>i));if(b){$('#mAxis').value=U((b.x0+b.x1)/2);}}
  hist.length=0;hist.push(JSON.stringify(keys));syncHist();render();renderOut();
  requestAnimationFrame(()=>{fit();hud('キーをドラッグして移動');});
}
boot();
window.addEventListener('resize',()=>{const r=svg.getBoundingClientRect();if(r.width)fit();});
