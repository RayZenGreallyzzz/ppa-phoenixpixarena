(function(){
  'use strict';
  var RT={ws:null,connecting:false,retry:0,retryTimer:0,lastMove:0,lastRoom:'',lastX:null,lastY:null,lastHp:null,lastMhp:null,lastFace:null,lastAnim:'',onlineCount:0,started:false,lastFullscreenAsk:0};

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function initData(){var t=tg();return t&&t.initData?String(t.initData):''}
  function room(){try{return typeof ppaOnlineRoomKey==='function'?String(ppaOnlineRoomKey()||'safe'):'safe'}catch(_){return 'safe'}}
  function mobileUi(){try{return innerWidth<=900||matchMedia('(pointer:coarse)').matches}catch(_){return false}}
  function fixOnlineBadge(){
    try{
      var el=document.getElementById('ppaOnlineBadge');if(!el)return;
      if(mobileUi()){
        el.style.left='50%';el.style.right='auto';el.style.top='4px';el.style.transform='translateX(-50%)';
        el.style.padding='1px 5px';el.style.fontSize='7px';el.style.lineHeight='1.1';el.style.maxWidth='130px';el.style.whiteSpace='nowrap';
        el.style.opacity='0.82';el.style.pointerEvents='none';el.style.zIndex='118';
      }else{
        el.style.left='8px';el.style.right='auto';el.style.top='8px';el.style.transform='none';
        el.style.padding='5px 8px';el.style.fontSize='10px';el.style.lineHeight='normal';el.style.maxWidth='none';el.style.whiteSpace='normal';el.style.opacity='1';el.style.pointerEvents='auto';
      }
    }catch(_){}
  }
  function status(text,col){try{if(typeof ppaOnlineSetStatus==='function'){ppaOnlineSetStatus(text,col);fixOnlineBadge()}}catch(_){}}
  function send(o){try{if(RT.ws&&RT.ws.readyState===WebSocket.OPEN){RT.ws.send(JSON.stringify(o));return true}}catch(_){}return false}
  function clearRemotes(){try{if(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes)PPA_ONLINE.remotes.clear()}catch(_){}}
  function applyPlayer(p,presence){try{if(typeof ppaOnlineApplyPacket==='function')ppaOnlineApplyPacket(p,!!presence)}catch(e){console.warn('Realtime player packet',e)}}
  function selfName(){try{return String((INV&&INV.playerName)||window.PPA_PLAYER_NAME||'Игрок').slice(0,24)}catch(_){return 'Игрок'}}

  function requestGameFullscreen(){
    var t=tg();if(!t||!mobileUi())return;
    try{if(typeof t.ready==='function')t.ready()}catch(_){}
    try{if(typeof t.expand==='function')t.expand()}catch(_){}
    try{if(typeof t.disableVerticalSwipes==='function')t.disableVerticalSwipes()}catch(_){}
    try{if(t.isFullscreen)return}catch(_){}
    var now=Date.now();if(now-RT.lastFullscreenAsk<900)return;RT.lastFullscreenAsk=now;
    try{if(typeof t.requestFullscreen==='function')t.requestFullscreen()}catch(_){}
  }

  function telegramGameMode(){
    var t=tg();if(!t)return;
    try{if(typeof t.ready==='function')t.ready()}catch(_){}
    try{if(typeof t.expand==='function')t.expand()}catch(_){}
    try{if(typeof t.disableVerticalSwipes==='function')t.disableVerticalSwipes()}catch(_){}
    requestGameFullscreen();
  }

  function armFullscreenRetry(){
    try{
      window.addEventListener('pointerdown',function(){requestGameFullscreen()},{capture:true,passive:true});
      window.addEventListener('pageshow',function(){setTimeout(requestGameFullscreen,80)},{passive:true});
      document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(requestGameFullscreen,100)},{passive:true});
      window.addEventListener('resize',fixOnlineBadge,{passive:true});
      window.addEventListener('orientationchange',function(){setTimeout(function(){fixOnlineBadge();requestGameFullscreen()},180)},{passive:true});
      var t=tg();
      if(t&&typeof t.onEvent==='function'){
        t.onEvent('activated',function(){setTimeout(requestGameFullscreen,80)});
        t.onEvent('viewportChanged',function(){setTimeout(requestGameFullscreen,120)});
        t.onEvent('fullscreenChanged',function(){if(!t.isFullscreen)setTimeout(requestGameFullscreen,250)});
        t.onEvent('fullscreenFailed',function(e){try{if(e&&e.error!=='ALREADY_FULLSCREEN')console.warn('Telegram fullscreen failed',e.error||e)}catch(_){}});
      }
    }catch(_){}
  }

  async function ticket(){
    var d=initData();if(!d)throw new Error('Telegram initData отсутствует');
    var r=await fetch('/api/realtime/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData:d}),credentials:'same-origin',cache:'no-store'});
    var j=null;try{j=await r.json()}catch(_){j=null}
    if(!r.ok||!j||!j.ok)throw new Error((j&&j.message)||('Realtime HTTP '+r.status));
    return j;
  }

  function scheduleReconnect(){
    if(RT.retryTimer)return;
    RT.retry=Math.min(8000,RT.retry?Math.round(RT.retry*1.7):1200);
    RT.retryTimer=setTimeout(function(){RT.retryTimer=0;connect()},RT.retry);
  }

  function setConnected(on){
    try{
      if(typeof PPA_ONLINE!=='undefined'){
        PPA_ONLINE.connected=!!on;PPA_ONLINE.enabled=!!on;
        if(on){PPA_ONLINE.roomKey=room();PPA_ONLINE.selfName=selfName()}
      }
    }catch(_){}
    if(on)status('ONLINE · '+Math.max(1,RT.onlineCount||1),'#9fffc1');
    else status('ONLINE · переподключение…','#ffb37d');
  }

  function sendRoom(force){
    var r=room();
    if(!force&&r===RT.lastRoom)return;
    RT.lastRoom=r;clearRemotes();send({type:'room',room:r});
    try{if(typeof PPA_ONLINE!=='undefined')PPA_ONLINE.roomKey=r}catch(_){}
  }

  function sendMove(force){
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return;
    var now=Date.now();if(!force&&now-RT.lastMove<220)return;
    try{
      var x=Number(P.x)||0,y=Number(P.y)||0,h=Math.max(0,Math.round(Number(P.hp)||0)),m=Math.max(1,Math.round(Number(P.mhp)||1)),f=Number(P.face)||1,a=String(P.anim||'idle').slice(0,12);
      var changed=RT.lastX===null||Math.abs(x-RT.lastX)>.35||Math.abs(y-RT.lastY)>.35||h!==RT.lastHp||m!==RT.lastMhp||f!==RT.lastFace||a!==RT.lastAnim;
      if(!force&&!changed&&now-RT.lastMove<1300)return;
      RT.lastMove=now;RT.lastX=x;RT.lastY=y;RT.lastHp=h;RT.lastMhp=m;RT.lastFace=f;RT.lastAnim=a;
      send({type:'move',x:x,y:y,h:h,m:m,f:f,a:a});
    }catch(_){}
  }

  function receive(m){
    if(!m||typeof m!=='object')return;
    if(m.type==='hello'){
      try{if(typeof PPA_ONLINE!=='undefined'){PPA_ONLINE.selfId=String(m.pid||PPA_ONLINE.selfId||'');PPA_ONLINE.selfName=String(m.name||selfName())}}catch(_){}
      sendRoom(true);sendMove(true);return;
    }
    if(m.type==='online'){RT.onlineCount=Math.max(0,Number(m.count)||0);status('ONLINE · '+RT.onlineCount,'#9fffc1');return}
    if(m.type==='snapshot'){
      if(String(m.room||'')!==RT.lastRoom)return;clearRemotes();(Array.isArray(m.players)?m.players:[]).forEach(function(p){applyPlayer(p,true)});return;
    }
    if(m.type==='move'){if(m.player)applyPlayer(m.player,false);return}
    if(m.type==='join'){if(m.player)applyPlayer(m.player,true);return}
    if(m.type==='leave'){try{if(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes)PPA_ONLINE.remotes.delete(String(m.id||''))}catch(_){}return}
    if(m.type==='chat'){
      try{if(window.PPA_CHAT_RECEIVE)window.PPA_CHAT_RECEIVE(m.channel,m.from,m.text,{target:m.target||''})}catch(_){}return;
    }
    if(m.type==='chat-error'){
      try{if(window.PPA_CHAT_RECEIVE)window.PPA_CHAT_RECEIVE(m.channel||'general','Система',m.message||'Ошибка чата',{system:true})}catch(_){}return;
    }
  }

  async function connect(){
    if(RT.connecting||!initData())return;
    if(RT.ws&&(RT.ws.readyState===WebSocket.OPEN||RT.ws.readyState===WebSocket.CONNECTING))return;
    RT.connecting=true;status('ONLINE · подключение…','#cceeff');
    try{
      var t=await ticket();
      var proto=location.protocol==='https:'?'wss:':'ws:';
      var ws=new WebSocket(proto+'//'+location.host+'/api/realtime/ws?ticket='+encodeURIComponent(t.ticket));
      RT.ws=ws;
      ws.onopen=function(){RT.connecting=false;RT.retry=0;setConnected(true);sendRoom(true);sendMove(true)};
      ws.onmessage=function(ev){try{receive(JSON.parse(ev.data))}catch(_){}};
      ws.onclose=function(){if(RT.ws===ws)RT.ws=null;RT.connecting=false;clearRemotes();setConnected(false);scheduleReconnect()};
      ws.onerror=function(){};
    }catch(e){RT.connecting=false;console.warn('PPA realtime connect',e);setConnected(false);scheduleReconnect()}
  }

  window.addEventListener('ppa-chat-send',function(ev){
    var d=ev&&ev.detail?ev.detail:{};
    if(!send({type:'chat',channel:String(d.channel||'general'),target:String(d.target||''),text:String(d.text||'').slice(0,180)})){
      try{if(window.PPA_CHAT_RECEIVE)window.PPA_CHAT_RECEIVE(d.channel||'general','Система','Чат переподключается…',{system:true})}catch(_){}
    }
  });

  setInterval(function(){
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return;
    sendRoom(false);sendMove(false);
  },120);
  setInterval(function(){if(RT.ws&&RT.ws.readyState===WebSocket.OPEN)send({type:'ping'})},25000);

  window.PPA_REALTIME_RECONNECT=function(){try{if(RT.ws)RT.ws.close(4000,'Identity refresh')}catch(_){};setTimeout(connect,250)};
  window.PPA_REALTIME_DIAG=function(){return{connected:!!(RT.ws&&RT.ws.readyState===WebSocket.OPEN),room:RT.lastRoom,online:RT.onlineCount,retry:RT.retry,fullscreen:!!(tg()&&tg().isFullscreen)}};

  function boot(){if(RT.started)return;RT.started=true;telegramGameMode();armFullscreenRetry();setTimeout(requestGameFullscreen,250);setTimeout(requestGameFullscreen,1100);setTimeout(fixOnlineBadge,350);setTimeout(connect,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
