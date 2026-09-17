(function(){
  'use strict';
  function mobile(){try{return innerWidth<=900||matchMedia('(pointer:coarse)').matches}catch(_){return false}}
  function apply(){
    if(!mobile())return;
    try{
      var m=document.getElementById('mmap');
      if(m)m.style.setProperty('top','calc(var(--ppa-tg-top-safe, 0px) + 32px)','important');
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  window.addEventListener('resize',apply,{passive:true});
  window.addEventListener('orientationchange',function(){setTimeout(apply,100)},{passive:true});
})();
