(function(){
  'use strict';
  if(window.__PPA_BOSS_DROP_BOOST_V1)return;
  window.__PPA_BOSS_DROP_BOOST_V1=true;

  // Every real boss keeps its normal loot roll and has a 50% chance
  // to roll the same loot table once more. This raises rare-drop chances
  // without changing ordinary-mob economy.
  var BONUS_ROLL_CHANCE=0.50;

  function isBoss(e){
    if(!e)return false;
    if(e.__ppaArenaPlayer||e.isAiFighter||e.isClanSiegeCrystal)return false;
    return !!(
      e.isBoss||
      e.isDungeonElite||
      e.isClanBoss||
      e.isWorldCrystalBoss||
      e.isDungeonPhoenixBoss||
      e.isDungeon21Boss||
      e.isDungeon60Boss
    );
  }

  function rewardEligible(e){
    try{
      if(window.PPA_MOB_REWARD_ELIGIBLE&&!window.PPA_MOB_REWARD_ELIGIBLE(e))return false;
    }catch(_){}
    return true;
  }

  function installLootBoost(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaBossBonusRoll)return;
      var base=dropLoot;
      var wrapped=function(e){
        var first=base.apply(this,arguments);
        if(!isBoss(e)||!rewardEligible(e))return first;
        if(Math.random()>=BONUS_ROLL_CHANCE)return first;

        // The second call is a true bonus loot-table roll. It does not replace
        // the guaranteed first roll and therefore cannot make boss loot worse.
        try{
          window.__PPA_BOSS_BONUS_ROLL_ACTIVE=true;
          base.apply(this,arguments);
        }catch(err){
          console.warn('PPA boss bonus loot roll',err);
        }finally{
          window.__PPA_BOSS_BONUS_ROLL_ACTIVE=false;
        }
        return first;
      };
      wrapped.__ppaBossBonusRoll=1;
      wrapped.__ppaBossBonusBase=base;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  function parsePct(v){
    var m=String(v==null?'':v).replace(',','.').match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*$/);
    if(!m)return null;
    var p=Number(m[1])/100;
    return Number.isFinite(p)?Math.max(0,Math.min(1,p)):null;
  }

  function fmtPct(p){
    p=Math.max(0,Math.min(1,Number(p)||0))*100;
    var d=p>=10?2:(p>=1?3:(p>=.1?4:(p>=.01?5:(p>=.001?6:8))));
    return p.toFixed(d).replace(/0+$/,'').replace(/\.$/,'')+'%';
  }

  function boostedAtLeastOnce(p){
    // Base roll always happens. Bonus roll happens with probability q.
    // P(at least one) = 1 - (1-p)(1-q*p)
    return 1-(1-p)*(1-BONUS_ROLL_CHANCE*p);
  }

  function installInfoBoost(){
    try{
      if(typeof mobDropInfo!=='function'||mobDropInfo.__ppaBossBonusInfo)return;
      var base=mobDropInfo;
      var wrapped=function(e){
        var rows=base.apply(this,arguments);
        if(!isBoss(e)||!Array.isArray(rows))return rows;
        var out=[];
        for(var i=0;i<rows.length;i++){
          var row=rows[i];
          if(!Array.isArray(row)||row.length<2){out.push(row);continue}
          var p=parsePct(row[1]);
          if(p==null||p<=0||p>=1){out.push(row.slice());continue}
          var copy=row.slice();
          copy[1]=fmtPct(boostedAtLeastOnce(p));
          out.push(copy);
        }
        out.push(['Бонусный бросок таблицы босса','50%']);
        return out;
      };
      wrapped.__ppaBossBonusInfo=1;
      wrapped.__ppaBossBonusInfoBase=base;
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
    }catch(_){}
  }

  function install(){
    installLootBoost();
    installInfoBoost();
  }

  install();
  setTimeout(install,250);
  setTimeout(install,900);

  window.PPA_BOSS_DROP_BONUS_CHANCE=BONUS_ROLL_CHANCE;
})();