(function(){
  'use strict';

  var API='';
  var cachedAuth=null;
  var lastSaveAt=0;
  var saveQueue=Promise.resolve();
  var knownSaveVersion=null;
  var saveConflict=null;

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

  function noteSaveVersion(v){
    v=Number(v);
    if(!Number.isFinite(v)||v<0)return;
    knownSaveVersion=Math.floor(v);
    try{if(window.PPA_CLOUD)window.PPA_CLOUD.version=knownSaveVersion}catch(_){}
  }

  async function resolveSaveVersion(hint){
    if(Number.isFinite(Number(knownSaveVersion)))return Number(knownSaveVersion);
    if(hint!==null&&hint!==undefined&&hint!==''&&Number.isFinite(Number(hint))){
      noteSaveVersion(hint);
      return Number(knownSaveVersion);
    }
    var loaded=await call('/api/save/load');
    noteSaveVersion(loaded&&loaded.version!=null?loaded.version:0);
    return Number(knownSaveVersion)||0;
  }

  function queueSave(state,version){
    saveQueue=saveQueue.catch(function(){}).then(async function(){
      var now=Date.now();
      var wait=Math.max(0,1200-(now-lastSaveAt));
      if(wait)await new Promise(function(resolve){setTimeout(resolve,wait)});
      var expected=await resolveSaveVersion(version);
      try{
        var result=await call('/api/save',{state:state,version:expected});
        lastSaveAt=Date.now();
        saveConflict=null;
        noteSaveVersion(result&&result.version);
        return result;
      }catch(err){
        if(err&&err.code==='SAVE_VERSION_CONFLICT'){
          saveConflict={
            at:Date.now(),
            expectedVersion:expected,
            currentVersion:Number(err.data&&err.data.currentVersion)||null
          };
          try{
            if(window.PPA_CLOUD){
              window.PPA_CLOUD.saveConflict=saveConflict;
              window.PPA_CLOUD.ready=false;
            }
          }catch(_){}
          try{
            if(typeof showPickup==='function')showPickup('СЕЙВ ЗАЩИЩЁН · старые данные НЕ перезаписали облако','#ffb36b');
          }catch(_){}
        }
        throw err;
      }
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

  async function deleteStellaTestAccount(){
    var a=await auth();
    var nick=String(a&&a.profile&&a.profile.nickname||'').trim();
    if(nick.toLowerCase()!=='stella')throw new Error('Эта временная кнопка доступна только аккаунту Stella.');

    var ok=false;
    try{ok=window.confirm('Удалить тестовый аккаунт Stella с сервера?\n\nСейв, профиль, инвентарь и локальный персонаж будут очищены. История TON/выводов останется для аудита.')}catch(_){ok=false}
    if(!ok)return {ok:false,cancelled:true};

    var typed='';
    try{typed=window.prompt('Для подтверждения введи: DELETE STELLA','')||''}catch(_){typed=''}
    if(String(typed).trim()!=='DELETE STELLA')throw new Error('Удаление отменено: подтверждение не совпало.');

    var r=await call('/api/account/delete-stella-test',{confirm:'DELETE_STELLA_TEST_ACCOUNT'});

    try{
      localStorage.removeItem('pxSave');
      localStorage.removeItem('pxSaveLastGood');
      localStorage.removeItem('ppaPlayerNameV205');
      sessionStorage.removeItem('ppaTgMigrationDecisionV278');
    }catch(_){}
    cachedAuth=null;knownSaveVersion=null;saveConflict=null;

    try{window.alert((r&&r.message)||'Stella удалена. Mini App будет перезапущен.') }catch(_){}
    try{window.location.reload()}catch(_){}
    return r;
  }

  function installStellaDeleteButton(){
    if(document.getElementById('ppaDeleteStellaTestBtn'))return;
    auth().then(function(a){
      var nick=String(a&&a.profile&&a.profile.nickname||'').trim();
      if(nick.toLowerCase()!=='stella')return;
      var b=document.createElement('button');
      b.id='ppaDeleteStellaTestBtn';
      b.type='button';
      b.textContent='ТЕСТ · УДАЛИТЬ STELLA';
      b.style.cssText='position:fixed;left:8px;bottom:8px;z-index:2147483600;height:30px;padding:0 9px;border:1px solid #8e3a34;border-radius:7px;background:rgba(55,16,14,.94);color:#ffb1aa;font:800 9px monospace;box-shadow:0 3px 12px rgba(0,0,0,.55);touch-action:manipulation';
      b.onclick=function(){
        b.disabled=true;
        deleteStellaTestAccount().catch(function(err){
          try{window.alert(String(err&&err.message||err||'Ошибка удаления'))}catch(_){}
        }).finally(function(){b.disabled=false});
      };
      document.body.appendChild(b);
    }).catch(function(){});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(installStellaDeleteButton,600)},{once:true});
  else setTimeout(installStellaDeleteButton,600);

  async function authed(path,payload){await auth();return call(path,payload||{})}

  window.PPA=window.PPA||{};
  Object.assign(window.PPA,{
    isAvailable:available,
    ppaAuthTelegram:auth,
    ppaLoadProfile:loadProfileWithSafeFirstMigration,
    ppaLoadSave:async function(){await auth();var r=await call('/api/save/load');noteSaveVersion(r&&r.version!=null?r.version:0);return r},
    ppaSaveGame:async function(state,version){await auth();return queueSave(state,version)},
    ppaRegisterCharacter:async function(nickname,classKey){return authed('/api/character/register',{nickname:nickname,classKey:classKey||''})},
    ppaSyncNicknameFromSave:async function(){return authed('/api/profile/sync-nickname',{nickname:localNickname()})},
    ppaRequestNicknameChange:renameWithSyncedCard,
    ppaDeleteStellaTestAccount:deleteStellaTestAccount,

    ppaAdminEventRewardStockAccess:function(payload){return authed('/api/admin/event-reward-stock-access',payload||{})},
    ppaStatChestOpen:async function(payload){
      await auth();
      var snapshot=currentSaveSnapshot();
      if(snapshot&&typeof snapshot==='object'){
        var version=null;try{version=window.PPA_CLOUD&&window.PPA_CLOUD.version}catch(_){}
        await queueSave(snapshot,version);
      }
      var r=await call('/api/stat-chest/open',payload||{});
      if(r&&r.version!=null)noteSaveVersion(r.version);
      return r;
    },

    ppaClanState:function(){return authed('/api/clan/state')},
    ppaClanAction:function(req){return authed('/api/clan/action',req||{})},

    ppaAuctionList:function(){return authed('/api/auction/list')},
    ppaAuctionPlace:function(payload){return authed('/api/auction/place',payload||{})},
    ppaAuctionCancel:function(payload){return authed('/api/auction/cancel',payload||{})},
    ppaAuctionBuy:async function(payload){var r=await authed('/api/auction/buy',payload||{});if(r&&r.version!=null)noteSaveVersion(r.version);return r},
    ppaAuctionAckCredits:function(ids){return authed('/api/auction/ack-credits',{ids:Array.isArray(ids)?ids:[]})},

    ppaWalletState:function(){return authed('/api/wallet/state')},
    ppaWalletLink:function(address){return authed('/api/wallet/link',{address:address||''})},
    ppaWalletUnlink:function(){return authed('/api/wallet/unlink')},
    ppaWalletDeposit:function(payload){return authed('/api/wallet/deposit',payload||{})},
    ppaWalletWithdraw:function(payload){return authed('/api/wallet/withdraw',payload||{})},
    ppaResetOwnTestGram:function(){return authed('/api/wallet/reset-test-gram',{confirm:'RESET_ONLY_GRAM'})},
    ppaSaveProtectionDiag:function(){return {knownVersion:knownSaveVersion,conflict:saveConflict}}
  });
})();
