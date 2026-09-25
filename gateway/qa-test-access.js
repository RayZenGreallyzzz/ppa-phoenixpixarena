(function(){
  'use strict';
  window.PPA_TEST_ALL_DUNGEONS=true;
  window.PPA_TEST_CLAN_SIEGE=true;

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

  function forceSiegeEnter(){
    try{
      if(typeof closeEventHub==='function')closeEventHub();
    }catch(_){}
    try{
      if(typeof changeScene==='function'){
        changeScene('clansiege');
        try{if(typeof showPickup==='function')showPickup('QA · ОСАДА БЕЗ ОТКАТА','#ffd36a')}catch(_){}
        return true;
      }
    }catch(e){console.warn('PPA QA clan siege enter',e)}
    return false;
  }

  window.PPA_QA_ENTER_CLAN_SIEGE=forceSiegeEnter;

  function bindSiegeQaFrameBridge(){
    if(window.__PPA_QA_CLAN_SIEGE_FRAME_BRIDGE)return;
    window.__PPA_QA_CLAN_SIEGE_FRAME_BRIDGE=1;
    window.addEventListener('message',function(ev){
      try{
        if(window.PPA_TEST_CLAN_SIEGE!==true)return;
        var d=ev&&ev.data;
        if(!d||String(d.type||'')!=='ppaClanSiegeQaEnter'||String(d.action||'')!=='clansiege')return;
        var f=document.getElementById('eventsMenuFrame');
        if(f&&f.contentWindow&&ev.source!==f.contentWindow)return;
        forceSiegeEnter();
      }catch(e){console.warn('PPA QA clan siege frame bridge',e)}
    },true);
  }

  function bind(){
    openButtons();
    bindSiegeQaFrameBridge();
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