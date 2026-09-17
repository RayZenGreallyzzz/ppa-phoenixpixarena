(function(){
  'use strict';
  var started=false;

  function stamp(){
    try{
      if(!window.PPA_ONLINE||!PPA_ONLINE.remotes||typeof PPA_ONLINE.remotes.forEach!=='function')return;
      PPA_ONLINE.remotes.forEach(function(r,id){
        if(!r)return;
        id=String(id||r.id||r.i||'');
        if(!id)return;
        r.id=id;
        r.i=id;
        r.__ppaPid=id;
      });
    }catch(_){}
  }

  function boot(){
    if(started)return;started=true;
    stamp();
    setInterval(stamp,100);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(stamp,50)},{passive:true});
    window.addEventListener('pageshow',function(){setTimeout(stamp,50)},{passive:true});
  }

  window.PPA_REMOTE_PID=function(r){
    if(!r)return'';
    var id=String(r.id||r.i||r.__ppaPid||'');
    if(id)return id;
    try{
      if(window.PPA_ONLINE&&PPA_ONLINE.remotes){
        PPA_ONLINE.remotes.forEach(function(v,k){if(!id&&v===r)id=String(k||'')});
      }
    }catch(_){}
    return id;
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
