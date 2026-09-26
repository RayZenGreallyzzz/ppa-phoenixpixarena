(function(){
  'use strict';

  var img=null,imgSrc='',attackUntil=0,attackFx=[],aoeFx=[];

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
        hp:67000,mhp:67000,mp:260,mmp:260,sp:1.05,sz:180,col:'#a83224',
        dmg:180,dmgType:'physical',def:160,xp:900,gold:650,lvl:60,
        atkCD:0,flash:0,bob:0,isBoss:true,isDungeon60Boss:true,
        dragonState:'idle',dragonAttackUntil:0,__ppaServerDir:1
      };
      EN.push(e);return e;
    }catch(err){console.warn('PPA dragon60 spawn',err);return null}
  };

  window.PPA_DRAGON60_ON_ATTACK=function(e,m){
    if(!e||!e.isDungeon60Boss)return;
    var now=Date.now(),dir=facing(e);
    e.dragonState='attack';
    e.dragonAttackUntil=now+480;
    attackUntil=e.dragonAttackUntil;
    attackFx.push({
      born:now,life:430,x:Number(e.x)||0,y:Number(e.y)||0,dir:dir,
      target:String(m&&m.target||'')
    });
    if(attackFx.length>8)attackFx.splice(0,attackFx.length-8);
  };

  window.PPA_DRAGON60_ON_SPECIAL=function(e,m){
    if(!e||!e.isDungeon60Boss||!m)return;
    var now=Date.now(),phase=String(m.phase||''),kind=String(m.kind||'');
    if(kind!=='dragon60-aoe')return;
    if(phase==='telegraph'){
      e.dragonState='charge';
      e.dragonAttackUntil=Math.max(Number(m.impactAt)||now+900,now+650);
      aoeFx.push({
        phase:'telegraph',born:now,impactAt:Number(m.impactAt)||now+900,
        x:Number(m.x)||Number(e.x)||0,y:Number(m.y)||Number(e.y)||0,
        radius:Math.max(80,Number(m.radius)||230),life:1400
      });
    }else if(phase==='impact'){
      e.dragonState='attack';
      e.dragonAttackUntil=now+520;
      aoeFx.push({
        phase:'impact',born:now,x:Number(m.x)||Number(e.x)||0,y:Number(m.y)||Number(e.y)||0,
        radius:Math.max(80,Number(m.radius)||230),life:700
      });
    }
    if(aoeFx.length>10)aoeFx.splice(0,aoeFx.length-10);
  };

  // Server controls movement/aggro/damage. This hook only maintains animation state.
  window.PPA_DRAGON60_UPDATE=function(e){
    if(!e||!e.isDungeon60Boss)return;
    var now=Date.now(),until=Number(e.dragonAttackUntil||attackUntil||0);
    if(now<until){
      if(e.dragonState!=='charge')e.dragonState='attack';
    }else if(e.__ppaServerMoving||e.animMoving||e.spiderMoving)e.dragonState='walk';
    else e.dragonState='idle';
    e.bob=(Number(e.bob)||0)+(e.dragonState==='walk'?.23:(e.dragonState==='charge'?.11:.065));
  };

  function facing(e){
    var d=Number(e&&e.__ppaServerDir);
    if(!Number.isFinite(d))d=1;
    return Math.round(d);
  }

  function drawGroundFx(){
    if(typeof cx==='undefined'||typeof cam==='undefined')return;
    var now=Date.now();

    for(var i=attackFx.length-1;i>=0;i--){
      var a=attackFx[i],age=now-a.born;
      if(age>a.life){attackFx.splice(i,1);continue}
      var t=Math.max(0,Math.min(1,age/a.life)),alpha=1-t;
      var sx=a.x-cam.x,sy=a.y-cam.y,ang=0;
      if(a.dir===0)ang=-Math.PI/2;else if(a.dir===1)ang=Math.PI/2;else if(a.dir===2)ang=Math.PI;else ang=0;
      cx.save();
      cx.globalAlpha=.85*alpha;
      cx.translate(sx,sy-12);
      cx.rotate(ang);
      cx.strokeStyle='rgba(255,132,58,.95)';
      cx.lineWidth=8-3*t;
      cx.beginPath();cx.arc(54,0,42,-.85,.85);cx.stroke();
      cx.strokeStyle='rgba(255,220,132,.8)';
      cx.lineWidth=2;
      cx.beginPath();cx.arc(54,0,51,-.72,.72);cx.stroke();
      for(var p=0;p<5;p++){
        var q=(p+1)/6,rr=38+q*45;
        cx.fillStyle='rgba(95,75,68,'+(.45*alpha)+')';
        cx.beginPath();cx.arc(rr,(p-2)*7,3+3*(1-t),0,Math.PI*2);cx.fill();
      }
      cx.restore();
    }

    for(var j=aoeFx.length-1;j>=0;j--){
      var f=aoeFx[j],age2=now-f.born;
      if(age2>f.life){aoeFx.splice(j,1);continue}
      var x=f.x-cam.x,y=f.y-cam.y,r=f.radius;
      cx.save();
      if(f.phase==='telegraph'){
        var left=Math.max(0,(f.impactAt-now)/Math.max(1,f.impactAt-f.born));
        var pulse=.5+.5*Math.sin(now*.018);
        cx.globalAlpha=.30+.22*pulse;
        cx.fillStyle='rgba(118,38,18,.20)';
        cx.beginPath();cx.arc(x,y+18,r,0,Math.PI*2);cx.fill();
        cx.strokeStyle='rgba(255,91,38,.95)';
        cx.lineWidth=3+2*pulse;
        cx.beginPath();cx.arc(x,y+18,r*(.92+.08*(1-left)),0,Math.PI*2);cx.stroke();
        cx.strokeStyle='rgba(255,198,84,.8)';
        cx.lineWidth=1.5;
        cx.beginPath();cx.arc(x,y+18,r*.72,0,Math.PI*2);cx.stroke();
      }else{
        var t2=Math.max(0,Math.min(1,age2/f.life)),rr=r*(.45+.8*t2);
        cx.globalAlpha=1-t2;
        cx.strokeStyle='rgba(255,123,45,.95)';cx.lineWidth=12*(1-t2)+2;
        cx.beginPath();cx.arc(x,y+18,rr,0,Math.PI*2);cx.stroke();
        cx.strokeStyle='rgba(255,225,125,.85)';cx.lineWidth=3;
        cx.beginPath();cx.arc(x,y+18,rr*.76,0,Math.PI*2);cx.stroke();
        for(var k=0;k<14;k++){
          var an=(Math.PI*2*k/14)+(k%3)*.17,pr=rr*(.55+.38*((k%5)/4));
          cx.fillStyle='rgba(255,'+(105+(k%4)*25)+',45,'+(0.8*(1-t2))+')';
          cx.beginPath();cx.arc(x+Math.cos(an)*pr,y+18+Math.sin(an)*pr,2.5+4*(1-t2),0,Math.PI*2);cx.fill();
        }
      }
      cx.restore();
    }
  }

  function dragonPose(e){
    var state=e.dragonState||'idle',b=Number(e.bob)||0;
    var walk=state==='walk',atk=state==='attack',charge=state==='charge';
    var lift=walk?(-11-Math.abs(Math.sin(b*1.65))*8):(charge?(-9-Math.sin(b*.8)*3):(-6-Math.sin(b*.52)*3));
    var pulse=atk?(1.075+Math.sin(b*3.3)*.012):(charge?(1.045+Math.sin(b*2.1)*.015):(walk?1+Math.sin(b*1.5)*.022:1+Math.sin(b*.55)*.012));
    var tilt=walk?Math.sin(b*1.05)*.025:(atk?.055:0);
    return{state:state,walk:walk,atk:atk,charge:charge,lift:lift,pulse:pulse,tilt:tilt};
  }

  window.PPA_DRAGON60_DRAW_BODY=function(e){
    try{
      if(!e||!e.isDungeon60Boss||typeof cx==='undefined'||typeof cam==='undefined')return false;
      var sx=e.x-cam.x,sy=e.y-cam.y,im=image(),dir=facing(e),pose=dragonPose(e);
      var w=270*pose.pulse,h=270*pose.pulse;
      sy+=pose.lift;
      cx.save();
      if(im&&im.complete&&im.naturalWidth>0){
        cx.translate(sx,sy);
        if(dir===2)cx.scale(-1,1);
        var tilt=pose.tilt+(pose.atk?(dir===0?-.035:dir===1?.035:0):0);
        if(tilt)cx.rotate(tilt);
        cx.imageSmoothingEnabled=false;
        cx.drawImage(im,-w/2,-h+74,w,h);
      }else{
        cx.fillStyle=e.flash>0?'#fff':'#8f2b24';
        cx.beginPath();cx.arc(sx,sy,70,0,Math.PI*2);cx.fill();
      }
      cx.restore();
      return true;
    }catch(err){console.warn('PPA dragon60 body draw',err);return false}
  };

  window.PPA_DRAGON60_DRAW=function(e){
    try{
      if(!e||!e.isDungeon60Boss||typeof cx==='undefined'||typeof cam==='undefined')return false;
      var sx=e.x-cam.x,sy=e.y-cam.y,im=image(),dir=facing(e),pose=dragonPose(e);
      var baseSy=sy,w=270*pose.pulse,h=270*pose.pulse;
      drawGroundFx();
      cx.save();
      var shadowScale=pose.walk?.82:.92;
      cx.fillStyle='rgba(0,0,0,.42)';cx.beginPath();cx.ellipse(sx,baseSy+55,82*shadowScale,24*shadowScale,0,0,Math.PI*2);cx.fill();
      sy+=pose.lift;
      if(im&&im.complete&&im.naturalWidth>0){
        cx.translate(sx,sy);
        // Clan event dragon art is the approved in-game base. Horizontal server facing is mirrored.
        if(dir===2)cx.scale(-1,1);
        var tilt=pose.tilt+(pose.atk?(dir===0?-.035:dir===1?.035:0):0);
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

      var bw=205,bh=9,barY=baseSy-176;
      cx.fillStyle='rgba(0,0,0,.82)';cx.fillRect(sx-bw/2,barY,bw,bh);
      cx.fillStyle='#b63a2c';cx.fillRect(sx-bw/2,barY,bw*Math.max(0,Math.min(1,Number(e.hp||0)/Math.max(1,Number(e.mhp)||1))),bh);
      cx.strokeStyle='rgba(239,168,105,.9)';cx.strokeRect(sx-bw/2,barY,bw,bh);
      cx.fillStyle='#f2c38c';cx.font='bold 12px monospace';cx.textAlign='center';
      cx.fillText('ДРАКОН ПЕПЛА · '+Math.max(0,Math.ceil(Number(e.hp)||0))+' / '+Math.ceil(Number(e.mhp)||67000),sx,barY-8);
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
        if(window.PPA_MOB_REWARD_ELIGIBLE&&!window.PPA_MOB_REWARD_ELIGIBLE(e))return;
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
            if(Math.random()<.02){
              var epicIt=genItem(60,true,'epic');
              LOOT.push({x:e.x+(Math.random()-.5)*42,y:e.y+(Math.random()-.5)*42,kind:'gear',item:epicIt,gear:epicIt,bob:Math.random()*6});
            }
            if(Math.random()<.0000012){
              var legendaryIt=genItem(60,true,'legendary');
              LOOT.push({x:e.x+(Math.random()-.5)*42,y:e.y+(Math.random()-.5)*42,kind:'gear',item:legendaryIt,gear:legendaryIt,bob:Math.random()*6});
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
          ['Фиолетовый шмот/оружие','2%'],
          ['Легендарный шмот/оружие','0.00012%'],
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