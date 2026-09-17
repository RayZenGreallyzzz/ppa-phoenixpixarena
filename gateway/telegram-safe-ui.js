(function(){
  'use strict';

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function mobile(){try{return innerWidth<=900||matchMedia('(pointer:coarse)').matches}catch(_){return false}}

  function topInset(){
    var t=tg(),n=0;
    try{n=Math.max(n,Number(t&&t.contentSafeAreaInset&&t.contentSafeAreaInset.top)||0)}catch(_){}
    try{n=Math.max(n,Number(t&&t.safeAreaInset&&t.safeAreaInset.top)||0)}catch(_){}
    if(mobile())n=Math.max(n,46);
    return Math.round(n);
  }

  function apply(){
    try{
      var px=topInset()+'px';
      document.documentElement.style.setProperty('--ppa-tg-top-safe',px);
      document.documentElement.classList.toggle('ppa-tg-mobile-safe',mobile());
    }catch(_){}
  }

  function installStyle(){
    if(document.getElementById('ppaTelegramSafeUi'))return;
    var st=document.createElement('style');
    st.id='ppaTelegramSafeUi';
    st.textContent=`
      :root{--ppa-tg-top-safe:0px}
      @media (max-width:900px), (pointer:coarse){
        html.ppa-tg-mobile-safe{
          -webkit-text-size-adjust:100%!important;
          text-size-adjust:100%!important;
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

        /* Huawei / older Android WebView can auto-zoom a focused input whose
           text size is below 16px. Our chat uses an almost invisible native
           input only to summon the keyboard; keep it at 16px and in the middle
           of the viewport so focusing it never zooms or pans the whole game. */
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

        /* Keyboard mode is allowed to move the chat vertically above the
           keyboard, but it must not squeeze or slide it sideways. */
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

        /* Windows that are actually open use the Telegram-safe viewport. */
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

        /* A closed wallet must stay truly invisible even when Android changes
           the CSS viewport while the native keyboard opens. */
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

  function boot(){installStyle();apply()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('resize',apply,{passive:true});
  window.addEventListener('orientationchange',function(){setTimeout(apply,120)},{passive:true});
  try{
    var t=tg();
    if(t&&typeof t.onEvent==='function'){
      ['viewportChanged','safeAreaChanged','contentSafeAreaChanged','fullscreenChanged','activated'].forEach(function(ev){
        try{t.onEvent(ev,function(){setTimeout(apply,60)})}catch(_){}
      });
    }
  }catch(_){}
})();
