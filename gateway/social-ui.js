(function(){
  'use strict';

  var friends=new Map(),current=null,party={partyId:'',members:[]},ready=false;
  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function initData(){var t=tg();return t&&t.initData?String(t.initData):''}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function nearby(id){try{return typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes&&PPA_ONLINE.remotes.get(String(id||''))||null}catch(_){return null}}
  async function api(path,payload){
    var d=initData();if(!d)throw new Error('Открой игру через Telegram Mini App');
    var r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({initData:d},payload||{})),credentials:'same-origin',cache:'no-store'});
    var j=null;try{j=await r.json()}catch(_){j=null}
    if(!r.ok||!j||j.ok===false)throw new Error((j&&j.message)||('HTTP '+r.status));
    return j;
  }
  function note(text,ok){try{if(typeof showPickup==='function')showPickup(String(text||''),ok===false?'#ff8d8d':'#8dffad')}catch(_){}

  function installStyle(){
    if(document.getElementById('ppaSocialStyle'))return;
    var st=document.createElement('style');st.id='ppaSocialStyle';st.textContent=`
      #ppaSocialShade{position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.22);display:none}
      #ppaSocialShade.on{display:block}
      #ppaPlayerCard{position:fixed;z-index:10030;left:50%;top:50%;transform:translate(-50%,-50%);width:min(86vw,330px);padding:13px;border:1px solid rgba(126,198,255,.7);border-radius:12px;background:linear-gradient(180deg,rgba(9,21,31,.97),rgba(7,10,16,.98));box-shadow:0 18px 42px #000;color:#ddd;font-family:Georgia,'Times New Roman',serif;display:none}
      #ppaPlayerCard.on{display:block}
      .ppaSocialName{font-size:17px;font-weight:800;color:#f2d39a;text-align:center;text-shadow:1px 1px 2px #000}
      .ppaSocialClass{margin-top:3px;text-align:center;color:#9fd7ff;font-size:11px}
      .ppaSocialStats{display:flex;justify-content:center;gap:18px;margin:12px 0;padding:9px;border-top:1px solid #29455a;border-bottom:1px solid #29455a;color:#ffd65e;font:bold 12px monospace}
      .ppaSocialBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ppaSocialBtn{min-height:42px;border:1px solid #50789b;border-radius:8px;background:rgba(26,51,70,.86);color:#d8ecff;font:bold 10px Georgia,serif}
      .ppaSocialBtn.friend{border-color:#9c5c45;background:rgba(78,34,27,.85);color:#ffd3b4}
      .ppaSocialBtn:disabled{opacity:.5}
      #ppaFriendsPanel{position:fixed;z-index:10035;left:50%;top:50%;transform:translate(-50%,-50%);width:min(91vw,380px);max-height:min(76vh,620px);overflow:auto;padding:12px;border:1px solid rgba(120,205,255,.7);border-radius:12px;background:rgba(7,14,21,.98);box-shadow:0 20px 50px #000;color:#ddd;font-family:Georgia,'Times New Roman',serif;display:none}
      #ppaFriendsPanel.on{display:block}
      .ppaFriendsHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.ppaFriendsHead b{color:#bfe7ff;font-size:15px}.ppaFriendsHead button{width:34px;height:34px;border-radius:8px;border:1px solid #46677e;background:#10212e;color:#d8efff}
      .ppaSocialSec{margin:8px 0 5px;color:#8ab9d7;font:bold 9px monospace;letter-spacing:.8px}
      .ppaFriendRow,.ppaPartyRow{display:flex;align-items:center;gap:8px;padding:8px;margin:5px 0;border:1px solid rgba(92,126,149,.36);border-radius:8px;background:rgba(255,255,255,.025)}
      .ppaFriendMain{flex:1;min-width:0}.ppaFriendName{font-weight:700;color:#efd2a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ppaFriendSub{font:9px monospace;color:#8ea0ad;margin-top:2px}.ppaFriendNear{color:#87efab}.ppaFriendAway{color:#88939b}
      .ppaFriendOpen,.ppaFriendRemove{border:1px solid #38586f;border-radius:7px;background:#10202b;color:#bfe4ff;min-width:35px;height:32px}.ppaFriendRemove{color:#ffadad;border-color:#704044}
      #ppaPartyLeave{width:100%;margin-top:6px;height:34px;border:1px solid #75454c;border-radius:8px;background:#29181b;color:#ffb9bd;font:bold 10px Georgia,serif}
      #ppaFriendsBtn{margin-left:auto;margin-right:5px;width:34px;height:30px;border:1px solid rgba(120,190,220,.45);border-radius:7px;background:rgba(9,25,34,.78);color:#bde7ff;font-size:15px;line-height:1}
      @media(max-width:600px){#ppaPlayerCard{top:45%}#ppaFriendsPanel{top:46%;max-height:70vh}}
    `;document.head.appendChild(st);
  }

  function ensureUi(){
    installStyle();
    if(!document.getElementById('ppaSocialShade')){var s=document.createElement('div');s.id='ppaSocialShade';document.body.appendChild(s);s.addEventListener('pointerdown',closeAll)}
    if(!document.getElementById('ppaPlayerCard')){var c=document.createElement('div');c.id='ppaPlayerCard';c.innerHTML='<div class="ppaSocialName" id="ppaSocialName">Игрок</div><div class="ppaSocialClass" id="ppaSocialClass">ГЕРОЙ</div><div class="ppaSocialStats"><span id="ppaSocialLevel">УР. 1</span><span id="ppaSocialBm">⚔ БМ 0</span></div><div class="ppaSocialBtns"><button class="ppaSocialBtn" id="ppaInviteParty">ПРИГЛАСИТЬ В ГРУППУ</button><button class="ppaSocialBtn friend" id="ppaAddFriend">ДОБАВИТЬ В ДРУЗЬЯ</button></div>';document.body.appendChild(c);c.addEventListener('pointerdown',function(e){e.stopPropagation()});document.getElementById('ppaInviteParty').onclick=inviteCurrent;document.getElementById('ppaAddFriend').onclick=addCurrentFriend}
    if(!document.getElementById('ppaFriendsPanel')){var p=document.createElement('div');p.id='ppaFriendsPanel';p.innerHTML='<div class="ppaFriendsHead"><b>👥 ДРУЗЬЯ И ГРУППА</b><button id="ppaFriendsClose">✕</button></div><div id="ppaFriendsBody">Загрузка…</div>';document.body.appendChild(p);p.addEventListener('pointerdown',function(e){e.stopPropagation()});document.getElementById('ppaFriendsClose').onclick=closeAll}
    var head=document.querySelector('.ppaChatHead');
    if(head&&!document.getElementById('ppaFriendsBtn')){var b=document.createElement('button');b.id='ppaFriendsBtn';b.type='button';b.textContent='👥';b.setAttribute('aria-label','Друзья и группа');var min=document.getElementById('ppaChatMinimize');head.insertBefore(b,min||null);b.onclick=function(e){e.stopPropagation();openFriends()}}
  }

  function closeAll(){
    var sh=document.getElementById('ppaSocialShade'),c=document.getElementById('ppaPlayerCard'),p=document.getElementById('ppaFriendsPanel');
    if(sh)sh.classList.remove('on');if(c)c.classList.remove('on');if(p)p.classList.remove('on');current=null;
  }
  function showShade(){var sh=document.getElementById('ppaSocialShade');if(sh)sh.classList.add('on')}

  function openPlayer(r){
    if(!r)return;ensureUi();current=r;showShade();
    var c=document.getElementById('ppaPlayerCard');c.classList.add('on');
    document.getElementById('ppaSocialName').textContent=String(r.name||'Игрок');
    document.getElementById('ppaSocialClass').textContent=String(r.cls||'ГЕРОЙ');
    document.getElementById('ppaSocialLevel').textContent='УР. '+Math.max(1,Math.floor(Number(r.level)||1));
    document.getElementById('ppaSocialBm').textContent='⚔ БМ '+Math.max(0,Math.round(Number(r.bm)||0));
    var fb=document.getElementById('ppaAddFriend');
    if(friends.has(String(r.id))){fb.textContent='✓ УЖЕ В ДРУЗЬЯХ';fb.disabled=true}else{fb.textContent='ДОБАВИТЬ В ДРУЗЬЯ';fb.disabled=false}
    var pb=document.getElementById('ppaInviteParty');pb.disabled=!window.PPA_RT_SEND;pb.textContent='ПРИГЛАСИТЬ В ГРУППУ';
  }

  async function loadFriends(){
    try{var r=await api('/api/social/list');friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});renderFriends();return r}catch(e){var body=document.getElementById('ppaFriendsBody');if(body)body.textContent='Не удалось загрузить друзей: '+e.message;return null}
  }
  async function addCurrentFriend(){
    if(!current)return;
    var btn=document.getElementById('ppaAddFriend');if(btn)btn.disabled=true;
    try{var r=await api('/api/social/add',{friendId:String(current.id||'')});friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});note(r.message||'Добавлено в друзья');if(btn){btn.textContent='✓ УЖЕ В ДРУЗЬЯХ';btn.disabled=true}}catch(e){note(e.message,false);if(btn)btn.disabled=false}
  }
  async function removeFriend(id){
    try{var r=await api('/api/social/remove',{friendId:id});friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});renderFriends()}catch(e){note(e.message,false)}
  }
  function inviteCurrent(){
    if(!current||!window.PPA_RT_SEND)return;
    var ok=window.PPA_RT_SEND({type:'party-invite',target:String(current.id||'')});
    if(ok){note('Приглашение в группу отправлено');closeAll()}else note('ONLINE переподключается',false)
  }

  function renderFriends(){
    var body=document.getElementById('ppaFriendsBody');if(!body)return;
    var pm=Array.isArray(party&&party.members)?party.members:[];
    var h='<div class="ppaSocialSec">ГРУППА</div>';
    if(pm.length){pm.forEach(function(x){h+='<div class="ppaPartyRow"><div class="ppaFriendMain"><div class="ppaFriendName">'+esc(x.name||'Игрок')+'</div><div class="ppaFriendSub">УР. '+Math.max(1,Number(x.level)||1)+' · БМ '+Math.max(0,Number(x.bm)||0)+'</div></div></div>'});h+='<button id="ppaPartyLeave">ПОКИНУТЬ ГРУППУ</button>'}else h+='<div class="ppaFriendSub" style="padding:7px">Группы пока нет. Тапни другого игрока → «Пригласить в группу».</div>';
    h+='<div class="ppaSocialSec">ДРУЗЬЯ</div>';
    if(!friends.size)h+='<div class="ppaFriendSub" style="padding:7px">Список пуст. Добавляй игроков тапом по персонажу.</div>';
    friends.forEach(function(f,id){var r=nearby(id),sub=r?('<span class="ppaFriendNear">● В ЭТОЙ ЛОКАЦИИ</span> · УР. '+Math.max(1,Number(r.level)||1)+' · БМ '+Math.max(0,Number(r.bm)||0)):'<span class="ppaFriendAway">○ НЕ В ЭТОЙ ЛОКАЦИИ</span>';h+='<div class="ppaFriendRow" data-friend="'+esc(id)+'"><div class="ppaFriendMain"><div class="ppaFriendName">'+esc(f.name||'Игрок')+'</div><div class="ppaFriendSub">'+sub+'</div></div>'+(r?'<button class="ppaFriendOpen" data-open="'+esc(id)+'">👤</button>':'')+'<button class="ppaFriendRemove" data-remove="'+esc(id)+'">×</button></div>'});
    body.innerHTML=h;
    var leave=document.getElementById('ppaPartyLeave');if(leave)leave.onclick=function(){if(window.PPA_RT_SEND)window.PPA_RT_SEND({type:'party-leave'})};
    body.querySelectorAll('[data-open]').forEach(function(b){b.onclick=function(){var r=nearby(b.dataset.open);if(r){document.getElementById('ppaFriendsPanel').classList.remove('on');openPlayer(r)}}});
    body.querySelectorAll('[data-remove]').forEach(function(b){b.onclick=function(){removeFriend(b.dataset.remove)}});
    updateFriendsButton();
  }

  function updateFriendsButton(){var b=document.getElementById('ppaFriendsBtn');if(!b)return;var n=party&&Array.isArray(party.members)?party.members.length:0;b.textContent=n>1?('👥'+n):'👥'}
  function openFriends(){ensureUi();showShade();document.getElementById('ppaFriendsPanel').classList.add('on');renderFriends();loadFriends()}

  function findTappedRemote(e){
    try{
      if(typeof PPA_ONLINE==='undefined'||!PPA_ONLINE.remotes||!PPA_ONLINE.remotes.size)return null;
      var c=document.getElementById('c');if(!c)return null;var cr=c.getBoundingClientRect();
      var px=(e.clientX-cr.left)*(c.width/Math.max(1,cr.width)),py=(e.clientY-cr.top)*(c.height/Math.max(1,cr.height));
      var z=1;try{z=Math.max(.1,Number(cameraZoom())||1)}catch(_){}
      var wx=px/z,wy=py/z,best=null,bd=1e9;
      PPA_ONLINE.remotes.forEach(function(r){if(!r||!Number.isFinite(Number(r.__ppaHitX))||!Number.isFinite(Number(r.__ppaHitY)))return;var rad=Math.max(28,Number(r.__ppaHitBody)||30);var d1=Math.hypot(wx-r.__ppaHitX,wy-r.__ppaHitY),d2=Math.hypot(px-r.__ppaHitX,py-r.__ppaHitY),d=Math.min(d1,d2);if(d<rad*1.25&&d<bd){bd=d;best=r}});return best;
    }catch(_){return null}
  }
  function armCanvasTap(){
    var c=document.getElementById('c');if(!c)return false;
    if(c.dataset.ppaSocialTap==='1')return true;c.dataset.ppaSocialTap='1';
    c.addEventListener('pointerdown',function(e){var r=findTappedRemote(e);if(!r)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();openPlayer(r)},true);return true;
  }

  window.PPA_SOCIAL_ON_PARTY_INVITE=function(from){
    var name=String((from&&from.name)||'Игрок'),lv=Math.max(1,Number(from&&from.level)||1),bm=Math.max(0,Number(from&&from.bm)||0);
    var ok=false;try{ok=window.confirm(name+' · ур. '+lv+' · БМ '+bm+' приглашает тебя в группу.\n\nПринять?')}catch(_){}
    if(window.PPA_RT_SEND)window.PPA_RT_SEND({type:ok?'party-accept':'party-decline',from:String((from&&from.id)||'')});
  };
  window.PPA_SOCIAL_ON_PARTY_STATE=function(s){party=s||{partyId:'',members:[]};renderFriends();updateFriendsButton()};
  window.PPA_SOCIAL_NOTICE=function(text,ok){note(text,ok)};

  function boot(){if(ready)return;ready=true;ensureUi();loadFriends();if(!armCanvasTap())setTimeout(armCanvasTap,700);setInterval(function(){if(!armCanvasTap())return;updateFriendsButton()},1800)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
