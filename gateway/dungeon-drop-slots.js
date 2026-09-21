(function(){
  'use strict';
  if(window.__PPA_DUNGEON_DROP_SLOTS_V2)return;
  window.__PPA_DUNGEON_DROP_SLOTS_V2=true;

  // Actual successful gear rolls keep the established total chance.
  // Only the slot choice uses the approved weighting: weapon is 15% below
  // the old uniform 1/7 share and the difference goes to the other six slots.
  var OLD_SHARE=1/7;
  var WEAPON_SHARE=OLD_SHARE*0.85;
  var OTHER_SHARE=(1-WEAPON_SHARE)/6;
  var SLOT_ORDER=['weapon','helmet','armor','gloves','ring','legs','boots'];

  function slotShare(slot){return slot==='weapon'?WEAPON_SHARE:OTHER_SHARE}

  function pickSlot(){
    var r=Math.random(),acc=0;
    for(var i=0;i<SLOT_ORDER.length;i++){
      var s=SLOT_ORDER[i];
      acc+=slotShare(s);
      if(r<=acc)return s;
    }
    return 'boots';
  }
  window.PPA_DUNGEON_PICK_GEAR_SLOT=pickSlot;

  function dungeonGearEligible(e){
    try{
      if(!e||typeof P==='undefined'||!P||P.scene!=='dungeon')return false;
      var lv=Number(e.lvl||e.roomLevel||0);
      if(e.isDungeon60Boss)lv=60;
      else if(e.isDungeon21Boss)lv=Math.max(lv,40);
      else if(e.isDungeonPhoenixBoss)lv=Math.max(lv,20);
      return lv>=11&&lv<=60;
    }catch(_){return false}
  }

  function installGenItem(){
    try{
      if(typeof genItem!=='function'||genItem.__ppaDungeonSlotWeighted)return;
      var base=genItem;
      var wrapped=function(){
        if(!window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED)return base.apply(this,arguments);
        var arr=null,saved=null;
        try{
          arr=(typeof SLOTS!=='undefined'&&Array.isArray(SLOTS))?SLOTS:null;
          if(!arr)return base.apply(this,arguments);
          saved=arr.slice();
          arr.length=0;arr.push(pickSlot());
          return base.apply(this,arguments);
        }finally{
          if(arr&&saved){
            arr.length=0;
            for(var i=0;i<saved.length;i++)arr.push(saved[i]);
          }
        }
      };
      wrapped.__ppaDungeonSlotWeighted=1;
      try{genItem=wrapped}catch(_){}
      try{window.genItem=wrapped}catch(_){}
    }catch(_){}
  }

  function phoenixBlueGear(item){
    if(!item||typeof item!=='object')return false;
    var raw=item.rarity!=null?item.rarity:(item.quality!=null?item.quality:item.tier);
    var s=String(raw==null?'':raw).toLowerCase();
    if(Number(raw)===2)return true;
    return s==='rare'||s==='blue'||s.indexOf('син')>=0;
  }

  function removePhoenixBlueGear(start){
    try{
      if(typeof LOOT==='undefined'||!Array.isArray(LOOT))return;
      start=Math.max(0,Math.min(LOOT.length,Number(start)||0));
      for(var i=LOOT.length-1;i>=start;i--){
        var q=LOOT[i];
        if(!q)continue;
        var it=q.item||q.gear||null;
        var kind=String(q.kind||'').toLowerCase();
        var slot=String(it&&(it.slot||it.type)||'').toLowerCase();
        var gear=(kind==='gear'||SLOT_ORDER.indexOf(slot)>=0);
        if(gear&&phoenixBlueGear(it))LOOT.splice(i,1);
      }
    }catch(_){}
  }

  function installDropContext(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaDungeonSlotContext)return;
      var base=dropLoot;
      var wrapped=function(e){
        var isPhoenix=!!(e&&e.isDungeonPhoenixBoss);
        var lootStart=0;
        try{if(typeof LOOT!=='undefined'&&Array.isArray(LOOT))lootStart=LOOT.length}catch(_){}

        if(!dungeonGearEligible(e)){
          var plain=base.apply(this,arguments);
          if(isPhoenix)removePhoenixBlueGear(lootStart);
          return plain;
        }

        var prev=window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED;
        window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED=true;
        try{
          var result=base.apply(this,arguments);
          if(isPhoenix)removePhoenixBlueGear(lootStart);
          return result;
        }finally{
          window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED=prev;
        }
      };
      wrapped.__ppaDungeonSlotContext=1;
      wrapped.__ppaPhoenixNoBlueGear=1;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  function isBlueGearLabel(label){
    var s=String(label||'').toLowerCase();
    var gear=(s.indexOf('шмот')>=0||s.indexOf('оруж')>=0||s.indexOf('экипиров')>=0||
              s.indexOf('брон')>=0||s.indexOf('шлем')>=0||s.indexOf('перчат')>=0||
              s.indexOf('кольц')>=0||s.indexOf('понож')>=0||s.indexOf('сапог')>=0);
    return gear&&(s.indexOf('син')>=0||s.indexOf('редк')>=0||s.indexOf('rare')>=0||s.indexOf('blue')>=0);
  }

  function installInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaDungeonNativeDropRows)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var rows=base.apply(this,arguments);
        if(!Array.isArray(rows))return rows;

        // The long-press popup now uses the game's own configured rows and
        // percentages. No synthetic "all classes" rows, rarity promotion or
        // guessed floor rules are allowed here.
        rows=rows.map(function(r){return Array.isArray(r)?r.slice():r});

        // Phoenix is the level-20 boss: blue equipment/weapons are disabled
        // both in actual loot (above) and in this inspect table.
        if(e&&e.isDungeonPhoenixBoss){
          rows=rows.filter(function(r){
            return !Array.isArray(r)||r.length<2||!isBlueGearLabel(r[0]);
          });
        }
        return rows;
      };
      wrapped.__ppaDungeonNativeDropRows=1;
      wrapped.__ppaDungeonNativeBase=base;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
      window.PPA_DUNGEON_DROP_TABLE_MODE='native';
    }catch(_){}
  }

  installGenItem();
  installDropContext();
  installInfo();
})();