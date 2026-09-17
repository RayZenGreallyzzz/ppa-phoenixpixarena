(function(){
  'use strict';

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function mobile(){try{return innerWidth<=900||matchMedia('(pointer:coarse)').matches}catch(_){return false}}

  function topInset(){
    var t=tg(),n=0;
    try{n=Math.max(n,Number(t&&t.contentSafeAreaInset&&t.contentSafeAreaInset.top)||0)}catch(_){}
    try{n=Math.max(n,Number(t&&t.safeAreaInset&&t.safeAreaInset.top)||0)}catch(_){}
    // Telegram keeps native collapse/menu controls in this strip even in fullscreen.
    // Keep at least 46px clear on touch phones, as other Telegram games do.
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

        /* Full-screen game windows start below Telegram's native arrow/menu strip. */
        html.ppa-tg-mobile-safe #eventsPanel,
        html.ppa-tg-mobile-safe #premiumPanel,
        html.ppa-tg-mobile-safe #gramWalletPanel,
        html.ppa-tg-mobile-safe #charFrame,
        html.ppa-tg-mobile-safe #blacksmithFrame,
        html.ppa-tg-mobile-safe #storageFrame,
        html.ppa-tg-mobile-safe #merchantFrame,
        html.ppa-tg-mobile-safe #auctionFrame,
        html.ppa-tg-mobile-safe #blackmarketFrame,
        html.ppa-tg-mobile-safe #clanFrame,
        html.ppa-tg-mobile-safe #arenaMenuFrame{
          left:0!important;
          top:var(--ppa-tg-top-safe)!important;
          transform:none!important;
          width:100vw!important;
          height:calc(100dvh - var(--ppa-tg-top-safe))!important;
          max-width:none!important;
          max-height:none!important;
          border-radius:0!important;
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
