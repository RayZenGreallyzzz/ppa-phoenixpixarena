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

  function ticketCount(){return matCount(TICKET)}
  function consumeTicket(n){return takeMat(TICKET,Math.max(1,Math.floor(Number(n)||1)))}
  function openArena(){
    try{
      if(window.PPA_MIMIC_SOMBRERO_ARENA&&typeof window.PPA_MIMIC_SOMBRERO_ARENA.open==='function'){
        window.PPA_MIMIC_SOMBRERO_ARENA.open();return true;
      }
    }catch(_){}
    try{if(typeof showPickup==='function')showPickup('Арена Мимика ещё загружается','#ffb36b')}catch(_){}
    return false;
  }

  function install(){registerMaterials();installDropRoll();installDropInfo();installBlackMarketFilter()}
  registerMaterials();install();setTimeout(install,250);setTimeout(install,900);
  window.PPA_MIMIC_SOMBRERO_EVENT={
    active:active,
    ticket:TICKET,
    ticketChance:TICKET_CHANCE,
    ticketCount:ticketCount,
    consumeTicket:consumeTicket,
    open:openArena,
    grantTicket:function(n){return addMat(TICKET,n||1)},
    grantGear:grantGear,
    bonus:setBonus,
    difficulties:DIFF
  };
})();