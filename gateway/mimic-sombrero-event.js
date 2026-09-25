(function(){
  'use strict';
  if(window.__PPA_MIMIC_SOMBRERO_EVENT_V2)return;
  window.__PPA_MIMIC_SOMBRERO_EVENT_V2=true;

  var TEST_ACTIVE=true;
  var EVENT_ID='mimic_sombrero';
  var TICKET='Билет Мимика-Самбреро';
  var TICKET_CHANCE=0.0047; // 0.47%
  var SLOTS=['weapon','helmet','armor','gloves','legs','boots'];
  var SLOT_RU={weapon:'Оружие',helmet:'Шляпа Самбреро',armor:'Пончо',gloves:'Перчатки',legs:'Штаны',boots:'Сапоги'};
  var RARITY_RU={green:'зелёный',blue:'синий',epic:'эпический'};
  var DIFF={
    20:{level:20,hp:10000,rarity:'green',rewardChance:0.35,title:'Мимик-Самбреро 20',color:'#79e66f'},
    40:{level:40,hp:20000,rarity:'blue',rewardChance:0.25,title:'Мимик-Самбреро 40',color:'#75b9ff'},
    60:{level:60,hp:50000,rarity:'epic',rewardChance:0.16,title:'Мимик-Самбреро 60',color:'#d58cff'}
  };

  function active(){return window.PPA_MIMIC_SOMBRERO_TEST_ACTIVE!==false&&TEST_ACTIVE}
  window.PPA_MIMIC_SOMBRERO_TEST_ACTIVE=TEST_ACTIVE;
  window.PPA_MIMIC_SOMBRERO_IS_ACTIVE=active;
  window.PPA_SET_MIMIC_SOMBRERO_TEST_ACTIVE=function(v){window.PPA_MIMIC_SOMBRERO_TEST_ACTIVE=(v===true);return active()};

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function save(){try{if(typeof scheduleCombatSave==='function')scheduleCombatSave()}catch(_){}try{if(typeof sendInvState==='function')sendInvState()}catch(_){}try{if(typeof saveGame==='function')saveGame()}catch(_){}}
  function matBag(){try{if(typeof INV!=='object'||!INV)return null;INV.materials=(INV.materials&&typeof INV.materials==='object')?INV.materials:{};return INV.materials}catch(_){return null}}
  function matCount(n){var m=matBag();return m?Math.max(0,Number(m[n])||0):0}
  function addMat(n,a){var m=matBag();if(!m)return false;m[n]=(Math.max(0,Number(m[n])||0)+Math.max(1,Math.floor(Number(a)||1)));save();return true}
  function takeMat(n,a){var m=matBag();a=Math.max(1,Math.floor(Number(a)||1));if(!m||Math.max(0,Number(m[n])||0)<a)return false;m[n]=Math.max(0,Number(m[n])||0)-a;if(m[n]<=0)delete m[n];save();return true}
  function iconData(label,bg,fg){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="18" fill="'+bg+'" stroke="#ffd36a" stroke-width="4"/><path d="M16 57h64M25 48c3-17 10-25 23-25s20 8 23 25" fill="none" stroke="'+fg+'" stroke-width="13" stroke-linecap="round"/><path d="M19 57c20 13 39 13 58 0" fill="none" stroke="#222" stroke-width="6"/><text x="48" y="82" text-anchor="middle" font-family="monospace" font-weight="900" font-size="18" fill="#fff4c8">'+label+'</text></svg>')}
  var TICKET_SRC=iconData('БИЛЕТ','#4d2c12','#ffd36a');
  var GEAR_SRC={green:iconData('SET','#163b19','#78e66f'),blue:iconData('SET','#132a4d','#75b9ff'),epic:iconData('SET','#32154b','#d58cff')};

  function registerMaterials(){
    try{
      if(typeof MATERIAL_DB!=='object'||!MATERIAL_DB)return;
      MATERIAL_DB[TICKET]=Object.assign({},MATERIAL_DB[TICKET]||{},{rarity:'epic',src:TICKET_SRC,eventId:EVENT_ID,eventResource:true,permanent:true,tradeLocked:true,desc:'Непередаваемый билет. Открывает бой с Мимиком-Самбреро.'});
      if(typeof MAT_IMG==='object'&&MAT_IMG&&!MAT_IMG[TICKET]){MAT_IMG[TICKET]=new Image();MAT_IMG[TICKET].src=TICKET_SRC}
    }catch(_){}
  }
  function eligible(e){
    if(!active()||!e)return false;
    try{if(window.PPA_MOB_REWARD_ELIGIBLE&&!window.PPA_MOB_REWARD_ELIGIBLE(e))return false}catch(_){}
    try{if(typeof P==='undefined'||!P||P.scene!=='dungeon')return false}catch(_){return false}
    if(e.isFartGuard||e.isClanBoss||e.isClanSiegeCrystal||e.__ppaArenaPlayer||e.isAiFighter)return false;
    var lv=Math.max(0,Math.min(60,Math.floor(Number(e.roomLevel||e.lvl||e.level)||0)));
    return !!(e.isDungeonPhoenixBoss||e.isDungeon21Boss||e.isDungeon60Boss||e.isDungeonElite||(lv>=1&&lv<=60&&!e.isBoss));
  }
  function dropTicket(e){
    if(typeof LOOT==='undefined'||!Array.isArray(LOOT))return false;
    LOOT.push({x:Number(e.x||0)+(Math.random()-.5)*28,y:Number(e.y||0)+(Math.random()-.5)*28,kind:'material',name:TICKET,rarity:'epic',src:TICKET_SRC,amount:1,bob:Math.random()*6,mimicSombreroTicket:true,eventId:EVENT_ID,tradeLocked:true});
    return true;
  }
  function installDropRoll(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaMimicSombreroTicket)return;
      var base=dropLoot;
      var wrapped=function(e){var r=base.apply(this,arguments);if(eligible(e)&&Math.random()<TICKET_CHANCE)dropTicket(e);return r};
      wrapped.__ppaMimicSombreroTicket=1;wrapped.__ppaMimicSombreroTicketBase=base;
      try{dropLoot=wrapped}catch(_){}try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }
  function installDropInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaMimicSombreroInfo)return;
      var base=mobDropInfo;
      var wrapped=function(e){var rows=base.apply(this,arguments);if(!Array.isArray(rows)||!eligible(e))return rows;var out=rows.map(function(x){return Array.isArray(x)?x.slice():x});out.push([TICKET,'0.47% · событие']);return out};
      wrapped.__ppaMimicSombreroInfo=1;wrapped.__ppaMimicSombreroInfoBase=base;
      try{mobDropInfo=wrapped}catch(_){}try{window.mobDropInfo=wrapped}catch(_){}
    }catch(_){}
  }
  function installBlackMarketFilter(){
    try{
      if(typeof blackMarketMaterialPool!=='function'||blackMarketMaterialPool.__ppaNoMimicTicket)return;
      var base=blackMarketMaterialPool;
      var wrapped=function(){var a=base.apply(this,arguments);return Array.isArray(a)?a.filter(function(n){return String(n)!==TICKET}):a};
      wrapped.__ppaNoMimicTicket=1;try{blackMarketMaterialPool=wrapped}catch(_){}try{window.blackMarketMaterialPool=wrapped}catch(_){}
    }catch(_){}
  }

  function gearStore(){try{if(typeof INV!=='object'||!INV)return null;INV.mimicSombreroGear=(INV.mimicSombreroGear&&typeof INV.mimicSombreroGear==='object')?INV.mimicSombreroGear:{items:[]};if(!Array.isArray(INV.mimicSombreroGear.items))INV.mimicSombreroGear.items=[];return INV.mimicSombreroGear}catch(_){return null}}
  function makeGear(d){
    var slot=SLOTS[Math.floor(Math.random()*SLOTS.length)],rar=d.rarity,lvl=d.level;
    var mult=rar==='epic'?3:(rar==='blue'?2:1),id='mimic:'+lvl+':'+slot+':'+Date.now().toString(36)+':'+Math.random().toString(36).slice(2,7);
    return {id:id,n:SLOT_RU[slot]+' Самбреро',name:SLOT_RU[slot]+' Самбреро',slot:slot,kind:'gear',type:'gear',rarity:rar,level:lvl,lvl:lvl,cls:'all',classKey:'all',setId:'mimic_sombrero',ppaMimicSombrero:true,atk:slot==='weapon'?18*mult:0,def:slot!=='weapon'?8*mult:0,hp:slot==='armor'?120*mult:0,img:GEAR_SRC[rar],src:GEAR_SRC[rar],desc:'Ивентовый сет Мимика-Самбреро. 2 части +0.5% золота, 4 части +1% золота и +1% дропа, 6 частей +2% золота и +2% дропа.'};
  }
  function grantGear(d){
    var it=makeGear(d),gs=gearStore();
    if(gs)gs.items.unshift(it);
    try{if(typeof INV==='object'&&INV&&Array.isArray(INV.items))INV.items.unshift(Object.assign({},it))}catch(_){}
    save();
    try{if(typeof showPickup==='function')showPickup('🎭 '+it.name+' · '+RARITY_RU[it.rarity],'#ffd36a')}catch(_){}
    return it;
  }
  function equippedMimicPieces(){
    var seen={};
    function scan(o){try{if(!o||typeof o!=='object')return;Object.keys(o).forEach(function(k){var it=o[k];if(it&&it.ppaMimicSombrero&&it.slot)seen[it.slot]=1})}catch(_){}}
    try{if(typeof INV==='object'&&INV){scan(INV.equipped);scan(INV.equip)}}catch(_){}
    try{if(typeof P==='object'&&P){scan(P.equipped);scan(P.equip)}}catch(_){}
    return Object.keys(seen).length;
  }
  function setBonus(){var n=equippedMimicPieces();if(n>=6)return{pieces:n,gold:0.02,drop:0.02};if(n>=4)return{pieces:n,gold:0.01,drop:0.01};if(n>=2)return{pieces:n,gold:0.005,drop:0};return{pieces:n,gold:0,drop:0}}
  window.PPA_MIMIC_SOMBRERO_SET_BONUS=setBonus;

  var root=null,battle=null,state=null;
  function addStyle(){
    if(document.getElementById('ppaMimicSombreroStyle'))return;
    var s=document.createElement('style');s.id='ppaMimicSombreroStyle';
    s.textContent='#ppaMimicBtn{position:fixed;right:8px;top:116px;z-index:66;padding:7px 9px;border:1px solid #9d6b2b;border-radius:9px;background:rgba(31,17,8,.9);color:#ffd36a;font:900 10px monospace;box-shadow:0 4px 14px rgba(0,0,0,.45)}#ppaMimicModal,#ppaMimicBattle{position:fixed;inset:0;z-index:10080;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;color:#f9e7bd;font:800 11px monospace}#ppaMimicModal .box{width:min(470px,91vw);max-height:86vh;overflow:auto;border:1px solid #b77a31;border-radius:14px;background:linear-gradient(#2c170c,#120b07);padding:13px;box-shadow:0 16px 40px #000}#ppaMimicModal h2{margin:0 0 9px;text-align:center;color:#ffd36a;font-size:16px}#ppaMimicModal button,#ppaMimicBattle button{margin:5px;padding:8px 10px;border:1px solid #9a6526;border-radius:8px;background:#3a2110;color:#ffd36a;font:900 11px monospace}#ppaMimicBattle .arena{position:relative;width:min(500px,94vw);height:min(720px,90vh);border:2px solid #a76527;border-radius:18px;overflow:hidden;background:radial-gradient(circle at 50% 45%,#d8aa64 0 28%,#b7773b 29% 37%,#79452d 38% 100%);box-shadow:0 16px 40px #000}#ppaMimicBattle .arena:before{content:"";position:absolute;inset:16px;border:5px solid rgba(77,42,23,.75);border-radius:44% 42% 46% 43%;box-shadow:inset 0 0 0 999px rgba(222,173,95,.25)}#ppaMimicBattle .mob{position:absolute;left:50%;top:37%;transform:translate(-50%,-50%);font-size:88px;filter:drop-shadow(0 6px 5px #000);text-align:center}#ppaMimicBattle .hp{position:absolute;left:32px;right:32px;top:22px;height:16px;border:1px solid #ffce65;border-radius:9px;background:#170909;overflow:hidden}#ppaMimicBattle .hp i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#8b1313,#ff5d38,#ffd36a)}#ppaMimicBattle .hud{position:absolute;left:0;right:0;bottom:0;padding:12px;background:linear-gradient(transparent,rgba(0,0,0,.88) 22%);text-align:center}#ppaMimicBattle .log{min-height:38px;color:#ffe7ad;margin:4px 0 8px}.ppaMimicGrid{display:grid;grid-template-columns:1fr;gap:6px}.ppaMimicSmall{font-size:10px;color:#cdbb9b;line-height:1.35}';
    document.head.appendChild(s);
  }
  function ensureBtn(){
    addStyle();if(root&&root.isConnected)return;
    root=document.createElement('button');root.id='ppaMimicBtn';root.type='button';root.onclick=openModal;document.body.appendChild(root);
    setInterval(function(){try{var n=matCount(TICKET);root.style.display=active()&&n>0?'block':'none';root.textContent='🎭 Самбреро ×'+n}catch(_){}},700);
  }
  function openModal(){
    addStyle();var n=matCount(TICKET),b=setBonus();var old=document.getElementById('ppaMimicModal');if(old)old.remove();
    var div=document.createElement('div');div.id='ppaMimicModal';div.innerHTML='<div class="box"><h2>🎭 СОБЫТИЕ · МИМИК-САМБРЕРО</h2><div class="ppaMimicSmall">Билет падает с мобов и боссов данжей: <b>0.47%</b>.<br>Билет непередаваемый. Один билет открывает отдельный бой с Мимиком.<br><br>20 ур. — 10 000 HP · зелёный сет<br>40 ур. — 20 000 HP · синий сет<br>60 ур. — 50 000 HP · эпический сет<br><br>Бонус сета: 2 части +0.5% золота · 4 части +1% золота и +1% дропа · полный сет +2%/+2%.<br><br>Билеты: <b>'+n+'</b> · экипировано частей: <b>'+b.pieces+'</b></div><div class="ppaMimicGrid"><button data-lv="20">Войти к Мимику 20</button><button data-lv="40">Войти к Мимику 40</button><button data-lv="60">Войти к Мимику 60</button><button data-close="1">Закрыть</button></div></div>';
    document.body.appendChild(div);div.addEventListener('click',function(e){if(e.target===div||e.target.dataset.close)div.remove();var lv=Number(e.target.dataset.lv)||0;if(lv)startBattle(lv,div)},{passive:true});
  }
  function startBattle(lv,modal){var d=DIFF[lv];if(!d)return;if(!takeMat(TICKET,1)){try{if(typeof showPickup==='function')showPickup('Нужен билет Мимика-Самбреро','#ff9c72')}catch(_){}return}if(modal)modal.remove();state={d:d,hp:d.hp,mhp:d.hp,playerHp:Math.max(1500,Number(P&&P.mhp)||2500),playerMax:Math.max(1500,Number(P&&P.mhp)||2500),turn:0,ended:false};renderBattle('Бой начался. Мимик ждёт удар!')}
  function renderBattle(msg){
    if(!battle||!battle.isConnected){battle=document.createElement('div');battle.id='ppaMimicBattle';document.body.appendChild(battle)}
    var d=state.d,pct=Math.max(0,Math.min(100,state.hp/state.mhp*100));
    battle.innerHTML='<div class="arena"><div class="hp"><i style="width:'+pct.toFixed(1)+'%"></i></div><div class="mob">🎭<br>🧰</div><div class="hud"><div style="color:'+d.color+'">'+esc(d.title)+' · HP '+Math.max(0,Math.ceil(state.hp)).toLocaleString('ru-RU')+' / '+d.hp.toLocaleString('ru-RU')+'</div><div class="log">'+esc(msg||'')+'</div><button data-act="hit">АТАКА</button><button data-act="leave">ВЫЙТИ</button></div></div>';
    battle.onclick=function(e){var a=e.target&&e.target.dataset&&e.target.dataset.act;if(a==='leave'){battle.remove();battle=null;state=null}if(a==='hit')playerHit()};
  }
  function playerHit(){
    if(!state||state.ended)return;
    var atk=Math.max(50,Number(P&&P.atk)||120),dmg=Math.floor(atk*(18+Math.random()*10)+state.d.level*22);
    state.hp=Math.max(0,state.hp-dmg);state.turn++;
    if(state.hp<=0)return victory(dmg);
    var md=Math.floor(state.d.level*(7+Math.random()*5));state.playerHp=Math.max(0,state.playerHp-md);
    if(state.playerHp<=0){state.ended=true;renderBattle('Ты проиграл бой. Билет потрачен.');setTimeout(function(){try{if(battle)battle.remove()}catch(_){}battle=null;state=null},1400);return}
    renderBattle('Ты нанёс '+dmg.toLocaleString('ru-RU')+'. Мимик ответил на '+md+'.')
  }
  function victory(last){
    var d=state.d;state.ended=true;var won=Math.random()<d.rewardChance,msg='Победа! Последний удар '+last.toLocaleString('ru-RU')+'. ';
    if(won){var it=grantGear(d);msg+='Выпал '+it.name+' ('+RARITY_RU[it.rarity]+').'}else msg+='Сет не выпал в этот раз.';
    renderBattle(msg);setTimeout(function(){try{if(battle)battle.remove()}catch(_){}battle=null;state=null;ensureBtn()},2600)
  }

  function install(){registerMaterials();installDropRoll();installDropInfo();installBlackMarketFilter();ensureBtn()}
  registerMaterials();install();setTimeout(install,250);setTimeout(install,900);
  window.PPA_MIMIC_SOMBRERO_EVENT={active:active,ticket:TICKET,ticketChance:TICKET_CHANCE,open:openModal,grantTicket:function(n){return addMat(TICKET,n||1)},bonus:setBonus,difficulties:DIFF};
})();