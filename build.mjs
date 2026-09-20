import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const EXPECTED_PARTS = 12;
const EXPECTED_SOURCE_SHA256 = 'caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts = Array.from({length:EXPECTED_PARTS},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const CLIENT_BUILD = 'v399-fart-pickaxe-legendary-20260920';

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

/* === FART GUARD LEGENDARY + 14H PICKAXE ================================= */
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
  `const FART_PICKAXE_DURATION_MS=14*60*60*1000;
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
    name:'Шахтёрская кирка',
    slot:'tool',
    rarity:'uncommon',
    icon:'⛏',
    ic:'⛏',
    img:'',
    classKey:'all',
    className:'Все классы',
    enh:0,level:0,sell:0,
    stats:{},
    bonusText:'Фарт Зона · авто-добыча · действует 14 часов',
    bound:true,tradeLocked:true,blackMarket:false,
    fartPickaxe:true,
    expiresAt:Math.max(0,Number(expiresAt)||0)
  };
}
function fartNormalizePickaxe(){
  if(!Array.isArray(INV.bag))INV.bag=[];
  let until=Math.max(0,Number(INV.fartPickaxeUntil)||0);
  let item=fartPickaxeBagItem();
  // Migrate the old permanent boolean to one fresh 14-hour item.
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
  'fart pickaxe purchase 14h inventory item',
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
  'fart pickaxe purchase message 14h',
  /showPickup\('⛏ Кирка куплена · −200 PPA','#9dff91'\);/,
  "showPickup('⛏ Кирка куплена на 14 часов · −200 PPA','#9dff91');"
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
  /\(INV\.bag\|\|\[\]\)\.forEach\(function\(it,i\)\{if\(!it\)return;/,
  "(INV.bag||[]).forEach(function(it,i){if(!it||it.fartPickaxe===true)return;"
);

if(!output.includes("FART_GUARD_LEGENDARY_GEAR_CHANCE=0.0000013") ||
   !output.includes("const FART_PICKAXE_DURATION_MS=14*60*60*1000") ||
   !output.includes("name:'Шахтёрская кирка'") ||
   !output.includes("Легендарный шмот/оружие · случайный','0.00013%")) {
  throw new Error('Fart legendary/pickaxe patch did not apply');
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