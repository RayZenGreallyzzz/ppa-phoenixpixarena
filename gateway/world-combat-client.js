(function(){
  'use strict';

  // AUTO only. PK/PvP logic was intentionally removed because it added
  // unnecessary realtime/player-target processing and caused mobile lag.
  var autoOn=false;
  var lastAutoAt=0;

  function scene(){
    try{return String(P&&P.scene||'safe')}catch(_){return'safe'}
  }

  function combatScene(){
    var s=scene();
    return s==='fartzone'||s==='dungeon'||s==='worldboss';
  }

  function popup(text,col){
    try{if(typeof showPickup==='function')showPickup(String(text||''),col||'#ffd16b')}catch(_){}
  }

  function premiumRoot(){
    try{
      if(!INV.premiumShop||typeof INV.premiumShop!=='object')INV.premiumShop={purchasedBundles:{}};
      if(!INV.premiumShop.purchasedBundles||typeof INV.premiumShop.purchasedBundles!=='object')INV.premiumShop.purchasedBundles={};
      return INV.premiumShop;
    }catch(_){return{}}
  }

  function autoUnlocked(){
    try{
      var ps=premiumRoot(),b=ps.purchasedBundles||{};
      if(ps.autoAttackUnlocked)return true;
      return Number(b.adventurer)>0||Number(b.unique)>0||Number(b.epic)>0;
    }catch(_){return false}
  }

  function rememberUnlock(){
    if(!autoUnlocked())return false;
    try{
      var ps=premiumRoot();
      if(!ps.autoAttackUnlocked){
        ps.autoAttackUnlocked=true;
        if(typeof saveGame==='function')saveGame();
      }
    }catch(_){}
    return true;
  }

  function ensureHud(){
    var box=document.getElementById('ppaWorldCombatToggles');
    if(box)return box;

    var st=document.createElement('style');
    st.textContent=
      '#ppaWorldCombatToggles{position:fixed;right:24px;bottom:263px;z-index:9998;display:none;align-items:center;justify-content:flex-end;pointer-events:auto}'+
      '#ppaWorldCombatToggles button{height:27px;min-width:48px;padding:0 7px;border-radius:7px;border:1px solid rgba(220,170,80,.55);background:rgba(8,10,13,.88);color:#d8c7a0;font:700 8px/1 monospace;letter-spacing:.05em;box-shadow:0 2px 7px rgba(0,0,0,.55);touch-action:manipulation}'+
      '#ppaWorldCombatToggles button.autoOn{border-color:#75d89d;color:#caffdc;background:rgba(12,62,35,.88)}'+
      '#ppaWorldCombatToggles button.locked{opacity:.52;border-style:dashed}'+
      '@media(max-width:700px){#ppaWorldCombatToggles{right:19px}}';
    document.head.appendChild(st);

    box=document.createElement('div');
    box.id='ppaWorldCombatToggles';

    var au=document.createElement('button');
    au.id='ppaWorldAutoBtn';
    au.type='button';
    box.appendChild(au);
    document.body.appendChild(box);

    au.onclick=function(e){
      try{e.preventDefault();e.stopPropagation()}catch(_){}
      if(!combatScene())return;
      if(!rememberUnlock()){
        popup('AUTO доступно после покупки от 5 Gram или любой Premium-подписки','#d9a7ff');
        refresh();return;
      }
      autoOn=!autoOn;
      refresh();
      popup(autoOn?'AUTO АТАКА · ВКЛ':'AUTO АТАКА · ВЫКЛ',autoOn?'#8dffad':'#c6b99f');
    };

    return box;
  }

  function refresh(){
    var box=ensureHud();
    var show=combatScene()&&!((typeof transitioning!=='undefined')&&transitioning);
    box.style.display=show?'flex':'none';

    var au=document.getElementById('ppaWorldAutoBtn');
    if(au){
      var unlocked=rememberUnlock();
      au.textContent=unlocked?(autoOn?'АВТО ВКЛ':'АВТО'):'АВТО';
      au.classList.toggle('autoOn',!!autoOn&&unlocked);
      au.classList.toggle('locked',!unlocked);
    }

    if(!show)autoOn=false;
  }

  function autoTick(){
    try{
      var now=Date.now();
      if(!autoOn||!rememberUnlock()||!combatScene()||P.dead||transitioning||now-lastAutoAt<180)return;
      lastAutoAt=now;

      // Use the original PvE smart attack path only. No player scans,
      // no player targeting, no extra realtime packets.
      if(typeof queueAttack==='function')queueAttack();
    }catch(_){}
  }

  window.PPA_WORLD_COMBAT_REFRESH=refresh;
  window.PPA_AUTO_ATTACK_DIAG=function(){
    return{auto:!!autoOn,unlocked:!!autoUnlocked(),scene:scene()};
  };

  function boot(){
    ensureHud();
    refresh();
    setInterval(refresh,900);
    setInterval(autoTick,120);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();