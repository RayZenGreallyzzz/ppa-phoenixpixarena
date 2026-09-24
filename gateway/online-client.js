(function(){
  'use strict';

  var installed=false;
  var installStartedAt=Date.now();

  function online(){try{return !!(window.PPA&&PPA.isAvailable&&PPA.isAvailable())}catch(_){return false}}
  function msg(e){return String((e&&e.message)||e||'ошибка сервера')}

  async function refreshClan(){
    if(!online()||!PPA.ppaClanState)return;
    try{var r=await PPA.ppaClanState();pushClanState(r)}catch(e){console.warn('Clan sync',e)}
  }

  function appliedCreditSet(){try{var a=JSON.parse(localStorage.getItem('ppaAuctionCreditsAppliedV279')||'[]');return new Set(Array.isArray(a)?a:[])}catch(_){return new Set()}}
  function saveCreditSet(set){try{localStorage.setItem('ppaAuctionCreditsAppliedV279',JSON.stringify(Array.from(set).slice(-300)))}catch(_){}}
  async function refreshAuction(){
    if(!online()||!PPA.ppaAuctionList)return;
    try{
      var r=await PPA.ppaAuctionList();
      if(r&&Array.isArray(r.lots)&&window.PPA_SET_AUCTION_MARKET)window.PPA_SET_AUCTION_MARKET(r.lots);
      var credits=Array.isArray(r&&r.credits)?r.credits:[],seen=appliedCreditSet(),ack=[],changed=false;
      credits.forEach(function(c){
        var id=String(c.id||'');if(!id||seen.has(id)){if(id)ack.push(id);return}
        var cur=c.currency==='gram'?'gram':'ppa',amt=Math.max(0,Number(c.amount)||0),q=Math.max(1,Math.floor(Number(c.sold_qty)||1));
        if(cur==='gram')INV.gram=Math.round(((Number(INV.gram)||0)+amt)*100)/100;else INV.ppa=Math.round(((Number(INV.ppa)||0)+amt)*100)/100;
        var li=(INV.auctionLots||[]).findIndex(function(x){return x&&String(x.id)===String(c.lot_id)});
        if(li>=0){INV.auctionLots[li].qty=Math.max(0,(Number(INV.auctionLots[li].qty)||1)-q);if(INV.auctionLots[li].qty<=0)INV.auctionLots.splice(li,1)}
        seen.add(id);ack.push(id);changed=true;
        try{showPickup('Аукцион · продано · +'+String(amt).replace('.',',')+' '+cur.toUpperCase(),'#8dff9a')}catch(_){}
      });
      if(changed){saveCreditSet(seen);saveGame();sendInvState();sendAuctionState();sendPremiumState();updateUI()}
      if(ack.length&&PPA.ppaAuctionAckCredits)PPA.ppaAuctionAckCredits(ack).catch(function(){});
    }catch(e){console.warn('Auction sync',e)}
  }

  var PPA_TON_TREASURY='UQCMgQWdxCPSkC87_JTUpCLMowIr4Ol4qYg3kZBWzNcH61Dx';

  function ppaTonAmountToNano(v){
    var s=String(v==null?'':v).trim().replace(',','.');
    if(!/^\d+(?:\.\d{1,9})?$/.test(s))return '';
    var p=s.split('.'),whole=(p[0]||'0').replace(/^0+(?=\d)/,''),frac=((p[1]||'')+'000000000').slice(0,9);
    try{
      var n=BigInt(whole||'0')*1000000000n+BigInt(frac||'0');
      return n>0n?n.toString():'';
    }catch(_){return ''}
  }

  function ppaTonDepositAmount(payload){
    payload=payload||{};
    var v=payload.amount;
    if(v==null)v=payload.value;
    if(v==null)v=payload.gram;
    if(v==null)v=payload.sum;
    return v;
  }

  function ppaTonConnectedAddress(){
    try{
      var ui=window.PPA_TON_UI;
      var a=ui&&ui.account&&ui.account.address;
      if(!a&&ui&&ui.wallet&&ui.wallet.account)a=ui.wallet.account.address;
      return String(a||'');
    }catch(_){return ''}
  }

  async function ppaTonDeposit(payload){
    var amount=ppaTonDepositAmount(payload),nano=ppaTonAmountToNano(amount);
    if(!nano)throw new Error('Введите корректную сумму TON');
    if(BigInt(nano)<1000000000n){
      try{gramWalletResult(false,'Минимальное пополнение — 1 Gram (1 TON)')}catch(_){}
      throw new Error('Минимальное пополнение — 1 Gram (1 TON)');
    }
    var ui=window.PPA_TON_UI;
    var walletAddress=ppaTonConnectedAddress();
    if(!ui||!window.PPA_TON_CONNECTED||!ui.connected||!walletAddress){
      try{gramWalletResult(false,'Сначала подключи TON Wallet через TON Connect')}catch(_){}
      throw new Error('TON Connect не подключён');
    }

    var result;
    try{
      // No await before sendTransaction: keep the original Android/Telegram click
      // activation so the SDK can deep-link straight to the wallet.
      result=await ui.sendTransaction({
        validUntil:Math.floor(Date.now()/1000)+300,
        network:'-239',
        messages:[{address:PPA_TON_TREASURY,amount:nano}]
      },{skipRedirectToWallet:'never'});
    }catch(err){
      var em=String(err&&err.message||err||'Транзакция отменена');
      if(/reject|declin|cancel/i.test(em))em='Перевод TON отменён';
      try{gramWalletResult(false,em)}catch(_){}
      throw new Error(em);
    }

    if(!result||!result.boc)throw new Error('TON Connect не вернул подписанную транзакцию');
    try{gramWalletResult(false,'TON отправлен · жду подтверждение сети…')}catch(_){}

    var messageHash='';
    for(var attempt=0;attempt<14;attempt++){
      var body={
        amount:String(amount).replace(',','.'),
        nanoAmount:nano,
        walletAddress:walletAddress,
        messageHash:messageHash
      };
      if(!messageHash)body.boc=result.boc;
      var r=await PPA.ppaWalletDeposit(body);
      if(r&&r.messageHash)messageHash=String(r.messageHash);
      if(r&&r.ok){
        if(Number.isFinite(Number(r.gameGram))){
          INV.gram=Math.max(0,Number(r.gameGram)||0);
          try{saveGame();sendInvState();sendPremiumState();sendGramWalletState();updateUI()}catch(_){}
        }
        try{ppaRefreshTonBalance(walletAddress)}catch(_){}
        try{gramWalletResult(true,r.message||('Пополнено +'+String(amount)+' Gram'))}catch(_){}
        return r;
      }
      if(!(r&&r.pending))throw new Error((r&&r.message)||'Сервер не подтвердил TON-транзакцию');
      try{gramWalletResult(false,(r&&r.message)||'Жду подтверждение TON…')}catch(_){}
      await new Promise(function(resolve){setTimeout(resolve,1600)});
    }
    var pending={ok:false,pending:true,messageHash:messageHash,message:'TON отправлен. Подтверждение сети ещё ожидается — баланс зачислится после проверки.'};
    try{gramWalletResult(false,pending.message)}catch(_){}
    return pending;
  }

  function applyWalletState(r){
    try{
      var p=gramWalletProfile();
      var serverConnected=!!(r&&r.connected);
      var tonConnected=!!(window.PPA_TON_CONNECTED&&window.PPA_TON_UI&&window.PPA_TON_UI.connected);
      p.serverConnected=serverConnected;
      // A saved server address is NOT an active wallet session.
      // Show "connected" only after TON Connect has actually restored/connected.
      p.connected=serverConnected&&tonConnected;
      p.address=String((r&&r.address)||'');
      p.walletGram=null;
      if(r&&Array.isArray(r.history))p.history=r.history.slice(-100);
      var synced=Math.max(0,Number(r&&r.syncCredited)||0);
      if(synced>0&&Number.isFinite(Number(r&&r.gameGram))){
        INV.gram=Math.max(0,Number(r.gameGram)||0);
        try{showPickup('TON ЗАЧИСЛЕН · +'+String(synced).replace('.',',')+' GRAM','#7dff9f')}catch(_){}
      }
      p.updatedAt=Date.now();
      saveGame();sendInvState();sendGramWalletState();sendPremiumState();updateUI();
    }catch(e){console.warn('Wallet state',e)}
  }
  async function refreshWallet(){if(!online()||!PPA.ppaWalletState)return;try{applyWalletState(await PPA.ppaWalletState())}catch(e){console.warn('Wallet sync',e)}}

  async function zeroOnlyLocalTestGram(){
    if(!online()||!PPA.ppaSaveGame)return false;
    var ok=false;
    try{ok=window.confirm('Обнулить только тестовые Gram на этом Telegram-аккаунте?\n\nPPA, предметы, шмот, заточка и прогресс останутся.')}catch(_){ok=false}
    if(!ok)return false;
    try{
      INV.gram=0;
      saveGame();
      var snap=null;try{snap=typeof window.ppaBuildSaveObject==='function'?window.ppaBuildSaveObject():null}catch(_){}
      if(!snap){try{snap=JSON.parse(localStorage.getItem('pxSave')||'null')}catch(_){snap=null}}
      if(snap&&typeof snap==='object'){snap.gram=0;await PPA.ppaSaveGame(snap,window.PPA_CLOUD&&window.PPA_CLOUD.version)}
      try{sendInvState();sendPremiumState();sendAuctionState();sendGramWalletState();updateUI()}catch(_){}
      try{showPickup('ТЕСТОВЫЕ GRAM ОБНУЛЕНЫ','#7dff9f')}catch(_){}
      return true;
    }catch(e){
      try{showPickup('НЕ УДАЛОСЬ ОБНУЛИТЬ GRAM','#ff7777')}catch(_){}
      console.warn('Gram reset',e);return false;
    }
  }

  function attachGramResetGesture(){
    try{
      var f=document.getElementById('gramWalletFrame');if(!f||!f.contentDocument)return;
      var el=f.contentDocument.getElementById('gameGram');if(!el||el.dataset.ppaResetGesture==='1')return;
      el.dataset.ppaResetGesture='1';
      var timer=0;
      function stop(){if(timer){clearTimeout(timer);timer=0}}
      function start(){stop();timer=setTimeout(function(){timer=0;zeroOnlyLocalTestGram()},1800)}
      el.addEventListener('pointerdown',start);el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);el.addEventListener('pointerleave',stop);
    }catch(_){}
  }

  function tradeSeenKey(id){return 'ppaClanTradeAppliedV563:'+String(id||'')}
  function handleCompletedTradeState(st){
    try{
      var tr=st&&st.tradeSession;if(!tr||tr.status!=='completed'||!tr.id)return;
      var k=tradeSeenKey(tr.id);if(localStorage.getItem(k)==='1')return;
      localStorage.setItem(k,'1');
      try{showPickup('КЛАНОВЫЙ ОБМЕН ЗАВЕРШЁН · СИНХРОНИЗАЦИЯ','#8dff9a')}catch(_){}
      setTimeout(function(){location.reload()},450);
    }catch(_){}
  }
  function pushClanState(r){
    if(r&&r.state){
      window.PPA_SERVER_CLAN_STATE=r.state;
      if(window.PPA_SET_CLAN_STATE)window.PPA_SET_CLAN_STATE(r.state);
      if(r.state.bossState&&window.PPA_CLAN_BOSS_RT_APPLY_STATE)window.PPA_CLAN_BOSS_RT_APPLY_STATE(r.state.bossState);
      handleCompletedTradeState(r.state);
    }
    return r
  }
  async function flushClanTradeSave(){
    if(!PPA.ppaSaveGame)return;
    var snap=null;try{snap=typeof window.ppaBuildSaveObject==='function'?window.ppaBuildSaveObject():null}catch(_){}
    if(!snap){try{snap=JSON.parse(localStorage.getItem('pxSave')||'null')}catch(_){snap=null}}
    if(snap&&typeof snap==='object')await PPA.ppaSaveGame(snap,window.PPA_CLOUD&&window.PPA_CLOUD.version);
  }
  async function clanCall(req){
    req=Object.assign({},req||{});
    if(req.action==='join')req.action='apply';
    if(req.action==='acceptMember')req.action='acceptApplication';
    return pushClanState(await PPA.ppaClanAction(req));
  }

  var adminRewardSeedTried=false;
  async function seedAdminEventRewardStock(){
    if(adminRewardSeedTried)return;
    adminRewardSeedTried=true;
    if(!online()||!window.PPA||!PPA.ppaAdminEventRewardStockAccess||typeof window.PPA_ADMIN_EVENT_REWARD_STOCK!=='function')return;
    try{
      var access=await PPA.ppaAdminEventRewardStockAccess();
      if(!access||!access.authorized)return;
      var seeded=window.PPA_ADMIN_EVENT_REWARD_STOCK();
      var added=Math.max(0,Number(seeded&&seeded.added)||0);
      if(!added)return;
      try{saveGame()}catch(_){}
      try{if(typeof sendStorageState==='function')sendStorageState()}catch(_){}
      try{if(typeof sendInvState==='function')sendInvState()}catch(_){}
      try{if(typeof updateUI==='function')updateUI()}catch(_){}
      try{
        var snap=typeof window.ppaBuildSaveObject==='function'?window.ppaBuildSaveObject():null;
        var version=window.PPA_CLOUD&&Number.isFinite(Number(PPA_CLOUD.version))?Number(PPA_CLOUD.version):null;
        if(snap&&PPA.ppaSaveGame)await PPA.ppaSaveGame(snap,version);
      }catch(e){console.warn('Admin reward stock cloud save',e)}
      try{showPickup('ПРЕМИУМ ХРАНИЛИЩЕ · ДОБАВЛЕНО '+added+' НАГРАД','#ffcf63')}catch(_){}
    }catch(e){
      if(Number(e&&e.status)!==403)console.warn('Admin event reward stock',e);
    }
  }

  function install(){
    if(installed)return true;
    if(!online())return false;
    if(!window.PPA||!PPA.ppaClanState||!PPA.ppaAuctionList||!PPA.ppaWalletState)return false;
    installed=true;

    window.PPA_CLAN_HANDLER=clanCall;
    window.PPA_CLAN_STORAGE_HANDLER=async function(req){
      req=Object.assign({},req||{});
      if(req.action==='acceptMember')req.action='acceptApplication';
      if(req.action==='putMany'||req.action==='takeMany'){
        var items=Array.isArray(req.items)?req.items:[],one=req.action==='putMany'?'put':'take',last={ok:true};
        for(var i=0;i<items.length;i++)last=await clanCall({action:one,item:items[i],source:req.source||'keeper'});
        return last;
      }
      var r=await clanCall(req);
      if(r&&r.balances&&Number.isFinite(Number(r.balances.gold)))INV.gold=Math.max(0,Number(r.balances.gold));
      return r;
    };
    window.PPA_CLAN_BOSS_HANDLER=async function(req){
      req=Object.assign({},req||{});
      var originalAction=String(req.action||'');
      if(['enterRaid','joinRaid','enterBoss','bossEnter','startBoss'].indexOf(originalAction)>=0)req.action='startRaid';
      var isBossStart=String(req.action||'')==='startRaid';
      if(isBossStart){
        try{window.__PPA_CLAN_BOSS_SESSION_ENTERED=false;window.__PPA_CLAN_BOSS_ENTRY_AUTH_UNTIL=0}catch(_){}
      }
      var r=await clanCall(req);
      var bs=r&&r.bossState?r.bossState:(r&&r.state&&r.state.bossState?r.state.bossState:null);
      if(bs&&window.PPA_SET_CLAN_BOSS_STATE)window.PPA_SET_CLAN_BOSS_STATE(bs);
      if(bs&&window.PPA_CLAN_BOSS_RT_APPLY_STATE)window.PPA_CLAN_BOSS_RT_APPLY_STATE(bs);
      if(String(req.action||'')==='startRaid'&&bs){
        if(window.PPA_CLAN_BOSS_RT_START)window.PPA_CLAN_BOSS_RT_START(bs);
        var canEnter=bs.active===true||String(bs.status||'')==='fighting'||String(bs.status||'')==='active';
        if(canEnter){
          try{
            window.__PPA_CLAN_BOSS_SESSION_ENTERED=true;
            window.__PPA_CLAN_BOSS_ENTRY_AUTH_UNTIL=Date.now()+10000;
            window.__PPA_CLAN_BOSS_ENTRY_GRACE_UNTIL=Math.max(Number(window.__PPA_CLAN_BOSS_ENTRY_GRACE_UNTIL||0),Date.now()+2500);
          }catch(_){}
          try{if(typeof closeClanMenu==='function')closeClanMenu()}catch(_){}
          try{if(typeof closeClan==='function')closeClan()}catch(_){}
          try{if(typeof closeClanPanel==='function')closeClanPanel()}catch(_){}
          setTimeout(function(){
            try{
              if(typeof changeScene==='function'){
                changeScene('clanboss1');
                try{if(window.PPA_CLAN_BOSS_RT_START)window.PPA_CLAN_BOSS_RT_START(bs)}catch(_){}
                return
              }
              if(typeof window.changeScene==='function'){
                window.changeScene('clanboss1');
                try{if(window.PPA_CLAN_BOSS_RT_START)window.PPA_CLAN_BOSS_RT_START(bs)}catch(_){}
                return
              }
              if(typeof P!=='undefined'&&P){
                P.scene='clanboss1';
                try{if(window.PPA_CLAN_BOSS_RT_START)window.PPA_CLAN_BOSS_RT_START(bs)}catch(_){}
              }
            }catch(e){console.warn('Clan boss enter scene',e)}
          },30);
        }
      }
      return r
    };
    window.PPA_CLAN_BOSS_ENTER=function(){
      return window.PPA_CLAN_BOSS_HANDLER({action:'startRaid'});
    };
    window.PPA_CLAN_SIEGE_HANDLER=clanCall;
    window.PPA_CLAN_TRADE_HANDLER=async function(req){
      req=Object.assign({},req||{});
      var a=String(req.action||'');
      if(a==='setOffer'||a==='confirm'||a==='execute')await flushClanTradeSave();
      var r=await clanCall(req);
      if(r&&r.tradeCompleted&&r.tradeId){
        try{localStorage.setItem(tradeSeenKey(r.tradeId),'1')}catch(_){}
        try{showPickup('ОБМЕН ЗАВЕРШЁН · ОБНОВЛЯЮ СЕЙВ','#8dff9a')}catch(_){}
        setTimeout(function(){location.reload()},350);
      }
      return Object.assign({},r,{clanState:r&&r.state?r.state:null})
    };

    // Replace the old local-only clan administration with authenticated server actions.
    try{
      clanSetAuthority=function(memberId,authority){clanCall({action:'setAuthority',memberId:memberId,authority:authority||{}}).then(function(r){clanNotice((r&&r.message)||'Права сохранены')}).catch(function(e){clanNotice(msg(e))});return true};
      clanTransferLeadership=function(memberId){clanCall({action:'transferLeadership',memberId:memberId}).then(function(r){clanNotice((r&&r.message)||'Права главы переданы')}).catch(function(e){clanNotice(msg(e))});return true};
      clanAcceptApplication=function(appId){clanCall({action:'acceptApplication',appId:appId,applicationId:appId}).then(function(r){clanNotice((r&&r.message)||'Игрок принят')}).catch(function(e){clanNotice(msg(e))});return true};
      clanRejectApplication=function(appId){clanCall({action:'rejectApplication',appId:appId,applicationId:appId}).then(function(r){clanNotice((r&&r.message)||'Заявка отклонена')}).catch(function(e){clanNotice(msg(e))});return true};
      clanKickMember=function(memberId){clanCall({action:'kickMember',memberId:memberId}).then(function(r){clanNotice((r&&r.message)||'Игрок исключён')}).catch(function(e){clanNotice(msg(e))});return true};
      clanSetMemberPermission=function(memberId,perm){clanCall({action:'setPermissions',memberId:memberId,permissions:perm||{}}).then(function(r){clanNotice((r&&r.message)||'Права склада сохранены')}).catch(function(e){clanNotice(msg(e))});return true};
    }catch(e){console.warn('Clan admin hooks',e)}

    var _auctionPlace=auctionPlaceLot;
    auctionPlaceLot=function(ref,qty,price,currency,durationHours){
      var before=new Set((INV.auctionLots||[]).map(function(x){return x&&x.id}));
      _auctionPlace(ref,qty,price,currency,durationHours);
      var lot=(INV.auctionLots||[]).find(function(x){return x&&!before.has(x.id)});if(!lot||!PPA.ppaAuctionPlace)return;
      PPA.ppaAuctionPlace({lot:lot,uiLot:auctionLotForUi(lot)}).then(function(){refreshAuction()}).catch(function(e){
        var i=(INV.auctionLots||[]).findIndex(function(x){return x&&x.id===lot.id});if(i>=0){auctionReturnPayload(INV.auctionLots[i].item,INV.auctionLots[i].qty||1);INV.auctionLots.splice(i,1);saveGame();sendInvState();sendAuctionState();updateUI()}
        auctionNotice('Сервер не принял лот: '+msg(e));
      });
    };
    var _auctionCancel=auctionCancelLot;
    auctionCancelLot=function(id){if(!PPA.ppaAuctionCancel){_auctionCancel(id);return}PPA.ppaAuctionCancel({lotId:id}).then(function(){_auctionCancel(id);refreshAuction()}).catch(function(e){auctionNotice(msg(e));refreshAuction()})};
    window.PPA_AUCTION_BUY_HANDLER=async function(req){
      var r=await PPA.ppaAuctionBuy(req||{});
      if(r&&r.ok){if(r.balances){INV.gram=Math.max(0,Number(r.balances.gram)||0);INV.ppa=Math.max(0,Number(r.balances.ppa)||0)}auctionReturnPayload(r.item,Math.max(1,Math.floor(Number(r.qty)||1)));saveGame();sendInvState();sendAuctionState();sendPremiumState();updateUI();refreshAuction()}
      return r;
    };

    gramWalletLink=function(address){if(!PPA.ppaWalletLink){gramWalletResult(false,'Сервер Wallet недоступен');return}PPA.ppaWalletLink(address).then(function(r){applyWalletState(r);gramWalletResult(true,'TON Connect подключён · адрес синхронизирован с сервером')}).catch(function(e){gramWalletResult(false,msg(e))})};
    gramWalletUnlink=function(){if(!PPA.ppaWalletUnlink){gramWalletResult(false,'Сервер Wallet недоступен');return}PPA.ppaWalletUnlink().then(function(r){applyWalletState(r);gramWalletResult(true,r.message||'Gram Wallet отвязан')}).catch(function(e){gramWalletResult(false,msg(e))})};
    window.PPA_GRAM_WALLET_DEPOSIT_HANDLER=function(payload){return ppaTonDeposit(payload)};
    window.PPA_GRAM_WALLET_WITHDRAW_HANDLER=function(payload){
      payload=payload||{};
      var amount=Number(payload.amount!=null?payload.amount:(payload.value!=null?payload.value:payload.gram));
      if(!Number.isFinite(amount)||amount<15){
        try{gramWalletResult(false,'Минимальный вывод — 15 Gram (15 TON)')}catch(_){}
        return Promise.reject(new Error('Минимальный вывод — 15 Gram (15 TON)'));
      }
      return PPA.ppaWalletWithdraw(payload).then(function(r){
        if(r&&r.ok){
          if(Number.isFinite(Number(r.gameGram)))INV.gram=Math.max(0,Number(r.gameGram)||0);
          try{saveGame();sendInvState();sendPremiumState();sendGramWalletState();updateUI()}catch(_){}
          try{gramWalletResult(true,r.message||'Заявка на вывод создана')}catch(_){}
        }
        return r;
      });
    };
    var _openWallet=openGramWallet;openGramWallet=function(){_openWallet();setTimeout(refreshWallet,30);setTimeout(refreshWallet,2500);setTimeout(refreshWallet,7000);setTimeout(attachGramResetGesture,120)};window.openGramWallet=openGramWallet;
    premiumWalletLink=function(){try{closePremiumStore()}catch(_){};openGramWallet()};premiumWalletDeposit=function(){try{closePremiumStore()}catch(_){};openGramWallet()};premiumWalletWithdraw=function(){try{closePremiumStore()}catch(_){};openGramWallet()};

    setTimeout(function(){refreshClan();refreshAuction();refreshWallet();seedAdminEventRewardStock()},200);
    setInterval(refreshAuction,15000);
    setInterval(refreshClan,10000);
    return true;
  }

  function boot(){
    if(install())return;
    if(Date.now()-installStartedAt<30000)setTimeout(boot,350);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  setTimeout(boot,800);
})();
