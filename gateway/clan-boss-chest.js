(function(){
  'use strict';
  if(window.__PPA_CLAN_BOSS_CHEST_V1)return;
  window.__PPA_CLAN_BOSS_CHEST_V1=true;

  var CHEST_SRC='/assets/clan-boss-chest.webp';
  var chest=null,root=null,button=null,label=null,barWrap=null,bar=null,who=null;
  var raf=0,lastCompleteKey='',rollPanel=null,rollTimers=[];

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
      '#ppaClanBossChest{position:fixed;z-index:35;display:none;pointer-events:none;transform:translate(-50%,-68%);text-align:center;filter:drop-shadow(0 8px 9px rgba(0,0,0,.72))}'+
      '#ppaClanBossChestBtn{position:relative;width:116px;height:116px;padding:0;border:0;background:transparent;pointer-events:auto;touch-action:manipulation;cursor:pointer}'+
      '#ppaClanBossChestBtn img{width:100%;height:100%;object-fit:contain;display:block;user-select:none;-webkit-user-drag:none;image-rendering:auto}'+
      '#ppaClanBossChest.closed #ppaClanBossChestBtn{animation:ppaCbChestPulse 1.35s ease-in-out infinite}'+
      '#ppaClanBossChest.opening #ppaClanBossChestBtn{pointer-events:none;animation:ppaCbChestGlow .65s ease-in-out infinite alternate}'+
      '#ppaClanBossChestLabel{display:inline-block;margin-top:-9px;padding:3px 7px;border:1px solid rgba(255,190,79,.72);border-radius:7px;background:rgba(20,12,8,.88);color:#ffd36a;font:800 10px/1.15 monospace;text-shadow:0 1px 2px #000;white-space:nowrap}'+
      '#ppaClanBossChestWho{margin-top:3px;color:#fff2c7;font:700 9px/1.2 monospace;text-shadow:0 1px 3px #000;white-space:nowrap}'+
      '#ppaClanBossChestBarWrap{display:none;width:120px;height:8px;margin:4px auto 0;padding:1px;border:1px solid rgba(255,211,106,.82);border-radius:5px;background:rgba(0,0,0,.72);overflow:hidden}'+
      '#ppaClanBossChestBar{height:100%;width:0%;border-radius:3px;background:linear-gradient(90deg,#9b301c,#ff843b,#ffe173);box-shadow:0 0 8px rgba(255,132,59,.8)}'+
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
    label=document.createElement('div');label.id='ppaClanBossChestLabel';label.textContent='СУНДУК ВЛАДЫЧИЦЫ';
    who=document.createElement('div');who.id='ppaClanBossChestWho';
    barWrap=document.createElement('div');barWrap.id='ppaClanBossChestBarWrap';
    bar=document.createElement('div');bar.id='ppaClanBossChestBar';barWrap.appendChild(bar);
    root.appendChild(button);root.appendChild(label);root.appendChild(who);root.appendChild(barWrap);
    document.body.appendChild(root);
    button.addEventListener('click',function(ev){
      ev.preventDefault();ev.stopPropagation();
      if(!chest||String(chest.state||'closed')!=='closed')return;
      if(typeof window.PPA_CLAN_BOSS_CHEST_OPEN==='function')window.PPA_CLAN_BOSS_CHEST_OPEN();
    },{passive:false});
  }
  function hide(){if(root)root.style.display='none'}
  function setChest(c){
    chest=c&&typeof c==='object'?Object.assign({},c):null;
    if(chest&&String(chest.state||'')==='opening'&&String(chest.openerPid||'')!==selfPid())lastCompleteKey='';
    if(!chest)hide();
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
      if(state==='opening'){
        var start=Math.max(0,Number(chest.openStartedAt)||0),end=Math.max(start+1,Number(chest.openAt)||start+5000),now=Date.now();
        var pct=Math.max(0,Math.min(1,(now-start)/(end-start)));
        label.textContent='ОТКРЫТИЕ · '+Math.ceil(Math.max(0,end-now)/1000)+'с';
        who.textContent=String(chest.openerName||'Игрок')+' открывает сундук';
        barWrap.style.display='block';bar.style.width=(pct*100).toFixed(1)+'%';
        var key=String(chest.openerPid||'')+':'+String(end);
        if(String(chest.openerPid||'')===selfPid()&&now>=end&&lastCompleteKey!==key){
          lastCompleteKey=key;
          if(typeof window.PPA_CLAN_BOSS_CHEST_COMPLETE==='function')window.PPA_CLAN_BOSS_CHEST_COMPLETE();
        }
      }else{
        label.textContent=nearChest(chest)?'НАЖМИ · ОТКРЫТЬ':'СУНДУК ВЛАДЫЧИЦЫ';
        who.textContent=nearChest(chest)?'Открытие займёт 5 секунд':'Подойди ближе';
        barWrap.style.display='none';bar.style.width='0%';
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
    var html='<div class="ttl">🎁 РОЛЛ СУНДУКА ВЛАДЫЧИЦЫ</div>'+
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