(function(){
  'use strict';
  if(window.__PPA_CLAN_BOSS_LOOT_V1)return;
  window.__PPA_CLAN_BOSS_LOOT_V1=true;

  var MISTRESS_TABLE=Object.freeze({
    greenMin:2,greenMax:4,
    blueMin:1,blueMax:2,
    normalStoneMin:2,normalStoneMax:4,
    blueGearChance:0.12,
    premiumStoneChance:0.04,
    grayRuneChance:0.10,
    bonusResourceChance:0.15
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
      ['Монеты клана','1 за 10 000 урона · до 500 за полный HP'],
      ['Зелёный ресурс ×2–4','100%'],
      ['Синий / редкий ресурс ×1–2','100%'],
      ['Обычный камень заточки ×2–4','100%'],
      ['Синий шмот / оружие · случайный слот и класс','12%'],
      ['Премиум камень заточки ×1','4%'],
      ['Серая универсальная руна ×1 · случайный тип','10%'],
      ['Доп. зелёный или синий ресурс ×1','15%']
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