(function(){
  'use strict';
  window.PPA_TEST_CLAN_SIEGE=true;

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

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindSiegeQaFrameBridge,{once:true});
  else bindSiegeQaFrameBridge();
})();
