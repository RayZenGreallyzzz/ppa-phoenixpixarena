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

  function localSave(){
    try{
      var raw=localStorage.getItem('pxSave')||localStorage.getItem('pxSaveLastGood')||'';
      var s=raw?JSON.parse(raw):null;
      return s&&typeof s==='object'?s:null;
    }catch(_){return null}
  }

  function currentSaveSnapshot(){
    try{
      if(typeof window.ppaBuildSaveObject==='function'){
        var built=window.ppaBuildSaveObject();
        if(built&&typeof built==='object')return built;
      }
    }catch(_){}
    return localSave();
  }

  function localNickname(){
    try{
      var s=localSave();
      return String((s&&s.playerName)||localStorage.getItem('ppaPlayerNameV205')||'').trim();
    }catch(_){return String(localStorage.getItem('ppaPlayerNameV205')||'').trim()}
  }

  function validNick(v){return /^[A-Za-zА-Яа-яЁё0-9_]{3,18}$/u.test(String(v||'').trim())}

  async function loadProfileWithSafeFirstMigration(){
    await auth();
    var result=await call('/api/profile/load');
    var profile=result&&result.profile?result.profile:null;
    if(!profile||profile.nickname)return result;
    var s=localSave();
    var nick=String((s&&s.playerName)||localNickname()||'').trim();
    if(!s||!validNick(nick))return result;
    var decision='';
    try{decision=sessionStorage.getItem('ppaTgMigrationDecisionV278')||''}catch(_){}
    if(decision==='new')return result;
    if(decision!=='keep'){
      var ok=false;
      try{ok=window.confirm('Найден персонаж «'+nick+'» на этом устройстве.\n\nПривязать его к вашему Telegram ID и перенести сохранение в облако?')}catch(_){ok=false}
      decision=ok?'keep':'new';
      try{sessionStorage.setItem('ppaTgMigrationDecisionV278',decision)}catch(_){}
      if(!ok)return result;
    }
    var cls=String((s&&s.cls)||'');
    var registered=await call('/api/character/register',{nickname:nick,classKey:cls});
    if(registered&&registered.profile)return {ok:true,profile:registered.profile};
    return result;
  }

  function queueSave(state,version){
    saveQueue=saveQueue.catch(function(){}).then(async function(){
      var now=Date.now();
      var wait=Math.max(0,1200-(now-lastSaveAt));
      if(wait)await new Promise(function(resolve){setTimeout(resolve,wait)});
      var result=await call('/api/save',{state:state,version:version==null?null:Number(version)});
      lastSaveAt=Date.now();
      try{if(window.PPA_CLOUD&&Number.isFinite(Number(result&&result.version)))window.PPA_CLOUD.version=Number(result.version)}catch(_){}
      return result;
    });
    return saveQueue;
  }

  async function renameWithSyncedCard(nickname,requestId){
    await auth();
    var snapshot=currentSaveSnapshot();
    if(snapshot&&typeof snapshot==='object'){
      var version=null;
      try{version=window.PPA_CLOUD&&window.PPA_CLOUD.version}catch(_){}
      try{await queueSave(snapshot,version)}catch(syncErr){throw syncErr}
    }
    try{return await call('/api/profile/rename',{nickname:nickname,requestId:requestId})}
    catch(err){if(err&&err.data&&err.data.ok===false)return err.data;throw err}
  }

  async function authed(path,payload){await auth();return call(path,payload||{})}

  window.PPA=window.PPA||{};
  Object.assign(window.PPA,{
    isAvailable:available,
    ppaAuthTelegram:auth,
    ppaLoadProfile:loadProfileWithSafeFirstMigration,
    ppaLoadSave:async function(){await auth();return call('/api/save/load')},
    ppaSaveGame:async function(state,version){await auth();return queueSave(state,version)},
    ppaRegisterCharacter:async function(nickname,classKey){return authed('/api/character/register',{nickname:nickname,classKey:classKey||''})},
    ppaSyncNicknameFromSave:async function(){return authed('/api/profile/sync-nickname',{nickname:localNickname()})},
    ppaRequestNicknameChange:renameWithSyncedCard,

    ppaClanState:function(){return authed('/api/clan/state')},
    ppaClanAction:function(req){return authed('/api/clan/action',req||{})},

    ppaAuctionList:function(){return authed('/api/auction/list')},
    ppaAuctionPlace:function(payload){return authed('/api/auction/place',payload||{})},
    ppaAuctionCancel:function(payload){return authed('/api/auction/cancel',payload||{})},
    ppaAuctionBuy:function(payload){return authed('/api/auction/buy',payload||{})},
    ppaAuctionAckCredits:function(ids){return authed('/api/auction/ack-credits',{ids:Array.isArray(ids)?ids:[]})},

    ppaWalletState:function(){return authed('/api/wallet/state')},
    ppaWalletLink:function(address){return authed('/api/wallet/link',{address:address||''})},
    ppaWalletUnlink:function(){return authed('/api/wallet/unlink')},
    ppaWalletDeposit:function(payload){return authed('/api/wallet/deposit',payload||{})},
    ppaWalletWithdraw:function(payload){return authed('/api/wallet/withdraw',payload||{})}
  });
})();
