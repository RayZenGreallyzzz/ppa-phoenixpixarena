(function(){
  'use strict';
  if(window.__PPA_CLAN_BOSS_CHEST_V1)return;
  window.__PPA_CLAN_BOSS_CHEST_V1=true;

  var CHEST_SRC='/assets/clan-boss-chest.webp';
  var chest=null,root=null,button=null,label=null,barWrap=null,bar=null,who=null,countdown=null;
  var raf=0,lastCompleteKey='',rollPanel=null,rollTimers=[];
  var openingKey='',localOpenStart=0,localOpenEnd=0;

  function scene(){
    try{return String(P&&P.scene||'')}catch(_){return''}
  }
  function selfPid(){
    try{
      if(typeof window.PPA_CLAN_BOSS_SELF_PID==='function'){
        var p=String(window.PPA_CLAN_BOSS_SELF_PID()||'');if(p)return p;
      }
      return String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||'');
    }catch(_){return''}
  }
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function nearChest(c){
    try{
      if(typeof P==='undefined'||!P||!c)return false;
      return Math.hypot((Number(P.x)||0)-(Number(c.x)||0),(Number(P.y)||0)-(Number(c.y)||0))<=155;
    }catch(_){return false}
  }
  function project(c){
    try{
      if(!c||typeof cv==='undefined'||!cv||typeof cam==='undefined'||!cam)return null;
      var rect=cv.getBoundingClientRect();
      var z=1;try{if(typeof cameraZoom==='function')z=Math.max(.1,Number(cameraZoom())||1)}catch(_){}
      var ix=((Number(c.x)||0)-(Number(cam.x)||0))*z;
      var iy=((Number(c.y)||0)-(Number(cam.y)||0))*z;
      var sx=rect.left+ix*(rect.width/Math.max(1,Number(cv.width)||rect.width));
      var sy=rect.top+iy*(rect.height/Math.max(1,Number(cv.height)||rect.height));
      return{x:sx,y:sy,rect:rect};
    }catch(_){return null}
  }
  function addStyles(){
    if(document.getElementById('ppaClanBossChestStyle'))return;
    var st=document.createElement('style');st.id='ppaClanBossChestStyle';
    st.textContent=
      '#ppaClanBossChest{position:fixed;z-index:35;display:none;width:0;height:0;pointer-events:none;text-align:center;filter:drop-shadow(0 8px 9px rgba(0,0,0,.72))}'+
      '#ppaClanBossChestBtn{position:absolute;left:-62px;bottom:-10px;width:124px;height:124px;padding:0;border:0;background:transparent;pointer-events:auto;touch-action:manipulation;cursor:pointer;transform-origin:50% 100%}'+
      '#ppaClanBossChestBtn img{width:100%;height:100%;object-fit:contain;display:block;user-select:none;-webkit-user-drag:none;image-rendering:auto}'+
      '#ppaClanBossChest.closed #ppaClanBossChestBtn{animation:ppaCbChestPulse 1.35s ease-in-out infinite}'+
      '#ppaClanBossChest.opening #ppaClanBossChestBtn{pointer-events:none;animation:ppaCbChestGlow .65s ease-in-out infinite alternate}'+
      '#ppaClanBossChestLabel{position:absolute;left:0;bottom:111px;transform:translateX(-50%);display:inline-block;padding:3px 7px;border:1px solid rgba(255,190,79,.72);border-radius:7px;background:rgba(20,12,8,.9);color:#ffd36a;font:800 10px/1.15 monospace;text-shadow:0 1px 2px #000;white-space:nowrap}'+
      '#ppaClanBossChestWho{position:absolute;left:0;bottom:132px;transform:translateX(-50%);color:#fff2c7;font:700 9px/1.2 monospace;text-shadow:0 1px 3px #000;white-space:nowrap}'+
      '#ppaClanBossChestBarWrap{position:absolute;left:-61px;bottom:147px;display:none;width:120px;height:8px;padding:1px;border:1px solid rgba(255,211,106,.82);border-radius:5px;background:rgba(0,0,0,.76);overflow:hidden}'+
      '#ppaClanBossChestBar{height:100%;width:0%;border-radius:3px;background:linear-gradient(90deg,#9b301c,#ff843b,#ffe173);box-shadow:0 0 8px rgba(255,132,59,.8)}'+
      '#ppaClanBossChestCount{position:absolute;left:0;bottom:43px;transform:translateX(-50%);display:none;min-width:42px;height:42px;border-radius:50%;align-items:center;justify-content:center;background:rgba(18,8,4,.78);border:2px solid #ffd36a;color:#fff3b0;font:900 25px/42px monospace;text-align:center;text-shadow:0 2px 3px #000;box-shadow:0 0 16px rgba(255,112,34,.72)}'+
      '#ppaClanBossRoll{position:fixed;left:50%;top:12%;transform:translateX(-50%);z-index:10065;width:min(430px,88vw);max-height:72vh;overflow:auto;padding:12px;border:1px solid rgba(255,190,79,.72);border-radius:12px;background:rgba(13,10,9,.96);box-shadow:0 12px 36px rgba(0,0,0,.72);color:#f7e8c3;font:700 11px/1.35 monospace;text-align:left}'+
      '#ppaClanBossRoll .ttl{text-align:center;color:#ffd36a;font-size:14px;margin-bottom:8px}'+
      '#ppaClanBossRoll .sub{text-align:center;color:#d8c59f;font-size:10px;margin-bottom:8px}'+
      '#ppaClanBossRoll .rank{padding:6px 7px;margin:4px 0;border-radius:7px;background:rgba(255,255,255,.045)}'+
      '#ppaClanBossRoll .item{padding:8px;margin:6px 0;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.035)}'+
      '#ppaClanBossRoll .item b{color:#91c8ff}#ppaClanBossRoll .winner{color:#ffd36a}#ppaClanBossRoll .miss{color:#988f82}'+
      '#ppaClanBossRoll .nums{margin-top:4px;color:#cfc7b7;font-size:9px;white-space:normal}'+
      '#ppaClanBossRoll .close{display:block;margin:9px auto 0;padding:6px 16px;border:1px solid #8f6933;border-radius:7px;background:#2a1b0e;color:#ffd36a;font:800 10px monospace}'+
      '.ppaCbFly{position:fixed;z-index:10064;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;background:radial-gradient(circle,#fff2a0 0,#ff9b34 35%,rgba(255,73,20,.18) 66%,transparent 72%);color:white;font:900 13px monospace;text-shadow:0 1px 2px #000;animation:ppaCbFly 1.05s ease-out forwards}'+
      '@keyframes ppaCbChestPulse{0%,100%{transform:scale(1);filter:drop-shadow(0 0 5px rgba(255,80,24,.35))}50%{transform:scale(1.06);filter:drop-shadow(0 0 14px rgba(255,105,34,.85))}}'+
      '@keyframes ppaCbChestGlow{from{filter:drop-shadow(0 0 7px rgba(255,90,24,.45))}to{filter:drop-shadow(0 0 18px rgba(255,205,80,.95))}}'+
      '@keyframes ppaCbFly{0%{opacity:0;transform:translate(0,0) scale(.55)}18%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.35)}}';
    document.head.appendChild(st);
  }
  function ensure(){
    if(root&&root.isConnected)return;
    addStyles();
    root=document.createElement('div');root.id='ppaClanBossChest';root.className='closed';
    button=document.createElement('button');button.id='ppaClanBossChestBtn';button.type='button';button.setAttribute('aria-label','Открыть сундук кланового босса');
    var im=document.createElement('img');im.src=CHEST_SRC;im.alt='';button.appendChild(im);
    label=document.createElement('div');label.id='ppaClanBossChestLabel';label.textContent='СУНДУК КЛАНОВОГО БОССА';
    who=document.createElement('div');who.id='ppaClanBossChestWho';
    barWrap=document.createElement('div');barWrap.id='ppaClanBossChestBarWrap';
    bar=document.createElement('div');bar.id='ppaClanBossChestBar';barWrap.appendChild(bar);
    countdown=document.createElement('div');countdown.id='ppaClanBossChestCount';
    root.appendChild(button);root.appendChild(label);root.appendChild(who);root.appendChild(barWrap);root.appendChild(countdown);
    document.body.appendChild(root);
    button.addEventListener('click',function(ev){
      ev.preventDefault();ev.stopPropagation();
      if(!chest||String(chest.state||'closed')!=='closed')return;
      if(typeof window.PPA_CLAN_BOSS_CHEST_OPEN==='function')window.PPA_CLAN_BOSS_CHEST_OPEN();
    },{passive:false});
  }
  function hide(){if(root)root.style.display='none'}
  function setChest(c,serverTs){
    chest=c&&typeof c==='object'?Object.assign({},c):null;
    if(!chest){openingKey='';localOpenStart=0;localOpenEnd=0;hide();return}
    var state=String(chest.state||'closed');
    if(state==='opening'){
      var key=String(chest.openerPid||'')+':'+String(chest.openStartedAt||0)+':'+String(chest.openAt||0);
      if(key!==openingKey||!(localOpenEnd>0)){
        openingKey=key;
        var serverStart=Math.max(0,Number(chest.openStartedAt)||0);
        var serverEnd=Math.max(serverStart+1,Number(chest.openAt)||serverStart+5000);
        var duration=Math.max(1000,Math.min(7000,serverEnd-serverStart||5000));
        var ts=Math.max(0,Number(serverTs)||0);
        var remain=ts>0?Math.max(0,Math.min(duration,serverEnd-ts)):duration;
        localOpenEnd=Date.now()+remain;
        localOpenStart=localOpenEnd-duration;
      }
      if(String(chest.openerPid||'')!==selfPid())lastCompleteKey='';
    }else{
      openingKey='';localOpenStart=0;localOpenEnd=0;
      if(state!=='opened')lastCompleteKey='';
    }
  }
  function blockChest(c){
    try{
      if(!c||String(c.state||'')==='opened'||typeof P==='undefined'||!P||scene()!=='clanboss1')return;
      var cx=Number(c.x)||0,cy=Number(c.y)||0,dx=(Number(P.x)||0)-cx,dy=(Number(P.y)||0)-cy;
      var minD=64,d=Math.hypot(dx,dy);
      if(d>=minD)return;
      if(d<.001){dx=0;dy=1;d=1}
      P.x=cx+dx/d*minD;
      P.y=cy+dy/d*minD;
    }catch(_){}
  }
  function tick(){
    try{
      ensure();
      var state=chest&&String(chest.state||'closed');
      if(scene()!=='clanboss1'||!chest||state==='opened'){hide();raf=requestAnimationFrame(tick);return}
      var p=project(chest);if(!p){hide();raf=requestAnimationFrame(tick);return}
      var pad=80;
      if(p.x<p.rect.left-pad||p.x>p.rect.right+pad||p.y<p.rect.top-pad||p.y>p.rect.bottom+pad){hide();raf=requestAnimationFrame(tick);return}
      root.style.display='block';root.style.left=p.x+'px';root.style.top=p.y+'px';root.className=state==='opening'?'opening':'closed';
      blockChest(chest);
      if(state==='opening'){
        var now=Date.now(),start=localOpenStart||now,end=localOpenEnd||now+5000;
        var duration=Math.max(1,end-start),pct=Math.max(0,Math.min(1,(now-start)/duration));
        var sec=Math.max(1,Math.ceil(Math.max(0,end-now)/1000));
        label.textContent='ОТКРЫТИЕ СУНДУКА';
        who.textContent=String(chest.openerName||'Игрок')+' открывает';
        barWrap.style.display='block';bar.style.width=(pct*100).toFixed(1)+'%';
        countdown.style.display='flex';countdown.textContent=String(sec);
        var key=String(chest.openerPid||'')+':'+String(chest.openAt||0);
        if(String(chest.openerPid||'')===selfPid()&&now>=end&&lastCompleteKey!==key){
          lastCompleteKey=key;
          if(typeof window.PPA_CLAN_BOSS_CHEST_COMPLETE==='function')window.PPA_CLAN_BOSS_CHEST_COMPLETE();
        }
      }else{
        label.textContent=nearChest(chest)?'НАЖМИ · ОТКРЫТЬ':'СУНДУК КЛАНОВОГО БОССА';
        who.textContent=nearChest(chest)?'Открытие займёт 5 секунд':'Подойди ближе';
        barWrap.style.display='none';bar.style.width='0%';countdown.style.display='none';countdown.textContent='';
      }
    }catch(_){}
    raf=requestAnimationFrame(tick);
  }
  function clearRollTimers(){while(rollTimers.length)clearTimeout(rollTimers.pop())}
  function flyBurst(){
    var p=project(chest)||{x:innerWidth/2,y:innerHeight*.48};
    var glyph=['◆','✦','✧','◆','✦','◇'];
    for(var i=0;i<6;i++){
      (function(i){
        setTimeout(function(){
          var d=document.createElement('div');d.className='ppaCbFly';d.textContent=glyph[i%glyph.length];
          d.style.left=p.x+'px';d.style.top=(p.y-28)+'px';
          var ang=(-Math.PI*.88)+(i/5)*Math.PI*.76,dist=88+(i%3)*22;
          d.style.setProperty('--dx',(Math.cos(ang)*dist)+'px');
          d.style.setProperty('--dy',(Math.sin(ang)*dist-28)+'px');
          document.body.appendChild(d);setTimeout(function(){d.remove()},1150);
        },i*80);
      })(i);
    }
  }
  function rareTitle(kind,label){return String(label||kind||'Награда')}
  function renderRoll(packet){
    clearRollTimers();
    if(rollPanel)rollPanel.remove();
    var d=packet&&packet.distribution&&typeof packet.distribution==='object'?packet.distribution:null;
    if(!d)return;
    rollPanel=document.createElement('div');rollPanel.id='ppaClanBossRoll';
    var eligible=Array.isArray(d.eligible)?d.eligible:[];
    var shared=Array.isArray(d.shared)?d.shared:[];
    var top=eligible.slice(0,3);
    var bossTitle=String(d.bossTitle||((String(d.bossId||'')==='clan_boss_2')?'Цербер':'Владычица'));\n    var html='<div class="ttl">🎁 РОЛЛ СУНДУКА '+esc(bossTitle.toUpperCase())+'</div>'+
      '<div class="sub">Участники от '+esc(d.minDamage||5000)+' урона · редкий дроп распределяет сервер</div>';
    if(top.length){
      html+='<div class="rank"><b>Урон:</b> '+top.map(function(x,i){return (i+1)+'. '+esc(x.name)+' — '+Math.round(Number(x.damage)||0).toLocaleString('ru-RU')}).join(' · ')+'</div>';
    }
    if(d.killerName)html+='<div class="rank">⚔ Последний удар: <b>'+esc(d.killerName)+'</b></div>';
    shared.forEach(function(r,i){
      var id='ppaCbRollItem'+i;
      html+='<div class="item" id="'+id+'"><b>'+esc(rareTitle(r.kind,r.label))+'</b><div class="result">'+(r.dropped?'РОЛЛ…':'<span class="miss">не выпало</span>')+'</div></div>';
    });
    html+='<button class="close" type="button">ЗАКРЫТЬ</button>';
    rollPanel.innerHTML=html;document.body.appendChild(rollPanel);
    rollPanel.querySelector('.close').onclick=function(){if(rollPanel)rollPanel.remove();rollPanel=null;clearRollTimers()};
    shared.forEach(function(r,i){
      if(!r||!r.dropped)return;
      rollTimers.push(setTimeout(function(){
        if(!rollPanel)return;
        var el=document.getElementById('ppaCbRollItem'+i);if(!el)return;
        var nums=(Array.isArray(r.rolls)?r.rolls:[]).map(function(x){
          return esc(x.name)+' <b>'+Math.max(1,Math.min(100,Math.round(Number(x.roll)||1)))+'</b>';
        }).join(' · ');
        var res=el.querySelector('.result');
        res.innerHTML='<span class="winner">🏆 '+esc(r.winnerName||'Игрок')+' — '+Math.max(1,Math.min(100,Math.round(Number(r.winnerRoll)||1)))+'</span>'+
          (nums?'<div class="nums">'+nums+'</div>':'');
      },850+i*850));
    });
    rollTimers.push(setTimeout(function(){if(rollPanel){rollPanel.remove();rollPanel=null}},12000));
  }
  function opened(packet){
    if(packet&&packet.chest)setChest(packet.chest);
    flyBurst();
    rollTimers.push(setTimeout(function(){renderRoll(packet||{})},650));
  }

  window.PPA_CLAN_BOSS_CHEST_STATE=setChest;
  window.PPA_CLAN_BOSS_CHEST_OPENED=opened;

  ensure();tick();
})();