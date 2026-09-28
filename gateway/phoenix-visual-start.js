/* Phoenix Pix Arena: isolated visual-only startup screen.
   Uses an <html> pseudo-element so Telegram body/game scaling cannot shrink it.
   Presentation only: no beginGame/canvas/realtime/input hooks. */
(function(){
  'use strict';
  try{
    var root=document.documentElement;
    if(!root||root.classList.contains('ppaVisualBootActive'))return;

    var style=document.createElement('style');
    style.id='ppaVisualBootStyle';
    style.textContent=
      'html.ppaVisualBootActive::before{content:""!important;position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;z-index:2147483646!important;background-color:#050302!important;background-image:url("/assets/ppa-start-screen.webp")!important;background-position:center center!important;background-repeat:no-repeat!important;background-size:contain!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;transform:none!important;transform-origin:0 0!important;transition:opacity .30s ease!important}'+
      'html.ppaVisualBootActive.ppaVisualBootLeaving::before{opacity:0!important}'+
      '@media (orientation:landscape){html.ppaVisualBootActive::before{background-size:contain!important}}';
    (document.head||root).appendChild(style);
    root.classList.add('ppaVisualBootActive');

    var started=(window.performance&&performance.now)?performance.now():Date.now();
    var hidden=false;
    function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
    function cleanup(){
      try{root.classList.remove('ppaVisualBootActive','ppaVisualBootLeaving')}catch(_){}
      try{if(style&&style.parentNode)style.parentNode.removeChild(style)}catch(_){}
    }
    function hide(){
      if(hidden)return;
      hidden=true;
      var wait=Math.max(0,2400-(now()-started));
      setTimeout(function(){
        try{root.classList.add('ppaVisualBootLeaving')}catch(_){}
        setTimeout(cleanup,380);
      },wait);
    }
    function afterLoad(){
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          setTimeout(hide,800);
        });
      });
    }
    if(document.readyState==='complete')afterLoad();
    else window.addEventListener('load',afterLoad,{once:true});

    // Visual safety fallback only. It never blocks input.
    setTimeout(hide,10000);
  }catch(_){}
})();