/* Phoenix Pix Arena: isolated visual-only startup screen.
   Presentation only. Does not gate or modify beginGame, canvas, realtime, input, or scene init. */
(function(){
  'use strict';
  try{
    if(document.getElementById('ppaVisualBoot'))return;

    var style=document.createElement('style');
    style.id='ppaVisualBootStyle';
    style.textContent=
      '#ppaVisualBoot{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;margin:0!important;padding:0!important;z-index:2147483000!important;background:#050302 url("/assets/ppa-start-screen.webp") center center/contain no-repeat!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;transform:none!important;transform-origin:0 0!important;transition:opacity .28s ease!important}'+
      '#ppaVisualBoot.ppaVisualBootOut{opacity:0!important}'+
      '@media (orientation:landscape){#ppaVisualBoot{background-size:contain!important}}';
    (document.head||document.documentElement).appendChild(style);

    var el=document.createElement('div');
    el.id='ppaVisualBoot';
    el.setAttribute('aria-hidden','true');
    document.documentElement.appendChild(el);

    var started=(window.performance&&performance.now)?performance.now():Date.now();
    var hidden=false;
    function now(){return (window.performance&&performance.now)?performance.now():Date.now();}
    function remove(){
      try{if(el&&el.parentNode)el.parentNode.removeChild(el)}catch(_){}
      try{if(style&&style.parentNode)style.parentNode.removeChild(style)}catch(_){}
    }
    function hide(){
      if(hidden)return;
      hidden=true;
      var wait=Math.max(0,1800-(now()-started));
      setTimeout(function(){
        try{el.classList.add('ppaVisualBootOut')}catch(_){}
        setTimeout(remove,340);
      },wait);
    }
    function afterLoad(){
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          setTimeout(hide,650);
        });
      });
    }
    if(document.readyState==='complete')afterLoad();
    else window.addEventListener('load',afterLoad,{once:true});

    // Safety fallback. The overlay never blocks input, but it must never remain visible forever.
    setTimeout(hide,8000);
  }catch(_){}
})();