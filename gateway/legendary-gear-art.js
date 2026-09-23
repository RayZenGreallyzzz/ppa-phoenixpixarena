(function(){
  'use strict';

  var ART_BASE='/assets/legendary/';
  var ART_VER='v509';
  var CLASS_ROWS={tank:0,paladin:1,barbarian:2,assassin:3,gnome:4,archer:5,mage:6,priest:7};
  var SLOT_COLS={weapon:0,helmet:1,armor:2,legs:3,gloves:4,boots:5};
  var CLASS_ALIASES={
    tank:'tank',warrior:'tank',воин:'tank',танк:'tank',
    paladin:'paladin',паладин:'paladin',
    barbarian:'barbarian',berserk:'barbarian',berserker:'barbarian',варвар:'barbarian',берсерк:'barbarian',берсеркер:'barbarian',
    assassin:'assassin',ассасин:'assassin',асасин:'assassin',
    gnome:'gnome',gunner:'gnome',cannoner:'gnome',канонир:'gnome',гном:'gnome','гном-канонир':'gnome',
    archer:'archer',лучник:'archer',
    mage:'mage',маг:'mage',
    priest:'priest',cleric:'priest',healer:'priest',жрец:'priest',клирик:'priest'
  };
  var lastScan=0;

  function key(v){return String(v==null?'':v).trim().toLowerCase()}
  function alias(v){var k=key(v);return CLASS_ALIASES[k]||''}

  function playerClassKey(){
    try{
      var p=window.P||{};
      var vals=[p.classKey,p.classId,p.class,p.cls,p.className,p.profession,p.job];
      for(var i=0;i<vals.length;i++){var c=alias(vals[i]);if(c)return c}
    }catch(_){}
    return '';
  }

  function classKey(it){
    if(!it)return '';
    var vals=[it.classKey,it.classId,it.class,it.cls,it.ownerClass,it.reqClass,it.className,it.profession,it.job];
    for(var i=0;i<vals.length;i++){var c=alias(vals[i]);if(c)return c}
    var text=key((it.name||'')+' '+(it.className||'')+' '+(it.desc||'')+' '+(it.reqClass||''));
    var tests=[
      ['paladin',/паладин|paladin/],
      ['barbarian',/берсерк|берсеркер|варвар|barbarian|berserk/],
      ['assassin',/ассасин|асасин|assassin/],
      ['gnome',/гном|канонир|gnome|gunner|cannoner/],
      ['archer',/лучник|archer/],
      ['mage',/маг|mage/],
      ['priest',/жрец|клирик|priest|cleric|healer/],
      ['tank',/танк|воин|tank|warrior/]
    ];
    for(var j=0;j<tests.length;j++)if(tests[j][1].test(text))return tests[j][0];
    return playerClassKey();
  }

  function slotKey(it){
    var s=key(it&&(it.slot||it.type||it.equipSlot));
    if(s==='pants'||s==='leggings'||s==='leg'||s==='поножи')s='legs';
    if(s==='helm'||s==='head'||s==='шлем')s='helmet';
    if(s==='chest'||s==='body'||s==='броня')s='armor';
    if(s==='glove'||s==='hands'||s==='перчатки')s='gloves';
    if(s==='boot'||s==='feet'||s==='сапоги')s='boots';
    if(s==='оружие')s='weapon';
    if(Object.prototype.hasOwnProperty.call(SLOT_COLS,s))return s;
    var text=key((it&&it.name)||'');
    if(/шлем|helm|helmet/.test(text))return 'helmet';
    if(/брон|доспех|кирас|armor|chest/.test(text))return 'armor';
    if(/понож|штаны|брюки|legs|pants|leggings/.test(text))return 'legs';
    if(/перчат|рукавиц|glove|hands/.test(text))return 'gloves';
    if(/сапог|ботин|boots|feet/.test(text))return 'boots';
    if(/оруж|меч|клинок|кинжал|топор|лук|арбалет|посох|жезл|пушк|мушкет|молот|булав|weapon|sword|dagger|axe|bow|staff|cannon|gun/.test(text))return 'weapon';
    return '';
  }

  function isLegendary(it){
    if(!it)return false;
    var artHint=String(it.img||it.image||it.art||it.cardArt||it.iconArt||it.iconImg||it.src||'');
    if(it.ppaLegendaryReferenceArt===true||artHint.indexOf('/assets/legendary/')>=0)return true;
    var raw=(it.rarity!=null?it.rarity:(it.quality!=null?it.quality:(it.grade!=null?it.grade:it.r)));
    var r=key(raw);
    if(typeof raw==='number'&&isFinite(raw)&&(raw===4||raw===5))return true;
    if(r==='legendary'||r==='легендарный'||r==='легендарная'||r==='легендарное'||r==='legend'||r==='orange'||r==='gold'||r==='4'||r==='5')return true;
    if(/легендар|оранж/.test(r))return true;
    var text=key((it.name||'')+' '+(it.title||'')+' '+(it.qualityName||''));
    return /легендар|legendary/.test(text);
  }

  function art(cls,slot){
    cls=alias(cls)||key(cls)||playerClassKey();
    slot=slotKey({slot:slot});
    if(!Object.prototype.hasOwnProperty.call(CLASS_ROWS,cls)||!slot)return '';
    return ART_BASE+cls+'-'+slot+'.webp?v='+ART_VER;
  }

  function artForItem(it){
    try{
      if(!isLegendary(it))return '';
      var cls=classKey(it),slot=slotKey(it);
      return cls&&slot?art(cls,slot):'';
    }catch(_){return ''}
  }

  function hydrate(it){
    try{
      var src=artForItem(it);
      if(!src)return false;
      var changed=it.rarity!=='legendary'||it.img!==src||it.image!==src||it.art!==src||it.cardArt!==src||it.iconArt!==src||it.iconImg!==src||it.src!==src;
      it.rarity='legendary';
      it.img=src;it.image=src;it.art=src;it.cardArt=src;it.iconArt=src;it.iconImg=src;it.src=src;
      it.ppaLegendaryReferenceArt=true;
      return changed;
    }catch(_){return false}
  }

  function scanArray(a){
    var changed=false;
    if(!Array.isArray(a))return false;
    for(var i=0;i<a.length;i++)if(hydrate(a[i]))changed=true;
    return changed;
  }

  function hydrateAll(force){
    var now=Date.now();
    if(!force&&now-lastScan<700)return false;
    lastScan=now;
    var changed=false;
    try{
      if(typeof INV==='undefined'||!INV)return false;
      changed=scanArray(INV.bag)||changed;
      changed=scanArray(INV.items)||changed;
      if(INV.equipped)Object.keys(INV.equipped).forEach(function(k){if(hydrate(INV.equipped[k]))changed=true});
      if(INV.storage)Object.keys(INV.storage).forEach(function(k){changed=scanArray(INV.storage[k])||changed});
      if(Array.isArray(INV.auctionLots)){
        for(var ai=0;ai<INV.auctionLots.length;ai++){
          var lot=INV.auctionLots[ai];
          if(lot&&lot.item&&hydrate(lot.item))changed=true;
        }
      }
      if(changed){
        try{if(typeof renderInventory==='function')renderInventory()}catch(_){}
        try{if(typeof renderCharacter==='function')renderCharacter()}catch(_){}
        try{if(typeof sendAuctionState==='function')sendAuctionState()}catch(_){}
      }
    }catch(_){}
    return changed;
  }

  window.PPA_LEGENDARY_GEAR_ART=art;
  window.PPA_LEGENDARY_GEAR_ITEM_ART=artForItem;
  window.PPA_HYDRATE_LEGENDARY_GEAR_ART=function(){return hydrateAll(true)};
  window.PPA_LEGENDARY_GEAR_DIAG=function(){return {ready:true,mode:'real-webp-files',base:ART_BASE,version:ART_VER,classes:8,slots:6}};

  function boot(){
    hydrateAll(true);
    var tries=0,t=setInterval(function(){
      hydrateAll(false);
      if(++tries>80)clearInterval(t);
    },750);
    setInterval(function(){hydrateAll(false)},5000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();