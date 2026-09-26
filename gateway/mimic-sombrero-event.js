(function(){
  'use strict';
  if(window.__PPA_MIMIC_SOMBRERO_EVENT_V2)return;
  window.__PPA_MIMIC_SOMBRERO_EVENT_V2=true;

  var EVENT_ID='mimic_sombrero';
  var TICKET='Билет Мимика-Самбреро';
  var TICKET_CHANCE=0.0047; // 0.47%
  var MONTHLY_START_DAY=25;
  var EVENT_DAYS=5;
  var DAY_MS=86400000;
  var SLOTS=['helmet','armor','gloves','legs','boots'];
  var SLOT_RU={helmet:'Шляпа Самбреро',armor:'Пончо',gloves:'Перчатки',legs:'Штаны',boots:'Сапоги'};
  var RARITY_RU={green:'зелёный',blue:'синий',epic:'эпический'};
  var DIFF={
    20:{level:20,hp:10000,damage:30,defense:22,rarity:'green',rewardChance:0.35,title:'Мимик-Самбреро 20',color:'#79e66f'},
    40:{level:40,hp:20000,damage:70,defense:52,rarity:'blue',rewardChance:0.25,title:'Мимик-Самбреро 40',color:'#75b9ff'},
    60:{level:60,hp:50000,damage:160,defense:120,rarity:'epic',rewardChance:0.16,title:'Мимик-Самбреро 60',color:'#d58cff'}
  };
  var COMBAT={
    attackEvery:2200,
    critChance:0.10,
    critMult:1.5,
    skillMin:9000,
    skillMax:12000,
    skillWindup:800,
    skillMul:1.2,
    slowMul:0.80,
    slowMs:2000
  };
  var EXTRA_REWARDS={
    20:{stones:[[1,.03],[2,.007]],potion:.03},
    40:{stones:[[1,.04],[2,.01],[3,.0025]],potion:.04},
    60:{stones:[[1,.05],[2,.015],[3,.005],[4,.001]],potion:.05}
  };

  function scheduleInfo(now){
    now=Number(now)||Date.now();
    var d=new Date(now),y=d.getUTCFullYear(),m=d.getUTCMonth();
    var start=Date.UTC(y,m,MONTHLY_START_DAY,0,0,0,0),end=start+EVENT_DAYS*DAY_MS;
    if(now<start){
      var py=m===0?y-1:y,pm=m===0?11:m-1;
      var ps=Date.UTC(py,pm,MONTHLY_START_DAY,0,0,0,0),pe=ps+EVENT_DAYS*DAY_MS;
      if(now>=ps&&now<pe){start=ps;end=pe}
    }
    var activeNow=now>=start&&now<end;
    var nextStart=activeNow?start:(now<start?start:Date.UTC(m===11?y+1:y,m===11?0:m+1,MONTHLY_START_DAY,0,0,0,0));
    return {active:activeNow,start:start,end:end,nextStart:nextStart,startDay:MONTHLY_START_DAY,days:EVENT_DAYS};
  }
  function testMode(){return window.PPA_MIMIC_SOMBRERO_TEST_MODE===true}
  function active(){return testMode()||scheduleInfo().active}
  window.PPA_MIMIC_SOMBRERO_TEST_MODE=false;
  window.PPA_MIMIC_SOMBRERO_IS_ACTIVE=active;
  window.PPA_SET_MIMIC_SOMBRERO_TEST_MODE=function(v){window.PPA_MIMIC_SOMBRERO_TEST_MODE=(v===true);return active()};

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function save(){try{if(typeof scheduleCombatSave==='function')scheduleCombatSave()}catch(_){}try{if(typeof sendInvState==='function')sendInvState()}catch(_){}try{if(typeof sendStorageState==='function')sendStorageState()}catch(_){}try{if(typeof sendBlacksmithState==='function')sendBlacksmithState()}catch(_){}try{if(typeof saveGame==='function')saveGame()}catch(_){}}
  function matBag(){try{if(typeof INV!=='object'||!INV)return null;INV.materials=(INV.materials&&typeof INV.materials==='object')?INV.materials:{};return INV.materials}catch(_){return null}}
  function matCount(n){var m=matBag();return m?Math.max(0,Number(m[n])||0):0}
  function addMat(n,a){var m=matBag();if(!m)return false;m[n]=(Math.max(0,Number(m[n])||0)+Math.max(1,Math.floor(Number(a)||1)));save();return true}
  function takeMat(n,a){var m=matBag();a=Math.max(1,Math.floor(Number(a)||1));if(!m||Math.max(0,Number(m[n])||0)<a)return false;m[n]=Math.max(0,Number(m[n])||0)-a;if(m[n]<=0)delete m[n];save();return true}
  var TICKET_SRC='/assets/mimic-sombrero-ticket.webp?v=v617';
  var MIMIC_ART_VERSION='v628-approved-set';
  var GEAR_SRC={
    green:{
      helmet:'/assets/mimic-sombrero/mimic-sombrero-green-helmet.webp?v='+MIMIC_ART_VERSION,
      armor:'/assets/mimic-sombrero/mimic-sombrero-green-armor.webp?v='+MIMIC_ART_VERSION,
      gloves:'/assets/mimic-sombrero/mimic-sombrero-green-gloves.webp?v='+MIMIC_ART_VERSION,
      legs:'/assets/mimic-sombrero/mimic-sombrero-green-legs.webp?v='+MIMIC_ART_VERSION,
      boots:'/assets/mimic-sombrero/mimic-sombrero-green-boots.webp?v='+MIMIC_ART_VERSION
    },
    blue:{
      helmet:'/assets/mimic-sombrero/mimic-sombrero-blue-helmet.webp?v='+MIMIC_ART_VERSION,
      armor:'/assets/mimic-sombrero/mimic-sombrero-blue-armor.webp?v='+MIMIC_ART_VERSION,
      gloves:'/assets/mimic-sombrero/mimic-sombrero-blue-gloves.webp?v='+MIMIC_ART_VERSION,
      legs:'/assets/mimic-sombrero/mimic-sombrero-blue-legs.webp?v='+MIMIC_ART_VERSION,
      boots:'/assets/mimic-sombrero/mimic-sombrero-blue-boots.webp?v='+MIMIC_ART_VERSION
    },
    epic:{
      helmet:'/assets/mimic-sombrero/mimic-sombrero-epic-helmet.webp?v='+MIMIC_ART_VERSION,
      armor:'/assets/mimic-sombrero/mimic-sombrero-epic-armor.webp?v='+MIMIC_ART_VERSION,
      gloves:'/assets/mimic-sombrero/mimic-sombrero-epic-gloves.webp?v='+MIMIC_ART_VERSION,
      legs:'/assets/mimic-sombrero/mimic-sombrero-epic-legs.webp?v='+MIMIC_ART_VERSION,
      boots:'/assets/mimic-sombrero/mimic-sombrero-epic-boots.webp?v='+MIMIC_ART_VERSION
    }
  };

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
    if(e.isFartGuard||e.isClanBoss||e.isClanSiegeCrystal||e.__ppaArenaPlayer||e.isAiFighter||e.isDungeonElite||e.isBoss||e.isDungeonPhoenixBoss||e.isDungeon21Boss||e.isDungeon60Boss)return false;
    var lv=Math.max(0,Math.min(60,Math.floor(Number(e.roomLevel||e.lvl||e.level)||0)));
    return lv>=1&&lv<=60;
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
      var wrapped=function(e){var r=base.apply(this,arguments);var chance=testMode()?1:TICKET_CHANCE;if(eligible(e)&&Math.random()<chance)dropTicket(e);return r};
      wrapped.__ppaMimicSombreroTicket=1;wrapped.__ppaMimicSombreroTicketBase=base;
      try{dropLoot=wrapped}catch(_){}try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }
  function installDropInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaMimicSombreroInfo)return;
      var base=mobDropInfo;
      var wrapped=function(e){var rows=base.apply(this,arguments);if(!Array.isArray(rows)||!eligible(e))return rows;var out=rows.map(function(x){return Array.isArray(x)?x.slice():x});out.push([TICKET,(testMode()?'100% · ТЕСТ':'0.47% · событие')]);return out};
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
  function nativeRarity(tier){tier=String(tier||'green').toLowerCase();return tier==='green'?'uncommon':(tier==='blue'?'rare':'epic')}
  function eventTierFromItem(it){
    if(!it)return'green';
    var t=String(it.mimicTier||'').toLowerCase();if(t==='green'||t==='blue'||t==='epic')return t;
    var r=String(it.rarity||'').toLowerCase();
    if(r==='uncommon'||r==='green')return'green';
    if(r==='rare'||r==='blue')return'blue';
    if(r==='epic')return'epic';
    var lv=Math.max(0,Number(it.level||it.lvl)||0);
    return lv>=60?'epic':(lv>=40?'blue':'green');
  }
  function nativeGearForSlot(level,tier,slot){
    var rarity=nativeRarity(tier),last=null;
    try{
      if(typeof genItem==='function'){
        for(var i=0;i<80;i++){
          var x=genItem(level,false,rarity);
          if(!x)continue;
          last=x;
          if(String(x.slot||'')===String(slot||''))return x;
        }
      }
    }catch(_){}
    return last;
  }
  function hydrateMimicItem(it,level,tier,slot){
    if(!it||typeof it!=='object')it={};
    level=Math.max(1,Math.min(60,Math.floor(Number(level||it.level||it.lvl)||20)));
    tier=String(tier||eventTierFromItem(it)).toLowerCase();
    slot=String(slot||it.slot||SLOTS[0]).toLowerCase();
    if(SLOTS.indexOf(slot)<0)slot=SLOTS[0];

    var oldUid=String(it.uid||it.id||''),oldEnh=Math.max(0,Math.floor(Number(it.enh)||0));
    var native=nativeGearForSlot(level,tier,slot),nativeBaseStats=null;
    if(native&&typeof native==='object'){
      var _base=(native.enhBaseStats&&typeof native.enhBaseStats==='object')?native.enhBaseStats:native.stats;
      if(_base&&typeof _base==='object')nativeBaseStats=Object.assign({},_base);
      Object.keys(native).forEach(function(k){it[k]=native[k]});
      if(nativeBaseStats)it.enhBaseStats=Object.assign({},nativeBaseStats);
    }else{
      if(!it.stats||typeof it.stats!=='object')it.stats={};
      if(oldEnh<=0&&!it.enhBaseStats)it.enhBaseStats=Object.assign({},it.stats);
    }

    var uid=oldUid||('mimic:'+level+':'+slot+':'+Date.now().toString(36)+':'+Math.random().toString(36).slice(2,7));
    var art=(GEAR_SRC[tier]&&GEAR_SRC[tier][slot])||(GEAR_SRC.green&&GEAR_SRC.green[slot])||'';
    it.uid=uid;it.id=uid;it.slot=slot;it.kind='gear';it.type='gear';
    it.name=SLOT_RU[slot]+' Самбреро';it.n=it.name;
    // Stats are generated from the event tier's reference level, but Mimic
    // equipment itself has NO level label/requirement.
    delete it.level;delete it.lvl;delete it.reqLevel;delete it.requiredLevel;delete it.minLevel;delete it.needLevel;delete it.levelReq;
    it.rarity=nativeRarity(tier);it.mimicTier=tier;
    it.classKey='all';it.className='Все классы';it.cls='all';
    it.setId='mimic_sombrero';it.ppaMimicSombrero=true;it.ppaMimicNativeV1=true;it.ppaMimicArtV=2;
    it.enh=oldEnh;it.sell=0;it.img=art;it.src=art;it.image=art;it.art=art;it.iconArt=art;it.cardArt=art;
    it.desc='Ивентовый общий сет Мимика-Самбреро · статы как у обычного шмота этой редкости · подходит всем классам.';
    var pieceRate=tier==='epic'?0.014:(tier==='blue'?0.01:0.004);
    it.mimicGoldBonus=pieceRate;
    it.mimicDropBonus=pieceRate;
    it.mimicGoldBonusPct=pieceRate*100;
    it.mimicDropBonusPct=pieceRate*100;
    it.ppaMimicStatsV=3;
    // Bonus is rendered as two normal stat rows in the item card.
    // Keep bonusText empty so the old explanatory box is not shown.
    it.bonusText='';
    try{if(typeof applyEnhancementStats==='function')applyEnhancementStats(it)}catch(_){}
    try{if(typeof syncItemBM==='function')syncItemBM(it)}catch(_){}
    return it;
  }
  function makeGear(d){
    var slot=SLOTS[Math.floor(Math.random()*SLOTS.length)],tier=d.rarity,lvl=d.level;
    return hydrateMimicItem({},lvl,tier,slot);
  }
  function grantGear(d){
    var it=makeGear(d),gs=gearStore(),where='премиум-хранилище';
    try{
      if(typeof normalizeStorage==='function')normalizeStorage();
      if(typeof INV==='object'&&INV){
        INV.storage=(INV.storage&&typeof INV.storage==='object')?INV.storage:{personal:[],clan:[],premium:[]};
        if(!Array.isArray(INV.storage.premium))INV.storage.premium=[];
        if(INV.storage.premium.length<50)INV.storage.premium.unshift(it);
        else if(Array.isArray(INV.bag)&&INV.bag.length<100){INV.bag.unshift(it);where='сумка'}
        else{where='резерв наград события';if(gs)gs.items.unshift(it)}
      }
    }catch(_){where='резерв наград события';if(gs)gs.items.unshift(it)}
    save();
    try{if(typeof showPickup==='function')showPickup('🎭 '+it.name+' · '+RARITY_RU[d.rarity]+' → '+where,'#ffd36a')}catch(_){}
    return {item:it,where:where};
  }
  function normalizeOwnedMimicGear(){
    var changed=false;
    function one(it){
      if(!it||!it.ppaMimicSombrero)return;
      var tier=eventTierFromItem(it);
      var slot=String(it.slot||SLOTS[0]).toLowerCase();
      if(SLOTS.indexOf(slot)<0)slot=SLOTS[0];
      var wanted=(GEAR_SRC[tier]&&GEAR_SRC[tier][slot])||(GEAR_SRC.green&&GEAR_SRC.green[slot])||'';
      var current=String(it.img||it.src||it.image||it.art||it.iconArt||it.cardArt||'');
      if(it.ppaMimicNativeV1&&Number(it.ppaMimicArtV)===2&&Number(it.ppaMimicStatsV)===3&&current===wanted){
        try{
          if(it.enhBaseStats&&typeof it.enhBaseStats==='object'&&typeof applyEnhancementStats==='function'){
            var _before=JSON.stringify(it.stats||{});
            applyEnhancementStats(it);
            if(typeof syncItemBM==='function')syncItemBM(it);
            if(JSON.stringify(it.stats||{})!==_before)changed=true;
          }
        }catch(_){}
        return;
      }
      var lvl=tier==='epic'?60:(tier==='blue'?40:20);
      hydrateMimicItem(it,lvl,tier,slot);
      changed=true;
    }
    function arr(a){if(!Array.isArray(a))return;a.forEach(one)}
    try{
      if(typeof INV==='object'&&INV){
        arr(INV.bag);
        if(INV.storage){arr(INV.storage.personal);arr(INV.storage.clan);arr(INV.storage.premium)}
        if(INV.equipped)Object.keys(INV.equipped).forEach(function(k){one(INV.equipped[k])});
        if(INV.equip)Object.keys(INV.equip).forEach(function(k){one(INV.equip[k])});
        if(INV.mimicSombreroGear)arr(INV.mimicSombreroGear.items);
        if(Array.isArray(INV.auctionLots))INV.auctionLots.forEach(function(lot){
          try{var g=lot&&lot.item&&(lot.item.gear||lot.item);one(g)}catch(_){}
        });
      }
    }catch(_){}
    if(changed)save();
    return changed;
  }
  function equippedMimicItems(){
    var seen={};
    function scan(o){try{if(!o||typeof o!=='object')return;Object.keys(o).forEach(function(k){var it=o[k];if(it&&it.ppaMimicSombrero&&it.slot&&!seen[it.slot])seen[it.slot]=it})}catch(_){}}
    try{if(typeof INV==='object'&&INV){scan(INV.equipped);scan(INV.equip)}}catch(_){}
    try{if(typeof P==='object'&&P){scan(P.equipped);scan(P.equip)}}catch(_){}
    return Object.keys(seen).map(function(k){return seen[k]});
  }
  function setPieceRate(it){
    var t=eventTierFromItem(it);
    return t==='epic'?0.014:(t==='blue'?0.01:0.004);
  }
  function setBonus(){
    var a=equippedMimicItems(),g=0,d=0,tiers={green:0,blue:0,epic:0};
    a.forEach(function(it){var t=eventTierFromItem(it),v=setPieceRate(it);tiers[t]=(tiers[t]||0)+1;g+=v;d+=v});
    return{pieces:a.length,gold:g,drop:d,tiers:tiers};
  }
  window.PPA_MIMIC_SOMBRERO_SET_BONUS=setBonus;
  window.PPA_MIMIC_SOMBRERO_NORMALIZE_GEAR=normalizeOwnedMimicGear;

  // Real set bonuses, not UI-only:
  // green 0.4%/piece = 2% full set
  // blue  1.0%/piece = 5% full set
  // epic  1.4%/piece = 7% full set
  function setBonusSafe(){
    try{
      var b=setBonus();
      return{
        gold:Math.max(0,Math.min(.07,Number(b&&b.gold)||0)),
        drop:Math.max(0,Math.min(.07,Number(b&&b.drop)||0))
      };
    }catch(_){return{gold:0,drop:0}}
  }

  function installSetDropBonus(){
    try{
      if(typeof rewardDropMul!=='function'||rewardDropMul.__ppaMimicSetDropBonus)return false;
      var base=rewardDropMul;
      var wrapped=function(){
        var v=Number(base.apply(this,arguments));
        if(!Number.isFinite(v))v=1;
        return v*(1+setBonusSafe().drop);
      };
      wrapped.__ppaMimicSetDropBonus=1;
      wrapped.__ppaMimicSetDropBase=base;
      try{rewardDropMul=wrapped}catch(_){}
      try{window.rewardDropMul=wrapped}catch(_){}
      return true;
    }catch(_){return false}
  }

  var _goldCarry=0;
  function goldRef(){
    var roots=[];
    try{if(typeof INV==='object'&&INV)roots.push(INV)}catch(_){}
    try{if(typeof P==='object'&&P)roots.push(P)}catch(_){}
    var keys=['gold','coins','money','coin','zoloto'];
    for(var i=0;i<roots.length;i++){
      var o=roots[i];
      for(var j=0;j<keys.length;j++){
        var k=keys[j];
        if(typeof o[k]==='number'&&Number.isFinite(o[k]))return{obj:o,key:k};
      }
    }
    return null;
  }
  function isGoldLoot(q){
    if(!q||typeof q!=='object')return false;
    var kind=String(q.kind||q.type||'').toLowerCase();
    var name=String(q.name||q.n||q.title||'').toLowerCase();
    return kind==='gold'||kind==='coin'||kind==='coins'||kind==='money'||/золот|gold/.test(name);
  }
  function addGoldExtra(base,rate){
    base=Math.max(0,Number(base)||0);
    var raw=base*rate+_goldCarry;
    var extra=Math.floor(raw+1e-9);
    _goldCarry=raw-extra;
    return extra;
  }
  function scaleGoldLootFrom(start,rate){
    var changed=false;
    try{
      if(typeof LOOT==='undefined'||!Array.isArray(LOOT))return false;
      start=Math.max(0,Math.min(LOOT.length,Number(start)||0));
      for(var i=start;i<LOOT.length;i++){
        var q=LOOT[i];
        if(!isGoldLoot(q))continue;
        var keys=['amount','qty','count','value','gold'];
        for(var j=0;j<keys.length;j++){
          var k=keys[j];
          if(typeof q[k]==='number'&&Number.isFinite(q[k])&&q[k]>0){
            q[k]+=addGoldExtra(q[k],rate);
            changed=true;
            break;
          }
        }
      }
    }catch(_){}
    return changed;
  }
  function installSetGoldBonus(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaMimicSetGoldBonus)return false;
      var base=dropLoot;
      var wrapped=function(){
        var rate=setBonusSafe().gold;
        if(rate<=0)return base.apply(this,arguments);
        var start=0;
        try{if(typeof LOOT!=='undefined'&&Array.isArray(LOOT))start=LOOT.length}catch(_){}
        var ref=goldRef(),before=ref?Number(ref.obj[ref.key])||0:0;
        var result=base.apply(this,arguments);
        var lootAdjusted=scaleGoldLootFrom(start,rate);
        if(!lootAdjusted&&ref){
          var after=Number(ref.obj[ref.key])||0;
          var gained=after-before;
          if(gained>0)ref.obj[ref.key]=after+addGoldExtra(gained,rate);
        }
        return result;
      };
      wrapped.__ppaMimicSetGoldBonus=1;
      wrapped.__ppaMimicSetGoldBase=base;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
      return true;
    }catch(_){return false}
  }
  function installSetRewardBonuses(){
    installSetDropBonus();
    installSetGoldBonus();
  }

  function pct(v){return (Math.round(Number(v||0)*10000)/100).toFixed((Number(v||0)*100)%1?2:0)+'%'}
  function rewardRows(lv){
    var d=DIFF[Number(lv)]||DIFF[20],ex=EXTRA_REWARDS[d.level]||{stones:[],potion:0};
    var rows=[['Случайная часть '+RARITY_RU[d.rarity]+' общего сета',pct(testMode()?1:d.rewardChance)+' · 1 случайная часть']];
    ex.stones.forEach(function(x){rows.push(['Премиум камень заточки ×'+x[0],pct(testMode()?1:x[1])])});
    rows.push(['Премиум банка HP или MP ×1',pct(testMode()?1:ex.potion)]);
    return rows;
  }
  function rollBossRewards(lv){
    var d=DIFF[Number(lv)]||null;if(!d)return null;
    var ex=EXTRA_REWARDS[d.level],out={level:d.level,gear:null,premiumStones:[],premiumPotion:false};
    if(Math.random()<(testMode()?1:d.rewardChance))out.gear=grantGear(d);
    ex.stones.forEach(function(x){if(Math.random()<(testMode()?1:x[1]))out.premiumStones.push(x[0])});
    if(Math.random()<(testMode()?1:ex.potion))out.premiumPotion=true;
    return out;
  }
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

  function install(){registerMaterials();normalizeOwnedMimicGear();installDropRoll();installDropInfo();installBlackMarketFilter();installSetRewardBonuses()}
  registerMaterials();install();setTimeout(install,250);setTimeout(install,900);setTimeout(install,1800);setTimeout(install,3200);
  window.PPA_MIMIC_SOMBRERO_DIAG=function(){
    var drop=false,info=false;
    try{drop=!!(typeof dropLoot==='function'&&dropLoot.__ppaMimicSombreroTicket)}catch(_){}
    try{info=!!(typeof mobDropInfo==='function'&&mobDropInfo.__ppaMimicSombreroInfo)}catch(_){}
    var setDrop=false,setGold=false;
    try{setDrop=!!(typeof rewardDropMul==='function'&&rewardDropMul.__ppaMimicSetDropBonus)}catch(_){}
    try{setGold=!!(typeof dropLoot==='function'&&dropLoot.__ppaMimicSetGoldBonus)}catch(_){}
    return {active:active(),test:testMode(),ticketChance:testMode()?1:TICKET_CHANCE,dropHook:drop,infoHook:info,setDropHook:setDrop,setGoldHook:setGold,setBonus:setBonus(),tickets:ticketCount()};
  };
  window.PPA_MIMIC_SOMBRERO_EVENT={
    active:active,
    schedule:scheduleInfo,
    testMode:testMode,
    ticket:TICKET,
    ticketChance:TICKET_CHANCE,
    ticketCount:ticketCount,
    consumeTicket:consumeTicket,
    open:openArena,
    grantTicket:function(n){return addMat(TICKET,n||1)},
    grantGear:grantGear,
    rewardRows:rewardRows,
    rollBossRewards:rollBossRewards,
    extraRewards:EXTRA_REWARDS,
    combat:COMBAT,
    bonus:setBonus,
    difficulties:DIFF
  };
})();