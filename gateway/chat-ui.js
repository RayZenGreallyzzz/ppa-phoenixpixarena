(function(){
  'use strict';

  var CHANNELS=['general','clan','party','private'];
  var LABELS={general:'ОБЩИЙ',clan:'КЛАН',party:'ГРУППА',private:'ЛС'};
  var MAX_PER_CHANNEL=80;
  var STORE='ppaChatV2History';
  var TARGET_STORE='ppaChatV2PrivateTarget';
  var state={channel:'general',collapsed:true,unread:{general:0,clan:0,party:0,private:0},history:{general:[],clan:[],party:[],private:[]},target:''};
  var root=null,box=null,nativeInput=null,msgs=null,targetRow=null,targetInput=null,collapseBtn=null,launcher=null,sendBtn=null;
  var typing=false;

  function escText(v){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180)}
  function selfName(){
    try{if(window.P&&P.name)return String(P.name).slice(0,24)}catch(_){}
    try{var n=localStorage.getItem('ppaPlayerNameV205');if(n)return String(n).slice(0,24)}catch(_){}
    try{var t=window.Telegram&&Telegram.WebApp&&Telegram.WebApp.initDataUnsafe&&Telegram.WebApp.initDataUnsafe.user;if(t)return String(t.first_name||t.username||'Ты').slice(0,24)}catch(_){}
    return 'Ты';
  }
  function nowTime(ts){
    try{return new Date(Number(ts)||Date.now()).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch(_){return ''}
  }
  function load(){
    try{
      var raw=JSON.parse(localStorage.getItem(STORE)||'{}');
      CHANNELS.forEach(function(ch){if(Array.isArray(raw[ch]))state.history[ch]=raw[ch].slice(-MAX_PER_CHANNEL)});
    }catch(_){}
    try{state.target=String(localStorage.getItem(TARGET_STORE)||'').slice(0,24)}catch(_){}
  }
  function save(){
    try{localStorage.setItem(STORE,JSON.stringify(state.history))}catch(_){}
    try{localStorage.setItem(TARGET_STORE,state.target||'')}catch(_){}
  }
  function add(channel,from,text,meta){
    channel=CHANNELS.indexOf(channel)>=0?channel:'general';
    var rec={from:String(from||'Игрок').slice(0,24),text:escText(text),ts:Date.now(),system:!!(meta&&meta.system),self:!!(meta&&meta.self),target:String(meta&&meta.target||'').slice(0,24)};
    if(!rec.text)return;
    state.history[channel].push(rec);
    if(state.history[channel].length>MAX_PER_CHANNEL)state.history[channel]=state.history[channel].slice(-MAX_PER_CHANNEL);
    if(state.collapsed||state.channel!==channel)state.unread[channel]=Math.min(99,(Number(state.unread[channel])||0)+1);
    save();renderMessages();renderUnread();
  }
  function totalUnread(){return CHANNELS.reduce(function(n,ch){return n+(Number(state.unread[ch])||0)},0)}
  function renderUnread(){
    if(launcher){
      var n=totalUnread();launcher.textContent=n?'💬 ЧАТ · '+n:'💬 ЧАТ';
      launcher.classList.toggle('hasUnread',n>0);
    }
    if(!box)return;
    box.querySelectorAll('[data-chat-channel]').forEach(function(b){
      var ch=b.getAttribute('data-chat-channel'),n=Number(state.unread[ch])||0;
      b.textContent=LABELS[ch]+(n?' · '+n:'');
      b.classList.toggle('active',state.channel===ch);
    });
  }
  function renderMessages(){
    if(!msgs)return;
    msgs.textContent='';
    var arr=state.history[state.channel]||[];
    arr.forEach(function(r){
      var row=document.createElement('div');row.className='ppaChatMsg'+(r.system?' system':'')+(r.self?' self':'');
      var head=document.createElement('div');head.className='ppaChatMsgHead';
      var who=document.createElement('span');who.className='ppaChatWho';who.textContent=r.system?'СИСТЕМА':r.from;
      var time=document.createElement('span');time.className='ppaChatTime';time.textContent=nowTime(r.ts);
      head.appendChild(who);head.appendChild(time);
      var body=document.createElement('div');body.className='ppaChatText';
      if(state.channel==='private'&&r.target&&r.self){
        var to=document.createElement('span');to.className='ppaChatTo';to.textContent='→ '+r.target+' ';
        body.appendChild(to);
      }
      body.appendChild(document.createTextNode(r.text));
      row.appendChild(head);row.appendChild(body);msgs.appendChild(row);
    });
    msgs.scrollTop=msgs.scrollHeight;
  }
  function setChannel(ch){
    if(CHANNELS.indexOf(ch)<0)return;
    state.channel=ch;state.unread[ch]=0;
    if(targetRow)targetRow.classList.toggle('show',ch==='private');
    if(targetInput&&ch==='private')targetInput.value=state.target||'';
    renderUnread();renderMessages();
  }
  function setCollapsed(v){
    state.collapsed=!!v;
    if(box)box.classList.toggle('collapsed',state.collapsed);
    if(launcher)launcher.classList.toggle('hidden',!state.collapsed);
    if(!state.collapsed){
      state.unread[state.channel]=0;
      renderUnread();
      setTimeout(function(){if(msgs)msgs.scrollTop=msgs.scrollHeight},0);
    }else{
      try{if(document.activeElement===nativeInput||document.activeElement===targetInput)document.activeElement.blur()}catch(_){}
    }
  }
  function dispatchSend(){
    if(!nativeInput)return;
    var text=escText(nativeInput.value).trim();
    if(!text)return;
    var target=state.channel==='private'?String(state.target||'').trim():'';
    if(state.channel==='private'&&!target){
      add('private','Система','Укажи ник игрока для личного сообщения.',{system:true});
      if(targetInput)targetInput.focus();
      return;
    }
    var detail={channel:state.channel,target:target,text:text};
    window.dispatchEvent(new CustomEvent('ppa-chat-send',{detail:detail}));
    add(state.channel,selfName(),text,{self:true,target:target});
    nativeInput.value='';
    nativeInput.dispatchEvent(new Event('input',{bubbles:true}));
    try{nativeInput.focus({preventScroll:true})}catch(_){try{nativeInput.focus()}catch(__){}}
  }
  function syncKeyboardOffset(){
    if(!root)return;
    if(!typing){
      root.style.removeProperty('top');
      root.style.removeProperty('bottom');
      root.style.setProperty('--ppa-chat-kb','0px');
      return;
    }
    try{
      var vv=window.visualViewport;
      var viewTop=vv?Math.max(0,Number(vv.offsetTop)||0):0;
      var viewH=vv?Math.max(120,Number(vv.height)||0):Math.max(120,Number(window.innerHeight)||0);
      var boxH=box?Math.max(120,Math.ceil(box.getBoundingClientRect().height||0)):228;
      var y=Math.max(viewTop+6,viewTop+viewH-boxH-8);
      root.style.setProperty('top',Math.round(y)+'px','important');
      root.style.setProperty('bottom','auto','important');
      root.style.setProperty('--ppa-chat-kb','0px');
    }catch(_){}
  }
  function repinTypingChat(){
    syncKeyboardOffset();
    [70,160,280,450].forEach(function(ms){setTimeout(function(){if(typing)syncKeyboardOffset()},ms)});
  }
  function menuVisible(){
    var open=['#gramWalletPanel.open','#eventsPanel.open','#premiumPanel.open'];
    for(var i=0;i<open.length;i++){try{if(document.querySelector(open[i]))return true}catch(_){}}
    var frames=['#blacksmithFrame','#auctionFrame','#blackmarketFrame'];
    for(var j=0;j<frames.length;j++){
      var el=null;try{el=document.querySelector(frames[j])}catch(_){}
      if(!el)continue;
      var s=String(el.getAttribute('style')||'').replace(/\s+/g,'').toLowerCase();
      if(s.indexOf('display:block')>=0)return true;
    }
    return false;
  }
  function syncSuppressed(){
    if(!root)return;
    var hide=menuVisible();
    root.classList.toggle('suppressed',hide);
    if(hide){
      try{if(document.activeElement===nativeInput||document.activeElement===targetInput)document.activeElement.blur()}catch(_){}
    }
  }
  function installStyle(){
    if(document.getElementById('ppaChatV2Style'))return;
    var st=document.createElement('style');st.id='ppaChatV2Style';st.textContent=`
      #ppaChatRoot.ppaChatV2Root{
        position:fixed!important;left:8px!important;right:auto!important;top:auto!important;bottom:178px!important;
        width:min(370px,calc(100vw - 16px))!important;max-width:calc(100vw - 16px)!important;
        z-index:39!important;transform:none!important;pointer-events:auto!important;display:block!important;
        --ppa-chat-kb:0px;font-family:Arial,sans-serif
      }
      #ppaChatRoot.ppaChatV2Root.nativeTyping{bottom:auto!important}
      #ppaChatRoot.ppaChatV2Root.suppressed{display:none!important}
      #ppaChatRoot.ppaChatV2Root > :not(#ppaChatBoxV2):not(#ppaChatNativeInput):not(#ppaChatLauncher){display:none!important}
      #ppaChatBox{display:none!important;visibility:hidden!important;pointer-events:none!important}
      #ppaChatBoxV2{
        width:100%;height:238px;box-sizing:border-box;border:1px solid rgba(174,112,50,.72);border-radius:8px;
        background:rgba(10,7,6,.78);box-shadow:0 6px 24px rgba(0,0,0,.48),inset 0 0 20px rgba(94,45,14,.12);
        backdrop-filter:blur(3px);overflow:hidden;display:flex;flex-direction:column;color:#eadbc4
      }
      #ppaChatBoxV2.collapsed{display:none}
      #ppaChatLauncher{
        min-width:116px;height:29px;padding:0 10px;border-radius:7px;border:1px solid rgba(155,100,47,.75);
        background:rgba(18,12,9,.78);color:#e7c99d;font:bold 10px monospace;box-shadow:0 3px 12px rgba(0,0,0,.42)
      }
      #ppaChatLauncher.hidden{display:none}
      #ppaChatLauncher.hasUnread{color:#fff0ae;border-color:#c58b44;box-shadow:0 0 10px rgba(219,133,49,.32)}
      #ppaChatBoxV2 .ppaChatTop{display:flex;align-items:center;gap:6px;padding:5px 6px 4px;border-bottom:1px solid rgba(142,90,43,.45)}
      #ppaChatBoxV2 .ppaChatTitle{font:bold 10px Georgia,serif;color:#e8c98f;letter-spacing:.5px;flex:1}
      #ppaChatMin{width:28px;height:24px;border:1px solid #69492f;border-radius:5px;background:#241710;color:#e7c89e;font:bold 15px Arial}
      #ppaChatBoxV2 .ppaChatTabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;padding:4px 5px}
      #ppaChatBoxV2 .ppaChatTab,#ppaChatBoxV2 .ppaFriendsTab{
        min-width:0;height:26px;padding:0 2px;border:1px solid #5f4934;border-radius:4px;background:#1b1410;color:#bca98e;
        font:700 7.5px monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis
      }
      #ppaChatBoxV2 .ppaChatTab.active{border-color:#a56f36;background:#352217;color:#ffdda5}
      #ppaChatPrivateTargetRow{display:none;align-items:center;gap:5px;padding:0 5px 4px}
      #ppaChatPrivateTargetRow.show{display:flex}
      #ppaChatPrivateTargetRow span{font:700 8px monospace;color:#bba88e}
      #ppaChatPrivateTarget{flex:1;height:27px;min-width:0;box-sizing:border-box;border:1px solid #66503a;border-radius:5px;background:#0d0a08;color:#f1ddbd;padding:0 7px;font-size:12px;outline:none}
      #ppaChatMessages{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:3px 6px 5px;scrollbar-width:thin}
      .ppaChatMsg{padding:3px 2px;border-bottom:1px solid rgba(255,255,255,.035)}
      .ppaChatMsgHead{display:flex;gap:6px;align-items:baseline}
      .ppaChatWho{font:bold 9px monospace;color:#f2c985;max-width:72%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ppaChatTime{margin-left:auto;font:7px monospace;color:#726a62}
      .ppaChatText{font:10px/1.28 Arial,sans-serif;color:#e2d8c9;overflow-wrap:anywhere}
      .ppaChatMsg.self .ppaChatWho{color:#8ed6ff}.ppaChatMsg.system .ppaChatWho,.ppaChatMsg.system .ppaChatText{color:#ffcf7d}
      .ppaChatTo{color:#9ebfd1;font:700 8px monospace}
      #ppaChatComposer{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:5px;padding:5px;border-top:1px solid rgba(142,90,43,.45)}
      #ppaChatRoot.ppaChatV2Root #ppaChatNativeInput{
        position:static!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transform:none!important;
        opacity:1!important;width:100%!important;height:31px!important;min-width:0!important;min-height:31px!important;
        margin:0!important;padding:0 8px!important;box-sizing:border-box!important;border:1px solid #6f5337!important;border-radius:5px!important;
        background:#0c0907!important;color:#efe0c8!important;caret-color:#ffd18d!important;font:12px/31px Arial,sans-serif!important;outline:none!important;overflow:visible!important;
        pointer-events:auto!important;touch-action:manipulation!important;user-select:text!important;-webkit-user-select:text!important
      }
      #ppaChatSend{height:31px;border:1px solid #885f32;border-radius:5px;background:linear-gradient(#4b301c,#24170f);color:#ffe0ad;font:bold 9px Georgia,serif}
      @media (max-width:600px){
        #ppaChatRoot.ppaChatV2Root{
          width:min(330px,calc(100vw - 18px))!important;
          left:9px!important;
          bottom:178px!important;
        }
        #ppaChatRoot.ppaChatV2Root.nativeTyping{
          left:7px!important;
          width:min(355px,calc(100vw - 14px))!important;
          bottom:auto!important;
        }
        #ppaChatBoxV2{height:176px}
        #ppaChatBoxV2 .ppaChatTabs{gap:2px;padding:3px 4px}
        #ppaChatBoxV2 .ppaChatTab,#ppaChatBoxV2 .ppaFriendsTab{height:23px;font-size:6.7px}
        #ppaChatBoxV2 .ppaChatTop{padding:4px 5px 3px}
        #ppaChatComposer{padding:4px}
        #ppaChatRoot.ppaChatV2Root #ppaChatNativeInput{height:29px!important;min-height:29px!important;font-size:12px!important;line-height:29px!important}
        #ppaChatSend{height:29px}
      }
    `;document.head.appendChild(st);
  }
  function ensure(){
    if(document.getElementById('ppaChatBoxV2'))return true;
    installStyle();load();
    root=document.getElementById('ppaChatRoot');
    if(!root){root=document.createElement('div');root.id='ppaChatRoot';document.body.appendChild(root)}
    root.classList.add('ppaChatV2Root');
    root.style.setProperty('display','block','important');
    root.style.setProperty('visibility','visible','important');
    root.style.setProperty('pointer-events','auto','important');

    var oldInput=document.getElementById('ppaChatNativeInput');
    if(oldInput&&oldInput.parentNode){try{oldInput.parentNode.removeChild(oldInput)}catch(_){}}
    nativeInput=document.createElement('input');
    nativeInput.id='ppaChatNativeInput';
    nativeInput.type='text';
    nativeInput.maxLength=180;
    nativeInput.autocomplete='off';
    nativeInput.spellcheck=false;
    nativeInput.disabled=false;
    nativeInput.readOnly=false;
    nativeInput.tabIndex=0;
    nativeInput.setAttribute('enterkeyhint','send');
    nativeInput.setAttribute('inputmode','text');
    nativeInput.setAttribute('autocapitalize','sentences');
    nativeInput.placeholder='Сообщение…';
    root.appendChild(nativeInput);

    box=document.createElement('div');box.id='ppaChatBoxV2';box.className='collapsed';
    box.innerHTML='<div class="ppaChatTop"><div class="ppaChatTitle">💬 PPA CHAT</div><button id="ppaChatMin" type="button">—</button></div>'+
      '<div class="ppaChatTabs">'+
      '<button class="ppaChatTab active" data-chat-channel="general" type="button">ОБЩИЙ</button>'+
      '<button class="ppaChatTab" data-chat-channel="clan" type="button">КЛАН</button>'+
      '<button class="ppaChatTab" data-chat-channel="party" type="button">ГРУППА</button>'+
      '<button class="ppaChatTab" data-chat-channel="private" type="button">ЛС</button>'+
      '</div>'+
      '<div id="ppaChatPrivateTargetRow"><span>КОМУ:</span><input id="ppaChatPrivateTarget" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Ник игрока"></div>'+
      '<div id="ppaChatMessages"></div>'+
      '<div id="ppaChatComposer"><div id="ppaChatInputSlot"></div><button id="ppaChatSend" type="button">ОТПР.</button></div>';
    root.appendChild(box);

    launcher=document.createElement('button');launcher.id='ppaChatLauncher';launcher.type='button';launcher.textContent='💬 ЧАТ';root.appendChild(launcher);

    var slot=box.querySelector('#ppaChatInputSlot');slot.appendChild(nativeInput);
    msgs=box.querySelector('#ppaChatMessages');targetRow=box.querySelector('#ppaChatPrivateTargetRow');targetInput=box.querySelector('#ppaChatPrivateTarget');
    collapseBtn=box.querySelector('#ppaChatMin');sendBtn=box.querySelector('#ppaChatSend');
    targetInput.value=state.target||'';

    box.querySelectorAll('[data-chat-channel]').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();setChannel(b.getAttribute('data-chat-channel'))})});
    launcher.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();setCollapsed(false)});
    collapseBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();setCollapsed(true)});
    sendBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();dispatchSend()});

    nativeInput.addEventListener('pointerdown',function(e){
      try{e.stopPropagation()}catch(_){}
      try{nativeInput.focus({preventScroll:true})}catch(_){try{nativeInput.focus()}catch(__){}}
    });
    nativeInput.addEventListener('touchstart',function(e){
      try{e.stopPropagation()}catch(_){}
    },{passive:true});
    nativeInput.addEventListener('click',function(e){
      try{e.stopPropagation()}catch(_){}
      try{nativeInput.focus({preventScroll:true})}catch(_){try{nativeInput.focus()}catch(__){}}
    });
    nativeInput.addEventListener('focus',function(){typing=true;root.classList.add('nativeTyping');repinTypingChat()});
    nativeInput.addEventListener('blur',function(){typing=false;root.classList.remove('nativeTyping');syncKeyboardOffset()});
    nativeInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();dispatchSend()}});
    targetInput.addEventListener('focus',function(){typing=true;root.classList.add('nativeTyping');repinTypingChat()});
    targetInput.addEventListener('blur',function(){typing=false;root.classList.remove('nativeTyping');syncKeyboardOffset()});
    targetInput.addEventListener('input',function(){state.target=escText(targetInput.value).slice(0,24);save()});
    targetInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();try{nativeInput.focus({preventScroll:true})}catch(_){nativeInput.focus()}}});

    ['pointerdown','touchstart','click'].forEach(function(type){root.addEventListener(type,function(e){e.stopPropagation()},false)});

    if(window.visualViewport){
      window.visualViewport.addEventListener('resize',syncKeyboardOffset,{passive:true});
      window.visualViewport.addEventListener('scroll',syncKeyboardOffset,{passive:true});
    }
    window.addEventListener('resize',syncKeyboardOffset,{passive:true});

    window.PPA_CHAT_RECEIVE=function(channel,from,text,meta){add(channel,from,text,meta||{})};
    window.PPA_CHAT_OPEN=function(channel){setCollapsed(false);if(channel)setChannel(channel);return true};
    window.PPA_CHAT_MINIMIZE=function(){setCollapsed(true);return true};
    window.PPA_CHAT_PRIVATE_TO=function(name){
      state.target=String(name||'').trim().slice(0,24);save();
      if(targetInput)targetInput.value=state.target;
      setCollapsed(false);setChannel('private');
      setTimeout(function(){try{nativeInput.focus({preventScroll:true})}catch(_){try{nativeInput.focus()}catch(__){}}},30);
      return true;
    };

    renderUnread();renderMessages();syncSuppressed();
    setInterval(syncSuppressed,250);
    return true;
  }

  function boot(){
    if(ensure())return;
    setTimeout(boot,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  setTimeout(boot,500);
})();