(function(){
  'use strict';
  if(window.__PPA_MIMIC_SOMBRERO_EVENT_V1)return;
  window.__PPA_MIMIC_SOMBRERO_EVENT_V1=true;

  // TEST PHASE: the event is intentionally enabled for live QA.
  // Later this flag can be replaced by a calendar/server window.
  var TEST_ACTIVE=true;
  var EVENT_ID='mimic_sombrero_test';

  function svgData(body){
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(body);
  }
  function icon(bg,fg,accent,label){
    return svgData('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">'+
      '<defs><radialGradient id="g" cx="50%" cy="38%" r="58%"><stop offset="0" stop-color="'+accent+'"/><stop offset=".56" stop-color="'+bg+'"/><stop offset="1" stop-color="#130805"/></radialGradient></defs>'+
      '<rect x="4" y="4" width="88" height="88" rx="18" fill="url(#g)" stroke="#ffd36a" stroke-width="3"/>'+
      '<ellipse cx="48" cy="54" rx="31" ry="9" fill="'+fg+'" stroke="#2b1308" stroke-width="4"/>'+
      '<path d="M30 51c3-18 8-27 18-27s15 9 18 27c-9 5-27 5-36 0z" fill="'+fg+'" stroke="#2b1308" stroke-width="4"/>'+
      '<path d="M35 45c7 5 19 5 26 0" fill="none" stroke="#ffe28a" stroke-width="5" stroke-linecap="round"/>'+
      '<circle cx="39" cy="60" r="4" fill="#0b0705"/><circle cx="57" cy="60" r="4" fill="#0b0705"/>'+
      '<path d="M41 72c5 4 9 4 14 0" fill="none" stroke="#0b0705" stroke-width="4" stroke-linecap="round"/>'+
      '<text x="48" y="89" text-anchor="middle" font-size="16" font-family="monospace" font-weight="900" fill="#fff0b8">'+label+'</text>'+
      '</svg>');
  }

  var RES={
    coin:{name:'Монета Самбреро',rarity:'green',src:icon('#7b3b18','#d59635','#fff0a8','M')},
    chili:{name:'Огненный чили',rarity:'blue',src:icon('#431119','#d74224','#ffbf5c','C')},
    tooth:{name:'Зуб Мимика-Самбреро',rarity:'epic',src:icon('#241336','#b56cff','#ffe28a','Z')},
    gold:{name:'Золотое сомбреро',rarity:'legendary',src:icon('#44280a','#ffc83d','#fff5a3','S')}
  };
  var BY_NAME={};
  Object.keys(RES).forEach(function(k){BY_NAME[RES[k].name]=RES[k]});

  var PROFILES={
    normal:{label:'обычный моб',mimic:0.002,rolls:[['coin',0.035,1],['chili',0.006,1],['tooth',0.0008,1],['gold',0.00004,1]]},
    elite:{label:'элитный моб',mimic:0.025,rolls:[['coin',0.55,2],['chili',0.08,1],['tooth',0.015,1],['gold',0.0012,1]]},
    boss20:{label:'Феникс 20',mimic:0.06,rolls:[['coin',1,3],['chili',0.18,1],['tooth',0.04,1],['gold',0.003,1]]},
    boss40:{label:'Владыка 40',mimic:0.08,rolls:[['coin',1,5],['chili',0.24,1],['tooth',0.055,1],['gold',0.0045,1]]},
    boss60:{label:'Дракон 60',mimic:0.12,rolls:[['coin',1,8],['chili',0.32,2],['tooth',0.08,1],['gold',0.007,1]]},
    titan:{label:'Титан',mimic:0.16,rolls:[['coin',1,12],['chili',0.45,2],['tooth',0.11,1],['gold',0.012,1]]}
  };

  window.PPA_MIMIC_SOMBRERO_TEST_ACTIVE=TEST_ACTIVE;
  window.PPA_MIMIC_SOMBRERO_EVENT_ID=EVENT_ID;
  window.PPA_MIMIC_SOMBRERO_RESOURCES=RES;
  window.PPA_MIMIC_SOMBRERO_PROFILES=PROFILES;
  window.PPA_MIMIC_SOMBRERO_IS_ACTIVE=function(){return window.PPA_MIMIC_SOMBRERO_TEST_ACTIVE===true};
  window.PPA_SET_MIMIC_SOMBRERO_TEST_ACTIVE=function(v){window.PPA_MIMIC_SOMBRERO_TEST_ACTIVE=(v===true);return window.PPA_MIMIC_SOMBRERO_TEST_ACTIVE};

  function active(){try{return window.PPA_MIMIC_SOMBRERO_IS_ACTIVE()===true}catch(_){return false}}
  function rnd(n){return Math.max(1,Math.floor(Number(n)||1))}
  function fmtPct(p){
    var v=Number(p)*100;
    if(v>=1)return v.toFixed(v>=10?0:1).replace(/\.0$/,'')+'%';
    if(v>=.1)return v.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'%';
    if(v>=.01)return v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')+'%';
    return v.toFixed(4).replace(/0+$/,'').replace(/\.$/,'')+'%';
  }

  function registerMaterials(){
    try{
      if(typeof MATERIAL_DB!=='object'||!MATERIAL_DB)return;
      Object.keys(RES).forEach(function(k){
        var d=RES[k];
        MATERIAL_DB[d.name]=Object.assign({},MATERIAL_DB[d.name]||{},{
          rarity:d.rarity,
          src:d.src||'',
          eventId:EVENT_ID,
          eventResource:true,
          permanent:true
        });
        if(typeof MAT_IMG==='object'&&MAT_IMG&&!MAT_IMG[d.name]){
          MAT_IMG[d.name]=new Image();
          MAT_IMG[d.name].src=d.src;
        }
      });
    }catch(_){}
  }

  function eligibleReward(e){
    if(!e)return false;
    try{if(window.PPA_MOB_REWARD_ELIGIBLE&&!window.PPA_MOB_REWARD_ELIGIBLE(e))return false}catch(_){}
    return true;
  }
  function dungeonLevel(e){
    var lv=Math.floor(Number(e&&(e.roomLevel||e.lvl||e.level))||0);
    return Math.max(0,Math.min(60,lv));
  }
  function profileFor(e){
    if(!e)return null;
    if(e.isWorldCrystalBoss)return PROFILES.titan;
    if(typeof P==='undefined'||!P||P.scene!=='dungeon')return null;
    if(e.isFartGuard||e.isClanBoss||e.isClanSiegeCrystal||e.__ppaArenaPlayer||e.isAiFighter)return null;
    if(e.isDungeon60Boss)return PROFILES.boss60;
    if(e.isDungeon21Boss)return PROFILES.boss40;
    if(e.isDungeonPhoenixBoss)return PROFILES.boss20;
    if(e.isDungeonElite)return PROFILES.elite;
    if(e.isBoss)return null;
    var lv=dungeonLevel(e);
    if(lv<1||lv>60)return null;
    return PROFILES.normal;
  }

  function pushMaterial(e,key,amount,dx,dy){
    var d=RES[key];if(!d||typeof LOOT==='undefined'||!Array.isArray(LOOT))return false;
    LOOT.push({
      x:Number(e&&e.x||0)+(Number(dx)||0)+(Math.random()-.5)*26,
      y:Number(e&&e.y||0)+(Number(dy)||0)+(Math.random()-.5)*26,
      kind:'material',name:d.name,rarity:d.rarity,src:d.src,amount:rnd(amount),bob:Math.random()*6,
      mimicSombreroEvent:true,eventId:EVENT_ID
    });
    return true;
  }
  function show(text,color){try{if(typeof showPickup==='function')showPickup(String(text||''),color||'#ffd36a')}catch(_){} }

  function rollEvent(e,profile){
    var wonAny=false;
    (profile.rolls||[]).forEach(function(r,i){
      var key=r[0],chance=Number(r[1])||0,amount=rnd(r[2]||1);
      if(Math.random()<chance){
        pushMaterial(e,key,amount,(i-1.5)*12,(i%2)*10);
        wonAny=true;
      }
    });
    if(Math.random()<Number(profile.mimic||0)){
      pushMaterial(e,'coin',3+Math.floor(Math.random()*5),-18,-18);
      if(Math.random()<0.65)pushMaterial(e,'chili',1,18,-18);
      if(Math.random()<0.22)pushMaterial(e,'tooth',1,0,18);
      if(Math.random()<0.025)pushMaterial(e,'gold',1,22,22);
      show('🎭 Мимик-Самбреро раскрылся!','#ffd36a');
      wonAny=true;
    }else if(wonAny&&Math.random()<0.18){
      show('🌵 Событие Самбреро · добыча!','#e8d37a');
    }
    return wonAny;
  }

  function installDropRoll(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaMimicSombreroEvent)return;
      var base=dropLoot;
      var wrapped=function(e){
        var result=base.apply(this,arguments);
        if(!active()||!eligibleReward(e))return result;
        var p=profileFor(e);if(!p)return result;
        rollEvent(e,p);
        return result;
      };
      wrapped.__ppaMimicSombreroEvent=1;
      wrapped.__ppaMimicSombreroEventBase=base;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  function installDropInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaMimicSombreroInfo)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var rows=base.apply(this,arguments);
        if(!Array.isArray(rows)||!active())return rows;
        var p=profileFor(e);if(!p)return rows;
        var out=rows.map(function(r){return Array.isArray(r)?r.slice():r});
        out.push(['🎭 Мимик-Самбреро',fmtPct(p.mimic)+' · бонусный сундук']);
        (p.rolls||[]).forEach(function(r){
          var d=RES[r[0]];if(!d)return;
          var amt=rnd(r[2]||1),txt=fmtPct(r[1])+(amt>1?' · ×'+amt:'');
          out.push([d.name,txt]);
        });
        return out;
      };
      wrapped.__ppaMimicSombreroInfo=1;
      wrapped.__ppaMimicSombreroInfoBase=base;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
    }catch(_){}
  }

  function installBlackMarketFilter(){
    try{
      if(typeof blackMarketMaterialPool!=='function'||blackMarketMaterialPool.__ppaNoMimicSombrero)return;
      var base=blackMarketMaterialPool;
      var wrapped=function(){
        var a=base.apply(this,arguments);
        return Array.isArray(a)?a.filter(function(name){return !BY_NAME[name]}):a;
      };
      wrapped.__ppaNoMimicSombrero=1;
      try{blackMarketMaterialPool=wrapped}catch(_){}
      try{window.blackMarketMaterialPool=wrapped}catch(_){}
    }catch(_){}
  }

  function install(){registerMaterials();installDropRoll();installDropInfo();installBlackMarketFilter()}
  registerMaterials();install();setTimeout(install,250);setTimeout(install,900);

  window.PPA_MIMIC_SOMBRERO_EVENT={
    active:active,
    setActive:function(v){return window.PPA_SET_MIMIC_SOMBRERO_TEST_ACTIVE(v===true)},
    resources:RES,
    profileFor:profileFor
  };
})();