(function(){
  'use strict';
  if(window.__PPA_CLAN_BOSS_LOOT_V2)return;
  window.__PPA_CLAN_BOSS_LOOT_V2=true;

  var MISTRESS_TABLE=Object.freeze({
    minDamage:5000,
    normalStoneMin:4,normalStoneMax:7,
    blueGearPool:1,
    premiumStonePool:1,
    grayRunePool:1
  });
  var CERBERUS_TABLE=Object.freeze({
    minDamage:100000,
    normalStoneMin:8,normalStoneMax:14,
    clanCoinDamageStep:7500,
    blueGearPool:2,
    premiumStonePool:2,
    universalRunePool:1,
    blueResourcePool:3,
    epicGearChance:0.12,
    greenRuneChance:0.25,
    blueRuneChance:0.08,
    activeBookRank2Chance:0.00008,
    passiveBookRank2Chance:0.00007,
    monsterBloodChance:0.22,
    fireShardsChance:0.14,
    demonicCrystalChance:0.04,
    ruriCrystalChance:0.01
  });

  function bossKind(e){
    if(!e||!e.isClanBoss)return '';
    var id=String(e.bossId||e.clanBossId||e.id||'');
    if(id==='clan_boss_2')return 'cerberus';
    if(id==='clan_boss_1')return 'mistress';
    var mhp=Math.max(0,Number(e.mhp)||0);
    if(mhp>=10000000)return 'cerberus';
    if(mhp>0&&mhp<=6000000)return 'mistress';
    return '';
  }

  function mistressRows(){
    return [
      ['Участие','от 5 000 урона · +1 зелёный ресурс +3 монеты клана'],
      ['Монеты клана за урон','1 за 10 000 урона · до 500 за полный HP'],
      ['Обычный камень заточки ×4–7','100% каждому участнику'],
      ['Синий шмот / оружие · случайный слот и класс','×1 гарантированно · общий ролл'],
      ['Премиум камень заточки','×1 гарантированно · общий ролл'],
      ['Серая универсальная руна · случайный тип','×1 гарантированно · общий ролл'],
      ['1 место по урону','+2 синих ресурса +4 заточки'],
      ['2 место по урону','+1 синий ресурс +3 заточки'],
      ['3 место по урону','+2 зелёных ресурса +2 заточки'],
      ['Последний удар','+10 монет клана +1 синий ресурс'],
      ['Утешительная · без редкого выигрыша','+1 зелёный ресурс +2 заточки +5 монет']
    ];
  }

  function cerberusRows(){
    return [
      ['Участие','от 100 000 урона'],
      ['Обычный камень заточки ×8–14','100% каждому участнику'],
      ['Монеты клана за урон','1 за 7 500 урона'],
      ['Зелёный ресурс ×2','100% каждому участнику'],
      ['Синий шмот / оружие','×2 гарантированно · общий ролл'],
      ['Премиум камень заточки','×2 гарантированно · общий ролл'],
      ['Универсальная руна','×1 гарантированно · общий ролл'],
      ['Синий ресурс','×3 гарантированно · общий ролл'],
      ['Эпический шмот / оружие','12% · общий редкий ролл'],
      ['Зелёная руна','25% · общий редкий ролл'],
      ['Синяя руна','8% · общий редкий ролл'],
      ['Книга активного навыка · ранг II','0.008% · общий редкий ролл'],
      ['Книга пассивного навыка · ранг II','0.007% · общий редкий ролл'],
      ['Кровь монстра','22% · общий ивентовый ролл'],
      ['Огненные осколки','14% · общий ивентовый ролл'],
      ['Демонический кристалл','4% · общий ивентовый ролл'],
      ['Хрустальный кристалл','1% · общий ивентовый ролл'],
      ['1 место по урону','+3 синих ресурса +5 заточек +1 доп. редкий ролл'],
      ['2 место по урону','+2 синих ресурса +4 заточки'],
      ['3 место по урону','+1 синий ресурс +3 заточки'],
      ['Последний удар','+15 монет клана +1 синий ресурс'],
      ['Если редкий пул не выпал никому','1 место получает +1 прем. заточку +1 универсальную руну +10 монет']
    ];
  }

  function install(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaClanBossLootInfoV2)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var kind=bossKind(e);
        if(kind==='cerberus')return cerberusRows();
        if(kind==='mistress')return mistressRows();
        return base.apply(this,arguments);
      };
      wrapped.__ppaClanBossLootInfoV2=1;
      wrapped.__ppaClanBossLootBase=base;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
    }catch(_){}
  }

  install();
  setTimeout(install,250);
  setTimeout(install,900);

  window.PPA_CLAN_BOSS_MISTRESS_DROP_TABLE=MISTRESS_TABLE;
  window.PPA_CLAN_BOSS_MISTRESS_DROP_ROWS=mistressRows;
  window.PPA_CLAN_BOSS_CERBERUS_DROP_TABLE=CERBERUS_TABLE;
  window.PPA_CLAN_BOSS_CERBERUS_DROP_ROWS=cerberusRows;
})();