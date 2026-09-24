import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import sharp from 'sharp';

const ROOT = process.cwd();
const EXPECTED_PARTS = 12;
const EXPECTED_SOURCE_SHA256 = 'caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts = Array.from({length:EXPECTED_PARTS},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const CLIENT_BUILD = 'v555-smith-custom-dark-select-20260924';

const missing = parts.filter((name)=>!fs.existsSync(path.join(ROOT,name)));
if (missing.length) {
  throw new Error(`PPA source parts incomplete. Missing: ${missing.join(', ')}`);
}

console.log(`PPA build: joining ${parts.length} source parts...`);
const packed = Buffer.concat(parts.map((name) => fs.readFileSync(path.join(ROOT, name))));
const sourceBuffer = zlib.gunzipSync(packed);
const sourceHash = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
if (sourceHash !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`PPA source checksum mismatch: ${sourceHash}`);
}
const source = sourceBuffer.toString('utf8');

function ppaReadApprovedB64(name){
  const p=path.join(ROOT,'assets-src',name);
  if(!fs.existsSync(p))throw new Error('Approved art source missing: '+name);
  const b64=fs.readFileSync(p,'utf8').trim();
  const buf=Buffer.from(b64,'base64');
  if(buf.length<500||buf.subarray(0,4).toString('ascii')!=='RIFF'||buf.subarray(8,12).toString('ascii')!=='WEBP'){
    throw new Error('Approved art is not valid WebP: '+name);
  }
  return {b64:b64,buf:buf,data:'data:image/webp;base64,'+b64};
}
const PPA_APPROVED_SLAG_ART=ppaReadApprovedB64('fart-slag-reference.b64');
const PPA_APPROVED_EMERALD_ART=ppaReadApprovedB64('emerald-smith-reference.b64');
const PPA_RURI_EVENT_CARD_ART=ppaReadApprovedB64('ruri-event-card-approved.b64');
function ppaReadApprovedB64Parts(names){
  const b64=names.map((name)=>{
    const p=path.join(ROOT,'assets-src',name);
    if(!fs.existsSync(p))throw new Error('Approved art source missing: '+name);
    return fs.readFileSync(p,'utf8').trim();
  }).join('').replace(/\s+/g,'');
  const buf=Buffer.from(b64,'base64');
  if(buf.length<500||buf.subarray(0,4).toString('ascii')!=='RIFF'||buf.subarray(8,12).toString('ascii')!=='WEBP'){
    throw new Error('Approved multipart art is not valid WebP: '+names.join(','));
  }
  return {b64:b64,buf:buf};
}
const PPA_RURI_MOVE_ART=ppaReadApprovedB64Parts([
  'ruri-move-1.b64','ruri-move-2.b64','ruri-move-3.b64'
]);
const PPA_RURI_RESOURCE_FILES=[
  'ruri-demonic-crystal.webp',
  'ruri-fire-shards.webp',
  'ruri-crystal.webp',
  'ruri-monster-blood.webp'
];
for(const name of PPA_RURI_RESOURCE_FILES){
  const p=path.join(ROOT,'assets-src',name);
  if(!fs.existsSync(p)||fs.statSync(p).size<500)throw new Error('Approved Ruri resource art missing/invalid: '+name);
}
// Canonical HD legendary source for ALL 8 classes.
// Layout: 6 columns x 8 rows, 256x256 per cell.
// Rows: tank, paladin, barbarian, assassin, gnome, archer, mage, priest.
// Cols: weapon, helmet, armor, legs, gloves, boots.
const PPA_LEGENDARY_HD_PATH=path.join(ROOT,'assets-src','legendary-gear-hd-approved-8classes.png');
if(!fs.existsSync(PPA_LEGENDARY_HD_PATH)){
  throw new Error('Canonical legendary HD master is required: assets-src/legendary-gear-hd-approved-8classes.png');
}
const PPA_LEGENDARY_HD_BUF=fs.readFileSync(PPA_LEGENDARY_HD_PATH);
const PPA_LEGENDARY_HD_META=await sharp(PPA_LEGENDARY_HD_BUF).metadata();
if(PPA_LEGENDARY_HD_META.format!=='png'||PPA_LEGENDARY_HD_META.width!==1536||PPA_LEGENDARY_HD_META.height!==2048||!PPA_LEGENDARY_HD_META.hasAlpha){
  throw new Error('Legendary HD master must be transparent PNG 1536x2048 (6x8 cells of 256px)');
}
console.log('PPA legendary gear: canonical HD-only 256px source enabled for all 8 classes.');

const publicDir = path.join(ROOT, 'public');
const assetsDir = path.join(publicDir, 'assets');
const gameDir = path.join(publicDir, 'game');
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(gameDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir,'ruri-move.webp'),PPA_RURI_MOVE_ART.buf);
for(const name of PPA_RURI_RESOURCE_FILES){
  fs.copyFileSync(path.join(ROOT,'assets-src',name),path.join(assetsDir,name));
}

// V531: canonical Great Ruri poster file itself gets the approved current crystal.
// No CSS/DOM marker or overlay is needed in the Events UI.
{
  const cardMeta=await sharp(PPA_RURI_EVENT_CARD_ART.buf).metadata();
  const cw=Number(cardMeta.width)||1197,ch=Number(cardMeta.height)||1314;
  const sx=cw/1197,sy=ch/1314;
  const crystalSrc=path.join(ROOT,'assets-src','ruri-crystal.webp');
  function sc(v,s){return Math.max(1,Math.round(v*s))}
  function softPatch(w,h){
    return Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">'+
      '<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">'+
      '<stop offset="0%" stop-color="#07090a" stop-opacity="1"/>'+
      '<stop offset="72%" stop-color="#07090a" stop-opacity=".99"/>'+
      '<stop offset="91%" stop-color="#07090a" stop-opacity=".82"/>'+
      '<stop offset="100%" stop-color="#07090a" stop-opacity="0"/>'+
      '</radialGradient></defs><ellipse cx="'+(w/2)+'" cy="'+(h/2)+'" rx="'+(w/2)+'" ry="'+(h/2)+'" fill="url(#g)"/></svg>'
    );
  }
  const dropW=sc(132,sx),dropH=sc(138,sy);
  const craftW=sc(82,sx),craftH=sc(86,sy);
  const dropCrystal=await sharp(crystalSrc).resize({width:dropW,height:dropH,fit:'contain'}).webp({quality:96,alphaQuality:100}).toBuffer();
  const craftCrystal=await sharp(crystalSrc).resize({width:craftW,height:craftH,fit:'contain'}).webp({quality:96,alphaQuality:100}).toBuffer();
  const comps=[
    {input:softPatch(sc(185,sx),sc(158,sy)),left:sc(647,sx),top:sc(753,sy)},
    {input:dropCrystal,left:sc(674,sx),top:sc(767,sy)},
    {input:softPatch(sc(118,sx),sc(105,sy)),left:sc(785,sx),top:sc(1085,sy)},
    {input:craftCrystal,left:sc(802,sx),top:sc(1095,sy)}
  ];
  await sharp(PPA_RURI_EVENT_CARD_ART.buf)
    .composite(comps)
    .webp({quality:94,alphaQuality:100,effort:5})
    .toFile(path.join(assetsDir,'ruri-event-card.webp'));
  const outMeta=await sharp(path.join(assetsDir,'ruri-event-card.webp')).metadata();
  if(outMeta.width!==cw||outMeta.height!==ch)throw new Error('Great Ruri poster output size changed unexpectedly');
}
const PPA_LEGENDARY_FILE_ROWS={tank:0,paladin:1,barbarian:2,assassin:3,gnome:4,archer:5,mage:6,priest:7};
const PPA_LEGENDARY_FILE_COLS={weapon:0,helmet:1,armor:2,legs:3,gloves:4,boots:5};
const PPA_LEGENDARY_DIR=path.join(assetsDir,'legendary');
fs.mkdirSync(PPA_LEGENDARY_DIR,{recursive:true});
const PPA_LEGENDARY_CELL=256;
await Promise.all(Object.entries(PPA_LEGENDARY_FILE_ROWS).flatMap(([cls,row])=>
  Object.entries(PPA_LEGENDARY_FILE_COLS).map(async([slot,col])=>{
    const outPath=path.join(PPA_LEGENDARY_DIR,cls+'-'+slot+'.webp');
    await sharp(PPA_LEGENDARY_HD_BUF)
      .extract({left:col*256,top:row*256,width:256,height:256})
      .webp({lossless:true,alphaQuality:100,effort:4})
      .toFile(outPath);
    const meta=await sharp(outPath).metadata();
    if(meta.width!==256||meta.height!==256||!meta.hasAlpha)throw new Error('Legendary HD item output invalid: '+cls+' '+slot);
  })
));
for(const cls of Object.keys(PPA_LEGENDARY_FILE_ROWS)){
  for(const slot of Object.keys(PPA_LEGENDARY_FILE_COLS)){
    const p=path.join(PPA_LEGENDARY_DIR,cls+'-'+slot+'.webp');
    if(!fs.existsSync(p)||fs.statSync(p).size<500)throw new Error('Legendary item file missing: '+cls+' '+slot);
  }
}
if(Object.keys(PPA_LEGENDARY_FILE_ROWS).length!==8||Object.keys(PPA_LEGENDARY_FILE_COLS).length!==6){
  throw new Error('Legendary canonical matrix must remain 8 classes x 6 gear slots');
}

const fartGuardSources = [
  ['fart-tentacle.webp', 'fart-tentacle.webp'],
  ['fart-spider.webp', 'fart-spider.webp'],
  ['fart-reaper.webp', 'fart-reaper.webp'],
  ['fart-golem.webp', 'fart-golem.webp'],
  ['fart-darkguard.webp', 'fart-darkguard.webp']
];
for (const [srcName, outName] of fartGuardSources) {
  const srcPath = path.join(ROOT, 'assets-src', srcName);
  if (!fs.existsSync(srcPath)) throw new Error('Fart guard source missing: ' + srcName);
  fs.copyFileSync(srcPath, path.join(assetsDir, outName));
}

const extByMime = { png: 'png', webp: 'webp', jpeg: 'jpg' };
const seen = new Map();
const dataUri = /data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/g;
let count = 0;

let output = source.replace(dataUri, (full, mime, b64) => {
  if (seen.has(full)) return seen.get(full);
  const bytes = Buffer.from(b64, 'base64');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const filename = `${hash}.${extByMime[mime]}`;
  fs.writeFileSync(path.join(assetsDir, filename), bytes);
  const url = `./assets/${filename}`;
  seen.set(full, url);
  count++;
  return url;
});

output = output.replace(
  'https://telegram.org/js/telegram-web-app.js"',
  'https://telegram.org/js/telegram-web-app.js?63"'
);

output = output.replace(
  '<script src="https://telegram.org/js/telegram-web-app.js?63"></script>',
  '<script src="https://telegram.org/js/telegram-web-app.js?63"></script>\n<script defer src="https://unpkg.com/@tonconnect/ui@3.0.2/dist/tonconnect-ui.min.js" data-ppa-tonconnect="1"></script>'
);
if (!output.includes('data-ppa-tonconnect="1"')) {
  throw new Error('TON Connect preload did not apply');
}

if (!output.includes('<head>')) throw new Error('PPA <head> not found');
output = output.replace('<head>', `<head>\n<script>window.PPA_CLIENT_BUILD=${JSON.stringify(CLIENT_BUILD)};window.PPA_REALTIME_V2_ACTIVE=true;window.PPA_BOSS_TEST_OPEN=true;window.PPA_TEST_ALL_DUNGEONS=true;</script>`);

const legacyInitNeedle = 'async function PPAOnlineInit(){\n';
if (!output.includes(legacyInitNeedle)) throw new Error('Legacy PPAOnlineInit patch target not found');
output = output.replace(legacyInitNeedle, "async function PPAOnlineInit(){\n  if(window.PPA_REALTIME_V2_ACTIVE)return;\n");

const legacyTickNeedle = 'function PPAOnlineTick(){\n';
if (!output.includes(legacyTickNeedle)) throw new Error('Legacy PPAOnlineTick patch target not found');
output = output.replace(legacyTickNeedle, "function PPAOnlineTick(){\n  if(window.PPA_REALTIME_V2_ACTIVE)return;\n");

const legacyCleanupNeedle = 'function ppaOnlineCleanup(){\n';
if (!output.includes(legacyCleanupNeedle)) throw new Error('Legacy ppaOnlineCleanup patch target not found');
output = output.replace(legacyCleanupNeedle, "function ppaOnlineCleanup(){\n  if(window.PPA_REALTIME_V2_ACTIVE)return;\n");

const migrationNeedle = 'var migrationState=ppaMigrationSaveObject();\n      if(ppaSaveHasCharacterState(migrationState)){';
const migrationPatch = "var migrationState=ppaMigrationSaveObject();\n      if(profileNick&&/^[A-Za-zА-Яа-яЁё0-9_]{3,18}$/u.test(profileNick))migrationState.playerName=profileNick;\n      if(ppaSaveHasCharacterState(migrationState)){";
if (!output.includes(migrationNeedle)) throw new Error('PPA Telegram migration patch target not found');
output = output.replace(migrationNeedle, migrationPatch);

const catchNeedle = "  }catch(err){\n    console.error('PPA Gateway bootstrap:',err);\n    ppaShowGatewayError('Не удалось подтвердить Telegram-сессию. Закройте Mini App и откройте игру снова через бота.');\n    return true;\n  }finally{";
const catchPatch = "  }catch(err){\n    console.error('PPA Gateway bootstrap:',err);\n    var _ppaErrCode=String((err&&err.code)||('HTTP_'+String((err&&err.status)||'ERR')));\n    var _ppaErrMsg=String((err&&err.message)||'Ошибка Gateway');\n    var _ppaLocalClass=(P&&P._saved&&P._saved.cls)?classKeyFromName(P._saved.cls):'';\n    if(_ppaLocalClass&&CLASS_BASE[_ppaLocalClass]){\n      PPA_CLOUD.ready=false;\n      try{showPickup('ОБЛАКО НЕДОСТУПНО · ЛОКАЛЬНЫЙ СЕЙВ','#ffb36b')}catch(_){}\n      applyClass({name:CLASS_BASE[_ppaLocalClass].name});\n      beginGame();\n      return true;\n    }\n    ppaShowGatewayError('Gateway: '+_ppaErrCode+' · '+_ppaErrMsg);\n    return true;\n  }finally{";
if (!output.includes(catchNeedle)) throw new Error('PPA Gateway fallback patch target not found');
output = output.replace(catchNeedle, catchPatch);

const saveToolsRe = /&lt;div id=&quot;saveTools&quot;&gt;[\s\S]*?&lt;\/div&gt;\s*&lt;\/section&gt;/;
if (!saveToolsRe.test(output)) throw new Error('PPA save tools block not found');
output = output.replace(saveToolsRe, '&lt;/section&gt;');

// Online dungeon mobs use server-authoritative spawn/HP/position/AI events.
// The V278 packed source has changed formatting across releases, so these
// integration patches must be whitespace-tolerant and must never block a
// deployment just because one optional hook moved.
function ppaPatchRegex(label, re, replacement, all=false) {
  const before = output;
  if (!re.test(output)) {
    console.warn('[PPA BUILD WARN] '+label+' target not found; continuing without this hook');
    return false;
  }
  re.lastIndex = 0;
  output = all ? output.replace(re, replacement) : output.replace(re, replacement);
  console.log('[PPA BUILD] '+label+': patched');
  return output !== before;
}

function ppaEscapeSrcdocCode(code) {
  return String(code)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/* === NATIVE TABBED EVENTS CENTER ======================================== */
// Replace the legacy events iframe at build time instead of trying to overlay it
// at runtime. Parent-side event mechanics/messages remain unchanged.
{
  const nativeEventsSrcPath=path.join(ROOT,'gateway','native-events-srcdoc.html');
  if(!fs.existsSync(nativeEventsSrcPath))throw new Error('Native Events srcdoc missing');
  const titanArtMatch=output.match(/id:&#x27;worldboss_crystal_titan_001&#x27;[\s\S]{0,1600}?bossArt:&#x27;([^&]+?)&#x27;/);
  const titanArt=titanArtMatch?String(titanArtMatch[1]).replace(/^\.\//,'/'):'';
  const ruriArt='/assets/ruri-event-card.webp?v='+CLIENT_BUILD;
  let nativeEventsHtml=fs.readFileSync(nativeEventsSrcPath,'utf8')
    .replace(/__PPA_RURI_CARD__/g,ruriArt)
    .replace(/__PPA_TITAN_ART__/g,titanArt);
  const nativeEventsEscaped=ppaEscapeSrcdocCode(nativeEventsHtml);
  const eventsFrameRe=/<iframe id="eventsMenuFrame" title="События" srcdoc="[\s\S]*?"><\/iframe>/g;
  const eventsFrameMatches=output.match(eventsFrameRe)||[];
  if(!eventsFrameMatches.length)throw new Error('Native Events iframe target not found');
  output=output.replace(eventsFrameRe,'<iframe id="eventsMenuFrame" title="События" srcdoc="'+nativeEventsEscaped+'"></iframe>');
  console.log('[PPA BUILD] Native Events iframe instances replaced: '+eventsFrameMatches.length);
  if(!output.includes('ЦЕНТР СОБЫТИЙ')||!output.includes('Великий Рури')||!output.includes('craftRuri')||!output.includes('data-cat=&quot;game&quot;')){
    throw new Error('Native tabbed Events replacement incomplete');
  }
  console.log('[PPA BUILD] Native Events iframe replaced: Игровые / Клановые / Война / Обновления');
}
/* ======================================================================== */

/* === TIGHT MELEE BASIC RANGES =========================================== */
// Basic melee is intentionally short. These values are center-to-center
// acquisition/hit ranges before the small target-body allowance below.
ppaPatchRegex(
  'melee fallback range 72',
  /const\s+MELEE_RANGE\s*=\s*95\s*;/,
  "const MELEE_RANGE=72;"
);

ppaPatchRegex(
  'class authoritative basic melee range',
  /function\s+playerBasicRange\(\)\s*\{\s*return\s+Math\.max\(60,Number\(P\.attackRange\)\|\|MELEE_RANGE\);\s*\}/,
  `function playerBasicRange(){
  const ck=(typeof classBaseKey==='function'?classBaseKey():'');
  const melee={tank:72,barbarian:78,paladin:74,assassin:64};
  if(melee[ck])return melee[ck];
  return Math.max(60,Number(P.attackRange)||MELEE_RANGE);
}
function playerBasicTargetEdge(target){
  if(!target||!Number.isFinite(Number(target.sz))||Number(target.sz)<=30)return 0;
  const ck=(typeof classBaseKey==='function'?classBaseKey():'');
  const melee=(ck==='tank'||ck==='barbarian'||ck==='paladin'||ck==='assassin');
  return melee
    ?Math.min(8,Math.max(0,(Number(target.sz)-30)*.15))
    :Math.max(0,(Number(target.sz)-30)*.4);
}`
);

ppaPatchRegex(
  'tank basic range 72',
  /hp:260,mp:20,atk:12,def_:34,spd:2\.00,atkSpd:0\.95,range:95,crit:3,dodge:3,critDmg:180/,
  "hp:260,mp:20,atk:12,def_:34,spd:2.00,atkSpd:0.95,range:72,crit:3,dodge:3,critDmg:180"
);
ppaPatchRegex(
  'barbarian basic range 78',
  /hp:150,mp:30,atk:20,def_:12,spd:3\.50,atkSpd:1\.20,range:105,crit:10,dodge:3,critDmg:180/,
  "hp:150,mp:30,atk:20,def_:12,spd:3.50,atkSpd:1.20,range:78,crit:10,dodge:3,critDmg:180"
);
ppaPatchRegex(
  'paladin basic range 74',
  /hp:170,mp:100,atk:14,def_:18,spd:3\.20,atkSpd:1\.05,range:100,crit:10,dodge:3,critDmg:180/,
  "hp:170,mp:100,atk:14,def_:18,spd:3.20,atkSpd:1.05,range:74,crit:10,dodge:3,critDmg:180"
);
ppaPatchRegex(
  'assassin basic range 64',
  /hp:100,mp:60,atk:15,def_:5,spd:4\.50,atkSpd:1\.55,range:95,crit:20,dodge:3,critDmg:180/,
  "hp:100,mp:60,atk:15,def_:5,spd:4.50,atkSpd:1.55,range:64,crit:20,dodge:3,critDmg:180"
);

ppaPatchRegex(
  'basic target edge helper',
  /const\s+edge=\(target\.sz&&target\.sz>30\)\?Math\.max\(0,\(target\.sz-30\)\*\.4\):0;/g,
  "const edge=playerBasicTargetEdge(target);",
  true
);
ppaPatchRegex(
  'basic target edge helper e',
  /const\s+edge=\(e\.sz&&e\.sz>30\)\?Math\.max\(0,\(e\.sz-30\)\*\.4\):0;/g,
  "const edge=playerBasicTargetEdge(e);",
  true
);
ppaPatchRegex(
  'smart attack melee target edge',
  /const\s+edge=\(target&&target\.sz&&target\.sz>30\)\s*\?Math\.max\(0,\(target\.sz-30\)\*\.4\)\s*:\s*0;/,
  "const edge=playerBasicTargetEdge(target);"
);
ppaPatchRegex(
  'melee hit target edge',
  /:\s*Math\.max\(0,\(e\.sz-30\)\*0\.4\);/,
  ": playerBasicTargetEdge(e);"
);
ppaPatchRegex(
  'clan boss class melee reach',
  /if\(edgeD>CLAN_BOSS_MELEE_EDGE_RANGE\)/,
  "if(edgeD>playerBasicRange())"
);

if (!output.includes("assassin:64") ||
    !output.includes("tank:72") ||
    !output.includes("barbarian:78") ||
    !output.includes("paladin:74") ||
    !output.includes("function playerBasicTargetEdge(target)")) {
  console.warn('[PPA BUILD WARN] tight melee packed-source hooks were only partially applied; arena/server ranges remain authoritative');
}

/* === CLAN DIRECTORY / RANKING ============================================ */
ppaPatchRegex(
  'clan ranking state fields',
  /applications:\[\],\s*authority:\{\},/g,
  "applications:[],clanDirectory:[],clanRanking:[],authority:{},",
  true
);

ppaPatchRegex(
  'clan ranking state sync',
  /CLAN_LOCAL_STATE\.applications\s*=\s*Array\.isArray\(state\.applications\)\?state\.applications:\(CLAN_LOCAL_STATE\.applications\|\|\[\]\);/,
  "CLAN_LOCAL_STATE.applications=Array.isArray(state.applications)?state.applications:(CLAN_LOCAL_STATE.applications||[]);"
  + "CLAN_LOCAL_STATE.clanDirectory=Array.isArray(state.clanDirectory)?state.clanDirectory:(CLAN_LOCAL_STATE.clanDirectory||[]);"
  + "CLAN_LOCAL_STATE.clanRanking=Array.isArray(state.clanRanking)?state.clanRanking:(CLAN_LOCAL_STATE.clanRanking||[]);"
);

ppaPatchRegex(
  'clan join tab label',
  /СОЗДАТЬ\s*\/\s*ВСТУПИТЬ/g,
  "КЛАНЫ / РЕЙТИНГ",
  true
);

ppaPatchRegex(
  'clan directory ranking UI',
  /function\s+renderJoin\(\)\s*\{[\s\S]*?\n\}\s*\n\s*function\s+esc\(s\)\s*\{/,
  ppaEscapeSrcdocCode(`function clanDirectoryList(){
  var a=Array.isArray(STATE.clanRanking)&&STATE.clanRanking.length?STATE.clanRanking:STATE.clanDirectory;
  return Array.isArray(a)?a:[];
}
function clanRankingHtml(canApply,blocked){
  var list=clanDirectoryList();
  if(!list.length){
    return '<div class="card" style="margin-top:9px"><h3>🏆 РЕЙТИНГ КЛАНОВ</h3><p>Пока нет созданных кланов. Первый клан займёт первое место.</p></div>';
  }
  var rows=list.map(function(x){
    var own=!!(STATE.clan&&String(STATE.clan.id||'')===String(x.id||''));
    var applied=!!x.applied;
    var btn='';
    if(canApply){
      btn=applied
        ?'<button class="memberBtn" disabled style="opacity:.65">ЗАЯВКА ОТПРАВЛЕНА</button>'
        :'<button class="memberBtn acceptBtn" data-clan-apply="'+esc(x.name||'')+'">ПОДАТЬ ЗАЯВКУ</button>';
    }else if(own){
      btn='<span class="lock">ВАШ КЛАН</span>';
    }
    var medal=Number(x.rank)===1?'🥇':(Number(x.rank)===2?'🥈':(Number(x.rank)===3?'🥉':'#'+Math.max(1,Number(x.rank)||1)));
    var search=String((x.name||'')+' '+(x.leaderName||'')).toLowerCase();
    return '<div class="clanRankRow" data-search="'+esc(search)+'" style="display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:7px;align-items:center;padding:7px;margin:5px 0;border:1px solid rgba(139,101,54,.45);border-radius:7px;background:rgba(255,225,180,.025)">'+
      '<div style="font:bold 11px monospace;color:#ffd278;text-align:center">'+medal+'</div>'+
      '<div style="min-width:0"><div style="font-weight:800;color:#efd2a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(x.name||'Клан')+'</div>'+
      '<div style="margin-top:2px;color:#a99a87;font:8px monospace">Глава: '+esc(x.leaderName||'—')+' · Ур. '+Math.max(1,Number(x.level)||1)+' · 👥 '+Math.max(0,Number(x.members)||0)+'</div>'+
      '<div style="margin-top:2px;color:#d6b06f;font:8px monospace">Вклад: '+Math.max(0,Number(x.coins)||0).toLocaleString('ru-RU')+' монет клана</div></div>'+
      '<div style="text-align:right">'+btn+'</div></div>';
  }).join('');
  return '<div class="card" style="margin-top:9px"><h3>🏆 РЕЙТИНГ И СПИСОК КЛАНОВ</h3>'+
    '<p>Место определяется по общему вкладу клана. Можно найти клан и отправить заявку прямо отсюда.</p>'+
    '<input id="clanSearch" maxlength="24" placeholder="Поиск клана или главы" style="margin:5px 0 7px;width:100%;box-sizing:border-box">'+
    '<div id="clanRankList">'+rows+'</div></div>';
}
function bindClanRanking(){
  var q=document.getElementById('clanSearch');
  if(q)q.oninput=function(){
    var v=String(q.value||'').trim().toLowerCase();
    document.querySelectorAll('.clanRankRow').forEach(function(row){
      row.style.display=!v||String(row.dataset.search||'').indexOf(v)>=0?'grid':'none';
    });
  };
  document.querySelectorAll('[data-clan-apply]').forEach(function(btn){
    btn.onclick=function(){
      if(btn.disabled)return;
      btn.disabled=true;btn.textContent='ОТПРАВКА…';
      parent.postMessage({type:'clanAction',action:'apply',name:btn.getAttribute('data-clan-apply')||''},'*');
    };
  });
}
function renderJoin(){
  if(!STATE.connected){
    main.innerHTML='<div class="storageUnlock"><div><div class="lockIco">🌐</div>'+
      '<div class="heroTitle">КЛАНОВЫЙ СЕРВЕР НЕ ПОДКЛЮЧЁН</div>'+
      '<div class="heroText" style="max-width:560px;margin:8px auto">Список, рейтинг и заявки работают только с серверными кланами.</div></div></div>';
    return;
  }
  var blocked=!STATE.clan&&Number(STATE.joinBlockedUntil||0)>Date.now();
  var canApply=!STATE.clan&&!blocked;
  var top='';
  if(STATE.clan){
    top='<div class="hero"><div class="heroTitle">КЛАНЫ И РЕЙТИНГ</div>'+
      '<div class="heroText">Твой клан отмечен в рейтинге. Входящие заявки доступны во вкладке «Участники».</div>'+
      '<div class="status"><span>Ожидают решения</span><b>'+((STATE.applications||[]).length)+'</b></div></div>';
  }else{
    top='<div class="hero"><div class="heroTitle">СОЗДАТЬ ИЛИ НАЙТИ КЛАН</div>'+
      '<div class="heroText">Создай свой клан или выбери существующий из общего серверного списка.</div></div>';
    if(blocked){
      top+='<div class="cooldownBox">После добровольного выхода действует задержка 24 часа.<br><br><b style="font-size:16px">'+esc(STATE.joinCooldownText||'до 24 часов')+'</b></div>';
    }else{
      top+='<div class="card"><h3>НОВЫЙ КЛАН</h3><div class="fieldLabel">Название</div>'+
        '<input id="clanCreateName" maxlength="24" placeholder="Название клана">'+
        '<button class="action" id="createBtn">СОЗДАТЬ КЛАН</button></div>';
    }
  }
  main.innerHTML=top+clanRankingHtml(canApply,blocked);
  var create=document.getElementById('createBtn');
  if(create)create.onclick=function(){
    var name=(document.getElementById('clanCreateName').value||'').trim();
    if(name.length<3){flash('Название минимум 3 символа');return}
    create.disabled=true;create.textContent='СОЗДАНИЕ…';
    parent.postMessage({type:'clanAction',action:'create',name:name},'*');
  };
  bindClanRanking();
}

function esc(s){`)
);

if (!output.includes('id=&quot;clanRankList&quot;')) {
  throw new Error('Clan ranking srcdoc escaping failed');
}

/* === TON CONNECT · PARENT PICKER · DIRECT REDIRECT ====================== */
// Keep Telegram account / numeric Telegram ID untouched.
// The wallet chooser lives in the parent document, so the wallet redirect runs
// directly inside the user's click instead of after an iframe postMessage.
ppaPatchRegex(
  'ton connect parent runtime direct redirect',
  /function gramWalletLink\(address\)\{/,
  `window.PPA_TWA_RETURN_URL='https://t.me/PhoenixPixMMORPGbot?startapp';
var PPA_TON_UI=null;
var PPA_TON_LOADING=null;
var PPA_TON_CONNECTED=false;
var PPA_TON_WALLET_NAME='';
var PPA_TON_SELECTED_WALLET='';
var PPA_TON_CHAIN_BALANCE=null;
var PPA_TON_BALANCE_TIMER=0;
var PPA_TON_PICKER=null;

function ppaWaitTonSdk(){
  if(window.TON_CONNECT_UI&&typeof window.TON_CONNECT_UI.TonConnectUI==='function')return Promise.resolve(true);
  if(PPA_TON_LOADING)return PPA_TON_LOADING;
  PPA_TON_LOADING=new Promise(function(resolve,reject){
    var n=0,t=setInterval(function(){
      n++;
      if(window.TON_CONNECT_UI&&typeof window.TON_CONNECT_UI.TonConnectUI==='function'){
        clearInterval(t);resolve(true);return;
      }
      if(n>=60){
        clearInterval(t);PPA_TON_LOADING=null;reject(new Error('TON Connect SDK не загрузился'));
      }
    },50);
  });
  return PPA_TON_LOADING;
}

async function ppaRefreshTonBalance(address){
  address=String(address||'').trim();
  if(!address)return null;
  try{
    var r=await fetch('/api/ton-balance?address='+encodeURIComponent(address),{cache:'no-store',credentials:'same-origin'});
    var d=await r.json();
    if(!r.ok||!d||d.ok!==true)throw new Error((d&&d.message)||('HTTP '+r.status));
    var bal=Number(d.balance);
    if(!Number.isFinite(bal)||bal<0)throw new Error('Некорректный баланс');
    PPA_TON_CHAIN_BALANCE=bal;
    try{var p=gramWalletProfile();p.walletGram=bal;p.updatedAt=Date.now()}catch(_){}
    try{sendGramWalletState()}catch(_){}
    return bal;
  }catch(err){
    console.warn('PPA TON balance:',err);
    return null;
  }
}

function ppaStartTonBalance(address){
  clearInterval(PPA_TON_BALANCE_TIMER);
  ppaRefreshTonBalance(address);
  PPA_TON_BALANCE_TIMER=setInterval(function(){
    if(PPA_TON_CONNECTED)ppaRefreshTonBalance(address);
  },15000);
}

async function ppaTonInit(){
  if(PPA_TON_UI)return PPA_TON_UI;
  try{
    await ppaWaitTonSdk();
    ppaEnsureTonButtonRoot();
    var ui=new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl:location.origin+'/tonconnect-manifest.json',
      buttonRootId:'ppaTonConnectButtonRoot',
      analytics:{mode:'off'}
    });
    ui.uiOptions={
      language:'ru',
      uiPreferences:{theme:'DARK'},
      // TON Connect requires twaReturnUrl at the TOP LEVEL for Telegram Mini Apps.
      // The SDK then chooses the correct return strategy/deep-link itself.
      twaReturnUrl:window.PPA_TWA_RETURN_URL,
      actionsConfiguration:{
        returnStrategy:'back'
      }
    };
    PPA_TON_UI=ui;
    ui.onStatusChange(function(wallet){
      try{
        if(wallet&&wallet.account&&wallet.account.address){
          var names={tonhub:'Tonhub',tonkeeper:'Keeper',mytonwallet:'My Wallet'};
          PPA_TON_CONNECTED=true;
          PPA_TON_WALLET_NAME=names[PPA_TON_SELECTED_WALLET]||String((wallet.device&&wallet.device.appName)||'TON Wallet');
          var address=String(wallet.account.address||'');
          gramWalletLink(address);
          ppaStartTonBalance(address);
          setTimeout(function(){gramWalletResult(true,'TON Connect подключён · '+PPA_TON_WALLET_NAME)},300);
        }else{
          PPA_TON_CONNECTED=false;
          PPA_TON_WALLET_NAME='';
          PPA_TON_CHAIN_BALANCE=null;
          clearInterval(PPA_TON_BALANCE_TIMER);
          PPA_TON_BALANCE_TIMER=0;
          try{var p=gramWalletProfile();p.walletGram=null;sendGramWalletState()}catch(_){}
        }
      }catch(err){gramWalletResult(false,'TON Connect: '+String(err&&err.message||err||'ошибка подключения'))}
    },function(err){gramWalletResult(false,'TON Connect: '+String(err&&err.message||err||'ошибка подключения'))});
    try{await ui.connectionRestored}catch(_){}
    return ui;
  }catch(err){
    gramWalletResult(false,'TON Connect не запустился: '+String(err&&err.message||err||'неизвестно'));
    return null;
  }
}

function ppaEnsureTonButtonRoot(){
  var root=document.getElementById('ppaTonConnectButtonRoot');
  if(root)return root;
  root=document.createElement('div');
  root.id='ppaTonConnectButtonRoot';
  // Keep the official TON Connect button mounted in the parent document.
  // PPA's existing wallet button opens the same official SDK modal.
  root.style.cssText='position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;pointer-events:none';
  document.body.appendChild(root);
  return root;
}

async function ppaShowTonWalletPicker(){
  var tg=gramWalletTelegramUser();
  if(!tg.id){gramWalletResult(false,'Откройте PPA через Telegram-бота');return}
  try{
    var ui=PPA_TON_UI||await ppaTonInit();
    if(!ui){gramWalletResult(false,'TON Connect не запустился');return}
    if(ui.connected&&ui.account&&ui.account.address){
      PPA_TON_CONNECTED=true;
      gramWalletLink(String(ui.account.address));
      gramWalletResult(true,'TON Connect уже подключён');
      return;
    }
    gramWalletResult(false,'Открываю TON Connect…');
    // Official TON Connect wallet modal. No hand-written wallet links,
    // no connector.connect(), no Telegram.WebApp.openLink().
    await ui.openModal();
  }catch(err){
    var msg=String(err&&err.message||err||'неизвестно');
    if(/user rejects|user declined|action declined|modal.*closed/i.test(msg)){
      gramWalletResult(false,'Подключение TON Connect отменено');
      return;
    }
    gramWalletResult(false,'TON Connect: '+msg);
  }
}

async function ppaTonDisconnectAndUnlink(){
  try{if(PPA_TON_UI&&PPA_TON_UI.connected)await PPA_TON_UI.disconnect()}catch(_){}
  gramWalletUnlink();
}

function ppaPreinitTonConnect(){
  ppaEnsureTonButtonRoot();
  ppaTonInit();
}
if(document.readyState==='complete')setTimeout(ppaPreinitTonConnect,0);
else window.addEventListener('load',function(){setTimeout(ppaPreinitTonConnect,0)},{once:true});

function gramWalletLink(address){`
);

// Route the old iframe "ПРИВЯЗАТЬ" button to the parent picker.
// Correct helper syntax is $('link'), not $('#link').
ppaPatchRegex(
  'gram wallet link opens parent ton picker',
  /\$\(&#x27;link&#x27;\)\.onclick=\(\)=&gt;openModal\(&#x27;link&#x27;\);/,
  ppaEscapeSrcdocCode("$('link').onclick=()=>parent.postMessage({type:'gramWalletShowTonPicker'},'*');")
);

// Keep deposit/withdraw old modal intact; add parent picker routing and TON disconnect.
ppaPatchRegex(
  'gram wallet parent ton routes',
  /if\(d\.type==='gramWalletReady'\|\|d\.type==='gramWalletRequestState'\)sendGramWalletState\(\);else if\(d\.type==='gramWalletClose'\)closeGramWallet\(\);else if\(d\.type==='gramWalletLink'\)gramWalletLink\(d\.address\);else if\(d\.type==='gramWalletUnlink'\)gramWalletUnlink\(\);/,
  "if(d.type==='gramWalletReady'||d.type==='gramWalletRequestState')sendGramWalletState();else if(d.type==='gramWalletClose')closeGramWallet();else if(d.type==='gramWalletShowTonPicker')ppaShowTonWalletPicker();else if(d.type==='gramWalletLink')gramWalletLink(d.address);else if(d.type==='gramWalletUnlink')ppaTonDisconnectAndUnlink();"
);

// Always surface the latest on-chain balance in the existing wallet iframe.
ppaPatchRegex(
  'gram wallet uses live ton chain balance',
  /function sendGramWalletState\(\)\{\s*if\(!GRAM_WALLET_OPEN\)return;\s*try\{\s*var p=gramWalletProfile\(\),tg=gramWalletTelegramUser\(\);/,
  "function sendGramWalletState(){\n  if(!GRAM_WALLET_OPEN)return;\n  try{\n    var p=gramWalletProfile(),tg=gramWalletTelegramUser();\n    if(typeof PPA_TON_CHAIN_BALANCE==='number'&&Number.isFinite(PPA_TON_CHAIN_BALANCE))p.walletGram=PPA_TON_CHAIN_BALANCE;"
);

// Do not call the old server deposit stub when there is no active TON Connect session.
ppaPatchRegex(
  'gram deposit requires active direct ton connect',
  /if\(!p\.connected\|\|!p\.address\)\{gramWalletResult\(false,'Сначала привяжи Gram Wallet'\);return\}\n  if\(!\(amount>0\)\)/,
  "if(!p.connected||!p.address){gramWalletResult(false,'Сначала привяжи TON Wallet');return}\n  if(kind==='deposit'&&typeof PPA_TON_CONNECTED!=='undefined'&&!PPA_TON_CONNECTED){gramWalletResult(false,'TON адрес привязан, но TON Connect не активен · нажми ПЕРЕПРИВЯЗАТЬ');return}\n  if(kind==='deposit'&&amount<1){gramWalletResult(false,'Минимальное пополнение — 1 Gram (1 TON)');return}\n  if(kind==='withdraw'&&amount<15){gramWalletResult(false,'Минимальный вывод — 15 Gram (15 TON)');return}\n  if(!(amount>0))"
);

if(!output.includes('data-ppa-tonconnect="1"') ||
   !output.includes("buttonRootId:'ppaTonConnectButtonRoot'") ||
   !output.includes("twaReturnUrl:window.PPA_TWA_RETURN_URL") ||
   !output.includes("await ui.openModal()") ||
   !output.includes("gramWalletShowTonPicker") ||
   !output.includes("Минимальное пополнение — 1 Gram (1 TON)") ||
   !output.includes("Минимальный вывод — 15 Gram (15 TON)") ||
   !output.includes("fetch('/api/ton-balance?address='") ||
   !output.includes(ppaEscapeSrcdocCode("type:'gramWalletShowTonPicker'"))) {
  throw new Error('Official TON Connect UI flow did not apply');
}
/* ======================================================================== */

/* === CLASS RANGE CONSISTENCY ============================================ */
/* Use the older, tighter ranged values for BOTH player and AI. */
ppaPatchRegex(
  'player gnome range old value',
  /name:'Гном-канонир',type:'Дальний бой',attackMode:'cannon',[\s\S]*?range:360,crit:/,
  (m)=>m.replace('range:360,crit:','range:265,crit:')
);
ppaPatchRegex(
  'player archer range old value',
  /name:'Лучник',type:'Дальний бой',attackMode:'ranged',[\s\S]*?range:420,crit:/,
  (m)=>m.replace('range:420,crit:','range:330,crit:')
);
ppaPatchRegex(
  'player mage range old value',
  /name:'Маг',type:'Дальний бой',attackMode:'magic',[\s\S]*?range:390,crit:/,
  (m)=>m.replace('range:390,crit:','range:300,crit:')
);
ppaPatchRegex(
  'player priest range old value',
  /name:'Жрец',type:'Поддержка',attackMode:'ranged',[\s\S]*?range:330,crit:/,
  (m)=>m.replace('range:330,crit:','range:255,crit:')
);

/* Keep AI/training on its original values: gnome 265, archer 330, mage 300, priest 255. */

/* Pet loot magnet: larger collection radius, same final pickup threshold. */
ppaPatchRegex(
  'pet loot magnet radius',
  /_petEquipped&&_petDist<180&&_petDist>24/g,
  "_petEquipped&&_petDist<300&&_petDist>24",
  true
);

/* ======================================================================== */

/* === TEMP QA: ALL DUNGEONS OPEN ========================================== */
// Temporary tester switch. Remove after boss QA.
ppaPatchRegex(
  'temporary unlock dungeon functions',
  /function\s+dungeon1Unlocked\(\)\s*\{[\s\S]*?\}\s*function\s+dungeon21Unlocked\(\)\s*\{[\s\S]*?\}\s*function\s+dungeon41Unlocked\(\)\s*\{[\s\S]*?\}/,
  "function dungeon1Unlocked(){if(window.PPA_TEST_ALL_DUNGEONS===true)return true;const lv=Math.floor(Number(P&&P.lvl)||1);return lv>=1&&lv<=20;}"+
  "function dungeon21Unlocked(){if(window.PPA_TEST_ALL_DUNGEONS===true)return true;const lv=Math.floor(Number(P&&P.lvl)||1);return lv>=21&&lv<=40;}"+
  "function dungeon41Unlocked(){if(window.PPA_TEST_ALL_DUNGEONS===true)return true;const lv=Math.floor(Number(P&&P.lvl)||1);return lv>=DUNGEON41_LEVEL_REQ&&lv<=DUNGEON41_LEVEL_MAX;}"
);

ppaPatchRegex(
  'temporary unlock dungeon gate status',
  /const\s+ok1=dungeon1Unlocked\(\),ok21=dungeon21Unlocked\(\),ok41=dungeon41Unlocked\(\);/,
  "const ok1=true,ok21=true,ok41=true;"
);

ppaPatchRegex(
  'temporary unlock dungeon 1 click',
  /if\(!dungeon1Unlocked\(\)\)\{updateDungeonGateMenu\(\);return\}/,
  "if(window.PPA_TEST_ALL_DUNGEONS!==true&&!dungeon1Unlocked()){updateDungeonGateMenu();return}"
);
ppaPatchRegex(
  'temporary unlock dungeon 21 click',
  /if\(!dungeon21Unlocked\(\)\)\{updateDungeonGateMenu\(\);return\}/,
  "if(window.PPA_TEST_ALL_DUNGEONS!==true&&!dungeon21Unlocked()){updateDungeonGateMenu();return}"
);
ppaPatchRegex(
  'temporary unlock dungeon 41 click',
  /if\(!dungeon41Unlocked\(\)\)\{updateDungeonGateMenu\(\);return\}/,
  "if(window.PPA_TEST_ALL_DUNGEONS!==true&&!dungeon41Unlocked()){updateDungeonGateMenu();return}"
);

ppaPatchRegex(
  'temporary unlock hard scene gate',
  /if\(!allowed\)\{\s*showPickup\('Подземелье недоступно для текущего уровня','#ff9b72'\);\s*return;\s*\}/,
  "if(window.PPA_TEST_ALL_DUNGEONS!==true&&!allowed){showPickup('Подземелье недоступно для текущего уровня','#ff9b72');return;}"
);

ppaPatchRegex(
  'temporary dungeon test status text',
  /st\.textContent='Твой уровень: '\+lv\+' · доступные диапазоны отмечены выше\.';/,
  "st.textContent='ТЕСТ · ограничения по уровню временно отключены · ур. '+lv;"
);

/* ======================================================================== */

// QA mode must never silently miss the release gates: fail the build instead.
if (!output.includes("const ok1=true,ok21=true,ok41=true;")) {
  throw new Error('QA dungeon menu unlock patch did not apply');
}
if (!output.includes("window.PPA_TEST_ALL_DUNGEONS!==true&&!allowed")) {
  throw new Error('QA hard dungeon scene gate patch did not apply');
}

/* === V335 AUCTION PREMIUM ART ============================================ */
ppaPatchRegex(
  'auction keep inventory art',
  /items:auctionItemsForUi\(\)\.map\(auctionAttachMinPrices\)\.map\(function\(x\)\{var y=Object\.assign\(\{\},x\);delete y\.img;delete y\.cardArt;delete y\.iconArt;return y\}\),/,
  "items:auctionItemsForUi().map(auctionAttachMinPrices).map(auctionRestoreUiArt),"
);

ppaPatchRegex(
  'auction keep own lot art',
  /lots:\(INV\.auctionLots\|\|\[\]\)\.map\(auctionLotForUi\)\.map\(function\(l\)\{if\(l&&l\.item\)\{l=Object\.assign\(\{\},l,\{item:Object\.assign\(\{\},l\.item\)\}\);delete l\.item\.img;\}return l\}\),/,
  "lots:(INV.auctionLots||[]).map(auctionLotForUi).map(auctionRestoreLotArt),"
);

ppaPatchRegex(
  'auction art hydration helper',
  /function\s+sendAuctionState\(\)\s*\{/,
  `function auctionCanonicalLegendaryArt(it){
  if(!it||typeof it!=='object')return '';
  var rarity=String(it.rarity||it.quality||it.grade||it.r||'').trim().toLowerCase();
  if(!(rarity==='legendary'||rarity==='legend'||rarity==='orange'||rarity==='gold'||rarity==='4'||rarity==='5'||/легендар|оранж/.test(rarity)||/легендар|legendary/.test(String((it.name||'')+' '+(it.title||'')).toLowerCase())))return '';
  var explicitSlot=String(it.slot||it.equipSlot||'').trim().toLowerCase();
  if(/^(ring|necklace|amulet|кольцо|ожерелье|амулет)$/.test(explicitSlot))return '';
  var slot=String(it.slot||it.equipSlot||it.type||'').trim().toLowerCase();
  var slotAlias={pants:'legs',leggings:'legs',leg:'legs','поножи':'legs',helm:'helmet',head:'helmet','шлем':'helmet',chest:'armor',body:'armor','броня':'armor',glove:'gloves',hands:'gloves','перчатки':'gloves',boot:'boots',feet:'boots','сапоги':'boots','оружие':'weapon'};
  slot=slotAlias[slot]||slot;
  if(!/^(weapon|helmet|armor|legs|gloves|boots)$/.test(slot)){
    var slotText=String((it.name||'')+' '+(it.title||'')).toLowerCase();
    if(/шлем|helm|helmet/.test(slotText))slot='helmet';
    else if(/брон|доспех|кирас|armor|chest/.test(slotText))slot='armor';
    else if(/понож|штаны|брюки|legs|pants|leggings/.test(slotText))slot='legs';
    else if(/перчат|рукавиц|glove|hands/.test(slotText))slot='gloves';
    else if(/сапог|ботин|boots|feet/.test(slotText))slot='boots';
    else if(/оруж|меч|клинок|кинжал|топор|лук|арбалет|посох|жезл|пушк|мушкет|молот|булав|weapon|sword|dagger|axe|bow|staff|cannon|gun/.test(slotText))slot='weapon';
    else return '';
  }
  var aliases={tank:'tank',warrior:'tank','воин':'tank','танк':'tank',paladin:'paladin','паладин':'paladin',barbarian:'barbarian',berserk:'barbarian',berserker:'barbarian','варвар':'barbarian','берсерк':'barbarian','берсеркер':'barbarian',assassin:'assassin','ассасин':'assassin','асасин':'assassin',gnome:'gnome',gunner:'gnome',cannoner:'gnome','канонир':'gnome','гном':'gnome','гном-канонир':'gnome',archer:'archer','лучник':'archer',mage:'mage','маг':'mage',priest:'priest',cleric:'priest',healer:'priest','жрец':'priest','клирик':'priest'};
  function a(v){return aliases[String(v==null?'':v).trim().toLowerCase()]||''}
  var vals=[it.classKey,it.classId,it.class,it.cls,it.ownerClass,it.reqClass,it.className,it.profession,it.job],cls='';
  for(var i=0;i<vals.length&&!cls;i++)cls=a(vals[i]);
  if(!cls){
    var text=String((it.name||'')+' '+(it.className||'')+' '+(it.desc||'')+' '+(it.reqClass||'')).toLowerCase();
    var tests=[['paladin',/паладин|paladin/],['barbarian',/берсерк|берсеркер|варвар|barbarian|berserk/],['assassin',/ассасин|асасин|assassin/],['gnome',/гном|канонир|gnome|gunner|cannoner/],['archer',/лучник|archer/],['mage',/маг|mage/],['priest',/жрец|клирик|priest|cleric|healer/],['tank',/танк|воин|tank|warrior/]];
    for(var j=0;j<tests.length&&!cls;j++)if(tests[j][1].test(text))cls=tests[j][0];
  }
  if(!cls){
    try{cls=a(P&&(P.classKey||P.classId||P.class||P.cls||P.className||P.profession||P.job))}catch(_){}
  }
  return cls?('/assets/legendary/'+cls+'-'+slot+'.webp?v=v514'):'';
}
function auctionSourceInventoryItem(it){
  try{
    if(!it||typeof it!=='object'||typeof INV==='undefined'||!INV||!Array.isArray(INV.bag))return it;
    var ref=it.ref;
    var n=Number(ref);
    if(Number.isFinite(n)&&n>=0&&n<INV.bag.length&&INV.bag[n])return INV.bag[n];
    var uid=String(it.uid||it.itemUid||it.itemId||'');
    var rid=String(it.refId||it.id||'');
    for(var i=0;i<INV.bag.length;i++){
      var x=INV.bag[i];
      if(!x)continue;
      if(uid&&String(x.uid||x.itemUid||x.itemId||'')===uid)return x;
      if(rid&&String(x.refId||x.id||'')===rid)return x;
    }
  }catch(_){}
  return it;
}
function auctionRestoreUiArt(it){
  if(!it||typeof it!=='object')return it;
  try{
    var srcItem=auctionSourceInventoryItem(it);
    var _ppaLegendArt='';
    if(srcItem&&String(srcItem.img||'').indexOf('/assets/legendary/')>=0)_ppaLegendArt=String(srcItem.img);
    if(!_ppaLegendArt&&window.PPA_LEGENDARY_GEAR_ITEM_ART)_ppaLegendArt=window.PPA_LEGENDARY_GEAR_ITEM_ART(srcItem||it);
    if(!_ppaLegendArt)_ppaLegendArt=auctionCanonicalLegendaryArt(srcItem||it);
    if(_ppaLegendArt){
      it.img=_ppaLegendArt;
      it.image=_ppaLegendArt;
      it.art=_ppaLegendArt;
      it.cardArt=_ppaLegendArt;
      it.iconArt=_ppaLegendArt;
      it.iconImg=_ppaLegendArt;
      it.src=_ppaLegendArt;
      it.ppaLegendaryReferenceArt=true;
      return it
    }
  }catch(_){}
  if(it.img)return it;
  try{
    if(it.kind==='consumable'){
      var cm=auctionConsumableMeta().find(function(v){return v&&String(v[0])===String(it.refId||'')});
      if(cm)it.img=cm[3]||'';
    }else if(it.kind==='stone'){
      var sm={normal:PPA_V172_ART.normalStone,premium:PPA_V172_ART.premiumStone,rune:PPA_V172_ART.premiumRune};
      it.img=sm[it.refId]||'';
    }else if(it.kind==='feather'&&it.refId==='phoenix'){
      it.img=PPA_V172_ART.feather||'';
    }else if(it.kind==='grimoire'&&it.refId){
      var ga=GRIMOIRE_ART[it.refId]||{};it.img=ga.card||ga.icon||'';
    }
  }catch(_){}
  return it;
}
function auctionRestoreLotArt(l){
  if(!l||typeof l!=='object')return l;
  try{
    var c=Object.assign({},l);
    if(c.item)c.item=auctionRestoreUiArt(Object.assign({},c.item));
    return c;
  }catch(_){return l}
}
function sendAuctionState(){`
);

ppaPatchRegex(
  'auction hydrate server market art',
  /marketLots:\(PPA_AUCTION_MARKET_CACHE\|\|\[\]\)\.slice\(0,100\),/,
  "marketLots:(PPA_AUCTION_MARKET_CACHE||[]).slice(0,100).map(auctionRestoreLotArt),"
);

if(!output.includes("function auctionCanonicalLegendaryArt(it)") ||
   !output.includes("function auctionSourceInventoryItem(it)") ||
   !output.includes("srcItem&&String(srcItem.img||'').indexOf('/assets/legendary/')>=0") ||
   !output.includes("/assets/legendary/'+cls+'-'+slot+'.webp?v=v514") ||
   !output.includes("items:auctionItemsForUi().map(auctionAttachMinPrices).map(auctionRestoreUiArt)") ||
   !output.includes("marketLots:(PPA_AUCTION_MARKET_CACHE||[]).slice(0,100).map(auctionRestoreLotArt)")) {
  throw new Error('Auction canonical legendary art path incomplete');
}

/* ======================================================================== */

ppaPatchRegex(
  'gnome realtime cannon visual',
  /PLAYER_CANNONBALLS\.push\(\{\s*x:muzzleX,\s*y:muzzleY,\s*vx:dx\/dist\*speed,\s*vy:dy\/dist\*speed,\s*remaining:dist,\s*target:target\s*\}\);/,
  `PLAYER_CANNONBALLS.push({
    x:muzzleX,
    y:muzzleY,
    vx:dx/dist*speed,
    vy:dy/dist*speed,
    remaining:dist,
    target:target
  });
  if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX({
    kind:'gnome-cannon',x:muzzleX,y:muzzleY,tx:target.x,ty:target.y,ang:ang,animMs:480
  });`
);

ppaPatchRegex(
  'archer realtime arrow visual',
  /PLAYER_ARROWS\.push\(\{\s*x:startX,y:startY,\s*vx:Math\.cos\(ang\)\*speed,\s*vy:Math\.sin\(ang\)\*speed,\s*remaining:dist,\s*target:target,\s*ang:ang\s*\}\);/,
  `PLAYER_ARROWS.push({
    x:startX,y:startY,
    vx:Math.cos(ang)*speed,
    vy:Math.sin(ang)*speed,
    remaining:dist,
    target:target,
    ang:ang
  });
  if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX({
    kind:'archer-arrow',x:startX,y:startY,tx:target.x,ty:target.y,ang:ang,animMs:430
  });`
);

if (!output.includes("kind:'gnome-cannon'")) throw new Error('Gnome realtime cannon visual patch did not apply');
if (!output.includes("kind:'archer-arrow'")) throw new Error('Archer realtime arrow visual patch did not apply');

/* === MONSTER CORE DUNGEON DROP ========================================= */
ppaPatchRegex(
  'monster core helper runtime',
  /function\s+basicAttackRoll\(target\)\s*\{/,
  `const PPA_MONSTER_CORE_CHANCE=0.06;
const PPA_MONSTER_CORE_SELL_GOLD=180;
const PPA_MONSTER_CORE_IMG='data:image/png;base64,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';
window.PPA_MONSTER_CORE_IMG=PPA_MONSTER_CORE_IMG;
function ppaMonsterCoreBagItem(){
  return (INV.bag||[]).find(function(it){return it&&it.monsterCore===true})||null;
}
function ppaMakeMonsterCore(count){
  const n=Math.max(1,Math.floor(Number(count)||1));
  return {
    uid:'monster_core',
    name:'Ядро монстра',
    kind:'resource',
    rarity:'rare',
    icon:'◉',ic:'◉',
    img:PPA_MONSTER_CORE_IMG,
    count:n,qty:n,amount:n,
    stackable:true,
    sell:PPA_MONSTER_CORE_SELL_GOLD,
    sellPrice:PPA_MONSTER_CORE_SELL_GOLD,
    vendorPrice:PPA_MONSTER_CORE_SELL_GOLD,
    goldValue:PPA_MONSTER_CORE_SELL_GOLD,
    refId:'monster_core',
    stats:{},
    bonusText:'Редкое ядро из монстров подземелий · продажа 180 золота.',
    monsterCore:true
  };
}
function ppaGiveMonsterCore(amount){
  amount=Math.max(1,Math.floor(Number(amount)||1));
  if(!Array.isArray(INV.bag))INV.bag=[];
  let it=ppaMonsterCoreBagItem();
  if(!it){
    if(INV.bag.length>=100){
      try{showPickup('Сумка полна · Ядро монстра не помещается','#b984ff')}catch(_){}
      return 0;
    }
    it=ppaMakeMonsterCore(amount);
    INV.bag.push(it);
  }else{
    const n=Math.max(0,Math.floor(Number(it.count||it.qty||it.amount)||0))+amount;
    it.count=n;it.qty=n;it.amount=n;
    it.img=PPA_MONSTER_CORE_IMG;
    it.sell=PPA_MONSTER_CORE_SELL_GOLD;
    it.sellPrice=PPA_MONSTER_CORE_SELL_GOLD;
    it.vendorPrice=PPA_MONSTER_CORE_SELL_GOLD;
    it.goldValue=PPA_MONSTER_CORE_SELL_GOLD;
  }
  try{saveGame();sendInvState();sendBlacksmithState();updateUI()}catch(_){}
  try{showPickup('Ядро монстра +'+amount,'#b984ff')}catch(_){}
  return amount;
}
function ppaTryMonsterCore(e){
  if(!e||e.__ppaMonsterCoreRolled)return 0;
  e.__ppaMonsterCoreRolled=true;
  if(!P||P.scene!=='dungeon')return 0;
  if(e.isFartGuard||e.isClanBoss||e.isWorldCrystalBoss||e.isClanSiegeCrystal||e.isAiFighter||e.__ppaArenaPlayer)return 0;
  const _ppaCoreChance=e&&e.isDungeonElite?0.08:PPA_MONSTER_CORE_CHANCE;
  if(Math.random()>=_ppaCoreChance)return 0;
  return ppaGiveMonsterCore(1);
}
function basicAttackRoll(target){`
);

ppaPatchRegex(
  'monster core resource popup price',
  /function\s+openResourcePopup\(it\)\s*\{/,
  `function openResourcePopup(it){
  if(it&&it.monsterCore===true){
    it.img=it.img||PPA_MONSTER_CORE_IMG;
    it.sell=PPA_MONSTER_CORE_SELL_GOLD;
    it.sellPrice=PPA_MONSTER_CORE_SELL_GOLD;
    it.vendorPrice=PPA_MONSTER_CORE_SELL_GOLD;
    it.goldValue=PPA_MONSTER_CORE_SELL_GOLD;
  }`
);

ppaPatchRegex(
  'shared mob reward',
  /P\.kil\s*\+\+\s*;\s*P\.xp\s*\+=\s*e\.xp\s*;/g,
  "if(!window.PPA_MOB_REWARD_ELIGIBLE||window.PPA_MOB_REWARD_ELIGIBLE(e)){P.kil++;P.xp+=e.xp;if(typeof ppaTryMonsterCore==='function')ppaTryMonsterCore(e);}",
  true
);

if(!output.includes("const PPA_MONSTER_CORE_CHANCE=0.06") ||
   !output.includes("const PPA_MONSTER_CORE_SELL_GOLD=180") ||
   !output.includes("function ppaTryMonsterCore(e)") ||
   !output.includes("monsterCore:true") ||
   !output.includes("ppaTryMonsterCore(e)")) {
  throw new Error('Monster Core dungeon drop patch did not apply');
}
/* ======================================================================== */

ppaPatchRegex(
  'basic shared mob hit',
  /const\s+r\s*=\s*basicAttackRoll\(target\)\s*;\s*target\.hp\s*-=\s*r\.damage\s*;\s*target\.flash\s*=\s*7\s*;\s*target\.aggro\s*=\s*true\s*;/,
  `const r=basicAttackRoll(target);
  const _ppaServerHit=window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(target,r.damage,{kind:'basic',range:playerBasicRange()});
  if(!_ppaServerHit)target.hp-=r.damage;
  target.flash=7;target.aggro=true;`
);

ppaPatchRegex(
  'tank taunt authoritative target',
  /around\(P\.x,P\.y,240\)\.forEach\(e=>\{e\.aggro=true\}\);/,
  "around(P.x,P.y,240).forEach(e=>{e.aggro=true;if(window.PPA_MOB_EVENT_TAUNT)window.PPA_MOB_EVENT_TAUNT(e,3000)});"
);

ppaPatchRegex(
  'assassin smoke v189 fixed 3 seconds',
  /P\.smokeUntil=Date\.now\(\)\+rv\(\[4,5,6\],rank\)\*1000;P\.smokeDodgeBonus=rv\(\[35,45,55\],rank\);/,
  "P.smokeUntil=Date.now()+3000;P.smokeDodgeBonus=rv([35,45,55],rank);if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(3000);"
);

ppaPatchRegex(
  'assassin smoke legacy fixed 3 seconds',
  /var\s+dur=\[0,4,5,6\]\[rank\];\s*var\s+dodge=\[0,35,45,55\]\[rank\];/,
  "var dur=3;\n    var dodge=[0,35,45,55][rank];"
);

ppaPatchRegex(
  'assassin smoke legacy realtime sync',
  /P\.smokeUntil=Date\.now\(\)\+dur\*1000;\s*P\.smokeDodgeBonus=dodge;/,
  "P.smokeUntil=Date.now()+dur*1000;\n    P.smokeDodgeBonus=dodge;\n    if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(3000);"
);

ppaPatchRegex(
  'assassin smoke active meta 3 seconds',
  /assa_smoke_screen:\{mp:12,cd:\[22,20,18\],p:\['Дым 4с · обычные мобы и ИИ теряют цель · уворот \+35% · боссы видят дым · мана 12%','Дым 5с · обычные мобы и ИИ теряют цель · уворот \+45% · боссы видят дым · мана 12%','Дым 6с · обычные мобы и ИИ теряют цель · уворот \+55% · боссы видят дым · мана 12%'\]\}/,
  "assa_smoke_screen:{mp:12,cd:[22,20,18],p:['Дым 3с · враги теряют цель · уворот +35% · мана 12%','Дым 3с · враги теряют цель · уворот +45% · мана 12%','Дым 3с · враги теряют цель · уворот +55% · мана 12%']}"
);

ppaPatchRegex(
  'assassin old preview 3 seconds',
  /'Дымовая завеса на 4с · уклонение \+35% · сбрасывает агро обычных мобов · мана 6 · откат 22с\.',\s*'Дымовая завеса на 5с · уклонение \+45% · сбрасывает агро обычных мобов · мана 6 · откат 20с\.',\s*'Дымовая завеса на 6с · уклонение \+55% · сбрасывает агро обычных мобов · мана 6 · откат 18с\.'/,
  "'Дымовая завеса на 3с · уклонение +35% · враги теряют цель · мана 6 · откат 22с.',\n    'Дымовая завеса на 3с · уклонение +45% · враги теряют цель · мана 6 · откат 20с.',\n    'Дымовая завеса на 3с · уклонение +55% · враги теряют цель · мана 6 · откат 18с.'"
);

if (!output.includes("window.PPA_MOB_EVENT_TAUNT(e,3000)")) {
  throw new Error('Authoritative taunt skill patch did not apply');
}
if (!output.includes("P.smokeUntil=Date.now()+3000;P.smokeDodgeBonus=rv([35,45,55],rank);if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(3000);")) {
  throw new Error('Assassin smoke realtime patch did not apply');
}

/* === AUTHORITATIVE SKILL DAMAGE / CONTROL ============================== */
ppaPatchRegex(
  'server authoritative v189 skill damage',
  /e\.hp-=dmg;e\.flash=8;e\.aggro=true;P\.lastCombatAt=Date\.now\(\);/,
  "const _ppaArenaDeal=e.__ppaArenaPlayer&&window.PPA_ARENA_SKILL_HIT&&window.PPA_ARENA_SKILL_HIT(e,dmg,crit,700,type||'physical');\n    const _ppaMobDeal=!_ppaArenaDeal&&window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(e,dmg);\n    if(!_ppaArenaDeal&&!_ppaMobDeal)e.hp-=dmg;e.flash=8;e.aggro=true;P.lastCombatAt=Date.now();"
);

ppaPatchRegex(
  'server authoritative root effect',
  /function\s+root\(e,ms\)\{if\(e&&!e\.isBoss\)e\.v189RootUntil=Math\.max\(e\.v189RootUntil\|\|0,Date\.now\(\)\+ms\)\}/,
  "function root(e,ms){if(e&&!e.isBoss){e.v189RootUntil=Math.max(e.v189RootUntil||0,Date.now()+ms);if(e.__ppaArenaPlayer){if(window.PPA_ARENA_PLAYER_CONTROL)window.PPA_ARENA_PLAYER_CONTROL(e,'root',0,ms,700)}else if(window.PPA_MOB_EVENT_CONTROL)window.PPA_MOB_EVENT_CONTROL(e,'root',0,ms)}}"
);

ppaPatchRegex(
  'server authoritative slow effect',
  /function\s+slow\(e,mul,ms\)\{if\(e&&!e\.isBoss\)\{e\.v189SlowMul=Math\.max\(\.25,Math\.min\(\.95,mul\)\);e\.v189SlowUntil=Math\.max\(e\.v189SlowUntil\|\|0,Date\.now\(\)\+ms\)\}\}/,
  "function slow(e,mul,ms){if(e&&!e.isBoss){e.v189SlowMul=Math.max(.25,Math.min(.95,mul));e.v189SlowUntil=Math.max(e.v189SlowUntil||0,Date.now()+ms);if(e.__ppaArenaPlayer){if(window.PPA_ARENA_PLAYER_CONTROL)window.PPA_ARENA_PLAYER_CONTROL(e,'slow',mul,ms,700)}else if(window.PPA_MOB_EVENT_CONTROL)window.PPA_MOB_EVENT_CONTROL(e,'slow',mul,ms)}}"
);

if (!output.includes("const _ppaArenaDeal=e.__ppaArenaPlayer") ||
    !output.includes("const _ppaMobDeal=!_ppaArenaDeal&&window.PPA_MOB_EVENT_DAMAGE")) {
  throw new Error('Arena/server V189 skill damage patch did not apply');
}
if (!output.includes("window.PPA_MOB_EVENT_CONTROL(e,'slow',mul,ms)")) {
  throw new Error('Authoritative slow skill patch did not apply');
}
if (!output.includes("window.PPA_MOB_EVENT_CONTROL(e,'root',0,ms)")) {
  throw new Error('Authoritative root skill patch did not apply');
}

ppaPatchRegex(
  'melee shared mob hit',
  /const\s+realDmg=\(e===tg\)\?dmg:basicAttackRoll\(e\)\.damage;\s*e\.hp-=realDmg;\s*applyPlayerVampirism\(realDmg,1\);/,
  `const realDmg=(e===tg)?dmg:basicAttackRoll(e).damage;
    const _ppaArenaMeleeHit=e.__ppaArenaPlayer&&window.PPA_ARENA_SKILL_HIT&&window.PPA_ARENA_SKILL_HIT(e,realDmg,false,700,'physical');
    const _ppaServerMeleeHit=!_ppaArenaMeleeHit&&window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(e,realDmg,{kind:'basic',range:playerBasicRange()});
    if(!_ppaArenaMeleeHit&&!_ppaServerMeleeHit)e.hp-=realDmg;
    applyPlayerVampirism(realDmg,1);`
);

ppaPatchRegex(
  'melee chain lightning shared mob hit',
  /if\(cn\)\{const chainDmg=Math\.max\(1,Math\.floor\(dmg\*0\.4\*clanDamageMulFor\(cn\)\)-\(cn\.def\|\|0\)\*0\.4\);cn\.hp-=chainDmg;if\(cn\.isClanBoss\)clanBossTrackDamage\(chainDmg\);cn\.flash=6;ch\.push\(cn\);/,
  `if(cn){const chainDmg=Math.max(1,Math.floor(dmg*0.4*clanDamageMulFor(cn))-(cn.def||0)*0.4);
          const _ppaArenaChainHit=cn.__ppaArenaPlayer&&window.PPA_ARENA_SKILL_HIT&&window.PPA_ARENA_SKILL_HIT(cn,chainDmg,false,700,'physical');
          const _ppaServerChainHit=!_ppaArenaChainHit&&window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(cn,chainDmg);
          if(!_ppaArenaChainHit&&!_ppaServerChainHit)cn.hp-=chainDmg;
          if(cn.isClanBoss)clanBossTrackDamage(chainDmg);cn.flash=6;ch.push(cn);`
);

ppaPatchRegex(
  'legacy skill helper shared mob hit',
  /if\(e\.isAiFighter&&typeof v225AiIncomingDamageMul===['"]function['"]\)dmg=Math\.max\(1,Math\.round\(dmg\*v225AiIncomingDamageMul\(e\)\)\);\s*e\.hp-=dmg;\s*applyPlayerVampirism\(dmg,\.6\);/,
  `if(e.isAiFighter&&typeof v225AiIncomingDamageMul==='function')dmg=Math.max(1,Math.round(dmg*v225AiIncomingDamageMul(e)));
  const _ppaArenaLegacySkillHit=e.__ppaArenaPlayer&&window.PPA_ARENA_SKILL_HIT&&window.PPA_ARENA_SKILL_HIT(e,dmg,false,700,'physical');
  const _ppaServerLegacySkillHit=!_ppaArenaLegacySkillHit&&window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(e,dmg);
  if(!_ppaArenaLegacySkillHit&&!_ppaServerLegacySkillHit)e.hp-=dmg;
  applyPlayerVampirism(dmg,.6);`
);

ppaPatchRegex(
  'skill dot shared mob hit',
  /if\(e\.isAiFighter&&typeof v225AiIncomingDamageMul===['"]function['"]\)d=Math\.max\(1,Math\.round\(d\*v225AiIncomingDamageMul\(e\)\)\);\s*e\.hp-=d;e\.flash=4;e\.aggro=true;e\.v189DotNext=now\+1000;/,
  `if(e.isAiFighter&&typeof v225AiIncomingDamageMul==='function')d=Math.max(1,Math.round(d*v225AiIncomingDamageMul(e)));
        const _ppaArenaDotHit=e.__ppaArenaPlayer&&window.PPA_ARENA_SKILL_HIT&&window.PPA_ARENA_SKILL_HIT(e,d,false,700,'dot');
        const _ppaServerDotHit=!_ppaArenaDotHit&&window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(e,d);
        if(!_ppaArenaDotHit&&!_ppaServerDotHit)e.hp-=d;
        e.flash=4;e.aggro=true;e.v189DotNext=now+1000;`
);

if (!output.includes("const _ppaArenaMeleeHit=e.__ppaArenaPlayer") ||
    !output.includes("window.PPA_MOB_EVENT_DAMAGE(e,realDmg,{kind:'basic',range:playerBasicRange()})")) {
  throw new Error('Arena/melee authoritative damage patch did not apply');
}
if (!output.includes("const _ppaArenaLegacySkillHit=e.__ppaArenaPlayer") ||
    !output.includes("const _ppaServerLegacySkillHit=!_ppaArenaLegacySkillHit&&window.PPA_MOB_EVENT_DAMAGE")) {
  throw new Error('Arena/legacy skill authoritative damage patch did not apply');
}
if (!output.includes("const _ppaArenaDotHit=e.__ppaArenaPlayer") ||
    !output.includes("const _ppaServerDotHit=!_ppaArenaDotHit&&window.PPA_MOB_EVENT_DAMAGE")) {
  throw new Error('Arena/DoT authoritative damage patch did not apply');
}

ppaPatchRegex(
  'skill shared mob hit',
  /if\s*\(e\.isAiFighter&&typeof\s+v225AiIncomingDamageMul===['"]function['"]\)\s*dmg\s*=\s*Math\.max\(1,Math\.round\(dmg\*v225AiIncomingDamageMul\(e\)\)\)\s*;\s*e\.hp\s*-=\s*dmg\s*;\s*applyPlayerVampirism\(dmg,\s*\.6\)\s*;/,
  `if(e.isAiFighter&&typeof v225AiIncomingDamageMul==='function')dmg=Math.max(1,Math.round(dmg*v225AiIncomingDamageMul(e)));
  const _ppaArenaSkillHit=e.__ppaArenaPlayer&&window.PPA_ARENA_SKILL_HIT&&window.PPA_ARENA_SKILL_HIT(e,dmg,false,700,'physical');
  const _ppaServerSkillHit=!_ppaArenaSkillHit&&window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(e,dmg);
  if(!_ppaArenaSkillHit&&!_ppaServerSkillHit)e.hp-=dmg;
  applyPlayerVampirism(dmg,.6);`
);

ppaPatchRegex(
  'ranged shared mob hit',
  /const\s+raw\s*=\s*Math\.max\(1,Math\.floor\(P\.atk\|\|12\)-\(t\.def\|\|0\)\)\s*;\s*t\.hp\s*=\s*Math\.max\(0,t\.hp-raw\)\s*;\s*t\.flash\s*=\s*6\s*;\s*t\.aggro\s*=\s*true\s*;/g,
  `const raw=Math.max(1,Math.floor(P.atk||12)-(t.def||0));
          const _ppaArenaRangeHit=t.__ppaArenaPlayer&&window.PPA_ARENA_SKILL_HIT&&window.PPA_ARENA_SKILL_HIT(t,raw,false,700,'physical');
          const _ppaServerRangeHit=!_ppaArenaRangeHit&&window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(t,raw);
          if(!_ppaArenaRangeHit&&!_ppaServerRangeHit)t.hp=Math.max(0,t.hp-raw);
          t.flash=6;t.aggro=true;`,
  true
);

ppaPatchRegex(
  'local mob respawn gate',
  /if\s*\(P\.scene===['"]dungeon['"]&&\s*!e\.isBoss&&\s*e\.si!==undefined\)\s*RESPAWN_Q\.push\(\{at:Date\.now\(\)\+MOB_RESPAWN_MS,si:e\.si\}\)\s*;/g,
  "if(P.scene==='dungeon'&&!e.isBoss&&e.si!==undefined&&!window.PPA_REALTIME_V2_ACTIVE)RESPAWN_Q.push({at:Date.now()+MOB_RESPAWN_MS,si:e.si});",
  true
);

ppaPatchRegex(
  'local dungeon spawn loop gate',
  /for\s*\(let\s+si\s*=\s*0\s*;\s*si\s*<\s*DG_ACTIVE_SPAWNS\.length\s*;\s*si\+\+\s*\)\s*spawnMobAtPoint\(si,false\)\s*;/,
  "if(!window.PPA_REALTIME_V2_ACTIVE){for(let si=0;si<DG_ACTIVE_SPAWNS.length;si++)spawnMobAtPoint(si,false);}else if(window.PPA_MOB_SERVER_REGISTER){setTimeout(()=>window.PPA_MOB_SERVER_REGISTER(),0);}"
);

ppaPatchRegex(
  'spawnMobAtPoint server gate',
  /function\s+spawnMobAtPoint\s*\(\s*si\s*,\s*fx\s*\)\s*\{/,
  "function spawnMobAtPoint(si,fx){if(window.PPA_REALTIME_V2_ACTIVE&&P&&P.scene==='dungeon'&&!window.__PPA_SERVER_SPAWN_CALL)return;"
);

ppaPatchRegex(
  'local mob attack gate',
  /if\s*\(e\.aggro&&d<=reach&&e\.atkCD<=0\)\s*\{/g,
  "if(!(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE())&&e.aggro&&d<=reach&&e.atkCD<=0){",
  true
);

// Generic dungeon monster rendering used to face the LOCAL player, so an observer
// could see a mob attack in the wrong direction. This hook is optional because
// some sprite packs do not use the generic visDir branch.
const renderFacingRe = /const\s+dxp\s*=\s*P\.x-e\.x\s*,\s*dyp\s*=\s*P\.y-e\.y\s*;\s*\/\/\s*4 visible states:[\s\S]*?e\.visDir\s*=\s*state\s*;/;
if (renderFacingRe.test(output)) {
  output = output.replace(renderFacingRe, `const dxp=P.x-e.x,dyp=P.y-e.y;
      // 4 visible states:
      // 0 right, 1 left, 2 upper-turn, 3 lower-turn
      let state=0;
      if(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE()&&Number.isFinite(Number(e.__ppaServerDir))){
        const _sd=Number(e.__ppaServerDir);
        state=_sd===3?0:_sd===2?1:_sd===0?2:3;
      }else if(Math.abs(dxp)>Math.abs(dyp))state=dxp>=0?0:1;
      else state=dyp<0?2:3;
      e.visDir=state;`);
  console.log('[PPA BUILD] mob render facing: patched');
} else {
  console.warn('[PPA BUILD WARN] mob render facing target not found; continuing');
}


/* === DUNGEON 41-60 REALTIME ROOM ======================================= */
ppaPatchRegex(
  '41-60 realtime room key',
  /if\s*\(scene===['"]dungeon21['"]\)return['"]dungeon-21-40['"];?/,
  "if(scene==='dungeon21')return'dungeon-21-40';\n  if(scene==='dungeon41')return'dungeon-41-60';"
);
if (!output.includes("if(scene==='dungeon41')return'dungeon-41-60';")) {
  throw new Error('Dungeon 41-60 realtime room patch did not apply');
}

/* ======================================================================== */

/* === DUNGEON TELEPORT DISPLAY LABELS ==================================== */
ppaPatchRegex(
  'dungeon teleport actual level labels',
  /function\s+renderDungeonTeleportMenu\(\)\s*\{/,
  "function dungeonTeleportDisplayLabel(i){var n=i*2+1;if(typeof DUNGEON_MODE!=='undefined'){if(DUNGEON_MODE==='21+')n+=20;else if(DUNGEON_MODE==='41-60')n+=40;}return n+'–'+(n+1);}\nfunction renderDungeonTeleportMenu(){"
);

ppaPatchRegex(
  'dungeon teleport button actual level labels',
  /b\.innerHTML=\(open\?'КОРИДОР '\+r\.label:'🔒 КОРИДОР '\+r\.label\)\+'<small>'\+\(open\?'Телепортировать':'Сначала пройди этот маршрут'\)\+'<\/small>';/,
  "var _tpLabel=dungeonTeleportDisplayLabel(i);b.innerHTML=(open?'КОРИДОР '+_tpLabel:'🔒 КОРИДОР '+_tpLabel)+'<small>'+(open?'Телепортировать':'Сначала пройди этот маршрут')+'</small>';"
);

ppaPatchRegex(
  'dungeon teleport pickup actual level label',
  /const\s+label=DUNGEON_TELEPORT_ROUTES\[i\]\.label;/,
  "const label=dungeonTeleportDisplayLabel(i);"
);

if (!output.includes("function dungeonTeleportDisplayLabel(i)")) {
  throw new Error('Dungeon teleport label patch did not apply');
}

/* ======================================================================== */

/* === CLASS SKILL BUILD AUDIT ============================================ */
{
  const activeIds=[
    'tank_shield_bash','tank_taunt','tank_iron_wall','tank_crushing_strike',
    'barb_blood_split','barb_furious_charge','barb_battle_frenzy','barb_death_whirl',
    'pal_righteous_strike','pal_holy_shield','pal_light_cleanse','pal_smite_wicked',
    'gnome_explosive_shot','gnome_buckshot','gnome_powder_barrel','gnome_aimed_volley',
    'arch_piercing_shot','arch_arrow_rain','arch_hunter_net','arch_aimed_shot',
    'mage_fireball','mage_frost_flash','mage_chain_lightning','mage_teleport',
    'assa_shadow_dash','assa_death_cross','assa_smoke_screen','assa_shadow_sentence',
    'priest_healing_light','priest_holy_barrier','priest_heaven_smite','priest_divine_rebirth'
  ];
  const passiveIds=[
    'tank_steel_will','tank_tough_armor','tank_unwavering','tank_defensive_reflex','tank_battlefield_leader',
    'barb_relentless_rage','barb_blood_thirst','barb_axe_master','barb_battle_hardened','barb_unstoppable',
    'pal_unbreakable_faith','pal_fortitude','pal_blessing_light','pal_ally_defender','pal_death_darkness',
    'gnome_engineering','gnome_big_stock','gnome_sturdy_build','gnome_blast_wave','gnome_sharpshooter',
    'arch_steady_hand','arch_hunter_eye','arch_forest_step','arch_big_quiver','arch_camouflage',
    'mage_deep_knowledge','mage_mana_regen','mage_element_balance','mage_magic_focus','mage_sage_defense',
    'assa_predator','assa_deadly_accuracy','assa_shadow_dance','assa_shadow_poison','assa_last_shadow',
    'priest_inner_light','priest_blessing','priest_divine_fortitude','priest_prayer','priest_banish_darkness'
  ];
  const missingSkills=activeIds.concat(passiveIds).filter((id)=>!output.includes(id));
  if(missingSkills.length)throw new Error('Class skill audit failed: '+missingSkills.join(', '));
}

/* ======================================================================== */

/* === FART ZONE MINE-ANCHORED AUTO ===================================== */
// AUTO combat may move the hero back to the locked mine after its own guards
// are cleared. Manual joystick input still wins because the client helper
// returns null while the player is steering.
ppaPatchRegex(
  'fart auto return movement input',
  /const _smartMove=updateSmartAttackInput\(\);\s*\/\/ V139:[\s\S]*?const _moveX=_smartMove\?_smartMove\.x:jX;\s*const _moveY=_smartMove\?_smartMove\.y:jY;/,
  `const _smartMove=updateSmartAttackInput();
  // V139: Smart Attack only supplies movement when joystick is neutral.
  // Fart AUTO adds a mine-return vector only after its locked guard pack is clear.
  const _fartAutoMove=(!_smartMove&&P.scene==='fartzone'&&window.PPA_FART_AUTO_MOVE)
    ?window.PPA_FART_AUTO_MOVE():null;
  const _moveX=_smartMove?_smartMove.x:(_fartAutoMove?_fartAutoMove.x:jX);
  const _moveY=_smartMove?_smartMove.y:(_fartAutoMove?_fartAutoMove.y:jY);`
);

// Guard respawn pauses production instead of permanently switching Auto Mining off.
// Once the locked mine's guards are dead and the player is back in radius,
// mining resumes from the same mine automatically.
ppaPatchRegex(
  'fart mining pause on guard respawn',
  /\}else if\(fartMineHasLivingGuard\(mine\)\)\{\s*fartStopAutoMining\('⚔ Стражи вернулись — добыча остановлена'\);\s*\}else\{/,
  `}else if(fartMineHasLivingGuard(mine)){
        FART_ZONE_STATE.activeMineId=null;
      }else{`
);

ppaPatchRegex(
  'fart mining button keeps paused state',
  /if\(fartMineHasLivingGuard\(nearest\)\)\{\s*if\(FART_ZONE_STATE\.autoMining\)fartStopAutoMining\('⚔ Стражи вернулись — добыча остановлена'\);\s*b\.disabled=true;\s*b\.innerHTML='🔒 АВТО ДОБЫЧА<br><span style="font-size:8px">СНАЧАЛА УБЕЙ СТРАЖЕЙ<\/span>';\s*return;\s*\}/,
  `if(fartMineHasLivingGuard(nearest)){
    if(FART_ZONE_STATE.autoMining&&FART_ZONE_STATE.autoMineId===nearest.id){
      b.disabled=false;
      b.classList.add('active');
      b.innerHTML='БОЙ · ДОБЫЧА НА ПАУЗЕ<br><span style="font-size:8px">ПОСЛЕ ОХРАНЫ ПРОДОЛЖИТСЯ</span>';
    }else{
      b.disabled=true;
      b.innerHTML='АВТО ДОБЫЧА<br><span style="font-size:8px">СНАЧАЛА УБЕЙ СТРАЖЕЙ</span>';
    }
    return;
  }`
);

if (!output.includes("const _fartAutoMove=(!_smartMove&&P.scene==='fartzone'&&window.PPA_FART_AUTO_MOVE)")) {
  throw new Error('Fart AUTO return movement patch did not apply');
}
if (!output.includes("FART_ZONE_STATE.activeMineId=null;\n      }else{")) {
  throw new Error('Fart mining guard pause patch did not apply');
}
if (!output.includes("БОЙ · ДОБЫЧА НА ПАУЗЕ")) {
  throw new Error('Fart mining paused-button patch did not apply');
}

/* ======================================================================== */

/* === AUCTION PREMIUM PURCHASE ENTITLEMENT =============================== */
// Auction slots use a stepped cumulative Premium-spend ladder:
// 1 Gram => 1 slot; 4 total => 3; 9 => 5; 16 => 7; 25 => 9; 36 => 10 max.
// Premium goods, bundles and Premium subscriptions count.
// Black Market, top-up balance itself and paid class-change spend do not.
ppaPatchRegex(
  'auction slots count premium purchases',
  /function accountActivated\(\)\{\s*return accountLifetimePaidGram\(\)>=1 \|\| premiumPurchasedAnyBundle\(\);\s*\}\s*function accountAuctionSlots\(\)\{[\s\S]*?return Math\.max\(0,Math\.min\(10,Math\.floor\(paid\)\)\);\s*\}/,
  `function premiumAuctionLegacyEvidence(){
  var ps=INV.premiumShop||{},b=ps.purchasedBundles||{};
  if(ps.lastPremiumPlan||Number(ps.lastPremiumPurchaseAt)>0||Number(ps.premiumTier)>0||Number(ps.premiumUntil)>0)return true;
  return Object.keys(b).some(function(k){return b[k]===true||Number(b[k])>0});
}
function premiumAuctionLegacyKnownSpend(){
  var ps=INV.premiumShop||{},b=ps.purchasedBundles||{},sum=0;
  var bundlePrice={starter:1,growth:3,adventurer:5,unique:10,epic:30};
  Object.keys(b).forEach(function(k){
    var n=b[k]===true?1:Math.max(0,Number(b[k])||0);
    if(bundlePrice[k])sum+=n*bundlePrice[k];
  });
  var planPrice={mini:1,week:5,month:10};
  if(ps.lastPremiumPlan&&planPrice[ps.lastPremiumPlan])sum+=planPrice[ps.lastPremiumPlan];
  return Math.max(0,sum);
}
function accountPremiumAuctionSpend(){
  if(!INV.premiumShop)INV.premiumShop={purchasedBundles:{}};
  var ps=INV.premiumShop,legacy=premiumAuctionLegacyEvidence();
  var known=premiumAuctionLegacyKnownSpend();
  var analytics=legacy?Math.max(0,Number(INV.gramSpentLifetime)||0):0;
  var stored=Math.max(0,Number(ps.auctionSlotGram)||0);
  var v=Math.max(stored,known,analytics,legacy?1:0);
  ps.auctionSlotGram=Math.round(v*100)/100;
  return ps.auctionSlotGram;
}
function recordPremiumAuctionSpend(amount){
  amount=Number(amount);
  if(!Number.isFinite(amount)||amount<=0)return accountPremiumAuctionSpend();
  if(!INV.premiumShop)INV.premiumShop={purchasedBundles:{}};
  var next=accountPremiumAuctionSpend()+amount;
  INV.premiumShop.auctionSlotGram=Math.round(next*100)/100;
  return INV.premiumShop.auctionSlotGram;
}
function auctionSlotsFromPremiumSpend(spent){
  spent=Math.max(0,Number(spent)||0);
  if(spent<1)return 0;
  if(spent<4)return 1;
  if(spent<9)return 3;
  if(spent<16)return 5;
  if(spent<25)return 7;
  if(spent<36)return 9;
  return 10;
}
function accountAuctionCreditGram(){
  return accountPremiumAuctionSpend();
}
function accountActivated(){
  return accountAuctionCreditGram()>=1;
}
function accountAuctionSlots(){
  return auctionSlotsFromPremiumSpend(accountAuctionCreditGram());
}`
);

ppaPatchRegex(
  'auction state uses premium slot credit',
  /var paid=accountLifetimePaidGram\(\);\s*if\(paid<1&&premiumPurchasedAnyBundle\(\)\)paid=1;\s*var mx=accountAuctionSlots\(\);/,
  "var paid=(typeof accountAuctionCreditGram==='function'?accountAuctionCreditGram():accountLifetimePaidGram());\n  var mx=accountAuctionSlots();"
);

ppaPatchRegex(
  'premium subscription counts for auction slots',
  /if\(typeof recordGramSpend===['"]function['"]\)recordGramSpend\(cfg\.price\);\s*INV\.premiumShop\.premiumPermanent=false;/,
  "if(typeof recordPremiumAuctionSpend==='function')recordPremiumAuctionSpend(cfg.price);\n  if(typeof recordGramSpend==='function')recordGramSpend(cfg.price);\n\n  INV.premiumShop.premiumPermanent=false;"
);
/* ======================================================================== */

/* === PREMIUM AUTO-ATTACK ENTITLEMENT =================================== */
// AUTO is a permanent account convenience once the player buys any Premium
// subscription, or makes a single Premium-shop purchase costing at least 5 Gram.
ppaPatchRegex(
  'auto attack unlock from premium bundle 5 gram',
  /if\(typeof recordGramSpend===['"]function['"]\)recordGramSpend\(cfg\.price\);\s*INV\.bag\.push\.apply\(INV\.bag,items\);/,
  "if(typeof recordPremiumAuctionSpend==='function')recordPremiumAuctionSpend(cfg.price);if(typeof recordGramSpend==='function')recordGramSpend(cfg.price);if(cfg.price>=5){INV.premiumShop.autoAttackUnlocked=true;}\n  INV.bag.push.apply(INV.bag,items);"
);

ppaPatchRegex(
  'auto attack unlock from premium good 5 gram',
  /if\(typeof recordGramSpend===['"]function['"]\)recordGramSpend\(g\.price\);\s*saveGame\(\);/,
  "if(typeof recordPremiumAuctionSpend==='function')recordPremiumAuctionSpend(g.price);if(typeof recordGramSpend==='function')recordGramSpend(g.price);if(g.price>=5){if(!INV.premiumShop)INV.premiumShop={purchasedBundles:{}};INV.premiumShop.autoAttackUnlocked=true;}\n\n  saveGame();"
);

ppaPatchRegex(
  'auto attack unlock from any premium subscription',
  /INV\.premiumShop\.lastPremiumPlan=id;\s*saveGame\(\);/,
  "INV.premiumShop.lastPremiumPlan=id;\n  INV.premiumShop.autoAttackUnlocked=true;\n\n  saveGame();"
);

ppaPatchRegex(
  'auto attack unlock from paid class change',
  /if\(typeof recordGramSpend===['"]function['"]\)recordGramSpend\(PREMIUM_CLASS_CHANGE_PRICE\);/,
  "if(typeof recordGramSpend==='function')recordGramSpend(PREMIUM_CLASS_CHANGE_PRICE);if(PREMIUM_CLASS_CHANGE_PRICE>=5){if(!INV.premiumShop)INV.premiumShop={purchasedBundles:{}};INV.premiumShop.autoAttackUnlocked=true;}"
);

/* ======================================================================== */

if (!output.includes('autoAttackUnlocked')) {
  throw new Error('Premium AUTO entitlement patch did not apply');
}
if (!output.includes('function accountPremiumAuctionSpend()') ||
    !output.includes('function recordPremiumAuctionSpend(amount)') ||
    !output.includes('function accountAuctionCreditGram()') ||
    !output.includes('function auctionSlotsFromPremiumSpend(spent)') ||
    !output.includes("if(spent<36)return 9") ||
    !output.includes("recordPremiumAuctionSpend(cfg.price)") ||
    !output.includes("recordPremiumAuctionSpend(g.price)")) {
  throw new Error('Premium auction-slot entitlement patch did not apply');
}

/* === ONLINE ARENA COMBAT BRIDGE ======================================== */
ppaPatchRegex(
  'online arena selected skill target',
  /function\s+skillTarget\(maxRange\)\{\s*if\(P\.scene===['"]clanboss1['"]\)\{/,
  "function skillTarget(maxRange){\n  if(window.PPA_ARENA_SKILL_TARGET){var _ppaArenaSkillTarget=window.PPA_ARENA_SKILL_TARGET(maxRange);if(_ppaArenaSkillTarget)return _ppaArenaSkillTarget;}\n  if(P.scene==='clanboss1'){"
);

ppaPatchRegex(
  'online arena area target',
  /function\s+around\(x,y,r\)\{([\s\S]*?)\n\s*return out;\n\s*\}/,
  "function around(x,y,r){$1\n    if(window.PPA_ARENA_AROUND_TARGET)window.PPA_ARENA_AROUND_TARGET(x,y,r,out);\n    return out;\n  }"
);

ppaPatchRegex(
  'online arena exit cleanup',
  /function\s+pvpExitAfterMatch\(\)\{\s*const ov=/,
  "function pvpExitAfterMatch(){\n  if(window.PPA_ARENA_MATCH_END)window.PPA_ARENA_MATCH_END();\n  const ov="
);

ppaPatchRegex(
  'online arena cancel cleanup',
  /function\s+pvpCancelMatch\(opts\)\{\s*opts=opts\|\|\{\};/,
  "function pvpCancelMatch(opts){\n  if(window.PPA_ARENA_MATCH_END)window.PPA_ARENA_MATCH_END();\n  opts=opts||{};"
);

ppaPatchRegex(
  'online arena manual leave cleanup',
  /if\(\(P\.scene===['"]worldboss['"]\|\|P\.scene===['"]pvp1['"]\|\|P\.scene===['"]pvpteam['"]\)&&!transitioning\)changeScene\(['"]safe['"]\);/,
  "if((P.scene==='worldboss'||P.scene==='pvp1'||P.scene==='pvpteam')&&!transitioning){if((P.scene==='pvp1'||P.scene==='pvpteam')&&window.PPA_ARENA_MATCH_END)window.PPA_ARENA_MATCH_END();changeScene('safe');}"
);

if (!output.includes("PPA_ARENA_SKILL_TARGET(maxRange)") ||
    !output.includes("PPA_ARENA_AROUND_TARGET")) {
  throw new Error('Online arena skill target bridge did not apply');
}

/* ======================================================================== */

/* ======================================================================== */

/* === DUNGEON DROP CLEANUP ============================================== */
// From level 11 upward gray equipment is removed from the actual drop logic.
ppaPatchRegex(
  'remove gray normal gear from levels 11-15',
  /if\s*\(lvl<=15\)return\s*\{common:0\.001,uncommon:0\.006,rare:0,epic:0\};/,
  "if(lvl<=15)return {common:0,uncommon:0.006,rare:0,epic:0};"
);

// Mini-bosses 11-20 previously still had a gray gear entry in their weighted
// 1-10 item pool. Keep it only for levels 1-10.
ppaPatchRegex(
  'remove gray mini-boss gear from level 11 onward',
  /\{w:18,drop:\(\)=>v232PushGear\(e,'common'\)\},\s*\{w:12,drop:\(\)=>v232PushGear\(e,'uncommon'\)\},/,
  "...(lv<=10?[{w:18,drop:()=>v232PushGear(e,'common')}]:[]),\n      {w:12,drop:()=>v232PushGear(e,'uncommon')},"
);

if (!output.includes("if(lvl<=15)return {common:0,uncommon:0.006,rare:0,epic:0};")) {
  throw new Error('Gray gear 11+ normal-mob patch did not apply');
}
if (!output.includes("...(lv<=10?[{w:18,drop:()=>v232PushGear(e,'common')}]:[]),")) {
  throw new Error('Gray gear 11+ mini-boss patch did not apply');
}

/* ======================================================================== */

/* === DUNGEON 11-60 GEAR SLOT WEIGHTING ================================ */
ppaPatchRegex(
  '41-60 legendary weighted slot',
  /const\s+slots=\['weapon','helmet','armor','gloves','ring','legs','boots'\];\s*const\s+slot=slots\[\(Math\.random\(\)\*slots\.length\)\|0\];/,
  "const slots=['weapon','helmet','armor','gloves','ring','legs','boots'];\n  const slot=(window.PPA_DUNGEON_PICK_GEAR_SLOT?window.PPA_DUNGEON_PICK_GEAR_SLOT():slots[(Math.random()*slots.length)|0]);"
);

/* ======================================================================== */

/* === DUNGEON 41-60 APPROVED EQUIPMENT CURVE ============================= */
ppaPatchRegex(
  '41-60 approved epic curve helper',
  /function\s+v271Drop4160\(e\)\s*\{/,
  `function v467Epic4160Chance(lv){
  lv=Math.max(41,Math.min(60,Math.floor(Number(lv)||41)));
  return .000018+(lv-41)*((.000040-.000018)/19); // 0.0018% -> 0.0040%
}
function v271Drop4160(e){`
);

ppaPatchRegex(
  '41-60 epic and 51-60 legendary gear rolls',
  /if\(Math\.random\(\)<V271_D41_LEGENDARY_GEAR_CHANCE\)v271PushDungeon41Legendary\(e\);\s*if\(Math\.random\(\)<V271_D41_BOOK_II_III_CHANCE\)v271PushDungeon41Book\(e\);/,
  `const _lv4160=Math.max(41,Math.min(60,Math.floor(Number(e&&e.lvl)||41)));
  if(v232Roll(v467Epic4160Chance(_lv4160),mul))v232PushGear(e,'epic');
  if(_lv4160>=51&&Math.random()<V271_D41_LEGENDARY_GEAR_CHANCE)v271PushDungeon41Legendary(e);
  if(Math.random()<V271_D41_BOOK_II_III_CHANCE)v271PushDungeon41Book(e);`
);

if (!output.includes("return .000018+(lv-41)*((.000040-.000018)/19); // 0.0018% -> 0.0040%") ||
    !output.includes("if(v232Roll(v467Epic4160Chance(_lv4160),mul))v232PushGear(e,'epic');") ||
    !output.includes("if(_lv4160>=51&&Math.random()<V271_D41_LEGENDARY_GEAR_CHANCE)") ||
    !output.includes("const V271_D41_LEGENDARY_GEAR_CHANCE=0.00000013;")) {
  throw new Error('Approved 41-60 epic/legendary gear curve did not apply');
}

/* ======================================================================== */



/* === FINAL ELITE LOOT TABLES · DUNGEONS 1–60 =============================
   STRICT ISOLATION:
   - this table is entered only when e.isDungeonElite === true;
   - bosses never use it;
   - ordinary mobs never use it;
   - boss 50% bonus roll is disabled separately for elites;
   - event resources keep their own scripts/chances unchanged.

   Final approved elite chances:
   1–20  special scale ×1:
     normal sharpen 25% (1–4), premium sharpen 10%, sharpen rune 1%,
     common/green stat rune 2%, premium HP/MP 1% (2–3),
     teleport 30% (1–3), luck coin 0.9%,
     active/passive book 0.004% / 0.003%.
   21–40 special scale ×2:
     50%, 20%, 2%, 4%, 2%, 60%, 1.8%,
     books 0.008% / 0.006%.
   41–60 special scale ×3:
     75%, 30%, 3%, 6%, 3%, 90%, 2.7%,
     books 0.012% / 0.009%.

   Gear/resources:
   1–20 green gear = current green chance +2 percentage points.
   21–40 blue gear = current blue chance +1.1 percentage points.
   41–60 purple gear = exactly 1%.
   Existing non-event material resources = current chance +2 percentage points.
   Monster Core = 8% on elites (normal dungeon mobs remain 6%).
   ======================================================================== */

ppaPatchRegex(
  'elite 1-40 final isolated drop table',
  /function\s+v232DropElite\(e\)\s*\{[\s\S]*?\n\}\n\n\/\/ Phoenix MUST remain exactly as V231 \/ V215\./,
  `/* PPA_ELITE_V540_1_40 */
function ppaElitePushCommonGreenRune(e){
  const types=Object.keys(RUNE_TYPES||{});
  if(!types.length)return false;
  const rarity=Math.random()<.5?'common':'uncommon';
  const type=types[(Math.random()*types.length)|0];
  const d=runeDefByKey(runeKey(type,rarity));
  if(!d)return false;
  LOOT.push({
    x:e.x+(Math.random()-.5)*34,
    y:e.y+(Math.random()-.5)*34,
    kind:'statRune',
    runeKey:d.key,name:d.name,icon:d.icon,img:d.img,
    rarity:d.rarity,amount:1,bob:Math.random()*6
  });
  return true;
}

function v232DropElite(e){
  // This function is called ONLY by the explicit isDungeonElite route below.
  const anti=antiFarmRewardMul(e);
  const lv=Math.max(1,Math.min(40,Number(e.lvl)||1));
  const mul=rewardDropMul()*anti;
  const scale=lv<=20?1:2;

  // Keep normal elite currency/feather behavior, but do not inherit ordinary
  // mob stat-rune rolls. The rune line below is the one approved elite roll.
  v232BaseCurrency(e,anti,0,2);
  v232MaybeFeather(e,anti);

  if(lv<=20){
    const gd=normalGearDropChances(lv);
    const greenChance=Math.min(1,Math.max(0,Number(gd.uncommon)||0)+.02);
    if(v232Roll(greenChance,mul))v232PushGear(e,'uncommon');

    let common=Math.min(.12,.0675+lv*.002625);
    let green=lv<11?0:Math.min(.022,.004+lv*.0009);
    if(lv>=11){common*=.80;green*=.75}
    common=Math.min(1,common+.02);
    if(green>0)green=Math.min(1,green+.02);
    if(v232Roll(common,mul*clanCastleResourceMul()))pushMaterialDrop(e,'common',1);
    if(green&&v232Roll(green,mul*clanCastleResourceMul()))pushMaterialDrop(e,'uncommon',1);
  }else{
    const blueBase=lv<=30?v232Blue2130(lv):v232Blue3140(lv);
    const blueChance=Math.min(1,Math.max(0,Number(blueBase)||0)+.011);
    if(v232Roll(blueChance,mul))v232PushGear(e,'rare');

    const commonBase=lv<=30?.12:.18;
    const greenBase=lv<=30?.06:.12;
    const blueBaseRes=v232BlueResourceChance(lv);
    if(v232Roll(Math.min(1,commonBase+.02),mul*clanCastleResourceMul()))pushMaterialDrop(e,'common',1);
    if(v232Roll(Math.min(1,greenBase+.02),mul*clanCastleResourceMul()))pushMaterialDrop(e,'uncommon',1);
    if(v232Roll(Math.min(1,blueBaseRes+.02),mul*luckCoinRareDropMul()*clanCastleResourceMul()))pushMaterialDrop(e,'rare',1);
  }

  // Approved elite-only utility table. The ×2 for 21–40 changes CHANCE,
  // never item quantity.
  if(Math.random()<.25*scale)pushStoneDrop(e,'normal',1+Math.floor(Math.random()*4));
  if(Math.random()<.10*scale)pushStoneDrop(e,'premium',1);
  if(Math.random()<.01*scale)pushStoneDrop(e,'rune',1);
  if(Math.random()<.02*scale)ppaElitePushCommonGreenRune(e);

  if(Math.random()<.01*scale){
    const qty=2+Math.floor(Math.random()*2);
    if(Math.random()<.5)v232PushConsumable(e,'premiumHpRegen','Премиум банка HP',PPA_V172_ART.premiumHp,'❤','#ff6a72',qty);
    else v232PushConsumable(e,'premiumMpRegen','Премиум банка MP',PPA_V172_ART.premiumMp,'◆','#6ea7ff',qty);
  }
  if(Math.random()<.30*scale){
    v232PushConsumable(e,'portalStone','Свиток телепорта',PPA_TELEPORT_SCROLL_IMG,'📜','#77b8ff',1+Math.floor(Math.random()*3));
  }
  if(Math.random()<.009*scale){
    v232PushConsumable(e,'luckCoin','Премиум-монета удачи',PPA_V172_ART.luckCoin,'🍀','#d69cff',1);
  }

  // Exact elite book chances approved above; one book on a successful roll.
  v232RollTypedBook(e,.00004*scale,.00003*scale,1,function(){return v232BookRankForLevel(lv)});

  v232MarkEliteKilled(e);
}

// Phoenix MUST remain exactly as V231 / V215.`
);

ppaPatchRegex(
  'elite 41-60 final isolated branch',
  /function\s+v271Drop4160\(e\)\s*\{/,
  `/* PPA_ELITE_V540_41_60 */
function ppaEliteDrop4160(e){
  // Completely separate 41–60 elite table. Ordinary mobs and bosses never
  // enter this function.
  const anti=antiFarmRewardMul(e);
  const mul=rewardDropMul()*anti;
  const lv=Math.max(41,Math.min(60,Math.floor(Number(e&&e.lvl)||41)));
  const scale=3;

  v232BaseCurrency(e,anti,0,2);
  v232MaybeFeather(e,anti);

  // Resources: current 41–60 rates +2 percentage points.
  if(v232Roll(.20,mul*clanCastleResourceMul()))pushMaterialDrop(e,'common',1);
  if(v232Roll(.14,mul*clanCastleResourceMul()))pushMaterialDrop(e,'uncommon',1);
  if(v232Roll(Math.min(1,v232BlueResourceChance(lv)+.02),mul*luckCoinRareDropMul()*clanCastleResourceMul()))pushMaterialDrop(e,'rare',1);

  // Purple gear is exactly 1% for elite 41–60. No ordinary/blue/legendary
  // equipment is inherited into this elite branch.
  if(Math.random()<.01)v232PushGear(e,'epic');

  if(Math.random()<.25*scale)pushStoneDrop(e,'normal',1+Math.floor(Math.random()*4));
  if(Math.random()<.10*scale)pushStoneDrop(e,'premium',1);
  if(Math.random()<.01*scale)pushStoneDrop(e,'rune',1);
  if(Math.random()<.02*scale)ppaElitePushCommonGreenRune(e);

  if(Math.random()<.01*scale){
    const qty=2+Math.floor(Math.random()*2);
    if(Math.random()<.5)v232PushConsumable(e,'premiumHpRegen','Премиум банка HP',PPA_V172_ART.premiumHp,'❤','#ff6a72',qty);
    else v232PushConsumable(e,'premiumMpRegen','Премиум банка MP',PPA_V172_ART.premiumMp,'◆','#6ea7ff',qty);
  }
  if(Math.random()<.30*scale){
    v232PushConsumable(e,'portalStone','Свиток телепорта',PPA_TELEPORT_SCROLL_IMG,'📜','#77b8ff',1+Math.floor(Math.random()*3));
  }
  if(Math.random()<.009*scale){
    v232PushConsumable(e,'luckCoin','Премиум-монета удачи',PPA_V172_ART.luckCoin,'🍀','#d69cff',1);
  }

  v232RollTypedBook(e,.00004*scale,.00003*scale,1,function(){return v232BookRankForLevel(lv)});
  v232MarkEliteKilled(e);
}

function v271Drop4160(e){
  if(e&&e.isDungeonElite)return ppaEliteDrop4160(e);`
);



ppaPatchRegex(
  'elite inspect 41-60 final table',
  /if\(e\.dungeon41&&e\.isDungeonElite\)return\s*\[[\s\S]*?\n\s*\];/,
  `/* PPA_ELITE_V540_INFO_41_60 */
  if(e.dungeon41&&e.isDungeonElite){
    const lv=Math.max(41,Math.min(60,Number(e.lvl)||41));
    return [
      ['ЭЛИТА · HP','×8'],['Бонус к урону','+14'],['Бонус к защите','+3'],['Золото','×2'],
      ['PPA ×1','1%'],['Перо Феникса','0.01%'],
      ['Фиолетовый шмот / оружие','1%'],
      ['Обычный ресурс','20%'],['Зелёный ресурс','14%'],
      ['Синий ресурс',v232Pct(Math.min(1,v232BlueResourceChance(lv)+.02))],
      ['Ядро монстра','8%'],
      ['Обычный камень заточки ×1–4','75%'],
      ['Премиум камень заточки ×1','30%'],
      ['Премиум руна заточки ×1','3%'],
      ['Обычная / зелёная универсальная руна ×1','6%'],
      ['Премиум HP или MP ×2–3','3%'],
      ['Свиток телепорта ×1–3','90%'],
      ['Премиум-монета удачи ×1','2.7%'],
      ['Активная книга',v232Pct(.00012)],
      ['Пассивная книга',v232Pct(.00009)],
      ['Ранг книги',v232BookRankInfoForLevel(lv)],
      ['Ресурсы событий','шанс без изменений']
    ];
  }`
);

ppaPatchRegex(
  'elite inspect 1-40 final tables',
  /if\(e\.isDungeonElite\)\{\s*const lv=Math\.max\(1,Math\.min\(40,Number\(e\.lvl\)\|\|1\)\);[\s\S]*?\n\s*\}\n\n\s*if\(e\.isDungeon21Boss\)return/,
  `/* PPA_ELITE_V540_INFO_1_40 */
  if(e.isDungeonElite){
    const lv=Math.max(1,Math.min(40,Number(e.lvl)||1));
    const scale=lv<=20?1:2;
    if(lv<=20){
      const gd=normalGearDropChances(lv);
      let commonRes=Math.min(.12,.0675+lv*.002625);
      let greenRes=lv<11?0:Math.min(.022,.004+lv*.0009);
      if(lv>=11){commonRes*=.80;greenRes*=.75}
      const rows=[
        ['ЭЛИТА · HP','×7'],['Бонус к урону','+12'],['Бонус к защите','+2'],['Золото','×2'],
        ['PPA ×1','1%'],['Перо Феникса','0.01%'],
        ['Зелёный шмот / оружие',v232Pct(Math.min(1,(Number(gd.uncommon)||0)+.02))],
        ['Обычный ресурс',v232Pct(Math.min(1,commonRes+.02))]
      ];
      if(greenRes>0)rows.push(['Зелёный ресурс',v232Pct(Math.min(1,greenRes+.02))]);
      rows.push(
        ['Ядро монстра','8%'],
        ['Обычный камень заточки ×1–4','25%'],
        ['Премиум камень заточки ×1','10%'],
        ['Премиум руна заточки ×1','1%'],
        ['Обычная / зелёная универсальная руна ×1','2%'],
        ['Премиум HP или MP ×2–3','1%'],
        ['Свиток телепорта ×1–3','30%'],
        ['Премиум-монета удачи ×1','0.9%'],
        ['Активная книга',v232Pct(.00004)],
        ['Пассивная книга',v232Pct(.00003)],
        ['Ранг книги',v232BookRankInfoForLevel(lv)],
        ['Ресурсы событий','шанс без изменений']
      );
      return rows;
    }

    const blueBase=lv<=30?v232Blue2130(lv):v232Blue3140(lv);
    const commonBase=lv<=30?.12:.18;
    const greenBase=lv<=30?.06:.12;
    return [
      ['ЭЛИТА · HP','×8'],['Бонус к урону','+14'],['Бонус к защите','+3'],['Золото','×2'],
      ['PPA ×1','1%'],['Перо Феникса','0.01%'],
      ['Синий шмот / оружие',v232Pct(Math.min(1,blueBase+.011))],
      ['Обычный ресурс',v232Pct(Math.min(1,commonBase+.02))],
      ['Зелёный ресурс',v232Pct(Math.min(1,greenBase+.02))],
      ['Синий ресурс',v232Pct(Math.min(1,v232BlueResourceChance(lv)+.02))],
      ['Ядро монстра','8%'],
      ['Обычный камень заточки ×1–4','50%'],
      ['Премиум камень заточки ×1','20%'],
      ['Премиум руна заточки ×1','2%'],
      ['Обычная / зелёная универсальная руна ×1','4%'],
      ['Премиум HP или MP ×2–3','2%'],
      ['Свиток телепорта ×1–3','60%'],
      ['Премиум-монета удачи ×1','1.8%'],
      ['Активная книга',v232Pct(.00008)],
      ['Пассивная книга',v232Pct(.00006)],
      ['Ранг книги',v232BookRankInfoForLevel(lv)],
      ['Ресурсы событий','шанс без изменений']
    ];
  }

  if(e.isDungeon21Boss)return`
);

const _ppaEliteAudit={
  drop1_40:output.includes('/* PPA_ELITE_V540_1_40 */'),
  drop41_60:output.includes('/* PPA_ELITE_V540_41_60 */'),
  info1_40:output.includes('/* PPA_ELITE_V540_INFO_1_40 */'),
  info41_60:output.includes('/* PPA_ELITE_V540_INFO_41_60 */')
};
console.log('[PPA BUILD] final elite loot audit:',JSON.stringify(_ppaEliteAudit));
if(!_ppaEliteAudit.drop1_40||!_ppaEliteAudit.drop41_60||!_ppaEliteAudit.info1_40||!_ppaEliteAudit.info41_60||
   !output.includes("if(e&&e.isDungeonElite)return ppaEliteDrop4160(e);")||
   !output.includes("if(Math.random()<.25*scale)pushStoneDrop(e,'normal',1+Math.floor(Math.random()*4));")||
   !output.includes("if(Math.random()<.30*scale)")||
   !output.includes("v232RollTypedBook(e,.00004*scale,.00003*scale,1")||
   !output.includes("['Ядро монстра','8%']")){
  throw new Error('Final isolated elite loot tables did not apply');
}

/* ======================================================================== */

/* === DUNGEON 41-60 BALANCE ============================================= */
ppaPatchRegex(
  '41-60 mob stats +2000 hp +50 atk +40 def',
  /e\.hp=Math\.round\(ref\.hp\*3\);\s*e\.mhp=e\.hp;\s*e\.def=Math\.round\(ref\.def\*3\);\s*e\.dmg=Math\.round\(ref\.dmg\*3\);/,
  "e.hp=Math.round(ref.hp*1.10)+2000;\n  e.mhp=e.hp;\n  e.def=Math.round(ref.def*1.07)+40;\n  e.dmg=Math.round(ref.dmg*1.13)+50;"
);

/* ======================================================================== */

/* === TEMP BOSS ACCESS FOR LIVE TESTING =================================== */
// Temporary QA switch: all dungeon brackets + Crystal Titan can be entered
// regardless of character level / daily world-boss lock. Remove the flag or
// set it to false to restore release restrictions.
ppaPatchRegex(
  'test unlock dungeon 21-40',
  /function\s+dungeon21Unlocked\(\)\s*\{[\s\S]*?return\s+lv>=21&&lv<=40\s*;\s*\}/,
  "function dungeon21Unlocked(){if(window.PPA_BOSS_TEST_OPEN===true)return true;const lv=Math.floor(Number(P&&P.lvl)||1);return lv>=21&&lv<=40;}"
);

ppaPatchRegex(
  'test unlock dungeon 41-60',
  /function\s+dungeon41Unlocked\(\)\s*\{[\s\S]*?return\s+lv>=DUNGEON41_LEVEL_REQ&&lv<=DUNGEON41_LEVEL_MAX\s*;\s*\}/,
  "function dungeon41Unlocked(){if(window.PPA_BOSS_TEST_OPEN===true)return true;const lv=Math.floor(Number(P&&P.lvl)||1);return lv>=DUNGEON41_LEVEL_REQ&&lv<=DUNGEON41_LEVEL_MAX;}"
);

ppaPatchRegex(
  'test unlock world boss daily entry',
  /const\s+available\s*=\s*String\(st\.killedCycle\|\|['"]['"]\)!==cycle\s*;/,
  "const available=window.PPA_BOSS_TEST_OPEN===true||String(st.killedCycle||'')!==cycle;"
);

/* ======================================================================== */

/* === SERVER-AUTHORITATIVE BOSSES ========================================= */
ppaPatchRegex(
  'phoenix local spawn gate',
  /else if\s*\(DUNGEON_MODE===['"]1-20['"]&&Date\.now\(\)>=BOSS_READY_AT\)\s*\{/g,
  "else if(DUNGEON_MODE==='1-20'&&Date.now()>=BOSS_READY_AT&&!window.PPA_REALTIME_V2_ACTIVE){",
  true
);

ppaPatchRegex(
  'phoenix local respawn gate',
  /if\s*\(DUNGEON_MODE===['"]1-20['"]&&now>=BOSS_READY_AT&&!EN\.some\(e=>e\.isBoss\)\)spawnBoss\(\)\s*;/g,
  "if(DUNGEON_MODE==='1-20'&&now>=BOSS_READY_AT&&!EN.some(e=>e.isBoss)&&!window.PPA_REALTIME_V2_ACTIVE)spawnBoss();",
  true
);

ppaPatchRegex(
  'lord40 server spawn bypass local cooldown',
  /if\s*\(Date\.now\(\)<\(Number\(INV\.dungeon21LordReadyAt\)\|\|0\)\)return null\s*;/g,
  "if(!window.__PPA_SERVER_SPAWN_CALL&&Date.now()<(Number(INV.dungeon21LordReadyAt)||0))return null;",
  true
);

ppaPatchRegex(
  'lord40 local respawn gate',
  /function\s+v232LordTick\(\)\s*\{\s*if\s*\(P\.scene!==['"]dungeon['"]\|\|DUNGEON_MODE!==['"]21\+['"]\|\|P\.dead\)return\s*;/,
  "function v232LordTick(){if(P.scene!=='dungeon'||DUNGEON_MODE!=='21+'||P.dead||(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE()))return;"
);

ppaPatchRegex(
  'titan server spawn bypass daily client flag',
  /if\s*\(typeof worldBossDailyAvailable===['"]function['"]&&!worldBossDailyAvailable\(\)\)\s*\{/,
  "if(!window.__PPA_SERVER_SPAWN_CALL&&typeof worldBossDailyAvailable==='function'&&!worldBossDailyAvailable()){"
);

ppaPatchRegex(
  'titan local interval spawn gate',
  /if\s*\(P\.scene===['"]worldboss['"]&&!P\.dead&&worldBossDailyAvailable\(\)&&!WORLD_BOSS_LOOT_EVENT\.active&&(!EN\.some\(function\(e\)\{return e&&e\.isWorldCrystalBoss&&e\.hp>0\}\))\)\s*\{/,
  "if(P.scene==='worldboss'&&!P.dead&&worldBossDailyAvailable()&&!WORLD_BOSS_LOOT_EVENT.active&&!EN.some(function(e){return e&&e.isWorldCrystalBoss&&e.hp>0})&&!(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE())){"
);

ppaPatchRegex(
  'phoenix special damage server gate',
  /function\s+phoenixDungeonAoeUpdate\(e,d\)\s*\{\s*if\s*\(!e\|\|!e\.isDungeonPhoenixBoss\)return\s*;/,
  "function phoenixDungeonAoeUpdate(e,d){if(!e||!e.isDungeonPhoenixBoss)return;if(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE())return;"
);

ppaPatchRegex(
  'lord40 special damage server gate',
  /function\s+dungeon21BossUpdate\(e,dx,dy,d\)\s*\{/,
  "function dungeon21BossUpdate(e,dx,dy,d){if(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE())return;"
);

ppaPatchRegex(
  'titan local AI server gate',
  /function\s+worldCrystalBossUpdate\(e,dx,dy,d\)\s*\{\s*if\s*\(!e\|\|e\.hp<=0\)return\s*;/,
  "function worldCrystalBossUpdate(e,dx,dy,d){if(!e||e.hp<=0)return;if(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE())return;"
);

ppaPatchRegex(
  'phoenix server fire target guard',
  /if\s*\(!kill&&Math\.hypot\(f\.x-P\.x,f\.y-P\.y\)<26\)\s*\{/,
  "if(!kill&&(!f.__ppaServerTarget||f.__ppaServerTarget===String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||''))&&Math.hypot(f.x-P.x,f.y-P.y)<26){"
);

ppaPatchRegex(
  'titan server projectile target guard',
  /if\s*\(!kill&&Math\.hypot\(f\.x-P\.x,f\.y-\(P\.y-8\)\)<30\)\s*\{/,
  "if(!kill&&(!f.__ppaServerTarget||f.__ppaServerTarget===String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||''))&&Math.hypot(f.x-P.x,f.y-(P.y-8))<30){"
);

/* ======================================================================== */

/* === DRAGON 60 OCCLUSION / REPAINT FIX ================================== */
ppaPatchRegex(
  'dragon60 visual metrics',
  /function\s+ppaMobVisualMetrics\(e\)\s*\{\s*if\(!e\)return\{w:0,h:0\};/,
  "function ppaMobVisualMetrics(e){\n  if(!e)return{w:0,h:0};\n  if(e.isDungeon60Boss)return{w:270,h:270};"
);

ppaPatchRegex(
  'dragon60 body-only occlusion repaint',
  /function\s+ppaDrawWorldBodyOnly\(e\)\s*\{\s*if\(!e\|\|e\.hp<=0\)return;/,
  "function ppaDrawWorldBodyOnly(e){\n  if(!e||e.hp<=0)return;\n  if(e.isDungeon60Boss){if(window.PPA_DRAGON60_DRAW_BODY)window.PPA_DRAGON60_DRAW_BODY(e);return;}"
);

if (!output.includes("if(e.isDungeon60Boss){if(window.PPA_DRAGON60_DRAW_BODY)window.PPA_DRAGON60_DRAW_BODY(e);return;}")) {
  throw new Error('Dragon 60 occlusion repaint patch did not apply');
}

/* ======================================================================== */

/* === V330 LEVEL-60 DRAGON ================================================ */
ppaPatchRegex(
  'dragon60 boss update hook',
  /\}else if\s*\(e\.isDungeon21Boss\)\s*\{\s*dungeon21BossUpdate\(e,dx,dy,d\)\s*;/,
  "}else if(e.isDungeon60Boss){if(window.PPA_DRAGON60_UPDATE)window.PPA_DRAGON60_UPDATE(e,dx,dy,d);"
  + "}else if(e.isDungeon21Boss){dungeon21BossUpdate(e,dx,dy,d);"
);

ppaPatchRegex(
  'dragon60 local boss attack gate',
  /\}else if\s*\(d<=reach&&e\.atkCD<=0\)\s*\{/g,
  "}else if(!(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE()&&(e.isDungeon60Boss||e.isDungeon21Boss||e.isDungeonPhoenixBoss||e.isWorldCrystalBoss))&&d<=reach&&e.atkCD<=0){",
  true
);

ppaPatchRegex(
  'dragon60 exclude legacy phoenix renderer',
  /if\s*\(e\.isBoss\)\s*\{\s*\/\/\s*Phoenix boss:/,
  "if(e.isBoss&&!e.isDungeon60Boss){\n      // Phoenix boss:"
);

ppaPatchRegex(
  'dragon60 render hook',
  /if\s*\(e\.isDungeon21Boss\)\s*\{\s*drawDungeon21Boss\(e\)\s*;\s*continue\s*;\s*\}/,
  "if(e.isDungeon60Boss){if(window.PPA_DRAGON60_DRAW)window.PPA_DRAGON60_DRAW(e);continue;}"
  + "if(e.isDungeon21Boss){drawDungeon21Boss(e);continue;}"
);

ppaPatchRegex(
  'dragon60 phoenix-ai exclusion',
  /if\s*\(e\.isBoss&&\s*!e\.isClanBoss&&\s*!e\.isDungeon21Boss&&\s*!e\.isWorldCrystalBoss&&\s*!e\.isClanSiegeCrystal\)\s*\{/,
  "if(e.isBoss&&!e.isClanBoss&&!e.isDungeon21Boss&&!e.isDungeon60Boss&&!e.isWorldCrystalBoss&&!e.isClanSiegeCrystal&&!(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE())){"
);

ppaPatchRegex(
  'dragon60 death-remnant exclusion',
  /if\s*\(!e\.isWorldCrystalBoss\)\s*ppaAddDeathRemnant\(e\)\s*;/,
  "if(!e.isWorldCrystalBoss&&!e.isDungeon60Boss)ppaAddDeathRemnant(e);"
);


ppaPatchRegex(
  'dragon60 mob info title',
  /name=e\.isClanBoss\?'ВЛАДЫЧИЦА ПЛАМЕНИ':\(e\.isDungeon21Boss\?'ВЛАДЫКА СКВЕРНЫ':\(e\.isBoss\?'ФЕНИКС':\(\(e\.type&&e\.type\.n\)\|\|'Моб'\)\)\);/,
  "name=e.isClanBoss?'ВЛАДЫЧИЦА ПЛАМЕНИ':(e.isDungeon60Boss?'ДРАКОН ПЕПЛА':(e.isDungeon21Boss?'ВЛАДЫКА СКВЕРНЫ':(e.isBoss?'ФЕНИКС':((e.type&&e.type.n)||'Моб'))));"
);

ppaPatchRegex(
  'dragon60 death notice',
  /\}else if\s*\(e\.isDungeon21Boss&&P\.scene===['"]dungeon['"]\)\s*\{/,
  "}else if(e.isDungeon60Boss&&P.scene==='dungeon'){\n        const ln=document.getElementById('locName');\n        ln.innerHTML='ДРАКОН ПЕПЛА ПОВЕРЖЕН<div class=\"sub\">Откат 6 часов</div>';\n        ln.classList.add('show');\n        setTimeout(()=>ln.classList.remove('show'),2500);\n      }else if(e.isDungeon21Boss&&P.scene==='dungeon'){"
);

if (!output.includes("e.isDungeon60Boss?'ДРАКОН ПЕПЛА'")) {
  throw new Error('Dragon 60 mob info title patch did not apply');
}

ppaPatchRegex(
  'dragon60 keeper card text',
  /Те же типы мобов · усиление ×3 · без босса/g,
  "Те же типы мобов · усиление ×3 · босс: Дракон Пепла · 36 700 HP",
  true
);

ppaPatchRegex(
  'dragon60 dungeon subtitle',
  /Уровни 41–60 · те же типы мобов · HP \/ DEF \/ ATK ×3 от 21–40 · БОССА НЕТ/g,
  "Уровни 41–60 · мобы ×3 · Дракон Пепла · 36 700 HP · урон 180",
  true
);

ppaPatchRegex(
  'dragon60 dungeon hud',
  /waveEl\.textContent=['"]ДАНЖ 41–60 · МОБЫ ×3 · БОССА НЕТ['"]\s*;/g,
  "const _dragon60=EN.find(function(x){return x&&x.isDungeon60Boss&&x.hp>0});"
  + "waveEl.textContent=_dragon60"
  + "?('ДРАКОН ПЕПЛА · '+Math.max(0,Math.ceil(_dragon60.hp)).toLocaleString('ru-RU')+' / '+Math.ceil(_dragon60.mhp).toLocaleString('ru-RU')+' HP')"
  + ":'ДРАКОН ПЕПЛА · ожидание / откат';",
  true
);

/* ======================================================================== */

/* === ZERO HP IS DEATH ==================================================== */
ppaPatchRegex(
  'natural hp regen never revives zero hp',
  /if\(P\.hp<P\.mhp\)P\.hp=Math\.min\(P\.mhp,P\.hp\+0\.06\);/,
  "if(P.hp>0&&P.hp<P.mhp)P.hp=Math.min(P.mhp,P.hp+0.06);"
);

ppaPatchRegex(
  'premium hp regen never revives zero hp',
  /if\(hpPer>0&&P\.hp<P\.mhp\)P\.hp=Math\.min\(P\.mhp,P\.hp\+hpPer\*ticks\);/,
  "if(hpPer>0&&P.hp>0&&P.hp<P.mhp)P.hp=Math.min(P.mhp,P.hp+hpPer*ticks);"
);

if (!output.includes("if(P.hp>0&&P.hp<P.mhp)P.hp=Math.min(P.mhp,P.hp+0.06);") ||
    !output.includes("if(hpPer>0&&P.hp>0&&P.hp<P.mhp)P.hp=Math.min(P.mhp,P.hp+hpPer*ticks);")) {
  throw new Error('Zero HP regen guard did not apply');
}

/* ======================================================================== */

/* === REMOTE PROJECTILE DRAW LAYER ======================================== */
ppaPatchRegex(
  'remote projectile render layer',
  /try\{drawPlayerCannonballs\(\)\}catch\(_\)\{\}\s*try\{drawPlayerArrows\(\)\}catch\(_\)\{\}/,
  "try{drawPlayerCannonballs()}catch(_){}\n  try{drawPlayerArrows()}catch(_){}\n  try{if(window.PPA_REMOTE_COMBAT_FX_DRAW)window.PPA_REMOTE_COMBAT_FX_DRAW()}catch(_){}"
);

if (!output.includes("PPA_REMOTE_COMBAT_FX_DRAW)window.PPA_REMOTE_COMBAT_FX_DRAW()")) {
  throw new Error('Remote projectile render layer hook did not apply');
}

/* ======================================================================== */

/* === SERVER-OWNED ELITE MOB ============================================== */
ppaPatchRegex(
  'disable local elite selection in realtime',
  /function\s+v232EnsureElite\(\)\s*\{\s*if\(P\.scene!==['"]dungeon['"]\|\|P\.dead\)return null;/,
  "function v232EnsureElite(){if(P.scene!=='dungeon'||P.dead||window.PPA_REALTIME_V2_ACTIVE)return null;"
);

if (!output.includes("P.scene!=='dungeon'||P.dead||window.PPA_REALTIME_V2_ACTIVE")) {
  throw new Error('Realtime local elite disable patch did not apply');
}

/* ======================================================================== */

/* === BOOK DROP BRACKETS =================================================== */
ppaPatchRegex(
  'book chances fixed by dungeon bracket',
  /function\s+v232ActiveBookChance\(lv\)\s*\{[\s\S]*?\}\s*function\s+v232PassiveBookChance\(lv\)\s*\{[\s\S]*?\}/,
  `function v232ActiveBookChance(lv){
  lv=Math.max(1,Math.min(60,Math.floor(Number(lv)||1)));
  if(lv<=20)return .00004; // 0.004%
  if(lv<=30)return .00005; // 0.005%
  if(lv<=40)return .00006; // 0.006%
  if(lv<=50)return .00007+(lv-41)*((.00011-.00007)/9); // 0.007% -> 0.011%
  return .00012+(lv-51)*((.00018-.00012)/9);           // 0.012% -> 0.018%
}
function v232PassiveBookChance(lv){
  lv=Math.max(1,Math.min(60,Math.floor(Number(lv)||1)));
  if(lv<=20)return .00003; // 0.003%
  if(lv<=30)return .00004; // 0.004%
  if(lv<=40)return .00005; // 0.005%
  if(lv<=50)return .00006+(lv-41)*((.00010-.00006)/9); // 0.006% -> 0.010%
  return .00011+(lv-51)*((.00017-.00011)/9);           // 0.011% -> 0.017%
}
function v232BookRankWeights(lv){
  lv=Math.max(1,Math.min(60,Math.floor(Number(lv)||1)));
  if(lv<=30)return {r1:1,r2:0,r3:0};
  if(lv<=40)return {r1:.50,r2:.50,r3:0};
  let t;
  if(lv<=50){
    t=(lv-41)/9;
    return {r1:.60-.15*t,r2:.35+.05*t,r3:.05+.10*t};
  }
  t=(lv-51)/9;
  return {r1:.40-.20*t,r2:.40,r3:.20+.20*t};
}
function v232BookRankForLevel(lv){
  const w=v232BookRankWeights(lv),r=Math.random();
  if(r<w.r1)return 1;
  if(r<w.r1+w.r2)return 2;
  return 3;
}
function v232BookRankInfoForLevel(lv){
  const w=v232BookRankWeights(lv);
  const p=n=>(Math.round(n*1000)/10).toFixed(1).replace(/\\.0$/,'')+'%';
  if(w.r3<=0&&w.r2<=0)return 'I · 100%';
  if(w.r3<=0)return 'I '+p(w.r1)+' / II '+p(w.r2);
  return 'I '+p(w.r1)+' / II '+p(w.r2)+' / III '+p(w.r3);
}`
);

ppaPatchRegex(
  'books 1-20 exact active passive and rank I',
  /v232RollTypedBook\(e,\.00003,\.00006,mul,null\);/,
  "v232RollTypedBook(e,v232ActiveBookChance(lv),v232PassiveBookChance(lv),mul,function(){return v232BookRankForLevel(lv)});"
);

ppaPatchRegex(
  'books 21-30 exact rank I',
  /v232RollTypedBook\(e,v232ActiveBookChance\(lv\),v232PassiveBookChance\(lv\),mul,null\);/,
  "v232RollTypedBook(e,v232ActiveBookChance(lv),v232PassiveBookChance(lv),mul,function(){return v232BookRankForLevel(lv)});"
);

ppaPatchRegex(
  'books 31-40 random rank I-II',
  /v232RollTypedBook\(e,v232ActiveBookChance\(lv\),v232PassiveBookChance\(lv\),mul,null\);/,
  "v232RollTypedBook(e,v232ActiveBookChance(lv),v232PassiveBookChance(lv),mul,function(){return v232BookRankForLevel(lv)});"
);

ppaPatchRegex(
  'books 41-60 progressive I-II-III ranks',
  /if\(Math\.random\(\)<V271_D41_BOOK_II_III_CHANCE\)v271PushDungeon41Book\(e\);/,
  "v232RollTypedBook(e,v232ActiveBookChance(Number(e&&e.lvl)||41),v232PassiveBookChance(Number(e&&e.lvl)||41),mul,function(){return v232BookRankForLevel(Number(e&&e.lvl)||41)});"
);

ppaPatchRegex(
  'book inspect 1-20 exact chances and rank',
  /rows\.push\(\['Активная книга','0\.003%'\],\['Пассивная книга','0\.006%'\]\);/,
  "rows.push(['Активная книга','0.004%'],['Пассивная книга','0.003%'],['Ранг книги','I · 100%']);"
);

ppaPatchRegex(
  'book inspect 21-30 rank I',
  /(\['Активная книга',v232Pct\(v232ActiveBookChance\(lv\)\)\],\['Пассивная книга',v232Pct\(v232PassiveBookChance\(lv\)\)\])(\s*\]\s*;)/,
  "$1,['Ранг книги',v232BookRankInfoForLevel(lv)]$2"
);

ppaPatchRegex(
  'book inspect 31-40 rank I-II',
  /(\['Активная книга',v232Pct\(v232ActiveBookChance\(lv\)\)\],\['Пассивная книга',v232Pct\(v232PassiveBookChance\(lv\)\)\])(\s*\]\s*;)/,
  "$1,['Ранг книги',v232BookRankInfoForLevel(lv)]$2"
);

ppaPatchRegex(
  'book inspect 41-60 progressive',
  /\['Книга навыка II–III','0\.016%'\],\s*\['Ранг книги','II \/ III · случайно'\]/g,
  "['Активная книга',v232Pct(v232ActiveBookChance(Number(e&&e.lvl)||41))],['Пассивная книга',v232Pct(v232PassiveBookChance(Number(e&&e.lvl)||41))],['Ранг книги',v232BookRankInfoForLevel(Number(e&&e.lvl)||41)]",
  true
);

if (!output.includes("if(lv<=20)return .00004; // 0.004%") ||
    !output.includes("if(lv<=30)return .00005; // 0.005%") ||
    !output.includes("if(lv<=40)return .00006; // 0.006%") ||
    !output.includes("if(lv<=30)return .00004; // 0.004%") ||
    !output.includes("if(lv<=40)return .00005; // 0.005%") ||
    !output.includes("if(lv<=50)return .00007+(lv-41)*((.00011-.00007)/9)") ||
    !output.includes("return .00012+(lv-51)*((.00018-.00012)/9)") ||
    !output.includes("function v232BookRankWeights(lv)") ||
    !output.includes("function v232BookRankInfoForLevel(lv)")) {
  throw new Error('Book bracket/rank rules did not apply');
}

/* ======================================================================== */

/* === BOOK RANK CAPS FOR ELITES =========================================== */
ppaPatchRegex(
  'elite book ranks obey dungeon bracket',
  /function\s+v232EliteBookRank\(lv\)\s*\{[\s\S]*?\}/,
  `function v232EliteBookRank(lv){return v232BookRankForLevel(lv)}`
);

ppaPatchRegex(
  'elite book inspect rank caps',
  /\['Ранг книги',lv<=30\?'I 70% \/ II 30%':'I 55% \/ II 35% \/ III 10%'\]/,
  "['Ранг книги',v232BookRankInfoForLevel(lv)]"
);

/* ======================================================================== */

/* === BLUE RESOURCE CURVE 21-60 ========================================== */
ppaPatchRegex(
  'blue resource chance unified 21-60',
  /function\s+v232BlueRes2130\(lv\)\{[^}]*\}\s*function\s+v232BlueRes3140\(lv\)\{[^}]*\}/,
  `function v232BlueResourceChance(lv){
  lv=Math.max(21,Math.min(60,Math.floor(Number(lv)||21)));
  return .007+(lv-21)*(.015/39); // 0.7% at 21 -> 2.2% at 60
}
function v232BlueRes2130(lv){return v232BlueResourceChance(lv)}
function v232BlueRes3140(lv){return v232BlueResourceChance(lv)}`
);

ppaPatchRegex(
  'blue resource chance 41-60 uses unified curve',
  /if\(v232Roll\(\.10,mul\*luckCoinRareDropMul\(\)\*clanCastleResourceMul\(\)\)\)pushMaterialDrop\(e,'rare',1\);/,
  "if(v232Roll(v232BlueResourceChance(Number(e&&e.lvl)||41),mul*luckCoinRareDropMul()*clanCastleResourceMul()))pushMaterialDrop(e,'rare',1);"
);

ppaPatchRegex(
  'blue resource inspect 41-60',
  /\['Синий ресурс','10%'\]/g,
  "['Синий ресурс',v232Pct(v232BlueResourceChance(Number(e&&e.lvl)||41))]",
  true
);

if (!output.includes("return .007+(lv-21)*(.015/39); // 0.7% at 21 -> 2.2% at 60") ||
    !output.includes("v232BlueResourceChance(Number(e&&e.lvl)||41)")) {
  throw new Error('Blue resource 21-60 curve did not apply');
}

/* ======================================================================== */

/* === FART GUARD LEGENDARY + COMMON 4H PICKAXE =========================== */
ppaPatchRegex(
  'ordinary fart pickaxe resource bonuses',
  /if\(Math\.random\(\)<0\.25\)rarity='rare';\s*else if\(Math\.random\(\)<0\.55\)rarity='uncommon';\s*else if\(Math\.random\(\)<0\.70\)rarity='common';/,
  `const _pickaxeBonus=(typeof fartHasPickaxe==='function'&&fartHasPickaxe());
  // Ordinary pickaxe: relative bonuses, not flat percentage points.
  // blue +3%, rare/green +5%, any resource/common +10%.
  if(Math.random()<(0.25*(_pickaxeBonus?1.03:1)))rarity='rare';
  else if(Math.random()<(0.55*(_pickaxeBonus?1.05:1)))rarity='uncommon';
  else if(Math.random()<(0.70*(_pickaxeBonus?1.10:1)))rarity='common';`
);


ppaPatchRegex(
  'fart guard legendary gear chance constant',
  /const FART_GUARD_EPIC_GEAR_CHANCE=0\.00001;/,
  "const FART_GUARD_EPIC_GEAR_CHANCE=0.00001;\nconst FART_GUARD_LEGENDARY_GEAR_CHANCE=0.0000013; // 0.00013%"
);

ppaPatchRegex(
  'fart guard legendary gear drop',
  /(\/\/ Epic equipment — 0\.001%\.[\s\S]*?\n\s*\}\n\s*\})\n\n\s*\/\/ Epic universal stat rune/,
  `$1

  // Legendary equipment — 0.00013%, independent roll.
  if(Math.random()<FART_GUARD_LEGENDARY_GEAR_CHANCE){
    const it=(typeof v271MakeDungeon41LegendaryItem==='function')
      ?v271MakeDungeon41LegendaryItem()
      :genItem(20,false,'legendary');
    if(it){
      LOOT.push({
        x:e.x+(Math.random()-.5)*30,
        y:e.y+(Math.random()-.5)*30,
        kind:'gear',item:it,gear:it,bob:Math.random()*6
      });
    }
  }

  // Epic universal stat rune`
);

ppaPatchRegex(
  'fart pickaxe helpers',
  /function\s+fartMineTick\(mine,dt\)\s*\{\s*if\(!INV\.fartPickaxe\)return;/,
  `const FART_PICKAXE_DURATION_MS=4*60*60*1000;
function fartPickaxeBagItem(){
  return (INV.bag||[]).find(function(it){return it&&it.fartPickaxe===true})||null;
}
function fartRemovePickaxeItem(){
  if(!Array.isArray(INV.bag))return;
  for(let i=INV.bag.length-1;i>=0;i--)if(INV.bag[i]&&INV.bag[i].fartPickaxe===true)INV.bag.splice(i,1);
}
function fartMakePickaxeItem(expiresAt){
  return {
    uid:'fart_pickaxe_'+Date.now().toString(36),
    name:'Обычная шахтёрская кирка',
    slot:'tool',
    rarity:'common',
    icon:'⛏',
    ic:'⛏',
    img:'',
    classKey:'all',
    className:'Все классы',
    enh:0,level:0,sell:0,
    stats:{},
    bonusText:'Фарт Зона · 4 часа · добыча +10% · редкие +5% · синие +3% · эпик с охранников 0.0003% · легендарный шмот недоступен',
    bound:true,tradeLocked:true,blackMarket:false,
    fartPickaxe:true,
    expiresAt:Math.max(0,Number(expiresAt)||0)
  };
}
function fartNormalizePickaxe(){
  if(!Array.isArray(INV.bag))INV.bag=[];
  let until=Math.max(0,Number(INV.fartPickaxeUntil)||0);
  let item=fartPickaxeBagItem();
  // Migrate the old permanent boolean to one fresh 4-hour common pickaxe.
  if(INV.fartPickaxe===true&&!until){
    until=Date.now()+FART_PICKAXE_DURATION_MS;
    INV.fartPickaxeUntil=until;
  }
  if(until>Date.now()){
    INV.fartPickaxe=true;
    if(!item){
      item=fartMakePickaxeItem(until);
      INV.bag.push(item);
    }else item.expiresAt=until;
    return true;
  }
  if(until||INV.fartPickaxe||item){
    INV.fartPickaxe=false;INV.fartPickaxeUntil=0;
    fartRemovePickaxeItem();
    try{saveGame();sendInvState();sendBlacksmithState();updateUI()}catch(_){}
  }
  return false;
}
function fartHasPickaxe(){return fartNormalizePickaxe()}
function fartPickaxeRemainingText(){
  if(!fartHasPickaxe())return '';
  const ms=Math.max(0,Number(INV.fartPickaxeUntil)-Date.now());
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);
  return h+'ч '+String(m).padStart(2,'0')+'м';
}

function fartMineTick(mine,dt){
  if(!fartHasPickaxe())return;`
);


ppaPatchRegex(
  'fart slag inventory helpers',
  /(function fartPickaxeRemainingText\(\)\{[\s\S]*?\n\})/,
  `$1
function fartSlagBagItem(){
  return (INV.bag||[]).find(function(it){return it&&it.fartSlag===true})||null;
}
function fartMakeSlagItem(count){
  const n=Math.max(1,Math.floor(Number(count)||1));
  return {
    uid:'fart_slag',
    name:'Шлак',
    kind:'resource',
    rarity:'common',
    icon:'◆',ic:'◆',
    img:FART_SLAG_IMG,
    count:n,qty:n,amount:n,
    stackable:true,
    sell:0,
    stats:{},
    bonusText:'Шлак из рудников Фарт-зоны · можно продать только местному NPC.',
    bound:true,tradeLocked:true,blackMarket:false,
    fartSlag:true
  };
}
function fartGiveSlag(amount){
  amount=Math.max(1,Math.floor(Number(amount)||1));
  if(!Array.isArray(INV.bag))INV.bag=[];
  let it=fartSlagBagItem();
  if(!it){
    if(INV.bag.length>=100){
      showPickup('Сумка полна · Шлак не помещается','#ff8c78');
      return 0;
    }
    it=fartMakeSlagItem(amount);
    INV.bag.push(it);
  }else{
    const n=Math.max(0,Math.floor(Number(it.count||it.qty||it.amount)||0))+amount;
    it.count=n;it.qty=n;it.amount=n;it.img=FART_SLAG_IMG;
  }
  try{saveGame();sendInvState();sendBlacksmithState();updateUI()}catch(_){}
  return amount;
}
function fartSellAllSlag(){
  if(!Array.isArray(INV.bag))INV.bag=[];
  const idx=INV.bag.findIndex(function(it){return it&&it.fartSlag===true});
  if(idx<0){showPickup('Шлака в сумке нет','#c7c7c7');return 0}
  const it=INV.bag[idx];
  const n=Math.max(1,Math.floor(Number(it.count||it.qty||it.amount)||1));
  const total=n*FART_SLAG_SELL_PRICE;
  INV.bag.splice(idx,1);
  INV.ppa=(Number(INV.ppa)||0)+total;
  try{saveGame();sendInvState();sendBlacksmithState();updateUI()}catch(_){}
  showPickup('Шлак ×'+n+' продан · +'+total+' PPA','#ffb35c');
  return total;
}`
);

ppaPatchRegex(
  'fart auto button pickaxe active check',
  /if\(!INV\.fartPickaxe\)\{/g,
  "if(!fartHasPickaxe()){",
  true
);

ppaPatchRegex(
  'fart update mining active checks',
  /FART_ZONE_STATE\.autoMining&&!INV\.fartPickaxe/g,
  "FART_ZONE_STATE.autoMining&&!fartHasPickaxe()",
  true
);
ppaPatchRegex(
  'fart update mining positive checks',
  /FART_ZONE_STATE\.autoMining&&INV\.fartPickaxe/g,
  "FART_ZONE_STATE.autoMining&&fartHasPickaxe()",
  true
);

ppaPatchRegex(
  'fart pickaxe purchase 4h inventory item',
  /INV\.ppa=\(Number\(INV\.ppa\)\|\|0\)-price;\s*INV\.fartPickaxe=true;\s*saveGame\(\);/,
  `if((INV.bag||[]).length>=100){
        showPickup('Сумка полна · освободи 1 слот для кирки','#ff8c78');
        return;
      }
      INV.ppa=(Number(INV.ppa)||0)-price;
      fartRemovePickaxeItem();
      INV.fartPickaxeUntil=Date.now()+FART_PICKAXE_DURATION_MS;
      INV.fartPickaxe=true;
      INV.bag.push(fartMakePickaxeItem(INV.fartPickaxeUntil));
      saveGame();`
);

ppaPatchRegex(
  'fart pickaxe purchase message 4h',
  /showPickup\('⛏ Кирка куплена · −200 PPA','#9dff91'\);/,
  "showPickup('⛏ Обычная кирка · 4 часа · −200 PPA','#9dff91');"
);

ppaPatchRegex(
  'fart pickaxe guide purchased status',
  /if\(ps\)ps\.textContent='Кирка: куплена · добыча доступна';/,
  "if(ps)ps.textContent='Кирка: в сумке · осталось '+fartPickaxeRemainingText();"
);

ppaPatchRegex(
  'fart pickaxe guide live status',
  /if\(ps\)ps\.textContent=INV\.fartPickaxe\?'Кирка: куплена · добыча доступна':'Кирка: нет · без неё добыча не работает';/,
  "const _hasPickaxe=fartHasPickaxe();if(ps)ps.textContent=_hasPickaxe?('Кирка: в сумке · осталось '+fartPickaxeRemainingText()):'Кирка: нет · без неё добыча не работает';"
);

ppaPatchRegex(
  'fart pickaxe guide button live state',
  /pb\.disabled=!!INV\.fartPickaxe;\s*pb\.textContent=INV\.fartPickaxe\?'✓ КИРКА КУПЛЕНА':'⛏ КУПИТЬ КИРКУ · 200 PPA';\s*pb\.style\.opacity=INV\.fartPickaxe\?'\.65':'1';/,
  "pb.disabled=_hasPickaxe;pb.textContent=_hasPickaxe?('✓ КИРКА · '+fartPickaxeRemainingText()):'⛏ КУПИТЬ КИРКУ · 200 PPA';pb.style.opacity=_hasPickaxe?'.65':'1';"
);

ppaPatchRegex(
  'fart guide top purchase check',
  /if\(INV\.fartPickaxe\)\{\s*showPickup\('Кирка уже куплена','#9dff91'\);/,
  "if(fartHasPickaxe()){showPickup('Кирка уже в сумке · осталось '+fartPickaxeRemainingText(),'#9dff91');"
);

ppaPatchRegex(
  'fart guard inspect legendary gear',
  /(if\(e&&e\.isFartGuard\)return \[\s*\['Эпический шмот\/оружие · случайный','0\.001%'\],)/,
  "$1\n      ['Легендарный шмот/оружие · случайный','0.00013%'],"
);

ppaPatchRegex(
  'fart guard final inspect before elite branch',
  /window\.mobDropInfo=function\(e\)\{\s*if\(!e\)return \[\];/,
  `window.mobDropInfo=function(e){
  if(!e)return [];
  if(e.isFartGuard)return [
    ['Эпический шмот/оружие · случайный','0.001%'],
    ['Легендарный шмот/оружие · случайный','0.00013%'],
    ['Эпическая универсальная руна','0.00012%'],
    ['Обычная универсальная руна','10%'],
    ['Премиум руна заточки','6%'],
    ['Изумруд Вечности · легендарный ресурс','0.00020%'],
    ['Адская руда · легендарный ресурс','0.00017%'],
    ['Кристалл Бездны · легендарный ресурс','0.00012%']
  ];`
);

ppaPatchRegex(
  'exclude fart pickaxe from auction inventory',
  /\(INV\.bag\|\|\[\]\)\.forEach\(function\(it,idx\)\{\s*if\(!it\)return;/,
  "(INV.bag||[]).forEach(function(it,idx){if(!it||it.fartPickaxe===true)return;"
);

// Transitional Fart checks only verify what this block itself establishes.
// Later v403/v404 patches intentionally replace the 4h helper and bonus formulas.
if(!output.includes("FART_GUARD_LEGENDARY_GEAR_CHANCE=0.0000013") ||
   !output.includes("function fartPickaxeBagItem()") ||
   !output.includes("function fartHasPickaxe()") ||
   !output.includes("Легендарный шмот/оружие · случайный','0.00013%")) {
  throw new Error('Base Fart pickaxe/guard patch did not apply');
}
/* ======================================================================== */

/* === FART PASSIVE MINING ================================================== */
// Mining no longer has its own ON/OFF button. Standing at a cleared mine with
// a valid pickaxe starts production automatically. The mine remains anchored
// while AUTO combat kills its guards, so the combat helper can return the
// character to the same mine and production resumes by itself.
ppaPatchRegex(
  'remove fart auto mining button',
  /<button id="fartAutoMineBtn"[^>]*>[\s\S]*?<\/button>/,
  ''
);

ppaPatchRegex(
  'passive fart mining loop',
  /function\s+updateFartZoneSystem\(\)\s*\{[\s\S]*?\n\}\n\nfunction\s+drawFartZoneMines\(\)/,
  `function fartResolveGuardCollision(){
  if(!P||P.scene!=='fartzone'||!Array.isArray(EN))return;
  const px=Number(P.x),py=Number(P.y);
  if(!Number.isFinite(px)||!Number.isFinite(py))return;
  const playerR=9;
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<EN.length;i++){
      const e=EN[i];
      if(!e||!e.isFartGuard||Number(e.hp)<=0)continue;
      const ex=Number(e.x),ey=Number(e.y);
      if(!Number.isFinite(ex)||!Number.isFinite(ey))continue;
      const mobR=Math.max(16,Math.min(30,Number(e.__ppaFartCollisionRadius)||22));
      const minD=playerR+mobR;
      let dx=Number(P.x)-ex,dy=Number(P.y)-ey;
      let d2=dx*dx+dy*dy;
      if(d2>=minD*minD)continue;
      if(d2<0.0001){dx=1;dy=0;d2=1}
      const d=Math.sqrt(d2);
      const push=Math.min(3.5,minD-d);
      P.x+=dx/d*push;
      P.y+=dy/d*push;
    }
  }
}
function updateFartZoneSystem(){
  if(P.scene!=='fartzone'){
    const b=document.getElementById('fartAutoMineBtn');
    if(b)b.style.display='none';
    FART_ZONE_STATE.activeMineId=null;
    FART_ZONE_STATE.slagSince=0;
    return;
  }
  if(!FART_ZONE_STATE.ready)fartInitZone();

  // Fart guard balance lives in the packed game scope so it can always reach EN.
  // Apply exactly once per guard and preserve already-taken damage.
  if(Array.isArray(EN)){
    for(let _fi=0;_fi<EN.length;_fi++){
      const _fg=EN[_fi];
      if(!_fg||!_fg.isFartGuard||_fg.__ppaFartHp24000===true)continue;
      const _oldMax=Math.max(1,Number(_fg.mhp)||Number(_fg.hp)||1);
      const _oldHp=Number(_fg.hp);
      const _missingHp=Number.isFinite(_oldHp)?Math.max(0,_oldMax-_oldHp):0;
      _fg.__ppaFartHp24000=true;
      _fg.__ppaFartHpBefore24000=_oldMax;
      _fg.mhp=24000;
      if(Number.isFinite(_oldHp)&&_oldHp>0)_fg.hp=Math.max(1,Math.min(24000,24000-_missingHp));
    }
  }

  const now=Date.now();
  const dt=Math.max(0,Math.min(250,now-(FART_ZONE_STATE.lastTick||now)));
  FART_ZONE_STATE.lastTick=now;

  // Small body collision for the enlarged Fart guard sprites.
  fartResolveGuardCollision();

  // Slag: one piece every 40 seconds while continuously standing on any mine.
  const _slagMine=fartNearestMine(FART_MINE_RADIUS);
  if(_slagMine){
    if(!Number(FART_ZONE_STATE.slagSince))FART_ZONE_STATE.slagSince=now;
    const _slagElapsed=now-Number(FART_ZONE_STATE.slagSince||now);
    if(_slagElapsed>=FART_SLAG_INTERVAL_MS){
      const _slagGot=fartGiveSlag(1);
      FART_ZONE_STATE.slagSince=now;
      if(_slagGot>0)showPickup('Шлак +'+_slagGot,'#ff8b38');
    }
  }else{
    FART_ZONE_STATE.slagSince=0;
  }

  // Every killed guard returns exactly 30 minutes after its queued death.
  // Keep our own deadline on the queue item so older packed MIN/MAX values cannot interfere.
  for(let i=FART_ZONE_STATE.respawns.length-1;i>=0;i--){
    const q=FART_ZONE_STATE.respawns[i];
    if(!Number(q.__ppaRespawn30mAt))q.__ppaRespawn30mAt=now+30*60*1000;
    if(now<Number(q.__ppaRespawn30mAt))continue;
    const mine=fartMineById(q.mineId);
    if(mine)fartSpawnGuard(mine,q.index);
    FART_ZONE_STATE.respawns.splice(i,1);
  }


  const oldBtn=document.getElementById('fartAutoMineBtn');
  if(oldBtn)oldBtn.style.display='none';
  FART_ZONE_STATE.activeMineId=null;

  // No pickaxe = no production. Expiration cleanup is handled here as well.
  if(!fartHasPickaxe())return;

  const near=fartNearestMine(FART_MINE_RADIUS);
  let mine=FART_ZONE_STATE.autoMineId?fartMineById(FART_ZONE_STATE.autoMineId):null;

  // Walking onto a mine anchors it automatically. A different mine takes over
  // only after the player has genuinely left the old one, so AUTO combat cannot
  // accidentally change the mining target while chasing guards.
  if(near&&(!mine||String(near.id)!==String(mine.id))){
    const oldDist=mine?Math.hypot(P.x-mine.x,P.y-mine.y):Infinity;
    if(!mine||oldDist>FART_MINE_RADIUS*1.25){
      FART_ZONE_STATE.autoMineId=near.id;
      mine=near;
    }
  }else if(!mine&&near){
    FART_ZONE_STATE.autoMineId=near.id;
    mine=near;
  }

  if(!mine)return;

  const d=Math.hypot(P.x-mine.x,P.y-mine.y);
  // Guards pause the mine but never clear its anchor. AUTO combat can therefore
  // kill them, return to this exact mine, and mining resumes automatically.
  if(d<=FART_MINE_RADIUS&&!fartMineHasLivingGuard(mine)){
    FART_ZONE_STATE.activeMineId=mine.id;
    fartMineTick(mine,dt);
  }
}

function drawFartZoneMines()`
);

if(output.includes('id="fartAutoMineBtn" type="button" onclick="fartToggleAutoMining()"') ||
   !output.includes("if(d<=FART_MINE_RADIUS&&!fartMineHasLivingGuard(mine))") ||
   !output.includes("FART_ZONE_STATE.autoMineId=near.id") ||
   !output.includes("q.__ppaRespawn30mAt=now+30*60*1000")) {
  throw new Error('Passive Fart mining/30-minute respawn patch did not apply');
}
/* ======================================================================== */

/* === TWO FART PICKAXE TIERS ============================================== */
ppaPatchRegex(
  'fart pickaxe tier durations',
  /const FART_PICKAXE_DURATION_MS=4\*60\*60\*1000;/,
  "const FART_PICKAXE_COMMON_DURATION_MS=4*60*60*1000;\nconst FART_PICKAXE_LEGENDARY_DURATION_MS=14*60*60*1000;\nconst FART_PICKAXE_DURATION_MS=FART_PICKAXE_COMMON_DURATION_MS;"
);

ppaPatchRegex(
  'fart pickaxe item supports common and legendary',
  /function fartMakePickaxeItem\(expiresAt\)\{[\s\S]*?\n\s*\};\n\}/,
  `function fartMakePickaxeItem(expiresAt,tier){
  tier=tier==='legendary'?'legendary':'common';
  const legendary=tier==='legendary';
  return {
    uid:'fart_pickaxe_'+tier+'_'+Date.now().toString(36),
    name:legendary?'Легендарная шахтёрская кирка':'Обычная шахтёрская кирка',
    slot:'tool',
    rarity:legendary?'legendary':'common',
    icon:'⛏',
    ic:'⛏',
    img:'',
    classKey:'all',
    className:'Все классы',
    enh:0,level:0,sell:0,
    stats:{},
    bonusText:legendary
      ?'Фарт Зона · 14 часов · добыча +50% · редкие +30% · синие +20% · эпик с охранников 0.001% · легендарный шмот 0.00013%'
      :'Фарт Зона · 4 часа · добыча +10% · редкие +5% · синие +3% · эпик с охранников 0.0003% · легендарный шмот недоступен',
    bound:true,tradeLocked:true,blackMarket:false,
    fartPickaxe:true,
    fartPickaxeTier:tier,
    expiresAt:Math.max(0,Number(expiresAt)||0)
  };
}`
);

ppaPatchRegex(
  'fart pickaxe tier helper',
  /function fartHasPickaxe\(\)\{return fartNormalizePickaxe\(\)\}/,
  `function fartHasPickaxe(){return fartNormalizePickaxe()}
function fartPickaxeTier(){
  const it=fartPickaxeBagItem();
  return it&&it.fartPickaxeTier==='legendary'?'legendary':'common';
}`
);

ppaPatchRegex(
  'migrate old pickaxe item tier',
  /\}else item\.expiresAt=until;/,
  "}else{item.expiresAt=until;if(!item.fartPickaxeTier)item.fartPickaxeTier='common';}"
);

ppaPatchRegex(
  'common pickaxe grant tier',
  /INV\.bag\.push\(fartMakePickaxeItem\(INV\.fartPickaxeUntil\)\);/,
  "INV.bag.push(fartMakePickaxeItem(INV.fartPickaxeUntil,'common'));"
);

ppaPatchRegex(
  'tiered fart mining bonuses',
  /const _pickaxeBonus=\(typeof fartHasPickaxe==='function'&&fartHasPickaxe\(\)\);[\s\S]*?else if\(Math\.random\(\)<\(0\.70\*\(_pickaxeBonus\?1\.10:1\)\)\)rarity='common';/,
  `const _pickaxeBonus=(typeof fartHasPickaxe==='function'&&fartHasPickaxe());
  const _pickaxeTier=_pickaxeBonus&&typeof fartPickaxeTier==='function'?fartPickaxeTier():'common';
  const _blueMul=_pickaxeBonus?(_pickaxeTier==='legendary'?1.20:1.03):1;
  const _rareMul=_pickaxeBonus?(_pickaxeTier==='legendary'?1.30:1.05):1;
  const _resourceMul=_pickaxeBonus?(_pickaxeTier==='legendary'?1.50:1.10):1;
  if(Math.random()<(0.25*_blueMul))rarity='rare';
  else if(Math.random()<(0.55*_rareMul))rarity='uncommon';
  else if(Math.random()<(0.70*_resourceMul))rarity='common';`
);

ppaPatchRegex(
  'add legendary pickaxe shop button',
  /('<button id="fartGuidePickaxe"[\s\S]*?<\/button>'\+)/,
  "$1\n      '<button id=\"fartGuideLegendPickaxe\" style=\"width:100%;height:42px;margin-bottom:8px;border:1px solid #d27a18;border-radius:8px;background:#3a1e08;color:#ffbd58;font-weight:bold\">🔥 ЛЕГЕНДАРНАЯ КИРКА · 2120 PPA · 14 Ч</button>'+"
);

ppaPatchRegex(
  'hide legacy sell all slag gold button',
  /(<button id="fartGuideSell" style=")([^"]*)(">ПРОДАТЬ ВЕСЬ ШЛАК<\/button>)/,
  "$1display:none;$2$3"
);

ppaPatchRegex(
  'fart npc slag info uses bag and ppa',
  /const n=Math\.max\(0,Math\.floor\(Number\(INV\.fartJunk\)\|\|0\)\);\s*const info=shade\.querySelector\('#fartGuideJunk'\);\s*if\(info\)info\.textContent='Шлак: '\+n\+' шт\. · цена продажи: 10 золота\/шт\.';/,
  "const _slagInfoItem=(typeof fartSlagBagItem==='function'?fartSlagBagItem():null);\n  const n=_slagInfoItem?Math.max(0,Math.floor(Number(_slagInfoItem.count||_slagInfoItem.qty||_slagInfoItem.amount)||0)):0;\n  const info=shade.querySelector('#fartGuideJunk');\n  if(info)info.textContent='Шлак: '+n+' шт. · цена продажи: 2 PPA/шт.';"
);

ppaPatchRegex(
  'add slag sale button to fart npc',
  /('<button id="fartGuideSell"[\s\S]*?<\/button>'\+)/,
  "$1\n      '<button id=\"fartGuideSlagSell\" style=\"width:100%;height:42px;margin-bottom:8px;border:1px solid #8f4a20;border-radius:8px;background:#2d160d;color:#ffad62;font-weight:bold\">♨ ПРОДАТЬ ШЛАК · 2 PPA/ШТ</button>'+"
);



ppaPatchRegex(
  'slag sale handler at fart npc',
  /(shade\.querySelector\('#fartGuideSell'\)\.onclick=function\(\)\{)/,
  `const _slagSellBtn=shade.querySelector('#fartGuideSlagSell');
    if(_slagSellBtn)_slagSellBtn.onclick=function(){fartSellAllSlag()};
    $1`
);

ppaPatchRegex(
  'legendary pickaxe purchase handler',
  /(shade\.querySelector\('#fartGuideSell'\)\.onclick=function\(\)\{)/,
  `shade.querySelector('#fartGuideLegendPickaxe').onclick=function(){
      if(fartHasPickaxe()){
        showPickup('Кирка уже в сумке · осталось '+fartPickaxeRemainingText(),'#9dff91');
        return;
      }
      const price=2120;
      if((Number(INV.ppa)||0)<price){
        showPickup('Не хватает PPA · легендарная кирка стоит 2120','#ff8c78');
        return;
      }
      if((INV.bag||[]).length>=100){
        showPickup('Сумка полна · освободи 1 слот для кирки','#ff8c78');
        return;
      }
      INV.ppa=(Number(INV.ppa)||0)-price;
      fartRemovePickaxeItem();
      INV.fartPickaxeUntil=Date.now()+FART_PICKAXE_LEGENDARY_DURATION_MS;
      INV.fartPickaxe=true;
      INV.bag.push(fartMakePickaxeItem(INV.fartPickaxeUntil,'legendary'));
      saveGame();
      try{sendInvState();sendBlacksmithState();updateUI()}catch(_){}
      showPickup('🔥 Легендарная кирка · 14 часов · −2120 PPA','#ffae45');
      const ps=shade.querySelector('#fartGuidePickaxeStatus');
      const pb=shade.querySelector('#fartGuidePickaxe');
      const lb=shade.querySelector('#fartGuideLegendPickaxe');
      if(ps)ps.textContent='Легендарная кирка: в сумке · осталось '+fartPickaxeRemainingText();
      if(pb){pb.disabled=true;pb.style.opacity='.55'}
      if(lb){lb.textContent='✓ ЛЕГЕНДАРНАЯ КИРКА · '+fartPickaxeRemainingText();lb.disabled=true;lb.style.opacity='.65'}
    };
    $1`
);

ppaPatchRegex(
  'pickaxe shop status both tiers',
  /const pb=shade\.querySelector\('#fartGuidePickaxe'\);\s*const _hasPickaxe=fartHasPickaxe\(\);if\(ps\)ps\.textContent=_hasPickaxe\?\('Кирка: в сумке · осталось '\+fartPickaxeRemainingText\(\)\):'Кирка: нет · без неё добыча не работает';\s*if\(pb\)\{[\s\S]*?\n\s*\}/,
  `const pb=shade.querySelector('#fartGuidePickaxe');
  const lb=shade.querySelector('#fartGuideLegendPickaxe');
  const _hasPickaxe=fartHasPickaxe();
  const _pickTier=_hasPickaxe?fartPickaxeTier():'';
  if(ps)ps.textContent=_hasPickaxe
    ?((_pickTier==='legendary'?'Легендарная':'Обычная')+' кирка: в сумке · осталось '+fartPickaxeRemainingText())
    :'Кирка: нет · без неё добыча не работает';
  if(pb){
    pb.disabled=_hasPickaxe;
    pb.textContent=_hasPickaxe&&_pickTier==='common'?('✓ ОБЫЧНАЯ КИРКА · '+fartPickaxeRemainingText()):'⛏ ОБЫЧНАЯ КИРКА · 200 PPA · 4 Ч';
    pb.style.opacity=_hasPickaxe?'.55':'1';
  }
  if(lb){
    lb.disabled=_hasPickaxe;
    lb.textContent=_hasPickaxe&&_pickTier==='legendary'?('✓ ЛЕГЕНДАРНАЯ КИРКА · '+fartPickaxeRemainingText()):'🔥 ЛЕГЕНДАРНАЯ КИРКА · 2120 PPA · 14 Ч';
    lb.style.opacity=_hasPickaxe?'.55':'1';
  }`
);

if(!output.includes("FART_PICKAXE_LEGENDARY_DURATION_MS=14*60*60*1000") ||
   !output.includes("fartPickaxeTier:tier") ||
   !output.includes("2120 PPA · 14 Ч") ||
   !output.includes("const _blueMul=_pickaxeBonus?(_pickaxeTier==='legendary'?1.20:1.03):1")) {
  throw new Error('Two-tier Fart pickaxe patch did not apply');
}
/* ======================================================================== */

/* === FART GUARD GEAR GATED BY PICKAXE =================================== */
ppaPatchRegex(
  'fart guard gear chance helper',
  /function\s+fartGuardRareDrops\(e\)\s*\{/,
  `function fartGuardGearDropChances(){
  const has=(typeof fartHasPickaxe==='function')?fartHasPickaxe():false;
  if(!has)return {epic:0,legendary:0,tier:'none'};
  const tier=(typeof fartPickaxeTier==='function')?fartPickaxeTier():'common';
  if(tier==='legendary')return {epic:0.00001,legendary:0.0000013,tier:'legendary'};
  return {epic:0.000003,legendary:0,tier:'common'};
}
function fartGuardRareDrops(e){`
);

ppaPatchRegex(
  'fart guard epic chance from active pickaxe',
  /\/\/ Epic equipment — 0\.001%\.\s*if\(Math\.random\(\)<FART_GUARD_EPIC_GEAR_CHANCE\)\{/,
  `// Epic equipment depends on the active pickaxe:
  // no pickaxe 0%; common 0.0003%; legendary 0.001%.
  const _fartGearDrop=fartGuardGearDropChances();
  if(_fartGearDrop.epic>0&&Math.random()<_fartGearDrop.epic){`
);

ppaPatchRegex(
  'fart guard legendary chance only with legendary pickaxe',
  /\/\/ Legendary equipment — 0\.00013%, independent roll\.\s*if\(Math\.random\(\)<FART_GUARD_LEGENDARY_GEAR_CHANCE\)\{/,
  `// Legendary equipment is unlocked only by the legendary pickaxe.
  if(_fartGearDrop.legendary>0&&Math.random()<_fartGearDrop.legendary){`
);

ppaPatchRegex(
  'fart guard inspect follows active pickaxe',
  /if\(e\.isFartGuard\)return \[\s*\['Эпический шмот\/оружие · случайный','0\.001%'\],\s*\['Легендарный шмот\/оружие · случайный','0\.00013%'\],/,
  `if(e.isFartGuard){
    const _gear=(typeof fartGuardGearDropChances==='function')
      ?fartGuardGearDropChances()
      :{epic:0,legendary:0,tier:'none'};
    const _epicPct=_gear.epic===0.00001?'0.001%':(_gear.epic===0.000003?'0.0003%':'0%');
    const _legendPct=_gear.legendary===0.0000013?'0.00013%':'0%';
    return [
    ['Эпический шмот/оружие · случайный',_epicPct],
    ['Легендарный шмот/оружие · случайный',_legendPct],`
);

ppaPatchRegex(
  'close dynamic fart guard inspect block',
  /(\['Кристалл Бездны · легендарный ресурс','0\.00012%'\]\s*\n\s*\];)/,
  "$1\n  }"
);

if(!output.includes("return {epic:0.000003,legendary:0,tier:'common'}") ||
   !output.includes("return {epic:0.00001,legendary:0.0000013,tier:'legendary'}") ||
   !output.includes("if(_fartGearDrop.epic>0&&Math.random()<_fartGearDrop.epic)") ||
   !output.includes("if(_fartGearDrop.legendary>0&&Math.random()<_fartGearDrop.legendary)") ||
   !output.includes("const _epicPct=_gear.epic===0.00001?'0.001%':(_gear.epic===0.000003?'0.0003%':'0%')") ||
   !output.includes("const _legendPct=_gear.legendary===0.0000013?'0.00013%':'0%'")) {
  throw new Error('Fart guard gear gating by pickaxe did not apply');
}
/* ======================================================================== */

/* === FINAL FART PICKAXE AUDIT ============================================ */
if(!output.includes("FART_PICKAXE_COMMON_DURATION_MS=4*60*60*1000") ||
   !output.includes("FART_PICKAXE_LEGENDARY_DURATION_MS=14*60*60*1000") ||
   !output.includes("fartPickaxeTier:tier") ||
   !output.includes("2120 PPA · 14 Ч") ||
   !output.includes("200 PPA · 4 Ч") ||
   !output.includes("const _blueMul=_pickaxeBonus?(_pickaxeTier==='legendary'?1.20:1.03):1") ||
   !output.includes("const _rareMul=_pickaxeBonus?(_pickaxeTier==='legendary'?1.30:1.05):1") ||
   !output.includes("const _resourceMul=_pickaxeBonus?(_pickaxeTier==='legendary'?1.50:1.10):1") ||
   !output.includes("return {epic:0.000003,legendary:0,tier:'common'}") ||
   !output.includes("return {epic:0.00001,legendary:0.0000013,tier:'legendary'}") ||
   !output.includes("эпик с охранников 0.0003% · легендарный шмот недоступен") ||
   !output.includes("эпик с охранников 0.001% · легендарный шмот 0.00013%")) {
  throw new Error('Final Fart pickaxe tier audit failed');
}
/* ======================================================================== */

/* === TAP SELECT / HOLD INSPECT =========================================== */
// Phone/tablet inventory UX:
//   tap = select item for the current action
//   hold ~0.9s = inspect stats
// Scrolling cancels the hold once the finger moves more than ~12px.

ppaPatchRegex(
  'keeper storage hold helper',
  /function\s+inspectStorageItem\(it,side\)\s*\{/,
  `function bindHoldInfo(el,fn){
  if(!el||typeof fn!=='function')return;
  var timer=0,sx=0,sy=0;
  function cancel(){if(timer){clearTimeout(timer);timer=0}}
  el.addEventListener('pointerdown',function(e){
    cancel();el.__ppaHeld=false;sx=Number(e.clientX)||0;sy=Number(e.clientY)||0;
    timer=setTimeout(function(){timer=0;el.__ppaHeld=true;try{fn()}catch(_){}},900);
  },{passive:true});
  el.addEventListener('pointermove',function(e){
    var dx=(Number(e.clientX)||0)-sx,dy=(Number(e.clientY)||0)-sy;
    if(dx*dx+dy*dy>144)cancel();
  },{passive:true});
  el.addEventListener('pointerup',cancel,{passive:true});
  el.addEventListener('pointercancel',cancel,{passive:true});
  el.addEventListener('pointerleave',cancel,{passive:true});
}
function inspectStorageItem(it,side){`
);

ppaPatchRegex(
  'keeper storage tap selects only',
  /s\.onclick=\(\)=&gt;\{\s*if\(!it\)\{selected=\{side:null,idx:-1\};render\(\);return\}\s*selected=\{side:side,idx:i\};render\(\);\s*inspectStorageItem\(it,side\);\s*\};/,
  `if(it)bindHoldInfo(s,function(){inspectStorageItem(it,side)});
    s.onclick=function(){
      if(s.__ppaHeld){s.__ppaHeld=false;return}
      if(!it){selected={side:null,idx:-1};render();return}
      selected={side:side,idx:i};render();
    };`
);

ppaPatchRegex(
  'auction hold helper',
  /function\s+inspectAuctionItem\(it,context\)\s*\{/,
  `function bindHoldInfo(el,fn){
  if(!el||typeof fn!=='function')return;
  var timer=0,sx=0,sy=0;
  function cancel(){if(timer){clearTimeout(timer);timer=0}}
  el.addEventListener('pointerdown',function(e){
    cancel();el.__ppaHeld=false;sx=Number(e.clientX)||0;sy=Number(e.clientY)||0;
    timer=setTimeout(function(){timer=0;el.__ppaHeld=true;try{fn()}catch(_){}},900);
  },{passive:true});
  el.addEventListener('pointermove',function(e){
    var dx=(Number(e.clientX)||0)-sx,dy=(Number(e.clientY)||0)-sy;
    if(dx*dx+dy*dy>144)cancel();
  },{passive:true});
  el.addEventListener('pointerup',cancel,{passive:true});
  el.addEventListener('pointercancel',cancel,{passive:true});
  el.addEventListener('pointerleave',cancel,{passive:true});
}
function inspectAuctionItem(it,context){`
);

ppaPatchRegex(
  'auction sell tap selects hold inspects',
  /d\.onclick=\(\)=&gt;\{selectItem\(it\.ref\);inspectAuctionItem\(it,&#x27;Аукцион · выставление&#x27;\);\};sellGrid\.appendChild\(d\)/,
  `bindHoldInfo(d,function(){inspectAuctionItem(it,'Аукцион · выставление')});
    d.onclick=function(){if(d.__ppaHeld){d.__ppaHeld=false;return}selectItem(it.ref)};
    sellGrid.appendChild(d)`
);

ppaPatchRegex(
  'blacksmith hold helper',
  /function\s+inspectSmithItem\(it,context\)\s*\{/,
  `function bindHoldInfo(el,fn){
  if(!el||typeof fn!=='function')return;
  var timer=0,sx=0,sy=0;
  function cancel(){if(timer){clearTimeout(timer);timer=0}}
  el.addEventListener('pointerdown',function(e){
    cancel();el.__ppaHeld=false;sx=Number(e.clientX)||0;sy=Number(e.clientY)||0;
    timer=setTimeout(function(){timer=0;el.__ppaHeld=true;try{fn()}catch(_){}},900);
  },{passive:true});
  el.addEventListener('pointermove',function(e){
    var dx=(Number(e.clientX)||0)-sx,dy=(Number(e.clientY)||0)-sy;
    if(dx*dx+dy*dy>144)cancel();
  },{passive:true});
  el.addEventListener('pointerup',cancel,{passive:true});
  el.addEventListener('pointercancel',cancel,{passive:true});
  el.addEventListener('pointerleave',cancel,{passive:true});
}
var PPA_SMITH_EMERALD_IMG='${PPA_APPROVED_EMERALD_ART.data}';
function ppaSmithCanvasize(root){
  try{
    var host=root&&root.querySelectorAll?root:document;
    var imgs=[];
    if(root&&root.tagName==='IMG')imgs.push(root);
    host.querySelectorAll('img').forEach(function(x){imgs.push(x)});
    imgs.forEach(function(img){
      if(!img||img.__ppaCanvasized)return;
      if(img.id==='enhSrcImg'||img.id==='enhDstImg'){
        img.__ppaCanvasizingSrc=String(img.currentSrc||img.getAttribute('src')||img.src||'');
        img.style.setProperty('object-fit','contain','important');
        img.style.setProperty('image-rendering','auto','important');
        return;
      }
      var matSlot=null,matName='',isEmerald=false;
      try{
        matSlot=img.closest?img.closest('[data-ppa-material-name]'):null;
        matName=String(matSlot&&matSlot.dataset&&matSlot.dataset.ppaMaterialName||'');
        isEmerald=/изумруд/i.test(matName);
        if(isEmerald){
          if(String(img.getAttribute('src')||'')!==PPA_SMITH_EMERALD_IMG)img.setAttribute('src',PPA_SMITH_EMERALD_IMG);
          img.style.setProperty('max-width','100%','important');
          img.style.setProperty('max-height','100%','important');
          img.style.setProperty('object-fit','contain','important');
          if(matSlot)matSlot.style.setProperty('overflow','hidden','important');
        }
      }catch(_){}
      var src=String(img.currentSrc||img.getAttribute('src')||img.src||'');
      if(!src)return;

      // Canonical legendary art is a live 256px file. Keep it as <img> so
      // blacksmith selection can freely change src on every rerender.
      if(src.indexOf('/assets/legendary/')>=0){
        img.__ppaCanvasizingSrc=src;
        img.style.setProperty('object-fit','contain','important');
        img.style.setProperty('image-rendering','auto','important');
        return;
      }

      // Dynamic smith tabs hydrate rare/legendary art just after render.
      // Never replace the image until THIS exact source has loaded successfully.
      if(img.__ppaCanvasizingSrc===src)return;
      img.__ppaCanvasizingSrc=src;

      var im=new Image();
      im.onload=function(){
        try{
          if(!img||!img.parentNode){return}
          var liveSrc=String(img.currentSrc||img.getAttribute('src')||img.src||'');
          if(liveSrc!==src){
            img.__ppaCanvasizingSrc='';
            requestAnimationFrame(function(){ppaSmithCanvasize(img)});
            return;
          }

          var c=document.createElement('canvas');
          c.className=img.className||'';
          c.style.cssText=img.style.cssText||'';
          try{
            var cs=getComputedStyle(img);
            if(!c.style.width)c.style.width=cs.width;
            if(!c.style.height)c.style.height=cs.height;
            c.style.objectFit='contain';
          }catch(_){}
          c.setAttribute('aria-hidden','true');
          c.style.pointerEvents='none';

          var rect=img.getBoundingClientRect();
          var w=Math.max(24,Math.round(rect.width||img.width||48));
          var h=Math.max(24,Math.round(rect.height||img.height||48));
          if(isEmerald&&matSlot){
            try{
              var mr=matSlot.getBoundingClientRect();
              var side=Math.max(24,Math.floor(Math.min(Number(mr.width)||48,Number(mr.height)||48)-6));
              w=Math.min(w,side);h=Math.min(h,side);
              c.style.setProperty('width',side+'px','important');
              c.style.setProperty('height',side+'px','important');
              c.style.setProperty('max-width','100%','important');
              c.style.setProperty('max-height','100%','important');
              c.style.margin='auto';
            }catch(_){}
          }
          var dpr=Math.min(2,window.devicePixelRatio||1);
          c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);

          var ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
          var iw=Math.max(1,im.naturalWidth||im.width||1),ih=Math.max(1,im.naturalHeight||im.height||1);
          var fit=Math.min(c.width/iw,c.height/ih),dw=iw*fit,dh=ih*fit;
          ctx.drawImage(im,(c.width-dw)/2,(c.height-dh)/2,dw,dh);

          img.__ppaCanvasized=true;
          if(img.parentNode)img.parentNode.replaceChild(c,img);
        }catch(_){
          try{img.__ppaCanvasizingSrc=''}catch(__){}
        }
      };
      im.onerror=function(){
        try{img.__ppaCanvasizingSrc=''}catch(_){}
      };
      im.src=src;
    });
  }catch(_){}
}
function ppaSmithRefreshCanvasArt(){
  requestAnimationFrame(function(){ppaSmithCanvasize(document)});
  setTimeout(function(){ppaSmithCanvasize(document)},80);
  setTimeout(function(){ppaSmithCanvasize(document)},240);
}
try{
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      (m.addedNodes||[]).forEach(function(n){
        if(n&&n.nodeType===1)requestAnimationFrame(function(){ppaSmithCanvasize(n)})
      });
      if(m.type==='attributes'&&m.target&&m.target.tagName==='IMG'){
        try{m.target.__ppaCanvasizingSrc=''}catch(_){}
        requestAnimationFrame(function(){ppaSmithCanvasize(m.target)});
      }
    });
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset']});
  document.addEventListener('click',function(){ppaSmithRefreshCanvasArt()},true);
  ppaSmithRefreshCanvasArt();
}catch(_){}
function inspectSmithItem(it,context){`
);

ppaPatchRegex(
  'blacksmith sharpening inventory hides crafting resources',
  /\n\s*Object\.keys\(RES\)\.forEach\(name=&gt;\{\s*const count=\(BS_STATE\.materials&amp;&amp;BS_STATE\.materials\[name\]\)\|\|0;\s*if\(count&gt;0\)cells\.push\(\{kind:&#x27;mat&#x27;,name:name,rarity:RES_RARITY\[name\]\|\|&#x27;common&#x27;,count:count\}\);\s*\}\);/,
  ''
);

ppaPatchRegex(
  'blacksmith legendary rarity option',
  /const\s+enhRarity=document\.getElementById\(&#x27;enhRarity&#x27;\);/,
  `const enhRarity=document.getElementById(&#x27;enhRarity&#x27;);
if(enhRarity&&!enhRarity.querySelector(&#x27;option[value=legendary]&#x27;)){
  const _ppaLegendOpt=document.createElement(&#x27;option&#x27;);
  _ppaLegendOpt.value=&#x27;legendary&#x27;;
  _ppaLegendOpt.textContent=&#x27;Легендарный&#x27;;
  enhRarity.appendChild(_ppaLegendOpt);
}`
);

ppaPatchRegex(
  'blacksmith legendary failure label',
  /if\(rarity===&#x27;epic&#x27;\) return &#x27;откат −1, эпик не сгорает&#x27;;/,
  "if(rarity==='epic') return 'откат −1, эпик не сгорает';\n  if(rarity==='legendary') return 'откат −1, легендарный не сгорает';"
);

ppaPatchRegex(
  'blacksmith Ruri rarity selection',
  /enhRarity\.value=it\.rarity\|\|&#x27;common&#x27;;/,
  "enhRarity.value=(it.ruriLegendary===true||it.petName==='Великий Рури'||it.name==='Великий Рури')?'legendary':(it.rarity||'common');"
);

ppaPatchRegex(
  'blacksmith gear tap selects hold inspects',
  /s\.onclick=\(\)=&gt;\{if\(sharpenable\)selectSmithGear\(c\.idx\);inspectSmithItem\(it,sharpenable\?&#x27;Кузнец · можно выбрать для заточки&#x27;:&#x27;Кузнец · просмотр предмета&#x27;\);\};/,
  `bindHoldInfo(s,function(){inspectSmithItem(it,sharpenable?'Кузнец · можно выбрать для заточки':'Кузнец · просмотр предмета')});
        s.onclick=function(){if(s.__ppaHeld){s.__ppaHeld=false;return}if(sharpenable)selectSmithGear(c.idx)};`
);

ppaPatchRegex(
  'blacksmith material hold inspects',
  /s\.onclick=\(\)=&gt;inspectSmithItem\(\{name:c\.name,kind:&#x27;material&#x27;,rarity:c\.rarity,count:c\.count,img:RES\[c\.name\]\|\|&#x27;&#x27;,icon:&#x27;◆&#x27;\},&#x27;Кузнец · материал&#x27;\);/,
  `if(s&&s.dataset)s.dataset.ppaMaterialName=c.name;
        bindHoldInfo(s,function(){inspectSmithItem({name:c.name,kind:'material',rarity:c.rarity,count:c.count,img:RES[c.name]||'',icon:'◆'},'Кузнец · материал')});
        s.onclick=function(){if(s.__ppaHeld)s.__ppaHeld=false};`
);

ppaPatchRegex(
  'blacksmith stone hold inspects',
  /s\.onclick=\(\)=&gt;inspectSmithItem\(\{name:c\.name,kind:&#x27;stone&#x27;,rarity:c\.rarity,count:c\.count,img:c\.img\|\|&#x27;&#x27;,icon:c\.icon,refId:c\.name\.indexOf\(&#x27;Премиум&#x27;\)&gt;=0\?&#x27;premium&#x27;:\(c\.name\.indexOf\(&#x27;руна&#x27;\)&gt;=0\?&#x27;rune&#x27;:&#x27;normal&#x27;\)\},&#x27;Кузнец · заточка&#x27;\);/,
  `bindHoldInfo(s,function(){inspectSmithItem({name:c.name,kind:'stone',rarity:c.rarity,count:c.count,img:c.img||'',icon:c.icon,refId:c.name.indexOf('Премиум')>=0?'premium':(c.name.indexOf('руна')>=0?'rune':'normal')},'Кузнец · заточка')});
        s.onclick=function(){if(s.__ppaHeld)s.__ppaHeld=false};`
);

ppaPatchRegex(
  'clan storage hold helper',
  /function\s+renderStorage\(\)\s*\{/,
  `function bindHoldInfo(el,fn){
  if(!el||typeof fn!=='function')return;
  var timer=0,sx=0,sy=0;
  function cancel(){if(timer){clearTimeout(timer);timer=0}}
  el.addEventListener('pointerdown',function(e){
    cancel();el.__ppaHeld=false;sx=Number(e.clientX)||0;sy=Number(e.clientY)||0;
    timer=setTimeout(function(){timer=0;el.__ppaHeld=true;try{fn()}catch(_){}},900);
  },{passive:true});
  el.addEventListener('pointermove',function(e){
    var dx=(Number(e.clientX)||0)-sx,dy=(Number(e.clientY)||0)-sy;
    if(dx*dx+dy*dy>144)cancel();
  },{passive:true});
  el.addEventListener('pointerup',cancel,{passive:true});
  el.addEventListener('pointercancel',cancel,{passive:true});
  el.addEventListener('pointerleave',cancel,{passive:true});
}
function renderStorage(){`
);

ppaPatchRegex(
  'clan storage hold inspect instead of tap inspect',
  /document\.querySelectorAll\(&#x27;\.clanInspectCard&#x27;\)\.forEach\(card=&gt;card\.onclick=\(ev\)=&gt;\{\s*if\(ev\.target&amp;&amp;ev\.target\.closest&amp;&amp;ev\.target\.closest\(&#x27;\.clanMoveBtn&#x27;\)\)return;\s*const side=card\.dataset\.side,idx=Number\(card\.dataset\.index\),it=side===&#x27;bag&#x27;\?bag\[idx\]:st\[idx\];\s*if\(it\)parent\.postMessage\(\{type:&#x27;itemInspect&#x27;,item:it,context:side===&#x27;bag&#x27;\?&#x27;Клан · инвентарь&#x27;:&#x27;Клановый склад&#x27;\},&#x27;\*&#x27;\);\s*\}\);/,
  `document.querySelectorAll('.clanInspectCard').forEach(function(card){
    const side=card.dataset.side,idx=Number(card.dataset.index),it=side==='bag'?bag[idx]:st[idx];
    if(it)bindHoldInfo(card,function(){parent.postMessage({type:'itemInspect',item:it,context:side==='bag'?'Клан · инвентарь':'Клановый склад'},'*')});
    card.onclick=function(){if(card.__ppaHeld)card.__ppaHeld=false};
  });`
);

if(!output.includes("timer=setTimeout(function(){timer=0;el.__ppaHeld=true;try{fn()}catch(_){}},900)") ||
   output.includes("selectItem(it.ref);inspectAuctionItem(it,&#x27;Аукцион · выставление&#x27;)") ||
   output.includes("selected={side:side,idx:i};render();\n      inspectStorageItem(it,side);")) {
  throw new Error('Tap-select / hold-inspect UX patch did not apply');
}
/* ======================================================================== */

/* === AUCTION HOLD INSPECT COMPLETE ======================================= */
ppaPatchRegex(
  'auction market item hold inspect',
  /buyTable\.querySelectorAll\(&#x27;\.inspectMarketItem&#x27;\)\.forEach\(el=&gt;el\.onclick=\(\)=&gt;\{let l=\(STATE\.marketLots\|\|\[\]\)\.find\(x=&gt;String\(x\.id\)===String\(el\.dataset\.inspect\)\);if\(l\)inspectAuctionItem\(l\.item\|\|\{\},&#x27;Аукцион · покупка&#x27;\);\}\);/,
  `buyTable.querySelectorAll('.inspectMarketItem').forEach(function(el){
    bindHoldInfo(el,function(){
      let l=(STATE.marketLots||[]).find(function(x){return String(x.id)===String(el.dataset.inspect)});
      if(l)inspectAuctionItem(l.item||{},'Аукцион · покупка');
    });
    el.onclick=function(){if(el.__ppaHeld)el.__ppaHeld=false};
  });`
);

ppaPatchRegex(
  'auction own lot hold inspect',
  /lotsTable\.querySelectorAll\(&#x27;\.inspectOwnLot&#x27;\)\.forEach\(el=&gt;el\.onclick=\(\)=&gt;\{let l=\(STATE\.lots\|\|\[\]\)\.find\(x=&gt;String\(x\.id\)===String\(el\.dataset\.inspect\)\);if\(l\)inspectAuctionItem\(l\.item\|\|\{\},&#x27;Аукцион · мой лот&#x27;\);\}\);/,
  `lotsTable.querySelectorAll('.inspectOwnLot').forEach(function(el){
    bindHoldInfo(el,function(){
      let l=(STATE.lots||[]).find(function(x){return String(x.id)===String(el.dataset.inspect)});
      if(l)inspectAuctionItem(l.item||{},'Аукцион · мой лот');
    });
    el.onclick=function(){if(el.__ppaHeld)el.__ppaHeld=false};
  });`
);

if(output.includes("inspectMarketItem&#x27;).forEach(el=&gt;el.onclick") ||
   output.includes("inspectOwnLot&#x27;).forEach(el=&gt;el.onclick")) {
  throw new Error('Auction hold-inspect completion did not apply');
}
/* ======================================================================== */

/* === BLACKSMITH LEGENDARY CRAFT = CANONICAL HD ONLY ===================== */
ppaPatchRegex(
  'blacksmith legendary craft canonical classGearArt source',
  /function\s+classGearArt\s*\([^)]*\)\s*\{/,
  `$&
  try{
    var _ppaR=String(arguments[0]==null?'':arguments[0]).trim().toLowerCase();
    if(_ppaR==='legendary'||_ppaR==='legend'||_ppaR==='orange'||_ppaR==='gold'||/легендар/.test(_ppaR)){
      var _ppaC=String(arguments[1]==null?'':arguments[1]).trim().toLowerCase();
      var _ppaS=String(arguments[2]==null?'':arguments[2]).trim().toLowerCase();
      var _ppaCA={tank:'tank',warrior:'tank','воин':'tank','танк':'tank',paladin:'paladin','паладин':'paladin',barbarian:'barbarian',berserk:'barbarian',berserker:'barbarian','варвар':'barbarian','берсерк':'barbarian','берсеркер':'barbarian',assassin:'assassin','ассасин':'assassin','асасин':'assassin',gnome:'gnome',gunner:'gnome',cannoner:'gnome','канонир':'gnome','гном':'gnome','гном-канонир':'gnome',archer:'archer','лучник':'archer',mage:'mage','маг':'mage',priest:'priest',cleric:'priest',healer:'priest','жрец':'priest','клирик':'priest'};
      var _ppaSA={pants:'legs',leggings:'legs',leg:'legs','поножи':'legs',helm:'helmet',head:'helmet','шлем':'helmet',chest:'armor',body:'armor','броня':'armor',glove:'gloves',hands:'gloves','перчатки':'gloves',boot:'boots',feet:'boots','сапоги':'boots','оружие':'weapon'};
      _ppaC=_ppaCA[_ppaC]||_ppaC;
      _ppaS=_ppaSA[_ppaS]||_ppaS;
      if(/^(tank|paladin|barbarian|assassin|gnome|archer|mage|priest)$/.test(_ppaC)&&/^(weapon|helmet|armor|legs|gloves|boots)$/.test(_ppaS)){
        return '/assets/legendary/'+_ppaC+'-'+_ppaS+'.webp?v=v514';
      }
    }
  }catch(_){}`
);

if(!/function\s+classGearArt\s*\([^)]*\)\s*\{/.test(output) ||
   !output.includes("return '/assets/legendary/'+_ppaC+'-'+_ppaS+'.webp?v=v514'")){
  throw new Error('Blacksmith canonical legendary craft art/function header missing');
}
/* ======================================================================== */

/* === HOLD PREVIEW RELEASE + WEBVIEW LONGPRESS =========================== */
// Hold preview lifecycle:
//  - item card hold start -> parent marks preview mode
//  - item details open while finger remains down
//  - pointer release/cancel/leave -> parent closes details immediately
// Also suppress Android/Telegram WebView image context menus on bound item cards.

ppaPatchRegex(
  'hold preview start message',
  /timer=setTimeout\(function\(\)\{timer=0;el\.__ppaHeld=true;try\{fn\(\)\}catch\(_\)\{\}\},900\);/g,
  "timer=setTimeout(function(){timer=0;el.__ppaHeld=true;try{parent.postMessage({type:'itemInspectHoldStart'},'*')}catch(_){};try{fn()}catch(_){}},900);",
  true
);

ppaPatchRegex(
  'hold preview release message',
  /el\.addEventListener\('pointerup',cancel,\{passive:true\}\);\s*el\.addEventListener\('pointercancel',cancel,\{passive:true\}\);\s*el\.addEventListener\('pointerleave',cancel,\{passive:true\}\);/g,
  `function releasePreview(){
    if(el.__ppaHeld){try{parent.postMessage({type:'itemInspectHoldEnd'},'*')}catch(_){}}
  }
  el.addEventListener('pointerup',function(){cancel();releasePreview()},{passive:true});
  el.addEventListener('pointercancel',function(){cancel();releasePreview()},{passive:true});
  el.addEventListener('pointerleave',function(){cancel();releasePreview()},{passive:true});`,
  true
);

ppaPatchRegex(
  'disable webview image longpress on item cards',
  /if\(!el\|\|typeof fn!==['"]function['"]\)return;/g,
  `if(!el||typeof fn!=='function')return;
  try{
    el.style.webkitTouchCallout='none';
    el.style.webkitUserSelect='none';
    el.style.userSelect='none';
    el.addEventListener('contextmenu',function(e){e.preventDefault()},false);
    el.querySelectorAll('img').forEach(function(img){
      img.draggable=false;
      img.setAttribute('draggable','false');
      img.style.webkitTouchCallout='none';
      img.style.webkitUserSelect='none';
      img.style.userSelect='none';
    });
  }catch(_){}`,
  true
);

ppaPatchRegex(
  'item inspect hold preview css',
  /#ppaInspectOk\{width:100%;height:42px;margin-top:12px;border:1px solid #875d2a;border-radius:7px;background:linear-gradient\(#422714,#21140b\);color:#f2d28a;font:bold 12px Georgia,serif;letter-spacing:\.08em\}/,
  `#ppaInspectOk{width:100%;height:42px;margin-top:12px;border:1px solid #875d2a;border-radius:7px;background:linear-gradient(#422714,#21140b);color:#f2d28a;font:bold 12px Georgia,serif;letter-spacing:.08em}
#ppaItemInspectShade.holdPreview #ppaItemInspectClose,
#ppaItemInspectShade.holdPreview #ppaInspectOk{display:none!important}
#ppaItemInspectShade.holdPreview #ppaItemInspect{pointer-events:none}
#ppaItemInspectShade.holdPreview{pointer-events:none}`
);

ppaPatchRegex(
  'item inspect hold state variable',
  /var shade=document\.getElementById\('ppaItemInspectShade'\);\s*if\(!shade\)return;/,
  "var shade=document.getElementById('ppaItemInspectShade');\n  if(!shade)return;\n  var holdPreview=false;"
);

ppaPatchRegex(
  'item inspect close clears hold mode',
  /function close\(\)\{shade\.classList\.remove\('on'\);shade\.setAttribute\('aria-hidden','true'\)\}/,
  "function close(){shade.classList.remove('on');shade.classList.remove('holdPreview');shade.setAttribute('aria-hidden','true');holdPreview=false}"
);

ppaPatchRegex(
  'item inspect parent hold lifecycle',
  /window\.addEventListener\('message',function\(e\)\{var d=e\.data\|\|\{\};if\(d\.type==='itemInspect'&&d\.item\)openItem\(d\.item,d\.context\|\|''\)\}\);/,
  `window.addEventListener('message',function(e){
    var d=e.data||{};
    if(d.type==='itemInspectHoldStart'){holdPreview=true;return}
    if(d.type==='itemInspect'&&d.item){
      openItem(d.item,d.context||'');
      if(holdPreview)shade.classList.add('holdPreview');
      return;
    }
    if(d.type==='itemInspectHoldEnd'){
      if(holdPreview||shade.classList.contains('holdPreview'))close();
    }
  });`
);

if(!output.includes("type:'itemInspectHoldStart'") ||
   !output.includes("type:'itemInspectHoldEnd'") ||
   !output.includes("#ppaItemInspectShade.holdPreview #ppaInspectOk") ||
   !output.includes("img.setAttribute('draggable','false')") ||
   !output.includes("if(d.type==='itemInspectHoldEnd')")) {
  throw new Error('Hold-preview release lifecycle did not apply');
}
/* ======================================================================== */

/* === FART PICKAXE INVENTORY SELL + UPGRADE FIX ========================== */
ppaPatchRegex(
  'block fart pickaxe direct inventory sale',
  /function sellFromBag\(idx\)\{var it=INV\.bag\[idx\];if\(!it\)return;/,
  `function sellFromBag(idx){var it=INV.bag[idx];if(!it)return;
  if(it.fartPickaxe===true){
    showPickup('Кирку нельзя продать','#ffb36b');
    return;
  }

  // Inventory gear sale rule:
  // grey/common gear = exactly 100 gold; every higher rarity is protected.
  var _ppaSellSlot=String(it.slot||'').toLowerCase();
  var _ppaIsGear=!!_ppaSellSlot&&_ppaSellSlot!=='tool';
  if(_ppaIsGear){
    var _ppaSellRarity=String(it.rarity||'common').toLowerCase();
    if(_ppaSellRarity!=='common'){
      showPickup('Этот шмот нельзя продать за золото','#ff8c78');
      return;
    }
    it.sell=100;
    it.sellPrice=100;
    it.vendorPrice=100;
    it.goldValue=100;
  }`
);

ppaPatchRegex(
  'pickaxe missing item clears stale timer',
  /if\(until>Date\.now\(\)\)\{\s*INV\.fartPickaxe=true;\s*if\(!item\)\{\s*item=fartMakePickaxeItem\(until\);\s*INV\.bag\.push\(item\);\s*\}else\{item\.expiresAt=until;if\(!item\.fartPickaxeTier\)item\.fartPickaxeTier='common';\}\s*return true;\s*\}/,
  `if(until>Date.now()){
    if(!item){
      // Old bug: the item was sold from inventory but its timer survived.
      // Never resurrect a timed pickaxe from the timer alone.
      INV.fartPickaxe=false;
      INV.fartPickaxeUntil=0;
      try{saveGame();sendInvState();sendBlacksmithState();updateUI()}catch(_){}
      return false;
    }
    INV.fartPickaxe=true;
    item.expiresAt=until;
    if(!item.fartPickaxeTier)item.fartPickaxeTier='common';
    return true;
  }`
);

ppaPatchRegex(
  'legendary pickaxe can replace common',
  /if\(fartHasPickaxe\(\)\)\{\s*showPickup\('Кирка уже в сумке · осталось '\+fartPickaxeRemainingText\(\),'#9dff91'\);\s*return;\s*\}\s*const price=2120;/,
  `const _hasCurrent=fartHasPickaxe();
      const _currentTier=_hasCurrent?fartPickaxeTier():'';
      if(_hasCurrent&&_currentTier==='legendary'){
        showPickup('Легендарная кирка уже активна · осталось '+fartPickaxeRemainingText(),'#ffae45');
        return;
      }
      const price=2120;`
);

ppaPatchRegex(
  'legendary purchase replaces old pickaxe cleanly',
  /INV\.ppa=\(Number\(INV\.ppa\)\|\|0\)-price;\s*fartRemovePickaxeItem\(\);\s*INV\.fartPickaxeUntil=Date\.now\(\)\+FART_PICKAXE_LEGENDARY_DURATION_MS;/,
  `INV.ppa=(Number(INV.ppa)||0)-price;
      fartRemovePickaxeItem();
      INV.fartPickaxe=false;
      INV.fartPickaxeUntil=0;
      INV.fartPickaxeUntil=Date.now()+FART_PICKAXE_LEGENDARY_DURATION_MS;`
);

if(!output.includes("showPickup('Кирку нельзя продать'") ||
   !output.includes("var _ppaIsGear=!!_ppaSellSlot&&_ppaSellSlot!=='tool'") ||
   !output.includes("if(_ppaSellRarity!=='common')") ||
   !output.includes("it.sell=100;") ||
   !output.includes("Never resurrect a timed pickaxe from the timer alone") ||
   !output.includes("_currentTier==='legendary'")) {
  throw new Error('Fart pickaxe direct-sale/upgrade fix did not apply');
}
/* ======================================================================== */

/* === PICKAXE UPGRADE BUTTON STATE ======================================= */
ppaPatchRegex(
  'legendary upgrade allowed with common pickaxe',
  /if\(lb\)\{\s*lb\.disabled=_hasPickaxe;\s*lb\.textContent=_hasPickaxe&&_pickTier==='legendary'\?\('✓ ЛЕГЕНДАРНАЯ КИРКА · '\+fartPickaxeRemainingText\(\)\):'🔥 ЛЕГЕНДАРНАЯ КИРКА · 2120 PPA · 14 Ч';\s*lb\.style\.opacity=_hasPickaxe\?'\.55':'1';\s*\}/,
  `if(lb){
    const _legendActive=_hasPickaxe&&_pickTier==='legendary';
    const _canUpgrade=_hasPickaxe&&_pickTier==='common';
    lb.disabled=_legendActive;
    lb.textContent=_legendActive
      ?('✓ ЛЕГЕНДАРНАЯ КИРКА · '+fartPickaxeRemainingText())
      :(_canUpgrade?'🔥 УЛУЧШИТЬ ДО ЛЕГЕНДАРНОЙ · 2120 PPA':'🔥 ЛЕГЕНДАРНАЯ КИРКА · 2120 PPA · 14 Ч');
    lb.style.opacity=_legendActive?'.55':'1';
  }`
);

ppaPatchRegex(
  'legendary upgrade ignores full bag when replacing common',
  /if\(\(INV\.bag\|\|\[\]\)\.length>=100\)\{\s*showPickup\('Сумка полна · освободи 1 слот для кирки','#ff8c78'\);\s*return;\s*\}/,
  `if((INV.bag||[]).length>=100&&!(_hasCurrent&&_currentTier==='common')){
        showPickup('Сумка полна · освободи 1 слот для кирки','#ff8c78');
        return;
      }`
);

if(!output.includes("🔥 УЛУЧШИТЬ ДО ЛЕГЕНДАРНОЙ · 2120 PPA") ||
   !output.includes("&& !(_hasCurrent&&_currentTier==='common')") && !output.includes("&&!(_hasCurrent&&_currentTier==='common')")) {
  throw new Error('Pickaxe upgrade button state did not apply');
}
/* ======================================================================== */



/* === FART PICKAXE REAL-TIME EXPIRY ====================================== */
// Absolute expiry survives save/reload. Relaunching never resets 4h/14h.

// Pickaxe expiry is persisted on the bag item itself via expiresAt.
ppaPatchRegex(
  'pickaxe removal clears bag and all storage',
  /function fartRemovePickaxeItem\(\)\{[\s\S]*?\n\}/,
  `function fartRemovePickaxeItem(){
  if(Array.isArray(INV.bag)){
    for(let i=INV.bag.length-1;i>=0;i--)if(INV.bag[i]&&INV.bag[i].fartPickaxe===true)INV.bag.splice(i,1);
  }
  if(INV.storage&&typeof INV.storage==='object'){
    ['personal','clan','premium'].forEach(function(k){
      const a=INV.storage[k];
      if(!Array.isArray(a))return;
      for(let i=a.length-1;i>=0;i--)if(a[i]&&a[i].fartPickaxe===true)a.splice(i,1);
    });
  }
}`
);

ppaPatchRegex(
  'pickaxe absolute-time normalization',
  /function fartNormalizePickaxe\(\)\{[\s\S]*?\n\}\nfunction fartHasPickaxe/,
  `function fartNormalizePickaxe(){
  if(!Array.isArray(INV.bag))INV.bag=[];
  let item=fartPickaxeBagItem();

  if(INV.storage&&typeof INV.storage==='object'){
    ['personal','clan','premium'].forEach(function(k){
      const a=INV.storage[k];
      if(!Array.isArray(a))return;
      for(let i=a.length-1;i>=0;i--)if(a[i]&&a[i].fartPickaxe===true)a.splice(i,1);
    });
  }

  if(!item){
    if(INV.fartPickaxe||Number(INV.fartPickaxeUntil)>0){
      INV.fartPickaxe=false;
      INV.fartPickaxeUntil=0;
      try{saveGame();sendInvState();sendBlacksmithState();sendStorageState();updateUI()}catch(_){}
    }
    return false;
  }

  const itemUntil=Math.max(0,Number(item.expiresAt)||0);
  const savedUntil=Math.max(0,Number(INV.fartPickaxeUntil)||0);
  const until=itemUntil||savedUntil;

  if(!until||until<=Date.now()){
    INV.fartPickaxe=false;
    INV.fartPickaxeUntil=0;
    fartRemovePickaxeItem();
    try{saveGame();sendInvState();sendBlacksmithState();sendStorageState();updateUI()}catch(_){}
    return false;
  }

  INV.fartPickaxe=true;
  INV.fartPickaxeUntil=until;
  item.expiresAt=until;
  if(!item.fartPickaxeTier)item.fartPickaxeTier='common';
  return true;
}
function fartHasPickaxe`
);

ppaPatchRegex(
  'hide pickaxe from storage deposit inventory',
  /\(INV\.bag\|\|\[\]\)\.forEach\(function\(it,idx\)\{\s*if\(!it\)return;\s*var x=storageItemForUi\(it\);x\.kind='gear';x\.refId=String\(idx\);x\.storageRef='gear:'\+idx;out\.push\(x\);/,
  `(INV.bag||[]).forEach(function(it,idx){
      if(!it||it.fartPickaxe===true)return;
      var x=storageItemForUi(it);x.kind='gear';x.refId=String(idx);x.storageRef='gear:'+idx;out.push(x);`
);

ppaPatchRegex(
  'live pickaxe timer refresh',
  /function fartPickaxeRemainingText\(\)\{[\s\S]*?\n\}/,
  `function fartPickaxeRemainingText(){
  if(!fartHasPickaxe())return '';
  const ms=Math.max(0,Number(INV.fartPickaxeUntil)-Date.now());
  const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),sec=Math.floor((ms%60000)/1000);
  return h+'ч '+String(m).padStart(2,'0')+'м '+String(sec).padStart(2,'0')+'с';
}
function fartRefreshPickaxeTimerUi(){
  const has=fartHasPickaxe();
  const ps=document.getElementById('fartGuidePickaxeStatus');
  const pb=document.getElementById('fartGuidePickaxe');
  const lb=document.getElementById('fartGuideLegendPickaxe');
  if(!ps&&!pb&&!lb)return;
  const tier=has?fartPickaxeTier():'';
  const left=has?fartPickaxeRemainingText():'';
  if(ps)ps.textContent=has
    ?((tier==='legendary'?'Легендарная':'Обычная')+' кирка: осталось '+left)
    :'Кирка закончилась · купи новую';
  if(pb){
    pb.disabled=has;
    pb.textContent=has&&tier==='common'?('✓ ОБЫЧНАЯ КИРКА · '+left):'⛏ ОБЫЧНАЯ КИРКА · 200 PPA · 4 Ч';
    pb.style.opacity=has?'.55':'1';
  }
  if(lb){
    const legendaryActive=has&&tier==='legendary';
    const canUpgrade=has&&tier==='common';
    lb.disabled=legendaryActive;
    lb.textContent=legendaryActive
      ?('✓ ЛЕГЕНДАРНАЯ КИРКА · '+left)
      :(canUpgrade?'🔥 УЛУЧШИТЬ ДО ЛЕГЕНДАРНОЙ · 2120 PPA':'🔥 ЛЕГЕНДАРНАЯ КИРКА · 2120 PPA · 14 Ч');
    lb.style.opacity=legendaryActive?'.55':'1';
  }
}
setInterval(fartRefreshPickaxeTimerUi,1000);`
);

if(!output.includes("const itemUntil=Math.max(0,Number(item.expiresAt)||0)") ||
   !output.includes("const until=itemUntil||savedUntil") ||
   !output.includes("if(!until||until<=Date.now())") ||
   !output.includes("fartRemovePickaxeItem();") ||
   !output.includes("if(!it||it.fartPickaxe===true)return;") ||
   !output.includes("setInterval(fartRefreshPickaxeTimerUi,1000)") ||
   !output.includes("Кирка закончилась · купи новую")) {
  throw new Error('Fart pickaxe real-time expiry persistence patch did not apply');
}
/* ======================================================================== */



/* === FART GUIDE TRANSPARENT BACKDROP ==================================== */
ppaPatchRegex(
  'fart guide transparent backdrop',
  /shade\.style\.cssText='position:fixed;inset:0;z-index:99995;display:flex;align-items:center;justify-content:center;background:rgba\(0,0,0,\.72\);padding:16px';/,
  "shade.style.cssText='position:fixed;inset:0;z-index:99995;display:flex;align-items:center;justify-content:center;background:transparent;padding:16px';"
);

ppaPatchRegex(
  'fart guide tap outside closes menu',
  /document\.body\.appendChild\(shade\);\s*shade\.querySelector\('#fartGuideClose'\)\.onclick=function\(\)\{shade\.remove\(\)\};/,
  "document.body.appendChild(shade);\n    shade.addEventListener('click',function(e){if(e.target===shade)shade.remove()});\n    shade.querySelector('#fartGuideClose').onclick=function(){shade.remove()};"
);

if(!output.includes("background:transparent;padding:16px") ||
   !output.includes("shade.addEventListener('click',function(e){if(e.target===shade)shade.remove()})")) {
  throw new Error('Fart guide transparent backdrop patch did not apply');
}
/* ======================================================================== */

/* === FART ZONE GUARDS ==================================================== */
// Five approved transparent guard skins.
// 0 Tentacle Monster, 1 Venomous Spider, 2 Reaper, 3 Molten Core Golem, 4 Abyss Guardian.
// Mechanics, drops, respawn and Fart-zone mining logic stay unchanged.

ppaPatchRegex(
  'fart guard visual metrics',
  /function\s+ppaMobVisualMetrics\(e\)\s*\{\s*if\(!e\)return\{w:0,h:0\};\s*if\(e\.isDungeon60Boss\)return\{w:270,h:270\};/,
  "function ppaMobVisualMetrics(e){\n  if(!e)return{w:0,h:0};\n  if(e.isFartGuard)return{w:92,h:92};\n  if(e.isDungeon60Boss)return{w:270,h:270};"
);

ppaPatchRegex(
  'fart guard body-only repaint hook',
  /function\s+ppaDrawWorldBodyOnly\(e\)\s*\{\s*if\(!e\|\|e\.hp<=0\)return;\s*if\(e\.isDungeon60Boss\)\{if\(window\.PPA_DRAGON60_DRAW_BODY\)window\.PPA_DRAGON60_DRAW_BODY\(e\);return;\}/,
  "function ppaDrawWorldBodyOnly(e){\n  if(!e||e.hp<=0)return;\n  if(e.isFartGuard)window.__PPA_FART_DRAW_ENTITY=e;\n  if(e.isDungeon60Boss){if(window.PPA_DRAGON60_DRAW_BODY)window.PPA_DRAGON60_DRAW_BODY(e);return;}"
);

ppaPatchRegex(
  'fart guard main render hook',
  /if\(e\.isDungeon60Boss\)\{if\(window\.PPA_DRAGON60_DRAW\)window\.PPA_DRAGON60_DRAW\(e\);continue;\}if\(e\.isDungeon21Boss\)\{drawDungeon21Boss\(e\);continue;\}/,
  "window.__PPA_FART_LABEL_ENTITY=(e&&e.isFartGuard)?e:null;window.__PPA_FART_DRAW_ENTITY=(e&&e.isFartGuard)?e:null;if(e.isDungeon60Boss){if(window.PPA_DRAGON60_DRAW)window.PPA_DRAGON60_DRAW(e);continue;}if(e.isDungeon21Boss){drawDungeon21Boss(e);continue;}"
);

const fartGuardRuntime = "<script id='ppaFartGuardVisuals'>\n"+
"(function(){\n"+
"  var sheets=[new Image(),new Image(),new Image(),new Image(),new Image()];\n"+
"  sheets[0].src='./assets/fart-tentacle.webp';\n"+
"  sheets[1].src='./assets/fart-spider.webp';\n"+
"  sheets[2].src='./assets/fart-reaper.webp';\n"+
"  sheets[3].src='./assets/fart-golem.webp';\n"+
"  sheets[4].src='./assets/fart-darkguard.webp';\n"+
"  var TILE=192;\n"+
"  var GUARD_NAMES=['Тентаклевый монстр','Ядовитый паук','Жнец','Голем Раскалённого Ядра','Страж Бездны'];\n"+
"  function applyGuardName(e,skin){\n"+
"    var n=GUARD_NAMES[skin]||'Страж Фарт-зоны';\n"+
"    try{\n"+
"      e.name=n;e.n=n;e.nm=n;e.title=n;e.label=n;e.displayName=n;e.mobName=n;e.typeName=n;e.__ppaFartName=n;e.__ppaFartCollisionRadius=([22,18,23,27,23][skin]||22);\n"+
"      if(e.type&&typeof e.type==='object'){if(!e.__ppaFartOwnType){e.type=Object.assign({},e.type);e.__ppaFartOwnType=true}e.type.n=n;e.type.name=n;e.type.nm=n;e.type.title=n;e.type.label=n;e.type.displayName=n;e.type.mobName=n;e.type.typeName=n;}\n"+
"      e.isDungeonElite=false;e.isElite=false;e.elite=false;e.eliteVisualScale=1;e.eliteWindowKey='';e.eliteMode='';e.eliteExpiresAt=0;e.eliteHpMultiplier=1;e.eliteCombatBonusApplied=false;\n"+
"    }catch(_){}\n"+
"    return skin;\n"+
"  }\n"+
"  function skinOf(e){\n"+
"    if(Number.isInteger(e.__ppaFartSkin))return applyGuardName(e,e.__ppaFartSkin);\n"+
"    var sx=Number.isFinite(Number(e.__ppaServerX))?Number(e.__ppaServerX):(Number(e.x)||0);\n"+
"    var sy=Number.isFinite(Number(e.__ppaServerY))?Number(e.__ppaServerY):(Number(e.y)||0);\n"+
"    var key=String(e.mineId||'')+'|'+String(e.guardIndex||e.index||e.id||e.uid||'')+'|'+Math.round(sx/16)+'|'+Math.round(sy/16);\n"+
"    var h=0;for(var i=0;i<key.length;i++)h=((h*31)+key.charCodeAt(i))|0;\n"+
"    e.__ppaFartSkin=Math.abs(h)%5;return applyGuardName(e,e.__ppaFartSkin);\n"+
"  }\n"+
"  window.PPA_FART_GUARD_NAME=function(e){var s=skinOf(e);return GUARD_NAMES[s]||'Страж Фарт-зоны';};\n"+
"  window.PPA_FART_GUARD_SKIN=function(e){return skinOf(e);};\n"+
"  function assignGuardIdentity(e){\n"+
"    if(!e||!e.isFartGuard)return e;var skin=skinOf(e),n=GUARD_NAMES[skin]||'Страж Фарт-зоны';\n"+
"    try{e.name=n;e.n=n;e.nm=n;e.title=n;e.label=n;e.displayName=n;e.mobName=n;e.typeName=n;e.__ppaFartName=n;e.__ppaFartNamed=true;e.__ppaFartCollisionRadius=([22,18,23,27,23][skin]||22);if(e.type&&typeof e.type==='object'){if(!e.__ppaFartOwnType){e.type=Object.assign({},e.type);e.__ppaFartOwnType=true}e.type.n=n;e.type.name=n;e.type.nm=n;e.type.title=n;e.type.label=n;e.type.displayName=n;e.type.mobName=n;e.type.typeName=n;}e.isDungeonElite=false;e.isElite=false;e.elite=false;e.eliteVisualScale=1;e.eliteWindowKey='';e.eliteMode='';e.eliteExpiresAt=0;e.eliteHpMultiplier=1;e.eliteCombatBonusApplied=false}catch(_){}\n"+
"    return e;\n"+
"  }\n"+
"  function installSpawnNameHook(){\n"+
"    try{\n"+
"      var base=window.fartSpawnGuard;if(typeof base!=='function'||base.__ppaFartNamedHook)return;\n"+
"      var wrapped=function(){\n"+
"        var before=[];try{if(typeof EN!=='undefined'&&Array.isArray(EN))before=EN.slice()}catch(_){}\n"+
"        var ret=base.apply(this,arguments);\n"+
"        try{if(ret&&ret.isFartGuard)assignGuardIdentity(ret)}catch(_){}\n"+
"        try{if(typeof EN!=='undefined'&&Array.isArray(EN))EN.forEach(function(e){if(e&&e.isFartGuard&&(before.indexOf(e)<0||!e.__ppaFartNamed))assignGuardIdentity(e)})}catch(_){}\n"+
"        return ret;\n"+
"      };\n"+
"      wrapped.__ppaFartNamedHook=true;wrapped.__ppaBase=base;window.fartSpawnGuard=wrapped;try{fartSpawnGuard=wrapped}catch(_){}\n"+
"    }catch(_){}\n"+
"  }\n"+
"  installSpawnNameHook();setTimeout(installSpawnNameHook,0);setTimeout(installSpawnNameHook,500);\n"+
"  try{if(typeof EN!=='undefined'&&Array.isArray(EN))EN.forEach(function(e){if(e&&e.isFartGuard)assignGuardIdentity(e)})}catch(_){}\n"+"  function dirOf(e,v){\n"+
"    var d=NaN;\n"+
"    if(Number.isFinite(Number(e.__ppaServerDir)))d=Number(e.__ppaServerDir);\n"+
"    else if(Number.isFinite(Number(e.dir)))d=Number(e.dir);\n"+
"    if(d===0)return 0;if(d===1)return 1;if(d===3)return 2;if(d===2)return 3;\n"+
"    if(Number.isFinite(Number(e.visDir))){var q=Number(e.visDir);if(q===2)return 0;if(q===3)return 1;if(q===0)return 2;if(q===1)return 3;}\n"+
"    var dx=(Number(e.x)||0)-v.lastX,dy=(Number(e.y)||0)-v.lastY;\n"+
"    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>.05)return dx>=0?2:3;\n"+
"    if(Math.abs(dy)>.05)return dy>=0?1:0;return v.dir||1;\n"+
"  }\n"+
"  function frameFor(e){\n"+
"    var now=performance.now();\n"+
"    var v=e.__ppaFartVis;if(!v)v=e.__ppaFartVis={lastX:Number(e.x)||0,lastY:Number(e.y)||0,prevAtk:Number(e.atkCD)||0,attackUntil:0,dir:1};\n"+
"    var x=Number(e.x)||0,y=Number(e.y)||0,mdx=x-v.lastX,mdy=y-v.lastY;\n"+
"    var moving=(mdx*mdx+mdy*mdy)>.015,atk=Number(e.atkCD)||0;\n"+
"    if(atk>v.prevAtk+.08||e.attacking===true||e.isAttacking===true||Number(e.attackAnim)>0||Number(e.atkAnim)>0)v.attackUntil=now+430;\n"+
"    v.prevAtk=atk;var attacking=now<v.attackUntil,dir=dirOf(e,v);v.dir=dir;\n"+
"    var skin=skinOf(e),col=0;\n"+
"    if(skin===2){\n"+
"      col=attacking?4+(Math.floor(now/105)%4):(Math.floor(now/230)%4);\n"+
"    }else if(skin===4){\n"+
"      col=attacking?8+(Math.floor(now/105)%4):(moving?4+(Math.floor(now/145)%4):(Math.floor(now/240)%4));\n"+
"    }else{\n"+
"      col=attacking?5+(Math.floor(now/105)%4):(moving?1+(Math.floor(now/145)%4):0);\n"+
"    }\n"+
"    var row=dir,mirror=false;if(attacking&&dir===3){row=2;mirror=true;}\n"+
"    v.lastX=x;v.lastY=y;return {skin:skin,col:col,row:row,mirror:mirror};\n"+
"  }\n"+
"  var proto=window.CanvasRenderingContext2D&&CanvasRenderingContext2D.prototype;\n"+
"  if(!proto||proto.__ppaFartGuardNative)return;\n"+
"  proto.__ppaFartGuardNative=true;\n"+
"  var original=proto.drawImage;\n"+
"  proto.drawImage=function(){\n"+
"    var e=window.__PPA_FART_DRAW_ENTITY;\n"+
"    if(e&&e.isFartGuard&&e.hp>0){\n"+
"      try{\n"+
"        var a=Array.prototype.slice.call(arguments),dx,dy,dw,dh;\n"+
"        if(a.length===5){dx=Number(a[1]);dy=Number(a[2]);dw=Number(a[3]);dh=Number(a[4]);}\n"+
"        else if(a.length>=9){dx=Number(a[5]);dy=Number(a[6]);dw=Number(a[7]);dh=Number(a[8]);}\n"+
"        if(Number.isFinite(dx)&&Number.isFinite(dy)&&Number.isFinite(dw)&&Number.isFinite(dh)&&Math.abs(dw)>=24&&Math.abs(dh)>=24){\n"+
"          var fr=frameFor(e),sheet=sheets[fr.skin];\n"+
"          if(sheet&&sheet.complete&&sheet.naturalWidth){\n"+
"            window.__PPA_FART_DRAW_ENTITY=null;\n"+

"            var oldSmooth=this.imageSmoothingEnabled;this.imageSmoothingEnabled=false;\n"+
"            if(fr.mirror){\n"+
"              this.save();this.translate(dx+dw,dy);this.scale(-1,1);\n"+
"              original.call(this,sheet,fr.col*TILE,fr.row*TILE,TILE,TILE,0,0,dw,dh);\n"+
"              this.restore();\n"+
"            }else{\n"+
"              original.call(this,sheet,fr.col*TILE,fr.row*TILE,TILE,TILE,dx,dy,dw,dh);\n"+
"            }\n"+
"            this.imageSmoothingEnabled=oldSmooth;return;\n"+
"          }\n"+
"        }\n"+
"      }catch(_){}\n"+
"    }\n"+
"    return original.apply(this,arguments);\n"+
"  };\n"+
"  function fartGuardLabel(txt){\n"+
"    var e=window.__PPA_FART_LABEL_ENTITY,t=String(txt==null?'':txt);\n"+
"    if(!e||!e.isFartGuard)return {skip:false,text:t};\n"+
"    if(/ЭЛИТА(?:\\s+ПОДЗЕМЕЛЬЯ)?/i.test(t))return {skip:true,text:''};\n"+
"    var lv=t.match(/\\[\\s*\\d+\\s*\\]/);\n"+
"    if(lv){var n=e.__ppaFartName||e.name||'Страж Фарт-зоны';return {skip:false,text:lv[0]+' '+n};}\n"+
"    return {skip:false,text:t};\n"+
"  }\n"+
"  ['fillText','strokeText'].forEach(function(k){\n"+
"    var base=proto[k];if(typeof base!=='function'||base.__ppaFartNameStable)return;\n"+
"    var wrap=function(txt){var a=Array.prototype.slice.call(arguments),r=fartGuardLabel(txt);if(r.skip)return;a[0]=r.text;return base.apply(this,a)};\n"+
"    wrap.__ppaFartNameStable=true;proto[k]=wrap;\n"+
"  });\n"+

"})();\n"+
"</script>";

ppaPatchRegex(
  'fart guard visual runtime',
  /<\/body>/,
  fartGuardRuntime+"\n</body>"
);

if(!output.includes("id='ppaFartGuardVisuals'") ||
   !output.includes("window.__PPA_FART_DRAW_ENTITY=(e&&e.isFartGuard)?e:null") ||
   !output.includes("if(e.isFartGuard)window.__PPA_FART_DRAW_ENTITY=e") ||
   !output.includes("proto.__ppaFartGuardNative=true") ||
   !output.includes("original.call(this,sheet") ||
   !output.includes("./assets/fart-tentacle.webp") ||
   !output.includes("./assets/fart-spider.webp") ||
   !output.includes("./assets/fart-reaper.webp") ||
   !output.includes("./assets/fart-golem.webp") ||
   !output.includes("./assets/fart-darkguard.webp") ||
   !output.includes("function assignGuardIdentity(e)") ||
   !output.includes("wrapped.__ppaFartNamedHook=true") ||
   !output.includes("GUARD_NAMES=['Тентаклевый монстр','Ядовитый паук','Жнец','Голем Раскалённого Ядра','Страж Бездны']") ||
   !output.includes("e.__ppaFartSkin=Math.abs(h)%5") ||
   !output.includes("skin===4")) {
  throw new Error('Fart guard visual test patch did not apply');
}
if(!output.includes("window.__PPA_FART_LABEL_ENTITY=(e&&e.isFartGuard)?e:null") ||
   !output.includes("function fartGuardLabel(txt)") ||
   !output.includes("wrap.__ppaFartNameStable=true")) {
  throw new Error('Fart stable name draw did not apply');
}
if(!output.includes("e.isDungeonElite=false;e.isElite=false;e.elite=false;e.eliteVisualScale=1")) {
  throw new Error('Fart guard elite-state cleanup did not apply');
}
if(!output.includes("__ppaFartOwnType") ||
   !output.includes("__ppaFartHp24000=true") ||
   !output.includes("_fg.mhp=24000") ||
   !output.includes("_missingHp")) {
  throw new Error('Fart guard stable name/24k HP patch did not apply');
}
/* ======================================================================== */


/* === FINAL FART GUARD DROP PANEL ======================================== */
// The old Fart guard inspect table had static epic/legendary values.
// Always show the chances that are actually active for the player's pickaxe tier.
const fartDropPanelRuntime = "<script id='ppaFartDropPanelFix'>\n"+
"(function(){\n"+
"  var prev=window.mobDropInfo;\n"+
"  function pctGear(){try{if(typeof fartGuardGearDropChances==='function')return fartGuardGearDropChances()}catch(_){}return {epic:0,legendary:0,tier:'none'};}\n"+

"  window.mobDropInfo=function(e){\n"+
"    if(e&&e.isFartGuard){\n"+
"      try{if(window.PPA_FART_GUARD_NAME)window.PPA_FART_GUARD_NAME(e)}catch(_){}\n"+
"      var g=pctGear();\n"+
"      var epic=g.epic===0.00001?'0.001%':(g.epic===0.000003?'0.0003%':'0%');\n"+
"      var legendary=g.legendary===0.0000013?'0.00013%':'0%';\n"+
"      return [\n"+
"        ['Эпический шмот/оружие · случайный',epic],\n"+
"        ['Легендарный шмот/оружие · случайный',legendary],\n"+
"        ['Эпическая универсальная руна','0.00012%'],\n"+
"        ['Обычная универсальная руна','10%'],\n"+
"        ['Премиум руна заточки','6%'],\n"+
"        ['Изумруд Вечности · легендарный ресурс','0.00020%'],\n"+
"        ['Адская руда · легендарный ресурс','0.00017%'],\n"+
"        ['Кристалл Бездны · легендарный ресурс','0.00012%']\n"+
"      ];\n"+
"    }\n"+
"    return typeof prev==='function'?prev(e):[];\n"+
"  };\n"+
"})();\n"+
"</script>";

ppaPatchRegex(
  'final fart guard drop panel',
  /<\/body>/,
  fartDropPanelRuntime+"\n</body>"
);

const monsterCoreDropPanelRuntime = "<script id='ppaMonsterCoreDropPanel'>\n"+
"(function(){\n"+
"  var prev=window.mobDropInfo;\n"+
"  window.mobDropInfo=function(e){\n"+
"    var rows=typeof prev==='function'?prev.apply(this,arguments):[];\n"+
"    try{\n"+
"      if(e&&!e.isFartGuard&&typeof P!=='undefined'&&P&&P.scene==='dungeon'){\n"+
"        rows=Array.isArray(rows)?rows.slice():[];\n"+
"        var has=false;for(var i=0;i<rows.length;i++)if(rows[i]&&String(rows[i][0]||'')==='Ядро монстра')has=true;\n"+
"        if(!has)rows.push(['Ядро монстра',e&&e.isDungeonElite?'8%':'6%']);\n"+
"      }\n"+
"    }catch(_){}\n"+
"    return rows;\n"+
"  };\n"+
"})();\n"+
"</script>";
ppaPatchRegex(
  'monster core drop panel row',
  /<\/body>/,
  monsterCoreDropPanelRuntime+"\n</body>"
);

if(!output.includes("id='ppaMonsterCoreDropPanel'") ||
   !output.includes("e&&e.isDungeonElite?'8%':'6%'")) {
  throw new Error('Monster Core drop panel row did not apply');
}

if(!output.includes("id='ppaFartDropPanelFix'") ||
   !output.includes("var epic=g.epic===0.00001?'0.001%'") ||
   !output.includes("var legendary=g.legendary===0.0000013?'0.00013%'")) {
  throw new Error('Final Fart guard drop panel patch did not apply');
}

if(!output.includes("window.PPA_FART_GUARD_NAME=function(e)") ||
   !output.includes("__ppaFartOwnType") ||
   !output.includes("e.type.n=n;e.type.name=n")) {
  throw new Error('Fart guard stable identity patch did not apply');
}
if(output.includes("function fixGuardMenu(e)") ||
   output.includes("document.createTreeWalker(document.body") ||
   output.includes("setTimeout(applyFartInspectName") ||
   output.includes("window.__PPA_FART_INSPECT_NAME")) {
  throw new Error('Laggy Fart inspect name overlay is still present');
}

if(output.includes("Object.keys(RES).forEach(name=&gt;{\n    const count=(BS_STATE.materials") ||
   !output.includes("function ppaSmithRefreshCanvasArt()") ||
   !output.includes("__ppaCanvasizingSrc===src") ||
   !output.includes("if(src.indexOf('/assets/legendary/')>=0)") ||
   !output.includes("img.id==='enhSrcImg'||img.id==='enhDstImg'") ||
   !output.includes("_ppaLegendOpt.textContent=&#x27;Легендарный&#x27;") ||
   !output.includes("if(rarity==='legendary') return 'откат −1, легендарный не сгорает'") ||
   !output.includes("it.petName==='Великий Рури'||it.name==='Великий Рури'") ||
   !output.includes("attributeFilter:['src','srcset']") ||
   !output.includes("return '/assets/legendary/'+_ppaC+'-'+_ppaS+'.webp?v=v514'") ||
   !output.includes("s.onclick=function(){if(s.__ppaHeld){s.__ppaHeld=false;return}if(sharpenable)selectSmithGear(c.idx)};")) {
  throw new Error('Blacksmith pre-legend stable selection / canonical craft art fix did not apply');
}

if(!output.includes("function ppaSmithCanvasize(root)") ||
   !output.includes("img.parentNode.replaceChild(c,img)") ||
   !output.includes("new MutationObserver(function(ms)") ||
   !output.includes("PPA_SMITH_EMERALD_IMG='data:image/webp;base64,") ||
   !output.includes("s.dataset.ppaMaterialName=c.name") ||
   !output.includes("img.closest('[data-ppa-material-name]')") ||
   !output.includes("isEmerald=/изумруд/i.test(matName)")) {
  throw new Error('Blacksmith canvas/emerald one-slot guard did not apply');
}
/* ======================================================================== */

/* === GLOBAL IMAGE LONGPRESS GUARD ======================================= */
ppaPatchRegex(
  'global game image longpress guard css',
  /<\/head>/,
  `<style id="ppaGlobalImageLongPressGuard">
img{-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important}
</style>
</head>`
);

ppaPatchRegex(
  'global game image longpress guard script',
  /<\/body>/,
  `<script id="ppaGlobalImageLongPressGuardScript">
(function(){
  function isGameImageTarget(t){
    if(!t)return false;
    if(t.tagName==='IMG')return true;
    if(t.closest&&t.closest('img'))return true;
    return false;
  }
  document.addEventListener('contextmenu',function(e){
    if(isGameImageTarget(e.target)){e.preventDefault();e.stopPropagation();}
  },true);
  document.addEventListener('dragstart',function(e){
    if(isGameImageTarget(e.target)){e.preventDefault();e.stopPropagation();}
  },true);
  document.addEventListener('selectstart',function(e){
    if(isGameImageTarget(e.target)){e.preventDefault();}
  },true);
  document.querySelectorAll('img').forEach(function(img){
    img.draggable=false;
    img.setAttribute('draggable','false');
  });
  try{
    new MutationObserver(function(list){
      list.forEach(function(m){
        m.addedNodes&&m.addedNodes.forEach(function(n){
          if(!n||n.nodeType!==1)return;
          if(n.tagName==='IMG'){
            n.draggable=false;n.setAttribute('draggable','false');
          }
          if(n.querySelectorAll)n.querySelectorAll('img').forEach(function(img){
            img.draggable=false;img.setAttribute('draggable','false');
          });
        });
      });
    }).observe(document.documentElement,{childList:true,subtree:true});
  }catch(_){}
})();
</script>
</body>`
);

if(!output.includes("ppaGlobalImageLongPressGuard") ||
   !output.includes("document.addEventListener('contextmenu'") ||
   !output.includes("new MutationObserver(function(list)")) {
  throw new Error('Global image longpress guard did not apply');
}
/* ======================================================================== */

/* === HARD DISABLE WEBVIEW IMAGE MENU ==================================== */
// Telegram/Android WebView may show its native image menu before JS contextmenu
// handlers win. Make images transparent to hit-testing so presses land on the
// actual game card/button underneath instead of on the <img> resource itself.
ppaPatchRegex(
  'hard disable native image longpress target',
  /<style id="ppaGlobalImageLongPressGuard">[\s\S]*?<\/style>/,
  `<style id="ppaGlobalImageLongPressGuard">
img{
  -webkit-touch-callout:none!important;
  -webkit-user-select:none!important;
  user-select:none!important;
  pointer-events:none!important;
}
</style>`
);

ppaPatchRegex(
  'hard disable image hit testing dynamically',
  /img\.draggable=false;\s*img\.setAttribute\('draggable','false'\);/g,
  "img.draggable=false;img.setAttribute('draggable','false');img.style.pointerEvents='none';",
  true
);

if(!output.includes("pointer-events:none!important") ||
   !output.includes("img.style.pointerEvents='none'")) {
  throw new Error('Hard WebView image-menu guard did not apply');
}
/* ======================================================================== */

/* === SAME-ORIGIN IFRAME IMAGE LONGPRESS GUARD =========================== */
// Rune/character/etc. panels live in srcdoc iframes. Root-document CSS does not
// propagate into iframe documents, so Android WebView could still expose the
// native "Open / Download / Copy link" menu for rune icons.
ppaPatchRegex(
  'iframe image longpress guard',
  /<\/body>/,
  `<script id="ppaIframeImageLongPressGuard">
(function(){
  function guardDoc(doc){
    if(!doc||doc.__ppaImageGuard)return;
    doc.__ppaImageGuard=true;
    try{
      var st=doc.createElement('style');
      st.id='ppaIframeImageGuardStyle';
      st.textContent='img{-webkit-touch-callout:none!important;-webkit-user-select:none!important;user-select:none!important;pointer-events:none!important}';
      (doc.head||doc.documentElement).appendChild(st);
    }catch(_){}
    function lock(img){
      if(!img||img.nodeType!==1||img.tagName!=='IMG')return;
      try{
        img.draggable=false;
        img.setAttribute('draggable','false');
        img.style.pointerEvents='none';
        img.style.webkitTouchCallout='none';
        img.style.webkitUserSelect='none';
        img.setAttribute('oncontextmenu','return false');
      }catch(_){}
    }
    try{doc.querySelectorAll('img').forEach(lock)}catch(_){}
    try{
      doc.addEventListener('contextmenu',function(e){
        var t=e&&e.target;
        if(t&&(t.tagName==='IMG'||(t.closest&&t.closest('img')))){
          e.preventDefault();e.stopImmediatePropagation();
        }
      },true);
      doc.addEventListener('dragstart',function(e){
        var t=e&&e.target;
        if(t&&(t.tagName==='IMG'||(t.closest&&t.closest('img')))){
          e.preventDefault();e.stopImmediatePropagation();
        }
      },true);
      doc.addEventListener('selectstart',function(e){
        var t=e&&e.target;
        if(t&&(t.tagName==='IMG'||(t.closest&&t.closest('img'))))e.preventDefault();
      },true);
    }catch(_){}
    try{
      new MutationObserver(function(ms){
        ms.forEach(function(m){
          (m.addedNodes||[]).forEach(function(n){
            if(!n||n.nodeType!==1)return;
            if(n.tagName==='IMG')lock(n);
            if(n.querySelectorAll)n.querySelectorAll('img').forEach(lock);
          });
        });
      }).observe(doc.documentElement,{childList:true,subtree:true});
    }catch(_){}
  }
  function guardFrame(fr){
    if(!fr)return;
    function apply(){
      try{
        var d=fr.contentDocument||fr.contentWindow&&fr.contentWindow.document;
        if(d)guardDoc(d);
      }catch(_){}
    }
    try{fr.addEventListener('load',function(){apply();setTimeout(apply,0);setTimeout(apply,150)},true)}catch(_){}
    apply();setTimeout(apply,0);
  }
  function scan(root){
    try{
      (root&&root.querySelectorAll?root:document).querySelectorAll('iframe').forEach(guardFrame);
    }catch(_){}
  }
  scan(document);
  try{
    new MutationObserver(function(ms){
      ms.forEach(function(m){
        (m.addedNodes||[]).forEach(function(n){
          if(!n||n.nodeType!==1)return;
          if(n.tagName==='IFRAME')guardFrame(n);
          scan(n);
        });
      });
    }).observe(document.documentElement,{childList:true,subtree:true});
  }catch(_){}
  window.addEventListener('load',function(){scan(document);setTimeout(function(){scan(document)},250)},true);
})();
</script>
</body>`
);

if(!output.includes("ppaIframeImageLongPressGuard") ||
   !output.includes("ppaIframeImageGuardStyle") ||
   !output.includes("fr.contentDocument") ||
   !output.includes("pointer-events:none!important")) {
  throw new Error('Iframe image longpress guard did not apply');
}
/* ======================================================================== */


/* === GLOBAL TEXT LONGPRESS / SELECTION GUARD ============================ */
// Android/Telegram WebView must not show the native text toolbar over game UI.
// Real text editors remain fully selectable/editable.
ppaPatchRegex(
  'global text selection guard',
  /<\/body>/,
  `<script id="ppaGlobalTextSelectionGuard">
(function(){
  function isEditableTarget(t){
    try{
      if(!t)return false;
      if(t.nodeType===3)t=t.parentElement;
      if(!t||!t.closest)return false;
      return !!t.closest('input,textarea,[contenteditable="true"],[contenteditable=""],[role="textbox"],[data-allow-text-select="true"]');
    }catch(_){return false}
  }
  function guardDoc(doc){
    if(!doc||doc.__ppaTextSelectionGuard)return;
    doc.__ppaTextSelectionGuard=true;
    try{
      var st=doc.createElement('style');
      st.id='ppaTextSelectionGuardStyle';
      st.textContent=
        'html,body,body *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}'+
        'input,textarea,[contenteditable="true"],[contenteditable=""],[role="textbox"],[data-allow-text-select="true"]{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}';
      (doc.head||doc.documentElement).appendChild(st);
    }catch(_){}
    try{
      doc.addEventListener('selectstart',function(e){
        if(!isEditableTarget(e.target)){e.preventDefault();e.stopPropagation();}
      },true);
      doc.addEventListener('contextmenu',function(e){
        if(!isEditableTarget(e.target)){e.preventDefault();e.stopPropagation();}
      },true);
    }catch(_){}
    function guardFrame(fr){
      if(!fr)return;
      function apply(){
        try{
          var d=fr.contentDocument||(fr.contentWindow&&fr.contentWindow.document);
          if(d)guardDoc(d);
        }catch(_){}
      }
      try{fr.addEventListener('load',function(){apply();setTimeout(apply,0);setTimeout(apply,150)},true)}catch(_){}
      apply();setTimeout(apply,0);
    }
    function scanFrames(root){
      try{(root&&root.querySelectorAll?root:doc).querySelectorAll('iframe').forEach(guardFrame)}catch(_){}
    }
    scanFrames(doc);
    try{
      new MutationObserver(function(ms){
        ms.forEach(function(m){
          (m.addedNodes||[]).forEach(function(n){
            if(!n||n.nodeType!==1)return;
            if(n.tagName==='IFRAME')guardFrame(n);
            scanFrames(n);
          });
        });
      }).observe(doc.documentElement,{childList:true,subtree:true});
    }catch(_){}
  }
  guardDoc(document);
})();
</script>
</body>`
);

if(!output.includes("id=\"ppaGlobalTextSelectionGuard\"") ||
   !output.includes("ppaTextSelectionGuardStyle") ||
   !output.includes("data-allow-text-select=\"true\"") ||
   !output.includes("if(!isEditableTarget(e.target)){e.preventDefault();e.stopPropagation();}") ||
   !output.includes("fr.contentDocument")) {
  throw new Error('Global text longpress guard did not apply');
}
/* ======================================================================== */

/* === BLACKSMITH RUNE FUSION ============================================= */
// Two identical runes -> one rune of the next rarity.
// Cost: 5000 gold per attempt.
// Chances: gray/common 37%, green 30%, blue 22%.
// Purple/epic cannot be fused to legendary: legendary runes remain Black Market only.
ppaPatchRegex(
  'blacksmith rune fusion runtime',
  /<\/body>/,
  `<script id="ppaRuneFusionRuntime">
(function(){
  var COST=5000;
  var CHANCE={0:.37,1:.30,2:.22};
  var NEXT={0:1,1:2,2:3};
  var RARITY_NAME=['Серая','Зелёная','Синяя','Фиолетовая','Легендарная'];

  window.PPA_CHARACTER_RUNE_CATALOG=window.PPA_CHARACTER_RUNE_CATALOG||[];
  window.PPA_CHARACTER_AVAILABLE_RUNES=window.PPA_CHARACTER_AVAILABLE_RUNES||[];
  window.PPA_CHARACTER_RUNE_SOURCE=window.PPA_CHARACTER_RUNE_SOURCE||'';
  window.PPA_REGISTER_CHARACTER_RUNES=function(payload){
    try{
      payload=payload||{};
      if(Array.isArray(payload.catalog)&&payload.catalog.length)window.PPA_CHARACTER_RUNE_CATALOG=payload.catalog;
      if(Array.isArray(payload.available)&&payload.available.length)window.PPA_CHARACTER_AVAILABLE_RUNES=payload.available;
      if(payload.source)window.PPA_CHARACTER_RUNE_SOURCE=String(payload.source);
    }catch(_){}
  };

  function safeClone(v){
    try{return JSON.parse(JSON.stringify(v))}catch(_){}
    try{return Object.assign({},v)}catch(_){}
    return null;
  }
  function runeText(v){
    if(!v)return '';
    return String(v.name||v.title||v.label||v.runeName||v.id||v.refId||v.key||'');
  }
  function isRune(v){
    if(!v||typeof v!=='object')return false;
    if(v.rune===true||v.isRune===true||v.kind==='rune'||v.type==='rune'||v.category==='rune')return true;
    var s=(runeText(v)+' '+String(v.kind||'')+' '+String(v.type||'')+' '+String(v.refId||'')+' '+String(v.id||'')).toLowerCase();
    return s.indexOf('rune')>=0||s.indexOf('руна')>=0||s.indexOf('руны')>=0;
  }
  function rarityIndex(v){
    var r=v&&(v.rarity!=null?v.rarity:(v.quality!=null?v.quality:v.tier));
    if(typeof r==='number'&&isFinite(r)){
      if(r>=0&&r<=4)return Math.floor(r);
      if(r>=1&&r<=5)return Math.floor(r)-1;
    }
    var s=String(r==null?'':r).toLowerCase();
    if(/legend|orange|gold|легенд|оранж/.test(s))return 4;
    if(/epic|purple|violet|фиолет|эпич/.test(s))return 3;
    if(/rare|blue|син/.test(s))return 2;
    if(/uncommon|green|зел/.test(s))return 1;
    if(/common|gray|grey|white|сер|обыч/.test(s))return 0;
    var n=runeText(v).toLowerCase();
    if(/легенд|оранж/.test(n))return 4;
    if(/фиолет|эпич/.test(n))return 3;
    if(/син/.test(n))return 2;
    if(/зел/.test(n))return 1;
    if(/сер|обыч/.test(n))return 0;
    return -1;
  }
  function normalizeRuneKey(s){
    return String(s||'').toLowerCase()
      .replace(/легендарн\w*|legendary|фиолетов\w*|эпическ\w*|epic|син\w*|blue|rare|зелён\w*|зелен\w*|green|uncommon|сер\w*|gray|grey|common|обычн\w*/g,'')
      .replace(/\b[ivx]+\b/g,'')
      .replace(/[_\-–—]+/g,' ')
      .replace(/\s+/g,' ').trim();
  }
  function typeKey(v){
    if(!v)return '';
    var keys=['runeType','runeKey','statKey','effectKey','bonusKey','effect','stat','subtype','typeKey'];
    for(var i=0;i<keys.length;i++){
      var x=v[keys[i]];
      if(x!=null&&typeof x!=='object'&&String(x).trim())return normalizeRuneKey(x);
    }
    var id=v.refId||v.id||v.key||'';
    if(id&&String(id).toLowerCase().indexOf('rune')>=0)return normalizeRuneKey(id);
    return normalizeRuneKey(runeText(v));
  }
  function countOf(v){
    if(!v||typeof v!=='object')return 1;
    var n=Number(v.count!=null?v.count:(v.qty!=null?v.qty:(v.amount!=null?v.amount:1)));
    return isFinite(n)&&n>0?Math.floor(n):1;
  }
  function setCount(v,n){
    n=Math.max(0,Math.floor(Number(n)||0));
    if('count' in v)v.count=n;
    if('qty' in v)v.qty=n;
    if('amount' in v)v.amount=n;
    if(!('count' in v)&&!('qty' in v)&&!('amount' in v))v.count=n;
  }
  function ownedEntries(){
    var out=[],seen=new Set(),roots=[];
    // Rune ownership is stored with the character/rune menu, NOT in INV.bag.
    // Scan player save/state plus rune-named globals, while excluding equipped slots.
    try{if(P&&typeof P==='object')roots.push({v:P,path:'P'})}catch(_){}
    try{if(P&&P._saved&&typeof P._saved==='object')roots.push({v:P._saved,path:'P._saved'})}catch(_){}

    // Exact character-menu source: "ДОСТУПНЫЕ РУНЫ" is a separate rune
    // collection under the inventory/save state. Scan rune-named branches of
    // INV, but explicitly never use the normal item bag INV.bag.
    try{
      if(INV&&typeof INV==='object'){
        var _invSeen=new Set();
        function addInvRuneBranches(o,path,depth){
          if(!o||typeof o!=='object'||depth>4||_invSeen.has(o))return;
          _invSeen.add(o);
          var ks=[];try{ks=Object.keys(o)}catch(_){ks=[]}
          for(var ii=0;ii<ks.length;ii++){
            var kk=ks[ii],low=String(kk).toLowerCase();
            if(low==='bag'||/gear|equip|slot|socket|resource|material|stone|potion|book|pet|wing|cloak|necklace|artifact|auction|storage/.test(low))continue;
            var vv;try{vv=o[kk]}catch(_){continue}
            var pp=path+'.'+kk;
            if(/rune|runes|runa|runy|руна|руны/i.test(kk)){
              if(!/slot|equip|active|installed|socket/i.test(low)&&vv&&typeof vv==='object'){
                roots.push({v:vv,path:pp});
              }
              continue;
            }
            if(vv&&typeof vv==='object'&&!Array.isArray(vv))addInvRuneBranches(vv,pp,depth+1);
          }
        }
        addInvRuneBranches(INV,'INV',0);
      }
    }catch(_){}

    try{
      Object.keys(window).forEach(function(k){
        if(!/(rune|runes|runa|runy)/i.test(k))return;
        if(/catalog|defs|config|meta|icon|img|sprite|art|chance|drop|shop|black/i.test(k))return;
        var v;try{v=window[k]}catch(_){return}
        if(v&&typeof v==='object')roots.push({v:v,path:'window.'+k});
      });
    }catch(_){}
    // Character rune menu also uses lexical rune stores (const/let), which are
    // not enumerable on window. Discover their identifiers from loaded scripts
    // and resolve them through direct eval in the same global environment.
    try{
      sourceIdentifiers().forEach(function(n){
        if(/catalog|defs|config|meta|icon|img|sprite|art|chance|drop|shop|black/i.test(n))return;
        try{
          var v=eval(n);
          if(v&&typeof v==='object')roots.push({v:v,path:'lexical.'+n});
        }catch(_){}
      });
    }catch(_){}

    function excluded(path){
      return /equip|equipped|slot|active|installed|socket|selected|preview|catalog|defs|config|meta|shop|drop|chance/i.test(path);
    }
    function pseudoFromKey(k,count){
      return {id:String(k),refId:String(k),key:String(k),name:String(k),rune:true,count:Math.max(1,Math.floor(Number(count)||1))};
    }
    function walk(v,path,parent,key,depth){
      if(v==null||depth>7||excluded(path))return;

      if(typeof v==='string'){
        if(/rune|руна/i.test(path)||/rune|руна/i.test(v)){
          out.push({item:pseudoFromKey(v,1),parent:parent,key:key,path:path,count:1,mode:'string-array'});
        }
        return;
      }
      if(typeof v!=='object')return;
      if(seen.has(v))return;seen.add(v);

      var runeContainer=/rune|руна|runy/i.test(path);
      if(isRune(v)||(runeContainer&&(
        v.rarity!=null||v.quality!=null||v.tier!=null||
        v.runeType!=null||v.statKey!=null||v.effectKey!=null||
        v.refId!=null||v.id!=null||v.key!=null
      ))){
        out.push({item:v,parent:parent,key:key,path:path,count:countOf(v),mode:'object'});
        return;
      }

      if(v instanceof Map){
        v.forEach(function(x,k){
          if(typeof x==='number'&&x>0){
            out.push({item:pseudoFromKey(k,x),parent:v,key:k,path:path+'.'+String(k),count:Math.floor(x),mode:'map-count'});
          }else{
            walk(x,path+'.'+String(k),v,k,depth+1);
          }
        });
        return;
      }

      if(Array.isArray(v)){
        for(var i=0;i<v.length;i++)walk(v[i],path+'['+i+']',v,i,depth+1);
        return;
      }

      var ks=[];try{ks=Object.keys(v)}catch(_){ks=[]}
      for(var j=0;j<ks.length;j++){
        var k=ks[j],x;
        if(/^(img|image|sprite|html|srcdoc)$/i.test(k))continue;
        try{x=v[k]}catch(_){continue}

        // Common rune-bag shape: { rune_id: count }.
        if(runeContainer&&typeof x==='number'&&isFinite(x)&&x>0){
          out.push({item:pseudoFromKey(k,x),parent:v,key:k,path:path+'.'+k,count:Math.floor(x),mode:'count-map'});
          continue;
        }
        walk(x,path+'.'+k,v,k,depth+1);
      }
    }

    for(var r=0;r<roots.length;r++)walk(roots[r].v,roots[r].path,null,null,0);

    // Deduplicate aliases that point at the exact same storage cell.
    var dedup=[],keysSeen={},usedPaths={};
    out.forEach(function(e){
      var sig=e.path+'|'+String(e.key)+'|'+typeKey(e.item)+'|'+rarityIndex(e.item);
      if(keysSeen[sig])return;
      keysSeen[sig]=1;dedup.push(e);
      var base=String(e.path||'').replace(/\[[0-9]+\].*$/,'').replace(/\.[^.]+$/,'');
      if(base)usedPaths[base]=1;
    });
    window.PPA_AVAILABLE_RUNES_PATHS=Object.keys(usedPaths);
    return dedup;
  }
  function sourceIdentifiers(){
    var names={};
    try{
      document.querySelectorAll('script').forEach(function(sc){
        var t=String(sc.textContent||'');
        var re=/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*(?:rune|Rune|RUNE)[\w$]*)/g,m;
        while((m=re.exec(t)))names[m[1]]=1;
      });
    }catch(_){}
    return Object.keys(names);
  }
  function catalogRunes(){
    var out=[],seen=new Set(),roots=[];
    try{
      if(Array.isArray(window.PPA_CHARACTER_RUNE_CATALOG)){
        window.PPA_CHARACTER_RUNE_CATALOG.forEach(function(v){if(v&&typeof v==='object')out.push(v)});
      }
    }catch(_){}
    try{
      sourceIdentifiers().forEach(function(n){
        try{var v=eval(n);if(v&&typeof v==='object')roots.push(v)}catch(_){}
      });
    }catch(_){}
    try{
      Object.keys(window).forEach(function(k){
        if(!/rune/i.test(k))return;
        var v;try{v=window[k]}catch(_){return}
        if(v&&typeof v==='object')roots.push(v);
      });
    }catch(_){}
    function walk(v,depth){
      if(!v||depth>5||typeof v!=='object'||seen.has(v))return;
      seen.add(v);
      if(isRune(v)){out.push(v);return}
      if(Array.isArray(v)){
        for(var i=0;i<v.length&&i<500;i++)walk(v[i],depth+1);
      }else{
        var ks=[];try{ks=Object.keys(v)}catch(_){ks=[]}
        for(var j=0;j<ks.length&&j<500;j++){
          var x;try{x=v[ks[j]]}catch(_){continue}
          if(x&&typeof x==='object')walk(x,depth+1);
        }
      }
    }
    for(var i=0;i<roots.length;i++)walk(roots[i],0);
    return out;
  }
  function resolveOwnedRune(e,catalog){
    var it=e.item,r=rarityIndex(it),k=typeKey(it);
    if(r>=0&&k)return it;
    var raw=String((it&&(it.refId||it.id||it.key||it.name))||'').toLowerCase();
    for(var i=0;i<catalog.length;i++){
      var c=catalog[i];
      var cr=String(c&&(c.refId||c.id||c.key||c.name)||'').toLowerCase();
      if(raw&&cr&&raw===cr)return c;
    }
    return it;
  }
  function groupList(){
    var entries=ownedEntries(),catalog=catalogRunes(),map={};
    entries.forEach(function(e){
      var resolved=resolveOwnedRune(e,catalog);
      var r=rarityIndex(resolved),k=typeKey(resolved);
      if(r<0||r>2||!k)return;
      var id=r+'|'+k;
      if(!map[id])map[id]={
        id:id,rarity:r,key:k,
        name:runeText(resolved)||runeText(e.item)||'Руна',
        count:0,entries:[],
        img:(resolved&&(resolved.img||resolved.image||resolved.iconImg||resolved.src))||(e.item&&(e.item.img||e.item.image))||''
      };
      map[id].count+=e.count;
      e.resolvedItem=resolved;
      map[id].entries.push(e);
    });
    return Object.keys(map).map(function(k){
      var g=map[k];
      g.chance=CHANCE[g.rarity]||0;
      g.nextRarity=NEXT[g.rarity];
      g.eligible=g.count>=2;
      return g;
    }).filter(function(g){return g.count>0}).sort(function(a,b){return a.rarity-b.rarity||a.name.localeCompare(b.name)});
  }
  function findTemplate(group){
    var next=group.nextRarity,key=group.key;
    var all=catalogRunes().concat(ownedEntries().map(function(e){return e.item}));
    for(var i=0;i<all.length;i++){
      if(rarityIndex(all[i])===next&&typeKey(all[i])===key)return safeClone(all[i]);
    }
    return null;
  }
  function patchRarity(v,r){
    var names=['common','uncommon','rare','epic','legendary'];
    if(v.rarity!=null){
      if(typeof v.rarity==='number')v.rarity=r;
      else v.rarity=names[r];
    }else v.rarity=names[r];
    if(v.quality!=null){
      if(typeof v.quality==='number')v.quality=r;
      else v.quality=names[r];
    }
    if(v.tier!=null&&typeof v.tier==='number')v.tier=r;
    return v;
  }
  function makeResult(group){
    var t=findTemplate(group);
    if(!t){
      var src=group.entries[0]&&(group.entries[0].resolvedItem||group.entries[0].item);
      t=safeClone(src);
      if(!t)return null;
      patchRarity(t,group.nextRarity);
      // Remove stale per-instance/equipment state; stat/effect fields remain intact.
      delete t.equipped;delete t.slotIndex;delete t.socketIndex;delete t.installed;
    }
    if('uid' in t)t.uid='rune_fuse_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
    setCount(t,1);
    return t;
  }
  function consumeTwo(group){
    var need=2;
    var arr=group.entries.slice().sort(function(a,b){
      if(a.parent===b.parent&&Array.isArray(a.parent))return Number(b.key)-Number(a.key);
      return 0;
    });
    for(var i=0;i<arr.length&&need>0;i++){
      var e=arr[i];
      if(e.mode==='map-count'&&e.parent instanceof Map){
        var nm=Math.max(0,Math.floor(Number(e.parent.get(e.key))||0)),takem=Math.min(need,nm);
        if(nm>takem)e.parent.set(e.key,nm-takem);else e.parent.delete(e.key);
        need-=takem;continue;
      }
      if(e.mode==='count-map'&&e.parent&&e.key!=null){
        var n0=Math.max(0,Math.floor(Number(e.parent[e.key])||0)),take0=Math.min(need,n0);
        if(n0>take0)e.parent[e.key]=n0-take0;else try{delete e.parent[e.key]}catch(_){}
        need-=take0;continue;
      }
      if(e.mode==='string-array'&&Array.isArray(e.parent)){
        e.parent.splice(Number(e.key),1);need--;continue;
      }
      var n=countOf(e.item),take=Math.min(need,n);
      if(n>take){setCount(e.item,n-take)}
      else if(Array.isArray(e.parent)){e.parent.splice(Number(e.key),1)}
      else if(e.parent&&e.key!=null){try{delete e.parent[e.key]}catch(_){}}
      need-=take;
    }
    return need===0;
  }
  function addResult(group,item){
    var first=group.entries[0],target=first&&first.parent;
    if(!first||!target)return false;
    var key=typeKey(item),r=rarityIndex(item);

    if(first.mode==='map-count'&&target instanceof Map){
      var mapKey=item.refId||item.id||item.key;
      if(mapKey==null)return false;
      target.set(mapKey,Math.max(0,Math.floor(Number(target.get(mapKey))||0))+1);
      return true;
    }
    if(first.mode==='count-map'&&!Array.isArray(target)){
      var storageKey=String(item.refId||item.id||item.key||'');
      if(!storageKey)return false;
      target[storageKey]=Math.max(0,Math.floor(Number(target[storageKey])||0))+1;
      return true;
    }
    if(first.mode==='string-array'&&Array.isArray(target)){
      var storageId=String(item.refId||item.id||item.key||'');
      if(!storageId)return false;
      target.push(storageId);return true;
    }
    if(!Array.isArray(target))return false;
    for(var i=0;i<target.length;i++){
      var x=target[i];
      if(x&&isRune(x)&&typeKey(x)===key&&rarityIndex(x)===r&&('count' in x||'qty' in x||'amount' in x)){
        setCount(x,countOf(x)+1);return true;
      }
    }
    target.push(item);return true;
  }
  function goldRef(){
    var roots=[];
    try{roots.push(INV)}catch(_){}
    try{roots.push(P)}catch(_){}
    var exact=['gold','coins','money','coin','zoloto'];
    for(var i=0;i<roots.length;i++){
      var o=roots[i];if(!o||typeof o!=='object')continue;
      for(var j=0;j<exact.length;j++){
        var k=exact[j];
        if(typeof o[k]==='number'&&isFinite(o[k]))return {obj:o,key:k};
      }
    }
    // Read the game's sell function to discover the real currency field when possible.
    try{
      if(typeof sellFromBag==='function'){
        var src=Function.prototype.toString.call(sellFromBag);
        var m=src.match(/([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*(?:gold|coin|money)[\w$]*)\s*\+=/i);
        if(m){
          var o2=eval(m[1]);
          if(o2&&typeof o2[m[2]]==='number')return {obj:o2,key:m[2]};
        }
      }
    }catch(_){}
    return null;
  }
  function persist(){
    try{saveGame()}catch(_){}
    try{sendInvState()}catch(_){}
    try{sendBlacksmithState()}catch(_){}
    try{updateUI()}catch(_){}
  }
  function flash(msg,color){
    try{showPickup(msg,color||'#e6c58b')}catch(_){}
  }

  window.PPA_RUNE_FUSION_SOURCE=function(){
    var p=window.PPA_AVAILABLE_RUNES_PATHS||[];
    if(p.length)return p.join(' · ');
    if(window.PPA_CHARACTER_RUNE_SOURCE)return window.PPA_CHARACTER_RUNE_SOURCE;
    return 'ДОСТУПНЫЕ РУНЫ';
  };
  window.PPA_RUNE_FUSION_DEBUG=function(){
    var entries=[];try{entries=ownedEntries()}catch(_){}
    var cat=[];try{cat=catalogRunes()}catch(_){}
    return {owned:entries.length,catalog:cat.length,characterCatalog:(window.PPA_CHARACTER_RUNE_CATALOG||[]).length,characterAvailable:(window.PPA_CHARACTER_AVAILABLE_RUNES||[]).length,source:window.PPA_RUNE_FUSION_SOURCE()};
  };
  window.PPA_RUNE_FUSION_LIST=function(){
    return groupList().map(function(g){
      return {id:g.id,name:g.name,count:g.count,rarity:g.rarity,nextRarity:g.nextRarity,chance:g.chance,eligible:g.eligible,img:g.img||''};
    });
  };
  window.PPA_RUNE_FUSION_TRY=function(id){
    var groups=groupList(),g=null;
    for(var i=0;i<groups.length;i++)if(groups[i].id===id){g=groups[i];break}
    if(!g)return {ok:false,message:'Руны не найдены'};
    if(g.count<2)return {ok:false,message:'Нужно 2 одинаковые руны'};
    if(g.rarity>2)return {ok:false,message:'Фиолетовые руны не сливаются в легендарные'};
    var money=goldRef();
    if(!money)return {ok:false,message:'Не удалось определить запас золота'};
    var gold=Math.max(0,Math.floor(Number(money.obj[money.key])||0));
    if(gold<COST)return {ok:false,message:'Нужно 5000 золота'};
    var result=makeResult(g);
    if(!result)return {ok:false,message:'Не удалось создать руну следующей редкости'};

    money.obj[money.key]=gold-COST;
    if(!consumeTwo(g)){
      money.obj[money.key]=gold;
      return {ok:false,message:'Не удалось списать руны'};
    }
    var success=Math.random()<(CHANCE[g.rarity]||0);
    if(success){
      if(!addResult(g,result)){
        // This should be rare; refund everything rather than deleting player items.
        money.obj[money.key]=gold;
        flash('Слияние отменено · не найдено хранилище результата','#ff8c78');
        return {ok:false,message:'Слияние отменено'};
      }
      persist();
      var msg='Успех! '+RARITY_NAME[g.nextRarity]+' руна получена';
      flash('✨ '+msg,'#c987ff');
      return {ok:true,success:true,message:msg};
    }
    persist();
    var fail='Слияние не удалось · 2 руны и 5000 золота израсходованы';
    flash(fail,'#ff8c78');
    return {ok:true,success:false,message:fail};
  };

  function installFrame(fr){
    var w,d;
    try{w=fr.contentWindow;d=fr.contentDocument}catch(_){return}
    if(!w||!d||!d.body||d.__ppaRuneFusionInstalled)return;
    var isSmith=false;
    try{isSmith=typeof w.inspectSmithItem==='function'||/КУЗНЕЦ|КУЗНИЦА|ЗАТОЧК/i.test(String(d.body.textContent||'').slice(0,3000))}catch(_){}
    if(!isSmith)return;
    d.__ppaRuneFusionInstalled=true;

    var style=d.createElement('style');
    style.textContent=
      '#ppaRuneFusionBtn{width:100%;height:42px;margin:8px 0;border:1px solid #8f5b27;border-radius:8px;background:linear-gradient(#44270f,#21140b);color:#f4cf80;font:bold 12px Georgia,serif;letter-spacing:.07em}'+
      '#ppaRuneFusionShade{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.78);display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}'+
      '#ppaRuneFusionShade.on{display:flex}#ppaRuneFusionPanel{width:min(560px,96vw);max-height:88vh;overflow:auto;border:1px solid #93602c;border-radius:10px;background:#160f0b;color:#e6c58b;padding:12px;box-sizing:border-box;box-shadow:0 10px 35px #000}'+
      '.ppaRFrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px 7px;margin:6px 0;border:1px solid #5a4027;border-radius:7px;background:#0d0b0a}.ppaRFbtn{height:34px;border:1px solid #92612d;border-radius:6px;background:#35200e;color:#f0cb7c;font:bold 10px monospace;padding:0 10px}.ppaRFbtn:disabled{opacity:.4}';
    (d.head||d.documentElement).appendChild(style);

    var btn=d.createElement('button');
    btn.id='ppaRuneFusionBtn';btn.type='button';btn.textContent='⚗ СЛИЯНИЕ РУН';
    d.body.insertBefore(btn,d.body.firstChild);

    var shade=d.createElement('div');
    shade.id='ppaRuneFusionShade';
    shade.innerHTML='<div id="ppaRuneFusionPanel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font:16px Georgia,serif;color:#f4cf80">СЛИЯНИЕ РУН</b><button id="ppaRFClose" class="ppaRFbtn">✕</button></div><div style="font:10px monospace;color:#ad987a;margin:8px 0 10px">2 одинаковые руны · цена попытки 5000 золота<br>Серая → зелёная 37% · зелёная → синяя 30% · синяя → фиолетовая 22%<br>При неудаче обе руны сгорают. Легендарные руны остаются только в Чёрном рынке.</div><div id="ppaRFList"></div><div id="ppaRFMsg" style="min-height:18px;margin-top:8px;font:10px monospace;color:#d6b77d"></div></div>';
    d.body.appendChild(shade);
    var list=shade.querySelector('#ppaRFList'),msg=shade.querySelector('#ppaRFMsg');

    function render(){
      var rows=[];try{rows=parent.PPA_RUNE_FUSION_LIST?parent.PPA_RUNE_FUSION_LIST():[]}catch(_){}
      list.innerHTML='';
      if(!rows.length){list.innerHTML='<div style="padding:16px;text-align:center;color:#8f806f;font:10px monospace">В «ДОСТУПНЫЕ РУНЫ» нет подходящей пары.</div>';return}
      rows.forEach(function(x){
        var row=d.createElement('div');row.className='ppaRFrow';
        var pct=Math.round((Number(x.chance)||0)*100);
        row.innerHTML='<div><div style="font:bold 11px Georgia,serif;color:#ead0a0">'+String(x.name||'Руна')+'</div><div style="margin-top:3px;font:9px monospace;color:#a99478">'+RARITY_NAME[x.rarity]+' · в наличии '+x.count+' · шанс '+pct+'%</div></div>';
        var b=d.createElement('button');b.className='ppaRFbtn';b.textContent='СЛИТЬ · 5000';b.disabled=!x.eligible;
        b.onclick=function(){
          b.disabled=true;var r;
          try{r=parent.PPA_RUNE_FUSION_TRY(x.id)}catch(e){r={ok:false,message:'Ошибка слияния'}}
          msg.textContent=(r&&r.message)||'';
          render();
        };
        row.appendChild(b);list.appendChild(row);
      });
    }
    btn.onclick=function(){shade.classList.add('on');msg.textContent='';render()};
    shade.querySelector('#ppaRFClose').onclick=function(){shade.classList.remove('on')};
    shade.addEventListener('click',function(e){if(e.target===shade)shade.classList.remove('on')});
  }

  function scan(){
    try{document.querySelectorAll('iframe').forEach(installFrame)}catch(_){}
  }
  scan();
  try{
    new MutationObserver(function(){scan()}).observe(document.documentElement,{childList:true,subtree:true});
  }catch(_){}
  setInterval(scan,1200);
})();
</script>
</body>`
);

if(!output.includes("id=\"ppaRuneFusionRuntime\"") ||
   !output.includes("var CHANCE={0:.37,1:.30,2:.22}") ||
   !output.includes("var COST=5000") ||
   !output.includes("Rune ownership is stored with the character/rune menu, NOT in INV.bag") ||
   !output.includes("addInvRuneBranches(INV,'INV',0)") ||
   !output.includes("low==='bag'") ||
   !output.includes("PPA_AVAILABLE_RUNES_PATHS") ||
   !output.includes("PPA_CHARACTER_RUNE_CATALOG") ||
   !output.includes("PPA_REGISTER_CHARACTER_RUNES") ||
   !output.includes("lexical.'+n") ||
   !output.includes("mode:'map-count'") ||
   !output.includes("mode:'count-map'") ||
   !output.includes("mode:'string-array'") ||
   !output.includes("Фиолетовые руны не сливаются в легендарные") ||
   !output.includes("PPA_RUNE_FUSION_TRY")) {
  throw new Error('Rune fusion patch did not apply');
}
/* ======================================================================== */

/* === LEXICAL RUNE FUSION BRIDGE ========================================= */
// The real "ДОСТУПНЫЕ РУНЫ" source is INV.runes inside the packed game's
// lexical scope. Appended <script> tags cannot see lexical const/let bindings,
// which is why the old body script saw 0 runes. Install fusion functions from
// inside runeUiState()/sendBlacksmithState(), where INV/runeDefByKey/runeKey
// are directly accessible.
ppaPatchRegex(
  'rune fusion lexical bridge at runeUiState',
  /function\s+runeUiState\(\)\s*\{/,
  `function ppaInstallRuneFusionLexical(){
  var COST=5000;
  var CHANCE={common:.37,uncommon:.30,rare:.22};
  var NEXT={common:'uncommon',uncommon:'rare',rare:'epic'};
  var RIDX={common:0,uncommon:1,rare:2,epic:3,legendary:4};

  function infoText(d){
    if(!d)return '';
    var a=[];
    var t=d.description||d.desc||d.valueText||d.effectText||d.bonusText||
          d.effectDescription||d.tooltip||d.info||'';
    if(!t&&typeof d.effect==='string')t=d.effect;
    if(!t&&typeof d.bonus==='string')t=d.bonus;
    if(t)a.push(String(t));
    if(d.stats&&typeof d.stats==='object'){
      var ss=[];
      try{Object.keys(d.stats).forEach(function(k){
        var v=d.stats[k];
        if(v==null||v===''||typeof v==='object')return;
        ss.push(String(k)+': '+String(v));
      })}catch(_){}
      if(ss.length)a.push(ss.join(' · '));
    }
    return a.join('\\n');
  }

  function refresh(){
    try{normalizeRuneState()}catch(_){}
    try{saveGame()}catch(_){}
    try{recomputeStats()}catch(_){}
    try{sendInvState()}catch(_){}
    try{sendBlacksmithState()}catch(_){}
    try{updateUI()}catch(_){}
  }

  window.__PPA_RUNE_FUSION_LEXICAL=true;
  window.PPA_RUNE_FUSION_SOURCE=function(){
    return 'ДОСТУПНЫЕ РУНЫ · runeUiState().inventory ← INV.runes';
  };
  window.PPA_RUNE_FUSION_DEBUG=function(){
    var bag={};try{bag=INV&&INV.runes&&typeof INV.runes==='object'?INV.runes:{}}catch(_){}
    return {lexical:true,owned:Object.keys(bag).length,catalog:Object.keys(bag).length,characterCatalog:Object.keys(bag).length,characterAvailable:Object.keys(bag).length,source:window.PPA_RUNE_FUSION_SOURCE()};
  };
  window.PPA_RUNE_FUSION_LIST=function(){
    try{normalizeRuneState()}catch(_){}
    var out=[],bag=(INV&&INV.runes&&typeof INV.runes==='object')?INV.runes:{};
    Object.keys(bag).forEach(function(key){
      var d=null;try{d=runeDefByKey(key)}catch(_){}
      var count=Math.max(0,Math.floor(Number(bag[key])||0));
      if(!d||count<=0||CHANCE[d.rarity]==null)return;
      out.push({
        id:d.key||key,key:d.key||key,type:d.type||'',
        name:d.name||'Руна',count:count,
        rarity:RIDX[d.rarity],rarityKey:d.rarity,
        nextRarity:RIDX[NEXT[d.rarity]],
        chance:CHANCE[d.rarity],eligible:count>=2,
        img:d.img||'',icon:d.icon||'◇',
        valueText:d.valueText||'',infoText:infoText(d)
      });
    });
    out.sort(function(a,b){
      return Number(a.rarity)-Number(b.rarity)||
        String(a.type||'').localeCompare(String(b.type||''));
    });
    return out;
  };
  window.PPA_RUNE_FUSION_TRY=function(key){
    try{normalizeRuneState()}catch(_){}
    var d=null;try{d=runeDefByKey(key)}catch(_){}
    if(!d)return {ok:false,message:'Руна не найдена'};
    if(CHANCE[d.rarity]==null)return {ok:false,message:'Эту редкость нельзя сливать'};
    if(!INV.runes||typeof INV.runes!=='object')return {ok:false,message:'ДОСТУПНЫЕ РУНЫ недоступны'};
    var have=Math.max(0,Math.floor(Number(INV.runes[d.key])||0));
    if(have<2)return {ok:false,message:'Нужно 2 одинаковые руны'};
    var gold=Math.max(0,Math.floor(Number(INV.gold)||0));
    if(gold<COST)return {ok:false,message:'Нужно 5000 золота'};

    INV.gold=gold-COST;
    INV.runes[d.key]=have-2;
    if(INV.runes[d.key]<=0)delete INV.runes[d.key];

    var success=Math.random()<CHANCE[d.rarity];
    if(success){
      var nextKey=null,nextDef=null;
      try{nextKey=runeKey(d.type,NEXT[d.rarity]);nextDef=runeDefByKey(nextKey)}catch(_){}
      if(!nextKey||!nextDef){
        INV.gold=gold;
        INV.runes[d.key]=(Number(INV.runes[d.key])||0)+2;
        refresh();
        return {ok:false,message:'Слияние отменено · не найдена следующая редкость'};
      }
      try{
        if(typeof addStatRune==='function')addStatRune(nextKey,1);
        else INV.runes[nextKey]=(Number(INV.runes[nextKey])||0)+1;
      }catch(_){
        INV.runes[nextKey]=(Number(INV.runes[nextKey])||0)+1;
      }
      refresh();
      var rn='';
      try{rn=(typeof RUNE_RARITY_NAME!=='undefined'&&RUNE_RARITY_NAME[NEXT[d.rarity]])||NEXT[d.rarity]}catch(_){rn=NEXT[d.rarity]}
      try{showPickup('✨ Слияние успешно · '+(nextDef.name||'Руна')+' · '+rn,'#c987ff')}catch(_){}
      return {ok:true,success:true,message:'Успех! '+(nextDef.name||'Руна')+' · '+rn};
    }

    refresh();
    try{showPickup('Слияние не удалось · 2 руны и 5000 золота сгорели','#ff8c78')}catch(_){}
    return {ok:true,success:false,message:'Слияние не удалось · 2 руны и 5000 золота израсходованы'};
  };
}
function runeUiState(){
  ppaInstallRuneFusionLexical();`
);

// Opening the smith always refreshes the lexical bridge before its iframe asks
// for the list. This makes fusion work even if Character -> RUNES was not opened first.
ppaPatchRegex(
  'rune fusion lexical bridge on blacksmith state',
  /function\s+sendBlacksmithState\(\)\s*\{/,
  `function sendBlacksmithState(){
  try{ppaInstallRuneFusionLexical()}catch(_){}`
);

if(!output.includes("function ppaInstallRuneFusionLexical()") ||
   !output.includes("window.__PPA_RUNE_FUSION_LEXICAL=true") ||
   !output.includes("ppaInstallRuneFusionLexical();") ||
   !output.includes("ДОСТУПНЫЕ РУНЫ · runeUiState().inventory ← INV.runes")) {
  throw new Error('Lexical rune fusion bridge did not apply');
}
/* ======================================================================== */

/* === EXACT RUNE FUSION SOURCE ============================================ */
// Verified from the packed game source:
//   "ДОСТУПНЫЕ РУНЫ" is rendered by renderRunes(rs) from rs.inventory.
//   char state sends runes:runeUiState().
//   runeUiState() builds inventory directly from INV.runes.
// So fusion must use INV.runes (unequipped runes only), not INV.bag and not a scanner.
ppaPatchRegex(
  'exact rune fusion source INV.runes',
  /<\/body>/,
  `<script id="ppaRuneFusionExactSource">
(function(){
  if(window.__PPA_RUNE_FUSION_LEXICAL)return;
  var COST=5000;
  var CHANCE={common:.37,uncommon:.30,rare:.22};
  var NEXT={common:'uncommon',uncommon:'rare',rare:'epic'};
  var RIDX={common:0,uncommon:1,rare:2,epic:3,legendary:4};

  function refresh(){
    try{normalizeRuneState()}catch(_){}
    try{saveGame()}catch(_){}
    try{recomputeStats()}catch(_){}
    try{sendInvState()}catch(_){}
    try{sendBlacksmithState()}catch(_){}
    try{updateUI()}catch(_){}
  }

  window.PPA_RUNE_FUSION_SOURCE=function(){
    return 'INV.runes → runeUiState().inventory';
  };

  function ppaFusionRuneInfoText(d){
    if(!d)return '';
    var lines=[];
    var text=d.description||d.desc||d.valueText||d.effectText||d.bonusText||
             d.effectDescription||d.tooltip||d.info||'';
    if(!text&&typeof d.effect==='string')text=d.effect;
    if(!text&&typeof d.bonus==='string')text=d.bonus;
    if(!text&&typeof d.stat==='string'){
      var vv=d.value!=null?d.value:(d.amount!=null?d.amount:'');
      text=String(d.stat)+(vv!==''?' '+String(vv):'');
    }
    if(text)lines.push(String(text));
    if(d.stats&&typeof d.stats==='object'){
      var ss=[];
      try{
        Object.keys(d.stats).forEach(function(k){
          var v=d.stats[k];
          if(v==null||v===''||typeof v==='object')return;
          ss.push(String(k)+': '+String(v));
        });
      }catch(_){}
      if(ss.length)lines.push(ss.join(' · '));
    }
    if(!lines.length){
      var skip=/^(id|uid|key|refId|name|title|label|runeName|rarity|quality|tier|img|image|src|icon|iconImg|count|qty|amount|rune|isRune|kind|type|category)$/i;
      var extra=[];
      try{
        Object.keys(d).forEach(function(k){
          if(skip.test(k))return;
          var v=d[k];
          if(v==null||v===''||typeof v==='object'||typeof v==='function'||typeof v==='boolean')return;
          if(String(v).length>80)return;
          extra.push(String(k)+': '+String(v));
        });
      }catch(_){}
      if(extra.length)lines.push(extra.slice(0,4).join(' · '));
    }
    return lines.join('\n');
  }

  window.PPA_RUNE_FUSION_LIST=function(){
    try{normalizeRuneState()}catch(_){}
    var out=[];
    var bag=(typeof INV!=='undefined'&&INV&&INV.runes&&typeof INV.runes==='object')?INV.runes:{};
    Object.keys(bag).forEach(function(key){
      var d=null;
      try{d=runeDefByKey(key)}catch(_){}
      var count=Math.max(0,Math.floor(Number(bag[key])||0));
      if(!d||count<=0||CHANCE[d.rarity]==null)return;
      out.push({
        id:d.key||key,
        key:d.key||key,
        type:d.type||'',
        name:d.name||'Руна',
        count:count,
        rarity:RIDX[d.rarity],
        rarityKey:d.rarity,
        nextRarity:RIDX[NEXT[d.rarity]],
        chance:CHANCE[d.rarity],
        eligible:count>=2,
        img:d.img||'',
        icon:d.icon||'◇',
        valueText:d.valueText||'',
        infoText:ppaFusionRuneInfoText(d)
      });
    });
    out.sort(function(a,b){
      return Number(a.rarity)-Number(b.rarity)||
        String(a.type||'').localeCompare(String(b.type||''));
    });
    return out;
  };

  window.PPA_RUNE_FUSION_TRY=function(key){
    try{normalizeRuneState()}catch(_){}
    var d=null;
    try{d=runeDefByKey(key)}catch(_){}
    if(!d)return {ok:false,message:'Руна не найдена'};
    if(CHANCE[d.rarity]==null)return {ok:false,message:'Эту редкость нельзя сливать'};
    var have=Math.max(0,Math.floor(Number(INV.runes&&INV.runes[d.key])||0));
    if(have<2)return {ok:false,message:'Нужно 2 одинаковые руны'};
    var gold=Math.max(0,Math.floor(Number(INV.gold)||0));
    if(gold<COST)return {ok:false,message:'Нужно 5000 золота'};

    INV.gold=gold-COST;
    INV.runes[d.key]=have-2;
    if(INV.runes[d.key]<=0)delete INV.runes[d.key];

    var success=Math.random()<CHANCE[d.rarity];
    if(success){
      var nextKey=null,nextDef=null;
      try{
        nextKey=runeKey(d.type,NEXT[d.rarity]);
        nextDef=runeDefByKey(nextKey);
      }catch(_){}
      if(!nextKey||!nextDef){
        // Safety: refund if the next rune definition is unexpectedly missing.
        INV.gold=gold;
        INV.runes[d.key]=(Number(INV.runes[d.key])||0)+2;
        refresh();
        return {ok:false,message:'Слияние отменено · не найдена следующая редкость'};
      }
      try{
        if(typeof addStatRune==='function')addStatRune(nextKey,1);
        else INV.runes[nextKey]=(Number(INV.runes[nextKey])||0)+1;
      }catch(_){
        INV.runes[nextKey]=(Number(INV.runes[nextKey])||0)+1;
      }
      refresh();
      var nr=(typeof RUNE_RARITY_NAME!=='undefined'&&RUNE_RARITY_NAME[NEXT[d.rarity]])||NEXT[d.rarity];
      try{showPickup('✨ Слияние успешно · '+(nextDef.name||'Руна')+' · '+nr,'#c987ff')}catch(_){}
      return {ok:true,success:true,message:'Успех! '+(nextDef.name||'Руна')+' · '+nr};
    }

    refresh();
    try{showPickup('Слияние не удалось · 2 руны и 5000 золота сгорели','#ff8c78')}catch(_){}
    return {ok:true,success:false,message:'Слияние не удалось · 2 руны и 5000 золота израсходованы'};
  };
})();
</script>
</body>`
);

if(!output.includes("id=\"ppaRuneFusionExactSource\"") ||
   !output.includes("INV.runes → runeUiState().inventory") ||
   !output.includes("var CHANCE={common:.37,uncommon:.30,rare:.22}") ||
   !output.includes("function ppaFusionRuneInfoText(d)") ||
   !output.includes("infoText:ppaFusionRuneInfoText(d)") ||
   !output.includes("INV.runes[d.key]=have-2")) {
  throw new Error('Exact INV.runes fusion source patch did not apply');
}
/* ======================================================================== */


/* === BLACKSMITH CUSTOM DARK SELECT ====================================== */
// Android/Telegram WebView renders the popup of a native <select> itself and
// ignores CSS for that popup. Keep the original selects as the source of truth,
// but hide their native UI and mirror them with a custom dark/gold dropdown.
// Selecting an entry writes back to the original <select> and dispatches the
// normal input/change events, so all existing smith logic stays untouched.
ppaPatchRegex(
  'blacksmith custom dark sharpening selects',
  /function\\s+inspectSmithItem\\(it,context\\)\\s*\\{/,
  ppaEscapeSrcdocCode(`function ppaInstallSmithCustomSelects(){
  if(!document.getElementById('ppaSmithSelectStyle')){
    var st=document.createElement('style');
    st.id='ppaSmithSelectStyle';
    st.textContent=
      '.ppaSmithSelect{display:inline-block;position:relative;vertical-align:middle;min-width:120px}'+
      '.ppaSmithSelectBtn{box-sizing:border-box;width:100%;height:30px;padding:0 28px 0 10px;border:1px solid #7a5528;border-radius:4px;background:#0d1114;color:#f0c166;font:9px monospace;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative}'+
      '.ppaSmithSelectBtn:after{content:"⌄";position:absolute;right:9px;top:50%;transform:translateY(-55%);color:#e6b75b;font-size:14px}'+
      '.ppaSmithSelectBtn:disabled{opacity:.45}'+
      '.ppaSmithSelectMenu{position:fixed;z-index:2147483647;display:none;box-sizing:border-box;max-height:260px;overflow:auto;border:1px solid #8b622f;border-radius:5px;background:#100d09;box-shadow:0 10px 28px rgba(0,0,0,.72);padding:3px}'+
      '.ppaSmithSelectMenu.on{display:block}'+
      '.ppaSmithSelectOpt{display:block;box-sizing:border-box;width:100%;min-height:34px;padding:9px 10px;border:0;border-bottom:1px solid #342717;background:#100d09;color:#e8be70;font:9px monospace;text-align:left}'+
      '.ppaSmithSelectOpt:last-child{border-bottom:0}'+
      '.ppaSmithSelectOpt:active,.ppaSmithSelectOpt.sel{background:#2b1d0d;color:#ffd98c}'+
      '.ppaSmithSelectOpt:disabled{opacity:.4}'+
      'select.ppaSmithNative{position:absolute!important;left:-99999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}';
    (document.head||document.documentElement).appendChild(st);
  }

  function closeAll(except){
    Array.prototype.forEach.call(document.querySelectorAll('.ppaSmithSelectMenu.on'),function(m){
      if(m!==except)m.classList.remove('on');
    });
  }

  function labelFor(sel){
    var o=sel.options&&sel.selectedIndex>=0?sel.options[sel.selectedIndex]:null;
    return o?String(o.textContent||o.label||o.value||'').trim():'Выбрать';
  }

  function positionMenu(btn,menu){
    var r=btn.getBoundingClientRect();
    var w=Math.max(120,Math.round(r.width));
    menu.style.width=w+'px';
    menu.style.left=Math.max(4,Math.min(window.innerWidth-w-4,r.left))+'px';
    var below=window.innerHeight-r.bottom-6;
    var mh=Math.min(260,Math.max(80,menu.scrollHeight||180));
    if(below>=Math.min(mh,160)){
      menu.style.top=(r.bottom+3)+'px';
      menu.style.bottom='auto';
    }else{
      menu.style.top='auto';
      menu.style.bottom=Math.max(4,window.innerHeight-r.top+3)+'px';
    }
  }

  function rebuild(sel,btn,menu){
    btn.textContent=labelFor(sel);
    btn.disabled=!!sel.disabled;
    menu.innerHTML='';
    Array.prototype.forEach.call(sel.options||[],function(o){
      var b=document.createElement('button');
      b.type='button';
      b.className='ppaSmithSelectOpt'+(o.selected?' sel':'');
      b.textContent=String(o.textContent||o.label||o.value||'').trim();
      b.disabled=!!o.disabled;
      b.onclick=function(ev){
        ev.preventDefault();ev.stopPropagation();
        if(o.disabled)return;
        sel.value=o.value;
        try{sel.dispatchEvent(new Event('input',{bubbles:true}))}catch(_){}
        try{sel.dispatchEvent(new Event('change',{bubbles:true}))}catch(_){}
        btn.textContent=labelFor(sel);
        menu.classList.remove('on');
        setTimeout(function(){ppaRefreshSmithCustomSelects()},0);
      };
      menu.appendChild(b);
    });
  }

  function upgrade(sel){
    if(!sel||sel.tagName!=='SELECT'||!sel.classList.contains('pill'))return;
    if(sel.dataset.ppaSmithCustom==='1'){
      var oldBtn=sel.__ppaSmithBtn,oldMenu=sel.__ppaSmithMenu;
      if(oldBtn&&oldMenu)rebuild(sel,oldBtn,oldMenu);
      return;
    }

    var r=sel.getBoundingClientRect();
    var host=document.createElement('span');
    host.className='ppaSmithSelect';
    host.style.width=Math.max(120,Math.round(r.width||160))+'px';
    sel.parentNode.insertBefore(host,sel);
    host.appendChild(sel);

    var btn=document.createElement('button');
    btn.type='button';
    btn.className='ppaSmithSelectBtn';
    host.appendChild(btn);

    var menu=document.createElement('div');
    menu.className='ppaSmithSelectMenu';
    document.body.appendChild(menu);

    sel.dataset.ppaSmithCustom='1';
    sel.classList.add('ppaSmithNative');
    sel.__ppaSmithBtn=btn;
    sel.__ppaSmithMenu=menu;

    rebuild(sel,btn,menu);

    btn.onclick=function(ev){
      ev.preventDefault();ev.stopPropagation();
      if(btn.disabled)return;
      var opening=!menu.classList.contains('on');
      closeAll(menu);
      if(opening){
        rebuild(sel,btn,menu);
        menu.classList.add('on');
        positionMenu(btn,menu);
      }else menu.classList.remove('on');
    };
    sel.addEventListener('change',function(){rebuild(sel,btn,menu)});
  }

  window.ppaRefreshSmithCustomSelects=function(){
    Array.prototype.forEach.call(document.querySelectorAll('select.pill'),upgrade);
    Array.prototype.forEach.call(document.querySelectorAll('.ppaSmithSelectMenu'),function(m){
      var owner=null;
      Array.prototype.some.call(document.querySelectorAll('select[data-ppa-smith-custom="1"]'),function(s){
        if(s.__ppaSmithMenu===m){owner=s;return true}return false;
      });
      if(!owner||!document.documentElement.contains(owner)){try{m.remove()}catch(_){}}
    });
  };

  if(!window.__ppaSmithSelectGlobalHandlers){
    window.__ppaSmithSelectGlobalHandlers=1;
    document.addEventListener('click',function(e){
      if(!e.target.closest||(!e.target.closest('.ppaSmithSelect')&&!e.target.closest('.ppaSmithSelectMenu')))closeAll();
    },true);
    window.addEventListener('resize',function(){closeAll()});
    window.addEventListener('scroll',function(){closeAll()},true);
  }

  ppaRefreshSmithCustomSelects();
  if(!window.__ppaSmithSelectTimer)window.__ppaSmithSelectTimer=setInterval(ppaRefreshSmithCustomSelects,700);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ppaInstallSmithCustomSelects);
else setTimeout(ppaInstallSmithCustomSelects,0);

function inspectSmithItem(it,context){`)
);

if(!output.includes("id='ppaSmithSelectStyle'") ||
   !output.includes("select.ppaSmithNative") ||
   !output.includes("ppaRefreshSmithCustomSelects")) {
  throw new Error('Blacksmith custom select patch did not apply');
}
/* ======================================================================== */

/* === DIRECT BLACKSMITH RUNE FUSION TAB ================================== */
// The blacksmith runs inside a sandboxed srcdoc iframe on Telegram/Android.
// Parent-side iframe inspection is not reliable there, so install the tab from
// inside the blacksmith document itself.
ppaPatchRegex(
  'blacksmith direct rune fusion tab',
  /function\s+inspectSmithItem\(it,context\)\s*\{/,
  ppaEscapeSrcdocCode(`function ppaInstallRuneFusionTab(){
  if(document.getElementById('ppaRuneFusionTab'))return;
  var buttons=Array.prototype.slice.call(document.querySelectorAll('button'));
  var pets=buttons.find(function(b){return String(b.textContent||'').trim().toUpperCase()==='ПЕТЫ'});
  var sharpen=buttons.find(function(b){return String(b.textContent||'').trim().toUpperCase()==='ЗАТОЧКА'});
  if(!pets||!sharpen){setTimeout(ppaInstallRuneFusionTab,250);return}

  var bar=pets.parentElement||sharpen.parentElement;
  if(!bar){setTimeout(ppaInstallRuneFusionTab,250);return}

  var tab=pets.cloneNode(false);
  tab.id='ppaRuneFusionTab';
  tab.removeAttribute('disabled');
  tab.textContent='СЛИЯНИЕ РУН';
  tab.style.opacity='1';
  tab.onclick=function(){openRuneFusionPanel()};
  bar.appendChild(tab);

  var st=document.createElement('style');
  st.id='ppaRuneFusionDirectStyle';
  st.textContent=
    '#ppaRuneFusionShade{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.80);display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}'+
    '#ppaRuneFusionShade.on{display:flex}'+
    '#ppaRuneFusionPanel{width:min(580px,96vw);max-height:88vh;overflow:auto;border:1px solid #93602c;border-radius:10px;background:#120d09;color:#e6c58b;padding:12px;box-sizing:border-box;box-shadow:0 12px 38px #000}'+
    '.ppaRFrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px 7px;margin:6px 0;border:1px solid #5a4027;border-radius:7px;background:#0c0a08}'+
    '.ppaRFbtn{height:34px;border:1px solid #92612d;border-radius:6px;background:#35200e;color:#f0cb7c;font:bold 10px monospace;padding:0 10px}.ppaRFbtn:disabled{opacity:.4}'+
    '@media(max-width:480px){#ppaRFList>div[style*="grid-template-columns"]{grid-template-columns:repeat(3,minmax(0,1fr))!important}}';
  (document.head||document.documentElement).appendChild(st);

  var shade=document.createElement('div');
  shade.id='ppaRuneFusionShade';
  shade.innerHTML='<div id="ppaRuneFusionPanel">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'+
      '<b style="font:16px Georgia,serif;color:#f4cf80">СЛИЯНИЕ РУН</b>'+
      '<button id="ppaRFClose" class="ppaRFbtn">✕</button>'+
    '</div>'+
    '<div style="font:10px monospace;color:#ad987a;margin:8px 0 10px;line-height:1.55">'+
      '2 одинаковые руны · цена попытки 5000 золота<br>'+
      'Серая → зелёная 37% · зелёная → синяя 30% · синяя → фиолетовая 22%<br>'+
      'При неудаче обе руны сгорают. Легендарные руны остаются только в Чёрном рынке.'+
    '</div>'+
    '<div id="ppaRFList"></div>'+
    '<div id="ppaRFMsg" style="min-height:18px;margin-top:8px;font:10px monospace;color:#d6b77d"></div>'+
  '</div>';
  document.body.appendChild(shade);

  shade.querySelector('#ppaRFClose').onclick=function(){shade.classList.remove('on')};
  shade.addEventListener('click',function(e){if(e.target===shade)shade.classList.remove('on')});
}
function openRuneFusionPanel(){
  var shade=document.getElementById('ppaRuneFusionShade');
  if(!shade){ppaInstallRuneFusionTab();shade=document.getElementById('ppaRuneFusionShade')}
  if(!shade)return;
  var list=shade.querySelector('#ppaRFList'),msg=shade.querySelector('#ppaRFMsg');
  msg.textContent='';
  list.innerHTML='';
  var rows=[];
  try{rows=parent.PPA_RUNE_FUSION_LIST?parent.PPA_RUNE_FUSION_LIST():[]}catch(_){}
  if(!rows.length){
    var dbg={};try{dbg=parent.PPA_RUNE_FUSION_DEBUG?parent.PPA_RUNE_FUSION_DEBUG():{}}catch(_){}
    list.innerHTML='<div style="padding:18px;text-align:center;color:#8f806f;font:10px monospace">Не удалось прочитать «ДОСТУПНЫЕ РУНЫ».<br><span style="font-size:8px">найдено: '+(dbg.owned||0)+' · каталог: '+(dbg.catalog||0)+' · мост: '+(dbg.characterCatalog||0)+' · lexical: '+(dbg.lexical?'да':'нет')+'</span></div>';
  }else{
    var rarity=['Серая','Зелёная','Синяя','Фиолетовая','Легендарная'];
    var title=document.createElement('div');
    title.textContent='ДОСТУПНЫЕ РУНЫ';
    title.style.cssText='margin:8px 0 7px;text-align:center;font:bold 12px Georgia,serif;color:#e8c778;letter-spacing:.08em';
    list.appendChild(title);
    var source=document.createElement('div');
    var sourceText='';try{sourceText=parent.PPA_RUNE_FUSION_SOURCE?parent.PPA_RUNE_FUSION_SOURCE():''}catch(_){}
    source.textContent=sourceText&&sourceText!=='ДОСТУПНЫЕ РУНЫ'?('Источник: '+sourceText):'';
    source.style.cssText='display:none!important';
    source.setAttribute('aria-hidden','true');
    list.appendChild(source);
    var grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px';
    rows.forEach(function(x){
      var pct=Math.round((Number(x.chance)||0)*100);
      var card=document.createElement('button');
      card.type='button';
      card.disabled=!x.eligible;
      card.style.cssText='position:relative;min-height:112px;padding:7px 5px;border:1px solid #76522a;border-radius:7px;background:#0c0b0a;color:#d9bd88;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;overflow:hidden';
      var art=document.createElement('div');
      art.style.cssText='width:54px;height:54px;background-position:center;background-repeat:no-repeat;background-size:contain;pointer-events:none';
      if(x.img)art.style.backgroundImage='url("'+String(x.img).replace(/"/g,'%22')+'")';
      else art.textContent='◈';
      var name=document.createElement('div');
      name.textContent=String(x.name||'Руна');
      name.style.cssText='font:bold 9px Georgia,serif;text-align:center;line-height:1.15;pointer-events:none';
      var info=document.createElement('div');
      info.textContent='×'+x.count+' · '+rarity[x.rarity]+' · '+pct+'%';
      info.style.cssText='font:8px monospace;color:'+(x.eligible?'#d9bd88':'#766b5d')+';text-align:center;pointer-events:none';
      card.appendChild(art);card.appendChild(name);card.appendChild(info);
      card.onclick=function(){
        if(!x.eligible)return;
        card.disabled=true;var r;
        try{r=parent.PPA_RUNE_FUSION_TRY(x.id)}catch(e){r={ok:false,message:'Ошибка слияния'}}
        msg.textContent=(r&&r.message)||'';
        setTimeout(openRuneFusionPanel,0);
      };
      grid.appendChild(card);
    });
    list.appendChild(grid);
  }
  shade.classList.add('on');
}
setTimeout(ppaInstallRuneFusionTab,0);
setTimeout(ppaInstallRuneFusionTab,300);
setTimeout(ppaInstallRuneFusionTab,900);

// Common / uncommon / rare rings have no recipes. Keep the ring selector only
// for epic/legendary accessory tiers so the smith UI does not advertise
// impossible crafts.
var ppaAccessoryRarity='low';
function ppaRingCraftVisibility(){
  try{
    var buttons=Array.prototype.slice.call(document.querySelectorAll('button'));
    buttons.forEach(function(b){
      var t=String(b.textContent||'').trim().toUpperCase();
      if(t==='ОБЫЧНЫЙ'||t==='НЕОБЫЧНЫЙ'||t==='РЕДКИЙ'){
        if(b.getAttribute('aria-pressed')==='true'||/active|selected|current|on/i.test(String(b.className||'')))ppaAccessoryRarity='low';
      }else if(t==='ЭПИЧЕСКИЙ'||t==='ЛЕГЕНДАРНЫЙ'){
        if(b.getAttribute('aria-pressed')==='true'||/active|selected|current|on/i.test(String(b.className||'')))ppaAccessoryRarity='high';
      }
    });
    buttons.forEach(function(b){
      var t=String(b.textContent||'').trim().toUpperCase();
      if(t==='КОЛЬЦО'){
        b.style.display=ppaAccessoryRarity==='low'?'none':'';
        b.setAttribute('data-ppa-ring-craft',ppaAccessoryRarity==='low'?'hidden':'available');
      }
    });
  }catch(_){}
}
document.addEventListener('click',function(e){
  var b=e&&e.target&&e.target.closest?e.target.closest('button'):null;
  if(!b)return;
  var t=String(b.textContent||'').trim().toUpperCase();
  if(t==='ОБЫЧНЫЙ'||t==='НЕОБЫЧНЫЙ'||t==='РЕДКИЙ'){
    ppaAccessoryRarity='low';setTimeout(ppaRingCraftVisibility,0);
  }else if(t==='ЭПИЧЕСКИЙ'||t==='ЛЕГЕНДАРНЫЙ'){
    ppaAccessoryRarity='high';setTimeout(ppaRingCraftVisibility,0);
  }else if(t==='АКСЕССУАРЫ'){
    setTimeout(ppaRingCraftVisibility,0);setTimeout(ppaRingCraftVisibility,120);
  }
},true);
try{
  new MutationObserver(function(){ppaRingCraftVisibility()})
    .observe(document.documentElement,{childList:true,subtree:true});
}catch(_){}
setTimeout(ppaRingCraftVisibility,0);
setTimeout(ppaRingCraftVisibility,350);

function inspectSmithItem(it,context){`)
);

if(output.includes("ppaFusionRuneHoldInfo") || output.includes("ppaFusionRuneBindHold(card,x)")) {
  throw new Error('Risky fusion hold UI still present in blacksmith srcdoc');
}
if(!output.includes("function ppaInstallRuneFusionTab()") ||
   !output.includes("ppaRuneFusionTab") ||
   !output.includes("function openRuneFusionPanel()") ||
   !output.includes("display:none!important") ||
   !output.includes("СЛИЯНИЕ РУН") ||
   !output.includes("ДОСТУПНЫЕ РУНЫ")) {
  throw new Error('Direct blacksmith rune fusion tab did not apply');
}
if(!output.includes("function ppaRingCraftVisibility()") ||
   !output.includes("data-ppa-ring-craft") ||
   !output.includes("КОЛЬЦО")) {
  throw new Error('Blacksmith low-rarity ring cleanup did not apply');
}
/* ======================================================================== */

if(!output.includes("shade.innerHTML=&#x27;&lt;div id=&quot;ppaRuneFusionPanel&quot;")) {
  throw new Error('Rune fusion srcdoc escaping did not apply');
}
/* === CHARACTER AVAILABLE-RUNES BRIDGE =================================== */
ppaPatchRegex(
  'character available runes bridge',
  /function\s+itemVisual\(it,size\)\s*\{/,
  ppaEscapeSrcdocCode(`function ppaCharacterRuneBridge(){
  try{
    var catalog=[],available=[],seen=new Set(),sources=[];
    function txt(v){
      return String(v&&(v.name||v.title||v.label||v.runeName||v.id||v.refId||v.key)||'');
    }
    function looksRune(v){
      if(!v||typeof v!=='object')return false;
      if(v.rune===true||v.isRune===true||v.kind==='rune'||v.type==='rune'||v.category==='rune')return true;
      var z=(txt(v)+' '+String(v.kind||'')+' '+String(v.type||'')+' '+String(v.refId||'')+' '+String(v.id||'')).toLowerCase();
      if(z.indexOf('rune')>=0||z.indexOf('руна')>=0)return true;
      var im=String(v.img||v.image||v.src||'').toLowerCase();
      return !!((v.rarity!=null||v.quality!=null||v.tier!=null)&&(v.effect!=null||v.stat!=null||v.bonus!=null||v.bonusText!=null||v.stats!=null)&&/rune|runa|руна/.test(im));
    }
    function countOf(v){
      var n=Number(v&&(v.count!=null?v.count:(v.qty!=null?v.qty:(v.amount!=null?v.amount:1))));
      return isFinite(n)&&n>0?Math.floor(n):1;
    }
    function walk(v,path,depth){
      if(v==null||depth>6||/equip|equipped|slot|socket|active|installed|selected|preview/i.test(path))return;
      if(typeof v!=='object')return;
      if(seen.has(v))return;seen.add(v);
      if(looksRune(v)){
        catalog.push(v);
        available.push({item:v,path:path,count:countOf(v)});
        sources.push(path);
        return;
      }
      if(v instanceof Map){
        v.forEach(function(x,k){
          if(typeof x==='number'&&x>0&&/rune|руна/i.test(path)){
            available.push({id:String(k),path:path+'.'+String(k),count:Math.floor(x)});
            sources.push(path);
          }else walk(x,path+'.'+String(k),depth+1);
        });
        return;
      }
      if(Array.isArray(v)){
        for(var i=0;i<v.length&&i<500;i++)walk(v[i],path+'['+i+']',depth+1);
        return;
      }
      var ks=[];try{ks=Object.keys(v)}catch(_){ks=[]}
      var rc=/rune|runes|runa|runy|руна|руны/i.test(path);
      for(var j=0;j<ks.length&&j<800;j++){
        var k=ks[j],x;try{x=v[k]}catch(_){continue}
        if(rc&&typeof x==='number'&&isFinite(x)&&x>0){
          available.push({id:String(k),path:path+'.'+k,count:Math.floor(x)});
          sources.push(path);
          continue;
        }
        walk(x,path+'.'+k,depth+1);
      }
    }

    // Discover lexical/global variables declared inside THIS character iframe.
    var names={};
    try{
      document.querySelectorAll('script').forEach(function(sc){
        var t=String(sc.textContent||'');
        var re=/\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)/g,m;
        while((m=re.exec(t))){
          var n=m[1];
          if(/rune|runes|runa|runy|inv|state|save|character|player/i.test(n))names[n]=1;
        }
      });
    }catch(_){}
    Object.keys(names).forEach(function(n){
      try{
        var v=eval(n);
        if(v&&typeof v==='object')walk(v,'character.'+n,0);
      }catch(_){}
    });

    // Also inspect enumerable globals in the same iframe realm.
    try{
      Object.keys(window).forEach(function(k){
        if(!/rune|runes|runa|runy|inv|state|save|character|player/i.test(k))return;
        var v;try{v=window[k]}catch(_){return}
        if(v&&typeof v==='object')walk(v,'character.window.'+k,0);
      });
    }catch(_){}

    // Deduplicate catalogue by id/name/rarity while keeping real menu objects.
    var cm={},clean=[];
    catalog.forEach(function(v){
      var k=String(v.refId||v.id||v.key||v.name||'')+'|'+String(v.rarity||v.quality||v.tier||'');
      if(cm[k])return;cm[k]=1;clean.push(v);
    });
    var src='';
    if(sources.length){
      var sm={};sources.forEach(function(x){sm[String(x).replace(/\\[[0-9]+\\].*$/,'').replace(/\\.[^.]+$/,'')]=1});
      src=Object.keys(sm).slice(0,4).join(' · ');
    }
    // Keep the same real objects used by the character "ДОСТУПНЫЕ РУНЫ" view
    // available locally for the non-invasive hold-info listener below.
    try{
      window.PPA_CHARACTER_AVAILABLE_RUNES=available.map(function(a){
        var item=a&&a.item||null;
        if(!item&&a&&a.id!=null){
          var aid=String(a.id);
          for(var ci=0;ci<clean.length;ci++){
            var c=clean[ci];
            if(String(c&&(c.refId||c.id||c.key||''))===aid){item=c;break}
          }
        }
        return {item:item,id:a&&a.id,path:a&&a.path,count:a&&a.count};
      });
      window.PPA_CHARACTER_RUNE_CATALOG=clean;
    }catch(_){}
    if(parent&&typeof parent.PPA_REGISTER_CHARACTER_RUNES==='function'){
      parent.PPA_REGISTER_CHARACTER_RUNES({catalog:clean,available:available,source:src||'ДОСТУПНЫЕ РУНЫ'});
    }
  }catch(_){}
}
setTimeout(ppaCharacterRuneBridge,0);
setTimeout(ppaCharacterRuneBridge,400);
setTimeout(ppaCharacterRuneBridge,1200);
window.addEventListener('message',function(){setTimeout(ppaCharacterRuneBridge,30)},true);
try{new MutationObserver(function(){setTimeout(ppaCharacterRuneBridge,30)}).observe(document.documentElement,{childList:true,subtree:true})}catch(_){}
function itemVisual(it,size){`)
);

if(!output.includes("function ppaCharacterRuneBridge()") ||
   !output.includes("PPA_REGISTER_CHARACTER_RUNES") ||
   !output.includes("source:src||&#x27;ДОСТУПНЫЕ РУНЫ&#x27;") ||
   !output.includes("setTimeout(ppaCharacterRuneBridge,1200)")) {
  throw new Error('Character available-runes bridge did not apply');
}
/* ======================================================================== */

/* === EXACT CHARACTER RUNE HOLD SOURCE =================================== */
ppaPatchRegex(
  'exact character rune hold source',
  /function\s+renderRunes\(rs\)\s*\{/,
  ppaEscapeSrcdocCode(`function renderRunes(rs){
  try{
    var raw=rs&&rs.inventory;
    var arr=Array.isArray(raw)?raw:(raw&&typeof raw==='object'?Object.keys(raw).map(function(k){
      var v=raw[k];
      if(v&&typeof v==='object')return v;
      return {key:k,id:k,refId:k,count:Number(v)||0};
    }):[]);
    window.PPA_CHARACTER_AVAILABLE_RUNES=arr.map(function(x){
      var item=(x&&(x.item||x.def||x.rune))||x;
      var count=Math.max(0,Math.floor(Number(x&&(x.count!=null?x.count:(x.qty!=null?x.qty:x.amount)))||1));
      var id=String((item&&(item.key||item.id||item.refId))||(x&&(x.key||x.id||x.refId))||'');
      return {item:item,id:id,count:count,path:'runeUiState().inventory'};
    }).filter(function(x){return x&&x.item});
    window.PPA_LAST_RUNE_UI_STATE=rs||null;
  }catch(_){}
`)
);

if(!output.includes("window.PPA_LAST_RUNE_UI_STATE=rs||null") ||
   !output.includes("path:&#x27;runeUiState().inventory&#x27;")) {
  throw new Error('Exact character rune hold source did not apply');
}
/* ======================================================================== */

/* === RUNE HOLD INFO WINDOW ============================================== */
// Non-invasive: does NOT replace renderRunes(). It only listens for a long hold
// on rune cards already rendered by Character -> RUNES -> ДОСТУПНЫЕ РУНЫ.
ppaPatchRegex(
  'character rune hold info window',
  /function\s+itemVisual\(it,size\)\s*\{/,
  ppaEscapeSrcdocCode(`var PPA_RUNE_INFO_HOLD_MS=650;
var PPA_RUNE_INFO_HOLD={timer:0,rune:null,x:0,y:0,shown:false};

function ppaRuneInfoRarity(v){
  var r=String(v==null?'':v).toLowerCase();
  var m={
    common:'Обычная',gray:'Обычная',grey:'Обычная',
    uncommon:'Необычная',green:'Необычная',
    rare:'Редкая',blue:'Редкая',
    epic:'Эпическая',purple:'Эпическая',
    legendary:'Легендарная',orange:'Легендарная'
  };
  return m[r]||String(v||'');
}
function ppaRuneInfoName(r){
  return String(r&&(r.name||r.title||r.label||r.runeName)||'Руна');
}
function ppaRuneInfoText(r,count){
  if(!r)return '';
  var lines=[];
  var rarity=ppaRuneInfoRarity(r.rarity!=null?r.rarity:(r.quality!=null?r.quality:r.tier));
  if(rarity)lines.push(rarity+' руна');

  var text=r.description||r.desc||r.valueText||r.effectText||r.bonusText||
           r.effectDescription||r.tooltip||r.info||'';
  if(!text&&typeof r.effect==='string')text=r.effect;
  if(!text&&typeof r.bonus==='string')text=r.bonus;
  if(!text&&typeof r.stat==='string'){
    var vv=r.value!=null?r.value:(r.amount!=null?r.amount:'');
    text=String(r.stat)+(vv!==''?' '+String(vv):'');
  }
  if(text)lines.push(String(text));

  if(r.stats&&typeof r.stats==='object'){
    var ss=[];
    try{
      Object.keys(r.stats).forEach(function(k){
        var v=r.stats[k];
        if(v==null||v===''||typeof v==='object')return;
        ss.push(String(k)+': '+String(v));
      });
    }catch(_){}
    if(ss.length)lines.push(ss.join(' · '));
  }

  // Last-resort useful primitive effect fields if this rune has no prose description.
  if(lines.length<2){
    var skip=/^(id|uid|key|refId|name|title|label|runeName|rarity|quality|tier|img|image|src|icon|iconImg|count|qty|amount|rune|isRune|kind|type|category)$/i;
    var extra=[];
    try{
      Object.keys(r).forEach(function(k){
        if(skip.test(k))return;
        var v=r[k];
        if(v==null||v===''||typeof v==='object'||typeof v==='function'||typeof v==='boolean')return;
        if(String(v).length>80)return;
        extra.push(String(k)+': '+String(v));
      });
    }catch(_){}
    if(extra.length)lines.push(extra.slice(0,4).join(' · '));
  }

  var n=Math.max(0,Math.floor(Number(count!=null?count:(r.count!=null?r.count:(r.qty!=null?r.qty:r.amount)))||0));
  if(n>1)lines.push('В наличии: '+n);
  return lines.join('\\n');
}
function ppaRuneInfoEnsure(){
  var box=document.getElementById('ppaRuneHoldInfo');
  if(box)return box;
  var st=document.createElement('style');
  st.id='ppaRuneHoldInfoStyle';
  st.textContent=
    '#ppaRuneHoldInfo{position:fixed;z-index:2147483400;left:50%;top:50%;transform:translate(-50%,-50%);width:min(390px,88vw);max-height:70vh;overflow:auto;padding:13px 14px;border:1px solid #95622d;border-radius:10px;background:rgba(16,11,8,.98);box-shadow:0 14px 38px rgba(0,0,0,.82);display:none;box-sizing:border-box;pointer-events:none;color:#d8bd8c}'+
    '#ppaRuneHoldInfo.on{display:block}'+
    '#ppaRuneHoldInfoName{font:bold 15px Georgia,serif;color:#f1ce82;text-align:center;margin-bottom:7px}'+
    '#ppaRuneHoldInfoText{white-space:pre-line;font:10px/1.55 monospace;color:#cdb892;text-align:center}'+
    '#ppaRuneHoldInfoHint{margin-top:8px;font:8px monospace;color:#776a59;text-align:center}';
  (document.head||document.documentElement).appendChild(st);
  box=document.createElement('div');
  box.id='ppaRuneHoldInfo';
  box.innerHTML='<div id="ppaRuneHoldInfoName"></div><div id="ppaRuneHoldInfoText"></div><div id="ppaRuneHoldInfoHint">отпусти · окно закроется</div>';
  document.body.appendChild(box);
  return box;
}
function ppaRuneInfoShow(meta){
  if(!meta||!meta.item)return;
  var box=ppaRuneInfoEnsure();
  box.querySelector('#ppaRuneHoldInfoName').textContent=ppaRuneInfoName(meta.item);
  box.querySelector('#ppaRuneHoldInfoText').textContent=ppaRuneInfoText(meta.item,meta.count)||'Описание для этой руны не задано.';
  box.classList.add('on');
}
function ppaRuneInfoHide(){
  var box=document.getElementById('ppaRuneHoldInfo');
  if(box)box.classList.remove('on');
}
function ppaRuneInfoToken(src){
  src=String(src||'');
  if(!src)return '';
  try{src=decodeURIComponent(src)}catch(_){}
  src=src.split('?')[0].split('#')[0];
  return src.slice(src.lastIndexOf('/')+1).toLowerCase();
}
function ppaRuneInfoPool(){
  var a=[];
  try{
    (window.PPA_CHARACTER_AVAILABLE_RUNES||[]).forEach(function(x){
      if(x&&x.item)a.push(x);
    });
  }catch(_){}
  if(!a.length){
    try{
      var rs=window.PPA_LAST_RUNE_UI_STATE;
      var raw=rs&&rs.inventory;
      var arr=Array.isArray(raw)?raw:[];
      arr.forEach(function(x){
        var item=(x&&(x.item||x.def||x.rune))||x;
        if(item)a.push({item:item,id:String(item.key||item.id||item.refId||''),count:Number(x&&x.count)||1});
      });
    }catch(_){}
  }
  return a;
}
function ppaRuneInfoFromNode(node){
  if(!node)return null;
  var pool=ppaRuneInfoPool();
  if(!pool.length)return null;
  var cur=node.nodeType===1?node:node.parentElement;
  for(var depth=0;cur&&depth<7;depth++,cur=cur.parentElement){
    if(cur.__ppaRuneInfoMeta)return cur.__ppaRuneInfoMeta;

    var imgs=[];
    try{
      if(cur.tagName==='IMG')imgs=[cur];
      else imgs=Array.prototype.slice.call(cur.querySelectorAll('img')).slice(0,5);
    }catch(_){}
    for(var ii=0;ii<imgs.length;ii++){
      var tok=ppaRuneInfoToken(imgs[ii].currentSrc||imgs[ii].src);
      if(!tok)continue;
      for(var pi=0;pi<pool.length;pi++){
        var it=pool[pi].item;
        var rt=ppaRuneInfoToken(it&&(it.img||it.image||it.src||it.iconImg));
        if(rt&&rt===tok){cur.__ppaRuneInfoMeta=pool[pi];return pool[pi]}
      }
    }

    var bg='';
    try{bg=String(getComputedStyle(cur).backgroundImage||'').toLowerCase()}catch(_){}
    if(bg&&bg!=='none'){
      for(var bi=0;bi<pool.length;bi++){
        var bit=pool[bi].item;
        var bt=ppaRuneInfoToken(bit&&(bit.img||bit.image||bit.src||bit.iconImg));
        if(bt&&bg.indexOf(bt)>=0){cur.__ppaRuneInfoMeta=pool[bi];return pool[bi]}
      }
    }

    var key='';
    try{
      key=cur.getAttribute('data-rune-key')||cur.getAttribute('data-key')||
          (cur.dataset&&(cur.dataset.runeKey||cur.dataset.key))||'';
    }catch(_){}
    if(key){
      for(var ki=0;ki<pool.length;ki++){
        var rit=pool[ki].item;
        var rk=String(rit&&(rit.refId||rit.id||rit.key)||pool[ki].id||'');
        if(rk&&rk===String(key)){cur.__ppaRuneInfoMeta=pool[ki];return pool[ki]}
      }
    }

    var tx=String(cur.textContent||'').trim();
    if(tx&&tx.length<120){
      for(var ni=0;ni<pool.length;ni++){
        var nm=ppaRuneInfoName(pool[ni].item);
        if(nm&&nm!=='Руна'&&tx.indexOf(nm)>=0){cur.__ppaRuneInfoMeta=pool[ni];return pool[ni]}
      }
    }
  }
  // Final fallback: the rune cards are rendered in the same order as rs.inventory.
  // Find the nearest repeated card container inside the "ДОСТУПНЫЕ РУНЫ" section
  // and map its visual index to the exact renderRunes inventory snapshot.
  try{
    var el=node.nodeType===1?node:node.parentElement;
    var candidates=[];
    var all=Array.prototype.slice.call(document.querySelectorAll('div,button'));
    var head=all.find(function(x){return String(x.textContent||'').trim()==='ДОСТУПНЫЕ РУНЫ'});
    if(head){
      var section=head.parentElement||head;
      candidates=Array.prototype.slice.call(section.querySelectorAll('button,[data-rune-key],[data-key]'));
      if(!candidates.length){
        candidates=Array.prototype.slice.call(section.querySelectorAll('div')).filter(function(x){
          try{return x.querySelector('img')||String(getComputedStyle(x).backgroundImage||'')!=='none'}catch(_){return false}
        });
      }
      var card=el&&el.closest?el.closest('button,[data-rune-key],[data-key]'):null;
      if(!card){
        var c=el;
        for(var z=0;c&&z<6;z++,c=c.parentElement){
          if(candidates.indexOf(c)>=0){card=c;break}
        }
      }
      var idx=card?candidates.indexOf(card):-1;
      if(idx>=0&&pool[idx]){card.__ppaRuneInfoMeta=pool[idx];return pool[idx]}
    }
  }catch(_){}
  return null;
}
function ppaRuneInfoCancel(hide){
  var st=PPA_RUNE_INFO_HOLD;
  if(st.timer){clearTimeout(st.timer);st.timer=0}
  if(hide&&st.shown){ppaRuneInfoHide();st.shown=false}
}
function ppaInstallRuneInfoHold(){
  if(document.__ppaRuneInfoHoldInstalled)return;
  document.__ppaRuneInfoHoldInstalled=true;

  function start(e){
    var meta=ppaRuneInfoFromNode(e.target);
    if(!meta)return;
    ppaRuneInfoCancel(true);
    var st=PPA_RUNE_INFO_HOLD;
    st.rune=meta;st.x=Number(e.clientX)||0;st.y=Number(e.clientY)||0;st.shown=false;
    st.timer=setTimeout(function(){
      st.timer=0;
      st.shown=true;
      ppaRuneInfoShow(st.rune);
      try{if(navigator.vibrate)navigator.vibrate(18)}catch(_){}
    },PPA_RUNE_INFO_HOLD_MS);
  }
  function move(e){
    var st=PPA_RUNE_INFO_HOLD;
    if(!st.timer)return;
    var dx=(Number(e.clientX)||0)-st.x,dy=(Number(e.clientY)||0)-st.y;
    if(dx*dx+dy*dy>196)ppaRuneInfoCancel(false);
  }
  function end(){
    var was=PPA_RUNE_INFO_HOLD.shown;
    ppaRuneInfoCancel(true);
    if(was)document.__ppaRuneInfoSuppressClickUntil=Date.now()+500;
  }

  document.addEventListener('pointerdown',start,true);
  document.addEventListener('pointermove',move,true);
  document.addEventListener('pointerup',end,true);
  document.addEventListener('pointercancel',end,true);
  document.addEventListener('click',function(e){
    if((document.__ppaRuneInfoSuppressClickUntil||0)>Date.now()&&ppaRuneInfoFromNode(e.target)){
      e.preventDefault();e.stopImmediatePropagation();
      document.__ppaRuneInfoSuppressClickUntil=0;
    }
  },true);
  document.addEventListener('contextmenu',function(e){
    if(ppaRuneInfoFromNode(e.target)){e.preventDefault();e.stopImmediatePropagation()}
  },true);
}
ppaInstallRuneInfoHold();
function itemVisual(it,size){`)
);

if(!output.includes("PPA_LAST_RUNE_UI_STATE") ||
   !output.includes("runeUiState().inventory") ||
   !output.includes("Final fallback: the rune cards are rendered in the same order")) {
  throw new Error('Rune hold exact-source fix did not apply');
}
if(!output.includes("var PPA_RUNE_INFO_HOLD_MS=650") ||
   !output.includes("function ppaRuneInfoShow(meta)") ||
   !output.includes("function ppaRuneInfoFromNode(node)") ||
   !output.includes("document.__ppaRuneInfoHoldInstalled") ||
   !output.includes("PPA_CHARACTER_AVAILABLE_RUNES")) {
  throw new Error('Rune hold info window patch did not apply');
}
/* ======================================================================== */

/* === CHARACTER INVENTORY NATIVE-MENU REMOVAL + HOLD PREVIEW ============= */
// The character iframe used real <img> elements for every item. Telegram WebView
// can invoke a native image/link menu before JS cancellation. Render item art
// into canvas pixels so neither <img> nor CSS background URLs exist on the held
// card. Bind the desired tap/hold behavior to the card itself.

ppaPatchRegex(
  'character inventory item art uses canvas',
  /function itemVisual\(it,size\)\{[\s\S]*?\n\}\nfunction enhBadge/,
  ppaEscapeSrcdocCode(`var CHAR_ITEM_ART_SEQ=0,CHAR_ITEM_ARTS={},CHAR_ITEM_IMAGE_CACHE={};

function ppaRegisterItemArt(src,scale,filter){
  var key='a'+(++CHAR_ITEM_ART_SEQ);
  CHAR_ITEM_ARTS[key]={src:String(src||''),scale:Number(scale)||1,filter:String(filter||'none')};
  return key;
}

function ppaDrawItemCanvas(c,art,im,key){
  try{
    var rect=c.getBoundingClientRect();
    var dpr=Math.min(2,window.devicePixelRatio||1);
    var w=Math.max(32,Math.round((rect.width||96)*dpr));
    var h=Math.max(32,Math.round((rect.height||96)*dpr));
    c.width=w;c.height=h;
    var ctx=c.getContext('2d');
    ctx.clearRect(0,0,w,h);
    ctx.imageSmoothingEnabled=true;
    try{ctx.imageSmoothingQuality='high'}catch(_){}
    try{ctx.filter=art.filter||'none'}catch(_){}
    var iw=Math.max(1,im.naturalWidth||im.width||1);
    var ih=Math.max(1,im.naturalHeight||im.height||1);
    var fit=Math.min(w/iw,h/ih)*(art.scale||1);
    var dw=iw*fit,dh=ih*fit;
    ctx.drawImage(im,(w-dw)/2,(h-dh)/2,dw,dh);
    try{ctx.filter='none'}catch(_){}
    delete CHAR_ITEM_ARTS[key];
  }catch(_){c.__ppaPainted=false}
}

function ppaPaintItemCanvas(c){
  if(!c||c.__ppaPainted)return;
  var key=c.getAttribute('data-art-key');
  var art=CHAR_ITEM_ARTS[key];
  if(!art||!art.src)return;
  c.__ppaPainted=true;
  var rec=CHAR_ITEM_IMAGE_CACHE[art.src];
  if(rec&&rec.ready&&rec.im){
    ppaDrawItemCanvas(c,art,rec.im,key);
    return;
  }
  if(!rec){
    var im=new Image();
    rec=CHAR_ITEM_IMAGE_CACHE[art.src]={im:im,ready:false,wait:[]};
    im.onload=function(){
      rec.ready=true;
      var q=rec.wait.splice(0);
      for(var i=0;i<q.length;i++){
        var v=q[i];
        if(v&&v.c&&v.c.isConnected)ppaDrawItemCanvas(v.c,v.art,im,v.key);
      }
    };
    im.onerror=function(){
      var q=rec.wait.splice(0);
      for(var i=0;i<q.length;i++)if(q[i]&&q[i].c)q[i].c.__ppaPainted=false;
      delete CHAR_ITEM_IMAGE_CACHE[art.src];
    };
    im.src=art.src;
  }
  rec.wait.push({c:c,art:art,key:key});
}

function ppaPaintItemCanvases(root){
  try{
    var host=root&&root.querySelectorAll?root:document;
    var list=host.querySelectorAll('canvas.ppaItemCanvas[data-art-key]');
    for(var i=0;i<list.length;i++)ppaPaintItemCanvas(list[i]);
    if(root&&root.matches&&root.matches('canvas.ppaItemCanvas[data-art-key]'))ppaPaintItemCanvas(root);
  }catch(_){}
}

try{
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      (m.addedNodes||[]).forEach(function(n){
        if(!n||n.nodeType!==1)return;
        ppaPaintItemCanvases(n);
      });
    });
  }).observe(document.documentElement,{childList:true,subtree:true});
}catch(_){}

function itemVisual(it,size){
  size=size||34;
  if(it&&(it.fartSlag===true||it.uid==='fart_slag'||it.refId==='fart_slag'||String(it.name||'')==='Шлак')){
    it.img='/assets/fart-slag.webp';
  }
  if(it&&it.img){
    var sc=1,flt='none';
    if(it.rarity==='epic'&&it.slot==='weapon'){
      sc=1.20;
      flt='sepia(.30) saturate(2.9) hue-rotate(232deg) brightness(1.16) contrast(1.08) drop-shadow(0 0 3px rgba(208,108,255,.72))';
    }else if(it.rarity==='epic'&&it.slot==='boots'){
      sc=1.16;
      flt='sepia(.28) saturate(2.7) hue-rotate(232deg) brightness(1.13) contrast(1.07) drop-shadow(0 0 3px rgba(208,108,255,.68))';
    }
    var wh=size==='fill'?(it.slot?'94%':'100%'):(size+'px');
    var key=ppaRegisterItemArt(it.img,sc,flt);
    return '<canvas class="ppaItemCanvas" data-art-key="'+key+'" aria-hidden="true" style="width:'+wh+';height:'+wh+';display:block;margin:auto;pointer-events:none;touch-action:none"></canvas>';
  }
  var fs=(size==='fill'?24:Math.max(14,size-10));
  return '<span style="font-size:'+fs+'px">'+((it&&it.icon)||'◆')+'</span>';
}
function enhBadge`)
);

ppaPatchRegex(
  'character inventory hold helper and bag binding',
  /var bagGrid=document\.getElementById\(&#x27;bagGrid&#x27;\),bagSlots=\[\];\s*for\(var i=0;i&lt;100;i\+\+\)\{\s*var d=document\.createElement\(&#x27;div&#x27;\);\s*d\.className=i&lt;50\?&#x27;bagSlot&#x27;:&#x27;bagSlot paid locked&#x27;;\s*\(function\(idx\)\{d\.onclick=function\(\)\{bagClick\(idx\)\}\}\)\(i\);\s*bagSlots\.push\(d\);bagGrid\.appendChild\(d\);\s*\}/,
  ppaEscapeSrcdocCode(`function bindCharItemHold(el,getItem,context){
  if(!el||typeof getItem!=='function')return;
  var timer=0,sx=0,sy=0;
  function cancelTimer(){if(timer){clearTimeout(timer);timer=0}}
  function releasePreview(){
    if(el.__ppaHeld){
      try{parent.postMessage({type:'itemInspectHoldEnd'},'*')}catch(_){}
    }
  }
  el.addEventListener('pointerdown',function(e){
    cancelTimer();el.__ppaHeld=false;
    sx=Number(e.clientX)||0;sy=Number(e.clientY)||0;
    timer=setTimeout(function(){
      timer=0;
      var it=null;try{it=getItem()}catch(_){}
      if(!it)return;
      el.__ppaHeld=true;
      try{parent.postMessage({type:'itemInspectHoldStart'},'*')}catch(_){}
      try{parent.postMessage({type:'itemInspect',item:it,context:context||'Персонаж · инвентарь'},'*')}catch(_){}
    },900);
  },{passive:true});
  el.addEventListener('pointermove',function(e){
    var dx=(Number(e.clientX)||0)-sx,dy=(Number(e.clientY)||0)-sy;
    if(dx*dx+dy*dy>144)cancelTimer();
  },{passive:true});
  el.addEventListener('pointerup',function(){cancelTimer();releasePreview()},{passive:true});
  el.addEventListener('pointercancel',function(){cancelTimer();releasePreview()},{passive:true});
  el.addEventListener('pointerleave',function(){cancelTimer();releasePreview()},{passive:true});
  el.addEventListener('contextmenu',function(e){e.preventDefault();e.stopPropagation()},true);
  el.addEventListener('click',function(e){
    if(el.__ppaHeld){
      e.preventDefault();e.stopImmediatePropagation();el.__ppaHeld=false;
    }
  },true);
}

var bagGrid=document.getElementById('bagGrid'),bagSlots=[];
for(var i=0;i<100;i++){
  var d=document.createElement('div');
  d.className=i<50?'bagSlot':'bagSlot paid locked';
  (function(idx,slot){
    bindCharItemHold(slot,function(){
      var v=_bagView[idx];
      return v&&v.it?v.it:null;
    },'Персонаж · сумка');
    slot.onclick=function(){bagClick(idx)};
  })(i,d);
  bagSlots.push(d);bagGrid.appendChild(d);
}
['weapon','helmet','armor','gloves','ring','legs','boots','necklace','artifact','cloak','wings','pet'].forEach(function(slotName){
  var slotEl=document.getElementById('eq_'+slotName);
  if(slotEl)bindCharItemHold(slotEl,function(){return _inv.equipped[slotName]||null},'Персонаж · экипировка');
});`)
);

if(!output.includes("ppaItemCanvas") ||
   !output.includes("var key=ppaRegisterItemArt(it.img,sc,flt)") ||
   !output.includes("CHAR_ITEM_IMAGE_CACHE") ||
   !output.includes("function ppaDrawItemCanvas(c,art,im,key)") ||
   !output.includes("delete CHAR_ITEM_ARTS[key]") ||
   !output.includes("function bindCharItemHold(el,getItem,context)") ||
   !output.includes("itemInspectHoldStart") ||
   !output.includes("itemInspectHoldEnd")) {
  throw new Error('Character inventory canvas/hold preview patch did not apply');
}
/* ======================================================================== */

/* === PICKAXE REAL INVENTORY ICONS ======================================= */
ppaPatchRegex(
  'pickaxe image constants',
  /const FART_PICKAXE_LEGENDARY_DURATION_MS=14\*60\*60\*1000;/,
  `const FART_PICKAXE_LEGENDARY_DURATION_MS=14*60*60*1000;
const FART_PICKAXE_COMMON_IMG='data:image/webp;base64,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';
const FART_PICKAXE_LEGENDARY_IMG='data:image/webp;base64,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';
const FART_SLAG_IMG='data:image/webp;base64,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';
const FART_SLAG_INTERVAL_MS=40000;
const FART_SLAG_SELL_PRICE=2;`
);

// Replace the legacy/broken slag visual with the approved uploaded artwork.
output=output.replace(
  /const FART_SLAG_IMG='data:image\/webp;base64,[A-Za-z0-9+/=]+';/,
  "const FART_SLAG_IMG='data:image/webp;base64,"+PPA_APPROVED_SLAG_ART.b64+"';"
);
if(!output.includes("const FART_SLAG_IMG='data:image/webp;base64,"+PPA_APPROVED_SLAG_ART.b64.slice(0,24))){
  throw new Error('Approved Fart slag artwork did not apply');
}

// Export slag art as a real public file. The constants patch above has already
// inserted FART_SLAG_IMG into output, so extract and validate it here.
{
  const _slagPrefix="const FART_SLAG_IMG='data:image/webp;base64,";
  const _slagStart=output.indexOf(_slagPrefix);
  const _slagEnd=_slagStart>=0?output.indexOf("';",_slagStart+_slagPrefix.length):-1;
  if(_slagStart<0||_slagEnd<=_slagStart)throw new Error('Fart slag source image missing after constants patch');
  const _slagB64=output.slice(_slagStart+_slagPrefix.length,_slagEnd);
  const _slagBuf=Buffer.from(_slagB64,'base64');
  if(_slagBuf.length<1000||
     _slagBuf.subarray(0,4).toString('ascii')!=='RIFF'||
     _slagBuf.subarray(8,12).toString('ascii')!=='WEBP') {
    throw new Error('Fart slag source image is not a valid WebP');
  }
  fs.writeFileSync(path.join(assetsDir,'fart-slag.webp'),_slagBuf);
}

ppaPatchRegex(
  'pickaxe factory uses real tier image',
  /icon:'⛏',\s*ic:'⛏',\s*img:'',\s*classKey:'all'/,
  `icon:'⛏',
    ic:'⛏',
    img:legendary?FART_PICKAXE_LEGENDARY_IMG:FART_PICKAXE_COMMON_IMG,
    classKey:'all'`
);

ppaPatchRegex(
  'existing pickaxe refreshes tier visual',
  /item\.expiresAt=until;\s*if\(!item\.fartPickaxeTier\)item\.fartPickaxeTier='common';\s*return true;/,
  `item.expiresAt=until;
    if(!item.fartPickaxeTier)item.fartPickaxeTier='common';
    const _ppaLegendVisual=item.fartPickaxeTier==='legendary';
    item.name=_ppaLegendVisual?'Легендарная шахтёрская кирка':'Обычная шахтёрская кирка';
    item.rarity=_ppaLegendVisual?'legendary':'common';
    item.icon='⛏';item.ic='⛏';
    item.img=_ppaLegendVisual?FART_PICKAXE_LEGENDARY_IMG:FART_PICKAXE_COMMON_IMG;
    item.slot='tool';item.bound=true;item.tradeLocked=true;
    return true;`
);

if(!output.includes("FART_PICKAXE_COMMON_IMG='data:image/webp;base64,") ||
   !output.includes("FART_PICKAXE_LEGENDARY_IMG='data:image/webp;base64,") ||
   !output.includes("img:legendary?FART_PICKAXE_LEGENDARY_IMG:FART_PICKAXE_COMMON_IMG") ||
   !output.includes("item.img=_ppaLegendVisual?FART_PICKAXE_LEGENDARY_IMG:FART_PICKAXE_COMMON_IMG")) {
  throw new Error('Pickaxe real inventory icons did not apply');
}
ppaPatchRegex(
  'pickaxe image globals',
  /(const FART_PICKAXE_LEGENDARY_IMG='data:image\/webp;base64,[A-Za-z0-9+/=]+';)/,
  "$1\nwindow.PPA_FART_PICKAXE_COMMON_IMG=FART_PICKAXE_COMMON_IMG;\nwindow.PPA_FART_PICKAXE_LEGENDARY_IMG=FART_PICKAXE_LEGENDARY_IMG;"
);

ppaPatchRegex(
  'slag image global after declaration',
  /(const FART_SLAG_IMG='data:image\/webp;base64,[A-Za-z0-9+/=]+';)/,
  "$1\nwindow.PPA_FART_SLAG_IMG=FART_SLAG_IMG;"
);

ppaPatchRegex(
  'fart inventory iframe fallback images',
  /function itemVisual\(it,size\)\{\s*size=size\|\|34;/,
  `function itemVisual(it,size){
  size=size||34;
  if(it&&(it.fartSlag===true||it.uid==='fart_slag'||it.refId==='fart_slag'||String(it.name||'')==='Шлак')){
    it.fartSlag=true;
    try{
      var _ppaSlagArt=parent.PPA_FART_SLAG_IMG||'data:image/webp;base64,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';
      it.img=_ppaSlagArt;
    }catch(_){
      it.img='data:image/webp;base64,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';
    }
  }
  if(it&&it.monsterCore===true){
    try{
      var _ppaCoreArt=parent.PPA_MONSTER_CORE_IMG;
      if(_ppaCoreArt)it.img=_ppaCoreArt;
    }catch(_){}
  }
  if(it&&it.fartPickaxe===true&&!it.img){
    try{
      it.img=it.fartPickaxeTier==='legendary'
        ?parent.PPA_FART_PICKAXE_LEGENDARY_IMG
        :parent.PPA_FART_PICKAXE_COMMON_IMG;
    }catch(_){}
  }`
);

ppaPatchRegex(
  'character invstate hydrates slag image',
  /(type:'invState',\s*inv:\{\s*equipped:INV\.equipped,\s*bag:)INV\.bag,/,
  "$1(INV.bag||[]).map(function(it){var o=(it&&typeof it==='object')?Object.assign({},it):it;try{if(window.PPA_LEGENDARY_GEAR_ITEM_ART&&o){var a=window.PPA_LEGENDARY_GEAR_ITEM_ART(o);if(a){o.img=a;o.image=a;o.art=a;}}}catch(_){}if(o&&(o.fartSlag===true||o.uid==='fart_slag'||o.refId==='fart_slag'||String(o.name||'')==='Шлак')){o.fartSlag=true;o.kind='resource';o.img='/assets/fart-slag.webp';}return o}),"
);

ppaPatchRegex(
  'pickaxe npc button images',
  /const lb=shade\.querySelector\('#fartGuideLegendPickaxe'\);\s*const _hasPickaxe=fartHasPickaxe\(\);/,
  `const lb=shade.querySelector('#fartGuideLegendPickaxe');
  if(pb){
    pb.style.backgroundImage='url("'+FART_PICKAXE_COMMON_IMG+'")';
    pb.style.backgroundRepeat='no-repeat';
    pb.style.backgroundPosition='10px center';
    pb.style.backgroundSize='34px 34px';
    pb.style.paddingLeft='52px';
    pb.style.textAlign='left';
  }
  if(lb){
    lb.style.backgroundImage='url("'+FART_PICKAXE_LEGENDARY_IMG+'")';
    lb.style.backgroundRepeat='no-repeat';
    lb.style.backgroundPosition='10px center';
    lb.style.backgroundSize='34px 34px';
    lb.style.paddingLeft='52px';
    lb.style.textAlign='left';
  }
  const _hasPickaxe=fartHasPickaxe();`
);

if(!output.includes("var o=(it&&typeof it==='object')?Object.assign({},it):it") ||
   !output.includes("window.PPA_LEGENDARY_GEAR_ITEM_ART&&o") ||
   !output.includes("o.img=a;o.image=a;o.art=a") ||
   !output.includes("o.kind='resource';o.img='/assets/fart-slag.webp'")) {
  throw new Error('Character cloned invState slag / legendary image hydration did not apply');
}

if(!output.includes("window.PPA_FART_PICKAXE_COMMON_IMG=FART_PICKAXE_COMMON_IMG") ||
   !output.includes("it&&it.fartSlag===true") ||
   !output.includes("parent.PPA_FART_SLAG_IMG") ||
   !output.includes("it&&it.fartPickaxe===true&&!it.img") ||
   !output.includes("pb.style.backgroundImage='url(\"'+FART_PICKAXE_COMMON_IMG+'\")'") ||
   !output.includes("lb.style.backgroundImage='url(\"'+FART_PICKAXE_LEGENDARY_IMG+'\")'")) {
  throw new Error('Fart inventory icon visibility patch did not apply');
}

/* ======================================================================== */



if(!output.includes("if(attacking&&dir===3){row=2;mirror=true;}") ||
   !output.includes("this.translate(dx+dw,dy);this.scale(-1,1);") ||
   !output.includes("it.uid==='fart_slag'") ||
   !output.includes("String(it.name||'')==='Шлак'")) {
  throw new Error('Fart left-attack/slag-icon patch did not apply');
}

if(!output.includes("function fartResolveGuardCollision()") ||
   !output.includes("fartResolveGuardCollision();") ||
   !output.includes("__ppaFartCollisionRadius=([22,18,23,27,23][skin]||22)") ||
   !output.includes("parent.PPA_FART_SLAG_IMG")) {
  throw new Error('Fart slag icon/collision patch did not apply');
}

if(!output.includes('id="fartGuideSell" style="display:none;') ||
   !output.includes("цена продажи: 2 PPA/шт.")) {
  throw new Error('Fart NPC legacy slag sale cleanup did not apply');
}

if(!output.includes("const FART_SLAG_INTERVAL_MS=40000") ||
   !output.includes("const FART_SLAG_SELL_PRICE=2") ||
   !output.includes("function fartMakeSlagItem(count)") ||
   !output.includes("FART_ZONE_STATE.slagSince") ||
   !output.includes('id="fartGuideSlagSell"') ||
   !output.includes("Шлак ×'+n+' продан") ||
   !output.includes("window.PPA_FART_SLAG_IMG=FART_SLAG_IMG") ||
   output.indexOf("window.PPA_FART_SLAG_IMG=FART_SLAG_IMG")<output.indexOf("const FART_SLAG_IMG='data:image/webp;base64,")) {
  throw new Error('Fart slag/icon patch did not apply');
}
/* ======================================================================== */

/* === CLEAN RELEASE ITEM DESCRIPTIONS ==================================== */
// Remove old developer/placeholder text from item inspection cards.
// Functional item descriptions above it remain unchanged.
ppaPatchRegex(
  'remove smith placeholder description',
  /Этот тип предмета сейчас не затачивается\s*[—–-]\s*карточка открыта только для просмотра\.?/g,
  '',
  true
);
ppaPatchRegex(
  'remove residual inspect-only placeholder',
  /Карточка открыта только для просмотра\.?/g,
  '',
  true
);

if(output.includes('Этот тип предмета сейчас не затачивается') ||
   output.includes('карточка открыта только для просмотра') ||
   output.includes('Карточка открыта только для просмотра')) {
  throw new Error('Release item-description cleanup did not apply');
}
/* ======================================================================== */

/* === CHARACTER INVENTORY RESOURCE KIND FIX ============================== */
// Items physically stored in INV.bag are not always equipment. Preserve their
// declared kind so bag resources (notably Fart slag / monster cores) open the
// resource popup instead of the gear popup.
ppaPatchRegex(
  'character inventory preserves bag resource kind',
  /_bagView\.push\(\{kind:&#x27;gear&#x27;,it:it,bagIndex:idx\}\);/,
  ppaEscapeSrcdocCode("_bagView.push({kind:(it&&(it.kind==='resource'||it.fartSlag===true||it.monsterCore===true)?'resource':'gear'),it:it,bagIndex:idx});")
);

// Slag must always use the dedicated resource art in the resource card. The
// parent window owns the canonical art constant; old saves may have empty img.
// Match only the function header because an earlier Monster Core patch already
// injects code immediately after it.
ppaPatchRegex(
  'slag resource popup art and metadata',
  /function\s+openResourcePopup\(it\)\s*\{/,
  ppaEscapeSrcdocCode(`function openResourcePopup(it){
  if(it&&(it.fartSlag===true||it.uid==='fart_slag'||it.refId==='fart_slag'||String(it.name||'')==='Шлак')){
    it.fartSlag=true;
    it.kind='resource';
    it.typeName='Ресурс Фарт-зоны';
    it.useText='Можно продать только местному NPC в Фарт-зоне.';
    it.img='/assets/fart-slag.webp';
  }`)
);

if(!output.includes(ppaEscapeSrcdocCode("kind:(it&&(it.kind==='resource'||it.fartSlag===true||it.monsterCore===true)?'resource':'gear')")) ||
   !output.includes(ppaEscapeSrcdocCode("it.typeName='Ресурс Фарт-зоны'")) ||
   !output.includes(ppaEscapeSrcdocCode("it.useText='Можно продать только местному NPC в Фарт-зоне.'"))) {
  throw new Error('Character bag resource-kind / slag popup patch did not apply');
}
/* ======================================================================== */

/* === CHARACTER INVENTORY FAST SELECTION ================================= */
// Selecting an item must not rebuild the whole 100-slot bag. Full renderBag()
// recreates every image/canvas and caused visible blanking/jank on mobile.
// Keep the action index in _sel, but update only the selection border on tap.
ppaPatchRegex(
  'character inventory tap avoids full bag redraw',
  /function bagClick\(i\)\{[\s\S]*?\n\}\nfunction slotClick\(s\)\{/,
  ppaEscapeSrcdocCode(`function ppaSetBagVisualSelection(i){
  var prev=Number(bagGrid&&bagGrid.__ppaSelectedIndex);
  if(Number.isFinite(prev)&&prev>=0&&bagSlots[prev])bagSlots[prev].classList.remove('sel');
  if(Number.isFinite(i)&&i>=0&&bagSlots[i])bagSlots[i].classList.add('sel');
  if(bagGrid)bagGrid.__ppaSelectedIndex=i;
}

function bagClick(i){
  buildBagView();
  var v=_bagView[i];if(!v||!v.it)return;
  ppaSetBagVisualSelection(i);
  if(v.kind==='gear'){
    _sel=v.bagIndex;
    openItemPopup(v.it,'bag',null);
  }else if(v.kind==='grimoire'){
    _sel=-1;
    openGrimoirePopup(v.it);
  }else{
    _sel=-1;
    openResourcePopup(v.it);
  }
}
function slotClick(s){`)
);

ppaPatchRegex(
  'character inventory full render syncs selected index',
  /var bc=document\.querySelector\(&#x27;\.bagCount&#x27;\);/,
  "if(bagGrid)bagGrid.__ppaSelectedIndex=(_sel>=0?_sel:-1);\n  var bc=document.querySelector(&#x27;.bagCount&#x27;);"
);

if(!output.includes(ppaEscapeSrcdocCode("it.img='/assets/fart-slag.webp'"))) {
  throw new Error('Character slag public asset bridge did not apply');
}

if(!output.includes("function ppaSetBagVisualSelection(i)") ||
   !output.includes("ppaSetBagVisualSelection(i);") ||
   output.includes("_sel=i;renderBag();")) {
  throw new Error('Character inventory fast selection patch did not apply');
}
/* ======================================================================== */


/* === RANKED GRIMOIRES + SKILL RANK V ==================================== */
// Progression can reach V, while the existing combat-facing skillRank()
// stays capped at III so old rank-indexed combat formulas cannot break.
ppaPatchRegex(
  'ranked grimoire progression helpers',
  /function\s+skillRank\(id\)\{return Math\.max\(0,Math\.min\(3,\(INV\.skillRanks&&INV\.skillRanks\[id\]\)\|\|0\)\);\}\s*function\s+skillRule\(rank\)\{[\s\S]*?return null;\s*\}/,
  `function skillRank(id){return Math.max(0,Math.min(3,(INV.skillRanks&&INV.skillRanks[id])||0));}
function skillProgressRank(id){return Math.max(0,Math.min(5,(INV.skillRanks&&INV.skillRanks[id])||0));}
const PPA_GRIMOIRE_COUNT_CACHE=Object.create(null);
function grimoireBookCounts(skillId){
  const total=Math.max(0,Math.floor(Number(INV.grimoires&&INV.grimoires[skillId])||0));
  const raw=(INV.grimoireRankDrops&&INV.grimoireRankDrops[skillId])||{};
  const raw3=Math.max(0,Math.floor(Number(raw[3])||0));
  const raw2=Math.max(0,Math.floor(Number(raw[2])||0));
  const sig=total+'|'+raw2+'|'+raw3;
  const hit=PPA_GRIMOIRE_COUNT_CACHE[skillId];
  if(hit&&hit.sig===sig)return hit.value;
  const r3=Math.max(0,Math.min(total,raw3));
  const r2=Math.max(0,Math.min(total-r3,raw2));
  const value={1:Math.max(0,total-r2-r3),2:r2,3:r3,total:total};
  PPA_GRIMOIRE_COUNT_CACHE[skillId]={sig:sig,value:value};
  return value;
}
const PPA_SKILL_RULE_CACHE=(function(){
  const out=[];
  for(let rank=0;rank<5;rank++){
    out[rank]=[];
    const cost=rank<=0?1:(rank===1?2:4);
    const base=rank<=0?1:(rank===1?.45:.40);
    for(let br=1;br<=3;br++){
      const chance=br>=3?1:(br===2?Math.min(1,base+.06):base);
      out[rank][br]={cost:cost,chance:chance,next:rank+1,bookRank:br};
    }
  }
  return out;
})();
function skillRule(rank,bookRank){
  rank=Math.max(0,Math.min(5,Math.floor(Number(rank)||0)));
  bookRank=Math.max(1,Math.min(3,Math.floor(Number(bookRank)||1)));
  if(rank>=5)return null;
  return PPA_SKILL_RULE_CACHE[rank][bookRank];
}
function consumeRankedGrimoires(skillId,bookRank,cost){
  cost=Math.max(1,Math.floor(Number(cost)||1));
  const have=grimoireBookCounts(skillId)[bookRank]||0;
  if(have<cost)return false;
  INV.grimoires[skillId]=Math.max(0,(Number(INV.grimoires[skillId])||0)-cost);
  INV.grimoireRankDrops=INV.grimoireRankDrops||{};
  const raw=INV.grimoireRankDrops[skillId]||(INV.grimoireRankDrops[skillId]={1:0,2:0,3:0});
  if(bookRank===2||bookRank===3)raw[bookRank]=Math.max(0,(Number(raw[bookRank])||0)-cost);
  else if((Number(raw[1])||0)>0)raw[1]=Math.max(0,(Number(raw[1])||0)-Math.min(cost,Number(raw[1])||0));
  return true;
}`
);

ppaPatchRegex(
  'ranked grimoire upgrade action',
  /function\s+tryGrimoireUpgrade\(skillId\)\{[\s\S]*?\n\}/,
  `function tryGrimoireUpgrade(skillId,bookRank){
  var sk=findGrimoireSkill(skillId);if(!sk)return;
  var ck=classKeyFromName(P.cls);
  if(sk.classKey!==ck){showPickup('Гримуар другого класса: '+sk.className,'#ff8888');return;}
  bookRank=Math.max(1,Math.min(3,Math.floor(Number(bookRank)||1)));
  var rank=skillProgressRank(skillId),rule=skillRule(rank,bookRank);
  if(!rule){showPickup(sk.n+' уже V ранга','#ffd168');return;}
  var counts=grimoireBookCounts(skillId),have=counts[bookRank]||0;
  if(have<rule.cost){showPickup('Нужно '+rule.cost+' книг '+['','I','II','III'][bookRank]+' ранга · есть '+have,'#ffb36a');return;}
  if(!consumeRankedGrimoires(skillId,bookRank,rule.cost))return;
  var ok=Math.random()<rule.chance;
  if(ok){
    INV.skillRanks[skillId]=rule.next;
    var roman=['','I','II','III','IV','V'][rule.next];
    showPickup(sk.n+' · ранг '+roman+' открыт!','#8dff9a');
  }else{
    showPickup('Неудача · '+rule.cost+' книг '+['','I','II','III'][bookRank]+' ранга сгорели','#ff6868');
  }
  recomputeStats();
  try{saveGame()}catch(_){}
  try{sendInvState()}catch(_){}
  try{updateSkillButtons()}catch(_){}
}`
);

ppaPatchRegex(
  'grimoire action carries selected book rank',
  /else if\(d\.type===['"]grimoireAction['"]\)\{tryGrimoireUpgrade\(d\.skillId\);\}/,
  "else if(d.type==='grimoireAction'){tryGrimoireUpgrade(d.skillId,d.bookRank);}"
);

ppaPatchRegex(
  'skill UI ranked book counts',
  /var rank=skillRank\(x\.id\),rule=skillRule\(rank\),count=INV\.grimoires\[x\.id\]\|\|0;\s*var va=GRIMOIRE_ART\[x\.id\]\|\|\{\};\s*return \{id:x\.id,n:x\.n,ic:x\.ic,d:x\.d,type:x\.type,rank:rank,count:count,\s*need:rule\?rule\.cost:0,chance:rule\?Math\.round\(rule\.chance\*100\):0,\s*max:!rule,classKey:ck,className:sk\?sk\.name:'',/,
  `var rank=skillProgressRank(x.id),counts=grimoireBookCounts(x.id),count=counts.total||0;
      var rule=skillRule(rank,1),va=GRIMOIRE_ART[x.id]||{};
      return {id:x.id,n:x.n,ic:x.ic,d:x.d,type:x.type,rank:rank,count:count,
        book1:counts[1]||0,book2:counts[2]||0,book3:counts[3]||0,
        need:rule?rule.cost:0,chance:rule?Math.round(rule.chance*100):0,
        max:rank>=5,classKey:ck,className:sk?sk.name:'',`
);

ppaPatchRegex(
  'skill hud roman V',
  /function\s+romanRank\(n\)\{return \['','I','II','III'\]\[n\]\|\|''\}/,
  "function romanRank(n){return ['','I','II','III','IV','V'][n]||''}"
);
ppaPatchRegex(
  'skill hud progression rank V',
  /let sk=c&&c\.active\?c\.active\[i\]:null,rank=sk\?skillRank\(sk\.id\):0;/,
  "let sk=c&&c.active?c.active[i]:null,rank=sk?skillProgressRank(sk.id):0;"
);

{
  const oldHead=`function pips(n){
  var s='<div class="rankPips">';for(var i=0;i<3;i++)s+='<span class="'+(i<n?'on':'')+'"></span>';return s+'</div>';
}
function skillBtnText(x){
  if((x.rank||0)>=3)return 'МАКС. РАНГ III';
  if((x.rank||0)===0)return 'ИЗУЧИТЬ · 1 ГРИМУАР · 100%';
  if((x.rank||0)===1)return 'УЛУЧШИТЬ ДО II · 2 ГРИМУАРА · 45%';
  return 'УЛУЧШИТЬ ДО III · 4 ГРИМУАРА · 40%';
}
function skillUpgrade(id){parent.postMessage({type:'grimoireAction',skillId:id},'*')}`;
  const newHead=`function pips(n){
  var s='<div class="rankPips">';for(var i=0;i<5;i++)s+='<span class="'+(i<n?'on':'')+'"></span>';return s+'</div>';
}
function skillBookOption(x,bookRank){
  var rank=Math.max(0,Math.min(5,Number(x&&x.rank)||0));
  var count=bookRank===1?(Number(x&&x.book1)||0):(bookRank===2?(Number(x&&x.book2)||0):(Number(x&&x.book3)||0));
  if(rank>=5)return {bookRank:bookRank,count:count,need:0,chance:0,max:true};
  var need=rank<=0?1:(rank===1?2:4);
  var base=rank<=0?100:(rank===1?45:40);
  var chance=bookRank>=3?100:(bookRank===2?Math.min(100,base+6):base);
  return {bookRank:bookRank,count:count,need:need,chance:chance,max:false};
}
function skillUpgradeButtons(x){
  if((x.rank||0)>=5)return '<div class="upgradeBtn">МАКС. РАНГ V</div>';
  var romans=['','I','II','III'],html='<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin-top:5px">';
  for(var br=1;br<=3;br++){
    var o=skillBookOption(x,br);
    html+='<div class="upgradeBtn" data-book-rank="'+br+'" style="margin-top:0;height:30px;line-height:1.05;text-align:center;padding:0 2px">'+romans[br]+' ×'+(o.count||0)+'<br>'+(o.chance||0)+'%</div>';
  }
  return html+'</div>';
}
function skillUpgrade(id,bookRank){parent.postMessage({type:'grimoireAction',skillId:id,bookRank:bookRank},'*')}`;
  const a=ppaEscapeSrcdocCode(oldHead),b=ppaEscapeSrcdocCode(newHead);
  if(!output.includes(a))throw new Error('Ranked grimoire character UI header target not found');
  output=output.replace(a,b);
}

{
  const oldLine=`(rank?(label+' · ранг '+['','I','II','III'][rank]+' · '+((x.preview||[])[rank-1]||x.d||'')):
          (label+' не изучен · Ранг I: '+((x.preview||[])[0]||x.d||'')))+
        ' · гримуары '+(x.count||0)+`;
  const newLine=`(rank?(label+' · ранг '+['','I','II','III','IV','V'][rank]+' · '+((x.preview||[])[Math.min(2,rank-1)]||x.d||'')):
          (label+' не изучен · Ранг I: '+((x.preview||[])[0]||x.d||'')))+
        ' · книги I×'+(x.book1||0)+' II×'+(x.book2||0)+' III×'+(x.book3||0)+`;
  const a=ppaEscapeSrcdocCode(oldLine),b=ppaEscapeSrcdocCode(newLine);
  if(!output.includes(a))throw new Error('Ranked grimoire character UI description target not found');
  output=output.replace(a,b);
}

{
  const oldMeta=`(rank>=3?'MAX':('нужно '+(x.need||0)+' · '+(x.chance||0)+'%'))`;
  const newMeta=`(rank>=5?'MAX':('до '+['I','II','III','IV','V'][rank]+' → '+['I','II','III','IV','V'][rank+1]+' · выбери ранг книги'))`;
  const a=ppaEscapeSrcdocCode(oldMeta),b=ppaEscapeSrcdocCode(newMeta);
  if(!output.includes(a))throw new Error('Ranked grimoire character UI meta target not found');
  output=output.replace(a,b);
}

{
  const oldBtn=`'<div class="upgradeBtn">'+skillBtnText(x)+'</div>'+`;
  const newBtn=`skillUpgradeButtons(x)+`;
  const a=ppaEscapeSrcdocCode(oldBtn),b=ppaEscapeSrcdocCode(newBtn);
  if(!output.includes(a))throw new Error('Ranked grimoire character UI buttons target not found');
  output=output.replace(a,b);
}

{
  const oldListener=`var btn=card.querySelector('.upgradeBtn');
  if(btn && rank<3){
    btn.addEventListener('click',function(ev){
      ev.preventDefault();ev.stopPropagation();
      skillUpgrade(x.id);
    });
  }`;
  const newListener=`card.querySelectorAll('.upgradeBtn[data-book-rank]').forEach(function(btn){
    btn.addEventListener('click',function(ev){
      ev.preventDefault();ev.stopPropagation();
      skillUpgrade(x.id,Number(btn.getAttribute('data-book-rank'))||1);
    });
  });`;
  const a=ppaEscapeSrcdocCode(oldListener),b=ppaEscapeSrcdocCode(newListener);
  if(!output.includes(a))throw new Error('Ranked grimoire character UI listener target not found');
  output=output.replace(a,b);
}

if (!output.includes("function skillProgressRank(id){return Math.max(0,Math.min(5") ||
    !output.includes("const PPA_SKILL_RULE_CACHE=(function()") ||
    !output.includes("const chance=br>=3?1:(br===2?Math.min(1,base+.06):base);") ||
    !output.includes(ppaEscapeSrcdocCode("var chance=bookRank>=3?100:(bookRank===2?Math.min(100,base+6):base);")) ||
    !output.includes("if(rank>=5)return null;") ||
    !output.includes("tryGrimoireUpgrade(d.skillId,d.bookRank)") ||
    !output.includes("function consumeRankedGrimoires(skillId,bookRank,cost)") ||
    !output.includes("book1:counts[1]||0,book2:counts[2]||0,book3:counts[3]||0") ||
    !output.includes("function romanRank(n){return ['','I','II','III','IV','V'][n]||''}") ||
    !output.includes(ppaEscapeSrcdocCode("skillUpgrade(x.id,Number(btn.getAttribute('data-book-rank'))||1)"))) {
  throw new Error('Ranked grimoire / skill V progression patch incomplete');
}

/* ======================================================================== */


/* === REAL SKILL RANK IV-V EFFECTS ======================================== */
// Preserve every approved I-III value. Ranks IV-V are not cosmetic: V189's common
// rank-value helper extrapolates a real effect from rank III. Magnitude stats
// use 160/140 and 180/140, while "lower is stronger" values (cooldown/slow factor)
// shrink by the inverse ratio. This automatically covers damage, healing,
// shields, buffs, debuffs, durations, control, target counts and passives.
ppaPatchRegex(
  'V189 rank IV-V real effect helper',
  /const V189_RANK=\[0,1,2,3\];\s*const rv=\(arr,rank\)=>arr\[Math\.max\(1,Math\.min\(3,rank\|0\)\)-1\];/,
  `const V189_RANK=[0,1,2,3];
  const V189_IV_RATIO=160/140;
  const V189_V_RATIO=180/140;
  const rv=(arr,rank)=>{
    let r=rank|0;if(r<1)r=1;if(r>5)r=5;
    if(r<=3)return arr[r-1];
    const v3=arr&&arr[2],v2=arr&&arr[1];
    if(typeof v3!=='number'||typeof v2!=='number'||v3===v2)return v3;
    const ratio=r===4?V189_IV_RATIO:V189_V_RATIO;
    return v3>v2?v3*ratio:v3/ratio;
  };`
);

// Passives must read the progression rank (0..V), not the old combat-safe
// rank cap. Their actual stat values then flow through rv(), so IV-V change the
// real character stats, not only the card text.
ppaPatchRegex(
  'V189 passive progression rank V',
  /const meta=PASSIVE_META\[sk\.id\],rank=skillRank\(sk\.id\);/,
  "const meta=PASSIVE_META[sk.id],rank=(typeof skillProgressRank==='function'?skillProgressRank(sk.id):skillRank(sk.id));"
);

// The all-class V189 active dispatcher is already the authoritative caster.
// Feed it rank IV-V; every real effect inside it uses rv().
ppaPatchRegex(
  'V189 active dispatcher progression rank V',
  /if\(!sk\)return;const rank=skillRank\(sk\.id\);/,
  "if(!sk)return;const rank=(typeof skillProgressRank==='function'?skillProgressRank(sk.id):skillRank(sk.id));"
);

// Long-press info must report IV-V too. We keep the approved III text and
// explicitly state that the runtime effect is boosted; this avoids fake exact
// numbers in descriptions while the actual mechanics are scaled by rv().
ppaPatchRegex(
  'skill long-press progression rank V',
  /const rank=Math\.max\(0,Number\(skillRank\(sk\.id\)\)\|\|0\);/,
  "const rank=Math.max(0,Number(typeof skillProgressRank==='function'?skillProgressRank(sk.id):skillRank(sk.id))||0);"
);
ppaPatchRegex(
  'skill long-press IV-V effect description',
  /let effect=\(meta&&meta\.p&&meta\.p\[rr-1\]\)\?String\(meta\.p\[rr-1\]\):String\(sk\.d\|\|''\);/,
  `let effect=(meta&&meta.p&&meta.p[Math.min(2,rr-1)])?String(meta.p[Math.min(2,rr-1)]):String(sk.d||'');
  if(rr===4)effect+=' · IV: реальный эффект 160% шкалы';
  if(rr>=5)effect+=' · V: реальный эффект 180% шкалы';`
);

// Active-skill cooldown display also needs safe IV-V values instead of reading
// past the 3-entry metadata array.
ppaPatchRegex(
  'skill long-press IV-V cooldown display',
  /const cd=meta&&meta\.cd\?Number\(meta\.cd\[Math\.max\(0,rr-1\)\]\)\|\|0:0;/,
  `const cd=meta&&meta.cd?(rr<=3?(Number(meta.cd[Math.max(0,rr-1)])||0):(Number(rv(meta.cd,rr))||0)):0;`
);

if (!output.includes("const V189_RANK=[0,1,2,3];") ||
    !output.includes("const V189_IV_RATIO=160/140;") ||
    !output.includes("const V189_V_RATIO=180/140;") ||
    !output.includes("return v3>v2?v3*ratio:v3/ratio;") ||
    !output.includes("typeof skillProgressRank==='function'?skillProgressRank(sk.id):skillRank(sk.id)") ||
    !output.includes("IV: реальный эффект 160% шкалы") ||
    !output.includes("V: реальный эффект 180% шкалы")) {
  throw new Error('Real rank-IV/V skill effects did not apply');
}

/* ======================================================================== */


/* === LEGENDARY / RURI BLACKSMITH SAFETY ================================= */
ppaPatchRegex(
  'Great Ruri explicit blacksmith sharpenability',
  /function\s+isSharpenable\(it\)\{return !!\(it&amp;&amp;SHARPENABLE_SLOTS\.includes\(it\.slot\)\);\}/,
  "function isSharpenable(it){return !!(it&amp;&amp;(SHARPENABLE_SLOTS.includes(it.slot)||it.ruriLegendary===true||it.petName===&#x27;Великий Рури&#x27;));}"
);
ppaPatchRegex(
  'legendary and Great Ruri never burn on sharpening failure',
  /}else if\(it\.rarity==='epic'\)\{\s*it\.enh=Math\.max\(0,it\.enh-1\);\s*applyEnhancementStats\(it\);\s*smithNotify\('НЕУДАЧА · эпик не сгорел, откат до \+'\+it\.enh\+' · характеристики и БМ пересчитаны','#d69cff'\);\s*}else\{\s*var nm=it\.name;\s*INV\.bag\.splice\(idx,1\);\s*smithNotify\('НЕУДАЧА · '\+nm\+' СГОРЕЛ','#ff5a4f'\);\s*}/,
  `}else if(it.rarity==='epic'||it.rarity==='legendary'||it.ruriLegendary===true||it.petName==='Великий Рури'){
    it.enh=Math.max(0,it.enh-1);
    applyEnhancementStats(it);
    var _ppaSafeName=(it.ruriLegendary===true||it.petName==='Великий Рури')?'Великий Рури':(it.rarity==='legendary'?'легендарный предмет':'эпик');
    smithNotify('НЕУДАЧА · '+_ppaSafeName+' не сгорел, откат до +'+it.enh+' · характеристики и БМ пересчитаны','#d69cff');
  }else{
    var nm=it.name;
    INV.bag.splice(idx,1);
    smithNotify('НЕУДАЧА · '+nm+' СГОРЕЛ','#ff5a4f');
  }`
);
if(!output.includes("_ppaSafeName") ||
   !output.includes("it.petName===&#x27;Великий Рури&#x27;") ||
   output.includes("}else if(it.rarity==='epic'){\n    it.enh=Math.max(0,it.enh-1);")){
  throw new Error('Legendary / Great Ruri blacksmith safety patch incomplete');
}
/* ======================================================================== */

/* === GREAT RURI DIRECT EVENT CRAFT ======================================= */
ppaPatchRegex(
  'Great Ruri direct craft state and handler',
  /function\s+sendEventsState\(\)\s*\{/,
  `function ppaRuriFindOwned(){
  var found=null;
  function scan(a){if(found||!Array.isArray(a))return;for(var i=0;i<a.length;i++){var x=a[i];if(x&&(x.ruriLegendary===true||x.petName==='Великий Рури'||x.name==='Великий Рури')){found=x;return}}}
  try{
    scan(INV.bag);
    if(INV.storage){scan(INV.storage.personal);scan(INV.storage.clan);scan(INV.storage.premium)}
    if(!found&&INV.equipped&&INV.equipped.pet&&(INV.equipped.pet.ruriLegendary===true||INV.equipped.pet.petName==='Великий Рури'||INV.equipped.pet.name==='Великий Рури'))found=INV.equipped.pet;
    if(!found&&Array.isArray(INV.auctionLots)){for(var j=0;j<INV.auctionLots.length;j++){var l=INV.auctionLots[j],g=l&&l.item&&(l.item.gear||l.item);if(g&&(g.ruriLegendary===true||g.petName==='Великий Рури'||g.name==='Великий Рури')){found=g;break}}}
  }catch(_){}
  return found;
}
function ppaRuriCraftState(){
  var m=(INV&&INV.materials&&typeof INV.materials==='object')?INV.materials:{};
  var have={
    demonic:Math.max(0,Math.floor(Number(m['Демонический кристалл'])||0)),
    fire:Math.max(0,Math.floor(Number(m['Огненные осколки'])||0)),
    blood:Math.max(0,Math.floor(Number(m['Кровь монстра'])||0)),
    crystal:Math.max(0,Math.floor(Number(m['Хрустальный кристалл'])||0))
  };
  var owned=!!ppaRuriFindOwned();
  var bagFull=!Array.isArray(INV.bag)||INV.bag.length>=100;
  var enough=have.demonic>=72&&have.fire>=10&&have.blood>=7&&have.crystal>=11;
  return {resources:have,need:{demonic:72,fire:10,blood:7,crystal:11},owned:owned,bagFull:bagFull,canCraft:(!owned&&!bagFull&&enough)};
}
function ppaRuriCraftResult(ok,msg){
  try{if(eventsMenuFrame&&eventsMenuFrame.contentWindow)eventsMenuFrame.contentWindow.postMessage({type:'ruriCraftResult',ok:!!ok,message:String(msg||''),ruri:ppaRuriCraftState()},'*')}catch(_){}
}
function ppaRuriCraftFromEvent(){
  try{
    var st=ppaRuriCraftState();
    if(st.owned){ppaRuriCraftResult(false,'Великий Рури уже есть у персонажа');return false}
    if(st.bagFull){ppaRuriCraftResult(false,'Освободи место в сумке');return false}
    if(!st.canCraft){ppaRuriCraftResult(false,'Не хватает ресурсов для Великого Рури');return false}
    INV.materials['Демонический кристалл']=st.resources.demonic-72;
    INV.materials['Огненные осколки']=st.resources.fire-10;
    INV.materials['Кровь монстра']=st.resources.blood-7;
    INV.materials['Хрустальный кристалл']=st.resources.crystal-11;
    var uid='crafted_ruri_'+Date.now()+'_'+Math.floor(Math.random()*1000000);
    var ruri={
      uid:uid,eventRewardId:'crafted_ruri_legendary_v1',eventRewardTemplate:false,eventRewardStock:false,rewardSource:'great_ruri_craft',
      name:'Великий Рури',petName:'Великий Рури',slot:'pet',rarity:'legendary',enh:0,
      classKey:'all',className:'Все классы',icon:'🦄',ic:'🦄',
      img:PPA_RURI_DIR_ART.S,dirSprites:PPA_RURI_DIR_ART,stats:{},sell:0,
      ruriLegendary:true,ruriAttackType:'magic-melee',ruriAttackScale:.20,
      createdAt:Date.now(),weight:1
    };
    if(typeof ppaApplyRuriEnhancement==='function')ppaApplyRuriEnhancement(ruri);
    INV.bag.push(ruri);
    try{if(typeof saveGame==='function')saveGame()}catch(_){}
    try{if(typeof sendInvState==='function')sendInvState()}catch(_){}
    try{if(typeof showPickup==='function')showPickup('🔥 ВЕЛИКИЙ РУРИ СОЗДАН','#ffd36d')}catch(_){}
    ppaRuriCraftResult(true,'Великий Рури создан и добавлен в сумку');
    try{sendEventsState()}catch(_){}
    return true;
  }catch(e){
    console.warn('PPA Great Ruri craft',e);
    ppaRuriCraftResult(false,'Не удалось создать Великого Рури');
    return false;
  }
}
window.PPA_RURI_CRAFT_STATE=ppaRuriCraftState;
window.PPA_RURI_CRAFT=ppaRuriCraftFromEvent;

function sendEventsState(){`
);
ppaPatchRegex(
  'Great Ruri state in Events payload',
  /titanShards:titanShardCount\(\),\s*worldBoss:worldBossDailyStatus\(\),/,
  "titanShards:titanShardCount(),\n        ruri:(typeof ppaRuriCraftState==='function'?ppaRuriCraftState():null),\n        worldBoss:worldBossDailyStatus(),"
);
ppaPatchRegex(
  'Great Ruri craft message route',
  /if\(d\.type==='titanShardBuy'\)\{titanShardExchange\(d\.id\);return;\}/,
  "if(d.type==='titanShardBuy'){titanShardExchange(d.id);return;}\n  if(d.type==='ruriCraft'){ppaRuriCraftFromEvent();return;}"
);
if(!output.includes('function ppaRuriCraftFromEvent()')||
   !output.includes("d.type==='ruriCraft'")||
   !output.includes("Демонический кристалл']=st.resources.demonic-72")||
   !output.includes("eventRewardId:'crafted_ruri_legendary_v1'")){
  throw new Error('Great Ruri direct craft patch incomplete');
}
/* ======================================================================== */

/* === GREAT RURI LEGENDARY PET / EVENT REWARD STOCK ====================== */
ppaPatchRegex(
  'Great Ruri sharpening profile',
  /function\s+applyEnhancementStats\(it\)\s*\{\s*if\(!it\|\|!it\.stats\)return it;/,
  "var PPA_RURI_DIR_ART={\n  S:'data:image/webp;base64,UklGRugEAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSCMCAAABoITtnyFJ+sU/ssa2bdueI2+2bds+zaxtXm3vnmzbNioz4v87lCLqefYeEROA/+tcrsoMqtvmsGF7IqZqLNCJb8DkrKkOQbddb6XfLm0OSFXUwKjPSCVfvjgSxsRL0PNj/uepjvz5LGw0Qee36UhSXUpdbcXEEen7NjOW9I6bYaMYi3uZZ5mpPmbExBDM+t1pOao/zYLEMHXeoWfZnu/UQ0TBsH+Vlf4zEBLO4hq6StRPgw0m6P4DfSWOt0Sw2KuOlXq+1wISyBh7N7NytED1n6lIAiHBOablFFWXroINd7bEv57kt44kU14WzEjNO5mRyj+v/Zn6zw1/FTuDJJCg5Vt0JJn+QqXLU0lmvNFKIIv+f3gtKK4sVP/3QNhQ4+hYVMthxgmhBO0/pi9SfqbjwrV9NwyDWYxjxhA6tto4sbq8ftMdEkbQ5j26yjI+VAsmDASXMa3M8a3WkEAJLvgQ/qWmMIEsTjFAyi1IEFik9cP0lSivbyQmFAQdv1MtUK9FvH+3BgzC57CETlmoWpDnaiSIaeVU5lX59VeeSjr+0s5IlAR9fqR6fjhq9Dv0qi+ONAZRLXp+TmXGFbiPmffTkCCuoPOn9FR+eOkHquMBiWUx8hcqSzr/LGykHHZrSpL+v9Rl//EGJHGMmAeZV1I9C6+oKyYOrJmdp8vnySf33nlyfm0YxBac+JXkr+cEAIxBfIPRsw8fGA1YkcSgGg0KBcEBAFZQOCCeAgAA0A0AnQEqMAAwAD6VPplJJaMiISqqqLASiWwAwQuBrHr7BaLmfoN2xfNAerneafQA6T//E0Bri3sBlA/cvNPSTfEtimmmr0qxEqqD+L73AgEhlaqmVNIgi/0M/L5xwD0/cSlriIAFF+elRKNdPtYoD5JrwKj1DQAA/v85vVy2bCUCGEiTlcs5INi6tniQ0bStrcMN7mOdFLwQ1HGZsvjacnca/2GJ6s1lLWCL6ih9pjf5CJn8D7JKyGMAy4tIq5S3+bYIA2wwpuR1yqMULoWBznTpNqaVWclJbgJAWnd2FGMNb+sAKW31IfuLtoXqT/FKJBGOpjMTWUAWogZtNrO97RcDiCnPevrpa+rrVXy5aNO1QllkdmfaIV/abCHECpcqZVuIAIi+PDcYzZrx26n1A1hudN/SP/TiagB7dUnHckq+n0hva/ELqqWVNXDFU48DWjKI6WkbQyZf4SPcFBgCbmkWbJwi+4+fndB7q+VWI1w+gZ7RVRP/lI2iRvfefEzCn3hGb0OZ8NMnobn4bVTcjit0u4NZnJhA0QHqxBVRzlU5ztnwyvnifM/z2o660zFwu5uReEqfYZp3VEhyalVZAWbWzfC1eOE17cEewoF2g719g+iomWVB/U4LuFIaaHnI+EQSk/ca0nPF8OG9VHJoa3+f4jPZVX0GqE72p3l3V0XTm20BWdWuDASTS13/C2VXAO9LKN/WTOfXZDcUQWTyrMQDhT6R+kMLuA4TPsVNom2/d3h2Ii4/cXQp1iad8Ykr9aOeXVQhYtd1YHlEtrC7H9ZHAy0gNfIqlapwFGAZofnpXy/2WJkd9Q/YWg4bq3OIfC4gArSbIvfFXvg0ETUhbfhxM8LivoB4O2/9lrnRz3t9CEgKcO3xr5o/oAAAAA==',\n  N:'data:image/webp;base64,UklGRlwEAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSNwBAAABoITtf2Gx+iWZ2ra1te3ubJsr2+7Kbpe27XZn+9q2zknm/7ucSc7z3H1ETAD+p6O8uZbrBj0W58slg/yvWTDSOaNRbPgfvw1ApHIkQoXrFPlsBGByQqHsbVoR8lhJ6FzQ+XcwK2Rsea0UdDiDsbT81wwP5AunDC5L/G/M2m4woYyq+zn/y3JmuAhT6fhfMj6YVnW/jeP/cjyqVSCDpnTyXxSOggnVWOIkjmsQhWrAFLPDjaZjohMwoVbQJjsNrYJobKFLQtsUGmHUFtpEmWo6EPI9pySReArCaNXgF2EilxkLE8KguySj5Z1SSvlTusglumTifuwN4y/CJFqmtFym/ClEJyWVkz3QAYrfpksj/KgMlC+N8k/TMeZuGH8VX3qQ+Oe2iLzV/oxxKloeLaiVr4pv6dI5vqwA7UcptV48iNj6MH6gVel3JE4Xs6E3GMxlNhUtW/lTuvhNShqxtqE/aF3qFF0Kx815NfznxVBaSRTLB+URIlLrmGUyPsgH5U+j8iu6ZFbeyR/CYA4dE8fkECiEmM5MMvl2FRSC1P2Vwlj+IZLl501ggkCbji+zf5DZTMYKycHIi+ClG9Rb+x1J/vrNud6IENwAQNP5CxZN7NwIUMhBpZTGvxsNj1ZQOCBaAgAAkAsAnQEqMAAwAD6VPplJJaMiISqqqLASiWwAxQfCRmJIITu2A3C+8Z+gB0n0+d2iz8KIEcluAlbLb0mS/sAyiKKuc1imL5B881x4MQ0hb+h5+uok8GHfbfxccLwv0rmCehHJV4AA/v0kGO2fwS/KcartGgBxAYWt28QqjBO6Pm1r0Y4Iqw63KINZcE0qWpXB8KE8bxN8YB+Pc17WRWCPnnfE/Neff6yH0jwuq8GnXoYoY+Nky53MClcPu4YFLV6jxJR7PONklYJRhmf/5fv819sP/72NNU0+UIb8uvU8lh2stnli7F4+NnkZ0Ha6QkAkQP7oXaCTALKS7EsoHc+6HTVTprH8qVJt0S2seSrnMWGYFHhv0ytr3zJtVFpvwQthdnPp1ucg8SOQJXgOvOhZwD7nsIhB4hKT11rNuLcjw6ej4Ps6D1myrCEoXCi9WlvVPtA7R/VOlyQLlH/vgrbngHO0zHYTbn0vKYBVDKXkucO2oNew3nw9s+s6z1yw8EHCG6fTyfI9lDfXWC92dIPvYm/iEqNidsTfYqg3XYjN7pdP/9rSrfNl+mzZyB7oQCoKBmngvO+h4IXZsGGXyhQsvDOysX9MW74q8NsVVVG3TRdebl3Gjtjxa/RMBSppDgnqc8ktMX/yd5RGCXgqswb4GEhh1jBFmW98zsGvVhBRbWdVPJPpTC9ChHfBU0UMbs3Jysq5F6npNlhu8rTg2KWAPUVUgd3HdYfsSfIL2/OUFmIbaDju+npLNNnNi6mayZ7RaS4QZm1AKrFjil9CC3JfiV7vdaczso8EAAA=',\n  W:'data:image/webp;base64,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',\n  E:'data:image/webp;base64,UklGRrwFAABXRUJQVlA4WAoAAAAQAAAALwAALwAAQUxQSGcCAAABoAPbtmnbGnPN/Wz72z+ybdu2M9u2Edm2bdu2/zPO2WvNOYKz+bOfRcQE4P98CUGDiPxXNEOhQDNtTzIFdMr8Ky8+Er2hNQArn3L/1z/w3zdvvf3yPdcCtBWRSbvcMpUkEwtnng8ESGOZjv+KZB7NaCnGmJz3TUEWtClgL+bJWdVzvjMSTYssffJUc9b0yIO3eufePk2I9r+HjVoy/tq3mhaGDHd4twkytxMgFURReupcY6PJO8sjlEnA8hedfNxhKy245FR6I252GAJKFTi7Q5Lp59+7zvrutLmHI6A0YMjZtJhidDbqpPFlKEoDxj/JrpOkmzUR//gj8p3BKBXp+wpztmh87/bEfGmEApH+1zOyTffZs8jufCWKpaa6t1Jofgi0IMOOc4ytdjq5e/T3ikQGPMzYRuKLSx40L+W8rQi40hPbNH7VVz/h3Ofml1D0MNsh+ebW6++y8XAICvv9Rm/HberKACAoHpiz5cRr0S/LBKX9p7VlvjEUVeVhtwYslTl/HIKajzHVczJ6gfGrdRAqCU7Imeo4//6K9J7ETyeIVELQ3eYw90qRjy425dgunaRxxsII1ZBhh7/p0SrkvBIBq/5EJ907ew+oA8Vyt81mVbfOdqLjvu6hOzeH1oAiLL33i/QSRl4XsDGNvdGPQFYHKkC/Z2gFMebxk/5yvqWC5C8MCFIHEvrhAXaSWXKSfF7DC+w66Zb7e8OlHqByGgs7p26w8cZTBMtMI2MiyRuQoUnBZlde/eF71++HwoC1nv2bnPnVM0dPFGmksG8fQFVVAAWW2/+gtUejxaAKaEBpCOgVlUoAVlA4IC4DAADwDgCdASowADAAPo00lEglIqIhNV1YAKARiWwAyjmB0B3oZgd2i4bxEMBtjPMd5uvoO/zm+begB0mf9xoEHJX7HkFlAjm5wEqnbd9QNdhBPFsZ3twVeRncDgw2zqJe6kkPrDP03iwY9mM4qhRFKxeiOhtW4On0ssr6uQ3U3+b1gAD+/bTrrsrwxPLb/Gy70ZTCyA3+g5nrF1JJEtXTu70bc1TJ++XtwHHyf55oHovL4jD5SIGuCe2ngQvKJc5T2RZUdAe5b43yGl8rvuGjXIhF6K/zJo/yyVP0jvcK0oT6V1NvUnkmqd8Q9dfnfna+zZmNgFSeNCinXTyhUuqt6GFILPAu4HRns8BZwY+qi4Xr5p3NN/+u5NdE5r4rtav8AgvE4BPkTIB5eshO/Wxz36h49Tbm3b3RS54CWkx/FGadqLOAIEhkqsRCUIn01nzibSwOwiG/fSgOPNuV1+xPL4c1a8daNpt1R+WR7pSMKIFTtx8LtBuhDnmrlU/5R9sGX/z81JQjIbh0qm48r3eyVdLFgPt6n/sMYP85ddV+0l/w6rWJcF5dExTNZrbT7MuILj6P+gzYWz1bKP/QvL/MeNCIHpPf3xCRAek82Z47eC4WuPb96Awj0QgZsk8Uar2Bqa5JS4aNs8FnqO9UcSyxEnaccm382Pzxn2YQVffVAoPhlEFr6Nhi8mS71d/Mbn7WzIkzvjwlk+KStiwLCVaY9u8OjjRnyBcHs9TQXKjNp3HTz3YCMBCzYELKbcDKgA5mXBjXJzrcqw+g8qRSSNsU04ujYqdYmgQdaAzWuxxbPG0gcSH//z+sg8ejMsUWZ0oocxqU3iUQW/8MXFM3wH1CRA++rdKY9Zxj/F7Pb3ykCfDghSX64xPs7aEPYzoIByrBuSJrSYaP3C9/hFZ/IGXcrdASdrfEqWIbzE7oWtoY/cdP+SSBoE7vmZzEkfKwoLLy1elPpQLarvk6yeVvQWTFN3HxYY3HsGkl++KDpGPnj0NSzA/xFir2hoqQGjIg4kx3KlEIOunQyAQL+m7jbLjPEyD4hX01K/sVvlPrrsjK5Scju0rbNyu9iMIRc5nm9AAA='\n};\ntry{if(typeof PET_DIR_ART!=='undefined')PET_DIR_ART['Великий Рури']=PPA_RURI_DIR_ART}catch(_){}\nfunction ppaRuriProfile(lvl){\n  lvl=Math.max(0,Math.min(7,Math.floor(Number(lvl)||0)));\n  var all=[4,5,6,7,8,9,10,12][lvl];\n  var hp=[6,8,10,12,14,16,18,20][lvl];\n  var dmg=[5,6,7.5,9,10.5,12,13.5,15][lvl];\n  var asp=[2,3,4,5,6,6.5,7,8][lvl];\n  var mov=[1,2,2.5,3,3.5,4,4.5,5][lvl];\n  var fire=[20,21,22.5,24,25.5,27,28.5,30][lvl];\n  return {lvl:lvl,all:all,hp:hp,dmg:dmg,def:dmg,asp:asp,mov:mov,fire:fire};\n}\nfunction ppaApplyRuriEnhancement(it){\n  if(!it)return it;\n  var p=ppaRuriProfile(it.enh);\n  it.stats={hp:p.all,mp:p.all,atk:p.all,def:p.all,hpPct:p.hp,damagePct:p.dmg,defPct:p.def,atkSpeedPct:p.asp,moveSpeedPct:p.mov};\n  it.enhBaseStats={hp:4,mp:4,atk:4,def:4,hpPct:6,damagePct:5,defPct:5,atkSpeedPct:2,moveSpeedPct:1};\n  it.ruriLegendary=true;it.ruriAttackType='magic-melee';it.ruriAttackScale=p.fire/100;\n  it.bonusText='Великий Рури · огненная магическая атака '+p.fire+'% ATK хозяина';\n  if(typeof syncItemBM==='function')syncItemBM(it);\n  return it;\n}\nfunction applyEnhancementStats(it){\n  if(!it||!it.stats)return it;\n  if((it.ruriLegendary===true||it.petName==='Великий Рури')&&typeof ppaApplyRuriEnhancement==='function')return ppaApplyRuriEnhancement(it);"
);
ppaPatchRegex(
  'admin event reward premium storage stock',
  /function\s+storageMove\(mode,direction,idx,source\)\s*\{/,
  "window.PPA_ADMIN_EVENT_REWARD_STOCK=function(){\n  try{\n    if(typeof normalizeStorage==='function')normalizeStorage();\n    if(!INV.storage)INV.storage={personal:[],clan:[],premium:[]};\n    if(!Array.isArray(INV.storage.premium))INV.storage.premium=[];\n    var box=INV.storage.premium,cap=50,added=0;\n    function has(id){id=String(id||'');var all=[];try{if(Array.isArray(INV.bag))all=all.concat(INV.bag);if(INV.storage){['personal','clan','premium'].forEach(function(k){if(Array.isArray(INV.storage[k]))all=all.concat(INV.storage[k])})}if(INV.equipped)Object.keys(INV.equipped).forEach(function(k){if(INV.equipped[k])all.push(INV.equipped[k])});(INV.auctionLots||[]).forEach(function(l){var x=l&&l.item&&(l.item.gear||l.item);if(x)all.push(x)})}catch(_){}return all.some(function(it){return it&&String(it.eventRewardId||'')===id})}\n    function push(it){if(!it||box.length>=cap||has(String(it.eventRewardId||'')))return false;box.push(it);added++;return true}\n    function makeGnome(slot){\n      var arr=(typeof SLOTS!=='undefined'&&Array.isArray(SLOTS))?SLOTS:null,saved=arr?arr.slice():null,it=null;\n      try{if(arr){arr.length=0;arr.push(slot)}it=(typeof genItem==='function')?genItem(20,false,'legendary'):null}\n      finally{if(arr&&saved){arr.length=0;for(var i=0;i<saved.length;i++)arr.push(saved[i])}}\n      if(!it)return null;\n      var id='event_gnome_legendary_'+slot+'_v1';\n      var base=(typeof CLASS_ITEM_NAMES!=='undefined'&&CLASS_ITEM_NAMES.gnome&&CLASS_ITEM_NAMES.gnome[slot])||it.name||'Предмет канонира';\n      var pref=(typeof RPREF!=='undefined'&&RPREF.legendary)||'Легендарный · ';\n      it.uid=id;it.eventRewardId=id;it.eventRewardTemplate=true;it.eventRewardStock=true;it.rewardSource='event';\n      it.slot=slot;it.rarity='legendary';it.enh=0;it.sell=0;\n      if(slot==='ring'){it.classKey='all';it.className='Все классы'}\n      else{\n        it.classKey='gnome';it.className=(typeof CLASS_DISPLAY!=='undefined'&&CLASS_DISPLAY.gnome)||'Гном-канонир';\n        it.name=pref+base;\n        try{var art=classGearArt('legendary','gnome',slot);if(art)it.img=art}catch(_){}\n      }\n      if(typeof syncItemBM==='function')syncItemBM(it);\n      return it;\n    }\n    var existingRuri=box.find(function(it){return it&&String(it.eventRewardId||'')==='event_ruri_legendary_v1'&&it.eventRewardStock===true});\n    if(existingRuri){\n      existingRuri.enh=0;existingRuri.ruriAttackScale=.20;ppaApplyRuriEnhancement(existingRuri);\n    }else{\n      var ruri={\n        uid:'event_ruri_legendary_v1',eventRewardId:'event_ruri_legendary_v1',\n        eventRewardTemplate:true,eventRewardStock:true,rewardSource:'event',\n        name:'Великий Рури',petName:'Великий Рури',slot:'pet',rarity:'legendary',enh:0,\n        classKey:'all',className:'Все классы',icon:'🦄',ic:'🦄',\n        img:PPA_RURI_DIR_ART.S,dirSprites:PPA_RURI_DIR_ART,stats:{},sell:0,\n        ruriLegendary:true,ruriAttackType:'magic-melee',ruriAttackScale:.20,\n        createdAt:Date.now(),weight:1\n      };\n      ppaApplyRuriEnhancement(ruri);push(ruri);\n    }\n    ['weapon','helmet','armor','gloves','ring','legs','boots'].forEach(function(slot){\n      var id='event_gnome_legendary_'+slot+'_v1';\n      if(has(id))return;\n      var it=makeGnome(slot);if(it)push(it);\n    });\n    return {added:added,total:box.length};\n  }catch(e){\n    console.warn('PPA event reward stock',e);\n    return {added:0,error:String(e&&e.message||e||'error')};\n  }\n};\nfunction storageMove(mode,direction,idx,source){"
);
if(!output.includes("PPA_RURI_DIR_ART") ||
   !output.includes("ppaApplyRuriEnhancement") ||
   !output.includes("event_ruri_legendary_v1") ||
   !output.includes("rarity:'legendary',enh:0") ||
   !output.includes("existingRuri.enh=0") ||
   !output.includes("var id='event_gnome_legendary_'+slot+'_v1'") ||
   !output.includes("all=all.concat(INV.bag)") ||
   !output.includes("window.PPA_ADMIN_EVENT_REWARD_STOCK")) {
  throw new Error('Great Ruri / event reward stock patch incomplete');
}
/* ======================================================================== */

/* === RUNTIME BUILD AUDIT ================================================= */
{
  const worldCombat=fs.readFileSync(path.join(ROOT,'gateway/world-combat-client.js'),'utf8');
  const socialUi=fs.readFileSync(path.join(ROOT,'gateway/social-ui.js'),'utf8');
  const chatUi=fs.readFileSync(path.join(ROOT,'gateway/chat-ui.js'),'utf8');
  const realtimeClient=fs.readFileSync(path.join(ROOT,'gateway/realtime-client.js'),'utf8');
  const realtimeServer=fs.readFileSync(path.join(ROOT,'src/realtime-stable.js'),'utf8');
  const realtimeBase=fs.readFileSync(path.join(ROOT,'src/realtime.js'),'utf8');
  const arenaPvp=fs.readFileSync(path.join(ROOT,'gateway/arena-pvp-client.js'),'utf8');
  const dungeonMobEvents=fs.readFileSync(path.join(ROOT,'gateway/dungeon-mob-events.js'),'utf8');
  const dungeonDropSlotsAudit=fs.readFileSync(path.join(ROOT,'gateway/dungeon-drop-slots.js'),'utf8');
  const bossDropBoost=fs.readFileSync(path.join(ROOT,'gateway/boss-drop-boost.js'),'utf8');
  const remoteSprite=fs.readFileSync(path.join(ROOT,'gateway/remote-sprite-renderer.js'),'utf8');
  const remoteFx=fs.readFileSync(path.join(ROOT,'gateway/remote-combat-fx.js'),'utf8');
  const mobilePerf=fs.readFileSync(path.join(ROOT,'gateway/mobile-sprite-performance.js'),'utf8');
  const remotePet=fs.readFileSync(path.join(ROOT,'gateway/remote-pet-renderer.js'),'utf8');
  const ruriPet=fs.readFileSync(path.join(ROOT,'gateway/ruri-pet-runtime.js'),'utf8');
  const legendaryGearArt=fs.readFileSync(path.join(ROOT,'gateway/legendary-gear-art.js'),'utf8');
  const onlineClient=fs.readFileSync(path.join(ROOT,'gateway/online-client.js'),'utf8');
  const ppaBridge=fs.readFileSync(path.join(ROOT,'gateway/ppa-bridge.js'),'utf8');

  if (worldCombat.includes('ppaWorldPkBtn') ||
      worldCombat.includes('PPA_WORLD_PK_TRY_BASIC_ATTACK') ||
      worldCombat.includes('world-pvp-hit') ||
      socialUi.includes('PPA_WORLD_PK_ACTIVE') ||
      realtimeClient.includes("type:'world-pvp")) {
    throw new Error('Open-world PK client code returned');
  }
  if (worldCombat.includes('z-index:10050!important') ||
      worldCombat.includes('z-index:10051!important') ||
      !worldCombat.includes('z-index:40!important') ||
      !worldCombat.includes('z-index:41!important')) {
    throw new Error('PK/AUTO HUD layer must stay below menus');
  }
  if (!onlineClient.includes('seedAdminEventRewardStock') ||
      !onlineClient.includes('PPA_ADMIN_EVENT_REWARD_STOCK') ||
      !ppaBridge.includes('ppaAdminEventRewardStockAccess')) {
    throw new Error('Event reward stock admin bridge incomplete');
  }
  if (!ruriPet.includes("var NAME='Великий Рури'") ||
      !ruriPet.includes('ATTACK_COOLDOWN=2400') ||
      !ruriPet.includes('RURI_DRAW_SIZE=62') ||
      !ruriPet.includes('RURI_RENDER_INTERVAL=1000/30') ||
      !ruriPet.includes('MOVE_FRAME_MS=120') ||
      !ruriPet.includes("MOVE_SRC='/assets/ruri-move.webp'") ||
      !ruriPet.includes('drawMoveFrame') ||
      !ruriPet.includes('function drawShadow') ||
      !ruriPet.includes("kind:'ruri'") ||
      !ruriPet.includes('PPA_RURI_DIAG') ||
      !ruriPet.includes('a.down=a.front=a.south=a.S') ||
      !ruriPet.includes('Great Ruri is drawn only by the dedicated overlay below') ||
      !ruriPet.includes('drawMoveFrame(ruriX,ruriY,dx,dy,moving,now,RURI_DRAW_SIZE)') ||
      !realtimeServer.includes("hitKind === 'ruri'") ||
      !realtimeServer.includes("cleanPet(a.pet || '') !== 'Великий Рури'") ||
      !realtimeServer.includes('maxRuriDamage')) {
    throw new Error('Great Ruri combat/render bridge incomplete');
  }
  if (legendaryGearArt.includes("sendBlacksmithState") ||
      !legendaryGearArt.includes("var ART_BASE='/assets/legendary/'") ||
      !legendaryGearArt.includes("var ART_VER='v514'") ||
      !legendaryGearArt.includes("var CLASS_ROWS={tank:0,paladin:1,barbarian:2,assassin:3,gnome:4,archer:5,mage:6,priest:7}") ||
      !legendaryGearArt.includes('PPA_LEGENDARY_GEAR_ITEM_ART') ||
      !legendaryGearArt.includes("it.img=src;it.image=src;it.art=src") ||
      !legendaryGearArt.includes('PPA_HYDRATE_LEGENDARY_GEAR_ART') ||
      !output.includes("_ppaLegendArt=window.PPA_LEGENDARY_GEAR_ITEM_ART(srcItem||it)") ||
      !output.includes("function auctionSourceInventoryItem(it)") ||
      !output.includes("it.cardArt=_ppaLegendArt") ||
      !output.includes("items:auctionItemsForUi().map(auctionAttachMinPrices).map(auctionRestoreUiArt)") ||
      !output.includes("lots:(INV.auctionLots||[]).map(auctionLotForUi).map(auctionRestoreLotArt)") ||
      !output.includes("var o=(it&&typeof it==='object')?Object.assign({},it):it") ||
      !output.includes("window.PPA_LEGENDARY_GEAR_ITEM_ART&&o") ||
      !output.includes("PPA_LEGENDARY_GEAR_ITEM_ART(o)") ||
      !output.includes("o.img=a;o.image=a;o.art=a")) {
    throw new Error('Legendary real-file all-UI runtime incomplete');
  }
  if (!worldCombat.includes('ppaPlayerPkBtn') ||
      !worldCombat.includes('PPA_PK_ACTIVE') ||
      !realtimeClient.includes("type:'player-pk-hit'") ||
      !realtimeClient.includes('pkAttackMixed') ||
      !realtimeClient.includes('player-respawn-confirm') ||
      !realtimeClient.includes('serverDeadLocked') ||
      !arenaPvp.includes("player-pk-skill-hit") ||
      !arenaPvp.includes('nearestMobInfo') ||
      !realtimeServer.includes("m.type === 'player-pk-hit'") ||
      !realtimeServer.includes('playerPkRoomAllowed') ||
      !realtimeServer.includes("m.type === 'player-respawn-confirm'") ||
      !realtimeServer.includes('deadLocked')) {
    throw new Error('New server-authoritative PK zone bridge is incomplete');
  }
  if (!realtimeClient.includes('PPA_PVP_QUEUE_HANDLER') ||
      !realtimeClient.includes("type:'arena-queue-join'") ||
      !realtimeClient.includes('arenaTryBasicDirect') ||
      !realtimeClient.includes("type:'arena-hit'") ||
      !realtimeClient.includes('PPA_ARENA_MATCH_END') ||
      !realtimeClient.includes('RT.selfPid') ||
      !arenaPvp.includes('PPA_ARENA_SKILL_HIT') ||
      arenaPvp.includes('window.PPA_ARENA_MATCH_END=function')) {
    throw new Error('Online arena client bridge is incomplete');
  }
  if (!dungeonMobEvents.includes('applyServerEliteState') ||
      !realtimeServer.includes('syncServerElite') ||
      !realtimeServer.includes('eliteKilledKey') ||
      !realtimeServer.includes('eliteWindowKey')) {
    throw new Error('Server elite mob bridge is incomplete');
  }
  if (remoteSprite.includes('forcedAttack') || remoteSprite.includes('__ppaAttackDir')) {
    throw new Error('Remote attack FX is overriding movement facing again');
  }
  if (!mobilePerf.includes('__PPA_MOBILE_SPRITE_PERF_V2') ||
      !mobilePerf.includes('imageCache') ||
      !remoteSprite.includes('canvasHitMetrics(now)') ||
      !dungeonMobEvents.includes('function requestSmooth()') ||
      !remotePet.includes('installedPacket&&installedDraw')) {
    throw new Error('Mobile FPS recovery patch incomplete');
  }
  if (remoteFx.includes("__ppaAttackUntil") || remoteFx.includes("r.anim='attack'") || remoteFx.includes("r.face=")) {
    throw new Error('Remote combat FX must stay visual-only');
  }
  if (!remoteFx.includes('PPA_REMOTE_COMBAT_FX_DRAW')) {
    throw new Error('Remote projectile draw API missing');
  }
  if (!chatUi.includes('PPA_CHAT_RECEIVE') ||
      !chatUi.includes('ppa-chat-send') ||
      !chatUi.includes('PPA_CHAT_PRIVATE_TO') ||
      !chatUi.includes('ppaChatNativeInput') ||
      !realtimeBase.includes("m.type === 'chat'") ||
      !realtimeBase.includes("channel === 'private'") ||
      !realtimeBase.includes("channel === 'clan'") ||
      !realtimeBase.includes("channel === 'party'")) {
    throw new Error('Realtime chat UI/server bridge is incomplete');
  }
  if (!bossDropBoost.includes('BONUS_ROLL_CHANCE=0.50') ||
      !bossDropBoost.includes('__ppaBossBonusRoll') ||
      !bossDropBoost.includes('Keep the boss table itself exactly as configured') ||
      !bossDropBoost.includes('Бонусный бросок таблицы босса')) {
    throw new Error('Boss drop boost helper incomplete');
  }
  try{new Function(dungeonDropSlotsAudit)}catch(err){throw new Error('Dungeon drop helper syntax invalid: '+String(err&&err.message||err))}
  if (!dungeonDropSlotsAudit.includes('__ppaApprovedDropRows') ||
      !dungeonDropSlotsAudit.includes("PPA_DUNGEON_DROP_TABLE_MODE='approved-11-60+elite-authoritative'") ||
      !dungeonDropSlotsAudit.includes('function eliteRows(e)') ||
      !dungeonDropSlotsAudit.includes("if(!e||e.isDungeonElite!==true)return null;") ||
      !dungeonDropSlotsAudit.includes("if(e&&e.isDungeonElite===true){") ||
      !dungeonDropSlotsAudit.includes("weapon:'Оружие · все классы'") ||
      !dungeonDropSlotsAudit.includes("legs:'Поножи · все классы'") ||
      !dungeonDropSlotsAudit.includes('function expandGearRows(e,rows)') ||
      !dungeonDropSlotsAudit.includes('function expandBookRows(e,rows)') ||
      !dungeonDropSlotsAudit.includes("typeof ALL_GRIMOIRES!=='undefined'") ||
      !dungeonDropSlotsAudit.includes('var BLUE_2130=[.00002,.00004,.00006,.00009,.00012,.00015,.00019,.00023,.00026,.00030]') ||
      !dungeonDropSlotsAudit.includes('var EPIC_3140=[.000001,.000002,.000003,.000004,.000005,.000006,.000007,.000008,.000009,.000010]') ||
      !dungeonDropSlotsAudit.includes('var EPIC_4160_START=0.000018') ||
      !dungeonDropSlotsAudit.includes('var EPIC_4160_END=0.000040') ||
      !dungeonDropSlotsAudit.includes('var LEGENDARY_5160_CHANCE=0.00000013') ||
      !dungeonDropSlotsAudit.includes("if(lv<=30)return .00005; // 0.005%") ||
      !dungeonDropSlotsAudit.includes("if(lv<=40)return .00006; // 0.006%") ||
      !dungeonDropSlotsAudit.includes("if(lv<=30)return .00004; // 0.004%") ||
      !dungeonDropSlotsAudit.includes("if(lv<=40)return .00005; // 0.005%") ||
      !dungeonDropSlotsAudit.includes('function bookRankWeights(lv)') ||
      !dungeonDropSlotsAudit.includes('Do not divide the displayed chance by the number of book titles') ||
      dungeonDropSlotsAudit.includes('var each=totalChance/pool.length') ||
      !dungeonDropSlotsAudit.includes('__ppaPhoenixNoBlueGear') ||
      !dungeonDropSlotsAudit.includes('removePhoenixBlueGear') ||
      !dungeonDropSlotsAudit.includes("if(lv<=30)return rarity==='rare';") ||
      !dungeonDropSlotsAudit.includes("if(lv<=40)return rarity==='rare'||rarity==='epic';") ||
      !dungeonDropSlotsAudit.includes("if(lv<=50)return rarity==='epic';") ||
      !dungeonDropSlotsAudit.includes('filterIllegalDungeonGear(lootStart,e);')) {
    throw new Error('Approved 11-60 dungeon drop tables are incomplete');
  }
  if (!dungeonMobEvents.includes("rows.push(['p20',3913") ||
      !dungeonMobEvents.includes("DUNGEON21_BOSS_HP:9000)||9000)+5350") ||
      !dungeonMobEvents.includes("rows.push(['b60',36700") ||
      !output.includes('__ppaFartHp24000=true') ||
      !output.includes('_fg.mhp=24000')) {
    throw new Error('Boss/Fart HP balance patch incomplete');
  }
}

/* ======================================================================== */

const filesToPublish = [
  ['gateway/ppa-bridge.js','ppa-bridge.js','Telegram gateway bridge missing'],
  ['gateway/online-client.js','online-client.js','Online client bridge missing'],
  ['gateway/realtime-client.js','realtime-client.js','Realtime client bridge missing'],
  ['gateway/chat-ui.js','chat-ui.js','Realtime chat UI missing'],
  ['gateway/arena-pvp-client.js','arena-pvp-client.js','Arena PvP client missing'],
  ['gateway/world-combat-client.js','world-combat-client.js','World combat client missing'],
  ['gateway/dungeon60-dragon.js','dungeon60-dragon.js','Dungeon 60 dragon runtime missing'],
  ['gateway/dungeon-mob-events.js','dungeon-mob-events.js','Dungeon mob event bridge missing'],
  ['gateway/dungeon-drop-slots.js','dungeon-drop-slots.js','Dungeon drop slot helper missing'],
  ['gateway/boss-drop-boost.js','boss-drop-boost.js','Boss drop boost helper missing'],
  ['gateway/ruri-event-drops.js','ruri-event-drops.js','Great Ruri event drops missing'],
  ['gateway/qa-test-access.js','qa-test-access.js','QA dungeon access helper missing'],
  ['gateway/realtime-debug-bridge.js','realtime-debug-bridge.js','Realtime debug bridge missing'],
  ['gateway/mobile-sprite-performance.js','mobile-sprite-performance.js','Mobile sprite performance helper missing'],
  ['gateway/remote-sprite-renderer.js','remote-sprite-renderer.js','Remote sprite renderer missing'],
  ['gateway/remote-combat-fx.js','remote-combat-fx.js','Remote combat FX renderer missing'],
  ['gateway/remote-pet-renderer.js','remote-pet-renderer.js','Remote pet renderer missing'],
  ['gateway/ruri-pet-runtime.js','ruri-pet-runtime.js','Great Ruri runtime missing'],
  ['gateway/legendary-gear-art.js','legendary-gear-art.js','Legendary gear art runtime missing'],
  ['gateway/realtime-identity-sync.js','realtime-identity-sync.js','Realtime identity sync missing'],
  ['gateway/class-sync-client.js','class-sync-client.js','Realtime class sync missing'],
  ['gateway/telegram-safe-ui.js','telegram-safe-ui.js','Telegram safe UI helper missing'],
  ['gateway/mobile-hud-tweaks.js','mobile-hud-tweaks.js','Mobile HUD tweaks missing'],
  ['gateway/social-ui.js','social-ui.js','Social UI missing'],
];
for (const [srcName,dstName,err] of filesToPublish) {
  const src=path.join(ROOT,srcName);if(!fs.existsSync(src))throw new Error(`${err}: ${srcName}`);
  fs.copyFileSync(src,path.join(gameDir,dstName));
}

if (!output.includes('</body>')) throw new Error('PPA main </body> not found');
const js=(name)=>`/game/${name}?v=${CLIENT_BUILD}`;
output = output.replace('</body>', `<script src="${js('telegram-safe-ui.js')}"></script>\n<script src="${js('mobile-hud-tweaks.js')}"></script>\n<script src="${js('online-client.js')}"></script>\n<script src="${js('chat-ui.js')}"></script>\n<script src="${js('realtime-client.js')}"></script>\n<script src="${js('world-combat-client.js')}"></script>\n<script src="${js('dungeon60-dragon.js')}"></script>\n<script src="${js('dungeon-mob-events.js')}"></script>
<script src="${js('dungeon-drop-slots.js')}"></script>
<script src="${js('boss-drop-boost.js')}"></script>
<script src="${js('ruri-event-drops.js')}"></script>
<script src="${js('qa-test-access.js')}"></script>\n<script src="${js('realtime-debug-bridge.js')}"></script>\n<script src="${js('mobile-sprite-performance.js')}"></script>\n<script src="${js('remote-sprite-renderer.js')}"></script>\n<script src="${js('remote-combat-fx.js')}"></script>\n<script src="${js('remote-pet-renderer.js')}"></script>\n<script src="${js('ruri-pet-runtime.js')}"></script>\n<script src="${js('legendary-gear-art.js')}"></script>\n<script src="${js('class-sync-client.js')}"></script>\n<script src="${js('social-ui.js')}"></script>\n<script src="${js('realtime-identity-sync.js')}"></script>\n</body>`);

fs.writeFileSync(path.join(publicDir, 'index.html'), output, 'utf8');
console.log(`PPA build complete: ${count} unique embedded images externalized.`);
console.log('Telegram bridge: /game/ppa-bridge.js');
console.log('Telegram safe UI: /game/telegram-safe-ui.js');
console.log('Mobile HUD tweaks: /game/mobile-hud-tweaks.js');
console.log('Online bridge: /game/online-client.js');
console.log('Realtime chat UI: /game/chat-ui.js');
console.log('Realtime bridge: /game/realtime-client.js');
console.log('Arena PvP: /game/arena-pvp-client.js');
console.log('World combat: /game/world-combat-client.js');
console.log('Dungeon 60 dragon: /game/dungeon60-dragon.js');
console.log('Dungeon mob events: /game/dungeon-mob-events.js');
console.log('Dungeon drop slots: /game/dungeon-drop-slots.js');
console.log('Boss drop boost: /game/boss-drop-boost.js');
console.log('Great Ruri event drops: /game/ruri-event-drops.js · TEST ACTIVE');
console.log('Realtime debug bridge: /game/realtime-debug-bridge.js');
console.log('Mobile sprite performance: /game/mobile-sprite-performance.js');
console.log('Remote player sprites: /game/remote-sprite-renderer.js');
console.log('Remote combat FX: /game/remote-combat-fx.js');
console.log('Remote pet renderer: /game/remote-pet-renderer.js');
console.log('Great Ruri runtime: /game/ruri-pet-runtime.js');
console.log('Legendary gear art: /game/legendary-gear-art.js');
console.log('Realtime class sync: /game/class-sync-client.js');
console.log('Social UI: /game/social-ui.js');
console.log('Realtime identity sync: /game/realtime-identity-sync.js');
console.log(`Client build cache key: ${CLIENT_BUILD}`);
console.log('Legacy Supabase realtime: disabled');
console.log('Telegram migration lockout guard: enabled');
console.log('Portable save buttons: removed');
console.log(`index.html: ${(Buffer.byteLength(output)/1024/1024).toFixed(2)} MiB`);