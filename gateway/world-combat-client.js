(function(){
  'use strict';

  // Clean PK runtime. One source of truth:
  // - the normal game's queueAttack() calls PPA_WORLD_PK_TRY_BASIC_ATTACK first;
  // - this module never captures/steals pointer/touch/click events from the attack button;
  // - the server remains authoritative for player HP and legal combat zones.
  var autoOn=false;
  var selectedPlayerId='';
  var lastAttackAt=0;
  var lastAutoAt=0;
  var lastRangeNoteAt=0;
  var lastAckAt=0;
  var lastReject='';

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
      // New purchases/subscriptions write this permanent entitlement directly.
      if(ps.autoAttackUnlocked)return true;
      // Backward compatibility for the three historical 5/10/30 Gram bundles.
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
    var x=Number.isFinite(Number(r.tx))?Number(r.tx):Number(r.x);
    var y=Number.isFinite(Number(r.ty))?Number(r.ty):Number(r.y);
    return{x:x,y:y};
  }

  function targetable(r){
    if(!r||!r.hasPos||Number(r.hp)<=0)return false;
    if(Number(r.hiddenUntil)>Date.now())return false;
    try{if(window.PPA_REMOTE_PLAYER_TARGETABLE&&!window.PPA_REMOTE_PLAYER_TARGETABLE(r))return false}catch(_){}
    var p=coords(r);
    return Number.isFinite(p.x)&&Number.isFinite(p.y)&&!!remoteId(r);
  }

  function decorate(r){
    if(!r)return null;
    var p=coords(r);
    r.__ppaRemotePlayer=true;
    r.__ppaRemoteId=remoteId(r);
    r.__ppaCombatX=p.x;
    r.__ppaCombatY=p.y;
    return r;
  }

  function selectedRemote(){
    try{
      if(!selectedPlayerId||!window.PPA_ONLINE||!PPA_ONLINE.remotes)return null;
      var r=PPA_ONLINE.remotes.get(String(selectedPlayerId))||null;
      if(!targetable(r)){
        if(!r||Number(r.hp)<=0){selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID=''}
        return null;
      }
      return decorate(r);
    }catch(_){return null}
  }

  function basicRange(){
    try{
      var v=typeof playerBasicRange==='function'?Number(playerBasicRange()):Number(P&&P.attackRange);
      return Math.max(60,Number.isFinite(v)?v:60)+38;
    }catch(_){return 98}
  }

  function distanceTo(r){
    try{
      var p=coords(r);
      return Math.hypot(p.x-Number(P.x),p.y-Number(P.y));
    }catch(_){return Infinity}
  }

  function nearestPlayer(maxDistance){
    try{
      if(!window.PPA_ONLINE||!PPA_ONLINE.remotes)return null;
      var best=null,bd=Infinity;
      PPA_ONLINE.remotes.forEach(function(r){
        if(!targetable(r))return;
        var d=distanceTo(r);
        if(d<bd){bd=d;best=r}
      });
      if(!best)return null;
      if(Number.isFinite(Number(maxDistance))&&bd>Number(maxDistance))return null;
      best=decorate(best);
      best.__ppaAutoDistance=bd;
      return best;
    }catch(_){return null}
  }

  function setSelection(r,quiet){
    if(!r)return false;
    var id=remoteId(r);if(!id)return false;
    selectedPlayerId=id;
    window.PPA_WORLD_PVP_TARGET_ID=id;
    decorate(r);
    if(!quiet)popup('ЦЕЛЬ · '+String(r.name||r.n||'Игрок'),window.PPA_WORLD_PVP_ON?'#ff9d80':'#e8d08f');
    return true;
  }

  window.PPA_WORLD_PLAYER_SELECT=function(r){return setSelection(r,false)};
  window.PPA_WORLD_PLAYER_CLEAR=function(){selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID=''};
  window.PPA_WORLD_SELECTED_REMOTE=selectedRemote;

  function canAttackNow(){
    try{return typeof P!=='undefined'&&P&&!P.dead&&Number(P.shootCD||0)<=0}catch(_){return false}
  }

  function hitPacket(r){
    if(!r||!window.PPA_RT_SEND)return false;
    var id=remoteId(r);if(!id)return false;

    var rr={def:Math.max(0,Number(r.def)||0),isAiFighter:false,clanId:r.clanId||'',partyId:r.partyId||''};
    var hit;
    try{
      hit=typeof basicAttackRoll==='function'
        ?basicAttackRoll(rr)
        :{damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false};
    }catch(_){
      hit={damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false};
    }

    // A hit packet itself is an explicit hostile action. The server will also
    // mark the attacker PK, so there is no toggle/hit race after room changes.
    return !!window.PPA_RT_SEND({
      type:'world-pvp-hit',
      target:id,
      amount:Math.max(1,Math.min(99999,Number(hit.damage)||1)),
      crit:!!hit.crit,
      range:Math.max(60,Math.min(480,basicRange())),
      pk:true
    });
  }

  function animateAttack(r){
    try{
      var rate=Math.max(.35,Number(P.atkSpd)||1);
      P.shootCD=Math.max(1,Math.round(60/(rate*(typeof shopAtkSpeedMul==='function'?shopAtkSpeedMul():1))));
      P.attacking=true;P.anim='attack';P.animFrame=0;P.animTimer=0;
      var p=coords(r),dx=p.x-Number(P.x);
      if(Math.abs(dx)>.1)P.face=dx<0?-1:1;
      if(Number(P.smokeUntil)>Date.now()){
        P.smokeUntil=0;P.smokeDodgeBonus=0;
        if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(0);
      }
      if(typeof PT!=='undefined'&&Array.isArray(PT)){
        for(var i=0;i<4;i++)PT.push({
          x:p.x,y:p.y-8,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,
          life:10,ml:10,sz:2+Math.random()*2,col:'#ff765f'
        });
      }
    }catch(_){}
  }

  function attackRemote(r){
    if(!r||!targetable(r))return false;
    if(!canAttackNow())return true; // consume this PK press while attack is cooling down

    var now=Date.now();
    var rate=Math.max(.35,Number(P.atkSpd)||1);
    var minMs=Math.max(180,Math.round(1000/rate*.82));
    if(now-lastAttackAt<minMs)return true;

    if(!hitPacket(r)){
      popup('ПК · ONLINE переподключается','#ffb36b');
      return true;
    }

    lastAttackAt=now;
    animateAttack(r);
    return true;
  }

  // This is called directly at the very beginning of the base queueAttack().
  // true = PK consumed the press; false = continue original PvE attack logic.
  window.PPA_WORLD_PK_TRY_BASIC_ATTACK=function(){
    try{
      if(!window.PPA_WORLD_PVP_ON||!combatScene())return false;

      var r=selectedRemote();
      if(r){
        var d=distanceTo(r);
        if(d>basicRange()+18){
          var now=Date.now();
          if(now-lastRangeNoteAt>900){lastRangeNoteAt=now;popup('ПК · цель вне радиуса атаки','#ffb36b')}
          return true;
        }
        return attackRemote(r);
      }

      // No explicit target: a player already standing in normal attack range
      // has priority. Otherwise the original PvE queueAttack continues.
      r=nearestPlayer(basicRange()+18);
      if(!r)return false;
      setSelection(r,true);
      return attackRemote(r);
    }catch(_){return false}
  };

  window.PPA_WORLD_SKILL_TARGET=function(maxRange){
    try{
      if(!window.PPA_WORLD_PVP_ON||!combatScene())return null;
      var r=selectedRemote();
      if(!r){
        var lim=Math.max(80,Number(maxRange)||700)+46;
        r=nearestPlayer(lim);
        if(r)setSelection(r,true);
      }
      if(!r)return null;
      var d=distanceTo(r),lim2=Math.max(0,Number(maxRange)||0);
      if(lim2>0&&d>lim2+46)return null;
      var p=coords(r);
      r.x=p.x;r.y=p.y;
      r.hp=Math.max(0,Number(r.hp)||0);
      r.mhp=Math.max(1,Number(r.mhp)||1);
      r.def=Math.max(0,Number(r.def)||0);
      return decorate(r);
    }catch(_){return null}
  };

  window.PPA_WORLD_AROUND_TARGET=function(x,y,rad,out){
    try{
      if(!window.PPA_WORLD_PVP_ON||!combatScene())return out;
      var r=selectedRemote();if(!r)return out;
      var p=coords(r);
      if(Math.hypot(p.x-Number(x),p.y-Number(y))<=Math.max(0,Number(rad)||0)+36){
        r.x=p.x;r.y=p.y;decorate(r);
        if(Array.isArray(out)&&out.indexOf(r)<0)out.push(r);
      }
    }catch(_){}
    return out;
  };

  window.PPA_WORLD_SKILL_HIT=function(r,amount,crit,maxRange,damageType){
    try{
      if(!r||!r.__ppaRemotePlayer||!window.PPA_WORLD_PVP_ON||!combatScene()||!window.PPA_RT_SEND)return false;
      var id=remoteId(r);if(!id)return false;
      return !!window.PPA_RT_SEND({
        type:'world-pvp-skill-hit',target:id,
        amount:Math.max(1,Math.min(99999,Number(amount)||1)),
        crit:!!crit,range:Math.max(80,Math.min(700,Number(maxRange)||650)),
        damageType:String(damageType||'physical'),pk:true
      });
    }catch(_){return false}
  };

  window.PPA_WORLD_PLAYER_CONTROL=function(r,kind,mul,ms,range){
    try{
      if(!r||!r.__ppaRemotePlayer||!window.PPA_WORLD_PVP_ON||!combatScene()||!window.PPA_RT_SEND)return false;
      var id=remoteId(r),k=String(kind||'');
      if(!id||(k!=='slow'&&k!=='root'))return false;
      return !!window.PPA_RT_SEND({
        type:'world-pvp-control',target:id,kind:k,
        mul:k==='slow'?Math.max(.25,Math.min(.95,Number(mul)||.55)):0,
        duration:Math.max(100,Math.min(4500,Math.round(Number(ms)||0))),
        range:Math.max(80,Math.min(700,Number(range)||650)),pk:true
      });
    }catch(_){return false}
  };

  function ensureHud(){
    var box=document.getElementById('ppaWorldCombatToggles');
    if(box)return box;

    var st=document.createElement('style');
    st.textContent=
      '#ppaWorldCombatToggles{position:fixed;right:24px;bottom:263px;z-index:9998;display:none;gap:6px;align-items:center;justify-content:flex-end;pointer-events:auto}'+
      '#ppaWorldCombatToggles button{height:27px;min-width:48px;padding:0 7px;border-radius:7px;border:1px solid rgba(220,170,80,.55);background:rgba(8,10,13,.88);color:#d8c7a0;font:700 8px/1 monospace;letter-spacing:.05em;box-shadow:0 2px 7px rgba(0,0,0,.55);touch-action:manipulation}'+
      '#ppaWorldCombatToggles button.on{border-color:#ff765f;color:#ffd4ca;background:rgba(82,18,12,.88)}'+
      '#ppaWorldCombatToggles button.autoOn{border-color:#75d89d;color:#caffdc;background:rgba(12,62,35,.88)}'+
      '#ppaWorldCombatToggles button.locked{opacity:.52;border-style:dashed}'+
      '@media(max-width:700px){#ppaWorldCombatToggles{right:19px}}';
    document.head.appendChild(st);

    box=document.createElement('div');box.id='ppaWorldCombatToggles';
    var pk=document.createElement('button');pk.id='ppaWorldPvpBtn';pk.type='button';
    var au=document.createElement('button');au.id='ppaWorldAutoBtn';au.type='button';
    box.appendChild(pk);box.appendChild(au);document.body.appendChild(box);

    pk.onclick=function(e){
      try{e.preventDefault();e.stopPropagation()}catch(_){}
      if(!combatScene())return;
      var next=!window.PPA_WORLD_PVP_ON;
      if(!window.PPA_RT_SEND||!window.PPA_RT_SEND({type:'world-pvp-toggle',enabled:next})){
        popup('ПК · ONLINE переподключается','#ffb36b');return;
      }
      window.PPA_WORLD_PVP_ON=next;
      if(!next){selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID=''}
      refresh();
      popup(next?'ПК включён':'ПК выключен',next?'#ff9d80':'#b9c0c7');
    };

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
    var box=ensureHud(),show=combatScene()&&!((typeof transitioning!=='undefined')&&transitioning);
    box.style.display=show?'flex':'none';
    var pk=document.getElementById('ppaWorldPvpBtn'),au=document.getElementById('ppaWorldAutoBtn');
    if(pk){
      pk.textContent=window.PPA_WORLD_PVP_ON?'ПК ВКЛ':'ПК ВЫКЛ';
      pk.classList.toggle('on',!!window.PPA_WORLD_PVP_ON);
    }
    if(au){
      var unlocked=rememberUnlock();
      au.textContent=unlocked?(autoOn?'АВТО ВКЛ':'АВТО'):'АВТО';
      au.classList.toggle('autoOn',!!autoOn&&unlocked);
      au.classList.toggle('locked',!unlocked);
    }
    if(!show){
      autoOn=false;
      selectedPlayerId='';
      window.PPA_WORLD_PVP_TARGET_ID='';
      window.PPA_WORLD_PVP_ON=false;
    }
  }

  window.PPA_WORLD_COMBAT_REFRESH=refresh;
  window.PPA_WORLD_COMBAT_ACK=function(){lastAckAt=Date.now();lastReject=''};
  window.PPA_WORLD_COMBAT_REJECT=function(reason){
    lastReject=String(reason||'атака отклонена');
    popup('ПК · '+lastReject,'#ff8b72');
  };

  function autoTick(){
    try{
      var now=Date.now();
      if(!autoOn||!rememberUnlock()||!combatScene()||P.dead||transitioning||now-lastAutoAt<180)return;
      lastAutoAt=now;

      if(window.PPA_WORLD_PVP_ON){
        var r=nearestPlayer(basicRange()+18);
        if(r){
          setSelection(r,true);
          attackRemote(r);
          return;
        }
      }

      // Core queueAttack() will do the original smart PvE approach/attack.
      if(typeof queueAttack==='function')queueAttack();
    }catch(_){}
  }

  function installQueueFallback(){
    try{
      if(window.__PPA_WORLD_PK_RUNTIME_CORE)return true;
      var base=null;
      try{if(typeof queueAttack==='function')base=queueAttack}catch(_){}
      if(!base&&typeof window.queueAttack==='function')base=window.queueAttack;
      if(typeof base!=='function')return false;

      // If build.mjs already injected the direct branch there is nothing to wrap.
      var src='';
      try{src=Function.prototype.toString.call(base)}catch(_){}
      if(src.indexOf('PPA_WORLD_PK_TRY_BASIC_ATTACK')>=0){
        window.__PPA_WORLD_PK_RUNTIME_CORE='build-hook';
        return true;
      }

      var wrapped=function(e){
        try{
          if(window.PPA_WORLD_PK_TRY_BASIC_ATTACK&&window.PPA_WORLD_PK_TRY_BASIC_ATTACK(e))return;
        }catch(_){}
        return base.apply(this,arguments);
      };
      wrapped.__ppaPkRuntimeCore=1;
      try{window.queueAttack=wrapped}catch(_){}
      try{queueAttack=wrapped}catch(_){}
      window.__PPA_WORLD_PK_RUNTIME_CORE='runtime-wrap';
      return true;
    }catch(_){return false}
  }

  window.PPA_WORLD_COMBAT_DIAG=function(){
    var r=selectedRemote();
    return{
      pk:!!window.PPA_WORLD_PVP_ON,
      auto:!!autoOn,
      scene:scene(),
      selected:selectedPlayerId||'',
      target:!!r,
      distance:r?Math.round(distanceTo(r)):null,
      attackRange:Math.round(basicRange()),
      nearest:remoteId(nearestPlayer(Infinity))||'',
      lastAckAt:lastAckAt,
      lastReject:lastReject,
      coreHook:String(window.__PPA_WORLD_PK_RUNTIME_CORE||'none')
    };
  };

  function boot(){
    ensureHud();installQueueFallback();refresh();
    setInterval(function(){installQueueFallback();refresh()},500);
    setInterval(autoTick,90);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();