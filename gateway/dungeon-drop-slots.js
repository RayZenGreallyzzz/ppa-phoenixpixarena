(function(){
  'use strict';
  if(window.__PPA_DUNGEON_DROP_SLOTS_V3)return;
  window.__PPA_DUNGEON_DROP_SLOTS_V3=true;

  // A successful gear roll keeps the approved total chance. Only the slot is
  // distributed here: weapon is 15% below the old equal 1/7 share, and the
  // difference is spread over the other six slots.
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

  // Approved 41-60 equipment curve:
  // epic 0.0018% at 41 -> 0.0040% at 60;
  // legendary is an additional ultra-rare roll only from 51 onward.
  var EPIC_4160_START=0.000018;
  var EPIC_4160_END=0.000040;
  var LEGENDARY_5160_CHANCE=0.00000013; // 0.000013%

  var BLUE_2130=[.00002,.00004,.00006,.00009,.00012,.00015,.00019,.00023,.00026,.00030];
  var BLUE_3140=[.00035,.00040,.00045,.00050,.00055,.00060,.00070,.00080,.00090,.00100];
  var EPIC_3140=[.000001,.000002,.000003,.000004,.000005,.000006,.000007,.000008,.000009,.000010];

  function clamp(n,a,b){return Math.max(a,Math.min(b,Number(n)||0))}
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

  function entityLevel(e){
    var lv=Math.floor(Number(e&&(e.lvl!=null?e.lvl:e.roomLevel))||0);
    if(!lv)lv=Math.floor(Number(e&&e.roomLevel)||0);
    if(e&&e.isDungeon60Boss)return 60;
    if(e&&e.isDungeon21Boss)return Math.max(40,lv||40);
    if(e&&e.isDungeonPhoenixBoss)return Math.max(20,lv||20);
    return Math.max(0,lv);
  }

  function dungeonGearEligible(e){
    try{
      if(!e||typeof P==='undefined'||!P||P.scene!=='dungeon')return false;
      var lv=entityLevel(e);
      return lv>=11&&lv<=60;
    }catch(_){return false}
  }

  function ordinaryDungeonMob(e){
    if(!dungeonGearEligible(e))return false;
    if(e.isBoss||e.isDungeonPhoenixBoss||e.isDungeon21Boss||e.isDungeon60Boss||
       e.isWorldCrystalBoss||e.isClanBoss||e.isDungeonElite)return false;
    return true;
  }

  function blue2130(lv){return BLUE_2130[Math.max(0,Math.min(9,Math.floor(lv)-21))]}
  function blue3140(lv){return BLUE_3140[Math.max(0,Math.min(9,Math.floor(lv)-31))]}
  function epic3140(lv){return EPIC_3140[Math.max(0,Math.min(9,Math.floor(lv)-31))]}
  function epic4160(lv){
    lv=clamp(Math.floor(lv),41,60);
    return EPIC_4160_START+(lv-41)*((EPIC_4160_END-EPIC_4160_START)/19);
  }
  function blueResource2160(lv){
    lv=clamp(Math.floor(lv),21,60);
    return .007+(lv-21)*(.015/39); // 0.7% at 21 -> 2.2% at 60
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
    if(s.indexOf('син')>=0||s.indexOf('редк')>=0||s.indexOf('blue')>=0||s.indexOf('rare')>=0)return 'Синее';
    if(s.indexOf('зел')>=0||s.indexOf('необыч')>=0)return 'Зелёное';
    if(s.indexOf('сер')>=0)return 'Серое';
    return 'Экипировка';
  }

  function isGearRow(label){
    var s=String(label||'').toLowerCase();
    if(s.indexOf('не выпадает')>=0)return false;
    return s.indexOf('шмот')>=0||s.indexOf('оруж')>=0||s.indexOf('экипиров')>=0;
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

  function allBooks(){
    try{
      if(typeof ALL_GRIMOIRES!=='undefined'&&Array.isArray(ALL_GRIMOIRES))return ALL_GRIMOIRES;
      if(Array.isArray(window.ALL_GRIMOIRES))return window.ALL_GRIMOIRES;
    }catch(_){}
    return [];
  }
  function booksOfType(type){return allBooks().filter(function(g){return g&&g.type===type})}
  function bookText(g,type){
    var kind=type==='active'?'Активная книга':'Пассивная книга';
    var cls=String((g&&g.className)||'').trim();
    var name=String((g&&g.n)||'Книга').trim();
    return kind+' · '+(cls?cls+' · ':'')+name;
  }
  function appendBookType(out,type,totalChance){
    var pool=booksOfType(type);
    if(!pool.length||!(totalChance>0))return false;
    var each=totalChance/pool.length;
    for(var i=0;i<pool.length;i++)out.push([bookText(pool[i],type),fmtProb(each)]);
    return true;
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
    var out=[],lv=Math.max(1,entityLevel(e)||1);

    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      if(!Array.isArray(row)||row.length<2){out.push(row);continue}
      var label=String(row[0]||''),low=label.toLowerCase(),chance=parsePct(row[1]);

      if(low==='активная книга'&&chance!=null){
        appendBookType(out,'active',chance);continue;
      }
      if(low==='пассивная книга'&&chance!=null){
        appendBookType(out,'passive',chance);continue;
      }

      // Phoenix: a successful grimoire roll picks uniformly from all books.
      if(e&&e.isDungeonPhoenixBoss&&low.indexOf('случайный гримуар')>=0&&chance!=null){
        var all=allBooks(),each=all.length?chance/all.length:0;
        for(var pg=0;pg<all.length;pg++)out.push([bookText(all[pg],all[pg].type),fmtProb(each)]);
        continue;
      }

      // Lord 40: 1% package; 1 book 70% / 2 books 30%; 35% active / 65% passive.
      if(e&&e.isDungeon21Boss&&low.indexOf('тип книги')>=0){
        var packageChance=0.01;
        var ap=.35/active.length,pp=.65/passive.length;
        var activeAtLeast=packageChance*(.70*ap+.30*(1-Math.pow(1-ap,2)));
        var passiveAtLeast=packageChance*(.70*pp+.30*(1-Math.pow(1-pp,2)));
        for(var la=0;la<active.length;la++)out.push([bookText(active[la],'active'),fmtProb(activeAtLeast)]);
        for(var lp=0;lp<passive.length;lp++)out.push([bookText(passive[lp],'passive'),fmtProb(passiveAtLeast)]);
        continue;
      }

      // Mini-bosses 1-40 use the old 1-10 weighted item-pick pool.
      if(e&&e.isDungeonElite&&!e.dungeon41&&low.indexOf('книги навыков')>=0){
        var total=lv<=10?85:100;
        var aw=lv<=20?4:6,pw=lv<=20?6:9;
        var ac=miniBossAtLeastOne((aw/total)/active.length);
        var pc=miniBossAtLeastOne((pw/total)/passive.length);
        for(var ma=0;ma<active.length;ma++)out.push([bookText(active[ma],'active'),fmtProb(ac)]);
        for(var mp=0;mp<passive.length;mp++)out.push([bookText(passive[mp],'passive'),fmtProb(pc)]);
        continue;
      }

      out.push(row);
    }
    return out;
  }

  function approvedNormalRows(e){
    var lv=entityLevel(e);
    if(lv<11||lv>60)return null;
    var rows=[
      ['Золото','100%'],
      ['PPA ×1','1%'],
      ['Перо Феникса','0.01%']
    ];

    if(lv<=20){
      rows.push(['Зелёный шмот/оружие',fmtProb(lv<=15?.006:.009)]);
      var common=Math.min(.12,.0675+lv*.002625);
      var green=Math.min(.022,.004+lv*.0009);
      common*=.80;green*=.75;
      rows.push(['Обычный ресурс',fmtProb(common)]);
      rows.push(['Зелёный ресурс',fmtProb(green)]);
      rows.push(['Обычный камень заточки','0.12%']);
      rows.push(['Активная книга','0.004%'],['Пассивная книга','0.003%'],['Ранг книги','I']);
      return rows;
    }

    if(lv<=30){
      rows.push(['Синий шмот/оружие',fmtProb(blue2130(lv))]);
      rows.push(['Обычный ресурс','12%'],['Зелёный ресурс','6%'],['Синий ресурс',fmtProb(blueResource2160(lv))]);
      rows.push(['Обычный камень заточки','0.35%'],['Премиум-монета удачи','0.015%']);
      rows.push(['Активная книга','0.006%'],['Пассивная книга','0.007%'],['Ранг книги','I']);
      return rows;
    }

    if(lv<=40){
      rows.push(['Синий шмот/оружие',fmtProb(blue3140(lv))]);
      rows.push(['Эпический шмот/оружие',fmtProb(epic3140(lv))]);
      rows.push(['Обычный ресурс','18%'],['Зелёный ресурс','12%'],['Синий ресурс',fmtProb(blueResource2160(lv))]);
      rows.push(['Обычный камень заточки','1.5%'],['Премиум руна заточки','0.10%'],['Премиум камень заточки','0.03%']);
      rows.push(['Премиум-монета удачи','0.025%'],['Свиток телепорта','0.35%'],['Премиум банка HP','0.15%'],['Премиум банка MP','0.15%']);
      rows.push(['Активная книга','0.006%'],['Пассивная книга','0.007%'],['Ранг книги','I / II · случайно']);
      return rows;
    }

    // 41-60: no gray/green/blue equipment. Epic grows linearly through the
    // whole bracket; 51-60 also gets the independent ultra-rare legendary roll.
    rows.push(['Эпический шмот/оружие',fmtProb(epic4160(lv))]);
    if(lv>=51)rows.push(['Легендарный шмот/оружие',fmtProb(LEGENDARY_5160_CHANCE)]);
    rows.push(['Обычный ресурс','18%'],['Зелёный ресурс','12%'],['Синий ресурс',fmtProb(blueResource2160(lv))]);
    rows.push(['Обычный камень заточки','1.5%'],['Премиум руна заточки','0.10%'],['Премиум камень заточки','0.03%']);
    rows.push(['Премиум-монета удачи','0.025%'],['Свиток телепорта','0.35%'],['Премиум банка HP','0.15%'],['Премиум банка MP','0.15%']);
    rows.push(['Активная книга','0.006%'],['Пассивная книга','0.007%'],['Ранг книги','I / II / III · случайно']);
    return rows;
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
  function isBlueGearLabel(label){
    var s=String(label||'').toLowerCase();
    var gear=(s.indexOf('шмот')>=0||s.indexOf('оруж')>=0||s.indexOf('экипиров')>=0);
    return gear&&(s.indexOf('син')>=0||s.indexOf('редк')>=0||s.indexOf('rare')>=0||s.indexOf('blue')>=0);
  }

  function installDropContext(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaDungeonSlotContext)return;
      var base=dropLoot;
      var wrapped=function(e){
        var isPhoenix=!!(e&&e.isDungeonPhoenixBoss),lootStart=0;
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
        }finally{window.__PPA_DUNGEON_GEAR_SLOT_WEIGHTED=prev}
      };
      wrapped.__ppaDungeonSlotContext=1;
      wrapped.__ppaPhoenixNoBlueGear=1;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  function installInfo(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaApprovedDropRows)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var rows;
        if(ordinaryDungeonMob(e)){
          rows=approvedNormalRows(e);
        }else{
          rows=base.apply(this,arguments);
          if(!Array.isArray(rows))return rows;
          rows=rows.map(function(r){return Array.isArray(r)?r.slice():r});
        }

        // Level-20 Phoenix must never advertise or award blue gear.
        if(e&&e.isDungeonPhoenixBoss){
          rows=rows.filter(function(r){
            return !Array.isArray(r)||r.length<2||!isBlueGearLabel(r[0]);
          });
        }

        rows=expandBookRows(e,rows);
        rows=expandGearRows(e,rows);
        return rows;
      };
      wrapped.__ppaApprovedDropRows=1;
      wrapped.__ppaDungeonNativeBase=base;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
      window.PPA_DUNGEON_DROP_TABLE_MODE='approved-11-60';
    }catch(_){}
  }

  installGenItem();
  installDropContext();
  installInfo();
})();