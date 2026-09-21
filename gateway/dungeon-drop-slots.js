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
    weapon:'Оружие · все классы',
    helmet:'Шлем · все классы',
    armor:'Броня · все классы',
    gloves:'Перчатки · все классы',
    ring:'Кольцо · все классы',
    legs:'Поножи · все классы',
    boots:'Сапоги · все классы'
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

  function entityLevel(e){
    var lv=Math.floor(Number(e&&(e.lvl!=null?e.lvl:e.roomLevel))||0);
    if(e&&e.isDungeon60Boss)return 60;
    if(e&&e.isDungeon21Boss)return Math.max(40,lv||40);
    if(e&&e.isDungeonPhoenixBoss)return Math.max(20,lv||20);
    return Math.max(0,lv);
  }

  // Drop UI must never inherit a stale low-tier rarity label from an older
  // mobDropInfo branch. Explicit high rarities stay untouched; only impossible
  // gray/green/generic gear labels are promoted to the minimum legal tier for
  // the current dungeon bracket.
  function canonicalGearRarity(e,label){
    var rar=rarityLabel(label),lv=entityLevel(e);
    if(rar==='Легендарное'||rar==='Эпическое'||rar==='Синее')return rar;
    if(lv>=21&&lv<=60)return 'Синее';
    if(lv>=11&&lv<=20)return 'Зелёное';
    return rar;
  }
  window.PPA_DUNGEON_CANONICAL_GEAR_RARITY=canonicalGearRarity;

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
      var rar=canonicalGearRarity(e,row[0]);
      for(var j=0;j<SLOT_ORDER.length;j++){
        var slot=SLOT_ORDER[j];
        out.push([rar+' · '+SLOT_LABELS[slot],fmtProb(total*slotShare(slot))]);
      }
    }
    return out;
  }

  function allBooks(){
    try{
      if(typeof ALL_GRIMOIRES!=='undefined'&&Array.isArray(ALL_GRIMOIRES))return ALL_GRIMOIRES;
      if(Array.isArray(window.ALL_GRIMOIRES))return window.ALL_GRIMOIRES;
    }catch(_){}
    return [];
  }

  function booksOfType(type){
    return allBooks().filter(function(g){return g&&g.type===type});
  }

  function bookText(g,type){
    var kind=type==='active'?'Активная книга':'Пассивная книга';
    var cls=String((g&&g.className)||'').trim();
    var name=String((g&&g.n)||'Книга').trim();
    return kind+' · '+(cls?cls+' · ':'')+name;
  }

  function appendBookType(out,type,totalChance){
    var pool=booksOfType(type);
    if(!pool.length||!(totalChance>0))return;
    var each=totalChance/pool.length;
    for(var i=0;i<pool.length;i++)out.push([bookText(pool[i],type),fmtProb(each)]);
  }

  function miniBossAtLeastOne(perPick){
    perPick=Math.max(0,Math.min(1,Number(perPick)||0));
    var sum=0;
    for(var n=1;n<=10;n++)sum+=1-Math.pow(1-perPick,n);
    return sum/10;
  }

  function expandBookRows(e,rows){
    if(!Array.isArray(rows))return rows;
    var active=booksOfType('active'),passive=booksOfType('passive');
    if(!active.length||!passive.length)return rows;

    var out=[];
    var lv=Math.max(1,Math.floor(Number(e&&e.lvl)||1));

    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      if(!Array.isArray(row)||row.length<2){out.push(row);continue}
      var label=String(row[0]||'');
      var low=label.toLowerCase();
      var chance=parsePct(row[1]);

      // Normal mobs: exact total active/passive roll divided uniformly by
      // every book in that type pool.
      if(low==='активная книга'&&chance!=null){
        appendBookType(out,'active',chance);
        continue;
      }
      if(low==='пассивная книга'&&chance!=null){
        appendBookType(out,'passive',chance);
        continue;
      }

      // Phoenix: pushGrimoireDrop picks uniformly from ALL_GRIMOIRES.
      if(e&&e.isDungeonPhoenixBoss&&low.indexOf('случайный гримуар')>=0&&chance!=null){
        var all=allBooks(),each=all.length?chance/all.length:0;
        for(var pg=0;pg<all.length;pg++)out.push([bookText(all[pg],all[pg].type),fmtProb(each)]);
        continue;
      }

      // Lord 40: a 1% package gives one book 70% of the time and two books
      // 30% of the time. Each draw is 35% active / 65% passive.
      if(e&&e.isDungeon21Boss&&low.indexOf('тип книги')>=0){
        var packageChance=0.01;
        var ap=.35/active.length,pp=.65/passive.length;
        var activeAtLeast=packageChance*(.70*ap+.30*(1-Math.pow(1-ap,2)));
        var passiveAtLeast=packageChance*(.70*pp+.30*(1-Math.pow(1-pp,2)));
        for(var la=0;la<active.length;la++)out.push([bookText(active[la],'active'),fmtProb(activeAtLeast)]);
        for(var lp=0;lp<passive.length;lp++)out.push([bookText(passive[lp],'passive'),fmtProb(passiveAtLeast)]);
        continue;
      }

      // Dungeon 41–60: one II/III book at 0.016%; type is selected 50/50.
      if(e&&e.dungeon41&&low.indexOf('книга навыка ii')>=0&&chance!=null){
        appendBookType(out,'active',chance*.5);
        appendBookType(out,'passive',chance*.5);
        continue;
      }

      // Mini-bosses 1–40: 1–10 independently weighted item picks.
      // Show the exact per-kill probability of seeing each named book at
      // least once, while preserving the existing rank line below.
      if(e&&e.isDungeonElite&&!e.dungeon41&&low.indexOf('книги навыков')>=0){
        var total=lv<=10?85:100;
        var aw=lv<=20?4:6,pw=lv<=20?6:9;
        var ac=miniBossAtLeastOne((aw/total)/active.length);
        var pc=miniBossAtLeastOne((pw/total)/passive.length);
        for(var ma=0;ma<active.length;ma++)out.push([bookText(active[ma],'active'),fmtProb(ac)]);
        for(var mp=0;mp<passive.length;mp++)out.push([bookText(passive[mp],'passive'),fmtProb(pc)]);
        if(lv<=20)out.push(['Ранг книги','I']);
        continue;
      }

      // From level 11 upward gray equipment must not be shown for mini-bosses.
      if(e&&e.isDungeonElite&&lv>=11&&lv<=20&&low.indexOf('возможный дроп')>=0){
        out.push([row[0],String(row[1]||'').replace(/серый\s*\/\s*/i,'')]);
        continue;
      }

      out.push(row);
    }
    return out;
  }

  function finalGearLabelGuard(e,rows){
    if(!Array.isArray(rows))return rows;
    var lv=entityLevel(e);
    if(lv<11||lv>60)return rows;
    var out=[];
    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      if(!Array.isArray(row)||row.length<2){out.push(row);continue}
      var copy=row.slice(),label=String(copy[0]||'');
      if(isGearRow(label)){
        var wanted=canonicalGearRarity(e,label);
        if(wanted==='Синее'&&(label.indexOf('Зелёное')===0||label.indexOf('Серое')===0||label.indexOf('Экипировка')===0)){
          copy[0]=label.replace(/^(?:Зелёное|Серое|Экипировка)/,wanted);
        }else if(wanted==='Зелёное'&&(label.indexOf('Серое')===0||label.indexOf('Экипировка')===0)){
          copy[0]=label.replace(/^(?:Серое|Экипировка)/,wanted);
        }
      }
      out.push(copy);
    }
    return out;
  }

  window.PPA_DUNGEON_DROP_TABLE_AUDIT=function(e){
    try{
      var rows=(typeof mobDropInfo==='function')?mobDropInfo(e):[];
      var lv=entityLevel(e),bad=[];
      (rows||[]).forEach(function(r){
        if(!Array.isArray(r)||!isGearRow(r[0]))return;
        var s=String(r[0]||'');
        if(lv>=21&&/^(?:Зелёное|Серое|Экипировка)/.test(s))bad.push(s);
        if(lv>=11&&lv<=20&&/^(?:Серое|Экипировка)/.test(s))bad.push(s);
      });
      return {ok:bad.length===0,level:lv,boss:!!(e&&(e.isBoss||e.isDungeon21Boss||e.isDungeon60Boss||e.isDungeonPhoenixBoss)),bad:bad,rows:rows};
    }catch(err){return {ok:false,error:String(err&&err.message||err)}}
  };

  function installInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaDungeonSlotRows)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var rows=base.apply(this,arguments);
        rows=expandBookRows(e,rows);
        rows=expandGearRows(e,rows);
        return finalGearLabelGuard(e,rows);
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