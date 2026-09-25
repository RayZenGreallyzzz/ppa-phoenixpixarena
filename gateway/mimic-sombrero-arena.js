(function(){
  'use strict';
  if(window.__PPA_MIMIC_SOMBRERO_ARENA_V3)return;
  window.__PPA_MIMIC_SOMBRERO_ARENA_V3=true;

  var MAP_SRC='/assets/mimic-sombrero-arena.webp';
  var MASK_SRC='/assets/mimic-sombrero-walk-mask.png';
  var IDLE_SRC='/assets/mimic-sombrero-idle-4x4.webp';
  var SCENE='mimic_sombrero_arena';
  var WORLD=1000;

  var active=false,root=null,cv=null,ctx=null,raf=0,lastTs=0,level=20;
  var prevScene='',prevX=0,prevY=0,prevTid=null;
  var mapImg=new Image(),maskImg=new Image(),idleImg=new Image();
  var maskCanvas=document.createElement('canvas'),maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true}),maskPixels=null;
  var assetsReady=false,loading=null;
  var boss={x:500,y:500,dir:0,hp:1,mhp:1,def:0,dmg:1,flashUntil:0,attackUntil:0,dead:false};
  var bossProxy={__ppaMimicBoss:true,__ppaArenaPlayer:true,isBoss:true,isAiFighter:false,hasPos:true};
  var moveTarget=null,pendingBasic=false,nextAttackAt=0,nextSkillAt=0,skillCast=null;
  var fightDone=false,playerDead=false,attackCaptureAt=0,lastPlayerX=500,lastPlayerY=840,playerDir=4,fx=[];

  function eventApi(){return window.PPA_MIMIC_SOMBRERO_EVENT||null}
  function diff(){
    var a=eventApi(),d=a&&a.difficulties?a.difficulties[level]:null;
    return d||{level:level,hp:level===60?50000:(level===40?20000:10000),damage:level===60?160:(level===40?70:30),defense:level===60?120:(level===40?52:22)};
  }
  function combat(){
    var a=eventApi(),c=a&&a.combat?a.combat:null;
    return c||{attackEvery:2200,critChance:.10,critMult:1.5,skillMin:9000,skillMax:12000,skillWindup:800,skillMul:1.2,slowMul:.8,slowMs:2000};
  }
  function count(){try{var a=eventApi();return a&&typeof a.ticketCount==='function'?a.ticketCount():0}catch(_){return 0}}
  function toast(msg,color){
    try{if(typeof showPickup==='function'){showPickup(String(msg||''),color||'#ffd36a');return}}catch(_){}
    try{console.log('[PPA MIMIC]',msg)}catch(_){}
  }
  function loadImage(img,src){
    return new Promise(function(resolve,reject){
      if(img.complete&&img.naturalWidth>0)return resolve(img);
      img.onload=function(){resolve(img)};img.onerror=function(){reject(new Error('asset '+src))};img.src=src;
    });
  }
  function preload(){
    if(assetsReady)return Promise.resolve(true);
    if(loading)return loading;
    loading=Promise.all([loadImage(mapImg,MAP_SRC),loadImage(maskImg,MASK_SRC),loadImage(idleImg,IDLE_SRC)]).then(function(){
      maskCanvas.width=maskImg.naturalWidth||1254;maskCanvas.height=maskImg.naturalHeight||1254;
      maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
      maskCtx.drawImage(maskImg,0,0,maskCanvas.width,maskCanvas.height);
      try{maskPixels=maskCtx.getImageData(0,0,maskCanvas.width,maskCanvas.height).data}catch(_){maskPixels=null}
      assetsReady=true;return true;
    }).catch(function(e){loading=null;throw e});
    return loading;
  }
  function canWalkWorld(wx,wy){
    if(!assetsReady)return false;
    var nx=Math.max(0,Math.min(1,Number(wx)/WORLD)),ny=Math.max(0,Math.min(1,Number(wy)/WORLD));
    var x=Math.max(0,Math.min(maskCanvas.width-1,Math.floor(nx*maskCanvas.width)));
    var y=Math.max(0,Math.min(maskCanvas.height-1,Math.floor(ny*maskCanvas.height)));
    try{
      if(maskPixels)return maskPixels[(y*maskCanvas.width+x)*4]>127;
      return maskCtx.getImageData(x,y,1,1).data[0]>127;
    }catch(_){return false}
  }
  function pointToWorld(ev){
    var r=cv.getBoundingClientRect(),t=ev.touches&&ev.touches[0]?ev.touches[0]:ev;
    var nx=(Number(t.clientX)-r.left)/Math.max(1,r.width),ny=(Number(t.clientY)-r.top)/Math.max(1,r.height);
    var aspectW=cv.width,aspectH=cv.height,size=Math.min(aspectW,aspectH);
    var ox=(aspectW-size)/2,oy=(aspectH-size)/2;
    var px=nx*aspectW,py=ny*aspectH;
    return{x:(px-ox)/Math.max(1,size)*WORLD,y:(py-oy)/Math.max(1,size)*WORLD};
  }
  function ensureRoot(){
    if(root&&root.isConnected)return root;
    root=document.createElement('div');root.id='ppaMimicArena';
    root.style.cssText='position:fixed;inset:0;z-index:5;background:#090604;display:none;overflow:hidden;touch-action:none;pointer-events:none';
    cv=document.createElement('canvas');cv.id='ppaMimicArenaCanvas';
    cv.style.cssText='width:100%;height:100%;display:block;image-rendering:auto;touch-action:none;pointer-events:none';
    ctx=cv.getContext('2d',{alpha:false,desynchronized:true})||cv.getContext('2d');

    var exit=document.createElement('button');exit.type='button';exit.textContent='↩ ВЫЙТИ';
    exit.style.cssText='position:absolute;left:10px;top:10px;z-index:8;height:32px;padding:0 12px;border:1px solid #c58435;border-radius:8px;background:rgba(55,25,12,.94);color:#ffd787;font:800 10px monospace;pointer-events:auto';
    exit.onclick=function(ev){try{ev.stopPropagation()}catch(_){}leave(false)};

    var tag=document.createElement('div');tag.id='ppaMimicArenaTag';
    tag.style.cssText='position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:7;padding:5px 9px;border:1px solid rgba(197,132,53,.65);border-radius:7px;background:rgba(20,12,8,.80);color:#ffe0a0;font:800 10px monospace;pointer-events:none;white-space:nowrap';

    root.appendChild(cv);root.appendChild(exit);root.appendChild(tag);document.body.appendChild(root);

    // The arena is only the visual layer. Native HUD input stays above it:
    // joystick/touch on mobile and the existing PC input bridge feed jX/jY.
    return root;
  }
  function resize(){
    if(!cv)return;
    var dpr=Math.max(1,Math.min(2,Number(devicePixelRatio)||1));
    var w=Math.max(320,Math.floor(innerWidth*dpr)),h=Math.max(320,Math.floor(innerHeight*dpr));
    if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
  }
  function resetBoss(){
    var d=diff();
    boss.x=500;boss.y=500;boss.dir=0;
    boss.mhp=Math.max(1,Number(d.hp)||1);boss.hp=boss.mhp;
    boss.def=Math.max(0,Number(d.defense)||0);boss.dmg=Math.max(1,Number(d.damage)||1);
    boss.flashUntil=0;boss.attackUntil=0;boss.dead=false;
    bossProxy.hp=boss.hp;bossProxy.mhp=boss.mhp;bossProxy.def=boss.def;
  }
  function syncProxy(){
    bossProxy.id='mimic_sombrero_'+level;
    bossProxy.name='Мимик-Самбреро';
    bossProxy.n='Мимик-Самбреро';
    bossProxy.x=boss.x;bossProxy.y=boss.y;bossProxy.tx=boss.x;bossProxy.ty=boss.y;
    bossProxy.hp=boss.hp;bossProxy.mhp=boss.mhp;bossProxy.def=boss.def;
    bossProxy.sz=118;bossProxy.lvl=level;bossProxy.level=level;bossProxy.hasPos=true;
    bossProxy.isBoss=true;bossProxy.isAiFighter=false;bossProxy.__ppaArenaPlayer=true;bossProxy.__ppaMimicBoss=true;
    return bossProxy;
  }
  function playerDistanceToBoss(){try{return Math.hypot(Number(P.x)-boss.x,Number(P.y)-boss.y)}catch(_){return Infinity}}
  function basicRange(){
    try{
      var n=typeof playerBasicRange==='function'?Number(playerBasicRange()):Number(P&&P.attackRange);
      return Math.max(55,Number.isFinite(n)?n:65);
    }catch(_){return 65}
  }
  function inBasicRange(){return playerDistanceToBoss()<=basicRange()+48}
  function clearSmokeOnAttack(){
    try{
      if(Number(P.smokeUntil)>Date.now()){
        P.smokeUntil=0;P.smokeDodgeBonus=0;
        if(window.PPA_PLAYER_STEALTH)window.PPA_PLAYER_STEALTH(0);
      }
    }catch(_){}
  }
  function damageBoss(amount,crit,kind){
    if(!active||fightDone||boss.dead)return false;
    var dmg=Math.max(1,Math.round(Number(amount)||1));
    boss.hp=Math.max(0,boss.hp-dmg);boss.flashUntil=Date.now()+120;
    syncProxy();
    toast((crit?'КРИТ · ':'')+(kind==='skill'?'НАВЫК · −':'УДАР · −')+dmg,crit?'#ffd36a':'#ffb57a');
    if(boss.hp<=0)finishVictory();
    return true;
  }
  function tryBasicAttack(fromPending){
    try{
      if(!active||fightDone||playerDead||boss.dead||!P)return false;
      if(!inBasicRange()){
        pendingBasic=true;
        var dx=boss.x-Number(P.x),dy=boss.y-Number(P.y),d=Math.max(1,Math.hypot(dx,dy));
        var stop=Math.max(80,basicRange()+30);
        moveTarget={x:boss.x-dx/d*stop,y:boss.y-dy/d*stop};
        if(!fromPending)toast('МИМИК · подхожу к цели','#e3c58c');
        return true;
      }
      var now=Date.now(),rate=Math.max(.35,Number(P.atkSpd)||1),minMs=Math.max(180,Math.round(1000/rate*.82));
      if(now-attackCaptureAt<minMs&&fromPending!==true)return true;
      attackCaptureAt=now;pendingBasic=false;moveTarget=null;
      var q=syncProxy(),roll=null;
      try{if(typeof basicAttackRoll==='function')roll=basicAttackRoll(q)}catch(_){}
      if(!roll){
        var raw=Math.max(1,Math.floor(Number(P.atk)||12)-boss.def);
        var cr=Math.max(0,Math.min(100,Number(P.crit)||0)),isCrit=Math.random()*100<cr;
        if(isCrit)raw=Math.max(1,Math.round(raw*Math.max(1,Number(P.critDmg)||180)/100));
        roll={damage:raw,crit:isCrit};
      }
      try{
        P.attacking=true;P.anim='attack';P.animFrame=0;P.animTimer=0;P.shootT=1;P.recoil=1;
        var dx2=boss.x-Number(P.x);if(Math.abs(dx2)>.1)P.face=dx2<0?-1:1;
      }catch(_){}
      clearSmokeOnAttack();
      return damageBoss(roll.damage,!!roll.crit,'basic');
    }catch(e){console.warn('Mimic basic attack',e);return false}
  }
  window.PPA_MIMIC_TRY_BASIC_ATTACK=tryBasicAttack;

  function applyPlayerDamage(raw,crit,kind){
    if(!active||fightDone||playerDead||!P)return false;
    var now=Date.now();
    if(Number(P.smokeUntil)>now){
      toast('МИМИК · цель скрыта','#9fd8ff');return false;
    }
    var dealt=Math.max(1,Math.round(Number(raw)||1));
    try{if(typeof playerDmg==='function')dealt=Math.max(1,Math.round(Number(playerDmg(dealt,'physical'))||1))}catch(_){}
    P.hp=Math.max(0,Number(P.hp||0)-dealt);
    toast((crit?'КРИТ МИМИКА · −':(kind==='skill'?'ПЫЛЬНЫЙ ПЛЕВОК · −':'МИМИК · −'))+dealt,crit?'#ffcf63':'#ff8b72');
    if(P.hp<=0)killPlayer();
    return true;
  }
  function killPlayer(){
    if(playerDead||fightDone)return;
    playerDead=true;moveTarget=null;pendingBasic=false;skillCast=null;
    try{P.hp=0;P.dead=true;P.attacking=false}catch(_){}
    toast('МИМИК-САМБРЕРО · ты повержен','#ff786f');
    setTimeout(function(){
      if(!active)return;
      leave(true);
      try{if(typeof respawnAfterDeath==='function')setTimeout(function(){try{respawnAfterDeath()}catch(_){}},60)}catch(_){}
    },500);
  }
  function randomSkillDelay(){
    var c=combat(),a=Math.max(1000,Number(c.skillMin)||9000),b=Math.max(a,Number(c.skillMax)||12000);
    return a+Math.random()*(b-a);
  }
  function startSkill(now){
    var c=combat(),px=Number(P.x),py=Number(P.y);
    skillCast={x:px,y:py,start:now,end:now+Math.max(300,Number(c.skillWindup)||800)};
    boss.attackUntil=skillCast.end+180;
    nextSkillAt=now+randomSkillDelay();
    toast('МИМИК · ПЫЛЬНЫЙ ПЛЕВОК!','#ffd36a');
  }
  function resolveSkill(){
    if(!skillCast||!active||fightDone||playerDead)return;
    var s=skillCast;skillCast=null;
    var dist=Math.hypot(Number(P.x)-s.x,Number(P.y)-s.y),hit=dist<=72;
    fx.push({type:'dust',x:s.x,y:s.y,born:Date.now(),dur:650});
    if(!hit){toast('ПЫЛЬНЫЙ ПЛЕВОК · ПРОМАХ','#a9e6ff');return}
    var c=combat(),raw=Math.max(1,Math.round(boss.dmg*(Number(c.skillMul)||1.2)));
    if(applyPlayerDamage(raw,false,'skill')){
      P.aiSlowMul=Math.max(.25,Math.min(1,Number(c.slowMul)||.8));
      P.aiSlowUntil=Math.max(Number(P.aiSlowUntil)||0,Date.now()+Math.max(100,Number(c.slowMs)||2000));
      P.__ppaMimicSlowUntil=P.aiSlowUntil;
      toast('ПЕСОК · скорость −20% · 2с','#e7cf8f');
    }
  }
  function bossAI(now,dt){
    if(!active||fightDone||playerDead||boss.dead||!P)return;
    if(skillCast){
      if(now>=skillCast.end)resolveSkill();
      return;
    }
    var px=Number(P.x),py=Number(P.y),dx=px-boss.x,dy=py-boss.y,d=Math.max(.001,Math.hypot(dx,dy));
    boss.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?1:2):(dy<0?3:0);
    if(Number(P.smokeUntil)>now)return;
    if(now>=nextSkillAt&&d<=430){startSkill(now);return}
    if(d>86){
      var speed=54,step=Math.min(Math.max(0,d-82),speed*Math.max(0,dt)/1000);
      var nx=boss.x+dx/d*step,ny=boss.y+dy/d*step;
      if(canWalkWorld(nx,ny)){boss.x=nx;boss.y=ny}
      return;
    }
    if(now>=nextAttackAt){
      var c=combat(),crit=Math.random()<Math.max(0,Math.min(1,Number(c.critChance)||.1));
      var raw=boss.dmg*(crit?(Number(c.critMult)||1.5):1);
      nextAttackAt=now+Math.max(600,Number(c.attackEvery)||2200);
      boss.attackUntil=now+430;
      applyPlayerDamage(raw,crit,'basic');
    }
  }
  function updatePlayer(now,dt){
    if(!P||playerDead||fightDone)return;
    var px=Number(P.x),py=Number(P.y);
    if(!Number.isFinite(px)||!Number.isFinite(py)){P.x=500;P.y=840;px=500;py=840}

    // Use the game's real input axes. This keeps the normal joystick working on
    // phone/tablet and also accepts the already-existing PC click/WASD bridge.
    var ix=0,iy=0;
    try{ix=(typeof jX!=='undefined')?Number(jX)||0:0;iy=(typeof jY!=='undefined')?Number(jY)||0:0}catch(_){}
    var mag=Math.hypot(ix,iy);
    var manual=mag>.04;
    if(manual){
      // Manual steering always cancels the Mimic auto-approach order.
      moveTarget=null;pendingBasic=false;
      ix/=Math.max(1,mag);iy/=Math.max(1,mag);
    }else if(moveTarget){
      var adx=moveTarget.x-px,ady=moveTarget.y-py,ad=Math.hypot(adx,ady);
      if(ad<4){moveTarget=null}
      else{ix=adx/Math.max(.001,ad);iy=ady/Math.max(.001,ad)}
    }

    if(Math.abs(ix)>.001||Math.abs(iy)>.001){
      var slow=(now<Number(P.aiSlowUntil||0))?Math.max(.25,Math.min(1,Number(P.aiSlowMul)||.8)):1;
      var speed=(80+Math.max(0,Number(P.spd)||3)*18)*slow;
      var step=speed*Math.max(0,dt)/1000,nx=px+ix*step,ny=py+iy*step;
      if(canWalkWorld(nx,ny)){P.x=nx;P.y=ny}
      else if(!manual){moveTarget=null;pendingBasic=false}
    }

    if(pendingBasic&&inBasicRange()){moveTarget=null;tryBasicAttack(true)}
    var mx=Number(P.x)-lastPlayerX,my=Number(P.y)-lastPlayerY;
    if(Math.hypot(mx,my)>.15){
      if(Math.abs(mx)>Math.abs(my))playerDir=mx>0?2:6;
      else playerDir=my>0?4:0;
    }else{
      var f=Number(P.face);if(f<0)playerDir=6;else if(f>0&&(playerDir===6||playerDir===2))playerDir=2;
    }
    lastPlayerX=Number(P.x);lastPlayerY=Number(P.y);
  }
  function playerClassKey(){
    try{
      var k=typeof classBaseKey==='function'?String(classBaseKey()||'').toLowerCase():'';
      if(k)return k;
    }catch(_){}
    try{
      var s=String(P&&(P.classKey||P.cls||P.className)||'').toLowerCase();
      if(s.indexOf('гном')>=0||s.indexOf('cannon')>=0)return'gnome';
      if(s.indexOf('пал')>=0)return'paladin';
      if(s.indexOf('асс')>=0)return'assassin';
      if(s.indexOf('бер')>=0||s.indexOf('barb')>=0)return'barbarian';
      if(s.indexOf('луч')>=0||s.indexOf('arch')>=0)return'archer';
      if(s.indexOf('маг')>=0||s.indexOf('mage')>=0)return'mage';
      if(s.indexOf('жр')>=0||s.indexOf('priest')>=0)return'priest';
      return'tank';
    }catch(_){return'tank'}
  }
  function drawPlayer(ts,ox,oy,size){
    var px=ox+Number(P.x)/WORLD*size,py=oy+Number(P.y)/WORLD*size;
    var moving=Math.hypot(Number(P.x)-lastPlayerX,Number(P.y)-lastPlayerY)>.2||!!moveTarget;
    var anim=(P&&P.attacking)?'attack':(moving?'run':'idle'),drawn=false,key=playerClassKey();
    try{
      if(typeof v174AiSpriteCfg==='function'){
        var cfg=v174AiSpriteCfg({aiClass:key,aiAnim:anim}),a=cfg&&cfg.anim;
        if(a&&a.img&&a.img.complete&&a.img.naturalWidth){
          var dir=playerDir,row=cfg.rowMap&&cfg.rowMap[dir]!=null?cfg.rowMap[dir]:0;
          var frame=Math.floor(ts/(1000/Math.max(1,Number(a.fps)||8)))%Math.max(1,Number(a.frames)||1);
          var dh=Math.max(58,Math.min(104,size*.092)),dw=dh;if(key==='gnome'){dh*=.78;dw*=.78}
          var flip=(key==='gnome'&&typeof GNOME_FLIP_BY_DIR!=='undefined')?!!GNOME_FLIP_BY_DIR[dir]:false;
          ctx.save();ctx.imageSmoothingEnabled=false;
          ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(px,py+4,dw*.26,dh*.08,0,0,Math.PI*2);ctx.fill();
          if(flip){
            ctx.translate(Math.round(px),0);ctx.scale(-1,1);
            ctx.drawImage(a.img,frame*a.fw,row*a.fh,a.fw,a.fh,Math.round(-dw/2),Math.round(py-dh*.82),Math.round(dw),Math.round(dh));
          }else{
            ctx.drawImage(a.img,frame*a.fw,row*a.fh,a.fw,a.fh,Math.round(px-dw/2),Math.round(py-dh*.82),Math.round(dw),Math.round(dh));
          }
          ctx.restore();drawn=true;
        }
      }
    }catch(_){}
    if(!drawn){
      ctx.beginPath();ctx.arc(px,py,Math.max(7,size*.009),0,Math.PI*2);
      ctx.fillStyle='rgba(70,220,150,.95)';ctx.fill();ctx.lineWidth=Math.max(2,size*.002);ctx.strokeStyle='#fff2b0';ctx.stroke();
    }
    try{
      var nm=String(P&&P.playerName||'Игрок');ctx.font='700 '+Math.max(9,Math.round(size*.012))+'px monospace';
      ctx.textAlign='center';ctx.fillStyle='#fff3c7';ctx.fillText(nm,px,py-Math.max(48,size*.055));
    }catch(_){}
  }
  function drawBoss(ts,ox,oy,size){
    var bx=ox+boss.x/WORLD*size,by=oy+boss.y/WORLD*size,bsize=Math.max(78,Math.min(154,size*.155));
    ctx.fillStyle='rgba(0,0,0,.40)';ctx.beginPath();ctx.ellipse(bx,by+bsize*.27,bsize*.31,bsize*.10,0,0,Math.PI*2);ctx.fill();
    var frame=Math.floor(ts/(Date.now()<boss.attackUntil?105:170))%4,sw=idleImg.naturalWidth/4,sh=idleImg.naturalHeight/4;
    var pulse=Date.now()<boss.attackUntil?1.06:1,ds=bsize*pulse;
    ctx.save();ctx.imageSmoothingEnabled=false;
    if(Date.now()<boss.flashUntil)ctx.globalAlpha=.62;
    ctx.drawImage(idleImg,frame*sw,boss.dir*sh,sw,sh,bx-ds/2,by-ds*.68,ds,ds);
    ctx.restore();
  }
  function drawSkill(ox,oy,size,now){
    if(!skillCast)return;
    var c=combat(),p=Math.max(0,Math.min(1,(now-skillCast.start)/Math.max(1,skillCast.end-skillCast.start)));
    var bx=ox+boss.x/WORLD*size,by=oy+boss.y/WORLD*size,tx=ox+skillCast.x/WORLD*size,ty=oy+skillCast.y/WORLD*size,rr=72/WORLD*size;
    ctx.save();ctx.setLineDash([8,7]);ctx.lineWidth=Math.max(2,size*.003);
    ctx.strokeStyle='rgba(255,200,92,'+(0.45+0.45*p)+')';ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(tx,ty);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='rgba(198,132,55,'+(0.08+0.18*p)+')';ctx.strokeStyle='rgba(255,219,133,.9)';
    ctx.beginPath();ctx.arc(tx,ty,rr*(.78+.22*p),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
  }
  function drawFx(ox,oy,size,now){
    for(var i=fx.length-1;i>=0;i--){
      var f=fx[i],t=(now-f.born)/Math.max(1,f.dur);
      if(t>=1){fx.splice(i,1);continue}
      var x=ox+f.x/WORLD*size,y=oy+f.y/WORLD*size,r=(24+75*t)/WORLD*size;
      ctx.save();ctx.globalAlpha=Math.max(0,1-t);ctx.strokeStyle='#d6a35d';ctx.lineWidth=Math.max(2,size*.003);
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
  }
  function drawHud(size,W){
    var d=diff(),bw=Math.min(W*.58,size*.58),x=(W-bw)/2,y=38,h=10,p=boss.mhp>0?boss.hp/boss.mhp:0;
    ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(x-2,y-2,bw+4,h+4);
    ctx.fillStyle='#6d1f19';ctx.fillRect(x,y,bw,h);ctx.fillStyle='#e45d3f';ctx.fillRect(x,y,bw*Math.max(0,Math.min(1,p)),h);
    ctx.font='800 '+Math.max(10,Math.round(size*.012))+'px monospace';ctx.textAlign='center';ctx.fillStyle='#ffe5a2';
    ctx.fillText('МИМИК-САМБРЕРО '+level+' · '+Math.ceil(boss.hp).toLocaleString('ru-RU')+' / '+boss.mhp.toLocaleString('ru-RU')+' HP · DEF '+d.defense,W/2,y-6);
  }
  function drawFrame(ts){
    if(!active)return;
    resize();
    var dt=lastTs?Math.max(0,Math.min(50,ts-lastTs)):16;lastTs=ts;
    var now=Date.now();
    updatePlayer(now,dt);bossAI(now,dt);syncProxy();

    var W=cv.width,H=cv.height,size=Math.min(W,H),ox=(W-size)/2,oy=(H-size)/2;
    ctx.fillStyle='#090604';ctx.fillRect(0,0,W,H);ctx.drawImage(mapImg,ox,oy,size,size);
    drawSkill(ox,oy,size,now);drawBoss(ts,ox,oy,size);drawPlayer(ts,ox,oy,size);drawFx(ox,oy,size,now);drawHud(size,W);

    var tag=document.getElementById('ppaMimicArenaTag');
    if(tag){
      var a=eventApi(),tm=!!(a&&typeof a.testMode==='function'&&a.testMode());
      tag.textContent='🎭 '+level+' ур. · ATK '+boss.dmg+' · DEF '+boss.def+(tm?' · ТЕСТ БЕЗ БИЛЕТА':'');
    }
    raf=requestAnimationFrame(drawFrame);
  }
  function materializeExtraRewards(res){
    if(!res||!P)return;
    var src={x:Number(P.x)||500,y:Number(P.y)||840,lvl:level,isBoss:true};
    try{
      if(Array.isArray(res.premiumStones)&&typeof pushStoneDrop==='function'){
        res.premiumStones.forEach(function(q){pushStoneDrop(src,'premium',Math.max(1,Math.floor(Number(q)||1)))});
      }
    }catch(_){}
    try{
      if(res.premiumPotion&&typeof v232PushConsumable==='function'&&typeof PPA_V172_ART!=='undefined'){
        if(Math.random()<.5)v232PushConsumable(src,'premiumHpRegen','Премиум банка HP',PPA_V172_ART.premiumHp,'❤','#ff6a72',1);
        else v232PushConsumable(src,'premiumMpRegen','Премиум банка MP',PPA_V172_ART.premiumMp,'◆','#6ea7ff',1);
      }
    }catch(_){}
  }
  function finishVictory(){
    if(fightDone)return;
    fightDone=true;boss.dead=true;moveTarget=null;pendingBasic=false;skillCast=null;
    var res=null,a=eventApi();
    try{if(a&&typeof a.rollBossRewards==='function')res=a.rollBossRewards(level)}catch(e){console.warn('Mimic reward roll',e)}
    materializeExtraRewards(res);
    toast('🎭 МИМИК-САМБРЕРО ПОВЕРЖЕН · награда рассчитана','#9dff91');
    try{if(typeof saveGame==='function')saveGame()}catch(_){}
    setTimeout(function(){if(active)leave(false)},2200);
  }
  function enter(lv){
    lv=[20,40,60].includes(Number(lv))?Number(lv):20;
    var a=eventApi();if(!a||typeof a.consumeTicket!=='function'){toast('Событие Мимика ещё не готово','#ff9c72');return}
    var tm=!!(a&&typeof a.testMode==='function'&&a.testMode());
    if(!tm&&count()<1){toast('Нужен Билет Мимика-Самбреро','#ff9c72');return}
    preload().then(function(){
      if(!tm&&!a.consumeTicket(1)){toast('Нужен Билет Мимика-Самбреро','#ff9c72');return}
      ensureRoot();level=lv;resetBoss();
      try{
        prevScene=String(P&&P.scene||'safe');prevX=Number(P&&P.x)||0;prevY=Number(P&&P.y)||0;prevTid=P?P.tid:null;
        P.scene=SCENE;P.x=500;P.y=840;P.tid=null;P.dead=false;
      }catch(_){}
      lastPlayerX=500;lastPlayerY=840;playerDir=0;moveTarget=null;pendingBasic=false;
      fightDone=false;playerDead=false;skillCast=null;fx.length=0;attackCaptureAt=0;
      var now=Date.now(),c=combat();nextAttackAt=now+Math.max(700,Number(c.attackEvery)||2200);nextSkillAt=now+randomSkillDelay();
      root.style.display='block';active=true;lastTs=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(drawFrame);
      toast('МИМИК '+level+' · HP '+boss.mhp.toLocaleString('ru-RU')+' · DEF '+boss.def,'#ffd36a');
      try{if(typeof saveGame==='function')saveGame()}catch(_){}
    }).catch(function(e){
      console.warn('Mimic arena assets',e);toast('Арена Мимика: не загружены карта/маска/спрайт','#ff9c72');
    });
  }
  function chooser(){
    var old=document.getElementById('ppaMimicChoose');if(old)old.remove();
    var box=document.createElement('div');box.id='ppaMimicChoose';
    box.style.cssText='position:fixed;inset:0;z-index:10080;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;color:#f9e7bd;font:800 11px monospace';
    box.innerHTML='<div style="width:min(430px,90vw);padding:14px;border:1px solid #b77a31;border-radius:13px;background:linear-gradient(#2c170c,#120b07);box-shadow:0 16px 40px #000;text-align:center"><div style="color:#ffd36a;font-size:16px;margin-bottom:8px">🎭 МИМИК-САМБРЕРО</div><div style="color:#cdbb9b;margin-bottom:10px">Билеты: <b style="color:#fff2b0">'+count()+'</b><br>1 билет = 1 вход</div><button data-lv="20">20 ур. · 10 000 HP</button><button data-lv="40">40 ур. · 20 000 HP</button><button data-lv="60">60 ур. · 50 000 HP</button><button data-close="1">ЗАКРЫТЬ</button></div>';
    Array.from(box.querySelectorAll('button')).forEach(function(b){b.style.cssText='margin:5px;padding:8px 12px;border:1px solid #9a6526;border-radius:8px;background:#3a2110;color:#ffd36a;font:900 11px monospace'});
    box.onclick=function(ev){var b=ev.target&&ev.target.closest?ev.target.closest('button'):null;if(!b)return;if(b.dataset.close){box.remove();return}var lv=Number(b.dataset.lv)||0;if(lv){box.remove();enter(lv)}};
    document.body.appendChild(box);
  }
  function leave(dead){
    var q=document.getElementById('ppaMimicChoose');if(q)q.remove();
    if(!active)return;
    active=false;cancelAnimationFrame(raf);raf=0;if(root)root.style.display='none';
    moveTarget=null;pendingBasic=false;skillCast=null;fx.length=0;
    try{
      if(P){
        P.tid=prevTid;
        if(dead){
          P.scene='safe';
        }else{
          P.scene=prevScene||'safe';P.x=prevX;P.y=prevY;
        }
      }
    }catch(_){}
    if(dead){try{if(typeof changeScene==='function')changeScene('safe')}catch(_){}}
  }

  function wrapCombatHooks(){
    if(window.__PPA_MIMIC_COMBAT_HOOKS_V3)return;
    window.__PPA_MIMIC_COMBAT_HOOKS_V3=true;
    var baseTarget=window.PPA_ARENA_SKILL_TARGET;
    var baseAround=window.PPA_ARENA_AROUND_TARGET;
    var baseHit=window.PPA_ARENA_SKILL_HIT;

    window.PPA_ARENA_SKILL_TARGET=function(maxRange){
      if(active&&!fightDone&&!boss.dead){
        var lim=Math.max(0,Number(maxRange)||0),d=playerDistanceToBoss();
        if(!lim||d<=lim+48)return syncProxy();
        return null;
      }
      return typeof baseTarget==='function'?baseTarget.apply(this,arguments):null;
    };
    window.PPA_ARENA_AROUND_TARGET=function(x,y,rad,out){
      if(active&&!fightDone&&!boss.dead&&Array.isArray(out)){
        out.length=0;
        var rr=Math.max(0,Number(rad)||0)+48;
        if(Math.hypot(boss.x-Number(x),boss.y-Number(y))<=rr)out.push(syncProxy());
        return out;
      }
      return typeof baseAround==='function'?baseAround.apply(this,arguments):out;
    };
    window.PPA_ARENA_SKILL_HIT=function(target,amount,crit,maxRange,damageType){
      if(active&&target&&target.__ppaMimicBoss){
        var lim=Math.max(0,Number(maxRange)||0);
        if(lim&&playerDistanceToBoss()>lim+52)return false;
        clearSmokeOnAttack();
        return damageBoss(amount,!!crit,'skill');
      }
      return typeof baseHit==='function'?baseHit.apply(this,arguments):false;
    };
  }
  function bindAttackButton(){
    if(window.__PPA_MIMIC_ATTACK_CAPTURE_V3)return;
    window.__PPA_MIMIC_ATTACK_CAPTURE_V3=true;
    var blockUntil=0;
    function hit(ev){
      try{var t=ev&&ev.target;return !!(t&&((t.id==='bAtk')||(t.closest&&t.closest('#bAtk'))))}catch(_){return false}
    }
    function stop(ev){try{ev.preventDefault()}catch(_){}try{ev.stopPropagation()}catch(_){}try{ev.stopImmediatePropagation()}catch(_){}}
    document.addEventListener('pointerdown',function(ev){
      if(!active||!hit(ev))return;stop(ev);blockUntil=Date.now()+500;tryBasicAttack(false);
    },true);
    ['touchstart','touchend','click'].forEach(function(type){
      document.addEventListener(type,function(ev){
        if(!active||!hit(ev))return;stop(ev);
        if(type==='click'&&Date.now()>blockUntil){blockUntil=Date.now()+500;tryBasicAttack(false)}
      },true);
    });
  }

  wrapCombatHooks();bindAttackButton();
  window.PPA_MIMIC_SOMBRERO_ARENA={
    open:chooser,enter:enter,leave:leave,preload:preload,isActive:function(){return active},scene:SCENE,
    boss:function(){return {level:level,hp:boss.hp,mhp:boss.mhp,damage:boss.dmg,defense:boss.def,skill:!!skillCast}},
    tryBasicAttack:tryBasicAttack
  };
})();