(function(){
  'use strict';
  if(window.__PPA_RURI_EVENT_DROPS_V1)return;
  window.__PPA_RURI_EVENT_DROPS_V1=true;

  var MONTHLY_START_DAY=1;
  var EVENT_DAYS=10;
  var DAY_MS=86400000;

  function scheduleInfo(now){
    now=Number(now)||((typeof window.PPA_SERVER_NOW==='function')?Number(window.PPA_SERVER_NOW())||Date.now():Date.now());
    var d=new Date(now),y=d.getUTCFullYear(),m=d.getUTCMonth();
    var start=Date.UTC(y,m,MONTHLY_START_DAY,0,0,0,0);
    var end=start+EVENT_DAYS*DAY_MS;
    var activeNow=now>=start&&now<end;
    var nextStart=activeNow
      ? start
      : (now<start?start:Date.UTC(m===11?y+1:y,m===11?0:m+1,MONTHLY_START_DAY,0,0,0,0));
    return {active:activeNow,start:start,end:end,nextStart:nextStart,startDay:MONTHLY_START_DAY,days:EVENT_DAYS};
  }

  // Canonical full-size transparent event resources supplied for Great Ruri.
  // Dedicated files are used directly; do not crop them out of the poster.
  var RES={
    demonic:{name:'Демонический кристалл',chance:0.0005,rarity:'legendary',src:'/assets/ruri-demonic-crystal.webp?v=ruri-icons-v1'},
    fire:{name:'Огненные осколки',chance:0.008,rarity:'legendary',src:'/assets/ruri-fire-shards.webp?v=ruri-icons-v1'},
    crystal:{name:'Хрустальный кристалл',chance:0.08,rarity:'legendary',src:'/assets/ruri-crystal.webp?v=ruri-icons-v1'},
    blood:{name:'Кровь монстра',chance:0,rarity:'legendary',src:'/assets/ruri-monster-blood.webp?v=ruri-icons-v1'}
  };
  var BY_NAME={};
  Object.keys(RES).forEach(function(k){BY_NAME[RES[k].name]=RES[k]});

  window.PPA_RURI_EVENT_RESOURCES=RES;
  window.PPA_RURI_EVENT_SCHEDULE=scheduleInfo;
  window.PPA_RURI_EVENT_IS_ACTIVE=function(){
    try{
      if(typeof window.PPA_SERVER_CLOCK_READY==='function'&&window.PPA_SERVER_CLOCK_READY()!==true)return false;
      return scheduleInfo().active===true;
    }catch(_){return false}
  };

  function active(){
    try{return window.PPA_RURI_EVENT_IS_ACTIVE()===true}catch(_){return false}
  }

  function registerMaterials(){
    try{
      if(typeof MATERIAL_DB!=='object'||!MATERIAL_DB)return;
      Object.keys(RES).forEach(function(k){
        var d=RES[k];
        MATERIAL_DB[d.name]=Object.assign({},MATERIAL_DB[d.name]||{},{
          rarity:'legendary',
          src:d.src||'',
          eventId:'great_ruri_monthly',
          eventResource:true,
          permanent:true
        });
        if(typeof MAT_IMG==='object'&&MAT_IMG&&!MAT_IMG[d.name]){
          MAT_IMG[d.name]=new Image();
          if(d.src)MAT_IMG[d.name].src=d.src;
        }
      });
    }catch(_){}
  }

  function eligibleReward(e){
    if(!e)return false;
    try{
      if(window.PPA_MOB_REWARD_ELIGIBLE&&!window.PPA_MOB_REWARD_ELIGIBLE(e))return false;
    }catch(_){}
    return true;
  }

  function dungeonLevel(e){
    var lv=Math.floor(Number(e&&(e.roomLevel||e.lvl||e.level))||0);
    return Math.max(0,Math.min(60,lv));
  }

  function classification(e){
    if(!e)return null;
    if(e.isWorldCrystalBoss)return {key:'crystal',chance:RES.crystal.chance};
    if(typeof P==='undefined'||!P||P.scene!=='dungeon')return null;
    if(e.isFartGuard||e.isClanBoss||e.isClanSiegeCrystal||e.__ppaArenaPlayer||e.isAiFighter)return null;

    if(e.isDungeon60Boss)return {key:'blood',chance:0.04};
    if(e.isDungeon21Boss)return {key:'blood',chance:0.025};
    if(e.isDungeonPhoenixBoss)return {key:'blood',chance:0.015};

    var lv=dungeonLevel(e);
    if(lv<1||lv>60)return null;
    if(e.isDungeonElite)return {key:'fire',chance:RES.fire.chance};
    if(e.isBoss)return null;
    return {key:'demonic',chance:RES.demonic.chance};
  }

  function pushEventMaterial(e,key){
    var d=RES[key];if(!d||typeof LOOT==='undefined'||!Array.isArray(LOOT))return false;
    LOOT.push({
      x:Number(e.x||0)+(Math.random()-.5)*34,
      y:Number(e.y||0)+(Math.random()-.5)*34,
      kind:'material',
      name:d.name,
      rarity:d.rarity,
      src:d.src||((typeof MATERIAL_DB==='object'&&MATERIAL_DB[d.name]&&MATERIAL_DB[d.name].src)||''),
      amount:1,
      bob:Math.random()*6,
      ruriEventResource:true,
      eventId:'great_ruri_monthly'
    });
    return true;
  }

  // Loaded after boss-drop-boost.js on purpose. The base wrapper may do its 50%
  // bonus boss roll internally, then Ruri gets exactly ONE independent event roll.
  function installDropRoll(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaRuriEventDrops)return;
      var base=dropLoot;
      var wrapped=function(e){
        var result=base.apply(this,arguments);
        if(!active()||!eligibleReward(e))return result;
        var c=classification(e);
        if(!c||c.key==='crystal')return result; // world boss has its own personal roll.
        if(Math.random()<c.chance)pushEventMaterial(e,c.key);
        return result;
      };
      wrapped.__ppaRuriEventDrops=1;
      wrapped.__ppaRuriEventDropsBase=base;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  function fmtPct(p){
    var v=Number(p)*100;
    if(v>=1)return String(v).replace(/\.0+$/,'')+'%';
    if(v>=.1)return v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'%';
    return v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')+'%';
  }

  function installDropInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaRuriEventInfo)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var rows=base.apply(this,arguments);
        if(!Array.isArray(rows)||!active())return rows;
        var c=classification(e);if(!c)return rows;
        var d=RES[c.key];if(!d)return rows;
        var out=rows.map(function(r){return Array.isArray(r)?r.slice():r});
        var exists=out.some(function(r){return Array.isArray(r)&&String(r[0]||'')===d.name});
        if(!exists)out.push([d.name,fmtPct(c.chance)]);
        return out;
      };
      wrapped.__ppaRuriEventInfo=1;
      wrapped.__ppaRuriEventInfoBase=base;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
    }catch(_){}
  }

  function grantWorldBossCrystal(){
    var d=RES.crystal;
    try{
      if(typeof INV!=='object'||!INV)return false;
      INV.materials=(INV.materials&&typeof INV.materials==='object')?INV.materials:{};
      INV.materials[d.name]=(INV.materials[d.name]||0)+1;
      try{if(typeof scheduleCombatSave==='function')scheduleCombatSave()}catch(_){}
      try{if(typeof sendInvState==='function')sendInvState()}catch(_){}
      try{if(typeof saveGame==='function')saveGame()}catch(_){}
      setTimeout(function(){try{if(typeof showPickup==='function')showPickup('❄ '+d.name+' +1','#bfe9ff')}catch(_){}},160);
      return true;
    }catch(_){return false}
  }

  function installWorldBossRoll(){
    try{
      if(typeof worldBossSpawnPersonalChests!=='function'||worldBossSpawnPersonalChests.__ppaRuriEventDrop)return;
      var base=worldBossSpawnPersonalChests;
      var wrapped=function(){
        // Roll BEFORE base: base immediately performs its normal save/sync after the guaranteed Titan shard.
        var won=active()&&Math.random()<RES.crystal.chance;
        if(won){
          try{
            if(typeof INV==='object'&&INV){
              INV.materials=(INV.materials&&typeof INV.materials==='object')?INV.materials:{};
              INV.materials[RES.crystal.name]=(INV.materials[RES.crystal.name]||0)+1;
            }
          }catch(_){won=false}
        }
        var result=base.apply(this,arguments);
        if(won)setTimeout(function(){try{if(typeof showPickup==='function')showPickup('❄ '+RES.crystal.name+' +1','#bfe9ff')}catch(_){}},220);
        return result;
      };
      wrapped.__ppaRuriEventDrop=1;
      wrapped.__ppaRuriEventDropBase=base;
      try{worldBossSpawnPersonalChests=wrapped}catch(_){}
      try{window.worldBossSpawnPersonalChests=wrapped}catch(_){}
    }catch(_){}
  }

  // Ruri event materials must never leak into Black Market's random material stock.
  function installBlackMarketFilter(){
    try{
      if(typeof blackMarketMaterialPool!=='function'||blackMarketMaterialPool.__ppaNoRuriEvent)return;
      var base=blackMarketMaterialPool;
      var wrapped=function(){
        var a=base.apply(this,arguments);
        return Array.isArray(a)?a.filter(function(name){return !BY_NAME[name]}):a;
      };
      wrapped.__ppaNoRuriEvent=1;
      try{blackMarketMaterialPool=wrapped}catch(_){}
      try{window.blackMarketMaterialPool=wrapped}catch(_){}
    }catch(_){}
  }

  function install(){
    registerMaterials();
    installDropRoll();
    installDropInfo();
    installWorldBossRoll();
    installBlackMarketFilter();
  }

  registerMaterials();
  install();
  setTimeout(install,250);
  setTimeout(install,900);

  window.PPA_RURI_EVENT_DROP_INFO={
    active:function(){return active()},
    schedule:scheduleInfo,
    resources:RES,
    classify:classification
  };
})();