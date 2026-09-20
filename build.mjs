import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const EXPECTED_PARTS = 12;
const EXPECTED_SOURCE_SHA256 = 'caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts = Array.from({length:EXPECTED_PARTS},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const CLIENT_BUILD = 'v442-rune-fusion-20260921';

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

const publicDir = path.join(ROOT, 'public');
const assetsDir = path.join(publicDir, 'assets');
const gameDir = path.join(publicDir, 'game');
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(gameDir, { recursive: true });
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
  "items:auctionItemsForUi().map(auctionAttachMinPrices),"
);

ppaPatchRegex(
  'auction keep own lot art',
  /lots:\(INV\.auctionLots\|\|\[\]\)\.map\(auctionLotForUi\)\.map\(function\(l\)\{if\(l&&l\.item\)\{l=Object\.assign\(\{\},l,\{item:Object\.assign\(\{\},l\.item\)\}\);delete l\.item\.img;\}return l\}\),/,
  "lots:(INV.auctionLots||[]).map(auctionLotForUi),"
);

ppaPatchRegex(
  'auction art hydration helper',
  /function\s+sendAuctionState\(\)\s*\{/,
  `function auctionRestoreUiArt(it){
  if(!it||typeof it!=='object')return it;
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
  if(Math.random()>=PPA_MONSTER_CORE_CHANCE)return 0;
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

/* === PREMIUM AUTO-ATTACK ENTITLEMENT =================================== */
// AUTO is a permanent account convenience once the player buys any Premium
// subscription, or makes a single Premium-shop purchase costing at least 5 Gram.
ppaPatchRegex(
  'auto attack unlock from premium bundle 5 gram',
  /if\(typeof recordGramSpend===['"]function['"]\)recordGramSpend\(cfg\.price\);\s*INV\.bag\.push\.apply\(INV\.bag,items\);/,
  "if(typeof recordGramSpend==='function')recordGramSpend(cfg.price);if(cfg.price>=5){INV.premiumShop.autoAttackUnlocked=true;}\n  INV.bag.push.apply(INV.bag,items);"
);

ppaPatchRegex(
  'auto attack unlock from premium good 5 gram',
  /if\(typeof recordGramSpend===['"]function['"]\)recordGramSpend\(g\.price\);\s*saveGame\(\);/,
  "if(typeof recordGramSpend==='function')recordGramSpend(g.price);if(g.price>=5){if(!INV.premiumShop)INV.premiumShop={purchasedBundles:{}};INV.premiumShop.autoAttackUnlocked=true;}\n\n  saveGame();"
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
  'dragon60 death notice',
  /\}else if\s*\(e\.isDungeon21Boss&&P\.scene===['"]dungeon['"]\)\s*\{/,
  "}else if(e.isDungeon60Boss&&P.scene==='dungeon'){\n        const ln=document.getElementById('locName');\n        ln.innerHTML='ДРАКОН ПЕПЛА ПОВЕРЖЕН<div class=\"sub\">Откат 6 часов</div>';\n        ln.classList.add('show');\n        setTimeout(()=>ln.classList.remove('show'),2500);\n      }else if(e.isDungeon21Boss&&P.scene==='dungeon'){"
);

ppaPatchRegex(
  'dragon60 keeper card text',
  /Те же типы мобов · усиление ×3 · без босса/g,
  "Те же типы мобов · усиление ×3 · босс: Дракон Пепла · 27 000 HP",
  true
);

ppaPatchRegex(
  'dragon60 dungeon subtitle',
  /Уровни 41–60 · те же типы мобов · HP \/ DEF \/ ATK ×3 от 21–40 · БОССА НЕТ/g,
  "Уровни 41–60 · мобы ×3 · Дракон Пепла · 27 000 HP · урон 180",
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
  return .00006;           // 0.006% for 21-60
}
function v232PassiveBookChance(lv){
  lv=Math.max(1,Math.min(60,Math.floor(Number(lv)||1)));
  if(lv<=20)return .00003; // 0.003%
  return .00007;           // 0.007% for 21-60
}
function v232BookRankForLevel(lv){
  lv=Math.max(1,Math.min(60,Math.floor(Number(lv)||1)));
  if(lv<=30)return 1;
  if(lv<=40)return Math.random()<.5?1:2;
  return 1+Math.floor(Math.random()*3);
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
  'books 41-60 exact active passive random rank I-III',
  /if\(Math\.random\(\)<V271_D41_BOOK_II_III_CHANCE\)v271PushDungeon41Book\(e\);/,
  "v232RollTypedBook(e,v232ActiveBookChance(Number(e&&e.lvl)||41),v232PassiveBookChance(Number(e&&e.lvl)||41),mul,function(){return v232BookRankForLevel(Number(e&&e.lvl)||41)});"
);

ppaPatchRegex(
  'book inspect 1-20 exact chances and rank',
  /rows\.push\(\['Активная книга','0\.003%'\],\['Пассивная книга','0\.006%'\]\);/,
  "rows.push(['Активная книга','0.004%'],['Пассивная книга','0.003%'],['Ранг книги','I']);"
);

ppaPatchRegex(
  'book inspect 21-30 rank I',
  /(\['Активная книга',v232Pct\(v232ActiveBookChance\(lv\)\)\],\['Пассивная книга',v232Pct\(v232PassiveBookChance\(lv\)\)\])(\s*\]\s*;)/,
  "$1,['Ранг книги','I']$2"
);

ppaPatchRegex(
  'book inspect 31-40 rank I-II',
  /(\['Активная книга',v232Pct\(v232ActiveBookChance\(lv\)\)\],\['Пассивная книга',v232Pct\(v232PassiveBookChance\(lv\)\)\])(\s*\]\s*;)/,
  "$1,['Ранг книги','I / II · случайно']$2"
);

ppaPatchRegex(
  'book inspect 41-60 normal',
  /\['Книга навыка II–III','0\.016%'\],\s*\['Ранг книги','II \/ III · случайно'\]/g,
  "['Активная книга','0.006%'],['Пассивная книга','0.007%'],['Ранг книги','I / II / III · случайно']",
  true
);

if (!output.includes("if(lv<=20)return .00004; // 0.004%") ||
    !output.includes("if(lv<=20)return .00003; // 0.003%") ||
    !output.includes("return .00006;           // 0.006% for 21-60") ||
    !output.includes("return .00007;           // 0.007% for 21-60") ||
    !output.includes("function v232BookRankForLevel(lv)")) {
  throw new Error('Book bracket rules did not apply');
}

/* ======================================================================== */

/* === BOOK RANK CAPS FOR ELITES =========================================== */
ppaPatchRegex(
  'elite book ranks obey dungeon bracket',
  /function\s+v232EliteBookRank\(lv\)\s*\{[\s\S]*?\}/,
  `function v232EliteBookRank(lv){
  lv=Math.max(1,Math.min(60,Math.floor(Number(lv)||1)));
  if(lv<=30)return 1;
  if(lv<=40)return Math.random()<.5?1:2;
  return 1+Math.floor(Math.random()*3);
}`
);

ppaPatchRegex(
  'elite book inspect rank caps',
  /\['Ранг книги',lv<=30\?'I 70% \/ II 30%':'I 55% \/ II 35% \/ III 10%'\]/,
  "['Ранг книги',lv<=30?'I':'I / II · случайно']"
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

  // Individual guard respawns stay unchanged.
  for(let i=FART_ZONE_STATE.respawns.length-1;i>=0;i--){
    const q=FART_ZONE_STATE.respawns[i];
    if(now<q.at)continue;
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
   !output.includes("FART_ZONE_STATE.autoMineId=near.id")) {
  throw new Error('Passive Fart mining patch did not apply');
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
function ppaSmithCanvasize(root){
  try{
    var host=root&&root.querySelectorAll?root:document;
    var imgs=[];
    if(root&&root.tagName==='IMG')imgs.push(root);
    host.querySelectorAll('img').forEach(function(x){imgs.push(x)});
    imgs.forEach(function(img){
      if(!img||img.__ppaCanvasized)return;
      img.__ppaCanvasized=true;
      var src=img.currentSrc||img.src||'';if(!src)return;
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
      var dpr=Math.min(2,window.devicePixelRatio||1);
      c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
      var im=new Image();
      im.onload=function(){
        try{
          var ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
          var iw=Math.max(1,im.naturalWidth||1),ih=Math.max(1,im.naturalHeight||1);
          var fit=Math.min(c.width/iw,c.height/ih),dw=iw*fit,dh=ih*fit;
          ctx.drawImage(im,(c.width-dw)/2,(c.height-dh)/2,dw,dh);
        }catch(_){}
      };
      im.src=src;
      if(img.parentNode)img.parentNode.replaceChild(c,img);
    });
  }catch(_){}
}
try{
  new MutationObserver(function(ms){
    ms.forEach(function(m){(m.addedNodes||[]).forEach(function(n){if(n&&n.nodeType===1)requestAnimationFrame(function(){ppaSmithCanvasize(n)})})});
  }).observe(document.documentElement,{childList:true,subtree:true});
  requestAnimationFrame(function(){ppaSmithCanvasize(document)});
}catch(_){}
function inspectSmithItem(it,context){`
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
  `bindHoldInfo(s,function(){inspectSmithItem({name:c.name,kind:'material',rarity:c.rarity,count:c.count,img:RES[c.name]||'',icon:'◆'},'Кузнец · материал')});
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
"    try{e.name=n;e.n=n;e.nm=n;e.title=n;e.label=n;e.displayName=n;e.mobName=n;e.typeName=n;e.__ppaFartName=n;e.__ppaFartNamed=true;e.__ppaFartCollisionRadius=([22,18,23,27,23][skin]||22);e.isDungeonElite=false;e.isElite=false;e.elite=false;e.eliteVisualScale=1;e.eliteWindowKey='';e.eliteMode='';e.eliteExpiresAt=0;e.eliteHpMultiplier=1;e.eliteCombatBonusApplied=false}catch(_){}\n"+
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
/* ======================================================================== */


/* === FINAL FART GUARD DROP PANEL ======================================== */
// The old Fart guard inspect table had static epic/legendary values.
// Always show the chances that are actually active for the player's pickaxe tier.
const fartDropPanelRuntime = "<script id='ppaFartDropPanelFix'>\n"+
"(function(){\n"+
"  var prev=window.mobDropInfo;\n"+
"  function pctGear(){try{if(typeof fartGuardGearDropChances==='function')return fartGuardGearDropChances()}catch(_){}return {epic:0,legendary:0,tier:'none'};}\n"+
"  function fixGuardMenu(e){\n"+
"    var name=e&&e.__ppaFartName?String(e.__ppaFartName):'Страж Фарт-зоны';\n"+
"    try{if(window.PPA_FART_GUARD_NAME)name=window.PPA_FART_GUARD_NAME(e)||name}catch(_){}\n"+
"    var lvl=Math.max(1,Math.floor(Number(e&&e.lvl)||40));\n"+
"    requestAnimationFrame(function(){\n"+
"      try{\n"+
"        var oldNames=/^\\[\\s*\\d+\\s*\\]\\s*(?:Рудный берсерк|Пещерный воин|Горный хищник|Каменный громила|Дикий страж)$/i;\n"+
"        var els=document.querySelectorAll('h1,h2,h3,h4,strong,b,div,span,p');\n"+
"        for(var i=0;i<els.length;i++){\n"+
"          var el=els[i];if(el.children&&el.children.length)continue;\n"+
"          var t=String(el.textContent||'').trim();\n"+
"          if(oldNames.test(t)){el.textContent='['+lvl+'] '+name;continue;}\n"+
"          if(t==='Обитатель подземелья.')el.textContent='Страж рудника Фарт-зоны.';\n"+
"        }\n"+
"      }catch(_){}\n"+
"    });\n"+
"  }\n"+
"  window.mobDropInfo=function(e){\n"+
"    if(e&&e.isFartGuard){\n"+
"      try{if(window.PPA_FART_GUARD_NAME)window.PPA_FART_GUARD_NAME(e)}catch(_){}\n"+
"      fixGuardMenu(e);\n"+
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
"        if(!has)rows.push(['Ядро монстра','6%']);\n"+
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
   !output.includes("rows.push(['Ядро монстра','6%'])")) {
  throw new Error('Monster Core drop panel row did not apply');
}

if(!output.includes("id='ppaFartDropPanelFix'") ||
   !output.includes("var epic=g.epic===0.00001?'0.001%'") ||
   !output.includes("var legendary=g.legendary===0.0000013?'0.00013%'")) {
  throw new Error('Final Fart guard drop panel patch did not apply');
}

if(!output.includes("window.PPA_FART_GUARD_NAME=function(e)") ||
   !output.includes("function fixGuardMenu(e)") ||
   !output.includes("requestAnimationFrame(function()") ||
   !output.includes("Страж рудника Фарт-зоны.")) {
  throw new Error('Fart guard menu patch did not apply');
}
if(output.includes("document.createTreeWalker(document.body") ||
   output.includes("setTimeout(applyFartInspectName") ||
   output.includes("window.__PPA_FART_INSPECT_NAME")) {
  throw new Error('Laggy legacy Fart inspect overlay is still present');
}

if(!output.includes("function ppaSmithCanvasize(root)") ||
   !output.includes("img.parentNode.replaceChild(c,img)") ||
   !output.includes("new MutationObserver(function(ms)")) {
  throw new Error('Blacksmith canvas image guard did not apply');
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
    var out=[],seen=new Set(),root=null;
    try{root=INV}catch(_){root=null}
    if(!root)return out;
    function walk(v,path,parent,key,depth){
      if(!v||depth>5)return;
      if(typeof v==='object'){
        if(seen.has(v))return;seen.add(v);
        if(isRune(v)&&!/equip|equipped|slot|active|installed|socket/i.test(path)){
          out.push({item:v,parent:parent,key:key,path:path,count:countOf(v)});
          return;
        }
        if(Array.isArray(v)){
          for(var i=0;i<v.length;i++)walk(v[i],path+'['+i+']',v,i,depth+1);
        }else{
          var ks=[];try{ks=Object.keys(v)}catch(_){ks=[]}
          for(var j=0;j<ks.length;j++){
            var k=ks[j];
            if(/^(img|image|sprite|html|srcdoc)$/i.test(k))continue;
            walk(v[k],path+'.'+k,v,k,depth+1);
          }
        }
      }
    }
    walk(root,'INV',null,null,0);
    return out;
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
  function groupList(){
    var entries=ownedEntries(),map={};
    entries.forEach(function(e){
      var r=rarityIndex(e.item),k=typeKey(e.item);
      if(r<0||r>2||!k)return;
      var id=r+'|'+k;
      if(!map[id])map[id]={id:id,rarity:r,key:k,name:runeText(e.item)||'Руна',count:0,entries:[],img:e.item.img||e.item.image||''};
      map[id].count+=e.count;
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
      var src=group.entries[0]&&group.entries[0].item;
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
    // Process array indices from high to low so splices remain valid.
    var arr=group.entries.slice().sort(function(a,b){
      if(a.parent===b.parent&&Array.isArray(a.parent))return Number(b.key)-Number(a.key);
      return 0;
    });
    for(var i=0;i<arr.length&&need>0;i++){
      var e=arr[i],n=countOf(e.item),take=Math.min(need,n);
      if(n>take){setCount(e.item,n-take)}
      else if(Array.isArray(e.parent)){e.parent.splice(Number(e.key),1)}
      else if(e.parent&&e.key!=null){try{delete e.parent[e.key]}catch(_){}}
      need-=take;
    }
    return need===0;
  }
  function addResult(group,item){
    var target=group.entries[0]&&group.entries[0].parent;
    if(!target||!Array.isArray(target))return false;
    var key=typeKey(item),r=rarityIndex(item);
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
      if(!rows.length){list.innerHTML='<div style="padding:16px;text-align:center;color:#8f806f;font:10px monospace">Подходящих рун пока нет.</div>';return}
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
   !output.includes("Фиолетовые руны не сливаются в легендарные") ||
   !output.includes("PPA_RUNE_FUSION_TRY")) {
  throw new Error('Rune fusion patch did not apply');
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
  ppaEscapeSrcdocCode(`var CHAR_ITEM_ART_SEQ=0,CHAR_ITEM_ARTS={};

function ppaRegisterItemArt(src,scale,filter){
  var key='a'+(++CHAR_ITEM_ART_SEQ);
  CHAR_ITEM_ARTS[key]={src:String(src||''),scale:Number(scale)||1,filter:String(filter||'none')};
  return key;
}

function ppaPaintItemCanvas(c){
  if(!c||c.__ppaPainted)return;
  var key=c.getAttribute('data-art-key');
  var art=CHAR_ITEM_ARTS[key];
  if(!art||!art.src)return;
  c.__ppaPainted=true;
  var im=new Image();
  im.onload=function(){
    try{
      var rect=c.getBoundingClientRect();
      var dpr=Math.min(2,window.devicePixelRatio||1);
      var w=Math.max(32,Math.round((rect.width||96)*dpr));
      var h=Math.max(32,Math.round((rect.height||96)*dpr));
      c.width=w;c.height=h;
      var ctx=c.getContext('2d');
      ctx.clearRect(0,0,w,h);
      ctx.imageSmoothingEnabled=true;
      try{ctx.filter=art.filter||'none'}catch(_){}
      var iw=Math.max(1,im.naturalWidth||im.width||1);
      var ih=Math.max(1,im.naturalHeight||im.height||1);
      var fit=Math.min(w/iw,h/ih)*(art.scale||1);
      var dw=iw*fit,dh=ih*fit;
      ctx.drawImage(im,(w-dw)/2,(h-dh)/2,dw,dh);
      try{ctx.filter='none'}catch(_){}
      delete CHAR_ITEM_ARTS[key];
    }catch(_){c.__ppaPainted=false}
  };
  im.onerror=function(){c.__ppaPainted=false};
  im.src=art.src;
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
        requestAnimationFrame(function(){ppaPaintItemCanvases(n)});
      });
    });
  }).observe(document.documentElement,{childList:true,subtree:true});
}catch(_){}

function itemVisual(it,size){
  size=size||34;
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
const FART_SLAG_IMG='data:image/webp;base64,UklGRvohAABXRUJQVlA4WAoAAAAQAAAAfwAAfwAAQUxQSGMMAAABB2emYZoUGfiXygfbHRFpSiLEgwmGbduGQby6RuDs/4OTBTshov8TUFXFR/2w5nREhFTftjOld+VYBJqlGoEm226Zi3M0zbZV2Db9RwBYfQrQdO+OxEyyLUmaK4bitm0jev+1k979R8QEQFrtMnVGyZSJIJOy64OmfEuSZEmSZFtEou5Rfb93P/f/f2FEpJvQg3nUN0TEBPiWJEmSJMm2kHL+/5ebH1TVPGq+ICIm4P///u+f//jbxx8+Hs/H87fnx8cf/vqn54wjopIUlsQGKfLe5hwz3wOCAvHIz7Lfv369lvOYga3yOYyKiJgziwWNEtGLLj9GgChAgrYAI4rv76+ueDyG+NXmx+PgOIL8dB8VBRH0uEc/iOwFCW69tsXYrtfV67qWFZQg5IE4ItiI7IE8I+hRUL7Em5Yfuzbo/S4vCndJlHGdkFmRzHkLFdU3HaFc+3SvMsNiua+tVAvWwiBqDdEJEHps5AxVHkGC0LwgKEEASWA1RXKRxAIMzi2QRNaOpBxVC11JCpdSngUGsMYPRCYZuVlAMOgIUfLjUZmz06pcyz9RkjgmKsS9VsiMjAwSu1OCndGhgt6Ze6mENtgNYTBUSXIPyMuwhFjuyX2LouN6ngNzbVlIwDakfx6Yc7k2jXX8S6TUAcGWgBu7lCAiRgXG4PMIexFBWriMUpAxz5xjkFL1L7mGsQEYxBWkwCQFkITztFl2JwJCzDWK3G+tZTCvSNolCVqRhKLkbtMCAZh7HhILBGEEqqaQz8t7pskZCYOFiyuYJSQJuBjgjXXOVK0acMn7IpL/cP5wEJIlgEnpyj25S5o1T1vC8CKTuvxTyV+2D9mtSTPXAN4AFpKRvDVUghsbK+sCYR3+wxeLXe6XSQKCkRCBgXkbFIbytwdu+6JlCRRj7F9/srzH5BmgiDDaCDBzk7gr4BmcgPOH52772t0qQzT/M9HRPgzrMtd1HkLaygiIIuRcFw2FgjCj2vKYB69qK4MAcw6RP56PIUKLgGD5MYmVLEFBRaFx3ItKSiAJzbLC0sja7PH5EAXVjXAjFknWdCVNbwLpmb4hiiFrCk0mZ+aae9O37xF0wxYkC9NMTGBAJUf3xfKzBETTnEu7fP6TIJRAmVwSZDmuwKygwwg5A68rLAQDCDS0w/Kchv1Tf3A1AAlsCYKAg6sksj4OmOdEv16xDDWBQXycPOeaGbeib7wBkaigsBmZFSDtzzg5H7PX6/srQv4nGLtM7PUxoePHglUZ8b+hWvIcTe7153Fnzml/9fULhIW57si7sbBM3rEWYUIO5Yy2dA4Kk8YfwhGv6LXQMvcdvzfmmnfejZWUjNUGaAF0wsLigZqFywVrrR1hr/V4B+v2OfJzW0NBIpjO6QzudKFs3Ncyzde5To9g/ssegw2h3kjGaB4doAWLbtZkskvTjT2u7Y+WazIXhi0mQFz3b4+j7lZBwPy4YCLzx60Pgy7vZmAY8X5rzJ/Pgfb7xfL2f7RLM9L6X855d+s264XCbkWBQDQFka3jfw+49vW51820rSPmnHWLHfnD+Xcr56BQYCiwEO5mkP0T2t3riiBMRs4d5Md8bA8W5j0hsgSSuUjRYkB/qJ0qIGMZuQ75f9lc5/NxbUEkk6CgyPjYNd4XGtrN/Me9UO771mERwAAkigj42AstECJhPjZ2tP6AXRLLMM+Qa07NhJCldoqPLcC0CPNrGOT3zM/DeuWjiEINsFYs9sdrbwix5Nd5zx/Ocx1jmGvQq8ARpYTdjM0/71WNsuwCm17z81ixXNth3TB7lWfDPHOMtRtV25+uWnGqJZ67fR4Zs2Fl6PKXYR9o+vd/DAFeLW7bwyImqOyy+X0Y5uP8OvRavjeRwAQWqHoESQSEYd59aH6e5xCjQfPXLUwIcVs8gWXEzx0FvTTTh1znGczH0E+CBkCkFkYIFyygMPJ7Yx+mA7sshCx/mUFNxgDCwgEoZIW4hgnbB8La5Q+X+bFPTcemATuCtaoBhJGZs5mo1xjSYyG6tfy6vpC7Cp6H6sggeVsh3efM/8OghL7l44hlYpzw8Tz6fJ7RJCvDHsjv/YkSka8tP1CRVP3rgJ7DwErSQa+hS0djPRbd/rIRtBsGOdOEBjaLUlDKjyHvskue6y/IdZ5zH8rXHFbeb3Krx5R7FmE+9yG7LP9l9mjeRVjut7OjfF7O9kfPtX7bB+kmZI+LIOlWCXlvr/tyrj8aYfTlWocIYb1Vye/Mn85eTbtYFNGX/KfVQYmxnoJuHaXbXsP87XLNdZf/slNHkLT+zSDEXvViPiZ6YJguf58hZF1wmQAtDBOve5dfsy/X7VO3vnzPNeAK/Js1XYZbNx0dQ8ePIT/ne48JkdMkDHOda5KP8xw6iqH8bfl1t2fQEEAu/7awYyx/mnwMg6G+PbPb/GGQNw9DruXz9iHvCQrLf7wYsU+QhkEt1y6OvdhRIV1+Hqoeu3VZa5h6JQnzTMFSyqj05Z18jV65d7sHg7lOIk8BRP65R2b+MJHv5Q/rVRgaFuRcRxKlkg5RwrbHDsm9h/3F34d8zT0IuefcfBwEIdajzegP+hLNH4+cwx7/P/eQmV8j97m3o9+uOWN224dtPwzza9kP89z8t9NxbvPcZtsNo1752Av98P866rAxzK/bRnW57rIv+bG67FPDhOmDIvmf62Z77ML8dcfK2bFtzB/Oj0O7EPzPLp9zju2PcuaZ+8Z+a7eO5vA1f5mOLH878jF7/DodsuPMz9E+dXlO/nbmD7utD83XdVi77DHY0eXaI3883/d4b5f87XLvcQ6iR+oiGnt0bD5usH3T5ezVdLHH55nvFXRndx+ryLlt7tVlJ4WJGSzn6Es0z45gvm7mukuwjdnGbj/OPV8Xc/bhc0jubYgxu3T18/ztLrm24+/r6DhDJs8RNsy59WH0J13edezvKnTJ35b7Dvah6Je518vo23QZC+Wcr8NsEyw2v8bIjzMd9FJ+z5xVKvSY72Mzc99l87xt03Hu2Fwj7NbrPv/+/euf/6e7nJuz8j3k40JyNpprt0H/+qcu2Yd92B7NLvP+MCL3YSjoECLvuUjOzOfNLs9tzsy98o75us3XjnePuScd131Auux4brCN+cPo+Njx45DnhHydffg4dptzShnbbTvOPszPRdCjC93mx10iQu7zDO1y3Ziv2449IsrZMYk8x27bXDOb74U8syOEtl3m3S0Mu+xA7h1fcy0ztk/XvYxqrhvG2HZ7Dvm84xwpfVEH8pfRLSqEOSva9ds77CiqBFs66vhalxoilN+DkXOu2xHDbmO+R75Xnxgi5bk/+PNhZv4f7sV+yMchlr70pX5iMz93GXWkyjbJO1XOjgjK7LJDX9yrdEzOzTbk9xhzzTtBCMIO83HHf73ZfBxR9Bg2z17P+TrX2LGJ/qzd3rtdIz/2um57lW6bn4tml17VoU/zDrl22UUf5l0hqHmPjpBGeaaovHfY61op5b+NuefrMMw9tb74uKGL2WXH39ZlX9Dje+7txtAl30sk182zLjuK8vvY5lqILrtsos399nvyedOB0GFyrjIUbNjlnl2u5fgPdwnpMtdd8p53ENlx7eg2192gv9v8WLmvy478b/pgy1kfrtts86w8u+3Sbb7ucd2ZEKL/Ub2e+Vw58w7ZEcxsNufWp3O3sEElU0beu5QzUtCxD2e55mvyH2/zNel/2mtdroXlTHl2iy4kM4xMlx67dDG/xvz5sMvcN0TlGUTMczv2QO6brzsI22X2DXU5k59Trh0Y8mve8+yogopp/nLOco5E3fJ55o/zl8NmM3I/+rLBju1C7tucEQZzbpcRY3ZEt46Pc3Sx0OuazyG2YUJBVBc294T5Xuqyy3VLs/3PGdUlv8/nuin3ueeZe6TqX4Zhl41l5uz42k/Zaznzue3ytduZhGzeo7z7IWyXHTHYJcJ0VL53mXdIrnnP/3JfdgjLddkR29zbBkGJkO2V+17nPPeB/zkb4fg4jPlevgdBBOU99mX+dhG5X4SxKfe+Ta8x5w5Mote5vXpsl43xCvpdmDP7k+XrZkcIEYTt9nWPX39VBKPbMBbMELu1T2chOUOI+mFQn8rwnQB6zZzB3PNcr9k299wrue61E0XRjcGFYDfagQ3Gjvy/zbWjy/yndfw413wegl4dsdmx7dhtx1x36cOOjX04r+iNLp+nOcNumHvHs1vHfT5vW5jvkV9ZhW2PLmMQwhg2dsFedtlmbBv0OufXXAEAVlA4IHAVAABwRwCdASqAAIAAPk0aikQioaEiMnusuFAJiWQAyyQArkeZiIPlPvC+GZPuuWMNb89EHmAc67zDebv6M/7J6gH8x/0XrUepl6AHl1/tz8JX9y/73poeoB//7YvyV+3Pcj1ms4fXdqHfIfvx+1/vnoX3v/EbUC/KP6D/vfRI+f7Pza/9F6BHud9Y/7P+D8anUp78ewB/K/53/0vUn/WeEJ92/2HsA/0f/Efsz7rH9d/9f9R5zfz7/Jf+v/WfAL/NP7l6c/sv/cj2af3F//7hI6h67nZq3lZqMwRYNCaGg8Bg81bLcfruiPRhPIUzZXL2R7M3EMzWG403dTk8k9KAhjxAbyevILLVlIw+1GvAcjuthrxJbTzr1J4ACliNViTCT5qI7JgyYV9tbSBSGHNY4SwnogDBfndtAIaUUa4pTBbUVLOG119JxW7C9vt7o0sa6aw4ddA2/ashpiSgehvlylbmR6mFl49oXBTOWfGtlhQLCG/qXxfJ+ES2Ph1zY9BpGqriynYCnKn3BPBoS66wLvHw/ojTQId9HYSxdJLkBoWdyp/YRrn+KNIyHG2QgR7hDOKIZp5Ets+90vNfh7TvpoSYGUX24sDZ1VZqxUmawrgB9PPogxP1P6hbbEgZCT12sGHv30s+ey0QwDZqfV3pE1LpXvF1EuphHkZOe0WmTNid4kqsNhUmY1CPXr3RP6WE1363Lj1Z5sGa0LYJzT5oVqzS4fqyySGRogJP+bhoQM4h8d6vcZZbYUdMqsYVSh83TPzf7noAAP7//g61sfcdlSaXQOOQfyuNnHeA6uZXSrVnTXWedfgpWEu/p3v6XwROc7JW8D8TYlX/YPleOKoIjvJkBA55xRPLFpo+CN9y9ntRxoz91RZ3nDBiwTvAf7pr9C+yR2ffzc80SNkQ0upVq8aVdX83pB5mINIIJ89jH05bt9kCpYXW5vwvzUZf5B65BmS0f8h3r65vAnTZJ9uVJqSAerc6WJqfm4elczE4dsMurNOozk9Q6k1x0+FqpTRj8gd9xfQXR0kgwvEuxiGmdWbnUxIsSi7+pW3NWikUDIUWj3I/cvQVh4Cv74Fa86ir0vAS/XZOF35bt7xcoNUtJsMNzzbJ/Z2cMGD6f6dPbZopevkiTTT4KYP5VUAdOaRHGCvqBTizfBehUpvvNWZwsNBm6h+d2o2uce5x+bXnqR6GarOLWvHxtWSfRjNzgnIfTZMXeF3xBDWih/929W+bRQ9yiw7Nbc2MmSJAifEkq3I9qWNW2K/B7C7r1+JeRxindzWiwovIKJUwVNUQ0UhH52cB1oIKhtiZjazmU4X0el0NjePD8sTVJ0tbB87wWqVX5gyyJ0H4F8cXQnKwfqmBq2EXn0EMoe20Et1/7aYdHZcIv7qZqLtlOLYZTg6BSmT6rHIiDC3NbiZ+kO+qm3TLguDNAEdjwW/meQnDe4b5o6Lzdx8b2515CjczKwWPufN26vvwrrLwnKXxa2QcHJ86uq+/XtY7fKpefCRO+DDaFIhbpUH1g8FYCtCbDGIoFmkuwSyZi1SZ3XIS2ubrZn4ult3Lxel6Q6mocGksQPTuqpn07QxYxwKxfqjRPAPb18NR/DoFARDUatETZmyZM+z/t526pR5AP1jypmFk1QWMNJIbmPSjw588H1yK41IDYgDOlRtCwB3wN738/Yl9BIfI1GeyK9y5zub5sThcFOjI354XGQL/v/oiigdX2iJKI77Oi/xPvsDRNFDDNWot9uZ3nR1ZWz3CcyQf/LwNIqpGbrmFn1ko0fX4mpnwfdbV/kddIq2IWTsNxOn2UdUpW9tXLPQjwFYGCO65NIhm+jFyqbKbh/Y8Cvmv7csNNf2p/zgHpmf/I/pyEn4oRly81qwBOubksdZOuVehWSEirU6Q2sD9sPUS8CDtm5l+NZGRHaMGYW9za+RoxUtoApNjrgHWCyDls/9HjRsD1hzxkS88B/fDPRFpLmZpTD00z/wvb8gtD2x2GRohRwGVVs8JOaaGE9dfvUg8igjJCBG799pQl9qucpDUYY5LrMevFZDOTlSbbO/WSKDE7V998q+iyrqNO6FVeA9fTQs9yfgmVh5x2OAvzdPYLyFZ9Pb76IYDlJX7o9WzV3iKKlndXo1PKuKb+pvW+vi7XE0ZGxp5SXn0zdHl++Tr3ALWdfpxSLftB9/E6rguqmveKP+ckYhPJzL33wARB7A8I4bTT25Six/FU2Sze0Bw9NddeeptU7JcYfCEKs+TyZRP8GRm/ixwwX+znB2HQefGkJTO8Z9KCOwdh6p27MuAAqiSSYgTfOXlD+AGJxvjRVvN+ts7vpDpgVZJhosbyJxIi8I/p/5ytpPECv0dUYTu2/YZVC1GXeng3HYY09mQSDsQ4KOUUcwC6BA6o/HCbSuqjMwSZaFrnToSlGoZ7rmqh2EfoN1f6sPB/UN1bPeXgxzvX3S1DdlrmZSyDxchxB+E56QMbUr1Pcz+d5AK0kAr6VPXSNqW7+AOnm5TrYK+jdxycGWKAuv1kBBqFFxjpbw+D1qLwEzTrJYMUg9IMRvAjpMKXc7J0WYGqqsLq04b0qrtpdK+93efx8XxEYgQr8edZXrk/onk7BJM+HTJ/FZDPu1oUZl3OMsojOQtnqepqbl0E4sSP/oEEdEbL8bOG6sXLIWseO9b4r8Q3rpkct9kSGcBXAgiBB4wbSUWHEmMeJLPkWDKXEMuws2KEVtuKSVrHh8UIGD5CacxlEbvMCIMcC5hhhVvxE9bXdsOXTN+R/JZphR6g52pTqDu7F/VlB1ckyqyz4NmwQSAP46M8w+X9Mjt2j3VVihr6V3VQhbGTFaDWvdJqfA9Yw2mTwLi+hMlkduaHEcYzUTZG0iRDc68CSf0u9wjHbA4XBKfs+uwU+ColwDtRCv8WJRHqOYibGIjGaBkEb8XUz7aGhAi2wLV3M8RVsJune3D+4PC5r+0sfCWE5HR3j+p+Zuk9xGn+Fs9XwzoMHmQ7hTHwNkX2txfWcAJExb2rfFS/qeetDt57zv6krac90zqOGjlJr2864HxREKxwfn05+7+QPyx6rQz5cwughyowcvLGxCfJZVPic1Eeq04xnt8gu/zUskjqLf77iZbsU0VM8nTxVJdGmWvzJ72c+3gaYGa1fvKUkQgXa2mcw94R2a9/Dc/Ocpe3DTQiyso2xXm2I+D+6pKzsYi/+3itN1K+UMAr5XPx8gcNgwydNoCff/dHblrBeLoioz0SpQRYL0Monm8D616VHzv5vDuS4/MmdYOOFShhhqrdjp15FWZZqRBtH5W2ez09sL4fDKFWM8eQgPzNDScB/N/HSBdrZgrWMIB1iRL6Qx/09rtGIQYmvTMLWcBk6yNo7ee/M1YsU7MmmDOcQZqJt6cOWH4ZqvXzD5JFkHi5xG6ztVmcf8q0Kxv+ZUOexTGhD+rerSaLsO+NPmWbyFMaxfDxKJoxyecEzRP6PF3ofvpnU2rjj6gNf1P6ykcayspJ/HyeUtXO9GBhSwjhEfqt98Sq1rBOPS338BgfJMQOFaooTJCS0Bq1ClkbO+FhNqRO1Kdg6HsinvXQ+jiyrlQ5203mvob6kKsA7gv4Gz8dyotGSK1Xx2knAZH6QNd4WiABVWvbt+rF+we5+Ye7NBN9UbnuG4schUZLRViK6gQSTo1vqMMbxBncrhn5nxL1xoCHSd3FwF2mUKT5l+SKn6YM5Cl2ocf1aASQZuT+DctUrlIpyJqzgLUYvXMDTrsp2cwxY+HISnyA7BRa/IUKT2BAaKedrLu3JhVmW7VPXJxOovAxbKvdOADijTnc6vIRTpUMKsJo8YiylGZp60cHo6WoIh27gSu54NqEwdgjPs7kWZha1Td7P4d39GV2/Q+N/7fra9qaaBAJtZ1KT8oFumMAxpxOtywyUe14rEbLadEWeQt6sItEsCv7xyZotCxnupYCOyiBNGWV9l2CEP2+3RbrkFbIfu/8ZxQmqRU2vN7k7gNVKYHDTN6gNgIMhsArL7hTpxAbHjxxoLaeFmeQJOj91vEj/XUNVzAEqy+8F/+WO27F/i71sGO8UrhgsRY4NMcE1VAKTQILbcQNCfw8XqB/oB6LnOXSXCWw3K+Ziy2RCZqvDkmJP1HumXDEtgxc4iumfeBZWH6ZK4Fk9rDy6CLZYlckOBl7Ygl+8nNEGGTYcNTCn0QZl0b4CbN01HuzSUImPpG4vXfCOTIvVJvLFyY6UcGkLXS5KJZsJVdsH+rje0FELOsuy+G6guXdYL6P3a94q9FHrGhaQ8GVL+LiJe8N4PyO7b0MinxWTutJGlm9Vtjww7Kpyac1iJsPoJ5kj3zEEAt8qXfsaXn9FcX+7c/HTknnZkKuKV1AolXqfCgKVCP/QTyCL1x35+nFnSNSBzjc5Cp67mb7kGhJGnTjeAqAotWpN4m4hWHVDcbsyzMTdehEXQOFI/h6hahOEjT9rooPzBrgVlV9IJ0Y1zV9cdfSX6f1hR0Be1PHQtXzT/sPYz5CU/caCmedZCHcDObQ8Njy8IOhRf7E2lf8WU1tVtue+3qBfTrHQE1ChWtAbd2TafmcZLKMRHABalAVhbDdwmmKV0KYfCY1Q4ZAFSBTcHdSlsSqR9N2h//pc9Q07Jr/h5LlX9lEtpr+kjuymL49Lv5wlm6010D+DxUIal+l2zFuq0myyW5+Qd/7RGia7opOQv49wmN/MpJyQySon8eijNch5ZcrLUcsyXPYG7q50ESVN+xV1douPo1o5wYb1s37T/5MQCwHJcCwpnNaUJELkPxOVQwkmfRItFh81OSEn9O/dNCncpDUfsuPq4w/y/mmzx+yjBRnLyws+epolN0SXj8qPbZPzJzSj2o6dTd3eyvO+PaqvevLAeIQB34TEYwfddepnUSw9NOUHND0M0XqCi6R8IFQWe7GfIQl9Z4DfZdjAVJ8yAnigkn7sFLE++/spfRxKdgCmm7Qjl0Z9QZMmWGABC4cnLideuS18BR3MARakrywuq/Fcoje78vUAWJXuB72dlQjuymGTaJwAmWwTNj57vg58NPbP87zfx1KkWSVd7Jcq43JK/KlKwI06BKQv0g1EQ/R4FIWhXG+D46rDKSKuRqvvSmJW+ogtjarSb/m16geJJXOY80DINE1auAug57nJjq5g1x0tDEEyAqKsAnzd2gKwIzYfYCzpZA+YJXDFObvHZvPbKdtaZaVEELhzY9T7zwRsDCUKvjo5JGbhY2AKuz2PEB/SL18aq/h14MiBWDTaIaGoCrEbhlyzEm0A1W5pxQ71nqcMOR9NEQR8JdKHCSMGILewsRQMsHdA8tk8/Gz/JfptDO4lBG04Pb4d2ZPEH2qDTFPnZrhpiuie+RCCKFQqtGIMtn5qWIi3Q4FCgWNIECnKuhVOrw6A0t2yVC+KjHj1xP5AtQ1q+O0aTZvG8kad4yFVgsFjVY0yh5yOr6Y/2aJ6JEUtXRwGBo7+Q1UOXWKfMFbau8tqo8kmVhIDUy498EUbFvAkvS2U9uaJ1yUXzlEBj1HwxAbSBZ5sUSMZR6ZYGC2EisB7AVNhqmv4LkerTsA7Ni6xeuryUcKJoEbq1CSTrqy9NjF2rvDo3WTJYoNus02Hu3GWDCwLg0OLgf2gf4Nn4CyebTbj0XurOgQbrqZ2QBSKIqYAcT16PuL0nM52O4aVTf91USQFil9D6Gr1zs5CJ5QMFg1YY8hTqaUc44aw/wAlKNazZrOuWPbwNDDJ94/CFq7n70gyfEc/e16sm8gRvN3X+EqPBBCi7LftyNlIaCxf+g6tPkSqqWVdlNaSIFFuafQ9JuaYZ1jQa1Hktdf/nMOeqwRyWscN5zs4iLKNvWSvoo0u5IQUT9bz1ocrT1lWMTiWOXTMxDgAB+XlYov5DEoeopDmuCXnUJllVIlvElSfHvpFUIbV0FdzT2ImUQ7C7KA4ttC4BG6Fhe/JEx+N/AK56/PjUN3gR4AAXPUqfj+Oc9Lu8e8ssm0eZ0IVhOAPMteZDtKg2CfqvInoNqYt0jxq/gxv26TsYXjGCWmZUHcRP6jWNAUvNeJP1GrXOYqNiUkEaeHfmXrRumUwsquzbPUfJG5BFihF4ia1gxv7wM3hUazdKj8ynEwf/zpvIvbhw6hs4Vq5xd5vqdixJDe0GSTshjNAEEPQ1m3JspnHZUacFhbiLX8cU9E9rgeVBfj/EZeX4L1ijhnQkfal9oRjH+o+YSBmC9qK30+W2rbn0GaHCIOd2zD/baqSgRVATymD8g1eTwji9WIvpg+BDVQr6Q6xruXG0lt7fjQ3E4lZlmDVix5iWGDFSYVH4TlydPx/HmvMNLBJxUBDsbmtpyMH6cjhg2gcNVgLXLPH4BBC0nWsox+oaI3m6frsDDDM0NsKHDqchfVbV3VMAqXjNDUwn8oPubzAY1/bnYBuBq9y/qtVbEVtm78f/3UMSz9/e5n3RBxF//8cJ2PEn3tfCMi8R8HoPLNEChnR6BmWQ2yos0voQ0wMFgyJ+H6tk8VhVi4kpldoNvwktwHctY6M5FdVDwmuRi3+I2HYVzogfPrXmFSfsv6uA0+PyHM79Fg0rCeV+UR1uGRlW/1CpnPcYYVoxd7FvjC8F0QJ9rAnqNoclqfJcPleD9sPNx63d88jZMs1T7VRhSwrVh7//HT8qFH+qz1dqLxpFBFGH23x/ls689QgFa93PjjXnQwK/BsduK4pl2UT+bIXT6xiMPcn/2r+lQRfyIDjCx0nl/wQMV4mzRbSLYd14EzCqqxnU2u78TPKph5RML822jfqIb/qCEwPatRBA93rSYYjYaglz4mjTDSfhUviYtP7k5mtuPokpVr/A2l9aa6k7KKEN8VGKL0cTsZJoah6mz2HXu/gINycuWNf8JY6v4wnpExMAdB7tcqyeM+TsLNlvGRoO9PQjJOBBRWD4oAeoUOBrHs5qIKX+3q0bfIOPNf14XR+Jp0KsGc/mbYwxfQEw+o29tKQRX5YuN5wYCOd6Low6J7HnEwdaA8PZp2Hak2VWIigR7SHZhfI/8xL4O7wGsMdLO1eNkvWhK5VezyU5ICOHBRcgNv3/p101d7nPDGYthlf0fMg48492uJFSZu4lp9JkLY5evqguByocbtuqMpGuauakQCJLz9NYFKm8LF/cIDeqYzToTgdare5RlNyo43l6hyHR8LztwQ391KkptMRoh/h9E6R+k6kIjNzVwkHPUw5cnJaCt475wkM1FWGehgrNBsQjuPMeJXy5tq2ai+9XatJhQORbCloZrKM7sx+pOn9SKillzw2AGXLCkMIvqEfPvaSssKQi5ed6yOUxXNvb/EFLrpYjo6FWFzCKqNZmrV+k/ty4Ake0krcDaOuAA';
const FART_SLAG_INTERVAL_MS=40000;
const FART_SLAG_SELL_PRICE=2;`
);

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
      var _ppaSlagArt=parent.PPA_FART_SLAG_IMG||'data:image/webp;base64,UklGRvohAABXRUJQVlA4WAoAAAAQAAAAfwAAfwAAQUxQSGMMAAABB2emYZoUGfiXygfbHRFpSiLEgwmGbduGQby6RuDs/4OTBTshov8TUFXFR/2w5nREhFTftjOld+VYBJqlGoEm226Zi3M0zbZV2Db9RwBYfQrQdO+OxEyyLUmaK4bitm0jev+1k979R8QEQFrtMnVGyZSJIJOy64OmfEuSZEmSZFtEou5Rfb93P/f/f2FEpJvQg3nUN0TEBPiWJEmSJMm2kHL+/5ebH1TVPGq+ICIm4P///u+f//jbxx8+Hs/H87fnx8cf/vqn54wjopIUlsQGKfLe5hwz3wOCAvHIz7Lfv369lvOYga3yOYyKiJgziwWNEtGLLj9GgChAgrYAI4rv76+ueDyG+NXmx+PgOIL8dB8VBRH0uEc/iOwFCW69tsXYrtfV67qWFZQg5IE4ItiI7IE8I+hRUL7Em5Yfuzbo/S4vCndJlHGdkFmRzHkLFdU3HaFc+3SvMsNiua+tVAvWwiBqDdEJEHps5AxVHkGC0LwgKEEASWA1RXKRxAIMzi2QRNaOpBxVC11JCpdSngUGsMYPRCYZuVlAMOgIUfLjUZmz06pcyz9RkjgmKsS9VsiMjAwSu1OCndGhgt6Ze6mENtgNYTBUSXIPyMuwhFjuyX2LouN6ngNzbVlIwDakfx6Yc7k2jXX8S6TUAcGWgBu7lCAiRgXG4PMIexFBWriMUpAxz5xjkFL1L7mGsQEYxBWkwCQFkITztFl2JwJCzDWK3G+tZTCvSNolCVqRhKLkbtMCAZh7HhILBGEEqqaQz8t7pskZCYOFiyuYJSQJuBjgjXXOVK0acMn7IpL/cP5wEJIlgEnpyj25S5o1T1vC8CKTuvxTyV+2D9mtSTPXAN4AFpKRvDVUghsbK+sCYR3+wxeLXe6XSQKCkRCBgXkbFIbytwdu+6JlCRRj7F9/srzH5BmgiDDaCDBzk7gr4BmcgPOH52772t0qQzT/M9HRPgzrMtd1HkLaygiIIuRcFw2FgjCj2vKYB69qK4MAcw6RP56PIUKLgGD5MYmVLEFBRaFx3ItKSiAJzbLC0sja7PH5EAXVjXAjFknWdCVNbwLpmb4hiiFrCk0mZ+aae9O37xF0wxYkC9NMTGBAJUf3xfKzBETTnEu7fP6TIJRAmVwSZDmuwKygwwg5A68rLAQDCDS0w/Kchv1Tf3A1AAlsCYKAg6sksj4OmOdEv16xDDWBQXycPOeaGbeib7wBkaigsBmZFSDtzzg5H7PX6/srQv4nGLtM7PUxoePHglUZ8b+hWvIcTe7153Fnzml/9fULhIW57si7sbBM3rEWYUIO5Yy2dA4Kk8YfwhGv6LXQMvcdvzfmmnfejZWUjNUGaAF0wsLigZqFywVrrR1hr/V4B+v2OfJzW0NBIpjO6QzudKFs3Ncyzde5To9g/ssegw2h3kjGaB4doAWLbtZkskvTjT2u7Y+WazIXhi0mQFz3b4+j7lZBwPy4YCLzx60Pgy7vZmAY8X5rzJ/Pgfb7xfL2f7RLM9L6X855d+s264XCbkWBQDQFka3jfw+49vW51820rSPmnHWLHfnD+Xcr56BQYCiwEO5mkP0T2t3riiBMRs4d5Md8bA8W5j0hsgSSuUjRYkB/qJ0qIGMZuQ75f9lc5/NxbUEkk6CgyPjYNd4XGtrN/Me9UO771mERwAAkigj42AstECJhPjZ2tP6AXRLLMM+Qa07NhJCldoqPLcC0CPNrGOT3zM/DeuWjiEINsFYs9sdrbwix5Nd5zx/Ocx1jmGvQq8ARpYTdjM0/71WNsuwCm17z81ixXNth3TB7lWfDPHOMtRtV25+uWnGqJZ67fR4Zs2Fl6PKXYR9o+vd/DAFeLW7bwyImqOyy+X0Y5uP8OvRavjeRwAQWqHoESQSEYd59aH6e5xCjQfPXLUwIcVs8gWXEzx0FvTTTh1znGczH0E+CBkCkFkYIFyygMPJ7Yx+mA7sshCx/mUFNxgDCwgEoZIW4hgnbB8La5Q+X+bFPTcemATuCtaoBhJGZs5mo1xjSYyG6tfy6vpC7Cp6H6sggeVsh3efM/8OghL7l44hlYpzw8Tz6fJ7RJCvDHsjv/YkSka8tP1CRVP3rgJ7DwErSQa+hS0djPRbd/rIRtBsGOdOEBjaLUlDKjyHvskue6y/IdZ5zH8rXHFbeb3Krx5R7FmE+9yG7LP9l9mjeRVjut7OjfF7O9kfPtX7bB+kmZI+LIOlWCXlvr/tyrj8aYfTlWocIYb1Vye/Mn85eTbtYFNGX/KfVQYmxnoJuHaXbXsP87XLNdZf/slNHkLT+zSDEXvViPiZ6YJguf58hZF1wmQAtDBOve5dfsy/X7VO3vnzPNeAK/Js1XYZbNx0dQ8ePIT/ne48JkdMkDHOda5KP8xw6iqH8bfl1t2fQEEAu/7awYyx/mnwMg6G+PbPb/GGQNw9DruXz9iHvCQrLf7wYsU+QhkEt1y6OvdhRIV1+Hqoeu3VZa5h6JQnzTMFSyqj05Z18jV65d7sHg7lOIk8BRP65R2b+MJHv5Q/rVRgaFuRcRxKlkg5RwrbHDsm9h/3F34d8zT0IuefcfBwEIdajzegP+hLNH4+cwx7/P/eQmV8j97m3o9+uOWN224dtPwzza9kP89z8t9NxbvPcZtsNo1752Av98P866rAxzK/bRnW57rIv+bG67FPDhOmDIvmf62Z77ML8dcfK2bFtzB/Oj0O7EPzPLp9zju2PcuaZ+8Z+a7eO5vA1f5mOLH878jF7/DodsuPMz9E+dXlO/nbmD7utD83XdVi77DHY0eXaI3883/d4b5f87XLvcQ6iR+oiGnt0bD5usH3T5ezVdLHH55nvFXRndx+ryLlt7tVlJ4WJGSzn6Es0z45gvm7mukuwjdnGbj/OPV8Xc/bhc0jubYgxu3T18/ztLrm24+/r6DhDJs8RNsy59WH0J13edezvKnTJ35b7Dvah6Je518vo23QZC+Wcr8NsEyw2v8bIjzMd9FJ+z5xVKvSY72Mzc99l87xt03Hu2Fwj7NbrPv/+/euf/6e7nJuz8j3k40JyNpprt0H/+qcu2Yd92B7NLvP+MCL3YSjoECLvuUjOzOfNLs9tzsy98o75us3XjnePuScd131Auux4brCN+cPo+Njx45DnhHydffg4dptzShnbbTvOPszPRdCjC93mx10iQu7zDO1y3Ziv2449IsrZMYk8x27bXDOb74U8syOEtl3m3S0Mu+xA7h1fcy0ztk/XvYxqrhvG2HZ7Dvm84xwpfVEH8pfRLSqEOSva9ds77CiqBFs66vhalxoilN+DkXOu2xHDbmO+R75Xnxgi5bk/+PNhZv4f7sV+yMchlr70pX5iMz93GXWkyjbJO1XOjgjK7LJDX9yrdEzOzTbk9xhzzTtBCMIO83HHf73ZfBxR9Bg2z17P+TrX2LGJ/qzd3rtdIz/2um57lW6bn4tml17VoU/zDrl22UUf5l0hqHmPjpBGeaaovHfY61op5b+NuefrMMw9tb74uKGL2WXH39ZlX9Dje+7txtAl30sk182zLjuK8vvY5lqILrtsos399nvyedOB0GFyrjIUbNjlnl2u5fgPdwnpMtdd8p53ENlx7eg2192gv9v8WLmvy478b/pgy1kfrtts86w8u+3Sbb7ucd2ZEKL/Ub2e+Vw58w7ZEcxsNufWp3O3sEElU0beu5QzUtCxD2e55mvyH2/zNel/2mtdroXlTHl2iy4kM4xMlx67dDG/xvz5sMvcN0TlGUTMczv2QO6brzsI22X2DXU5k59Trh0Y8mve8+yogopp/nLOco5E3fJ55o/zl8NmM3I/+rLBju1C7tucEQZzbpcRY3ZEt46Pc3Sx0OuazyG2YUJBVBc294T5Xuqyy3VLs/3PGdUlv8/nuin3ueeZe6TqX4Zhl41l5uz42k/Zaznzue3ytduZhGzeo7z7IWyXHTHYJcJ0VL53mXdIrnnP/3JfdgjLddkR29zbBkGJkO2V+17nPPeB/zkb4fg4jPlevgdBBOU99mX+dhG5X4SxKfe+Ta8x5w5Mote5vXpsl43xCvpdmDP7k+XrZkcIEYTt9nWPX39VBKPbMBbMELu1T2chOUOI+mFQn8rwnQB6zZzB3PNcr9k299wrue61E0XRjcGFYDfagQ3Gjvy/zbWjy/yndfw413wegl4dsdmx7dhtx1x36cOOjX04r+iNLp+nOcNumHvHs1vHfT5vW5jvkV9ZhW2PLmMQwhg2dsFedtlmbBv0OufXXAEAVlA4IHAVAABwRwCdASqAAIAAPk0aikQioaEiMnusuFAJiWQAyyQArkeZiIPlPvC+GZPuuWMNb89EHmAc67zDebv6M/7J6gH8x/0XrUepl6AHl1/tz8JX9y/73poeoB//7YvyV+3Pcj1ms4fXdqHfIfvx+1/vnoX3v/EbUC/KP6D/vfRI+f7Pza/9F6BHud9Y/7P+D8anUp78ewB/K/53/0vUn/WeEJ92/2HsA/0f/Efsz7rH9d/9f9R5zfz7/Jf+v/WfAL/NP7l6c/sv/cj2af3F//7hI6h67nZq3lZqMwRYNCaGg8Bg81bLcfruiPRhPIUzZXL2R7M3EMzWG403dTk8k9KAhjxAbyevILLVlIw+1GvAcjuthrxJbTzr1J4ACliNViTCT5qI7JgyYV9tbSBSGHNY4SwnogDBfndtAIaUUa4pTBbUVLOG119JxW7C9vt7o0sa6aw4ddA2/ashpiSgehvlylbmR6mFl49oXBTOWfGtlhQLCG/qXxfJ+ES2Ph1zY9BpGqriynYCnKn3BPBoS66wLvHw/ojTQId9HYSxdJLkBoWdyp/YRrn+KNIyHG2QgR7hDOKIZp5Ets+90vNfh7TvpoSYGUX24sDZ1VZqxUmawrgB9PPogxP1P6hbbEgZCT12sGHv30s+ey0QwDZqfV3pE1LpXvF1EuphHkZOe0WmTNid4kqsNhUmY1CPXr3RP6WE1363Lj1Z5sGa0LYJzT5oVqzS4fqyySGRogJP+bhoQM4h8d6vcZZbYUdMqsYVSh83TPzf7noAAP7//g61sfcdlSaXQOOQfyuNnHeA6uZXSrVnTXWedfgpWEu/p3v6XwROc7JW8D8TYlX/YPleOKoIjvJkBA55xRPLFpo+CN9y9ntRxoz91RZ3nDBiwTvAf7pr9C+yR2ffzc80SNkQ0upVq8aVdX83pB5mINIIJ89jH05bt9kCpYXW5vwvzUZf5B65BmS0f8h3r65vAnTZJ9uVJqSAerc6WJqfm4elczE4dsMurNOozk9Q6k1x0+FqpTRj8gd9xfQXR0kgwvEuxiGmdWbnUxIsSi7+pW3NWikUDIUWj3I/cvQVh4Cv74Fa86ir0vAS/XZOF35bt7xcoNUtJsMNzzbJ/Z2cMGD6f6dPbZopevkiTTT4KYP5VUAdOaRHGCvqBTizfBehUpvvNWZwsNBm6h+d2o2uce5x+bXnqR6GarOLWvHxtWSfRjNzgnIfTZMXeF3xBDWih/929W+bRQ9yiw7Nbc2MmSJAifEkq3I9qWNW2K/B7C7r1+JeRxindzWiwovIKJUwVNUQ0UhH52cB1oIKhtiZjazmU4X0el0NjePD8sTVJ0tbB87wWqVX5gyyJ0H4F8cXQnKwfqmBq2EXn0EMoe20Et1/7aYdHZcIv7qZqLtlOLYZTg6BSmT6rHIiDC3NbiZ+kO+qm3TLguDNAEdjwW/meQnDe4b5o6Lzdx8b2515CjczKwWPufN26vvwrrLwnKXxa2QcHJ86uq+/XtY7fKpefCRO+DDaFIhbpUH1g8FYCtCbDGIoFmkuwSyZi1SZ3XIS2ubrZn4ult3Lxel6Q6mocGksQPTuqpn07QxYxwKxfqjRPAPb18NR/DoFARDUatETZmyZM+z/t526pR5AP1jypmFk1QWMNJIbmPSjw588H1yK41IDYgDOlRtCwB3wN738/Yl9BIfI1GeyK9y5zub5sThcFOjI354XGQL/v/oiigdX2iJKI77Oi/xPvsDRNFDDNWot9uZ3nR1ZWz3CcyQf/LwNIqpGbrmFn1ko0fX4mpnwfdbV/kddIq2IWTsNxOn2UdUpW9tXLPQjwFYGCO65NIhm+jFyqbKbh/Y8Cvmv7csNNf2p/zgHpmf/I/pyEn4oRly81qwBOubksdZOuVehWSEirU6Q2sD9sPUS8CDtm5l+NZGRHaMGYW9za+RoxUtoApNjrgHWCyDls/9HjRsD1hzxkS88B/fDPRFpLmZpTD00z/wvb8gtD2x2GRohRwGVVs8JOaaGE9dfvUg8igjJCBG799pQl9qucpDUYY5LrMevFZDOTlSbbO/WSKDE7V998q+iyrqNO6FVeA9fTQs9yfgmVh5x2OAvzdPYLyFZ9Pb76IYDlJX7o9WzV3iKKlndXo1PKuKb+pvW+vi7XE0ZGxp5SXn0zdHl++Tr3ALWdfpxSLftB9/E6rguqmveKP+ckYhPJzL33wARB7A8I4bTT25Six/FU2Sze0Bw9NddeeptU7JcYfCEKs+TyZRP8GRm/ixwwX+znB2HQefGkJTO8Z9KCOwdh6p27MuAAqiSSYgTfOXlD+AGJxvjRVvN+ts7vpDpgVZJhosbyJxIi8I/p/5ytpPECv0dUYTu2/YZVC1GXeng3HYY09mQSDsQ4KOUUcwC6BA6o/HCbSuqjMwSZaFrnToSlGoZ7rmqh2EfoN1f6sPB/UN1bPeXgxzvX3S1DdlrmZSyDxchxB+E56QMbUr1Pcz+d5AK0kAr6VPXSNqW7+AOnm5TrYK+jdxycGWKAuv1kBBqFFxjpbw+D1qLwEzTrJYMUg9IMRvAjpMKXc7J0WYGqqsLq04b0qrtpdK+93efx8XxEYgQr8edZXrk/onk7BJM+HTJ/FZDPu1oUZl3OMsojOQtnqepqbl0E4sSP/oEEdEbL8bOG6sXLIWseO9b4r8Q3rpkct9kSGcBXAgiBB4wbSUWHEmMeJLPkWDKXEMuws2KEVtuKSVrHh8UIGD5CacxlEbvMCIMcC5hhhVvxE9bXdsOXTN+R/JZphR6g52pTqDu7F/VlB1ckyqyz4NmwQSAP46M8w+X9Mjt2j3VVihr6V3VQhbGTFaDWvdJqfA9Yw2mTwLi+hMlkduaHEcYzUTZG0iRDc68CSf0u9wjHbA4XBKfs+uwU+ColwDtRCv8WJRHqOYibGIjGaBkEb8XUz7aGhAi2wLV3M8RVsJune3D+4PC5r+0sfCWE5HR3j+p+Zuk9xGn+Fs9XwzoMHmQ7hTHwNkX2txfWcAJExb2rfFS/qeetDt57zv6krac90zqOGjlJr2864HxREKxwfn05+7+QPyx6rQz5cwughyowcvLGxCfJZVPic1Eeq04xnt8gu/zUskjqLf77iZbsU0VM8nTxVJdGmWvzJ72c+3gaYGa1fvKUkQgXa2mcw94R2a9/Dc/Ocpe3DTQiyso2xXm2I+D+6pKzsYi/+3itN1K+UMAr5XPx8gcNgwydNoCff/dHblrBeLoioz0SpQRYL0Monm8D616VHzv5vDuS4/MmdYOOFShhhqrdjp15FWZZqRBtH5W2ez09sL4fDKFWM8eQgPzNDScB/N/HSBdrZgrWMIB1iRL6Qx/09rtGIQYmvTMLWcBk6yNo7ee/M1YsU7MmmDOcQZqJt6cOWH4ZqvXzD5JFkHi5xG6ztVmcf8q0Kxv+ZUOexTGhD+rerSaLsO+NPmWbyFMaxfDxKJoxyecEzRP6PF3ofvpnU2rjj6gNf1P6ykcayspJ/HyeUtXO9GBhSwjhEfqt98Sq1rBOPS338BgfJMQOFaooTJCS0Bq1ClkbO+FhNqRO1Kdg6HsinvXQ+jiyrlQ5203mvob6kKsA7gv4Gz8dyotGSK1Xx2knAZH6QNd4WiABVWvbt+rF+we5+Ye7NBN9UbnuG4schUZLRViK6gQSTo1vqMMbxBncrhn5nxL1xoCHSd3FwF2mUKT5l+SKn6YM5Cl2ocf1aASQZuT+DctUrlIpyJqzgLUYvXMDTrsp2cwxY+HISnyA7BRa/IUKT2BAaKedrLu3JhVmW7VPXJxOovAxbKvdOADijTnc6vIRTpUMKsJo8YiylGZp60cHo6WoIh27gSu54NqEwdgjPs7kWZha1Td7P4d39GV2/Q+N/7fra9qaaBAJtZ1KT8oFumMAxpxOtywyUe14rEbLadEWeQt6sItEsCv7xyZotCxnupYCOyiBNGWV9l2CEP2+3RbrkFbIfu/8ZxQmqRU2vN7k7gNVKYHDTN6gNgIMhsArL7hTpxAbHjxxoLaeFmeQJOj91vEj/XUNVzAEqy+8F/+WO27F/i71sGO8UrhgsRY4NMcE1VAKTQILbcQNCfw8XqB/oB6LnOXSXCWw3K+Ziy2RCZqvDkmJP1HumXDEtgxc4iumfeBZWH6ZK4Fk9rDy6CLZYlckOBl7Ygl+8nNEGGTYcNTCn0QZl0b4CbN01HuzSUImPpG4vXfCOTIvVJvLFyY6UcGkLXS5KJZsJVdsH+rje0FELOsuy+G6guXdYL6P3a94q9FHrGhaQ8GVL+LiJe8N4PyO7b0MinxWTutJGlm9Vtjww7Kpyac1iJsPoJ5kj3zEEAt8qXfsaXn9FcX+7c/HTknnZkKuKV1AolXqfCgKVCP/QTyCL1x35+nFnSNSBzjc5Cp67mb7kGhJGnTjeAqAotWpN4m4hWHVDcbsyzMTdehEXQOFI/h6hahOEjT9rooPzBrgVlV9IJ0Y1zV9cdfSX6f1hR0Be1PHQtXzT/sPYz5CU/caCmedZCHcDObQ8Njy8IOhRf7E2lf8WU1tVtue+3qBfTrHQE1ChWtAbd2TafmcZLKMRHABalAVhbDdwmmKV0KYfCY1Q4ZAFSBTcHdSlsSqR9N2h//pc9Q07Jr/h5LlX9lEtpr+kjuymL49Lv5wlm6010D+DxUIal+l2zFuq0myyW5+Qd/7RGia7opOQv49wmN/MpJyQySon8eijNch5ZcrLUcsyXPYG7q50ESVN+xV1douPo1o5wYb1s37T/5MQCwHJcCwpnNaUJELkPxOVQwkmfRItFh81OSEn9O/dNCncpDUfsuPq4w/y/mmzx+yjBRnLyws+epolN0SXj8qPbZPzJzSj2o6dTd3eyvO+PaqvevLAeIQB34TEYwfddepnUSw9NOUHND0M0XqCi6R8IFQWe7GfIQl9Z4DfZdjAVJ8yAnigkn7sFLE++/spfRxKdgCmm7Qjl0Z9QZMmWGABC4cnLideuS18BR3MARakrywuq/Fcoje78vUAWJXuB72dlQjuymGTaJwAmWwTNj57vg58NPbP87zfx1KkWSVd7Jcq43JK/KlKwI06BKQv0g1EQ/R4FIWhXG+D46rDKSKuRqvvSmJW+ogtjarSb/m16geJJXOY80DINE1auAug57nJjq5g1x0tDEEyAqKsAnzd2gKwIzYfYCzpZA+YJXDFObvHZvPbKdtaZaVEELhzY9T7zwRsDCUKvjo5JGbhY2AKuz2PEB/SL18aq/h14MiBWDTaIaGoCrEbhlyzEm0A1W5pxQ71nqcMOR9NEQR8JdKHCSMGILewsRQMsHdA8tk8/Gz/JfptDO4lBG04Pb4d2ZPEH2qDTFPnZrhpiuie+RCCKFQqtGIMtn5qWIi3Q4FCgWNIECnKuhVOrw6A0t2yVC+KjHj1xP5AtQ1q+O0aTZvG8kad4yFVgsFjVY0yh5yOr6Y/2aJ6JEUtXRwGBo7+Q1UOXWKfMFbau8tqo8kmVhIDUy498EUbFvAkvS2U9uaJ1yUXzlEBj1HwxAbSBZ5sUSMZR6ZYGC2EisB7AVNhqmv4LkerTsA7Ni6xeuryUcKJoEbq1CSTrqy9NjF2rvDo3WTJYoNus02Hu3GWDCwLg0OLgf2gf4Nn4CyebTbj0XurOgQbrqZ2QBSKIqYAcT16PuL0nM52O4aVTf91USQFil9D6Gr1zs5CJ5QMFg1YY8hTqaUc44aw/wAlKNazZrOuWPbwNDDJ94/CFq7n70gyfEc/e16sm8gRvN3X+EqPBBCi7LftyNlIaCxf+g6tPkSqqWVdlNaSIFFuafQ9JuaYZ1jQa1Hktdf/nMOeqwRyWscN5zs4iLKNvWSvoo0u5IQUT9bz1ocrT1lWMTiWOXTMxDgAB+XlYov5DEoeopDmuCXnUJllVIlvElSfHvpFUIbV0FdzT2ImUQ7C7KA4ttC4BG6Fhe/JEx+N/AK56/PjUN3gR4AAXPUqfj+Oc9Lu8e8ssm0eZ0IVhOAPMteZDtKg2CfqvInoNqYt0jxq/gxv26TsYXjGCWmZUHcRP6jWNAUvNeJP1GrXOYqNiUkEaeHfmXrRumUwsquzbPUfJG5BFihF4ia1gxv7wM3hUazdKj8ynEwf/zpvIvbhw6hs4Vq5xd5vqdixJDe0GSTshjNAEEPQ1m3JspnHZUacFhbiLX8cU9E9rgeVBfj/EZeX4L1ijhnQkfal9oRjH+o+YSBmC9qK30+W2rbn0GaHCIOd2zD/baqSgRVATymD8g1eTwji9WIvpg+BDVQr6Q6xruXG0lt7fjQ3E4lZlmDVix5iWGDFSYVH4TlydPx/HmvMNLBJxUBDsbmtpyMH6cjhg2gcNVgLXLPH4BBC0nWsox+oaI3m6frsDDDM0NsKHDqchfVbV3VMAqXjNDUwn8oPubzAY1/bnYBuBq9y/qtVbEVtm78f/3UMSz9/e5n3RBxF//8cJ2PEn3tfCMi8R8HoPLNEChnR6BmWQ2yos0voQ0wMFgyJ+H6tk8VhVi4kpldoNvwktwHctY6M5FdVDwmuRi3+I2HYVzogfPrXmFSfsv6uA0+PyHM79Fg0rCeV+UR1uGRlW/1CpnPcYYVoxd7FvjC8F0QJ9rAnqNoclqfJcPleD9sPNx63d88jZMs1T7VRhSwrVh7//HT8qFH+qz1dqLxpFBFGH23x/ls689QgFa93PjjXnQwK/BsduK4pl2UT+bIXT6xiMPcn/2r+lQRfyIDjCx0nl/wQMV4mzRbSLYd14EzCqqxnU2u78TPKph5RML822jfqIb/qCEwPatRBA93rSYYjYaglz4mjTDSfhUviYtP7k5mtuPokpVr/A2l9aa6k7KKEN8VGKL0cTsZJoah6mz2HXu/gINycuWNf8JY6v4wnpExMAdB7tcqyeM+TsLNlvGRoO9PQjJOBBRWD4oAeoUOBrHs5qIKX+3q0bfIOPNf14XR+Jp0KsGc/mbYwxfQEw+o29tKQRX5YuN5wYCOd6Low6J7HnEwdaA8PZp2Hak2VWIigR7SHZhfI/8xL4O7wGsMdLO1eNkvWhK5VezyU5ICOHBRcgNv3/p101d7nPDGYthlf0fMg48492uJFSZu4lp9JkLY5evqguByocbtuqMpGuauakQCJLz9NYFKm8LF/cIDeqYzToTgdare5RlNyo43l6hyHR8LztwQ391KkptMRoh/h9E6R+k6kIjNzVwkHPUw5cnJaCt475wkM1FWGehgrNBsQjuPMeJXy5tq2ai+9XatJhQORbCloZrKM7sx+pOn9SKillzw2AGXLCkMIvqEfPvaSssKQi5ed6yOUxXNvb/EFLrpYjo6FWFzCKqNZmrV+k/ty4Ake0krcDaOuAA';
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

if(!output.includes("function ppaSetBagVisualSelection(i)") ||
   !output.includes("ppaSetBagVisualSelection(i);") ||
   output.includes("_sel=i;renderBag();")) {
  throw new Error('Character inventory fast selection patch did not apply');
}
/* ======================================================================== */

/* === RUNTIME BUILD AUDIT ================================================= */
{
  const worldCombat=fs.readFileSync(path.join(ROOT,'gateway/world-combat-client.js'),'utf8');
  const socialUi=fs.readFileSync(path.join(ROOT,'gateway/social-ui.js'),'utf8');
  const realtimeClient=fs.readFileSync(path.join(ROOT,'gateway/realtime-client.js'),'utf8');
  const realtimeServer=fs.readFileSync(path.join(ROOT,'src/realtime-stable.js'),'utf8');
  const arenaPvp=fs.readFileSync(path.join(ROOT,'gateway/arena-pvp-client.js'),'utf8');
  const dungeonMobEvents=fs.readFileSync(path.join(ROOT,'gateway/dungeon-mob-events.js'),'utf8');
  const remoteSprite=fs.readFileSync(path.join(ROOT,'gateway/remote-sprite-renderer.js'),'utf8');
  const remoteFx=fs.readFileSync(path.join(ROOT,'gateway/remote-combat-fx.js'),'utf8');

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
  if (remoteFx.includes("__ppaAttackUntil") || remoteFx.includes("r.anim='attack'") || remoteFx.includes("r.face=")) {
    throw new Error('Remote combat FX must stay visual-only');
  }
  if (!remoteFx.includes('PPA_REMOTE_COMBAT_FX_DRAW')) {
    throw new Error('Remote projectile draw API missing');
  }
}

/* ======================================================================== */

const filesToPublish = [
  ['gateway/ppa-bridge.js','ppa-bridge.js','Telegram gateway bridge missing'],
  ['gateway/online-client.js','online-client.js','Online client bridge missing'],
  ['gateway/realtime-client.js','realtime-client.js','Realtime client bridge missing'],
  ['gateway/arena-pvp-client.js','arena-pvp-client.js','Arena PvP client missing'],
  ['gateway/world-combat-client.js','world-combat-client.js','World combat client missing'],
  ['gateway/dungeon60-dragon.js','dungeon60-dragon.js','Dungeon 60 dragon runtime missing'],
  ['gateway/dungeon-mob-events.js','dungeon-mob-events.js','Dungeon mob event bridge missing'],
  ['gateway/dungeon-drop-slots.js','dungeon-drop-slots.js','Dungeon drop slot helper missing'],
  ['gateway/qa-test-access.js','qa-test-access.js','QA dungeon access helper missing'],
  ['gateway/realtime-debug-bridge.js','realtime-debug-bridge.js','Realtime debug bridge missing'],
  ['gateway/mobile-sprite-performance.js','mobile-sprite-performance.js','Mobile sprite performance helper missing'],
  ['gateway/remote-sprite-renderer.js','remote-sprite-renderer.js','Remote sprite renderer missing'],
  ['gateway/remote-combat-fx.js','remote-combat-fx.js','Remote combat FX renderer missing'],
  ['gateway/remote-pet-renderer.js','remote-pet-renderer.js','Remote pet renderer missing'],
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
output = output.replace('</body>', `<script src="${js('telegram-safe-ui.js')}"></script>\n<script src="${js('mobile-hud-tweaks.js')}"></script>\n<script src="${js('online-client.js')}"></script>\n<script src="${js('realtime-client.js')}"></script>\n<script src="${js('world-combat-client.js')}"></script>\n<script src="${js('dungeon60-dragon.js')}"></script>\n<script src="${js('dungeon-mob-events.js')}"></script>
<script src="${js('dungeon-drop-slots.js')}"></script>
<script src="${js('qa-test-access.js')}"></script>\n<script src="${js('realtime-debug-bridge.js')}"></script>\n<script src="${js('mobile-sprite-performance.js')}"></script>\n<script src="${js('remote-sprite-renderer.js')}"></script>\n<script src="${js('remote-combat-fx.js')}"></script>\n<script src="${js('remote-pet-renderer.js')}"></script>\n<script src="${js('class-sync-client.js')}"></script>\n<script src="${js('social-ui.js')}"></script>\n<script src="${js('realtime-identity-sync.js')}"></script>\n</body>`);

fs.writeFileSync(path.join(publicDir, 'index.html'), output, 'utf8');
console.log(`PPA build complete: ${count} unique embedded images externalized.`);
console.log('Telegram bridge: /game/ppa-bridge.js');
console.log('Telegram safe UI: /game/telegram-safe-ui.js');
console.log('Mobile HUD tweaks: /game/mobile-hud-tweaks.js');
console.log('Online bridge: /game/online-client.js');
console.log('Realtime bridge: /game/realtime-client.js');
console.log('Arena PvP: /game/arena-pvp-client.js');
console.log('World combat: /game/world-combat-client.js');
console.log('Dungeon 60 dragon: /game/dungeon60-dragon.js');
console.log('Dungeon mob events: /game/dungeon-mob-events.js');
console.log('Dungeon drop slots: /game/dungeon-drop-slots.js');
console.log('Realtime debug bridge: /game/realtime-debug-bridge.js');
console.log('Mobile sprite performance: /game/mobile-sprite-performance.js');
console.log('Remote player sprites: /game/remote-sprite-renderer.js');
console.log('Remote combat FX: /game/remote-combat-fx.js');
console.log('Remote pet renderer: /game/remote-pet-renderer.js');
console.log('Realtime class sync: /game/class-sync-client.js');
console.log('Social UI: /game/social-ui.js');
console.log('Realtime identity sync: /game/realtime-identity-sync.js');
console.log(`Client build cache key: ${CLIENT_BUILD}`);
console.log('Legacy Supabase realtime: disabled');
console.log('Telegram migration lockout guard: enabled');
console.log('Portable save buttons: removed');
console.log(`index.html: ${(Buffer.byteLength(output)/1024/1024).toFixed(2)} MiB`);