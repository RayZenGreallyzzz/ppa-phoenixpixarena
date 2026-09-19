(function(){
  'use strict';

  var autoOn=false;
  var lastAutoAt=0;
  var lastPkAttackAt=0;
  var lastPkNoticeAt=0;
  var lastPkSendAt=0;
  var lastPkResolvedAt=0;
  var selectedPlayerId='';
  var fartMineId='';
  var fartReturning=false;
  window.PPA_WORLD_PVP_ON=!!window.PPA_WORLD_PVP_ON;

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

  function remoteId(r){
    return String((r&&(r.id||r.i||r.__ppaPid))||'');
  }

  function coords(r){
    if(!r)return{x:NaN,y:NaN};
    return{
      x:Number.isFinite(Number(r.tx))?Number(r.tx):Number(r.x),
      y:Number.isFinite(Number(r.ty))?Number(r.ty):Number(r.y)
    };
  }

  function remoteTargetable(r){
    // The realtime server is authoritative for death. A transient stale hp=0 on
    // the observer must not make a visibly alive remote player impossible to target.
    if(!r||!r.hasPos)return false;
    if(Number(r.hiddenUntil)>Date.now())return false;
    try{if(window.PPA_REMOTE_PLAYER_TARGETABLE&&!window.PPA_REMOTE_PLAYER_TARGETABLE(r))return false}catch(_){}
    var p=coords(r);
    return !!remoteId(r)&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  }

  function selectedRemote(){
    try{
      if(!selectedPlayerId||!window.PPA_ONLINE||!PPA_ONLINE.remotes)return null;
      var r=PPA_ONLINE.remotes.get(String(selectedPlayerId))||null;
      if(!remoteTargetable(r)){
        if(!r){selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID=''}
        return null;
      }
      return r;
    }catch(_){return null}
  }

  function distTo(r){
    try{
      var p=coords(r);
      return Math.hypot(p.x-Number(P.x),p.y-Number(P.y));
    }catch(_){return Infinity}
  }

  function basicRange(){
    try{
      var r=(typeof playerBasicRange==='function')?Number(playerBasicRange()):Number(P&&P.attackRange);
      return Math.max(60,Number.isFinite(r)?r:60)+38;
    }catch(_){return 98}
  }

  function nearestRemote(maxDistance){
    try{
      if(!window.PPA_ONLINE||!PPA_ONLINE.remotes)return null;
      var best=null,bd=Infinity;
      PPA_ONLINE.remotes.forEach(function(r){
        if(!remoteTargetable(r))return;
        var d=distTo(r);
        if(d<bd){bd=d;best=r}
      });
      if(!best)return null;
      if(Number.isFinite(Number(maxDistance))&&bd>Number(maxDistance))return null;
      return best;
    }catch(_){return null}
  }

  function selectRemote(r,quiet){
    if(!remoteTargetable(r))return false;
    var id=remoteId(r);if(!id)return false;
    selectedPlayerId=id;
    window.PPA_WORLD_PVP_TARGET_ID=id;
    // A PK player and a PvE mob must never compete for movement/attack ownership.
    try{if(typeof cancelSmartAttack==='function')cancelSmartAttack()}catch(_){}
    try{if(typeof P!=='undefined'&&P)P.tid=null}catch(_){}
    if(!quiet)popup('ПК ЦЕЛЬ · '+String(r.name||r.n||'Игрок'),'#ff9d80');
    return true;
  }

  window.PPA_WORLD_PLAYER_SELECT=function(r){return selectRemote(r,false)};
  window.PPA_WORLD_PK_ACTIVE=function(){return !!(window.PPA_WORLD_PVP_ON&&combatScene())};
  window.PPA_WORLD_PLAYER_CLEAR=function(){selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID=''};
  window.PPA_WORLD_SELECTED_REMOTE=selectedRemote;

  function preparePkSkillTarget(r){
    try{
      // Keep renderer interpolation state untouched. Skills receive one cached
      // lightweight proxy whose combat coordinates/stats are refreshed on demand.
      var src=(r&&r.__ppaRemoteSource)||r;
      if(!remoteTargetable(src))return null;
      var p=coords(src),id=remoteId(src);
      if(!id||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;

      var q=src.__ppaPkCombatProxy;
      if(!q){
        q={__ppaRemotePlayer:true,__ppaRemoteSource:src,isAiFighter:false,isBoss:false,hasPos:true};
        src.__ppaPkCombatProxy=q;
      }
      q.__ppaRemotePlayer=true;
      q.__ppaRemoteSource=src;
      q.__ppaRemoteId=id;
      q.id=id;q.i=id;q.__ppaPid=id;
      q.x=p.x;q.y=p.y;q.tx=p.x;q.ty=p.y;
      q.hp=Math.max(0,Number(src.hp)||0);
      q.mhp=Math.max(1,Number(src.mhp)||1);
      q.def=Math.max(0,Number(src.def)||0);
      q.hiddenUntil=Math.max(0,Number(src.hiddenUntil)||0);
      q.sz=Math.max(0,Number(src.sz)||Number(src.__ppaHitBody)||0);
      q.hasPos=true;
      return q;
    }catch(_){return null}
  }

  window.PPA_WORLD_SKILL_TARGET=function(maxRange){
    try{
      if(!window.PPA_WORLD_PVP_ON||!combatScene())return null;
      var r=preparePkSkillTarget(selectedRemote());if(!r)return null;
      var d=Math.hypot(Number(r.x)-Number(P.x),Number(r.y)-Number(P.y));
      var lim=Math.max(0,Number(maxRange)||0);
      if(lim>0&&d>lim+46)return null;
      return r;
    }catch(_){return null}
  };

  window.PPA_WORLD_AROUND_TARGET=function(x,y,rad,out){
    try{
      if(!window.PPA_WORLD_PVP_ON||!combatScene())return out;
      var r=preparePkSkillTarget(selectedRemote());if(!r)return out;
      if(Math.hypot(Number(r.x)-Number(x),Number(r.y)-Number(y))<=Math.max(0,Number(rad)||0)+36){
        if(Array.isArray(out)&&out.indexOf(r)<0)out.push(r);
      }
    }catch(_){}
    return out;
  };

  window.PPA_WORLD_SKILL_HIT=function(r,amount,crit,maxRange,damageType){
    try{
      r=preparePkSkillTarget(r);
      if(!r||!window.PPA_WORLD_PVP_ON||!combatScene()||!window.PPA_RT_SEND)return false;
      return !!window.PPA_RT_SEND({
        type:'world-pvp-skill-hit',target:remoteId(r),
        amount:Math.max(1,Math.min(99999,Math.round(Number(amount)||1))),
        crit:!!crit,range:Math.max(80,Math.min(700,Number(maxRange)||650)),
        damageType:String(damageType||'physical')
      });
    }catch(_){return false}
  };

  window.PPA_WORLD_PLAYER_CONTROL=function(r,kind,mul,ms,range){
    try{
      r=preparePkSkillTarget(r);
      var k=String(kind||'');
      if(!r||!window.PPA_WORLD_PVP_ON||!combatScene()||!window.PPA_RT_SEND||(k!=='slow'&&k!=='root'))return false;
      return !!window.PPA_RT_SEND({
        type:'world-pvp-control',target:remoteId(r),kind:k,
        mul:k==='slow'?Math.max(.25,Math.min(.95,Number(mul)||.55)):0,
        duration:Math.max(100,Math.min(4500,Math.round(Number(ms)||0))),
        range:Math.max(80,Math.min(700,Number(range)||650))
      });
    }catch(_){return false}
  };

  function sendPkState(enabled){
    if(typeof window.PPA_WORLD_PVP_SET!=='function')return false;
    return !!window.PPA_WORLD_PVP_SET(!!enabled);
  }

  function togglePk(){
    if(!combatScene()){popup('ПК здесь недоступен','#ffb36b');return}
    var next=!window.PPA_WORLD_PVP_ON;
    if(!sendPkState(next)){
      popup('ПК · ONLINE переподключается','#ffb36b');
      return;
    }
    window.PPA_WORLD_PVP_ON=next;
    if(!next){selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID=''}
    refresh();
    popup(next?'ПК ВКЛ · игроки доступны для атаки':'ПК ВЫКЛ',next?'#ff8b72':'#c6b99f');
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
      '#ppaWorldCombatToggles{position:fixed!important;right:20px!important;bottom:263px!important;z-index:10050!important;display:none;gap:6px;align-items:center;justify-content:flex-end;pointer-events:auto!important;touch-action:none!important}'+
      '#ppaWorldCombatToggles button{position:relative;z-index:10051!important;height:29px;min-width:50px;padding:0 7px;border-radius:7px;border:1px solid rgba(220,170,80,.62);background:rgba(8,10,13,.92);color:#d8c7a0;font:700 8px/1 monospace;letter-spacing:.04em;box-shadow:0 2px 7px rgba(0,0,0,.62);pointer-events:auto!important;touch-action:none!important;-webkit-user-select:none;user-select:none}'+
      '#ppaWorldCombatToggles button.pkOn{border-color:#ff6c5b;color:#ffd6ce;background:rgba(88,17,12,.92);box-shadow:0 0 10px rgba(255,72,50,.34)}'+
      '#ppaWorldCombatToggles button.autoOn{border-color:#75d89d;color:#caffdc;background:rgba(12,62,35,.90)}'+
      '#ppaWorldCombatToggles button.locked{opacity:.52;border-style:dashed}'+
      '@media(max-width:700px){#ppaWorldCombatToggles{right:17px!important;bottom:264px!important}}';
    document.head.appendChild(st);

    box=document.createElement('div');
    box.id='ppaWorldCombatToggles';

    var pk=document.createElement('button');
    pk.id='ppaWorldPkBtn';
    pk.type='button';
    pk.textContent='ПК';

    var au=document.createElement('button');
    au.id='ppaWorldAutoBtn';
    au.type='button';
    au.textContent='АВТО';

    box.appendChild(pk);
    box.appendChild(au);
    document.body.appendChild(box);

    bindActivate(pk,togglePk);
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
    var show=combatScene()&&!((typeof transitioning!=='undefined')&&transitioning);
    box.style.display=show?'flex':'none';

    var pk=document.getElementById('ppaWorldPkBtn');
    if(pk){
      pk.textContent=window.PPA_WORLD_PVP_ON?'ПК ВКЛ':'ПК';
      pk.classList.toggle('pkOn',!!window.PPA_WORLD_PVP_ON);
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
      selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID='';
      if(window.PPA_WORLD_PVP_ON)sendPkState(false);
      window.PPA_WORLD_PVP_ON=false;
    }
  }

  function attackRemote(r){
    try{
      if(!window.PPA_WORLD_PVP_ON||!combatScene()||!remoteTargetable(r))return false;
      var d=distTo(r),range=basicRange();
      if(d>range+26){
        var now=Date.now();
        if(now-lastPkNoticeAt>900){lastPkNoticeAt=now;popup('ПК · цель вне радиуса атаки','#ffb36b')}
        return true;
      }
      if(P.dead||Number(P.shootCD||0)>0)return true;

      var now2=Date.now(),rate=Math.max(.35,Number(P.atkSpd)||1);
      var minMs=Math.max(180,Math.round(1000/rate*.82));
      if(now2-lastPkAttackAt<minMs)return true;

      var rr={def:Math.max(0,Number(r.def)||0),isAiFighter:false};
      var hit;
      try{hit=(typeof basicAttackRoll==='function')?basicAttackRoll(rr):{damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false}}
      catch(_){hit={damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false}}

      if(!window.PPA_RT_SEND||!window.PPA_RT_SEND({
        type:'world-pvp-hit',
        target:remoteId(r),
        amount:Math.max(1,Math.min(99999,Number(hit.damage)||1)),
        crit:!!hit.crit,
        range:Math.max(60,Math.min(480,range)),
        pk:true
      })){
        popup('ПК · ONLINE переподключается','#ffb36b');
        return true;
      }

      lastPkAttackAt=now2;
      lastPkSendAt=now2;
      window.__PPA_PK_LAST_SEND_AT=now2;
      // Event-driven diagnostic only: no polling, no frame work. If neither ACK
      // nor REJECT comes back, surface it once so the next test tells us whether
      // the packet reached the realtime server.
      setTimeout(function(){
        if(lastPkSendAt===now2&&lastPkResolvedAt<now2){
          popup('ПК · нет ответа сервера','#ff8b72');
        }
      },1100);
      P.shootCD=Math.max(1,Math.round(60/(rate*(typeof shopAtkSpeedMul==='function'?shopAtkSpeedMul():1))));
      P.attacking=true;P.anim='attack';P.animFrame=0;P.animTimer=0;

      var p=coords(r),dx=p.x-Number(P.x);
      if(Math.abs(dx)>.1)P.face=dx<0?-1:1;

      if(Number(P.smokeUntil)>now2){
        P.smokeUntil=0;P.smokeDodgeBonus=0;
        if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(0);
      }
      return true;
    }catch(_){return false}
  }

  function tryPkBasicAttack(){
    try{
      if(window.__PPA_AUTO_PVE_ONLY)return false;
      if(!window.PPA_WORLD_PVP_ON||!combatScene())return false;

      var r=selectedRemote();
      if(r)return attackRemote(r);

      // Do not depend on a successful canvas tap: the attack button itself
      // may acquire the nearest visible player, exactly like normal PvE attack.
      r=nearestRemote(basicRange()+74);
      if(!r){
        var near=nearestRemote(520);
        if(near){
          selectRemote(near,true);
          var now=Date.now();
          if(now-lastPkNoticeAt>900){lastPkNoticeAt=now;popup('ПК · цель вне радиуса атаки','#ffb36b')}
          return true;
        }
        return false;
      }
      selectRemote(r,false);
      return attackRemote(r);
    }catch(_){return false}
  }

  // Called from the game's real queueAttack() before the normal PvE path.
  // AUTO sets __PPA_AUTO_PVE_ONLY, so Premium AUTO never attacks players.
  window.PPA_WORLD_PK_TRY_BASIC_ATTACK=tryPkBasicAttack;

  // PK input intentionally has no extra attack-button listeners and no observers.
  // The base game owns bAtk and calls queueAttack(); build.mjs adds one PK branch
  // at the start of queueAttack(). Player tap ownership lives in social-ui.js.

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

      if(typeof queueAttack==='function'){
        window.__PPA_AUTO_PVE_ONLY=true;
        try{queueAttack()}finally{window.__PPA_AUTO_PVE_ONLY=false}
      }
    }catch(_){window.__PPA_AUTO_PVE_ONLY=false}
  }

  window.PPA_WORLD_COMBAT_REFRESH=refresh;
  window.PPA_WORLD_COMBAT_ACK=function(){lastPkNoticeAt=0;lastPkResolvedAt=Date.now();window.__PPA_PK_LAST_ACK_AT=lastPkResolvedAt};
  window.PPA_WORLD_COMBAT_REJECT=function(reason){lastPkResolvedAt=Date.now();window.__PPA_PK_LAST_REJECT=String(reason||'атака отклонена');window.__PPA_PK_LAST_REJECT_AT=lastPkResolvedAt;popup('ПК · '+window.__PPA_PK_LAST_REJECT,'#ff8b72')};
  window.PPA_WORLD_COMBAT_DIAG=function(){
    var r=selectedRemote();
    return{
      pk:!!window.PPA_WORLD_PVP_ON,
      auto:!!autoOn,
      unlocked:!!autoUnlocked(),
      scene:scene(),
      selected:selectedPlayerId||'',
      target:!!r,
      distance:r?Math.round(distTo(r)):null,
      attackRange:Math.round(basicRange()),
      fartMine:fartMineId||'',
      returning:!!fartReturning
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