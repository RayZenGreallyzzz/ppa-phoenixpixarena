(function(){
  'use strict';

  var img=null,imgSrc='',attackUntil=0;

  function artSource(){
    try{
      if(typeof CLAN_BOSS_ART!=='undefined'&&CLAN_BOSS_ART&&CLAN_BOSS_ART[4])return String(CLAN_BOSS_ART[4]);
    }catch(_){}
    try{
      if(window.PPA_DRAGON60_BASE_ART)return String(window.PPA_DRAGON60_BASE_ART);
    }catch(_){}
    return '';
  }
  function image(){
    var src=artSource();
    if(!src)return null;
    if(!img||imgSrc!==src){imgSrc=src;img=new Image();img.src=src}
    return img;
  }
  function boss(){
    try{
      if(typeof EN==='undefined'||!Array.isArray(EN))return null;
      for(var i=0;i<EN.length;i++)if(EN[i]&&EN[i].isDungeon60Boss)return EN[i];
    }catch(_){}
    return null;
  }
  function home(){
    try{
      var sc=(typeof DG_SCALE!=='undefined'&&Number(DG_SCALE))||1;
      var x=(typeof DG_BOSS_IMG!=='undefined'&&DG_BOSS_IMG)?Number(DG_BOSS_IMG[0]||0)*sc:0;
      var y=(typeof DG_BOSS_IMG!=='undefined'&&DG_BOSS_IMG)?Number(DG_BOSS_IMG[1]||0)*sc:0;
      if(typeof dgNearestWalk==='function'){
        var p=dgNearestWalk(x,y);if(p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)))return{x:Number(p.x),y:Number(p.y)}
      }
      return{x:x,y:y};
    }catch(_){return{x:0,y:0}}
  }

  window.PPA_DRAGON60_SPAWN_FROM_SERVER=function(){
    try{
      var e=boss();if(e)return e;
      if(typeof EN==='undefined'||!Array.isArray(EN))return null;
      var p=home(),id=Date.now();
      try{if(typeof eid!=='undefined')id=eid++}catch(_){}
      e={
        id:id,type:{n:'ДРАКОН ПЕПЛА'},x:p.x,y:p.y,hx:p.x,hy:p.y,
        hp:25000,mhp:25000,mp:260,mmp:260,sp:1.05,sz:180,col:'#a83224',
        dmg:130,dmgType:'physical',def:120,xp:900,gold:650,lvl:60,
        atkCD:0,flash:0,bob:0,isBoss:true,isDungeon60Boss:true,
        dragonState:'idle',dragonAttackUntil:0,__ppaServerDir:1
      };
      EN.push(e);return e;
    }catch(err){console.warn('PPA dragon60 spawn',err);return null}
  };

  window.PPA_DRAGON60_ON_ATTACK=function(e,m){
    if(!e||!e.isDungeon60Boss)return;
    e.dragonState='attack';
    e.dragonAttackUntil=Date.now()+420;
    attackUntil=e.dragonAttackUntil;
  };

  // Server controls movement/aggro/damage. This hook only maintains animation state.
  window.PPA_DRAGON60_UPDATE=function(e){
    if(!e||!e.isDungeon60Boss)return;
    var now=Date.now();
    if(now<Number(e.dragonAttackUntil||attackUntil||0))e.dragonState='attack';
    else if(e.__ppaServerMoving||e.animMoving||e.spiderMoving)e.dragonState='walk';
    else e.dragonState='idle';
    e.bob=(Number(e.bob)||0)+(e.dragonState==='walk'?.16:.055);
  };

  function facing(e){
    var d=Number(e&&e.__ppaServerDir);
    if(!Number.isFinite(d))d=1;
    return Math.round(d);
  }

  window.PPA_DRAGON60_DRAW=function(e){
    try{
      if(!e||!e.isDungeon60Boss||typeof cx==='undefined'||typeof cam==='undefined')return false;
      var sx=e.x-cam.x,sy=e.y-cam.y,im=image(),state=e.dragonState||'idle',dir=facing(e);
      var atk=state==='attack',walk=state==='walk';
      var pulse=atk?1.065:(walk?1+Math.sin((e.bob||0)*1.7)*.018:1+Math.sin((e.bob||0)*.55)*.012);
      var w=270*pulse,h=270*pulse;
      cx.save();
      cx.fillStyle='rgba(0,0,0,.46)';cx.beginPath();cx.ellipse(sx,sy+55,82,24,0,0,Math.PI*2);cx.fill();
      if(im&&im.complete&&im.naturalWidth>0){
        cx.translate(sx,sy);
        // Clan event dragon art is the approved in-game base. Horizontal server facing is mirrored.
        if(dir===2)cx.scale(-1,1);
        var tilt=atk?(dir===0?-.025:dir===1?.025:0):0;
        if(tilt)cx.rotate(tilt);
        cx.imageSmoothingEnabled=false;
        cx.drawImage(im,-w/2,-h+74,w,h);
      }else{
        cx.fillStyle=e.flash>0?'#fff':'#8f2b24';cx.beginPath();cx.arc(sx,sy,70,0,Math.PI*2);cx.fill();
      }
      cx.restore();

      if(e.flash>0){
        cx.save();cx.strokeStyle='rgba(255,225,190,.75)';cx.lineWidth=2;
        cx.beginPath();cx.ellipse(sx,sy+28,72,25,0,0,Math.PI*2);cx.stroke();cx.restore();
      }

      var bw=205,bh=9,barY=sy-176;
      cx.fillStyle='rgba(0,0,0,.82)';cx.fillRect(sx-bw/2,barY,bw,bh);
      cx.fillStyle='#b63a2c';cx.fillRect(sx-bw/2,barY,bw*Math.max(0,Math.min(1,Number(e.hp||0)/Math.max(1,Number(e.mhp)||1))),bh);
      cx.strokeStyle='rgba(239,168,105,.9)';cx.strokeRect(sx-bw/2,barY,bw,bh);
      cx.fillStyle='#f2c38c';cx.font='bold 12px monospace';cx.textAlign='center';
      cx.fillText('🐉 ДРАКОН ПЕПЛА · '+Math.max(0,Math.ceil(Number(e.hp)||0))+' / '+Math.ceil(Number(e.mhp)||25000),sx,barY-8);
      cx.textAlign='left';
      return true;
    }catch(err){console.warn('PPA dragon60 draw',err);return false}
  };

  function installDragonLoot(){
    try{
      if(window.__PPA_DRAGON60_LOOT_V1)return;
      if(typeof dropLoot!=='function')return;
      var base=dropLoot;
      var wrapped=function(e){
        if(!e||!e.isDungeon60Boss)return base.apply(this,arguments);
        // Dragon has its own table; never inherit Phoenix feather/rune rolls.
        try{
          if(typeof pushMaterialDrop==='function'){
            pushMaterialDrop(e,'common',4+Math.floor(Math.random()*4));
            if(Math.random()<.80)pushMaterialDrop(e,'uncommon',2+Math.floor(Math.random()*3));
            if(Math.random()<.50)pushMaterialDrop(e,'rare',1+Math.floor(Math.random()*2));
          }
          if(typeof pushStoneDrop==='function'){
            if(Math.random()<.75)pushStoneDrop(e,'normal',1+Math.floor(Math.random()*2));
            if(Math.random()<.08)pushStoneDrop(e,'premium',1);
            if(Math.random()<.12)pushStoneDrop(e,'rune',1);
          }
          if(typeof genItem==='function'&&typeof LOOT!=='undefined'&&Array.isArray(LOOT)){
            var roll=Math.random(),rar=roll<.02?'epic':(roll<.16?'rare':null);
            if(rar){
              var it=genItem(60,true,rar);
              LOOT.push({x:e.x+(Math.random()-.5)*42,y:e.y+(Math.random()-.5)*42,kind:'gear',item:it,gear:it,bob:Math.random()*6});
            }
          }
        }catch(_){}
        return;
      };
      wrapped.__ppaDragon60=1;
      try{dropLoot=wrapped}catch(_){}
      try{window.dropLoot=wrapped}catch(_){}
      window.__PPA_DRAGON60_LOOT_V1=true;
    }catch(_){}
  }

  function installDragonInfo(){
    try{
      if(window.__PPA_DRAGON60_INFO_V1)return;
      if(typeof mobDropInfo!=='function')return;
      var base=mobDropInfo;
      var wrapped=function(e){
        if(e&&e.isDungeon60Boss)return [
          ['Золото','100%'],
          ['Синий шмот/оружие','14%'],
          ['Фиолетовый шмот/оружие','2%'],
          ['Обычный ресурс ×4–7','100%'],
          ['Зелёный ресурс ×2–4','80%'],
          ['Синий ресурс ×1–2','50%'],
          ['Обычный камень заточки ×1–2','75%'],
          ['Премиум камень заточки','8%'],
          ['Премиум руна заточки','12%'],
          ['Перо Феникса','не выпадает']
        ];
        return base.apply(this,arguments);
      };
      try{mobDropInfo=wrapped}catch(_){}
      try{window.mobDropInfo=wrapped}catch(_){}
      window.__PPA_DRAGON60_INFO_V1=true;
    }catch(_){}
  }

  window.PPA_DRAGON60_DIAG=function(){
    var e=boss();return{present:!!e,hp:e?Number(e.hp)||0:0,mhp:e?Number(e.mhp)||0:0,state:e?e.dragonState:'none'};
  };

  installDragonLoot();installDragonInfo();
  setTimeout(function(){installDragonLoot();installDragonInfo()},400);
})();