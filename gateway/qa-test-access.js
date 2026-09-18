(function(){
  'use strict';
  window.PPA_TEST_ALL_DUNGEONS=true;

  function openButtons(){
    try{
      if(typeof dungeon21Unlocked==='function')window.dungeon21Unlocked=function(){return true};
      if(typeof dungeon41Unlocked==='function')window.dungeon41Unlocked=function(){return true};
    }catch(_){}
    try{
      var b21=document.getElementById('dungeonEnter21Btn');
      var b41=document.getElementById('dungeonEnter41Btn');
      var c21=document.getElementById('dungeon21Card');
      var c41=document.getElementById('dungeon41Card');
      var st=document.getElementById('dungeonKeeperStatus');
      if(b21){b21.disabled=false;b21.textContent='ВОЙТИ · 21–40 · ТЕСТ'}
      if(b41){b41.disabled=false;b41.textContent='ВОЙТИ · 41–60 · ТЕСТ'}
      if(c21)c21.classList.remove('locked');
      if(c41)c41.classList.remove('locked');
      if(st)st.textContent='ТЕСТ · ограничения по уровню временно отключены.';
    }catch(_){}
  }

  function forceEnter(mode){
    try{
      DUNGEON_MODE=mode;
      if(typeof closeDungeonGateMenu==='function')closeDungeonGateMenu();
      if(typeof changeScene==='function')changeScene('dungeon');
      return true;
    }catch(e){console.warn('PPA QA dungeon enter',e);return false}
  }

  function bind(){
    openButtons();
    var b21=document.getElementById('dungeonEnter21Btn');
    var b41=document.getElementById('dungeonEnter41Btn');
    if(b21&&!b21.__ppaQaOpen){
      b21.__ppaQaOpen=1;
      b21.addEventListener('click',function(ev){
        if(window.PPA_TEST_ALL_DUNGEONS!==true)return;
        ev.preventDefault();ev.stopImmediatePropagation();forceEnter('21+');
      },true);
    }
    if(b41&&!b41.__ppaQaOpen){
      b41.__ppaQaOpen=1;
      b41.addEventListener('click',function(ev){
        if(window.PPA_TEST_ALL_DUNGEONS!==true)return;
        ev.preventDefault();ev.stopImmediatePropagation();forceEnter('41-60');
      },true);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
  setInterval(openButtons,700);
})();