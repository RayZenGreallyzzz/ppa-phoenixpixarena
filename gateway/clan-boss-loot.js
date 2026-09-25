(function(){
  'use strict';
  if(window.__PPA_CLAN_BOSS_LOOT_V1)return;
  window.__PPA_CLAN_BOSS_LOOT_V1=true;

  var MISTRESS_TABLE=Object.freeze({
    minDamage:5000,
    normalStoneMin:4,normalStoneMax:7,
    blueGearChance:0.12,
    premiumStoneChance:0.04,
    grayRuneChance:0.10
  });

  function isMistress(e){
    if(!e||!e.isClanBoss)return false;
    var id=String(e.bossId||e.clanBossId||e.id||'');
    if(id==='clan_boss_1')return true;
    var mhp=Math.max(0,Number(e.mhp)||0);
    return mhp>0&&mhp<=6000000;
  }

  function rows(){
    return [
      ['Участие','от 5 000 урона · +1 зелёный ресурс +3 монеты клана'],
      ['Монеты клана за урон','1 за 10 000 урона · до 500 за полный HP'],
      ['Обычный камень заточки ×4–7','100% каждому участнику'],
      ['Синий шмот / оружие · случайный слот и класс','12% · общий ролл'],
      ['Премиум камень заточки ×1','4% · общий ролл'],
      ['Серая универсальная руна ×1 · случайный тип','10% · общий ролл'],
      ['1 место по урону','+2 синих ресурса +4 заточки'],
      ['2 место по урону','+1 синий ресурс +3 заточки'],
      ['3 место по урону','+2 зелёных ресурса +2 заточки'],
      ['Последний удар','+10 монет клана +1 синий ресурс'],
      ['Утешительная · без редкого выигрыша','+1 зелёный ресурс +2 заточки +5 монет']
    ];
  }

  function install(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaClanBossLootInfo)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        if(isMistress(e))return rows();
        return base.apply(this,arguments);
      };
      wrapped.__ppaClanBossLootInfo=1;
      wrapped.__ppaClanBossLootBase=base;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
    }catch(_){}
  }

  install();
  setTimeout(install,250);
  setTimeout(install,900);

  window.PPA_CLAN_BOSS_MISTRESS_DROP_TABLE=MISTRESS_TABLE;
  window.PPA_CLAN_BOSS_MISTRESS_DROP_ROWS=rows;
})();