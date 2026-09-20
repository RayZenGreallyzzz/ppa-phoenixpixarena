import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const EXPECTED_PARTS = 12;
const EXPECTED_SOURCE_SHA256 = 'caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts = Array.from({length:EXPECTED_PARTS},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const CLIENT_BUILD = 'v422-fart-five-guards-20260920';

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

ppaPatchRegex(
  'shared mob reward',
  /P\.kil\s*\+\+\s*;\s*P\.xp\s*\+=\s*e\.xp\s*;/g,
  "if(!window.PPA_MOB_REWARD_ELIGIBLE||window.PPA_MOB_REWARD_ELIGIBLE(e)){P.kil++;P.xp+=e.xp;}",
  true
);

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
  `function updateFartZoneSystem(){
  if(P.scene!=='fartzone'){
    const b=document.getElementById('fartAutoMineBtn');
    if(b)b.style.display='none';
    FART_ZONE_STATE.activeMineId=null;
    return;
  }
  if(!FART_ZONE_STATE.ready)fartInitZone();

  const now=Date.now();
  const dt=Math.max(0,Math.min(250,now-(FART_ZONE_STATE.lastTick||now)));
  FART_ZONE_STATE.lastTick=now;

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


/* === FART ZONE GUARD VISUAL TEST ======================================== */
// Five approved transparent guard skins for visual testing:
// 0 tentacle, 1 toxic spider, 2 reaper, 3 bronze golem, 4 dark guard.
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
  "window.__PPA_FART_DRAW_ENTITY=(e&&e.isFartGuard)?e:null;if(e.isDungeon60Boss){if(window.PPA_DRAGON60_DRAW)window.PPA_DRAGON60_DRAW(e);continue;}if(e.isDungeon21Boss){drawDungeon21Boss(e);continue;}"
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
"  function skinOf(e){\n"+
"    if(Number.isInteger(e.__ppaFartSkin))return e.__ppaFartSkin;\n"+
"    var idx=-1;\n"+
"    try{\n"+
"      if(typeof EN!=='undefined'&&Array.isArray(EN)){\n"+
"        var gs=EN.filter(function(v){return v&&v.isFartGuard&&v.hp>0}).slice().sort(function(a,b){return ((Number(a.x)||0)-(Number(b.x)||0))||((Number(a.y)||0)-(Number(b.y)||0))});\n"+
"        idx=gs.indexOf(e);\n"+
"      }\n"+
"    }catch(_){}\n"+
"    if(idx<0){\n"+
"      var key=String(e.id||e.uid||e.mineId||'')+'|'+Math.round(Number(e.x)||0)+'|'+Math.round(Number(e.y)||0);\n"+
"      var h=0;for(var i=0;i<key.length;i++)h=((h*31)+key.charCodeAt(i))|0;idx=Math.abs(h);\n"+
"    }\n"+
"    e.__ppaFartSkin=idx%5;return e.__ppaFartSkin;\n"+
"  }\n"+
"  function dirOf(e,v){\n"+
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
"    v.lastX=x;v.lastY=y;return {skin:skin,col:col,row:dir};\n"+
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
"            original.call(this,sheet,fr.col*TILE,fr.row*TILE,TILE,TILE,dx,dy,dw,dh);\n"+
"            this.imageSmoothingEnabled=oldSmooth;return;\n"+
"          }\n"+
"        }\n"+
"      }catch(_){}\n"+
"    }\n"+
"    return original.apply(this,arguments);\n"+
"  };\n"+
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
   !output.includes("idx%5") ||
   !output.includes("skin===4")) {
  throw new Error('Fart guard visual test patch did not apply');
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
const FART_PICKAXE_LEGENDARY_IMG='data:image/webp;base64,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';`
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