(function(){
  'use strict';

  var autoOn=false,lastAutoAt=0,lastPvpAttackAt=0,lastRangeNoteAt=0,selectedPlayerId='',lastPkAttemptAt=0,lastPkAckAt=0,lastPkReject='';
  window.PPA_WORLD_PVP_ON=!!window.PPA_WORLD_PVP_ON;

  function scene(){
    try{return String(P&&P.scene||'safe')}catch(_){return'safe'}
  }
  function worldCombatScene(){
    var s=scene();
    return s==='fartzone'||s==='dungeon'||s==='worldboss';
  }
  function pvpScene(){return worldCombatScene()}

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
      if(Number(ps.lastPremiumPurchaseAt)>0)return true; // any Premium subscription ever purchased
      if(Number(b.adventurer)>0||Number(b.unique)>0||Number(b.epic)>0)return true; // 5/10/30 Gram bundles
    }catch(_){}
    return false;
  }

  function rememberUnlock(){
    try{
      if(!autoUnlocked())return false;
      var ps=premiumRoot();
      if(!ps.autoAttackUnlocked){
        ps.autoAttackUnlocked=true;
        try{if(typeof saveGame==='function')saveGame()}catch(_){}
      }
      return true;
    }catch(_){return false}
  }

  function popup(t,c){
    try{if(typeof showPickup==='function')showPickup(String(t||''),c||'#ffd16b')}catch(_){}
  }

  function ensureHud(){
    var box=document.getElementById('ppaWorldCombatToggles');
    if(box)return box;
    var st=document.createElement('style');
    st.textContent=
      '#ppaWorldCombatToggles{position:fixed;right:24px;bottom:263px;z-index:34;display:none;gap:6px;align-items:center;justify-content:flex-end;pointer-events:auto}'+
      '#ppaWorldCombatToggles button{height:27px;min-width:48px;padding:0 7px;border-radius:7px;border:1px solid rgba(220,170,80,.55);background:rgba(8,10,13,.88);color:#d8c7a0;font:700 8px/1 monospace;letter-spacing:.05em;box-shadow:0 2px 7px rgba(0,0,0,.55);touch-action:manipulation}'+
      '#ppaWorldCombatToggles button.on{border-color:#ff765f;color:#ffd4ca;background:rgba(82,18,12,.88);box-shadow:0 0 9px rgba(255,82,56,.35)}'+
      '#ppaWorldCombatToggles button.autoOn{border-color:#75d89d;color:#caffdc;background:rgba(12,62,35,.88)}'+
      '#ppaWorldCombatToggles button.locked{opacity:.52;border-style:dashed}'+
      '@media(max-width:700px){#ppaWorldCombatToggles{right:19px}}';
    document.head.appendChild(st);
    box=document.createElement('div');box.id='ppaWorldCombatToggles';
    var p=document.createElement('button');p.id='ppaWorldPvpBtn';p.textContent='ПК ВЫКЛ';
    var a=document.createElement('button');a.id='ppaWorldAutoBtn';a.textContent='АВТО';
    box.appendChild(p);box.appendChild(a);document.body.appendChild(box);

    p.addEventListener('pointerdown',function(e){
      e.preventDefault();e.stopPropagation();
      if(!pvpScene()){popup('ПК здесь недоступен','#ffb36b');return}
      var next=!window.PPA_WORLD_PVP_ON;
      if(typeof window.PPA_WORLD_PVP_SET!=='function'||!window.PPA_WORLD_PVP_SET(next)){
        popup('ПК · сервер переподключается','#ffb36b');return;
      }
      // Server ack is authoritative; optimistic UI makes the tap feel immediate.
      window.PPA_WORLD_PVP_ON=next;refresh();
      popup(next?'ПК включён · можно атаковать других игроков':'ПК выключен',next?'#ff9d80':'#b9c0c7');
    },{passive:false});

    a.addEventListener('pointerdown',function(e){
      e.preventDefault();e.stopPropagation();
      if(!worldCombatScene())return;
      if(!rememberUnlock()){
        popup('AUTO доступно после покупки от 5 Gram или любой Premium-подписки','#d9a7ff');
        refresh();return;
      }
      autoOn=!autoOn;refresh();
      popup(autoOn?'AUTO АТАКА · ВКЛ':'AUTO АТАКА · ВЫКЛ',autoOn?'#8dffad':'#c6b99f');
    },{passive:false});
    return box;
  }

  function refresh(){
    var box=ensureHud(),s=scene(),show=worldCombatScene()&&!((typeof transitioning!=='undefined')&&transitioning);
    box.style.display=show?'flex':'none';
    var pb=document.getElementById('ppaWorldPvpBtn'),ab=document.getElementById('ppaWorldAutoBtn');
    if(pb){
      pb.style.display=pvpScene()?'':'none';
      pb.textContent=window.PPA_WORLD_PVP_ON?'ПК ВКЛ':'ПК ВЫКЛ';
      pb.classList.toggle('on',!!window.PPA_WORLD_PVP_ON);
    }
    if(ab){
      var unlocked=rememberUnlock();
      ab.textContent=unlocked?(autoOn?'АВТО ВКЛ':'АВТО'):'АВТО';
      ab.classList.toggle('autoOn',!!autoOn&&unlocked);
      ab.classList.toggle('locked',!unlocked);
      ab.title=unlocked?'Автоматическая обычная атака по мобам':'Покупка от 5 Gram или любая Premium-подписка';
    }
    try{
      var buffs=document.getElementById('timedBuffHud');
      if(buffs)buffs.style.bottom=show?'298px':'263px';
    }catch(_){}
    if(!show){
      autoOn=false;
      selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID='';
      if(window.PPA_WORLD_PVP_ON&&typeof window.PPA_WORLD_PVP_SET==='function')window.PPA_WORLD_PVP_SET(false);
      window.PPA_WORLD_PVP_ON=false;
    }else if(selectedPlayerId){
      selectedRemote();
    }
  }
  window.PPA_WORLD_COMBAT_REFRESH=refresh;
  window.PPA_WORLD_COMBAT_ACK=function(){lastPkAckAt=Date.now();lastPkReject=''};
  window.PPA_WORLD_COMBAT_REJECT=function(reason){
    lastPkReject=String(reason||'unknown');
    popup('ПК · '+lastPkReject,'#ff8b72');
  };

  function remoteId(r){return String((r&&(r.id||r.i||r.__ppaPid))||'')}
  function sameParty(r){
    try{
      var my=String((window.PPA_PARTY_STATE&&PPA_PARTY_STATE.partyId)||'');
      return !!my&&String(r&&r.partyId||'')===my;
    }catch(_){return false}
  }
  function selectedRemote(){
    try{
      if(!selectedPlayerId||!window.PPA_ONLINE||!PPA_ONLINE.remotes)return null;
      var r=PPA_ONLINE.remotes.get(String(selectedPlayerId))||null;
      if(!r||!r.hasPos||Number(r.hp)<=0){
        selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID='';return null;
      }
      if(Number(r.hiddenUntil)>Date.now())return null;
      if(window.PPA_REMOTE_PLAYER_TARGETABLE&&!window.PPA_REMOTE_PLAYER_TARGETABLE(r))return null;
      r.__ppaRemotePlayer=true;
      r.__ppaRemoteId=remoteId(r);
      if(Number.isFinite(Number(r.tx)))r.__ppaCombatX=Number(r.tx);else r.__ppaCombatX=Number(r.x)||0;
      if(Number.isFinite(Number(r.ty)))r.__ppaCombatY=Number(r.ty);else r.__ppaCombatY=Number(r.y)||0;
      return r;
    }catch(_){return null}
  }

  function pvpAttackRange(){
    try{return Math.max(60,Number(typeof playerBasicRange==='function'?playerBasicRange():P.attackRange)||60)+38}
    catch(_){return 98}
  }

  function remoteInRange(r){
    try{
      if(!r)return false;
      var x=Number.isFinite(Number(r.__ppaCombatX))?Number(r.__ppaCombatX):Number(r.x);
      var y=Number.isFinite(Number(r.__ppaCombatY))?Number(r.__ppaCombatY):Number(r.y);
      return Math.hypot(x-Number(P.x),y-Number(P.y))<=pvpAttackRange()+18;
    }catch(_){return false}
  }

  window.PPA_WORLD_PLAYER_SELECT=function(r){
    try{
      var id=remoteId(r);if(!id)return false;
      selectedPlayerId=id;window.PPA_WORLD_PVP_TARGET_ID=id;
      var name=String(r.name||r.n||'Игрок');
      popup('ЦЕЛЬ · '+name,window.PPA_WORLD_PVP_ON?'#ff9d80':'#e8d08f');
      return true;
    }catch(_){return false}
  };
  window.PPA_WORLD_PLAYER_CLEAR=function(){
    selectedPlayerId='';window.PPA_WORLD_PVP_TARGET_ID='';
  };

  window.PPA_WORLD_SELECTED_REMOTE=function(){
    return selectedRemote();
  };

  window.PPA_WORLD_SKILL_TARGET=function(maxRange){
    try{
      if(!window.PPA_WORLD_PVP_ON||!pvpScene())return null;
      var r=selectedRemote();if(!r)return null;
      var x=Number.isFinite(Number(r.__ppaCombatX))?Number(r.__ppaCombatX):Number(r.x);
      var y=Number.isFinite(Number(r.__ppaCombatY))?Number(r.__ppaCombatY):Number(r.y);
      var d=Math.hypot(x-Number(P.x),y-Number(P.y));
      var lim=Math.max(0,Number(maxRange)||0);
      if(lim>0&&d>lim+46)return null;
      r.x=x;r.y=y;
      r.hp=Math.max(0,Number(r.hp)||0);
      r.mhp=Math.max(1,Number(r.mhp)||1);
      r.def=Math.max(0,Number(r.def)||0);
      r.__ppaRemotePlayer=true;
      r.__ppaRemoteId=remoteId(r);
      return r;
    }catch(_){return null}
  };

  window.PPA_WORLD_AROUND_TARGET=function(x,y,rad,out){
    try{
      if(!window.PPA_WORLD_PVP_ON||!pvpScene())return out;
      var r=selectedRemote();if(!r)return out;
      var rx=Number.isFinite(Number(r.__ppaCombatX))?Number(r.__ppaCombatX):Number(r.x);
      var ry=Number.isFinite(Number(r.__ppaCombatY))?Number(r.__ppaCombatY):Number(r.y);
      if(Math.hypot(rx-Number(x),ry-Number(y))<=Math.max(0,Number(rad)||0)+36){
        r.x=rx;r.y=ry;r.__ppaRemotePlayer=true;r.__ppaRemoteId=remoteId(r);
        if(Array.isArray(out)&&out.indexOf(r)<0)out.push(r);
      }
    }catch(_){}
    return out;
  };

  window.PPA_WORLD_SKILL_HIT=function(r,amount,crit,maxRange,damageType){
    try{
      if(!r||!r.__ppaRemotePlayer||!window.PPA_WORLD_PVP_ON||!pvpScene()||!window.PPA_RT_SEND)return false;
      var id=remoteId(r);if(!id)return false;
      var range=Math.max(80,Math.min(700,Number(maxRange)||650));
      return !!window.PPA_RT_SEND({
        type:'world-pvp-skill-hit',target:id,amount:Math.max(1,Math.min(99999,Number(amount)||1)),
        crit:!!crit,range:range,damageType:String(damageType||'physical')
      });
    }catch(_){return false}
  };

  window.PPA_WORLD_PLAYER_CONTROL=function(r,kind,mul,ms,range){
    try{
      if(!r||!r.__ppaRemotePlayer||!window.PPA_WORLD_PVP_ON||!pvpScene()||!window.PPA_RT_SEND)return false;
      var id=remoteId(r),k=String(kind||'');if(!id||(k!=='slow'&&k!=='root'))return false;
      return !!window.PPA_RT_SEND({
        type:'world-pvp-control',target:id,kind:k,
        mul:k==='slow'?Math.max(.25,Math.min(.95,Number(mul)||.55)):0,
        duration:Math.max(100,Math.min(4500,Math.round(Number(ms)||0))),
        range:Math.max(80,Math.min(700,Number(range)||650))
      });
    }catch(_){return false}
  };

  function attackRemote(r){
    if(!r||typeof window.PPA_WORLD_PVP_HIT!=='function')return false;
    if(typeof P==='undefined'||P.dead||P.shootCD>0)return false;
    var now=Date.now(),rate=Math.max(.35,Number(P.atkSpd)||1),minMs=Math.max(180,Math.round(1000/rate*.82));
    if(now-lastPvpAttackAt<minMs)return false;
    var rr={def:Math.max(0,Number(r.def)||0),isAiFighter:false,clanId:r.clanId||'',partyId:r.partyId||''};
    var hit=null;
    try{hit=typeof basicAttackRoll==='function'?basicAttackRoll(rr):{damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false}}catch(_){hit={damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false}}
    // Reassert PK immediately before the hit. WebSocket ordering guarantees
    // the server sees the hostile toggle before this attack even after a room switch.
    if(typeof window.PPA_WORLD_PVP_SET==='function')window.PPA_WORLD_PVP_SET(true);
    lastPkAttemptAt=now;lastPkReject='';
    if(!window.PPA_WORLD_PVP_HIT(remoteId(r),hit.damage,hit.crit))return false;
    lastPvpAttackAt=now;
    P.shootCD=Math.max(1,Math.round(60/((Number(P.atkSpd)||1)*(typeof shopAtkSpeedMul==='function'?shopAtkSpeedMul():1))));
    P.attacking=true;P.anim='attack';P.animFrame=0;P.animTimer=0;
    var dx=Number(r.x)-Number(P.x),dy=Number(r.y)-Number(P.y);if(Math.abs(dx)>.1)P.face=dx<0?-1:1;
    try{
      if(Number(P.smokeUntil)>now){P.smokeUntil=0;P.smokeDodgeBonus=0;if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(0)}
      if(typeof PT!=='undefined'&&Array.isArray(PT)){
        for(var i=0;i<5;i++)PT.push({x:Number(r.x),y:Number(r.y)-8,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:10,ml:10,sz:2+Math.random()*2,col:hit.crit?'#ffd36a':'#ff765f'});
      }
    }catch(_){}
    return true;
  }

  function interceptAttack(e){
    if(!window.PPA_WORLD_PVP_ON||!pvpScene())return;
    var r=selectedRemote();
    // With PK enabled, a player is attacked only after an explicit tap-target.
    // If no player is selected the normal PvE attack continues unchanged.
    if(!r)return;
    if(!remoteInRange(r)){
      try{e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}catch(_){}
      var now=Date.now();
      if(now-lastRangeNoteAt>900){lastRangeNoteAt=now;popup('ПК · цель вне радиуса атаки','#ffb36b')}
      return;
    }
    if(attackRemote(r)){
      try{e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}catch(_){}
    }
  }

  function bindAttack(){
    var b=document.getElementById('bAtk')||document.getElementById('bA');
    if(!b||b.dataset.ppaWorldPvp==='1')return;
    b.dataset.ppaWorldPvp='1';
    b.addEventListener('pointerdown',interceptAttack,true);
    b.addEventListener('touchstart',interceptAttack,{capture:true,passive:false});
    b.addEventListener('click',interceptAttack,true);
  }

  function installGlobalAttackCapture(){
    if(window.__PPA_WORLD_PK_GLOBAL_ATTACK)return;
    window.__PPA_WORLD_PK_GLOBAL_ATTACK=true;
    var handler=function(e){
      try{
        var t=e&&e.target;
        if(!t||!window.PPA_WORLD_PVP_ON||!pvpScene())return;
        var b=t.closest?t.closest('#bAtk,#bA'):null;
        if(!b)return;
        var r=selectedRemote();if(!r)return;
        if(!remoteInRange(r)){
          e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
          var now=Date.now();
          if(now-lastRangeNoteAt>900){lastRangeNoteAt=now;popup('ПК · подойди ближе к цели','#ffb36b')}
          return;
        }
        if(attackRemote(r)){
          e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
        }
      }catch(_){}
    };
    window.addEventListener('pointerdown',handler,{capture:true,passive:false});
    window.addEventListener('touchstart',handler,{capture:true,passive:false});
  }

  function installQueueAttackBridge(){
    try{
      if(window.__PPA_WORLD_PK_QUEUE_BRIDGE)return;
      var base=window.queueAttack;
      if(typeof base!=='function'&&typeof queueAttack==='function')base=queueAttack;
      if(typeof base!=='function')return;
      var wrapped=function(e){
        if(window.PPA_WORLD_PVP_ON&&pvpScene()){
          var r=selectedRemote();
          if(r){
            if(remoteInRange(r)){
              if(attackRemote(r))return;
            }else{
              var now=Date.now();
              if(now-lastRangeNoteAt>900){lastRangeNoteAt=now;popup('ПК · цель вне радиуса атаки','#ffb36b')}
              return;
            }
          }
        }
        return base.apply(this,arguments);
      };
      window.queueAttack=wrapped;
      try{queueAttack=wrapped}catch(_){}
      window.__PPA_WORLD_PK_QUEUE_BRIDGE=true;
    }catch(_){}
  }

  window.PPA_WORLD_COMBAT_DIAG=function(){
    var r=selectedRemote(),d=null;
    try{if(r)d=Math.round(Math.hypot(Number(r.x)-Number(P.x),Number(r.y)-Number(P.y)))}catch(_){}
    return{pk:!!window.PPA_WORLD_PVP_ON,scene:scene(),selected:selectedPlayerId||'',target:!!r,distance:d,attackRange:Math.round(pvpAttackRange()),lastAttemptAt:lastPkAttemptAt,lastAckAt:lastPkAckAt,lastReject:lastPkReject};
  };

  function autoTick(){
    try{
      var now=Date.now();
      if(autoOn&&rememberUnlock()&&worldCombatScene()&&!P.dead&&!transitioning&&now-lastAutoAt>=180){
        lastAutoAt=now;
        // АВТО — только PvE: ПК-цели оно никогда не выбирает автоматически.
        if(typeof queueAttack==='function')queueAttack();
      }
    }catch(_){}
  }

  function boot(){
    ensureHud();bindAttack();installGlobalAttackCapture();installQueueAttackBridge();refresh();
    setInterval(function(){refresh();bindAttack();installGlobalAttackCapture();installQueueAttackBridge()},500);
    setInterval(autoTick,90);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();