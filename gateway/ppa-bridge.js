(function(){
  'use strict';

  var API='';
  var cachedAuth=null;
  var lastSaveAt=0;
  var saveQueue=Promise.resolve();

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function initData(){var x=tg();return x&&x.initData?String(x.initData):''}
  function available(){return !!initData()}

  async function call(path,payload){
    var data=initData();
    if(!data)throw new Error('Откройте игру через Telegram Mini App');
    var r=await fetch(API+path,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(Object.assign({initData:data},payload||{})),
      credentials:'same-origin',
      cache:'no-store'
    });
    var j=null;try{j=await r.json()}catch(_){j={ok:false,message:'Некорректный ответ Gateway'}}
    if(!r.ok||!j||j.ok===false){
      var e=new Error((j&&j.message)||('Gateway HTTP '+r.status));
      e.code=j&&j.code;e.status=r.status;e.data=j;throw e;
    }
    return j;
  }

  async function auth(){
    if(cachedAuth)return cachedAuth;
    try{var w=tg();if(w){w.ready();w.expand()}}catch(_){}
    cachedAuth=await call('/api/auth');
    return cachedAuth;
  }

  function localNickname(){
    try{
      var raw=localStorage.getItem('pxSave')||localStorage.getItem('pxSaveLastGood')||'';
      var s=raw?JSON.parse(raw):null;
      return String((s&&s.playerName)||localStorage.getItem('ppaPlayerNameV205')||'').trim();
    }catch(_){return String(localStorage.getItem('ppaPlayerNameV205')||'').trim()}
  }

  function queueSave(state,version){
    saveQueue=saveQueue.catch(function(){}).then(async function(){
      var now=Date.now();
      var wait=Math.max(0,1200-(now-lastSaveAt));
      if(wait)await new Promise(function(resolve){setTimeout(resolve,wait)});
      var result=await call('/api/save',{state:state,version:version==null?null:Number(version)});
      lastSaveAt=Date.now();
      return result;
    });
    return saveQueue;
  }

  window.PPA=window.PPA||{};
  Object.assign(window.PPA,{
    isAvailable:available,
    ppaAuthTelegram:auth,
    ppaLoadProfile:async function(){await auth();return call('/api/profile/load')},
    ppaLoadSave:async function(){await auth();return call('/api/save/load')},
    ppaSaveGame:async function(state,version){await auth();return queueSave(state,version)},
    ppaRegisterCharacter:async function(nickname,classKey){await auth();return call('/api/character/register',{nickname:nickname,classKey:classKey||''})},
    ppaSyncNicknameFromSave:async function(){await auth();return call('/api/profile/sync-nickname',{nickname:localNickname()})},
    ppaRequestNicknameChange:async function(nickname,requestId){await auth();return call('/api/profile/rename',{nickname:nickname,requestId:requestId})}
  });
})();
