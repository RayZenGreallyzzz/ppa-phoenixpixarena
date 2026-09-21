(function(){
  'use strict';

  var kbOpen=false,fullW=0,fullH=0,gameResizeFn=null,frozen=[];
  var freezeSelectors=[
    '#joy','#btns','#combatConsumables','#timedBuffHud',
    '#eventsSideTab','#premiumSideTab','#gramWalletSideTab',
    '#locName','#pvpCountdown'
  ];

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function mobile(){try{return innerWidth<=900||matchMedia('(pointer:coarse)').matches}catch(_){return false}}

  function topInset(){
    var t=tg(),n=0;
    /* In Telegram Fullsize the native title bar is already OUTSIDE the web
       viewport. Re-applying Telegram's safe-area top here created a second
       empty strip and pushed HP/MP/PPA/level/BM too far down in dungeons. */
    try{
      if(t&&t.isExpanded&&!t.isFullscreen)return 6;
    }catch(_){}
    try{n=Math.max(n,Number(t&&t.contentSafeAreaInset&&t.contentSafeAreaInset.top)||0)}catch(_){}
    try{n=Math.max(n,Number(t&&t.safeAreaInset&&t.safeAreaInset.top)||0)}catch(_){}
    if(mobile())n=Math.max(n,46);
    return Math.round(n);
  }

  function rememberViewport(){
    if(kbOpen||!mobile())return;
    try{
      var c=document.getElementById('c');
      fullW=Math.max(1,Math.round((c&&c.width)||innerWidth||document.documentElement.clientWidth||1));
      fullH=Math.max(1,Math.round((c&&c.height)||innerHeight||document.documentElement.clientHeight||1));
      document.documentElement.style.setProperty('--ppa-game-full-w',fullW+'px');
      document.documentElement.style.setProperty('--ppa-game-full-h',fullH+'px');
    }catch(_){}
  }

  function lockCanvas(){
    if(!kbOpen)return;
    try{
      var c=document.getElementById('c');
      if(!c)return;
      if(fullW>0&&c.width!==fullW)c.width=fullW;
      if(fullH>0&&c.height!==fullH)c.height=fullH;
      c.style.setProperty('width',fullW+'px','important');
      c.style.setProperty('height',fullH+'px','important');
    }catch(_){}
  }

  function freezeGameControls(){
    frozen=[];
    freezeSelectors.forEach(function(sel){
      var el=null;try{el=document.querySelector(sel)}catch(_){}
      if(!el)return;
      var r=null;try{r=el.getBoundingClientRect()}catch(_){r=null}
      if(!r)return;
      var saved={el:el,css:{}};
      ['position','left','top','right','bottom','transform'].forEach(function(k){
        saved.css[k]={value:el.style.getPropertyValue(k),priority:el.style.getPropertyPriority(k)};
      });
      frozen.push(saved);
      try{
        el.style.setProperty('position','fixed','important');
        el.style.setProperty('left',Math.round(r.left)+'px','important');
        el.style.setProperty('top',Math.round(r.top)+'px','important');
        el.style.setProperty('right','auto','important');
        el.style.setProperty('bottom','auto','important');
        el.style.setProperty('transform','none','important');
      }catch(_){}
    });
  }

  function restoreGameControls(){
    frozen.forEach(function(s){
      if(!s||!s.el)return;
      Object.keys(s.css).forEach(function(k){
        var v=s.css[k];
        try{
          if(v&&v.value)s.el.style.setProperty(k,v.value,v.priority||'');
          else s.el.style.removeProperty(k);
        }catch(_){}
      });
    });
    frozen=[];
  }

  function beginKeyboardFreeze(){
    if(kbOpen||!mobile())return;
    rememberViewport();
    kbOpen=true;
    try{
      document.documentElement.classList.add('ppa-native-kb-open');
      document.documentElement.style.setProperty('--ppa-game-full-w',fullW+'px');
      document.documentElement.style.setProperty('--ppa-game-full-h',fullH+'px');
    }catch(_){}
    freezeGameControls();
    lockCanvas();
  }

  function finishKeyboardFreeze(force){
    if(!kbOpen)return;
    if(!force){
      try{
        var vv=window.visualViewport;
        var vh=Math.round(vv?vv.height:innerHeight);
        if(fullH>0&&vh<fullH*.78){setTimeout(function(){finishKeyboardFreeze(false)},90);return}
      }catch(_){}
    }
    kbOpen=false;
    try{document.documentElement.classList.remove('ppa-native-kb-open')}catch(_){}
    restoreGameControls();
    try{
      var c=document.getElementById('c');
      if(c){c.style.removeProperty('width');c.style.removeProperty('height')}
    }catch(_){}
    setTimeout(function(){
      rememberViewport();
      try{if(gameResizeFn)gameResizeFn()}catch(_){}
    },80);
  }

  function armGameResizeGuard(){
    try{
      gameResizeFn=typeof window.resize==='function'?window.resize:null;
      if(gameResizeFn){
        try{window.removeEventListener('resize',gameResizeFn)}catch(_){}
        window.addEventListener('resize',function(){
          if(kbOpen){lockCanvas();return}
          try{gameResizeFn()}catch(_){}
          rememberViewport();
        },{passive:true});
      }else{
        window.addEventListener('resize',function(){if(kbOpen)lockCanvas();else rememberViewport()},{passive:true});
      }
      if(window.visualViewport){
        window.visualViewport.addEventListener('resize',function(){if(kbOpen)lockCanvas()},{passive:true});
        window.visualViewport.addEventListener('scroll',function(){if(kbOpen)lockCanvas()},{passive:true});
      }
    }catch(_){}
  }

  function armChatKeyboardFreeze(){
    document.addEventListener('focusin',function(e){
      try{if(e&&e.target&&(e.target.id==='ppaChatNativeInput'||e.target.id==='ppaChatPrivateTarget'))beginKeyboardFreeze()}catch(_){}
    },true);
    document.addEventListener('focusout',function(e){
      try{
        if(!e||!e.target||(e.target.id!=='ppaChatNativeInput'&&e.target.id!=='ppaChatPrivateTarget'))return;
        setTimeout(function(){
          try{if(document.activeElement&&(document.activeElement.id==='ppaChatNativeInput'||document.activeElement.id==='ppaChatPrivateTarget'))return}catch(_){}
          finishKeyboardFreeze(false);
        },160);
      }catch(_){}
    },true);
    document.addEventListener('visibilitychange',function(){if(document.hidden)finishKeyboardFreeze(true)},{passive:true});
  }

  function apply(){
    try{
      var px=topInset()+'px';
      document.documentElement.style.setProperty('--ppa-tg-top-safe',px);
      document.documentElement.classList.toggle('ppa-tg-mobile-safe',mobile());
      if(!kbOpen)rememberViewport();
    }catch(_){}
  }

  function installStyle(){
    if(document.getElementById('ppaTelegramSafeUi'))return;
    var st=document.createElement('style');
    st.id='ppaTelegramSafeUi';
    st.textContent=`
      :root{--ppa-tg-top-safe:0px;--ppa-game-full-w:100vw;--ppa-game-full-h:100vh}
      @media (max-width:900px), (pointer:coarse){
        html.ppa-tg-mobile-safe{
          -webkit-text-size-adjust:100%!important;
          text-size-adjust:100%!important;
        }
        html.ppa-tg-mobile-safe.ppa-native-kb-open,
        html.ppa-tg-mobile-safe.ppa-native-kb-open body{
          width:var(--ppa-game-full-w)!important;
          height:var(--ppa-game-full-h)!important;
          min-height:var(--ppa-game-full-h)!important;
          max-height:var(--ppa-game-full-h)!important;
          overflow:hidden!important;
        }
        html.ppa-tg-mobile-safe.ppa-native-kb-open #c{
          width:var(--ppa-game-full-w)!important;
          height:var(--ppa-game-full-h)!important;
        }

        html.ppa-tg-mobile-safe #hud{top:calc(var(--ppa-tg-top-safe) + 5px)!important}
        html.ppa-tg-mobile-safe #stats{top:calc(var(--ppa-tg-top-safe) + 6px)!important}
        html.ppa-tg-mobile-safe #waveInfo{top:calc(var(--ppa-tg-top-safe) + 7px)!important}
        html.ppa-tg-mobile-safe #sceneMode{top:calc(var(--ppa-tg-top-safe) + 72px)!important}
        html.ppa-tg-mobile-safe #eliteTimerHud{top:calc(var(--ppa-tg-top-safe) + 98px)!important}
        html.ppa-tg-mobile-safe #potSlot{top:calc(var(--ppa-tg-top-safe) + 64px)!important}
        html.ppa-tg-mobile-safe #potCount{top:calc(var(--ppa-tg-top-safe) + 97px)!important}
        html.ppa-tg-mobile-safe #leaveBtn{top:calc(var(--ppa-tg-top-safe) + 6px)!important}
        html.ppa-tg-mobile-safe #mmap{top:calc(var(--ppa-tg-top-safe) + 76px)!important}
        html.ppa-tg-mobile-safe #ppaOnlineBadge{top:calc(var(--ppa-tg-top-safe) + 2px)!important}

        html.ppa-tg-mobile-safe #ppaChatNativeInput{
          position:fixed!important;
          left:50%!important;
          top:50%!important;
          bottom:auto!important;
          width:1px!important;
          height:1px!important;
          min-width:1px!important;
          min-height:1px!important;
          padding:0!important;
          margin:0!important;
          border:0!important;
          font-size:16px!important;
          line-height:16px!important;
          transform:translate(-50%,-50%)!important;
          opacity:.01!important;
          color:transparent!important;
          caret-color:transparent!important;
          overflow:hidden!important;
        }

        html.ppa-tg-mobile-safe #ppaChatRoot.nativeTyping{
          left:7px!important;
          right:auto!important;
          transform:none!important;
          max-width:calc(100vw - 14px)!important;
        }
        html.ppa-tg-mobile-safe #ppaChatRoot.nativeTyping #ppaChatBox{
          width:min(355px,calc(100vw - 14px))!important;
          max-width:calc(100vw - 14px)!important;
        }

        html.ppa-tg-mobile-safe #gramWalletPanel.open,
        html.ppa-tg-mobile-safe #eventsPanel.open,
        html.ppa-tg-mobile-safe #premiumPanel.open,
        html.ppa-tg-mobile-safe #charFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #charFrame[style*="display:block"],
        html.ppa-tg-mobile-safe #blacksmithFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #blacksmithFrame[style*="display:block"],
        html.ppa-tg-mobile-safe #storageFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #storageFrame[style*="display:block"],
        html.ppa-tg-mobile-safe #merchantFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #merchantFrame[style*="display:block"],
        html.ppa-tg-mobile-safe #auctionFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #auctionFrame[style*="display:block"],
        html.ppa-tg-mobile-safe #blackmarketFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #blackmarketFrame[style*="display:block"],
        html.ppa-tg-mobile-safe #clanFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #clanFrame[style*="display:block"],
        html.ppa-tg-mobile-safe #arenaMenuFrame[style*="display: block"],
        html.ppa-tg-mobile-safe #arenaMenuFrame[style*="display:block"]{
          left:0!important;
          top:var(--ppa-tg-top-safe)!important;
          transform:none!important;
          width:100vw!important;
          height:calc(100dvh - var(--ppa-tg-top-safe))!important;
          max-width:none!important;
          max-height:none!important;
          border-radius:0!important;
        }

        html.ppa-tg-mobile-safe #gramWalletPanel:not(.open){
          visibility:hidden!important;
          opacity:0!important;
          pointer-events:none!important;
          transform:translate(120vw,-50%)!important;
        }
        html.ppa-tg-mobile-safe #gramWalletBackdrop:not(.open){
          visibility:hidden!important;
          opacity:0!important;
          pointer-events:none!important;
        }
      }
    `;
    document.head.appendChild(st);
  }

  function boot(){installStyle();apply();armGameResizeGuard();armChatKeyboardFreeze();rememberViewport()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('orientationchange',function(){setTimeout(function(){if(!kbOpen){apply();try{if(gameResizeFn)gameResizeFn()}catch(_){}}},180)},{passive:true});
  try{
    var t=tg();
    if(t&&typeof t.onEvent==='function'){
      ['viewportChanged','safeAreaChanged','contentSafeAreaChanged','fullscreenChanged','activated'].forEach(function(ev){
        try{t.onEvent(ev,function(){setTimeout(apply,60)})}catch(_){}
      });
    }
  }catch(_){}
})();
