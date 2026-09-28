(function(){
  'use strict';
  if(window.__PPA_NEWBIE_CHEST_RUNTIME_V1)return;
  window.__PPA_NEWBIE_CHEST_RUNTIME_V1=true;

  var ART='/assets/newbie-chest-gray.webp';
  var REF='newbie_chest_gray_v1';
  var SLOTS=['weapon','helmet','armor','gloves','ring','legs','boots'];
  var ACTIVE={
    tank:['tank_shield_bash','tank_taunt','tank_iron_wall','tank_crushing_strike'],
    barbarian:['barb_blood_split','barb_furious_charge','barb_battle_frenzy','barb_death_whirl'],
    paladin:['pal_righteous_strike','pal_holy_shield','pal_light_cleanse','pal_smite_wicked'],
    gnome:['gnome_explosive_shot','gnome_buckshot','gnome_powder_barrel','gnome_aimed_volley'],
    archer:['arch_piercing_shot','arch_arrow_rain','arch_hunter_net','arch_aimed_shot'],
    mage:['mage_fireball','mage_frost_flash','mage_chain_lightning','mage_teleport'],
    assassin:['assa_shadow_dash','assa_death_cross','assa_smoke_screen','assa_shadow_sentence'],
    priest:['priest_healing_light','priest_holy_barrier','priest_heaven_smite','priest_divine_rebirth']
  };
  var busy=false,selected=null;

  function isChest(it){
    return !!(it&&(
      it.newbieChest===true||
      String(it.refId||'')===REF||
      String(it.uid||'')===REF||
      String(it.name||'').toLowerCase()==='серый сундук новичка'
    ));
  }

  function hydrate(it){
    if(!isChest(it))return false;
    it.newbieChest=true;it.refId=REF;
    it.name='Серый сундук новичка';
    it.kind='newbieChest';it.rarity='common';it.rarityName='Обычный';
    it.icon='🎁';it.ic='🎁';it.img=ART;it.image=ART;it.art=ART;it.cardArt=ART;it.iconArt=ART;
    it.bound=true;it.tradeLocked=true;it.sell=0;
    it.desc='Полный серый комплект текущего класса · 4 активных гримуара I ранга · 100 малых HP · 100 малых MP.';
    return true;
  }

  function currentClass(){
    try{
      var ck=typeof currentGearClassKey==='function'?currentGearClassKey():'';
      if(ACTIVE[ck])return ck;
    }catch(_){}
    try{
      var ck2=typeof classKeyFromName==='function'?classKeyFromName(P&&P.cls):String(P&&P.cls||'').toLowerCase();
      if(ACTIVE[ck2])return ck2;
    }catch(_){}
    return '';
  }

  function fallbackStats(slot){
    if(slot==='weapon')return {atk:4,crit:1};
    if(slot==='helmet'||slot==='armor')return {def:3,hp:13};
    if(slot==='gloves')return {def:3};
    if(slot==='ring')return {crit:1,atk:4};
    if(slot==='legs')return {def:3,spd:.4};
    if(slot==='boots')return {spd:.4,def:3};
    return {};
  }

  function makeGear(slot,ck){
    var all=slot==='ring';
    var classKey=all?'all':ck;
    var stats={};
    try{
      if(typeof premiumGearBaseStats==='function')stats=premiumGearBaseStats(slot,'common',1)||{};
      else stats=fallbackStats(slot);
    }catch(_){stats=fallbackStats(slot)}
    var base='Предмет';
    try{
      if(slot==='ring')base='Кольцо';
      else if(CLASS_ITEM_NAMES&&CLASS_ITEM_NAMES[ck]&&CLASS_ITEM_NAMES[ck][slot])base=CLASS_ITEM_NAMES[ck][slot];
      else if(ITEM_DB&&ITEM_DB[slot]&&ITEM_DB[slot].names&&ITEM_DB[slot].names[0])base=ITEM_DB[slot].names[0];
    }catch(_){base=slot}
    var icon='◆';
    try{icon=(SLOT_FALLBACK_ICON&&SLOT_FALLBACK_ICON[slot])||icon}catch(_){}
    var img='';
    try{if(!all&&typeof classGearArt==='function')img=classGearArt('common',ck,slot)||''}catch(_){}
    var it={
      uid:'newbie_'+slot+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),
      name:base,slot:slot,rarity:'common',enh:0,icon:icon,ic:icon,img:img,
      classKey:classKey,className:all?'Все классы':((typeof CLASS_DISPLAY!=='undefined'&&CLASS_DISPLAY[ck])||ck),
      stats:stats,bm:0,sell:100,level:1,createdAt:Date.now(),
      weight:({weapon:7,helmet:4,armor:8,gloves:2,ring:1,legs:5,boots:3})[slot]||2,
      newbieGear:true,newbieKit:true
    };
    try{if(typeof syncItemBM==='function')syncItemBM(it);else if(typeof itemBM==='function')it.bm=itemBM(stats)}catch(_){}
    try{if(typeof refreshGearArt==='function')refreshGearArt(it)}catch(_){}
    return it;
  }

  function findChest(preferred){
    try{
      if(preferred&&INV.bag.indexOf(preferred)>=0&&isChest(preferred))return preferred;
      return (INV.bag||[]).find(isChest)||null;
    }catch(_){return null}
  }

  function sync(){
    try{saveGame()}catch(_){}
    try{sendInvState()}catch(_){}
    try{sendStorageState()}catch(_){}
    try{sendAuctionState()}catch(_){}
    try{updateSkillButtons()}catch(_){}
    try{updateUI()}catch(_){}
  }

  function openNow(preferred){
    if(busy)return false;
    var chest=findChest(preferred);
    if(!chest){try{showPickup('Сундук новичка уже открыт','#ffd16b')}catch(_){};return false}
    var ck=currentClass();
    if(!ck||!ACTIVE[ck]){
      try{showPickup('Не удалось определить класс персонажа','#ff7777')}catch(_){}
      return false;
    }
    var bag=INV.bag||[];
    var idx=bag.indexOf(chest);
    if(idx<0)return false;
    // Removing the chest frees one cell, then seven gear pieces are added.
    if((bag.length-1+SLOTS.length)>100){
      try{showPickup('Нужно минимум 6 свободных ячеек в сумке','#ff9b73')}catch(_){}
      return false;
    }

    busy=true;
    try{
      bag.splice(idx,1);
      SLOTS.forEach(function(slot){bag.push(makeGear(slot,ck))});

      INV.grimoires=INV.grimoires||{};
      INV.grimoireRankDrops=INV.grimoireRankDrops||{};
      ACTIVE[ck].forEach(function(id){
        INV.grimoires[id]=Math.max(0,Math.floor(Number(INV.grimoires[id])||0))+1;
        var raw=INV.grimoireRankDrops[id]||(INV.grimoireRankDrops[id]={1:0,2:0,3:0});
        raw[1]=Math.max(0,Math.floor(Number(raw[1])||0))+1;
      });

      INV.potions=INV.potions||{};
      var maxHp=Math.max(100,Math.floor(Number(INV.potions.maxHp)||999));
      var maxMp=Math.max(100,Math.floor(Number(INV.potions.maxMp)||999));
      INV.potions.hp=Math.min(maxHp,Math.max(0,Math.floor(Number(INV.potions.hp)||0))+100);
      INV.potions.mp=Math.min(maxMp,Math.max(0,Math.floor(Number(INV.potions.mp)||0))+100);
      INV.newbieKitOpened=true;
      sync();
      try{showPickup('НАБОР НОВИЧКА · СЕРЫЙ СЕТ + 4 КНИГИ + 100 HP + 100 MP','#d6d9df')}catch(_){}
      return true;
    }catch(e){
      console.error('PPA newbie chest open',e);
      try{showPickup('Не удалось открыть сундук новичка','#ff7777')}catch(_){}
      return false;
    }finally{busy=false}
  }

  function ensureModal(){
    var root=document.getElementById('ppaNewbieChestModal');
    if(root)return root;
    var style=document.createElement('style');
    style.id='ppaNewbieChestStyle';
    style.textContent=
      '#ppaNewbieChestModal{position:fixed;inset:0;z-index:2147483100;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.18);box-sizing:border-box}'+
      '#ppaNewbieChestCard{width:min(330px,82vw);padding:12px;border:2px solid #8f949c;border-radius:9px;background:linear-gradient(180deg,rgba(32,34,38,.98),rgba(12,13,15,.99));box-shadow:0 16px 44px rgba(0,0,0,.72),inset 0 0 30px rgba(255,255,255,.035);color:#e8e9eb;font-family:Georgia,serif;text-align:center}'+
      '#ppaNewbieChestCard img{width:112px;height:112px;object-fit:contain;filter:drop-shadow(0 8px 12px rgba(0,0,0,.65))}'+
      '#ppaNewbieChestCard h3{margin:2px 0 9px;color:#d7d9dd;font-size:18px}'+
      '#ppaNewbieChestCard .list{margin:0 0 10px;padding:8px 10px;border:1px solid rgba(170,175,184,.28);border-radius:7px;background:rgba(255,255,255,.035);font:700 11px/1.55 monospace;text-align:left;color:#cfd2d7}'+
      '#ppaNewbieChestCard .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
      '#ppaNewbieChestCard button{height:38px;border-radius:7px;border:1px solid #777d86;background:#272a2f;color:#e8e9eb;font-weight:800}'+
      '#ppaNewbieChestOpen{background:#4a4f57!important;border-color:#9ca2ab!important;color:#fff!important}';
    document.head.appendChild(style);
    root=document.createElement('div');
    root.id='ppaNewbieChestModal';
    root.innerHTML='<div id="ppaNewbieChestCard"><img src="'+ART+'" alt=""><h3>Серый сундук новичка</h3>'+
      '<div class="list">• полный серый комплект текущего класса<br>• 4 активных гримуара I ранга<br>• 100 малых зелий HP<br>• 100 малых зелий MP</div>'+
      '<div class="actions"><button id="ppaNewbieChestCancel" type="button">ОТМЕНА</button><button id="ppaNewbieChestOpen" type="button">ОТКРЫТЬ</button></div></div>';
    document.body.appendChild(root);
    document.getElementById('ppaNewbieChestCancel').onclick=function(){if(!busy){root.style.display='none';selected=null}};
    document.getElementById('ppaNewbieChestOpen').onclick=function(){
      if(busy||!selected)return;
      if(openNow(selected)){root.style.display='none';selected=null}
    };
    root.addEventListener('pointerdown',function(e){if(e.target===root&&!busy){root.style.display='none';selected=null}},{passive:true});
    return root;
  }

  function openConfirm(it){
    var chest=findChest(it);
    if(!chest)return false;
    hydrate(chest);selected=chest;
    ensureModal().style.display='flex';
    return true;
  }

  function refresh(){
    try{
      var groups=[INV.bag];
      if(INV.storage){groups.push(INV.storage.personal,INV.storage.clan,INV.storage.premium)}
      groups.forEach(function(arr){if(Array.isArray(arr))arr.forEach(hydrate)});
    }catch(_){}
  }

  // Keep the opened marker in cloud saves without changing older save formats.
  try{
    var oldBuild=window.ppaBuildSaveObject;
    if(typeof oldBuild==='function'&&!oldBuild.__ppaNewbieWrapped){
      var wrapped=function(){var o=oldBuild.apply(this,arguments);o.newbieKitOpened=!!INV.newbieKitOpened;return o};
      wrapped.__ppaNewbieWrapped=true;
      window.ppaBuildSaveObject=wrapped;
      try{ppaBuildSaveObject=wrapped}catch(_){}
    }
  }catch(_){}
  try{
    var raw=localStorage.getItem('pxSave')||localStorage.getItem('pxSaveLastGood')||'';
    var saved=raw?JSON.parse(raw):null;
    INV.newbieKitOpened=!!(saved&&saved.newbieKitOpened);
  }catch(_){INV.newbieKitOpened=false}

  window.PPA_NEWBIE_CHEST_ART=ART;
  window.PPA_IS_NEWBIE_CHEST=isChest;
  window.PPA_OPEN_NEWBIE_CHEST=openConfirm;
  window.PPA_OPEN_NEWBIE_CHEST_DIRECT=openNow;
  window.PPA_REFRESH_NEWBIE_CHEST=refresh;
  setTimeout(refresh,500);
  setTimeout(refresh,1800);
})();
