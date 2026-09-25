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

  function siegeQaButtons(){
    try{
      if(window.PPA_TEST_CLAN_SIEGE!==true)return;
      var btns=document.querySelectorAll('button');
      for(var i=0;i<btns.length;i++){
        var b=btns[i],t=String(b.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
        if(t.indexOf('ОСАДА')<0)continue;
        if(t.indexOf('ОТКАТ')<0&&t.indexOf('ТЕСТ')<0&&t.indexOf('НАЧАТЬ')<0)continue;
        b.disabled=false;
        b.removeAttribute('disabled');
        b.dataset.ppaQaClanSiege='1';
        b.textContent='ВОЙТИ · ОСАДА · ТЕСТ';
        b.style.opacity='1';
        b.style.pointerEvents='auto';
      }
      var all=document.querySelectorAll('*');
      for(var j=0;j<all.length;j++){
        var el=all[j],tx=String(el.textContent||'').replace(/\s+/g,' ').trim();
        if(tx.indexOf('Следующая осада через')===0&&el.children.length===0){
          el.textContent='QA-ТЕСТ · ОТКАТ ОСАДЫ ВРЕМЕННО ОТКЛЮЧЕН';
          el.style.color='#ffd36a';
        }
      }
    }catch(_){}
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

  function bindSiegeQa(){
    siegeQaButtons();
    if(document.__ppaQaClanSiegeBound)return;
    document.__ppaQaClanSiegeBound=1;
    document.addEventListener('click',function(ev){
      try{
        if(window.PPA_TEST_CLAN_SIEGE!==true)return;
        var b=ev.target&&ev.target.closest?ev.target.closest('button[data-ppa-qa-clan-siege="1"]'):null;
        if(!b)return;
        ev.preventDefault();ev.stopImmediatePropagation();
        forceSiegeEnter();
      }catch(_){}
    },true);
  }

  window.PPA_QA_ENTER_CLAN_SIEGE=forceSiegeEnter;

  function bind(){
    openButtons();
    bindSiegeQa();
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
  setInterval(function(){openButtons();siegeQaButtons()},700);
})();