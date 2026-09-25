(function(){
  'use strict';

  var autoOn=false;
  var lastAutoAt=0;
  var fartMineId='';
  var fartReturning=false;
  var pkOn=false;

  function scene(){
    try{return String(P&&P.scene||'safe')}catch(_){return'safe'}
  }

  function combatScene(){
    var s=scene();
    return s==='fartzone'||s==='dungeon'||s==='worldboss'||s==='clanboss1'||s==='mimic_sombrero_arena';
  }

  function pkZone(){
    var s=scene();
    if(s==='safe'||s==='pvp1'||s==='pvpteam'||s==='clansiege'||s==='clanboss1'||s==='mimic_sombrero_arena')return false;
    // All ordinary non-safe gameplay maps are PvE+PvP zones.
    return true;
  }

  function setPk(on,quiet){
    on=!!on&&pkZone();
    if(pkOn===on)return pkOn;
    pkOn=on;
    try{if(window.PPA_RT_SEND)window.PPA_RT_SEND({type:'player-pk-toggle',enabled:pkOn})}catch(_){}
    try{if(!pkOn&&window.PPA_PK_CLEAR_TARGET)window.PPA_PK_CLEAR_TARGET()}catch(_){}
    refresh();
    if(!quiet)popup(pkOn?'ПК · ИГРОКИ ВРАЖДЕБНЫ':'ПК · ВЫКЛ',pkOn?'#ff8b72':'#c6b99f');
    return pkOn;
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

  function bindActivate(el,fn){
    if(!el||el.__ppaBound)return;
    el.__ppaBound=true;
    var last=0;
    var fire=function(e){
      var now=Date.now();
      if(now-last<260)return;
      last=now;
      try{
        if(e){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}
      }catch(_){}
      fn();
    };
    el.addEventListener('pointerdown',fire,{passive:false});
    el.addEventListener('touchstart',fire,{passive:false});
    el.addEventListener('click',fire,{passive:false});
  }

  function ensureHud(){
    var box=document.getElementById('ppaWorldCombatToggles');
    if(box)return box;

    var st=document.createElement('style');
    st.textContent=
      '#ppaWorldCombatToggles{position:fixed!important;right:20px!important;bottom:263px!important;z-index:40!important;display:none;gap:6px;align-items:center;justify-content:flex-end;pointer-events:auto!important;touch-action:none!important}'+
      '#ppaWorldCombatToggles button{position:relative;z-index:41!important;height:29px;min-width:50px;padding:0 7px;border-radius:7px;border:1px solid rgba(220,170,80,.62);background:rgba(8,10,13,.92);color:#d8c7a0;font:700 8px/1 monospace;letter-spacing:.04em;box-shadow:0 2px 7px rgba(0,0,0,.62);pointer-events:auto!important;touch-action:none!important;-webkit-user-select:none;user-select:none}'+
      '#ppaWorldCombatToggles button.autoOn{border-color:#75d89d;color:#caffdc;background:rgba(12,62,35,.90)}'+
      '#ppaWorldCombatToggles button.pkOn{border-color:#ff6b57;color:#ffe0da;background:rgba(92,20,16,.94);box-shadow:0 0 9px rgba(255,70,45,.34)}'+
      '#ppaWorldCombatToggles button.locked{opacity:.52;border-style:dashed}'+
      '@media(max-width:700px){#ppaWorldCombatToggles{right:17px!important;bottom:264px!important}}';
    document.head.appendChild(st);

    box=document.createElement('div');
    box.id='ppaWorldCombatToggles';

    var au=document.createElement('button');
    au.id='ppaWorldAutoBtn';
    au.type='button';
    au.textContent='АВТО';

    var pk=document.createElement('button');
    pk.id='ppaPlayerPkBtn';
    pk.type='button';
    pk.textContent='ПК';

    box.appendChild(pk);
    box.appendChild(au);
    document.body.appendChild(box);

    bindActivate(pk,function(){
      if(!pkZone())return;
      setPk(!pkOn,false);
    });

    bindActivate(au,function(){
      if(!combatScene())return;
      if(!rememberUnlock()){
        popup('АВТО доступно после покупки от 5 Gram или любой Premium-подписки','#d9a7ff');
        refresh();return;
      }
      if(!autoOn&&scene()==='fartzone'){
        var mine=lockFartMine();
        if(!mine){
          popup('АВТО · подойди к руднику','#d8bc7b');
          refresh();return;
        }
      }
      autoOn=!autoOn;
      if(!autoOn){
        fartMineId='';fartReturning=false;
        try{if(typeof cancelSmartAttack==='function')cancelSmartAttack()}catch(_){}
      }
      refresh();
      popup(autoOn?(scene()==='fartzone'?'АВТО · РУДНИК ЗАКРЕПЛЁН':'АВТО АТАКА · ВКЛ'):'АВТО АТАКА · ВЫКЛ',autoOn?'#8dffad':'#c6b99f');
    });

    return box;
  }

  function refresh(){
    var box=ensureHud();
    var show=(combatScene()||pkZone())&&!((typeof transitioning!=='undefined')&&transitioning);
    box.style.display=show?'flex':'none';

    var pk=document.getElementById('ppaPlayerPkBtn');
    if(pk){
      pk.style.display=pkZone()?'inline-block':'none';
      pk.textContent=pkOn?'ПК ВКЛ':'ПК';
      pk.classList.toggle('pkOn',!!pkOn&&pkZone());
    }

    var au=document.getElementById('ppaWorldAutoBtn');
    if(au){
      var unlocked=rememberUnlock();
      au.textContent=unlocked?(autoOn?'АВТО ВКЛ':'АВТО'):'АВТО';
      au.classList.toggle('autoOn',!!autoOn&&unlocked);
      au.classList.toggle('locked',!unlocked);
    }

    if(!show){
      autoOn=false;fartMineId='';fartReturning=false;
    }
    if(!pkZone()&&pkOn)setPk(false,true);
  }

  function fartMineRadius(){
    try{return Math.max(40,Number(FART_MINE_RADIUS)||82)}catch(_){return 82}
  }

  function fartMineByLockedId(){
    try{
      if(!fartMineId)return null;
      if(typeof fartMineById==='function')return fartMineById(fartMineId);
      var a=FART_ZONE_STATE&&Array.isArray(FART_ZONE_STATE.mines)?FART_ZONE_STATE.mines:[];
      for(var i=0;i<a.length;i++)if(a[i]&&String(a[i].id)===String(fartMineId))return a[i];
    }catch(_){}
    return null;
  }

  function fartNearestAutoMine(){
    try{
      if(scene()!=='fartzone')return null;
      var st=(typeof FART_ZONE_STATE!=='undefined'&&FART_ZONE_STATE)||null;
      if(st&&st.autoMineId){
        var active=(typeof fartMineById==='function')?fartMineById(st.autoMineId):null;
        if(active)return active;
      }
      var locked=fartMineByLockedId();
      if(locked)return locked;
      if(typeof fartNearestMine==='function')return fartNearestMine(fartMineRadius()+12);
    }catch(_){}
    return null;
  }

  function lockFartMine(){
    var mine=fartNearestAutoMine();
    if(!mine)return null;
    fartMineId=String(mine.id||'');
    return mine;
  }

  function fartGuardTarget(mine){
    if(!mine)return null;
    try{
      var list=(typeof EN!=='undefined'&&Array.isArray(EN))?EN:[];
      var radius=165;
      try{radius=Math.max(125,Math.min(210,Number(FART_GUARD_AGGRO_RADIUS)||210))}catch(_){}
      var best=null,bd=Infinity;
      for(var i=0;i<list.length;i++){
        var e=list[i];
        if(!e||!e.isFartGuard||e.hp<=0||String(e.fartMineId||'')!==String(mine.id||''))continue;
        if(Math.hypot(Number(e.x||0)-Number(mine.x||0),Number(e.y||0)-Number(mine.y||0))>radius)continue;
        var d=Math.hypot(Number(e.x||0)-Number(P.x||0),Number(e.y||0)-Number(P.y||0));
        if(d<bd){bd=d;best=e}
      }
      return best;
    }catch(_){return null}
  }

  function fartHasGuard(mine){return !!fartGuardTarget(mine)}

  function attackSpecific(target){
    try{
      if(!target||target.hp<=0)return false;
      P.tid=target.id;
      var inRange=(typeof smartAttackDistance==='function'&&typeof smartAttackReach==='function')
        ?smartAttackDistance(target)<=smartAttackReach(target)
        :Math.hypot(target.x-P.x,target.y-P.y)<=Math.max(55,Number(P.attackRange)||60);
      if(inRange&&P.shootCD<=0){
        if(typeof cancelSmartAttack==='function')cancelSmartAttack();
        attackQueued=true;
      }else if(typeof startSmartAttack==='function'){
        startSmartAttack(target);
      }
      return true;
    }catch(_){return false}
  }

  window.PPA_FART_AUTO_MOVE=function(){
    try{
      if(!autoOn||scene()!=='fartzone'||!fartReturning)return null;
      if(Math.hypot(Number(jX)||0,Number(jY)||0)>.08)return null;
      var mine=fartMineByLockedId();
      if(!mine||fartHasGuard(mine))return null;
      var dx=Number(mine.x||0)-Number(P.x||0),dy=Number(mine.y||0)-Number(P.y||0);
      var d=Math.hypot(dx,dy),stop=Math.max(42,fartMineRadius()*.62);
      if(d<=stop){fartReturning=false;return null}
      return{x:dx/Math.max(.001,d),y:dy/Math.max(.001,d)};
    }catch(_){return null}
  };

  function autoTick(){
    try{
      var now=Date.now();
      if(!autoOn||!rememberUnlock()||!combatScene()||P.dead||transitioning||now-lastAutoAt<180)return;
      lastAutoAt=now;

      if(scene()==='fartzone'){
        var mine=fartMineByLockedId()||lockFartMine();
        if(!mine){autoOn=false;fartMineId='';fartReturning=false;refresh();return}
        var target=fartGuardTarget(mine);
        if(target){
          fartReturning=false;
          attackSpecific(target);
          return;
        }
        try{if(typeof cancelSmartAttack==='function')cancelSmartAttack()}catch(_){}
        P.tid=null;
        fartReturning=true;
        return;
      }

      if(typeof queueAttack==='function')queueAttack();
    }catch(_){}
  }

  window.PPA_PK_ACTIVE=function(){return !!pkOn&&pkZone()};
  window.PPA_PK_SERVER_STATE=function(v){
    pkOn=!!v&&pkZone();
    if(!pkOn)try{if(window.PPA_PK_CLEAR_TARGET)window.PPA_PK_CLEAR_TARGET()}catch(_){}
    refresh();
    return pkOn;
  };
  window.PPA_PK_SET=function(v){return setPk(!!v,false)};
  window.PPA_PK_ZONE=function(){return pkZone()};
  window.PPA_WORLD_COMBAT_REFRESH=refresh;
  window.PPA_WORLD_COMBAT_DIAG=function(){
    return{
      auto:!!autoOn,
      unlocked:!!autoUnlocked(),
      scene:scene(),
      fartMine:fartMineId||'',
      returning:!!fartReturning,
      pk:!!pkOn,
      pkZone:pkZone()
    };
  };

  function boot(){
    ensureHud();
    refresh();
    setInterval(refresh,850);
    setInterval(autoTick,120);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
