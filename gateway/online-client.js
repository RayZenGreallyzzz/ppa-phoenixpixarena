(function(){
  'use strict';

  var installed=false;
  var installStartedAt=Date.now();

  function online(){try{return !!(window.PPA&&PPA.isAvailable&&PPA.isAvailable())}catch(_){return false}}
  function msg(e){return String((e&&e.message)||e||'ошибка сервера')}

  async function refreshClan(){
    if(!online()||!PPA.ppaClanState)return;
    try{var r=await PPA.ppaClanState();if(r&&r.state&&window.PPA_SET_CLAN_STATE)window.PPA_SET_CLAN_STATE(r.state)}catch(e){console.warn('Clan sync',e)}
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

  function applyWalletState(r){
    try{
      var p=gramWalletProfile();p.connected=!!(r&&r.connected);p.address=String((r&&r.address)||'');p.walletGram=null;
      if(r&&Array.isArray(r.history))p.history=r.history.slice(-100);p.updatedAt=Date.now();saveGame();sendGramWalletState();sendPremiumState();
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

  function install(){
    if(installed)return true;
    if(!online())return false;
    if(!window.PPA||!PPA.ppaClanState||!PPA.ppaAuctionList||!PPA.ppaWalletState)return false;
    installed=true;

    window.PPA_CLAN_HANDLER=async function(req){
      var r=await PPA.ppaClanAction(req||{});if(r&&r.state&&window.PPA_SET_CLAN_STATE)window.PPA_SET_CLAN_STATE(r.state);return r;
    };
    window.PPA_CLAN_STORAGE_HANDLER=async function(req){
      var r=await PPA.ppaClanAction(req||{});if(r&&r.balances&&Number.isFinite(Number(r.balances.gold)))INV.gold=Math.max(0,Number(r.balances.gold));if(r&&r.state&&window.PPA_SET_CLAN_STATE)window.PPA_SET_CLAN_STATE(r.state);return r;
    };
    window.PPA_CLAN_BOSS_HANDLER=async function(req){
      var r=await PPA.ppaClanAction(req||{});if(r&&r.state&&window.PPA_SET_CLAN_STATE)window.PPA_SET_CLAN_STATE(r.state);if(r&&r.bossState&&window.PPA_SET_CLAN_BOSS_STATE)window.PPA_SET_CLAN_BOSS_STATE(r.bossState);return r;
    };
    window.PPA_CLAN_SIEGE_HANDLER=async function(req){var r=await PPA.ppaClanAction(req||{});if(r&&r.state&&window.PPA_SET_CLAN_STATE)window.PPA_SET_CLAN_STATE(r.state);return r};
    window.PPA_CLAN_TRADE_HANDLER=async function(req){var r=await PPA.ppaClanAction(req||{});return Object.assign({},r,{clanState:r&&r.state?r.state:null})};

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

    gramWalletLink=function(address){if(!PPA.ppaWalletLink){gramWalletResult(false,'Сервер Wallet недоступен');return}PPA.ppaWalletLink(address).then(function(r){applyWalletState(r);gramWalletResult(true,r.message||'Gram Wallet привязан')}).catch(function(e){gramWalletResult(false,msg(e))})};
    gramWalletUnlink=function(){if(!PPA.ppaWalletUnlink){gramWalletResult(false,'Сервер Wallet недоступен');return}PPA.ppaWalletUnlink().then(function(r){applyWalletState(r);gramWalletResult(true,r.message||'Gram Wallet отвязан')}).catch(function(e){gramWalletResult(false,msg(e))})};
    window.PPA_GRAM_WALLET_DEPOSIT_HANDLER=function(payload){return PPA.ppaWalletDeposit(payload)};
    window.PPA_GRAM_WALLET_WITHDRAW_HANDLER=function(payload){return PPA.ppaWalletWithdraw(payload)};
    var _openWallet=openGramWallet;openGramWallet=function(){_openWallet();setTimeout(refreshWallet,30);setTimeout(attachGramResetGesture,120)};window.openGramWallet=openGramWallet;
    premiumWalletLink=function(){try{closePremiumStore()}catch(_){};openGramWallet()};premiumWalletDeposit=function(){try{closePremiumStore()}catch(_){};openGramWallet()};premiumWalletWithdraw=function(){try{closePremiumStore()}catch(_){};openGramWallet()};

    setTimeout(function(){refreshClan();refreshAuction();refreshWallet()},200);
    setInterval(refreshAuction,15000);
    setInterval(refreshClan,30000);
    return true;
  }

  function boot(){
    if(install())return;
    if(Date.now()-installStartedAt<30000)setTimeout(boot,350);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  setTimeout(boot,800);
})();
