(function(){
  'use strict';

  var CLASS_ALIASES={
    tank:'tank', warrior:'tank', воин:'tank', танк:'tank',
    paladin:'paladin', паладин:'paladin',
    barbarian:'barbarian', berserk:'barbarian', berserker:'barbarian', варвар:'barbarian', берсерк:'barbarian', берсеркер:'barbarian',
    assassin:'assassin', ассасин:'assassin', асасин:'assassin',
    gnome:'gnome', gunner:'gnome', cannoner:'gnome', канонир:'gnome', гном:'gnome',
    archer:'archer', лучник:'archer',
    mage:'mage', маг:'mage',
    priest:'priest', cleric:'priest', healer:'priest', жрец:'priest', клирик:'priest'
  };
  var SLOTS={weapon:1,helmet:1,armor:1,legs:1,gloves:1,boots:1};

  function key(v){
    return String(v==null?'':v).trim().toLowerCase();
  }

  function classKey(it){
    if(!it)return '';
    var raw=[
      it.classKey,it.classId,it.class,it.cls,it.ownerClass,it.reqClass,it.className
    ];
    for(var i=0;i<raw.length;i++){
      var k=key(raw[i]);
      if(CLASS_ALIASES[k])return CLASS_ALIASES[k];
    }
    var text=key((it.name||'')+' '+(it.className||'')+' '+(it.desc||''));
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
    return '';
  }

  function slotKey(it){
    var s=key(it&&(it.slot||it.type||it.equipSlot));
    if(s==='pants'||s==='leggings'||s==='leg'||s==='поножи')s='legs';
    if(s==='helm'||s==='head'||s==='шлем')s='helmet';
    if(s==='chest'||s==='body'||s==='броня')s='armor';
    if(s==='glove'||s==='hands'||s==='перчатки')s='gloves';
    if(s==='boot'||s==='feet'||s==='сапоги')s='boots';
    if(s==='оружие')s='weapon';
    return SLOTS[s]?s:'';
  }

  function isLegendary(it){
    if(!it)return false;
    var r=key(it.rarity||it.quality||it.grade||it.r);
    return r==='legendary'||r==='легендарный'||r==='легендарная'||r==='легендарное'||r==='legend';
  }

  function art(cls,slot){
    cls=CLASS_ALIASES[key(cls)]||key(cls);
    slot=key(slot);
    if(!cls||!SLOTS[slot])return '';
    if(['tank','paladin','barbarian','assassin','gnome','archer','mage','priest'].indexOf(cls)<0)return '';
    return '/assets/legendary-'+cls+'-'+slot+'.svg';
  }

  function hydrate(it){
    try{
      if(!isLegendary(it))return false;
      var cls=classKey(it),slot=slotKey(it);
      if(!cls||!slot)return false;
      var src=art(cls,slot);
      if(!src||it.img===src)return false;
      it.img=src;
      it.image=src;
      it.art=src;
      it.ppaLegendaryReferenceArt=true;
      return true;
    }catch(_){return false}
  }

  function scanArray(a){
    var changed=false;
    if(!Array.isArray(a))return changed;
    for(var i=0;i<a.length;i++)if(hydrate(a[i]))changed=true;
    return changed;
  }

  function hydrateAll(){
    var changed=false;
    try{
      if(typeof INV==='undefined'||!INV)return false;
      changed=scanArray(INV.bag)||changed;
      changed=scanArray(INV.items)||changed;
      if(INV.equipped){
        Object.keys(INV.equipped).forEach(function(k){if(hydrate(INV.equipped[k]))changed=true});
      }
      if(INV.storage){
        Object.keys(INV.storage).forEach(function(k){changed=scanArray(INV.storage[k])||changed});
      }
      if(typeof window.PPA_ADMIN_EVENT_REWARD_STOCK==='function'){
        try{
          var stock=window.PPA_ADMIN_EVENT_REWARD_STOCK();
          changed=scanArray(stock)||changed;
        }catch(_){}
      }
      if(changed){
        try{if(typeof renderInventory==='function')renderInventory()}catch(_){}
        try{if(typeof renderCharacter==='function')renderCharacter()}catch(_){}
      }
    }catch(_){}
    return changed;
  }

  window.PPA_LEGENDARY_GEAR_ART=art;
  window.PPA_HYDRATE_LEGENDARY_GEAR_ART=hydrateAll;

  var tries=0;
  function boot(){
    hydrateAll();
    var t=setInterval(function(){
      hydrateAll();
      if(++tries>40)clearInterval(t);
    },750);
    setInterval(hydrateAll,5000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();