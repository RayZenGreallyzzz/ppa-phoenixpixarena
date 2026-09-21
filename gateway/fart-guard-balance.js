(function(){
  'use strict';
  if(window.__PPA_FART_GUARD_HP_PLUS_8000_V1)return;
  window.__PPA_FART_GUARD_HP_PLUS_8000_V1=true;

  var HP_BONUS=8000;

  function boost(e){
    try{
      if(!e||!e.isFartGuard)return e;
      if(e.__ppaFartHpPlus8000===true)return e;

      var oldMax=Math.max(1,Number(e.mhp)||Number(e.hp)||1);
      var oldHp=Number(e.hp);
      e.__ppaFartHpPlus8000=true;
      e.__ppaFartHpBeforeBonus=oldMax;
      e.mhp=oldMax+HP_BONUS;

      // Preserve damage already taken. A living full-HP guard receives the
      // whole +8000 immediately; a dead guard is never revived by this patch.
      if(Number.isFinite(oldHp)&&oldHp>0)e.hp=Math.min(e.mhp,oldHp+HP_BONUS);
      return e;
    }catch(_){return e}
  }

  function boostAll(){
    try{
      if(typeof EN!=='undefined'&&Array.isArray(EN)){
        for(var i=0;i<EN.length;i++)boost(EN[i]);
      }
    }catch(_){}
  }

  function installSpawnHook(){
    try{
      var base=window.fartSpawnGuard;
      if(typeof base!=='function'||base.__ppaFartHpPlus8000Hook)return;
      var wrapped=function(){
        var before=[];
        try{if(typeof EN!=='undefined'&&Array.isArray(EN))before=EN.slice()}catch(_){}
        var ret=base.apply(this,arguments);
        try{boost(ret)}catch(_){}
        try{
          if(typeof EN!=='undefined'&&Array.isArray(EN)){
            for(var i=0;i<EN.length;i++){
              var e=EN[i];
              if(e&&e.isFartGuard&&(before.indexOf(e)<0||e.__ppaFartHpPlus8000!==true))boost(e);
            }
          }
        }catch(_){}
        return ret;
      };
      wrapped.__ppaFartHpPlus8000Hook=1;
      wrapped.__ppaBase=base;
      window.fartSpawnGuard=wrapped;
      try{fartSpawnGuard=wrapped}catch(_){}
    }catch(_){}
  }

  function install(){
    installSpawnHook();
    boostAll();
  }

  install();
  setTimeout(install,100);
  setTimeout(install,600);
  setInterval(boostAll,1200);

  window.PPA_FART_GUARD_HP_BONUS=HP_BONUS;
})();