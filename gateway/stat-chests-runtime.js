(function(){
  'use strict';

  var CFG={
    emerald:{
      tier:'emerald',name:'Изумрудный сундук ОХ',rarity:'uncommon',
      min:2,max:50,jackpot:50,price:3,minGram:3,minPpa:3000,
      refId:'stat_chest_emerald',img:'/assets/stat-chest-emerald.svg',color:'#74e58a',
      odds:'2 ОХ — 55% · 3–5 — 25% · 6–10 — 12% · 11–20 — 5% · 21–30 — 2% · 31–49 — 0.8% · 50 — 0.2%'
    },
    sapphire:{
      tier:'sapphire',name:'Сапфировый сундук ОХ',rarity:'rare',
      min:5,max:80,jackpot:80,price:7,minGram:7,minPpa:7000,
      refId:'stat_chest_sapphire',img:'/assets/stat-chest-sapphire.svg',color:'#67a8ff',
      odds:'5 ОХ — 55% · 6–10 — 20% · 11–20 — 12% · 21–35 — 7% · 36–50 — 3% · 51–79 — 2.6% · 80 — 0.4%'
    },
    amethyst:{
      tier:'amethyst',name:'Аметистовый сундук ОХ',rarity:'epic',
      min:10,max:110,jackpot:110,price:17,minGram:17,minPpa:17000,
      refId:'stat_chest_amethyst',img:'/assets/stat-chest-amethyst.svg',color:'#c47aff',
      odds:'10 ОХ — 49% · 11–20 — 15% · 21–35 — 12% · 36–50 — 9% · 51–70 — 6% · 71–90 — 4% · 91–109 — 4.5% · 110 — 0.5%'
    }
  };

  function tier(v){
    v=String(v||'').trim().toLowerCase();
    if(v.indexOf('stat_chest_')===0)v=v.slice('stat_chest_'.length);
    if(v.indexOf('statchest')===0)v=v.slice('statchest'.length);
    return CFG[v]?v:'';
  }

  function config(value){
    if(typeof value==='string')return CFG[tier(value)]||null;
    if(!value||typeof value!=='object')return null;
    var x=value.gear&&typeof value.gear==='object'?value.gear:value;
    var looks=x.statChest===true||
      String(x.refId||'').indexOf('stat_chest_')===0||
      String(x.uid||'').indexOf('stat_chest_')===0;
    if(!looks)return null;
    return CFG[tier(x.statChestTier||x.refId||x.uid)]||null;
  }

  function count(it){
    if(!it)return 0;
    var n=it.count;
    if(n==null)n=it.qty;
    if(n==null)n=it.amount;
    return Math.max(0,Math.floor(Number(n)||0));
  }

  function setCount(it,n){
    n=Math.max(0,Math.floor(Number(n)||0));
    it.count=n;it.qty=n;it.amount=n;
    return n;
  }

  function find(t){
    t=tier(t);
    try{
      return (INV.bag||[]).find(function(it){
        var c=config(it);
        return c&&c.tier===t&&count(it)>0;
      })||null;
    }catch(_){return null}
  }

  function make(t,n){
    var c=CFG[tier(t)];
    if(!c)return null;
    n=Math.max(1,Math.floor(Number(n)||1));
    return {
      uid:c.refId,refId:c.refId,
      name:c.name,kind:'resource',
      rarity:c.rarity,
      rarityName:c.rarity==='uncommon'?'Необычный':(c.rarity==='rare'?'Редкий':'Эпический'),
      icon:'🎁',ic:'🎁',img:c.img,
      classKey:'all',className:'Все классы',
      count:n,qty:n,amount:n,stackable:true,
      sell:0,stats:{},bound:false,tradeLocked:false,blackMarket:false,
      statChest:true,statChestTier:c.tier,
      statChestMin:c.min,statChestMax:c.max,statChestJackpot:c.jackpot,
      auctionMinGram:c.minGram,auctionMinPpa:c.minPpa,
      bonusText:'Сундук ОХ · '+c.min+'–'+c.max+' ОХ · '+c.jackpot+' ОХ — джекпот',
      desc:'Гарантированный минимум: '+c.min+' ОХ. Максимум: '+c.max+' ОХ. '+c.odds
    };
  }

  function give(t,n,silent){
    var c=CFG[tier(t)];
    if(!c)return 0;
    n=Math.max(1,Math.floor(Number(n)||1));
    try{
      if(!Array.isArray(INV.bag))INV.bag=[];
      var it=find(c.tier);
      if(!it){
        if(INV.bag.length>=100){
          if(!silent&&typeof showPickup==='function')showPickup('Сумка полна · сундук не помещается','#ff8c78');
          return 0;
        }
        it=make(c.tier,n);
        INV.bag.push(it);
      }else{
        setCount(it,count(it)+n);
        it.img=c.img;
      }
      if(!silent&&typeof showPickup==='function')showPickup(c.name+' ×'+n,c.color);
      return n;
    }catch(_){return 0}
  }

  async function openChest(it){
    var c=config(it);
    if(!c)return false;
    if(!window.PPA||typeof PPA.ppaStatChestOpen!=='function'){
      try{showPickup('Сервер сундуков ОХ недоступен','#ff7777')}catch(_){}
      return false;
    }
    var local=find(c.tier);
    if(!local)return false;
    if(local.__ppaOpening)return false;
    local.__ppaOpening=true;
    try{
      var requestId='ox_'+c.tier+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
      var r=await PPA.ppaStatChestOpen({tier:c.tier,requestId:requestId});
      if(!r||r.ok===false)throw new Error((r&&r.message)||'Сундук не открыт');

      local=find(c.tier);
      if(local){
        var left=count(local)-1;
        if(left>0)setCount(local,left);
        else{
          var idx=INV.bag.indexOf(local);
          if(idx>=0)INV.bag.splice(idx,1);
        }
      }

      P.statPts=Math.max(0,Math.floor(Number(r.statPts)||0));
      if(!INV.premiumShop||typeof INV.premiumShop!=='object')INV.premiumShop={purchasedBundles:{}};
      INV.premiumShop.statPointsPurchased=Math.max(0,Math.floor(Number(r.statPointsPurchased)||0));

      try{saveGame()}catch(_){}
      try{sendInvState();sendAuctionState();sendPremiumState();updateUI()}catch(_){}

      var amount=Math.max(c.min,Math.floor(Number(r.amount)||c.min));
      var text=(r.jackpot?'🔥 ДЖЕКПОТ · ':'')+c.name+' · +'+amount+' ОХ';
      try{showPickup(text,r.jackpot?'#ffd45b':c.color)}catch(_){}
      return true;
    }catch(e){
      try{showPickup(String((e&&e.message)||'Не удалось открыть сундук'),'#ff7777')}catch(_){}
      return false;
    }finally{
      try{
        var x=find(c.tier);
        if(x)x.__ppaOpening=false;
      }catch(_){}
    }
  }

  function openConfirm(it){
    var c=config(it);
    if(!c)return false;
    var ok=true;
    try{
      ok=window.confirm(
        'Открыть «'+c.name+'»?\n\n'+
        'Минимум: '+c.min+' ОХ\n'+
        'Джекпот: '+c.jackpot+' ОХ\n\n'+
        c.odds
      );
    }catch(_){}
    if(ok)openChest(it);
    return ok;
  }

  function installAuctionHooks(){
    if(window.__PPA_STAT_CHEST_AUCTION_HOOKS_V662)return true;
    if(typeof window.auctionItemsForUi!=='function'||typeof window.auctionAttachMinPrices!=='function')return false;

    var baseItems=window.auctionItemsForUi;
    window.auctionItemsForUi=function(){
      var out=[];
      try{out=baseItems.apply(this,arguments)||[]}catch(_){out=[]}
      try{
        (INV.bag||[]).forEach(function(it,idx){
          var c=config(it);
          if(!c||count(it)<=0)return;
          var exists=out.some(function(x){
            return x&&(
              String(x.uid||'')===String(it.uid||'')||
              (x.statChest===true&&Number(x.ref)===idx)
            );
          });
          if(exists)return;
          var y=Object.assign({},it);
          y.ref=idx;
          y.count=count(it);y.qty=y.count;y.amount=y.count;
          y.auctionMinGram=c.minGram;y.auctionMinPpa=c.minPpa;
          out.push(y);
        });
      }catch(_){}
      return out;
    };

    var baseMin=window.auctionAttachMinPrices;
    window.auctionAttachMinPrices=function(it){
      var x=it;
      try{x=baseMin(it)||it}catch(_){}
      try{
        var c=config(x);
        if(c){
          x.auctionMinGram=c.minGram;x.auctionMinPpa=c.minPpa;
          x.minGram=c.minGram;x.minPpa=c.minPpa;x.minPPA=c.minPpa;
          x.minPriceGram=c.minGram;x.minPricePpa=c.minPpa;x.minPricePPA=c.minPpa;
        }
      }catch(_){}
      return x;
    };

    window.__PPA_STAT_CHEST_AUCTION_HOOKS_V662=true;
    return true;
  }

  function bootAuction(){
    if(installAuctionHooks())return;
    setTimeout(bootAuction,350);
  }

  window.PPA_STAT_CHEST_CONFIG=CFG;
  window.PPA_STAT_CHEST_TIER=tier;
  window.PPA_STAT_CHEST_CONFIG_FROM_ITEM=config;
  window.PPA_STAT_CHEST_COUNT=count;
  window.PPA_SET_STAT_CHEST_COUNT=setCount;
  window.PPA_FIND_STAT_CHEST=find;
  window.PPA_MAKE_STAT_CHEST=make;
  window.PPA_GIVE_STAT_CHEST=give;
  window.PPA_OPEN_STAT_CHEST=openConfirm;
  window.PPA_OPEN_STAT_CHEST_DIRECT=openChest;

  bootAuction();
})();
