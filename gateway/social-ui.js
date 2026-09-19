(function(){
  'use strict';

  var friends=new Map();
  var current=null;
  var party={partyId:'',leaderId:'',members:[]};
  var booted=false;
  var pendingInvite=null;

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function initData(){var t=tg();return t&&t.initData?String(t.initData):''}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function online(){try{return (typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE)?PPA_ONLINE:null}catch(_){return null}}
  function selfId(){var o=online();return String((o&&o.selfId)||'')}
  function nearby(id){var o=online();try{return o&&o.remotes?o.remotes.get(String(id||''))||null:null}catch(_){return null}}
  function note(text,ok){try{if(typeof showPickup==='function')showPickup(String(text||''),ok===false?'#ff8d8d':'#8dffad')}catch(_){}}

  async function api(path,payload){
    var d=initData();if(!d)throw new Error('Открой игру через Telegram Mini App');
    var r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({initData:d},payload||{})),credentials:'same-origin',cache:'no-store'});
    var j=null;try{j=await r.json()}catch(_){}
    if(!r.ok||!j||j.ok===false)throw new Error((j&&j.message)||('HTTP '+r.status));
    return j;
  }

  function installStyle(){
    if(document.getElementById('ppaSocialStyleV4'))return;
    var st=document.createElement('style');st.id='ppaSocialStyleV4';st.textContent=`
      #ppaSocialShade,#ppaPartyInviteShade{position:fixed;inset:0;background:rgba(0,0,0,.58);display:none}
      #ppaSocialShade{z-index:10020}#ppaPartyInviteShade{z-index:10060}
      #ppaSocialShade.on,#ppaPartyInviteShade.on{display:block}
      #ppaPlayerCard,#ppaFriendsPanel,#ppaPartyInviteModal{
        position:fixed;left:50%;transform:translate(-50%,-50%);
        border:1px solid rgba(216,157,76,.82);
        background:
          linear-gradient(180deg,rgba(40,26,18,.98),rgba(12,12,15,.99)),
          radial-gradient(circle at 50% 0,rgba(146,83,32,.25),transparent 65%);
        box-shadow:0 0 0 2px rgba(69,38,18,.78),0 18px 48px rgba(0,0,0,.82),inset 0 0 30px rgba(0,0,0,.48);
        color:#e9dcc5;font-family:Georgia,'Times New Roman',serif;display:none;
      }
      #ppaPlayerCard{z-index:10030;top:48%;width:min(88vw,330px);padding:14px;border-radius:10px}
      #ppaFriendsPanel{z-index:10035;top:48%;width:min(92vw,400px);max-height:min(74vh,640px);overflow:auto;padding:12px;border-radius:10px}
      #ppaPartyInviteModal{z-index:10070;top:50%;width:min(88vw,350px);padding:16px;border-radius:12px}
      #ppaPlayerCard.on,#ppaFriendsPanel.on,#ppaPartyInviteModal.on{display:block}
      .ppaSocialName{font-size:18px;font-weight:800;color:#f2d39a;text-align:center;text-shadow:1px 2px 2px #000}
      .ppaSocialClass{margin-top:4px;text-align:center;color:#b9d6e8;font-size:11px}
      .ppaSocialStats{display:flex;justify-content:center;gap:18px;margin:12px 0;padding:9px;border-top:1px solid rgba(191,130,63,.4);border-bottom:1px solid rgba(191,130,63,.4);color:#ffd66f;font:bold 12px monospace}
      .ppaSocialBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ppaSocialBtn,.ppaInviteBtn{
        min-height:42px;border:1px solid #8f673a;border-radius:7px;
        background:linear-gradient(180deg,#3b2b1d,#1d1713);color:#f2dfbd;
        font:bold 10px Georgia,serif;padding:5px;box-shadow:inset 0 1px rgba(255,255,255,.06)
      }
      .ppaSocialBtn.friend{border-color:#6c5e4a;color:#d7e8f0}
      .ppaSocialBtn:disabled{opacity:.48}
      .ppaFriendsHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;border-bottom:1px solid rgba(191,130,63,.35);padding-bottom:8px}
      .ppaFriendsHead b{color:#f0cf93;font-size:15px}.ppaFriendsHead button{width:34px;height:34px;border-radius:7px;border:1px solid #7b5a35;background:#251b14;color:#e9d3ad}
      .ppaSocialSec{margin:10px 0 5px;color:#c99b62;font:bold 9px monospace;letter-spacing:.9px}
      .ppaFriendRow,.ppaPartyRow{display:flex;align-items:center;gap:8px;padding:8px;margin:5px 0;border:1px solid rgba(124,92,55,.42);border-radius:7px;background:rgba(255,225,180,.025)}
      .ppaFriendMain{flex:1;min-width:0}.ppaFriendName{font-weight:700;color:#efd2a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ppaFriendSub{font:9px monospace;color:#a99a87;margin-top:2px}.ppaFriendNear{color:#8fe7aa}.ppaFriendAway{color:#8d8981}
      .ppaFriendOpen,.ppaFriendRemove,.ppaPartyKick{border:1px solid #6c5337;border-radius:6px;background:#211912;color:#d8c6aa;min-width:34px;height:32px}
      .ppaFriendRemove,.ppaPartyKick{color:#ffaaa2;border-color:#73423d;background:#2b1715}
      #ppaPartyLeave{width:100%;margin-top:7px;height:35px;border:1px solid #75454c;border-radius:7px;background:#2b1719;color:#ffc0bd;font:bold 10px Georgia,serif}
      .ppaFriendsTab{height:27px;border:1px solid #655139;border-radius:4px;background:#211914;color:#e1c79f;font:700 7.5px monospace;white-space:nowrap;padding:0 2px}
      .ppaFriendsTab:active{background:#3a291a;border-color:#a77842;color:#fff0cf}

      .ppaInviteTitle{text-align:center;color:#f0cf93;font-size:19px;font-weight:800;text-shadow:1px 2px #000;margin:2px 0 10px}
      .ppaInviteSigil{width:42px;height:42px;margin:0 auto 8px;border:1px solid #9d713f;border-radius:50%;display:grid;place-items:center;color:#ffd47f;background:radial-gradient(circle,#5b3a1d,#1b1410);font-size:20px;box-shadow:0 0 18px rgba(214,139,54,.25)}
      .ppaInviteText{text-align:center;font-size:14px;line-height:1.45;color:#e5d5bd}
      .ppaInviteWho{display:block;margin:7px 0;color:#ffd27c;font-weight:800;font-size:16px}
      .ppaInviteBtns{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:15px}
      .ppaInviteBtn.accept{border-color:#4f8b63;background:linear-gradient(180deg,#244b33,#15261d);color:#c9f3d6}
      .ppaInviteBtn.decline{border-color:#7c4640;background:linear-gradient(180deg,#46231f,#271412);color:#ffc1bb}

      #ppaPartyHud{position:fixed;z-index:4700;left:8px;top:118px;width:150px;display:none;pointer-events:none;font-family:Georgia,'Times New Roman',serif}
      #ppaPartyHud.on{display:block}
      .ppaPartyHudTitle{margin:0 0 4px 2px;color:#e5bd78;font:bold 9px monospace;text-shadow:1px 1px #000;letter-spacing:.7px}
      .ppaPartyHudRow{position:relative;margin:4px 0;padding:6px 7px 7px;border:1px solid rgba(131,92,48,.58);border-radius:7px;background:linear-gradient(90deg,rgba(24,17,13,.91),rgba(10,12,15,.74));box-shadow:0 2px 8px rgba(0,0,0,.45);overflow:hidden}
      .ppaPartyHudTop{display:flex;align-items:center;gap:4px;min-width:0}
      .ppaPartyHudName{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#eed3a5;font-size:10px;font-weight:800;text-shadow:1px 1px #000}
      .ppaPartyCrown{color:#ffd66c;font-size:10px}.ppaPartyYou{color:#8fdba8;font:700 7px monospace}
      .ppaPartyKick{pointer-events:auto;width:24px;min-width:24px;height:22px;padding:0;font-size:12px}
      .ppaPartyHp{height:4px;margin-top:5px;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.07);border-radius:3px;overflow:hidden}
      .ppaPartyHp>i{display:block;height:100%;background:linear-gradient(90deg,#7a2020,#d34e45)}
      .ppaPartyMeta{margin-top:3px;color:#a99b86;font:7.5px monospace}
      @media(max-width:600px){
        #ppaPlayerCard{top:45%}#ppaFriendsPanel{top:45%;max-height:68vh}.ppaFriendsTab{font-size:7px}
        /* Phone: keep the party directly under the top-left PPA/stat values,
           compact enough not to cover the character or combat area. */
        #ppaPartyHud{top:112px;left:5px;width:112px}
        .ppaPartyHudTitle{margin:0 0 2px 1px;font-size:7.5px;letter-spacing:.45px}
        .ppaPartyHudRow{margin:2px 0;padding:3px 4px 4px;border-radius:5px}
        .ppaPartyHudTop{gap:2px}
        .ppaPartyHudName{font-size:7.5px}
        .ppaPartyCrown{font-size:8px}
        .ppaPartyYou{font-size:5.8px}
        .ppaPartyKick{width:18px;min-width:18px;height:18px;font-size:10px;border-radius:4px}
        .ppaPartyHp{height:3px;margin-top:3px}
        .ppaPartyMeta{margin-top:2px;font-size:6px}
      }
    `;document.head.appendChild(st);
  }

  function closeAll(){
    var sh=document.getElementById('ppaSocialShade'),c=document.getElementById('ppaPlayerCard'),p=document.getElementById('ppaFriendsPanel');
    if(sh)sh.classList.remove('on');if(c)c.classList.remove('on');if(p)p.classList.remove('on');current=null;
  }
  function showShade(){var sh=document.getElementById('ppaSocialShade');if(sh)sh.classList.add('on')}
  function hideInvite(){
    var sh=document.getElementById('ppaPartyInviteShade'),m=document.getElementById('ppaPartyInviteModal');
    if(sh)sh.classList.remove('on');if(m)m.classList.remove('on');pendingInvite=null;
  }

  function ensureFriendsTab(){
    var tabs=document.querySelector('#ppaChatBox .ppaChatTabs')||document.querySelector('.ppaChatTabs');if(!tabs)return false;
    tabs.style.gridTemplateColumns='repeat(5,1fr)';
    var b=document.getElementById('ppaFriendsTab');
    if(!b){
      b=document.createElement('button');b.id='ppaFriendsTab';b.type='button';b.className='ppaFriendsTab';b.textContent='ДРУЗЬЯ';
      b.setAttribute('aria-label','Друзья и группа');
      b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openFriends()});
      tabs.appendChild(b);
    }
    return true;
  }

  function ensureUi(){
    installStyle();
    if(!document.getElementById('ppaSocialShade')){var s=document.createElement('div');s.id='ppaSocialShade';document.body.appendChild(s);s.addEventListener('pointerdown',closeAll)}
    if(!document.getElementById('ppaPlayerCard')){
      var c=document.createElement('div');c.id='ppaPlayerCard';
      c.innerHTML='<div class="ppaSocialName" id="ppaSocialName">Игрок</div><div class="ppaSocialClass" id="ppaSocialClass">ГЕРОЙ</div><div class="ppaSocialStats"><span id="ppaSocialLevel">УР. 1</span><span id="ppaSocialBm">⚔ БМ 0</span></div><div class="ppaSocialBtns"><button class="ppaSocialBtn" id="ppaInviteParty">ПРИГЛАСИТЬ В ГРУППУ</button><button class="ppaSocialBtn friend" id="ppaAddFriend">ДОБАВИТЬ В ДРУЗЬЯ</button></div>';
      document.body.appendChild(c);c.addEventListener('pointerdown',function(e){e.stopPropagation()});
      document.getElementById('ppaInviteParty').addEventListener('click',inviteCurrent);
      document.getElementById('ppaAddFriend').addEventListener('click',addCurrentFriend);
    }
    if(!document.getElementById('ppaFriendsPanel')){
      var p=document.createElement('div');p.id='ppaFriendsPanel';
      p.innerHTML='<div class="ppaFriendsHead"><b>⚔ ДРУЗЬЯ И ГРУППА</b><button id="ppaFriendsClose" type="button">✕</button></div><div id="ppaFriendsBody">Загрузка…</div>';
      document.body.appendChild(p);p.addEventListener('pointerdown',function(e){e.stopPropagation()});
      document.getElementById('ppaFriendsClose').addEventListener('click',closeAll);
    }
    if(!document.getElementById('ppaPartyInviteShade')){
      var is=document.createElement('div');is.id='ppaPartyInviteShade';document.body.appendChild(is);
      is.addEventListener('pointerdown',function(){answerInvite(false)});
    }
    if(!document.getElementById('ppaPartyInviteModal')){
      var im=document.createElement('div');im.id='ppaPartyInviteModal';
      im.innerHTML='<div class="ppaInviteSigil">⚔</div><div class="ppaInviteTitle">ПРИГЛАШЕНИЕ В ГРУППУ</div><div class="ppaInviteText"><span class="ppaInviteWho" id="ppaInviteWho">Игрок</span><span id="ppaInviteStats">УР. 1 · БМ 0</span><br>приглашает тебя присоединиться к группе.</div><div class="ppaInviteBtns"><button id="ppaInviteDecline" class="ppaInviteBtn decline" type="button">ОТКЛОНИТЬ</button><button id="ppaInviteAccept" class="ppaInviteBtn accept" type="button">ПРИНЯТЬ</button></div>';
      document.body.appendChild(im);im.addEventListener('pointerdown',function(e){e.stopPropagation()});
      document.getElementById('ppaInviteDecline').addEventListener('click',function(){answerInvite(false)});
      document.getElementById('ppaInviteAccept').addEventListener('click',function(){answerInvite(true)});
    }
    if(!document.getElementById('ppaPartyHud')){
      var ph=document.createElement('div');ph.id='ppaPartyHud';document.body.appendChild(ph);
    }
    ensureFriendsTab();
  }

  function remoteId(r,key){return String((r&&(r.id||r.i||r.__ppaPid))||key||'')}
  function openPlayer(r){
    if(!r)return;ensureUi();current=r;showShade();
    var card=document.getElementById('ppaPlayerCard');if(!card)return;card.classList.add('on');
    document.getElementById('ppaSocialName').textContent=String(r.name||r.n||'Игрок');
    document.getElementById('ppaSocialClass').textContent=String(r.cls||r.classKey||r.c||'ГЕРОЙ');
    document.getElementById('ppaSocialLevel').textContent='УР. '+Math.max(1,Math.floor(Number(r.level||r.l)||1));
    document.getElementById('ppaSocialBm').textContent='⚔ БМ '+Math.max(0,Math.round(Number(r.bm||r.b)||0));
    var id=remoteId(r,''),fb=document.getElementById('ppaAddFriend');
    if(friends.has(id)){fb.textContent='✓ УЖЕ В ДРУЗЬЯХ';fb.disabled=true}else{fb.textContent='ДОБАВИТЬ В ДРУЗЬЯ';fb.disabled=!id}
    var pb=document.getElementById('ppaInviteParty');pb.disabled=!window.PPA_RT_SEND||!id;pb.textContent='ПРИГЛАСИТЬ В ГРУППУ';
  }

  async function loadFriends(){
    try{var r=await api('/api/social/list');friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});renderFriends();return r}
    catch(e){var b=document.getElementById('ppaFriendsBody');if(b)b.textContent='Не удалось загрузить друзей: '+e.message;return null}
  }
  async function addCurrentFriend(){
    if(!current)return;var id=remoteId(current,'');if(!id)return;
    var btn=document.getElementById('ppaAddFriend');if(btn)btn.disabled=true;
    try{var r=await api('/api/social/add',{friendId:id});friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});note(r.message||'Игрок добавлен в друзья');if(btn){btn.textContent='✓ УЖЕ В ДРУЗЬЯХ';btn.disabled=true}}
    catch(e){note(e.message,false);if(btn)btn.disabled=false}
  }
  async function removeFriend(id){
    try{var r=await api('/api/social/remove',{friendId:id});friends.clear();(r.friends||[]).forEach(function(x){friends.set(String(x.id),x)});renderFriends()}
    catch(e){note(e.message,false)}
  }
  function inviteCurrent(){
    if(!current||!window.PPA_RT_SEND)return;var id=remoteId(current,'');if(!id)return;
    if(window.PPA_RT_SEND({type:'party-invite',target:id})){note('Приглашение в группу отправлено');closeAll()}else note('ONLINE переподключается',false)
  }
  function kickMember(id){
    id=String(id||'');if(!id||!window.PPA_RT_SEND)return;
    window.PPA_RT_SEND({type:'party-kick',target:id});
  }

  function partyLeaderId(){
    var id=String((party&&party.leaderId)||'');
    if(id)return id;
    var m=party&&Array.isArray(party.members)?party.members:[];
    var lead=m.find(function(x){return x&&x.leader});
    return String((lead&&lead.id)||(m[0]&&m[0].id)||'');
  }

  function memberVitals(m){
    var id=String((m&&m.id)||''),sid=selfId(),hp=Number(m&&m.hp),mhp=Number(m&&m.mhp);
    try{
      if(id&&id===sid&&typeof P!=='undefined'&&P){hp=Number(P.hp);mhp=Number(P.mhp)}
      else{
        var r=nearby(id);
        if(r){if(Number.isFinite(Number(r.hp)))hp=Number(r.hp);if(Number.isFinite(Number(r.mhp)))mhp=Number(r.mhp)}
      }
    }catch(_){}
    if(!Number.isFinite(hp))hp=0;if(!Number.isFinite(mhp)||mhp<=0)mhp=1;
    return{hp:Math.max(0,hp),mhp:Math.max(1,mhp)};
  }

  function renderPartyHud(){
    var hud=document.getElementById('ppaPartyHud');if(!hud)return;
    var members=party&&Array.isArray(party.members)?party.members:[];
    if(!party||!party.partyId||members.length<2){hud.classList.remove('on');hud.innerHTML='';return}
    var sid=selfId(),leader=partyLeaderId(),canKick=sid&&sid===leader;
    var h='<div class="ppaPartyHudTitle">ГРУППА '+members.length+'</div>';
    members.forEach(function(m){
      if(!m)return;
      var id=String(m.id||''),v=memberVitals(m),pct=Math.max(0,Math.min(100,Math.round(v.hp/v.mhp*100)));
      var near=!!nearby(id)||id===sid;
      h+='<div class="ppaPartyHudRow"><div class="ppaPartyHudTop">'+(id===leader?'<span class="ppaPartyCrown">♛</span>':'')+
        '<span class="ppaPartyHudName">'+esc(m.name||'Игрок')+'</span>'+(id===sid?'<span class="ppaPartyYou">ТЫ</span>':'')+
        (canKick&&id!==sid?'<button class="ppaPartyKick" data-hud-kick="'+esc(id)+'" type="button">×</button>':'')+
        '</div><div class="ppaPartyHp"><i style="width:'+pct+'%"></i></div><div class="ppaPartyMeta">УР. '+Math.max(1,Number(m.level)||1)+' · '+Math.round(v.hp)+'/'+Math.round(v.mhp)+(near?'':' · ДАЛЕКО')+'</div></div>';
    });
    hud.innerHTML=h;hud.classList.add('on');
    hud.querySelectorAll('[data-hud-kick]').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();kickMember(b.dataset.hudKick)})});
  }

  function renderFriends(){
    var body=document.getElementById('ppaFriendsBody');if(!body)return;
    var pm=Array.isArray(party&&party.members)?party.members:[],sid=selfId(),leader=partyLeaderId(),canKick=sid&&sid===leader;
    var h='<div class="ppaSocialSec">ГРУППА</div>';
    if(pm.length){
      pm.forEach(function(x){
        var id=String(x.id||'');
        h+='<div class="ppaPartyRow"><div class="ppaFriendMain"><div class="ppaFriendName">'+(id===leader?'♛ ':'')+esc(x.name||'Игрок')+(id===sid?' · ТЫ':'')+'</div><div class="ppaFriendSub">УР. '+Math.max(1,Number(x.level)||1)+' · БМ '+Math.max(0,Number(x.bm)||0)+'</div></div>'+
          (canKick&&id!==sid?'<button class="ppaPartyKick" data-kick="'+esc(id)+'" type="button">×</button>':'')+'</div>';
      });
      h+='<button id="ppaPartyLeave">ПОКИНУТЬ ГРУППУ</button>';
    }else h+='<div class="ppaFriendSub" style="padding:7px">Группы пока нет. Тапни другого игрока → «Пригласить в группу».</div>';
    h+='<div class="ppaSocialSec">ДРУЗЬЯ</div>';
    if(!friends.size)h+='<div class="ppaFriendSub" style="padding:7px">Список пуст. Добавляй игроков тапом по персонажу.</div>';
    friends.forEach(function(f,id){
      var r=nearby(id),sub=r?('<span class="ppaFriendNear">● РЯДОМ</span> · УР. '+Math.max(1,Number(r.level)||1)+' · БМ '+Math.max(0,Number(r.bm)||0)):'<span class="ppaFriendAway">○ НЕ В ЭТОЙ ЛОКАЦИИ</span>';
      h+='<div class="ppaFriendRow"><div class="ppaFriendMain"><div class="ppaFriendName">'+esc(f.name||'Игрок')+'</div><div class="ppaFriendSub">'+sub+'</div></div>'+(r?'<button class="ppaFriendOpen" data-open="'+esc(id)+'" type="button">👤</button>':'')+'<button class="ppaFriendRemove" data-remove="'+esc(id)+'" type="button">×</button></div>';
    });
    body.innerHTML=h;
    var leave=document.getElementById('ppaPartyLeave');if(leave)leave.onclick=function(){if(window.PPA_RT_SEND)window.PPA_RT_SEND({type:'party-leave'})};
    body.querySelectorAll('[data-open]').forEach(function(b){b.onclick=function(){var r=nearby(b.dataset.open);if(r){document.getElementById('ppaFriendsPanel').classList.remove('on');openPlayer(r)}}});
    body.querySelectorAll('[data-remove]').forEach(function(b){b.onclick=function(){removeFriend(b.dataset.remove)}});
    body.querySelectorAll('[data-kick]').forEach(function(b){b.onclick=function(){kickMember(b.dataset.kick)}});
    renderPartyHud();
  }

  function openFriends(){ensureUi();showShade();var p=document.getElementById('ppaFriendsPanel');if(!p)return;p.classList.add('on');renderFriends();loadFriends()}

  function showInvite(from){
    ensureUi();pendingInvite=from||{};
    var name=String((from&&from.name)||'Игрок'),lv=Math.max(1,Number(from&&from.level)||1),bm=Math.max(0,Number(from&&from.bm)||0);
    document.getElementById('ppaInviteWho').textContent=name;
    document.getElementById('ppaInviteStats').textContent='УР. '+lv+' · БМ '+bm;
    document.getElementById('ppaPartyInviteShade').classList.add('on');
    document.getElementById('ppaPartyInviteModal').classList.add('on');
  }
  function answerInvite(ok){
    var f=pendingInvite;hideInvite();
    if(f&&window.PPA_RT_SEND)window.PPA_RT_SEND({type:ok?'party-accept':'party-decline',from:String(f.id||'')});
  }

  function canvasInfo(){
    var c=document.getElementById('c');if(!c)return null;
    var r=c.getBoundingClientRect();if(!r.width||!r.height)return null;
    var z=1;try{z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1)}catch(_){}
    return{c:c,r:r,z:z,kx:r.width/Math.max(1,c.width),ky:r.height/Math.max(1,c.height)};
  }

  function findRemoteAt(clientX,clientY){
    var o=online(),info=canvasInfo();if(!o||!o.remotes||!info)return null;
    var best=null,bd=1e9,now=Date.now();
    o.remotes.forEach(function(r,key){
      if(!r||!remoteId(r,key))return;
      var cx=Number(r.__ppaClientX),cy=Number(r.__ppaClientY),ca=Number(r.__ppaClientAt),rad=Number(r.__ppaClientRadius);
      if(Number.isFinite(cx)&&Number.isFinite(cy)&&(!Number.isFinite(ca)||now-ca<1600)){
        var d=Math.hypot(clientX-cx,clientY-cy),rr=Math.max(42,Math.min(90,Number.isFinite(rad)?rad:58));
        if(d<=rr&&d<bd){bd=d;best=r}return;
      }
      var hx=Number(r.__ppaHitX),hy=Number(r.__ppaHitY),hb=Number(r.__ppaHitBody);
      if(Number.isFinite(hx)&&Number.isFinite(hy)){
        var x=info.r.left+hx*info.z*info.kx,y=info.r.top+hy*info.z*info.ky;
        var rr2=Math.max(42,Math.min(90,Math.max(30,Number.isFinite(hb)?hb:32)*info.z*Math.max(info.kx,info.ky)*1.7));
        var d2=Math.hypot(clientX-x,clientY-y);if(d2<=rr2&&d2<bd){bd=d2;best=r}
      }
    });
    return best;
  }

  function armCanvasTap(){
    var c=document.getElementById('c');if(!c||c.dataset.ppaSocialTapV5==='1')return false;
    c.dataset.ppaSocialTapV5='1';

    var press=null,timer=0;
    function clearPress(){
      if(timer){clearTimeout(timer);timer=0}
      press=null;
    }
    function inviteRemote(r){
      if(!r||!window.PPA_RT_SEND)return false;
      var id=remoteId(r,'');if(!id)return false;
      if(window.PPA_RT_SEND({type:'party-invite',target:id})){
        note('Приглашение в группу отправлено');
        return true;
      }
      note('ONLINE переподключается',false);
      return false;
    }

    c.addEventListener('pointerdown',function(e){
      if(e.button!=null&&e.button!==0)return;
      var r=findRemoteAt(e.clientX,e.clientY);if(!r)return;
      e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
      clearPress();
      press={id:e.pointerId,x:e.clientX,y:e.clientY,r:r,long:false};
      try{c.setPointerCapture(e.pointerId)}catch(_){}
      timer=setTimeout(function(){
        if(!press||press.id!==e.pointerId)return;
        press.long=true;
        inviteRemote(press.r);
        try{if(navigator.vibrate)navigator.vibrate(35)}catch(_){}
      },1000);
    },true);

    c.addEventListener('pointermove',function(e){
      if(!press||press.id!==e.pointerId)return;
      if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>14)clearPress();
    },true);

    c.addEventListener('pointerup',function(e){
      if(!press||press.id!==e.pointerId)return;
      e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
      var p=press;var wasLong=!!p.long;clearPress();
      try{if(c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId)}catch(_){}
      if(wasLong)return;
      if(window.PPA_WORLD_PLAYER_SELECT){
        window.PPA_WORLD_PLAYER_SELECT(p.r);
      }else{
        openPlayer(p.r);
      }
    },true);

    c.addEventListener('pointercancel',function(e){
      if(press&&press.id===e.pointerId)clearPress();
    },true);
    c.addEventListener('lostpointercapture',function(e){
      if(press&&press.id===e.pointerId)clearPress();
    },true);
    return true;
  }

  window.PPA_SOCIAL_ON_PARTY_INVITE=showInvite;
  window.PPA_SOCIAL_ON_PARTY_STATE=function(st){party=st||{partyId:'',leaderId:'',members:[]};renderFriends();renderPartyHud()};
  window.PPA_SOCIAL_NOTICE=function(text,ok){note(text,ok)};
  window.PPA_SOCIAL_OPEN_FRIENDS=openFriends;
  window.PPA_SOCIAL_OPEN_PLAYER=openPlayer;

  function boot(){
    if(booted)return;booted=true;ensureUi();armCanvasTap();loadFriends();renderPartyHud();
    setInterval(function(){ensureFriendsTab();armCanvasTap();renderPartyHud()},500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
