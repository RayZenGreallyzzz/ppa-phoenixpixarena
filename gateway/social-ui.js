(function(){
  'use strict';

  var friends=new Map();
  var current=null;
  var party={partyId:'',members:[]};
  var hitEls=new Map();
  var booted=false;

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function initData(){var t=tg();return t&&t.initData?String(t.initData):''}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function nearby(id){try{return window.PPA_ONLINE&&PPA_ONLINE.remotes&&PPA_ONLINE.remotes.get(String(id||''))||null}catch(_){return null}}
  function note(text,ok){try{if(typeof showPickup==='function')showPickup(String(text||''),ok===false?'#ff8d8d':'#8dffad')}catch(_){} }

  async function api(path,payload){
    var d=initData();
    if(!d)throw new Error('Открой игру через Telegram Mini App');
    var r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({initData:d},payload||{})),credentials:'same-origin',cache:'no-store'});
    var j=null;try{j=await r.json()}catch(_){}
    if(!r.ok||!j||j.ok===false)throw new Error((j&&j.message)||('HTTP '+r.status));
    return j;
  }

  function installStyle(){
    if(document.getElementById('ppaSocialStyleV2'))return;
    var st=document.createElement('style');
    st.id='ppaSocialStyleV2';
    st.textContent=`
      #ppaSocialShade{position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.26);display:none}
      #ppaSocialShade.on{display:block}
      #ppaPlayerCard{position:fixed;z-index:10030;left:50%;top:48%;transform:translate(-50%,-50%);width:min(88vw,330px);padding:13px;border:1px solid rgba(126,198,255,.72);border-radius:12px;background:linear-gradient(180deg,rgba(9,21,31,.98),rgba(7,10,16,.99));box-shadow:0 18px 42px #000;color:#ddd;font-family:Georgia,'Times New Roman',serif;display:none}
      #ppaPlayerCard.on{display:block}
      .ppaSocialName{font-size:17px;font-weight:800;color:#f2d39a;text-align:center;text-shadow:1px 1px 2px #000}
      .ppaSocialClass{margin-top:3px;text-align:center;color:#9fd7ff;font-size:11px}
      .ppaSocialStats{display:flex;justify-content:center;gap:18px;margin:12px 0;padding:9px;border-top:1px solid #29455a;border-bottom:1px solid #29455a;color:#ffd65e;font:bold 12px monospace}
      .ppaSocialBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ppaSocialBtn{min-height:42px;border:1px solid #50789b;border-radius:8px;background:rgba(26,51,70,.9);color:#d8ecff;font:bold 10px Georgia,serif;padding:4px}
      .ppaSocialBtn.friend{border-color:#9c5c45;background:rgba(78,34,27,.88);color:#ffd3b4}
      .ppaSocialBtn:disabled{opacity:.55}
      #ppaFriendsPanel{position:fixed;z-index:10035;left:50%;top:48%;transform:translate(-50%,-50%);width:min(92vw,390px);max-height:min(72vh,620px);overflow:auto;padding:12px;border:1px solid rgba(120,205,255,.72);border-radius:12px;background:rgba(7,14,21,.99);box-shadow:0 20px 50px #000;color:#ddd;font-family:Georgia,'Times New Roman',serif;display:none}
      #ppaFriendsPanel.on{display:block}
      .ppaFriendsHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.ppaFriendsHead b{color:#bfe7ff;font-size:15px}.ppaFriendsHead button{width:34px;height:34px;border-radius:8px;border:1px solid #46677e;background:#10212e;color:#d8efff}
      .ppaSocialSec{margin:9px 0 5px;color:#8ab9d7;font:bold 9px monospace;letter-spacing:.8px}
      .ppaFriendRow,.ppaPartyRow{display:flex;align-items:center;gap:8px;padding:8px;margin:5px 0;border:1px solid rgba(92,126,149,.36);border-radius:8px;background:rgba(255,255,255,.025)}
      .ppaFriendMain{flex:1;min-width:0}.ppaFriendName{font-weight:700;color:#efd2a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ppaFriendSub{font:9px monospace;color:#8ea0ad;margin-top:2px}.ppaFriendNear{color:#87efab}.ppaFriendAway{color:#88939b}
      .ppaFriendOpen,.ppaFriendRemove{border:1px solid #38586f;border-radius:7px;background:#10202b;color:#bfe4ff;min-width:35px;height:32px}.ppaFriendRemove{color:#ffadad;border-color:#704044}
      #ppaPartyLeave{width:100%;margin-top:6px;height:34px;border:1px solid #75454c;border-radius:8px;background:#29181b;color:#ffb9bd;font:bold 10px Georgia,serif}
      .ppaFriendsTab{height:27px;border:1px solid #365568;border-radius:4px;background:#0d1720;color:#9fd7ff;font:700 7.5px monospace;white-space:nowrap;padding:0 2px}
      .ppaFriendsTab:active{background:#173040;border-color:#5f9abb;color:#d7efff}
      #ppaRemoteHitLayer{position:fixed;inset:0;z-index:4800;pointer-events:none}
      .ppaRemoteHit{position:fixed;pointer-events:auto;background:transparent;border:0;border-radius:50%;padding:0;margin:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      @media(max-width:600px){#ppaPlayerCard{top:45%}#ppaFriendsPanel{top:45%;max-height:68vh}.ppaFriendsTab{font-size:7px}}
    `;
    document.head.appendChild(st);
  }

  function closeAll(){
    var sh=document.getElementById('ppaSocialShade');
    var c=document.getElementById('ppaPlayerCard');
    var p=document.getElementById('ppaFriendsPanel');
    if(sh)sh.classList.remove('on');
    if(c)c.classList.remove('on');
    if(p)p.classList.remove('on');
    current=null;
  }
  function showShade(){var sh=document.getElementById('ppaSocialShade');if(sh)sh.classList.add('on')}

  function ensureBaseUi(){
    installStyle();
    if(!document.getElementById('ppaSocialShade')){
      var s=document.createElement('div');s.id='ppaSocialShade';document.body.appendChild(s);
      s.addEventListener('pointerdown',closeAll);
    }
    if(!document.getElementById('ppaPlayerCard')){
      var c=document.createElement('div');c.id='ppaPlayerCard';
      c.innerHTML='<div class="ppaSocialName" id="ppaSocialName">Игрок</div><div class="ppaSocialClass" id="ppaSocialClass">ГЕРОЙ</div><div class="ppaSocialStats"><span id="ppaSocialLevel">УР. 1</span><span id="ppaSocialBm">⚔ БМ 0</span></div><div class="ppaSocialBtns"><button class="ppaSocialBtn" id="ppaInviteParty">ПРИГЛАСИТЬ В ГРУППУ</button><button class="ppaSocialBtn friend" id="ppaAddFriend">ДОБАВИТЬ В ДРУЗЬЯ</button></div>';
      document.body.appendChild(c);
      c.addEventListener('pointerdown',function(e){e.stopPropagation()});
      document.getElementById('ppaInviteParty').addEventListener('click',inviteCurrent);
      document.getElementById('ppaAddFriend').addEventListener('click',addCurrentFriend);
    }
    if(!document.getElementById('ppaFriendsPanel')){
      var p=document.createElement('div');p.id='ppaFriendsPanel';
      p.innerHTML='<div class="ppaFriendsHead"><b>👥 ДРУЗЬЯ И ГРУППА</b><button id="ppaFriendsClose" type="button">✕</button></div><div id="ppaFriendsBody">Загрузка…</div>';
      document.body.appendChild(p);
      p.addEventListener('pointerdown',function(e){e.stopPropagation()});
      document.getElementById('ppaFriendsClose').addEventListener('click',closeAll);
    }
    if(!document.getElementById('ppaRemoteHitLayer')){
      var h=document.createElement('div');h.id='ppaRemoteHitLayer';document.body.appendChild(h);
    }
    ensureFriendsTab();
  }

  function ensureFriendsTab(){
    var tabs=document.querySelector('#ppaChatBox .ppaChatTabs')||document.querySelector('.ppaChatTabs');
    if(!tabs)return false;
    tabs.style.gridTemplateColumns='repeat(5,1fr)';
    var b=document.getElementById('ppaFriendsTab');
    if(!b){
      b=document.createElement('button');
      b.id='ppaFriendsTab';b.type='button';b.className='ppaFriendsTab';b.textContent='ДРУЗЬЯ';
      b.setAttribute('aria-label','Друзья и группа');
      b.addEventListener('pointerdown',function(e){e.stopPropagation()});
      b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openFriends()});
      tabs.appendChild(b);
    }
    return true;
  }

  function openPlayer(r){
    if(!r)return;
    ensureBaseUi();current=r;showShade();
    var card=document.getElementById('ppaPlayerCard');if(!card)return;
    card.classList.add('on');
    document.getElementById('ppaSocialName').textContent=String(r.name||r.n||'Игрок');
    document.getElementById('ppaSocialClass').textContent=String(r.cls||r.classKey||r.c||'ГЕРОЙ');
    document.getElementById('ppaSocialLevel').textContent='УР. '+Math.max(1,Math.floor(Number(r.level||r.l)||1));
    document.getElementById('ppaSocialBm').textContent='⚔ БМ '+Math.max(0,Math.round(Number(r.bm||r.b)||0));
    var fb=document.getElementById('ppaAddFriend');
    var id=String(r.id||r.i||'');
    if(friends.has(id)){fb.textContent='✓ УЖЕ В ДРУЗЬЯХ';fb.disabled=true}else{fb.textContent='ДОБАВИТЬ В ДРУЗЬЯ';fb.disabled=false}
    var pb=document.getElementById('ppaInviteParty');
    pb.disabled=!window.PPA_RT_SEND;pb.textContent='ПРИГЛАСИТЬ В ГРУППУ';
  }

  async function loadFriends(){
    try{
      var r=await api('/api/social/list');
      friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});
      renderFriends();return r;
    }catch(e){
      var body=document.getElementById('ppaFriendsBody');if(body)body.textContent='Не удалось загрузить друзей: '+e.message;
      return null;
    }
  }

  async function addCurrentFriend(){
    if(!current)return;
    var id=String(current.id||current.i||'');
    if(!id)return;
    var btn=document.getElementById('ppaAddFriend');if(btn)btn.disabled=true;
    try{
      var r=await api('/api/social/add',{friendId:id});
      friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});
      note(r.message||'Игрок добавлен в друзья');
      if(btn){btn.textContent='✓ УЖЕ В ДРУЗЬЯХ';btn.disabled=true}
    }catch(e){note(e.message,false);if(btn)btn.disabled=false}
  }

  async function removeFriend(id){
    try{
      var r=await api('/api/social/remove',{friendId:id});
      friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});
      renderFriends();
    }catch(e){note(e.message,false)}
  }

  function inviteCurrent(){
    if(!current||!window.PPA_RT_SEND)return;
    var id=String(current.id||current.i||'');
    if(!id)return;
    var ok=window.PPA_RT_SEND({type:'party-invite',target:id});
    if(ok){note('Приглашение в группу отправлено');closeAll()}else note('ONLINE переподключается',false)
  }

  function renderFriends(){
    var body=document.getElementById('ppaFriendsBody');if(!body)return;
    var pm=Array.isArray(party&&party.members)?party.members:[];
    var h='<div class="ppaSocialSec">ГРУППА</div>';
    if(pm.length){
      pm.forEach(function(x){h+='<div class="ppaPartyRow"><div class="ppaFriendMain"><div class="ppaFriendName">'+esc(x.name||'Игрок')+'</div><div class="ppaFriendSub">УР. '+Math.max(1,Number(x.level)||1)+' · БМ '+Math.max(0,Number(x.bm)||0)+'</div></div></div>'});
      h+='<button id="ppaPartyLeave">ПОКИНУТЬ ГРУППУ</button>';
    }else h+='<div class="ppaFriendSub" style="padding:7px">Группы пока нет. Тапни другого игрока → «Пригласить в группу».</div>';
    h+='<div class="ppaSocialSec">ДРУЗЬЯ</div>';
    if(!friends.size)h+='<div class="ppaFriendSub" style="padding:7px">Список пуст. Добавляй игроков тапом по персонажу.</div>';
    friends.forEach(function(f,id){
      var r=nearby(id);
      var sub=r?('<span class="ppaFriendNear">● РЯДОМ</span> · УР. '+Math.max(1,Number(r.level)||1)+' · БМ '+Math.max(0,Number(r.bm)||0)):'<span class="ppaFriendAway">○ НЕ В ЭТОЙ ЛОКАЦИИ</span>';
      h+='<div class="ppaFriendRow"><div class="ppaFriendMain"><div class="ppaFriendName">'+esc(f.name||'Игрок')+'</div><div class="ppaFriendSub">'+sub+'</div></div>'+(r?'<button class="ppaFriendOpen" data-open="'+esc(id)+'" type="button">👤</button>':'')+'<button class="ppaFriendRemove" data-remove="'+esc(id)+'" type="button">×</button></div>';
    });
    body.innerHTML=h;
    var leave=document.getElementById('ppaPartyLeave');if(leave)leave.onclick=function(){if(window.PPA_RT_SEND)window.PPA_RT_SEND({type:'party-leave'})};
    body.querySelectorAll('[data-open]').forEach(function(b){b.onclick=function(){var r=nearby(b.dataset.open);if(r){document.getElementById('ppaFriendsPanel').classList.remove('on');openPlayer(r)}}});
    body.querySelectorAll('[data-remove]').forEach(function(b){b.onclick=function(){removeFriend(b.dataset.remove)}});
  }

  function openFriends(){
    ensureBaseUi();showShade();
    var p=document.getElementById('ppaFriendsPanel');if(!p)return;
    p.classList.add('on');renderFriends();loadFriends();
  }

  function canvasRectData(){
    var c=document.getElementById('c');if(!c)return null;
    var cr=c.getBoundingClientRect();
    var z=1;try{z=Math.max(.1,Number(cameraZoom())||1)}catch(_){}
    return {c:c,cr:cr,z:z};
  }

  function positionHitTargets(){
    ensureFriendsTab();
    var info=canvasRectData();
    if(!info||!window.PPA_ONLINE||!PPA_ONLINE.remotes)return;
    var live=new Set();
    var layer=document.getElementById('ppaRemoteHitLayer');if(!layer)return;
    PPA_ONLINE.remotes.forEach(function(r,id){
      id=String(id||r.id||'');if(!id)return;
      if(!Number.isFinite(Number(r.__ppaHitX))||!Number.isFinite(Number(r.__ppaHitY)))return;
      live.add(id);
      var el=hitEls.get(id);
      if(!el){
        el=document.createElement('button');el.type='button';el.className='ppaRemoteHit';el.setAttribute('aria-label','Игрок '+String(r.name||'Игрок'));
        el.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();openPlayer(nearby(id)||r)},true);
        layer.appendChild(el);hitEls.set(id,el);
      }
      var sx=Number(r.__ppaHitX),sy=Number(r.__ppaHitY),rad=Math.max(30,Number(r.__ppaHitBody)||32);
      var x=info.cr.left+(sx*info.z)*(info.cr.width/Math.max(1,info.c.width));
      var y=info.cr.top+(sy*info.z)*(info.cr.height/Math.max(1,info.c.height));
      var rr=Math.max(26,rad*info.z*(info.cr.width/Math.max(1,info.c.width))*1.5);
      el.style.left=(x-rr)+'px';el.style.top=(y-rr)+'px';el.style.width=(rr*2)+'px';el.style.height=(rr*2)+'px';
      el.style.display=(x<-rr||y<-rr||x>innerWidth+rr||y>innerHeight+rr)?'none':'block';
    });
    hitEls.forEach(function(el,id){if(!live.has(id)){try{el.remove()}catch(_){}hitEls.delete(id)}});
  }

  function armCanvasFallback(){
    var c=document.getElementById('c');if(!c||c.dataset.ppaSocialTapV2==='1')return;
    c.dataset.ppaSocialTapV2='1';
    c.addEventListener('pointerdown',function(e){
      try{
        if(!window.PPA_ONLINE||!PPA_ONLINE.remotes)return;
        var info=canvasRectData();if(!info)return;
        var px=(e.clientX-info.cr.left)*(info.c.width/Math.max(1,info.cr.width));
        var py=(e.clientY-info.cr.top)*(info.c.height/Math.max(1,info.cr.height));
        var wx=px/info.z,wy=py/info.z,best=null,bd=1e9;
        PPA_ONLINE.remotes.forEach(function(r){
          if(!Number.isFinite(Number(r.__ppaHitX))||!Number.isFinite(Number(r.__ppaHitY)))return;
          var rad=Math.max(30,Number(r.__ppaHitBody)||32);
          var d=Math.hypot(wx-Number(r.__ppaHitX),wy-Number(r.__ppaHitY));
          if(d<rad*1.8&&d<bd){bd=d;best=r}
        });
        if(best){e.preventDefault();e.stopPropagation();openPlayer(best)}
      }catch(_){}
    },true);
  }

  window.PPA_SOCIAL_ON_PARTY_INVITE=function(from){
    var name=String((from&&from.name)||'Игрок');
    var lv=Math.max(1,Number(from&&from.level)||1),bm=Math.max(0,Number(from&&from.bm)||0);
    var ok=false;
    try{ok=window.confirm(name+' · ур. '+lv+' · БМ '+bm+' приглашает тебя в группу.\n\nПринять?')}catch(_){}
    if(window.PPA_RT_SEND)window.PPA_RT_SEND({type:ok?'party-accept':'party-decline',from:String((from&&from.id)||'')});
  };
  window.PPA_SOCIAL_ON_PARTY_STATE=function(s){party=s||{partyId:'',members:[]};renderFriends()};
  window.PPA_SOCIAL_NOTICE=function(text,ok){note(text,ok)};
  window.PPA_SOCIAL_OPEN_FRIENDS=openFriends;
  window.PPA_SOCIAL_OPEN_PLAYER=openPlayer;

  function boot(){
    if(booted)return;booted=true;
    ensureBaseUi();armCanvasFallback();loadFriends();
    setInterval(function(){ensureBaseUi();armCanvasFallback();positionHitTargets()},180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
