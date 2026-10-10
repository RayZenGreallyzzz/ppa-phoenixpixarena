(function(){
  'use strict';

  var API='';
  var cachedAuth=null;
  var lastSaveAt=0;
  var saveQueue=Promise.resolve();
  var knownSaveVersion=null;
  var saveConflict=null;
  var saveConflictKey='';
  var cloudSaveLoaded=false;
  var serverSellerCreditClaimGate=false;

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

  function authTelegramId(a){
    try{return String((a&&a.profile&&a.profile.telegramId)||(a&&a.user&&a.user.id)||'').trim()}catch(_){return ''}
  }

  function localSaveBoundToTelegram(s,a){
    if(!s||typeof s!=='object')return false;
    var tid=authTelegramId(a);
    if(!tid)return false;
    var bound=String(s.profileTelegramId||s.telegramId||'').trim();
    return !!bound&&bound===tid;
  }

  function purgeForeignLocalCharacter(a){
    try{
      var raw=localStorage.getItem('pxSave')||localStorage.getItem('pxSaveLastGood')||'';
      if(!raw)return;
      var s=null;try{s=JSON.parse(raw)}catch(_){}
      if(localSaveBoundToTelegram(s,a))return;
      localStorage.removeItem('pxSave');
      localStorage.removeItem('pxSaveLastGood');
      localStorage.removeItem('ppaPlayerNameV205');
      sessionStorage.removeItem('ppaTgMigrationDecisionV278');
    }catch(_){}
  }

  async function auth(){
    if(cachedAuth)return cachedAuth;
    try{var w=tg();if(w){w.ready();w.expand()}}catch(_){}
    cachedAuth=await call('/api/auth');
    purgeForeignLocalCharacter(cachedAuth);
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
    var s=localSave();
    return localSaveBoundToTelegram(s,cachedAuth)?s:null;
  }

  function localNickname(){
    try{
      var s=localSave();
      return String((s&&s.playerName)||localStorage.getItem('ppaPlayerNameV205')||'').trim();
    }catch(_){return String(localStorage.getItem('ppaPlayerNameV205')||'').trim()}
  }

  function validNick(v){return /^[A-Za-zА-Яа-яЁё0-9_]{3,18}$/u.test(String(v||'').trim())}

  async function loadProfileServerOnly(){
    // Telegram account is the only identity authority. Never discover, offer,
    // register or migrate a character from this device's localStorage.
    await auth();
    return call('/api/profile/load');
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
    // Saves queued BEFORE a payout must finish before the claim is sent.
    // Saves queued AFTER payout begins must never run with stale local INV.
    var admittedBeforeClaim=!serverSellerCreditClaimGate;
    saveQueue=saveQueue.catch(function(){}).then(async function(){
      if(!admittedBeforeClaim){
        var blocked=new Error('Начисление аукциона ожидает серверного подтверждения. Сейв можно отправить после перезагрузки.');
        blocked.code='AUCTION_CREDIT_SAVE_GATE';blocked.status=409;throw blocked;
      }
      if(!cloudSaveLoaded){
        var e=new Error('Облачный сейв ещё не загружен. Локальный кэш не может перезаписать Telegram-сейв.');
        e.code='CLOUD_SAVE_NOT_LOADED';e.status=409;throw e;
      }
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
          var conflictCurrent=Number(err.data&&err.data.currentVersion);
          if(!Number.isFinite(conflictCurrent))conflictCurrent=null;
          var conflictKey=String(expected)+'>'+String(conflictCurrent==null?'?':conflictCurrent);
          saveConflict={
            at:Date.now(),
            expectedVersion:expected,
            currentVersion:conflictCurrent
          };
          // Do not advance knownSaveVersion here. The local snapshot that lost the
          // version race is stale and must never be retried against a newer version.
          // Close the save gate until a real /api/save/load re-establishes authority.
          cloudSaveLoaded=false;
          try{
            if(window.PPA_CLOUD){
              window.PPA_CLOUD.saveConflict=saveConflict;
              window.PPA_CLOUD.ready=false;
            }
          }catch(_){}
          if(saveConflictKey!==conflictKey){
            saveConflictKey=conflictKey;
            try{
              if(typeof showPickup==='function')showPickup('СЕЙВ ЗАЩИЩЁН · старые данные НЕ перезаписали облако','#ffb36b');
            }catch(_){}
          }
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
    try{
      var r=await call('/api/profile/rename',{nickname:nickname,requestId:requestId});
      try{if(window.PPA_REALTIME_IDENTITY_SYNC)setTimeout(function(){window.PPA_REALTIME_IDENTITY_SYNC(nickname)},60)}catch(_){}
      return r;
    }
    catch(err){if(err&&err.data&&err.data.ok===false)return err.data;throw err}
  }

  async function deleteOwnAccount(){
    await auth();

    var ok=false;
    try{
      ok=window.confirm(
        'Удалить текущий игровой аккаунт?\n\nБудут удалены персонаж, сейв, инвентарь, аукцион и игровые данные этого Telegram-аккаунта. История TON/выводов сохраняется для финансового аудита.'
      );
    }catch(_){ok=false}
    if(!ok)return {ok:false,cancelled:true};

    var typed='';
    try{typed=window.prompt('Для подтверждения введи: УДАЛИТЬ','')||''}catch(_){typed=''}
    if(String(typed).trim().toUpperCase()!=='УДАЛИТЬ'){
      throw new Error('Удаление отменено: подтверждение не совпало.');
    }

    var r=await call('/api/account/delete',{confirm:'DELETE_MY_ACCOUNT'});

    try{
      localStorage.removeItem('pxSave');
      localStorage.removeItem('pxSaveLastGood');
      localStorage.removeItem('ppaPlayerNameV205');
      sessionStorage.removeItem('ppaTgMigrationDecisionV278');
    }catch(_){}

    cachedAuth=null;
    knownSaveVersion=null;
    saveConflict=null;saveConflictKey='';
    cloudSaveLoaded=false;
    try{
      if(window.PPA_CLOUD){
        window.PPA_CLOUD.ready=false;
        window.PPA_CLOUD.version=null;
        window.PPA_CLOUD.saveConflict=null;
      }
    }catch(_){}

    try{window.alert((r&&r.message)||'Аккаунт удалён. Mini App будет перезапущен.')}catch(_){}
    try{window.location.reload()}catch(_){}
    return r;
  }

  async function authed(path,payload){await auth();return call(path,payload||{})}

  window.PPA=window.PPA||{};
  Object.assign(window.PPA,{
    isAvailable:available,
    ppaAuthTelegram:auth,
    ppaLoadProfile:loadProfileServerOnly,
    ppaLoadSave:async function(){
      await auth();
      var r=await call('/api/save/load');
      noteSaveVersion(r&&r.version!=null?r.version:0);
      cloudSaveLoaded=true;
      saveConflict=null;saveConflictKey='';
      try{if(window.PPA_CLOUD)window.PPA_CLOUD.saveConflict=null}catch(_){}
      return r;
    },
    ppaSaveGame:async function(state,version){await auth();return queueSave(state,version)},
    ppaRegisterCharacter:async function(nickname,classKey){
      await auth();
      var r=await call('/api/character/register',{nickname:nickname,classKey:classKey||''});
      var loaded=await call('/api/save/load');
      noteSaveVersion(loaded&&loaded.version!=null?loaded.version:0);
      cloudSaveLoaded=true;
      saveConflict=null;saveConflictKey='';
      try{if(window.PPA_CLOUD)window.PPA_CLOUD.saveConflict=null}catch(_){}

      // First registration may add server-owned starter items (newbie chest).
      // Do NOT hot-run the full legacy loadGame() here: it is a startup loader
      // and can reset unrelated live state. Apply only the authoritative fields
      // created by registration.
      try{
        var st=loaded&&loaded.state&&typeof loaded.state==='object'?loaded.state:null;
        if(st){
          localStorage.setItem('pxSave',JSON.stringify(st));
          localStorage.setItem('pxSaveLastGood',JSON.stringify(st));
          try{sessionStorage.removeItem('ppaCloudLoadedStamp')}catch(_){}

          var serverNick=String(st.playerName||st.nickname||(r&&r.profile&&r.profile.nickname)||nickname||'').trim();
          if(serverNick){
            try{if(typeof INV!=='undefined'&&INV)INV.playerName=serverNick}catch(_){}
            try{window.PPA_PLAYER_NAME=serverNick}catch(_){}
            try{localStorage.setItem('ppaPlayerNameV205',serverNick)}catch(_){}
            try{if(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE)PPA_ONLINE.selfName=serverNick}catch(_){}
          }

          try{
            if(typeof INV!=='undefined'&&INV){
              if(Array.isArray(st.bag)){
                INV.bag=st.bag.map(function(it){return it&&typeof it==='object'?Object.assign({},it):it});
              }
              if(st.storage&&typeof st.storage==='object'){
                INV.storage=INV.storage&&typeof INV.storage==='object'?INV.storage:{personal:[],clan:[],premium:[]};
                ['personal','clan','premium'].forEach(function(k){
                  if(Array.isArray(st.storage[k])){
                    INV.storage[k]=st.storage[k].map(function(it){return it&&typeof it==='object'?Object.assign({},it):it});
                  }else if(!Array.isArray(INV.storage[k])){
                    INV.storage[k]=[];
                  }
                });
              }
            }
          }catch(_){}

          try{if(window.PPA_REFRESH_NEWBIE_CHEST)window.PPA_REFRESH_NEWBIE_CHEST()}catch(_){}
          try{if(typeof sendInvState==='function')sendInvState()}catch(_){}
          try{if(typeof sendStorageState==='function')sendStorageState()}catch(_){}
          try{if(typeof updateUI==='function')updateUI()}catch(_){}
        }
      }catch(applyErr){
        console.warn('PPA fresh registration targeted apply',applyErr);
      }

      try{if(window.PPA_REALTIME_IDENTITY_SYNC)setTimeout(function(){window.PPA_REALTIME_IDENTITY_SYNC(nickname)},60)}catch(_){}
      return r;
    },
    ppaSyncNicknameFromSave:async function(){return authed('/api/profile/load')},
    ppaRequestNicknameChange:renameWithSyncedCard,
    ppaDeleteOwnAccount:deleteOwnAccount,

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
    ppaAuctionServerCredits:function(){return authed('/api/auction/server-credits')},
    ppaAuctionClaimCredit:async function(creditId,version){
      if(serverSellerCreditClaimGate)throw new Error('Серверная выплата уже обрабатывается');
      // Block NEW legacy client saves before waiting for older queued writes.
      // Otherwise the pending old-version INV snapshot could overwrite an
      // already credited server wallet after a successful claim.
      serverSellerCreditClaimGate=true;
      try{
        // A failed earlier save must abort the payout. Never swallow a
        // conflict here and accidentally credit an older character snapshot.
        await saveQueue;
        var expected=await resolveSaveVersion(version);
        var result=await authed('/api/auction/claim-credit',{creditId:String(creditId||''),version:expected});
        if(result&&result.version!=null)noteSaveVersion(result.version);
        // On success, keep the save gate closed until startup loads the
        // entire canonical save. The old in-memory INV is not authoritative.
        cloudSaveLoaded=false;
        try{if(window.PPA_CLOUD)window.PPA_CLOUD.creditClaimNeedsReload=true}catch(_){}
        return result;
      }catch(e){
        // Even an HTTP error can mean the server committed the payout but
        // the response was lost. Fail closed until a FULL page reload has
        // applied the canonical server save to the in-memory inventory.
        cloudSaveLoaded=false;
        try{
          if(window.PPA_CLOUD){
            window.PPA_CLOUD.creditClaimNeedsReload=true;
            window.PPA_CLOUD.ready=false;
          }
        }catch(_){}
        throw e;
      }
    },

    ppaWalletState:function(){return authed('/api/wallet/state')},
    ppaWalletLink:function(address){return authed('/api/wallet/link',{address:address||''})},
    ppaWalletUnlink:function(){return authed('/api/wallet/unlink')},
    ppaWalletDeposit:function(payload){return authed('/api/wallet/deposit',payload||{})},
    ppaWalletWithdraw:function(payload){return authed('/api/wallet/withdraw',payload||{})},
    ppaResetOwnTestGram:function(){return authed('/api/wallet/reset-test-gram',{confirm:'RESET_ONLY_GRAM'})},
    ppaSaveProtectionDiag:function(){return {knownVersion:knownSaveVersion,conflict:saveConflict}}
  });
})();
