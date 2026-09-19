(function(){
  'use strict';
  if(window.__PPA_DUNGEON_DROP_SLOTS_V1)return;
  window.__PPA_DUNGEON_DROP_SLOTS_V1=true;

  // Keep the total gear-drop chance unchanged. Only redistribute the slot
  // selected after a successful gear roll: weapon is 15% below the old
  // uniform 1/7 share, the difference is spread evenly over the other slots.
  var OLD_SHARE=1/7;
  var WEAPON_SHARE=OLD_SHARE*0.85;
  var OTHER_SHARE=(1-WEAPON_SHARE)/6;
  var SLOT_ORDER=['weapon','helmet','armor','gloves','ring','legs','boots'];
  var SLOT_LABELS={
    weapon:'⚔️ Оружие · все классы',
    helmet:'🪖 Шлем · все классы',
    armor:'🛡️ Броня · все классы',
    gloves:'🧤 Перчатки · все классы',
    ring:'💍 Кольцо · все классы',
    legs:'👖 Поножи · все классы',
    boots:'🥾 Сапоги · все классы'
  };

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

  function installDropContext(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaDungeonSlotContext)return;
      var base=dropLoot;
      var wrapped=function(e){
        if(!dungeonGearEligible(e))return base.apply(this,arguments);
        var prev=window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED;
        window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED=true;
        try{return base.apply(this,arguments)}
        finally{window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED=prev}
      };
      wrapped.__ppaDungeonSlotContext=1;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  function parsePct(v){
    var m=String(v==null?'':v).replace(',','.').match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if(!m)return null;
    var p=Number(m[1]);
    return Number.isFinite(p)?p/100:null;
  }

  function fmtProb(prob){
    var p=Math.max(0,Number(prob)||0)*100,d=2;
    if(p>=10)d=2;
    else if(p>=1)d=3;
    else if(p>=.1)d=4;
    else if(p>=.01)d=5;
    else if(p>=.001)d=6;
    else if(p>=.0001)d=7;
    else d=9;
    return p.toFixed(d).replace(/0+$/,'').replace(/\.$/,'')+'%';
  }

  function rarityLabel(label){
    var s=String(label||'').toLowerCase();
    if(s.indexOf('легендар')>=0)return 'Легендарное';
    if(s.indexOf('фиолет')>=0||s.indexOf('эпичес')>=0)return 'Эпическое';
    if(s.indexOf('син')>=0)return 'Синее';
    if(s.indexOf('зел')>=0)return 'Зелёное';
    if(s.indexOf('сер')>=0)return 'Серое';
    return 'Экипировка';
  }

  function isGearRow(label){
    var s=String(label||'').toLowerCase();
    return (s.indexOf('шмот')>=0||s.indexOf('оруж')>=0||s.indexOf('экипиров')>=0)
      && s.indexOf('не выпадает')<0;
  }

  function expandGearRows(e,rows){
    if(!dungeonGearEligible(e)||!Array.isArray(rows))return rows;
    var out=[];
    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      if(!Array.isArray(row)||row.length<2||!isGearRow(row[0])){
        out.push(row);continue;
      }
      var total=parsePct(row[1]);
      if(total==null||!(total>0)){out.push(row);continue}
      var rar=rarityLabel(row[0]);
      for(var j=0;j<SLOT_ORDER.length;j++){
        var slot=SLOT_ORDER[j];
        out.push([rar+' · '+SLOT_LABELS[slot],fmtProb(total*slotShare(slot))]);
      }
    }
    return out;
  }

  function installInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaDungeonSlotRows)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var rows=base.apply(this,arguments);
        return expandGearRows(e,rows);
      };
      wrapped.__ppaDungeonSlotRows=1;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
    }catch(_){}
  }

  installGenItem();
  installDropContext();
  installInfo();
})();