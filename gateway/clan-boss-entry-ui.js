(function(){
  'use strict';

  var seen=new WeakSet(),lastClickAt=0;

  function parentWin(doc){
    try{return doc&&doc.defaultView&&doc.defaultView.parent?doc.defaultView.parent:window}catch(_){return window}
  }
  function buttonText(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase()}
  function isEnterButton(el){
    if(!el)return false;
    var b=el.closest?el.closest('button,[role="button"],.action,.memberBtn'):null;
    if(!b)return false;
    return buttonText(b).indexOf('ВОЙТИ К БОССУ')>=0?b:null;
  }
  function bossIdFor(btn,doc){
    var node=btn;
    for(var i=0;i<6&&node;i++,node=node.parentElement){
      var t=String(node.textContent||'').toUpperCase();
      if(t.indexOf('КРОВАВАЯ ВАЛЬКИРИЯ')>=0)return 'clan_boss_1';
      if(t.indexOf('ЦЕРБЕР ПЕКЛА')>=0)return 'clan_boss_2';
    }
    try{
      var all=Array.from(doc.querySelectorAll('button,[role="button"],.action,.memberBtn')).filter(function(x){
        return buttonText(x).indexOf('ВОЙТИ К БОССУ')>=0;
      });
      var idx=all.indexOf(btn);
      return idx===1?'clan_boss_2':'clan_boss_1';
    }catch(_){return 'clan_boss_1'}
  }
  function notice(w,msg,bad){
    try{
      if(typeof w.clanNotice==='function'){w.clanNotice(msg);return}
      if(typeof w.showPickup==='function'){w.showPickup(msg,bad?'#ff7b7b':'#ffd36a');return}
    }catch(_){}
  }
  async function enter(btn,doc){
    var now=Date.now();
    if(now-lastClickAt<350)return;
    lastClickAt=now;

    var w=parentWin(doc),handler=null,old=btn.textContent,bid=bossIdFor(btn,doc);
    try{
      btn.disabled=true;
      btn.dataset.ppaBossEntering='1';
      btn.textContent='ВХОД…';
      btn.style.opacity='.72';
      btn.style.pointerEvents='none';
      btn.style.transform='scale(.98)';
    }catch(_){}
    try{
      w.__PPA_CLAN_BOSS_SESSION_ENTERED=true;
      w.__PPA_CLAN_BOSS_ENTRY_GRACE_UNTIL=Date.now()+2500;
      if(doc&&doc.body)doc.body.dataset.ppaBossEntering='1';
      if(typeof w.showPickup==='function')w.showPickup('ВХОД К КЛАНОВОМУ БОССУ…','#ffd36a');
    }catch(_){}

    try{handler=w.PPA_CLAN_BOSS_HANDLER}catch(_){}
    if(typeof handler!=='function'){
      notice(w,'Клановый сервер ещё подключается…',true);
      try{btn.disabled=false;btn.textContent=old;btn.style.opacity='';btn.style.pointerEvents='';btn.style.transform='';delete btn.dataset.ppaBossEntering}catch(_){}
      return;
    }

    try{
      var r=await handler({action:'startRaid',bossId:bid,source:'bossButton'});
      if(!(r&&r.ok)){
        throw new Error((r&&r.message)||'Сервер не подтвердил вход к боссу');
      }
      // Handler owns the normal transition. Fallback only if it did not move us.
      setTimeout(function(){
        try{
          if(typeof w.P!=='undefined'&&w.P&&w.P.scene!=='clanboss1'&&typeof w.changeScene==='function')w.changeScene('clanboss1');
        }catch(_){}
      },80);
    }catch(e){
      notice(w,String(e&&e.message||e||'Не удалось войти к боссу'),true);
      try{
        btn.disabled=false;
        btn.textContent=old;
        btn.style.opacity='';
        btn.style.pointerEvents='';
        btn.style.transform='';
        delete btn.dataset.ppaBossEntering;
      }catch(_){}
    }
  }
  function bindDoc(doc){
    if(!doc||seen.has(doc))return;
    seen.add(doc);
    try{
      doc.addEventListener('pointerdown',function(ev){
        var btn=isEnterButton(ev.target);
        if(!btn||btn.disabled||btn.dataset.ppaBossEntering==='1')return;
        ev.preventDefault();
        ev.stopPropagation();
        if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
        enter(btn,doc);
      },{capture:true,passive:false});
      doc.addEventListener('click',function(ev){
        var btn=isEnterButton(ev.target);
        if(!btn||btn.disabled||btn.dataset.ppaBossEntering==='1')return;
        ev.preventDefault();
        ev.stopPropagation();
        if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
        enter(btn,doc);
      },true);
    }catch(_){}
  }
  function scan(){
    bindDoc(document);
    try{
      var frames=document.querySelectorAll('iframe');
      for(var i=0;i<frames.length;i++){
        var d=null;try{d=frames[i].contentDocument}catch(_){}
        if(d)bindDoc(d);
      }
    }catch(_){}
  }

  window.PPA_CLAN_BOSS_ENTRY_UI_DIAG=function(){
    return {installed:true,lastClickAt:lastClickAt,docsBound:'weakset'};
  };

  scan();
  setInterval(scan,300);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});
})();