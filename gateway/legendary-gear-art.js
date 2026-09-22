(function(){
  'use strict';

  var ATLAS_SRC='/assets/legendary-gear-atlas.webp?v=v491';
  var CELL=48,COLS=6,ROWS=8,OUT=96,PAD=8;
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
  var atlas=new Image(),ready=false,cache=Object.create(null),lastScan=0;

  function key(v){return String(v==null?'':v).trim().toLowerCase()}

  function alias(v){
    var k=key(v);
    return CLASS_ALIASES[k]||'';
  }

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
    return Object.prototype.hasOwnProperty.call(SLOT_COLS,s)?s:'';
  }

  function isLegendary(it){
    if(!it)return false;
    var r=key(it.rarity||it.quality||it.grade||it.r);
    return r==='legendary'||r==='легендарный'||r==='легендарная'||r==='легендарное'||r==='legend';
  }

  function makeArt(cls,slot){
    if(!ready)return '';
    var row=CLASS_ROWS[cls],col=SLOT_COLS[slot];
    if(row==null||col==null)return '';
    var id=cls+':'+slot;
    if(cache[id])return cache[id];
    try{
      var cv=document.createElement('canvas');
      cv.width=OUT;cv.height=OUT;
      var cx=cv.getContext('2d',{alpha:true});
      cx.clearRect(0,0,OUT,OUT);
      cx.imageSmoothingEnabled=true;
      if('imageSmoothingQuality' in cx)cx.imageSmoothingQuality='high';
      cx.drawImage(atlas,col*CELL,row*CELL,CELL,CELL,PAD,PAD,OUT-PAD*2,OUT-PAD*2);
      cache[id]=cv.toDataURL('image/png');
      return cache[id];
    }catch(_){return ''}
  }

  function setRuntimeArt(it,src){
    try{
      Object.defineProperty(it,'img',{value:src,writable:true,configurable:true,enumerable:false});
    }catch(_){it.img=src}
    try{Object.defineProperty(it,'ppaLegendaryReferenceArt',{value:true,writable:true,configurable:true,enumerable:false})}catch(_){}
  }

  function hydrate(it){
    try{
      if(!ready||!isLegendary(it))return false;
      var cls=classKey(it),slot=slotKey(it);
      if(!cls||!slot)return false;
      var src=makeArt(cls,slot);
      if(!src||it.img===src)return false;
      setRuntimeArt(it,src);
      return true;
    }catch(_){return false}
  }

  function scanArray(a){
    var changed=false;
    if(!Array.isArray(a))return false;
    for(var i=0;i<a.length;i++)if(hydrate(a[i]))changed=true;
    return changed;
  }

  function hydrateAll(force){
    if(!ready)return false;
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
      if(changed){
        try{if(typeof renderInventory==='function')renderInventory()}catch(_){}
        try{if(typeof renderCharacter==='function')renderCharacter()}catch(_){}
      }
    }catch(_){}
    return changed;
  }

  atlas.onload=function(){
    if(atlas.naturalWidth!==COLS*CELL||atlas.naturalHeight!==ROWS*CELL){
      console.warn('PPA legendary atlas unexpected size',atlas.naturalWidth,atlas.naturalHeight);
      return;
    }
    ready=true;
    hydrateAll(true);
  };
  atlas.onerror=function(){console.warn('PPA legendary gear atlas failed to load')};
  atlas.src=ATLAS_SRC;

  window.PPA_LEGENDARY_GEAR_ART=function(cls,slot){return makeArt(alias(cls)||key(cls),slotKey({slot:slot}))};
  window.PPA_HYDRATE_LEGENDARY_GEAR_ART=function(){return hydrateAll(true)};
  window.PPA_LEGENDARY_GEAR_DIAG=function(){return {ready:ready,atlas:ATLAS_SRC,size:atlas.naturalWidth+'x'+atlas.naturalHeight,cached:Object.keys(cache).length}};

  var tries=0,t=setInterval(function(){
    hydrateAll(false);
    if(++tries>80)clearInterval(t);
  },750);
  setInterval(function(){hydrateAll(false)},5000);
})();