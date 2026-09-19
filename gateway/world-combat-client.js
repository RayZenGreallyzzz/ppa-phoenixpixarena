(function(){
  'use strict';

  var autoOn=false,lastAutoAt=0,lastPvpAttackAt=0;
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
      if(Number(INV.gramSpentLifetime)>=5)return true; // includes qualifying Premium-shop purchases
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
    var p=document.createElement('button');p.id='ppaWorldPvpBtn';p.textContent='PVP OFF';
    var a=document.createElement('button');a.id='ppaWorldAutoBtn';a.textContent='AUTO';
    box.appendChild(p);box.appendChild(a);document.body.appendChild(box);

    p.addEventListener('pointerdown',function(e){
      e.preventDefault();e.stopPropagation();
      if(!pvpScene()){popup('PVP здесь недоступен','#ffb36b');return}
      var next=!window.PPA_WORLD_PVP_ON;
      if(typeof window.PPA_WORLD_PVP_SET!=='function'||!window.PPA_WORLD_PVP_SET(next)){
        popup('PVP · сервер переподключается','#ffb36b');return;
      }
      // Server ack is authoritative; optimistic UI makes the tap feel immediate.
      window.PPA_WORLD_PVP_ON=next;refresh();
      popup(next?'PVP включён · можно атаковать только игроков с PVP ON':'PVP выключен',next?'#ff9d80':'#b9c0c7');
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
      pb.textContent=window.PPA_WORLD_PVP_ON?'PVP ON':'PVP OFF';
      pb.classList.toggle('on',!!window.PPA_WORLD_PVP_ON);
    }
    if(ab){
      var unlocked=rememberUnlock();
      ab.textContent=unlocked?(autoOn?'AUTO ON':'AUTO'):'AUTO';
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
      if(window.PPA_WORLD_PVP_ON&&typeof window.PPA_WORLD_PVP_SET==='function')window.PPA_WORLD_PVP_SET(false);
      window.PPA_WORLD_PVP_ON=false;
    }
  }
  window.PPA_WORLD_COMBAT_REFRESH=refresh;

  function remoteId(r){return String((r&&(r.id||r.i||r.__ppaPid))||'')}
  function sameParty(r){
    try{
      var my=String((window.PPA_PARTY_STATE&&PPA_PARTY_STATE.partyId)||'');
      return !!my&&String(r&&r.partyId||'')===my;
    }catch(_){return false}
  }
  function nearestPvpRemote(){
    try{
      if(!window.PPA_WORLD_PVP_ON||!pvpScene()||!window.PPA_ONLINE||!PPA_ONLINE.remotes)return null;
      var best=null,bd=Infinity,range=Math.max(60,Number(typeof playerBasicRange==='function'?playerBasicRange():P.attackRange)||60)+34;
      PPA_ONLINE.remotes.forEach(function(r){
        if(!r||!r.hasPos||!r.worldPvp||Number(r.hp)<=0||sameParty(r))return;
        if(Number(r.hiddenUntil)>Date.now())return;
        if(window.PPA_REMOTE_PLAYER_TARGETABLE&&!window.PPA_REMOTE_PLAYER_TARGETABLE(r))return;
        var d=Math.hypot(Number(r.x)-Number(P.x),Number(r.y)-Number(P.y));
        if(d<=range&&d<bd){bd=d;best=r}
      });
      return best;
    }catch(_){return null}
  }

  function attackRemote(r){
    if(!r||typeof window.PPA_WORLD_PVP_HIT!=='function')return false;
    if(typeof P==='undefined'||P.dead||P.shootCD>0)return false;
    var now=Date.now(),rate=Math.max(.35,Number(P.atkSpd)||1),minMs=Math.max(180,Math.round(1000/rate*.82));
    if(now-lastPvpAttackAt<minMs)return false;
    var rr={def:Math.max(0,Number(r.def)||0),isAiFighter:false,clanId:r.clanId||'',partyId:r.partyId||''};
    var hit=null;
    try{hit=typeof basicAttackRoll==='function'?basicAttackRoll(rr):{damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false}}catch(_){hit={damage:Math.max(1,Math.floor(10+(Number(P.atk)||12))),crit:false}}
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
    var r=nearestPvpRemote();if(!r)return;
    if(attackRemote(r)){
      try{e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}catch(_){}
    }
  }

  function bindAttack(){
    var b=document.getElementById('bAtk');if(!b||b.dataset.ppaWorldPvp==='1')return;
    b.dataset.ppaWorldPvp='1';
    b.addEventListener('pointerdown',interceptAttack,true);
    b.addEventListener('touchstart',interceptAttack,{capture:true,passive:false});
  }

  function autoTick(){
    try{
      var now=Date.now();
      if(autoOn&&rememberUnlock()&&worldCombatScene()&&!P.dead&&!transitioning&&now-lastAutoAt>=180){
        lastAutoAt=now;
        // AUTO is PvE convenience only. It never auto-targets another player.
        if(typeof queueAttack==='function')queueAttack();
      }
    }catch(_){}
  }

  function boot(){
    ensureHud();bindAttack();refresh();
    setInterval(function(){refresh();bindAttack()},500);
    setInterval(autoTick,90);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();