(function(){
  'use strict';

  var match={active:false,mode:'',matchId:'',room:'',side:'',opponentId:''};
  var lastBasicAt=0;
  var lastRoundToken='';

  function popup(text,col){
    try{if(typeof showPickup==='function')showPickup(String(text||''),col||'#ffd88a')}catch(_){}
  }
  function notice(text){
    try{if(typeof sendArenaMenuNotice==='function')sendArenaMenuNotice(String(text||''))}catch(_){}
  }
  function scene(){
    try{return String(P&&P.scene||'safe')}catch(_){return 'safe'}
  }
  function combatReady(){
    try{
      return !!(match.active&&(scene()==='pvp1'||scene()==='pvpteam')&&
        (!window.PPA_PVP_CAN_DAMAGE||window.PPA_PVP_CAN_DAMAGE()));
    }catch(_){return false}
  }
  function remoteId(r){return String((r&&(r.id||r.i||r.__ppaPid))||'')}
  function coords(r){
    return{
      x:Number.isFinite(Number(r&&r.tx))?Number(r.tx):Number(r&&r.x),
      y:Number.isFinite(Number(r&&r.ty))?Number(r.ty):Number(r&&r.y)
    };
  }
  function enemyRemote(r){
    if(!r||!r.hasPos||!remoteId(r))return false;
    if(Number(r.hp)<=0)return false;
    if(Number(r.hiddenUntil)>Date.now())return false;
    if(match.mode!=='1x1'&&r.arenaSide&&match.side&&String(r.arenaSide)===String(match.side))return false;
    var p=coords(r);
    return Number.isFinite(p.x)&&Number.isFinite(p.y);
  }
  function nearestEnemy(maxRange){
    try{
      if(!window.PPA_ONLINE||!PPA_ONLINE.remotes)return null;
      var best=null,bd=Infinity;
      PPA_ONLINE.remotes.forEach(function(r){
        if(!enemyRemote(r))return;
        var p=coords(r),d=Math.hypot(p.x-Number(P.x),p.y-Number(P.y));
        if(d<bd){bd=d;best=r}
      });
      if(!best)return null;
      if(Number.isFinite(Number(maxRange))&&bd>Number(maxRange))return null;
      return best;
    }catch(_){return null}
  }
  function proxyFor(r){
    if(!enemyRemote(r))return null;
    var p=coords(r),id=remoteId(r),q=r.__ppaArenaCombatProxy;
    if(!q){
      q={__ppaArenaPlayer:true,__ppaRemoteSource:r,isAiFighter:false,isBoss:false,hasPos:true};
      r.__ppaArenaCombatProxy=q;
    }
    q.__ppaArenaPlayer=true;q.__ppaRemoteSource=r;
    q.id=id;q.i=id;q.__ppaPid=id;
    q.x=p.x;q.y=p.y;q.tx=p.x;q.ty=p.y;
    q.hp=Math.max(1,Number(r.hp)||1);q.mhp=Math.max(1,Number(r.mhp)||1);
    q.def=Math.max(0,Number(r.def)||0);
    q.hiddenUntil=Math.max(0,Number(r.hiddenUntil)||0);
    q.sz=Math.max(30,Number(r.sz)||Number(r.__ppaHitBody)||30);
    q.hasPos=true;
    return q;
  }
  function baseRange(){
    try{
      var n=(typeof playerBasicRange==='function')?Number(playerBasicRange()):Number(P&&P.attackRange);
      return Math.max(60,Number.isFinite(n)?n:60);
    }catch(_){return 60}
  }
  function selfAttackFx(r){
    try{
      var p=coords(r),sx=Number(P.x)||0,sy=Number(P.y)||0;
      var ang=Math.atan2(p.y-sy,p.x-sx),cls='';
      try{cls=String(typeof classBaseKey==='function'?classBaseKey():'').toLowerCase()}catch(_){}
      var kind=cls==='gnome'?'gnome-cannon':(cls==='archer'?'archer-arrow':'melee');
      if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX({kind:kind,x:sx,y:sy,tx:p.x,ty:p.y,ang:ang,animMs:420});
    }catch(_){}
  }

  function tryBasicAttack(){
    try{
      if(!combatReady())return false;
      var range=baseRange(),r=nearestEnemy(range+46);
      if(!r){
        if(nearestEnemy(650))popup('АРЕНА · соперник вне радиуса','#ffbd76');
        return true;
      }
      if(P.dead||Number(P.shootCD||0)>0)return true;
      var now=Date.now(),rate=Math.max(.35,Number(P.atkSpd)||1),minMs=Math.max(180,Math.round(1000/rate*.82));
      if(now-lastBasicAt<minMs)return true;
      var q=proxyFor(r),roll;
      try{roll=(typeof basicAttackRoll==='function')?basicAttackRoll(q):{damage:Math.max(1,10+(Number(P.atk)||12)),crit:false}}
      catch(_){roll={damage:Math.max(1,10+(Number(P.atk)||12)),crit:false}}
      if(!window.PPA_RT_SEND||!window.PPA_RT_SEND({
        type:'arena-hit',matchId:match.matchId,target:remoteId(r),
        amount:Math.max(1,Math.min(99999,Math.round(Number(roll.damage)||1))),
        crit:!!roll.crit,range:Math.max(60,Math.min(480,range))
      })){
        popup('АРЕНА · ONLINE переподключается','#ff987a');return true;
      }
      lastBasicAt=now;
      P.shootCD=Math.max(1,Math.round(60/rate));
      P.attacking=true;P.anim='attack';P.animFrame=0;P.animTimer=0;
      var p=coords(r),dx=p.x-Number(P.x);
      if(Math.abs(dx)>.1)P.face=dx<0?-1:1;
      selfAttackFx(r);
      if(Number(P.smokeUntil)>now){
        P.smokeUntil=0;P.smokeDodgeBonus=0;
        if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(0);
      }
      return true;
    }catch(_){return false}
  }

  window.PPA_ARENA_TRY_BASIC_ATTACK=tryBasicAttack;
  window.PPA_ARENA_ONLINE_ACTIVE=function(){return !!match.active};

  window.PPA_ARENA_SKILL_TARGET=function(maxRange){
    try{
      if(!combatReady())return null;
      var lim=Math.max(0,Number(maxRange)||0),r=nearestEnemy(lim>0?lim+46:900);
      return proxyFor(r);
    }catch(_){return null}
  };
  window.PPA_ARENA_AROUND_TARGET=function(x,y,rad,out){
    try{
      if(!combatReady())return out;
      var r=nearestEnemy(1200),q=proxyFor(r);if(!q)return out;
      if(Math.hypot(Number(q.x)-Number(x),Number(q.y)-Number(y))<=Math.max(0,Number(rad)||0)+36){
        if(Array.isArray(out)&&out.indexOf(q)<0)out.push(q);
      }
    }catch(_){}
    return out;
  };
  window.PPA_ARENA_SKILL_HIT=function(r,amount,crit,maxRange,damageType){
    try{
      if(!combatReady()||!window.PPA_RT_SEND)return false;
      r=proxyFor((r&&r.__ppaRemoteSource)||r);if(!r)return false;
      return !!window.PPA_RT_SEND({
        type:'arena-skill-hit',matchId:match.matchId,target:remoteId(r),
        amount:Math.max(1,Math.min(99999,Math.round(Number(amount)||1))),
        crit:!!crit,range:Math.max(80,Math.min(700,Number(maxRange)||650)),
        damageType:String(damageType||'physical').slice(0,16)
      });
    }catch(_){return false}
  };
  window.PPA_ARENA_PLAYER_CONTROL=function(r,kind,mul,ms,range){
    try{
      if(!combatReady()||!window.PPA_RT_SEND)return false;
      r=proxyFor((r&&r.__ppaRemoteSource)||r);if(!r)return false;
      var k=String(kind||'');if(k!=='slow'&&k!=='root')return false;
      return !!window.PPA_RT_SEND({
        type:'arena-control',matchId:match.matchId,target:remoteId(r),kind:k,
        mul:k==='slow'?Math.max(.25,Math.min(.95,Number(mul)||.55)):0,
        duration:Math.max(100,Math.min(4500,Math.round(Number(ms)||0))),
        range:Math.max(80,Math.min(700,Number(range)||650))
      });
    }catch(_){return false}
  };

  // Matchmaking is owned by realtime-client.js. This module only handles
  // the confirmed match and combat packets.

  function resetRoundUi(){
    try{
      if(typeof P!=='undefined'&&P){
        P.dead=false;P.hp=Math.max(1,Number(P.mhp)||1);P.mp=Math.max(0,Number(P.mmp)||0);
        P.tid=null;P.attacking=false;P.shootCD=0;
      }
      var ov=document.getElementById('over');if(ov)ov.style.display='none';
    }catch(_){}
  }
  function handleHit(m){
    try{
      var mine=String((window.PPA_ONLINE&&PPA_ONLINE.selfId)||'');
      var target=String(m.target||''),attacker=String(m.attacker||'');
      if(target===mine&&typeof P!=='undefined'&&P){
        P.hp=Math.max(0,Number(m.hp)||0);
        popup((m.type==='arena-skill-hit'?'НАВЫК · −':'АРЕНА · −')+Math.max(1,Math.round(Number(m.damage)||1)),
          m.crit?'#ffd36a':'#ff9b7a');
      }
      if(attacker===mine&&window.PPA_ONLINE&&PPA_ONLINE.remotes){
        var r=PPA_ONLINE.remotes.get(target);
        if(r&&Number.isFinite(Number(m.hp)))r.hp=Math.max(0,Number(m.hp));
        popup((m.crit?'КРИТ · ':'')+(m.type==='arena-skill-hit'?'НАВЫК · −':'УДАР · −')+
          Math.max(1,Math.round(Number(m.damage)||1)),m.crit?'#ffd36a':'#ffb07a');
      }
      if(m.roundOver){
        var token=String(m.roundToken||m.ts||'');
        if(token&&token===lastRoundToken)return;
        lastRoundToken=token;
        resetRoundUi();
        if(window.PPA_PVP_ROUND_RESULT)window.PPA_PVP_ROUND_RESULT(String(m.winner||''));
      }
    }catch(_){}
  }

  window.PPA_ARENA_NET_RECEIVE=function(m){
    if(!m||typeof m!=='object')return;
    if(m.type==='arena-match'){
      match={
        active:true,mode:String(m.mode||'1x1'),matchId:String(m.matchId||''),
        room:String(m.room||''),side:String(m.side||'blue'),opponentId:String(m.opponentId||'')
      };
      window.PPA_AI_TRAINING_ACTIVE=false;
      return;
    }
    if(m.type==='arena-hit'||m.type==='arena-skill-hit'){handleHit(m);return}
    if(m.type==='arena-control'){
      try{
        var mine=String((window.PPA_ONLINE&&PPA_ONLINE.selfId)||'');
        if(String(m.target||'')!==mine||!P)return;
        var now=Date.now(),dur=Math.max(100,Number(m.duration)||0);
        if(String(m.kind)==='root')P.aiRootUntil=Math.max(Number(P.aiRootUntil)||0,now+dur);
        else if(String(m.kind)==='slow'){
          P.aiSlowMul=Math.max(.3,Math.min(.95,Number(m.mul)||.55));
          P.aiSlowUntil=Math.max(Number(P.aiSlowUntil)||0,now+dur);
        }
      }catch(_){}
      return;
    }
    if(m.type==='arena-reject'){popup('АРЕНА · '+String(m.reason||'действие отклонено'),'#ff8b72');return}
    if(m.type==='arena-opponent-left'){
      popup('АРЕНА · соперник вышел','#ffbd76');
      resetRoundUi();
      try{if(window.PPA_ARENA_MATCH_END)window.PPA_ARENA_MATCH_END()}catch(_){}
      try{if(window.PPA_PVP_MATCH_CANCELLED)window.PPA_PVP_MATCH_CANCELLED({refund:false})}catch(_){}
      try{if(typeof changeScene==='function')changeScene('safe')}catch(_){}
      return;
    }
  };

  window.PPA_ARENA_MATCH_END=function(){
    try{
      if(match.active&&window.PPA_RT_SEND)window.PPA_RT_SEND({type:'arena-leave',matchId:match.matchId});
    }catch(_){}
    match={active:false,mode:'',matchId:'',room:'',side:'',opponentId:''};
    lastRoundToken='';
    try{if(window.PPA_RT_ARENA_CLEAR)window.PPA_RT_ARENA_CLEAR()}catch(_){}
  };

  window.PPA_ARENA_DIAG=function(){
    return{match:Object.assign({},match),combatReady:combatReady(),enemy:!!nearestEnemy(1400)};
  };
})();