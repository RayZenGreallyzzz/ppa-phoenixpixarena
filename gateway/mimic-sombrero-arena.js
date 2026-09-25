(function(){
  'use strict';
  if(window.__PPA_MIMIC_SOMBRERO_ARENA_V1)return;
  window.__PPA_MIMIC_SOMBRERO_ARENA_V1=true;

  var MAP_SRC='/assets/mimic-sombrero-arena.webp';
  var MASK_SRC='/assets/mimic-sombrero-walk-mask.png';
  var IDLE_SRC='/assets/mimic-sombrero-idle-4x4.webp';
  var SCENE='mimic_sombrero_arena';
  var active=false,root=null,cv=null,ctx=null,raf=0,lastTs=0,prevScene='',level=20;
  var mapImg=new Image(),maskImg=new Image(),idleImg=new Image(),maskCanvas=document.createElement('canvas'),maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});
  var assetsReady=false,loading=null;
  var player={x:.50,y:.84,r:10},boss={x:.50,y:.50,dir:0};

  function eventApi(){return window.PPA_MIMIC_SOMBRERO_EVENT||null}
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
      maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);maskCtx.drawImage(maskImg,0,0,maskCanvas.width,maskCanvas.height);
      assetsReady=true;return true;
    }).catch(function(e){loading=null;throw e});
    return loading;
  }
  function canWalk(nx,ny){
    if(!assetsReady)return false;
    nx=Math.max(0,Math.min(1,nx));ny=Math.max(0,Math.min(1,ny));
    var x=Math.max(0,Math.min(maskCanvas.width-1,Math.floor(nx*maskCanvas.width)));
    var y=Math.max(0,Math.min(maskCanvas.height-1,Math.floor(ny*maskCanvas.height)));
    try{return maskCtx.getImageData(x,y,1,1).data[0]>127}catch(_){return false}
  }
  function ensureRoot(){
    if(root&&root.isConnected)return root;
    root=document.createElement('div');root.id='ppaMimicArena';
    root.style.cssText='position:fixed;inset:0;z-index:10070;background:#090604;display:none;overflow:hidden;touch-action:none';
    cv=document.createElement('canvas');cv.id='ppaMimicArenaCanvas';cv.style.cssText='width:100%;height:100%;display:block;image-rendering:auto';
    ctx=cv.getContext('2d',{alpha:false});
    var exit=document.createElement('button');exit.type='button';exit.textContent='↩ ВЫЙТИ';
    exit.style.cssText='position:absolute;left:10px;top:10px;z-index:3;height:32px;padding:0 12px;border:1px solid #c58435;border-radius:8px;background:rgba(55,25,12,.94);color:#ffd787;font:800 10px monospace';
    exit.onclick=function(){leave(false)};
    var tag=document.createElement('div');tag.id='ppaMimicArenaTag';
    tag.style.cssText='position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:2;padding:5px 9px;border:1px solid rgba(197,132,53,.65);border-radius:7px;background:rgba(20,12,8,.76);color:#ffe0a0;font:800 10px monospace;pointer-events:none;white-space:nowrap';
    root.appendChild(cv);root.appendChild(exit);root.appendChild(tag);document.body.appendChild(root);

    function point(ev){
      var r=cv.getBoundingClientRect(),t=ev.touches&&ev.touches[0]?ev.touches[0]:ev;
      return{x:(t.clientX-r.left)/Math.max(1,r.width),y:(t.clientY-r.top)/Math.max(1,r.height)};
    }
    function move(ev){
      if(!active)return;
      var p=point(ev);if(canWalk(p.x,p.y)){player.x=p.x;player.y=p.y}
      try{ev.preventDefault()}catch(_){}
    }
    cv.addEventListener('pointerdown',move,{passive:false});
    cv.addEventListener('pointermove',function(ev){if(ev.buttons||ev.pointerType==='touch')move(ev)},{passive:false});
    return root;
  }
  function resize(){
    if(!cv)return;
    var dpr=Math.max(1,Math.min(2,Number(devicePixelRatio)||1));
    var w=Math.max(320,Math.floor(innerWidth*dpr)),h=Math.max(320,Math.floor(innerHeight*dpr));
    if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
  }
  function dirToPlayer(){
    var dx=player.x-boss.x,dy=player.y-boss.y;
    if(Math.abs(dx)>Math.abs(dy))return dx<0?1:2; // left/right
    return dy<0?3:0; // up/down
  }
  function drawFrame(ts){
    if(!active)return;
    resize();
    var W=cv.width,H=cv.height,size=Math.min(W,H),ox=(W-size)/2,oy=(H-size)/2;
    ctx.fillStyle='#090604';ctx.fillRect(0,0,W,H);
    ctx.drawImage(mapImg,ox,oy,size,size);

    boss.dir=dirToPlayer();
    var frame=Math.floor(ts/170)%4,cols=4,rows=4;
    var sw=idleImg.naturalWidth/cols,sh=idleImg.naturalHeight/rows;
    var row=boss.dir,col=frame;
    var bx=ox+boss.x*size,by=oy+boss.y*size,bsize=Math.max(72,Math.min(150,size*.16));
    ctx.drawImage(idleImg,col*sw,row*sh,sw,sh,bx-bsize/2,by-bsize*.60,bsize,bsize);

    var px=ox+player.x*size,py=oy+player.y*size;
    ctx.beginPath();ctx.arc(px,py,Math.max(7,size*.009),0,Math.PI*2);
    ctx.fillStyle='rgba(70,220,150,.95)';ctx.fill();ctx.lineWidth=Math.max(2,size*.002);ctx.strokeStyle='#fff2b0';ctx.stroke();
    try{
      var nm=String(P&&P.playerName||'Игрок');ctx.font='700 '+Math.max(9,Math.round(size*.012))+'px monospace';ctx.textAlign='center';ctx.fillStyle='#fff3c7';ctx.fillText(nm,px,py-Math.max(12,size*.018));
    }catch(_){}
    var tag=document.getElementById('ppaMimicArenaTag');if(tag){var aa=eventApi(),tm=!!(aa&&typeof aa.testMode==='function'&&aa.testMode());tag.textContent='🎭 МИМИК-САМБРЕРО '+level+(tm?' · ТЕСТ БЕЗ БИЛЕТА':'')+' · КАРТА / IDLE 4×4';}
    lastTs=ts;raf=requestAnimationFrame(drawFrame);
  }
  function enter(lv){
    lv=[20,40,60].includes(Number(lv))?Number(lv):20;
    var a=eventApi();if(!a||typeof a.consumeTicket!=='function'){toast('Событие Мимика ещё не готово','#ff9c72');return}
    var tm=!!(a&&typeof a.testMode==='function'&&a.testMode());
    if(!tm&&count()<1){toast('Нужен Билет Мимика-Самбреро','#ff9c72');return}
    preload().then(function(){
      if(!tm&&!a.consumeTicket(1)){toast('Нужен Билет Мимика-Самбреро','#ff9c72');return}
      ensureRoot();level=lv;player.x=.50;player.y=.84;boss.x=.50;boss.y=.50;
      try{prevScene=String(P&&P.scene||'');if(P)P.scene=SCENE}catch(_){}
      root.style.display='block';active=true;lastTs=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(drawFrame);
      try{if(typeof saveGame==='function')saveGame()}catch(_){}
    }).catch(function(){
      toast('Арена Мимика: не загружены карта/маска/спрайт','#ff9c72');
    });
  }
  function chooser(){
    var old=document.getElementById('ppaMimicChoose');if(old)old.remove();
    var box=document.createElement('div');box.id='ppaMimicChoose';
    box.style.cssText='position:fixed;inset:0;z-index:10080;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;color:#f9e7bd;font:800 11px monospace';
    box.innerHTML='<div style="width:min(430px,90vw);padding:14px;border:1px solid #b77a31;border-radius:13px;background:linear-gradient(#2c170c,#120b07);box-shadow:0 16px 40px #000;text-align:center"><div style="color:#ffd36a;font-size:16px;margin-bottom:8px">🎭 МИМИК-САМБРЕРО</div><div style="color:#cdbb9b;margin-bottom:10px">Билеты: <b style="color:#fff2b0">'+count()+'</b><br>1 билет = 1 вход</div><button data-lv="20">20 ур.</button><button data-lv="40">40 ур.</button><button data-lv="60">60 ур.</button><button data-close="1">ЗАКРЫТЬ</button></div>';
    Array.from(box.querySelectorAll('button')).forEach(function(b){b.style.cssText='margin:5px;padding:8px 12px;border:1px solid #9a6526;border-radius:8px;background:#3a2110;color:#ffd36a;font:900 11px monospace'});
    box.onclick=function(ev){var b=ev.target&&ev.target.closest?ev.target.closest('button'):null;if(!b)return;if(b.dataset.close){box.remove();return}var lv=Number(b.dataset.lv)||0;if(lv){box.remove();enter(lv)}};
    document.body.appendChild(box);
  }
  function leave(dead){
    if(!active){var q=document.getElementById('ppaMimicChoose');if(q)q.remove();return}
    active=false;cancelAnimationFrame(raf);raf=0;if(root)root.style.display='none';
    try{if(P)P.scene=prevScene||'safe'}catch(_){}
    if(dead){try{if(typeof changeScene==='function')changeScene('safe')}catch(_){}}
  }

  window.PPA_MIMIC_SOMBRERO_ARENA={open:chooser,enter:enter,leave:leave,preload:preload,isActive:function(){return active},scene:SCENE};
})();