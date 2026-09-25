import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}

function findFunctionRange(src, name, from = 0) {
  const needle = `function ${name}(`;
  const start = src.indexOf(needle, from);
  if (start < 0) return null;
  const open = src.indexOf('{', start + needle.length);
  if (open < 0) throw new Error(`Function body not found: ${name}`);
  let depth = 0;
  let quote = '';
  let esc = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1] || '';
    if (lineComment) {
      if (ch === '\n' || ch === '\r') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return [start, i + 1];
    }
  }
  throw new Error(`Function close brace not found: ${name}`);
}

function replaceAllFunctions(src, name, body) {
  let out = src;
  let pos = 0;
  let count = 0;
  while (true) {
    const range = findFunctionRange(out, name, pos);
    if (!range) break;
    const [start, end] = range;
    out = out.slice(0, start) + body + out.slice(end);
    pos = start + body.length;
    count++;
    if (count > 25) throw new Error(`Too many replacements for ${name}`);
  }
  if (!count) throw new Error(`Function not found: ${name}`);
  return out;
}

function removeAllFunctions(src, name) {
  let out = src;
  let pos = 0;
  let count = 0;
  while (true) {
    const range = findFunctionRange(out, name, pos);
    if (!range) break;
    let [start, end] = range;
    while (end < out.length && /[\t ]/.test(out[end])) end++;
    if (out[end] === '\r') end++;
    if (out[end] === '\n') end++;
    out = out.slice(0, start) + out.slice(end);
    pos = start;
    count++;
    if (count > 25) throw new Error(`Too many removals for ${name}`);
  }
  return out;
}

function replaceRequired(src, before, after, label) {
  if (!src.includes(before)) throw new Error(`Patch target not found: ${label}`);
  return src.split(before).join(after);
}

function replaceIfPresent(src, before, after) {
  return src.split(before).join(after);
}

function prependGuardToFunction(src, name, guard) {
  const needle = `function ${name}(){`;
  let count = 0;
  const out = src.replaceAll(needle, needle + '\n  ' + guard + '\n');
  count = out === src ? 0 : src.split(needle).length - 1;
  return { out, count };
}

let html = fs.readFileSync(indexPath, 'utf8');
const before = html;

// Force a fresh client cache key for this optimized native siege build.
html = html
  .split('v602-clan-siege-exit-visible-20260925').join('v607-clan-siege-castle-cache-20260925')
  .split('v603-clan-siege-native-clean-20260925').join('v607-clan-siege-castle-cache-20260925')
  .split('v604-clan-siege-native-leave-20260925').join('v607-clan-siege-castle-cache-20260925')
  .split('v605-clan-siege-won-fps-20260925').join('v607-clan-siege-castle-cache-20260925')
  .split('v606-clan-siege-city-exit-20260925').join('v607-clan-siege-castle-cache-20260925');

// Native state: one city-exit button after victory, no duplicate exit button, no castle-cleared hack flag.
html = replaceRequired(
  html,
  "baseStats:null,hud:null,exitBtn:null,hudHtml:'',hudLastAt:0,castleCleared:false",
  "baseStats:null,hud:null,leaveBtn:null,hudHtml:'',hudLastAt:0",
  'PPA_SIEGE native state cache'
);

html = replaceAllFunctions(html, 'clanSiegeEnsureHud', `function clanSiegeEnsureHud(){
  if(PPA_SIEGE.hud&&PPA_SIEGE.hud.isConnected)return PPA_SIEGE.hud;
  const el=document.createElement('div');
  el.id='clanSiegeHud';
  el.style.cssText='position:fixed;z-index:48;left:calc(60% - 30px);top:6px;transform:translateX(-50%);width:min(330px,54vw);max-width:330px;min-height:29px;box-sizing:border-box;padding:4px 8px;border:1px solid rgba(195,128,45,.7);border-radius:7px;background:rgba(21,18,12,.82);box-shadow:0 2px 9px rgba(0,0,0,.58);color:#e8d9ad;font:700 8px/1.25 monospace;text-align:center;white-space:normal;pointer-events:none;display:none';
  document.body.appendChild(el);
  PPA_SIEGE.hud=el;
  if(!PPA_SIEGE.leaveBtn||!PPA_SIEGE.leaveBtn.isConnected){
    const b=document.createElement('button');
    b.id='clanSiegeLeaveBtn';
    b.type='button';
    b.textContent='↩ В ГОРОД';
    b.style.cssText='position:fixed;left:calc(60% - 30px);top:42px;transform:translateX(-50%);z-index:58;display:none;min-width:96px;height:28px;padding:0 10px;border:1px solid #c58435;border-radius:8px;background:linear-gradient(#542815,#2b160d);color:#ffd787;box-shadow:0 3px 12px rgba(0,0,0,.65);font:800 9px monospace;touch-action:manipulation';
    b.onclick=()=>changeScene('safe');
    document.body.appendChild(b);
    PPA_SIEGE.leaveBtn=b;
  }
  return el;
}`);

html = removeAllFunctions(html, 'clanSiegeClearCastleObstacles');

html = replaceAllFunctions(html, 'clanSiegeHudUpdate', `function clanSiegeHudUpdate(force=false){
  const h=clanSiegeEnsureHud();
  const leave=PPA_SIEGE.leaveBtn||null;
  if(P.scene!=='clansiege'||!PPA_SIEGE.active){
    h.style.display='none';
    if(leave)leave.style.display='none';
    return;
  }
  const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  if(!force&&now-(PPA_SIEGE.hudLastAt||0)<200)return;
  PPA_SIEGE.hudLastAt=now;
  h.style.display='block';
  if(leave)leave.style.display=PPA_SIEGE.phase==='won'?'block':'none';
  const alive=EN.filter(e=>e&&e.isClanSiegeCrystal&&e.hp>0).length;
  const b=PPA_SIEGE.bonuses;
  const badges=[
    b.attack?'🔴+10% ATK':'⚫ СИЛА',
    b.defense?'🔵+10% DEF':'⚫ ЗАЩИТА',
    b.hp?'🟢+12% HP':'⚫ ЖИЗНЬ',
    b.atkspd?'🟣+8% ASPD':'⚫ БЕЗДНА'
  ].join(' · ');
  const phase=alive>0?('КРИСТАЛЛЫ: '+alive+' / 4'):
    (PPA_SIEGE.phase==='won'?('🏰 ЗАМОК ЗАХВАЧЕН · '+PPA_SIEGE.winner):
      ('🏰 ЗАХВАТ ЗАМКА · '+Math.floor(PPA_SIEGE.captureProgress)+' / '+CLAN_SIEGE_CAPTURE.seconds+' сек · '+(PPA_SIEGE.captureActive?'ИДЁТ ЗАХВАТ':'ВСТАНЬ У КРАЯ')));
  const html='<b>'+phase+'</b><br><span style="color:#aeb7bd">'+badges+'</span>';
  if(PPA_SIEGE.hudHtml!==html){
    PPA_SIEGE.hudHtml=html;
    h.innerHTML=html;
  }
}`);

html = replaceRequired(
  html,
  "PPA_SIEGE.captureLastAt=Date.now();PPA_SIEGE.enemyInZone=false;PPA_SIEGE.winner='';PPA_SIEGE.castleShownAt=0;PPA_SIEGE.hudHtml='';PPA_SIEGE.hudLastAt=0;PPA_SIEGE.castleCleared=false;",
  "PPA_SIEGE.captureLastAt=Date.now();PPA_SIEGE.enemyInZone=false;PPA_SIEGE.winner='';PPA_SIEGE.castleShownAt=0;PPA_SIEGE.hudHtml='';PPA_SIEGE.hudLastAt=0;",
  'siege enter cache reset'
);

html = replaceRequired(
  html,
  "const h=clanSiegeEnsureHud();h.style.display='none';if(PPA_SIEGE.exitBtn)PPA_SIEGE.exitBtn.style.display='none';",
  "const h=clanSiegeEnsureHud();h.style.display='none';if(PPA_SIEGE.leaveBtn)PPA_SIEGE.leaveBtn.style.display='none';",
  'siege leave duplicate exit hide'
);

// Castle must not be rendered, collide, or update expensive capture logic after it is captured.
html = replaceIfPresent(
  html,
  "PPA_SIEGE.phase==='castle'||PPA_SIEGE.phase==='won'",
  "PPA_SIEGE.phase==='castle'"
);
html = replaceIfPresent(
  html,
  "PPA_SIEGE.phase === 'castle' || PPA_SIEGE.phase === 'won'",
  "PPA_SIEGE.phase === 'castle'"
);
html = replaceIfPresent(
  html,
  "PPA_SIEGE.phase==='castle' || PPA_SIEGE.phase==='won'",
  "PPA_SIEGE.phase==='castle'"
);

html = html.replace(
  /if\(PPA_SIEGE\.phase==='castle'\)\{\s*\n\s*\/\/ Compact round collision sits fully inside the castle footprint\.\s*\n\s*const c=CLAN_SIEGE_CASTLE_COLLISION;/g,
  "if(PPA_SIEGE.phase==='castle'){\n    // Compact round collision sits fully inside the castle footprint.\n    const c=CLAN_SIEGE_CASTLE_COLLISION;"
);

// Active castle optimization: build one pre-scaled image and draw it without per-frame scaling.
html = replaceAllFunctions(html, 'drawClanSiegeWorld', `function drawClanSiegeWorld(){
  if(P.scene!=='clansiege'||!PPA_SIEGE.active)return;
  if(PPA_SIEGE.phase==='won')return;
  if(PPA_SIEGE.phase!=='castle')return;
  const c=CLAN_SIEGE_CASTLE;
  const w=Math.max(1,Math.ceil(c.w)),h=Math.max(1,Math.ceil(c.h));
  const dx=Math.floor(c.x-cam.x-w/2),dy=Math.floor(c.y-cam.y-h*.78);
  const viewW=(cx&&cx.canvas?cx.canvas.width:innerWidth)||0,viewH=(cx&&cx.canvas?cx.canvas.height:innerHeight)||0;
  if(dx>viewW+64||dy>viewH+64||dx+w<-64||dy+h<-64)return;
  const im=imgClanSiegeCastle;
  if(!(im&&im.complete&&im.naturalWidth>0))return;
  const key=(im.src||'castle')+'|'+im.naturalWidth+'x'+im.naturalHeight+'|'+w+'x'+h;
  let cache=window.__PPA_SIEGE_CASTLE_CACHE__;
  if(!cache||cache.key!==key||!cache.canvas){
    let cn=null,g=null;
    try{cn=(typeof OffscreenCanvas!=='undefined')?new OffscreenCanvas(w,h):document.createElement('canvas')}catch(e){cn=document.createElement('canvas')}
    cn.width=w;cn.height=h;
    try{g=cn.getContext('2d',{alpha:true})}catch(e){g=cn.getContext('2d')}
    if(g){
      try{g.imageSmoothingEnabled=true;g.imageSmoothingQuality='medium'}catch(e){}
      g.clearRect(0,0,w,h);
      g.drawImage(im,0,0,w,h);
      cache={key:key,canvas:cn};
      window.__PPA_SIEGE_CASTLE_CACHE__=cache;
    }
  }
  cx.save();
  const age=Math.min(1,(Date.now()-(PPA_SIEGE.castleShownAt||Date.now()))/800);
  cx.globalAlpha=Math.max(.18,age);
  if(cache&&cache.canvas)cx.drawImage(cache.canvas,dx,dy);
  else cx.drawImage(im,dx,dy,w,h);
  cx.restore();
}`);

const captureGuard = prependGuardToFunction(
  html,
  'clanSiegeUpdateCapture',
  "if(PPA_SIEGE&&PPA_SIEGE.phase==='won')return;"
);
html = captureGuard.out;

const forbidden = [
  "id='clanSiegeExitNative'",
  'clanSiegeExitNative',
  'clanSiegeClearCastleObstacles',
  'castleCleared',
  'PPA_SIEGE.exitBtn'
];
for (const token of forbidden) {
  if (html.includes(token)) throw new Error('Forbidden duplicate/hack token remains: ' + token);
}
if (!html.includes("id='clanSiegeLeaveBtn'") ||
    !html.includes("b.textContent='↩ В ГОРОД'") ||
    !html.includes('PPA_SIEGE.leaveBtn') ||
    !html.includes("if(leave)leave.style.display=PPA_SIEGE.phase==='won'?'block':'none'") ||
    !html.includes("b.onclick=()=>changeScene('safe')")) {
  throw new Error('Native clan siege city-exit button validation failed');
}
if (!/if\(PPA_SIEGE\.phase==='castle'\)\{\s*\/\/ Compact round collision sits fully inside the castle footprint\.\s*const c=CLAN_SIEGE_CASTLE_COLLISION;\s*if\(Math\.hypot\(x-c\.x,y-c\.y\)<c\.r\+r\)return false;/.test(html)) {
  throw new Error('Castle collision phase gate validation failed');
}
if (html.includes("PPA_SIEGE.phase==='castle'||PPA_SIEGE.phase==='won'") ||
    html.includes("PPA_SIEGE.phase === 'castle' || PPA_SIEGE.phase === 'won'") ||
    html.includes("PPA_SIEGE.phase==='castle' || PPA_SIEGE.phase==='won'")) {
  throw new Error('Old castle/won phase branch still remains');
}
if (!html.includes("function drawClanSiegeWorld(){\n  if(P.scene!=='clansiege'||!PPA_SIEGE.active)return;\n  if(PPA_SIEGE.phase==='won')return;\n  if(PPA_SIEGE.phase!=='castle')return;") ||
    !html.includes('window.__PPA_SIEGE_CASTLE_CACHE__') ||
    !html.includes("if(dx>viewW+64||dy>viewH+64||dx+w<-64||dy+h<-64)return")) {
  throw new Error('optimized drawClanSiegeWorld castle cache/culling validation failed');
}
if (!html.includes("function clanSiegeUpdateCapture(){\n  if(PPA_SIEGE&&PPA_SIEGE.phase==='won')return;")) {
  throw new Error('clanSiegeUpdateCapture won-phase guard missing');
}
if (html === before) throw new Error('No changes applied to public/index.html');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] clean native clan siege applied: city exit after win, active castle cached and culled.');
console.log('[PPA POSTBUILD] capture guards: '+captureGuard.count);
console.log('[PPA POSTBUILD] index.html: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
