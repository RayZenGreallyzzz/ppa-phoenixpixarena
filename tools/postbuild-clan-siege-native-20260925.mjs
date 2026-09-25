import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}

function findFunctionRange(src, name) {
  const needle = `function ${name}(`;
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`Function not found: ${name}`);
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

function replaceFunction(src, name, body) {
  const [start, end] = findFunctionRange(src, name);
  return src.slice(0, start) + body + src.slice(end);
}

function removeFunction(src, name) {
  const [start, end] = findFunctionRange(src, name);
  let cutEnd = end;
  while (cutEnd < src.length && /[\t ]/.test(src[cutEnd])) cutEnd++;
  if (src[cutEnd] === '\r') cutEnd++;
  if (src[cutEnd] === '\n') cutEnd++;
  return src.slice(0, start) + src.slice(cutEnd);
}

function replaceRequired(src, before, after, label) {
  if (!src.includes(before)) throw new Error(`Patch target not found: ${label}`);
  return src.split(before).join(after);
}

let html = fs.readFileSync(indexPath, 'utf8');
const before = html;

// Force a fresh client cache key for this clean native siege build.
html = html.split('v602-clan-siege-exit-visible-20260925').join('v603-clan-siege-native-clean-20260925');

// Remove the duplicate generated exit button state. The original siege exit button remains native.
html = replaceRequired(
  html,
  "baseStats:null,hud:null,exitBtn:null,hudHtml:'',hudLastAt:0,castleCleared:false",
  "baseStats:null,hud:null,hudHtml:'',hudLastAt:0",
  'PPA_SIEGE native state cache'
);

html = replaceFunction(html, 'clanSiegeEnsureHud', `function clanSiegeEnsureHud(){
  if(PPA_SIEGE.hud&&PPA_SIEGE.hud.isConnected)return PPA_SIEGE.hud;
  const el=document.createElement('div');
  el.id='clanSiegeHud';
  el.style.cssText='position:fixed;z-index:48;left:calc(60% - 30px);top:6px;transform:translateX(-50%);width:min(330px,54vw);max-width:330px;min-height:29px;box-sizing:border-box;padding:4px 8px;border:1px solid rgba(195,128,45,.7);border-radius:7px;background:rgba(21,18,12,.82);box-shadow:0 2px 9px rgba(0,0,0,.58);color:#e8d9ad;font:700 8px/1.25 monospace;text-align:center;white-space:normal;pointer-events:none;display:none';
  document.body.appendChild(el);
  PPA_SIEGE.hud=el;
  return el;
}`);

if (html.includes('function clanSiegeClearCastleObstacles(')) {
  html = removeFunction(html, 'clanSiegeClearCastleObstacles');
}

html = replaceFunction(html, 'clanSiegeHudUpdate', `function clanSiegeHudUpdate(force=false){
  const h=clanSiegeEnsureHud();
  if(P.scene!=='clansiege'||!PPA_SIEGE.active){
    h.style.display='none';
    return;
  }
  const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  if(!force&&now-(PPA_SIEGE.hudLastAt||0)<200)return;
  PPA_SIEGE.hudLastAt=now;
  h.style.display='block';
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
  "const h=clanSiegeEnsureHud();h.style.display='none';",
  'siege leave duplicate exit hide'
);

// Castle collider must exist only while the castle phase is active.
html = html.replace(
  /if\(PPA_SIEGE\.phase==='castle'\|\|PPA_SIEGE\.phase==='won'\)\{\s*\n\s*\/\/ Compact round collision sits fully inside the castle footprint\.\s*\n\s*const c=CLAN_SIEGE_CASTLE_COLLISION;/g,
  "if(PPA_SIEGE.phase==='castle'){\n    // Compact round collision sits fully inside the castle footprint.\n    const c=CLAN_SIEGE_CASTLE_COLLISION;"
);

// Keep draw logic and collision logic aligned if an older castle draw branch is still present.
html = html.replace(
  /if\(PPA_SIEGE\.phase==='castle'\|\|PPA_SIEGE\.phase==='won'\)\{(\s*const c=CLAN_SIEGE_CASTLE,)/g,
  "if(PPA_SIEGE.phase==='castle'){$1"
);

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
if (!html.includes("if(PPA_SIEGE.phase==='castle'){") || html.includes("CLAN_SIEGE_CASTLE_COLLISION;\n    if(Math.hypot(x-c.x,y-c.y)<c.r+r)return false;\n  }\n  return true;\n}\nfunction clanSiegeSlide") === false) {
  throw new Error('Castle collision phase gate validation failed');
}
if (html === before) throw new Error('No changes applied to public/index.html');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] clean native clan siege applied: original exit only, castle collision only in castle phase.');
console.log('[PPA POSTBUILD] index.html: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
