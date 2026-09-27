(function(){
  'use strict';

  var STACK_MAX=999;
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
    n=Math.max(0,Math.min(STACK_MAX,Math.floor(Number(n)||0)));
    it.count=n;it.qty=n;it.amount=n;
    return n;
  }

  function findIn(arr,t,needRoom){
    t=tier(t);
    arr=Array.isArray(arr)?arr:[];
    return arr.find(function(it){
      var c=config(it),n=count(it);
      return c&&c.tier===t&&n>0&&(!needRoom||n<STACK_MAX);
    })||null;
  }

  function find(t){
    try{return findIn(INV.bag||[],t,false)}catch(_){return null}
  }

  function arrayCap(arr){
    try{
      if(arr===INV.bag)return 100;
      if(INV.storage&&(arr===INV.storage.personal||arr===INV.storage.clan||arr===INV.storage.premium))return 50;
    }catch(_){}
    return 100;
  }

  function availableChestCapacity(arr,t){
    arr=Array.isArray(arr)?arr:[];
    var free=0,t0=tier(t);
    for(var i=0;i<arr.length;i++){
      var c=config(arr[i]);
      if(c&&c.tier===t0)free+=Math.max(0,STACK_MAX-count(arr[i]));
    }
    free+=Math.max(0,arrayCap(arr)-arr.length)*STACK_MAX;
    return free;
  }

  function mergeChestIntoArray(arr,item,n){
    if(!Array.isArray(arr))return 0;
    var c=config(item);if(!c)return 0;
    n=Math.max(0,Math.floor(Number(n)||0));
    if(!n||availableChestCapacity(arr,c.tier)<n)return 0;
    var left=n,moved=0;
    while(left>0){
      var existing=findIn(arr,c.tier,true);
      if(existing){
        var add=Math.min(left,STACK_MAX-count(existing));
        setCount(existing,count(existing)+add);
        existing.img=c.img;
        moved+=add;left-=add;
        continue;
      }
      if(arr.length>=arrayCap(arr))break;
      var addNew=Math.min(left,STACK_MAX);
      var x=Object.assign({},item);
      x.uid=c.refId;x.refId=c.refId;x.name=c.name;x.kind='resource';
      x.statChest=true;x.statChestTier=c.tier;
      x.statChestMin=c.min;x.statChestMax=c.max;x.statChestJackpot=c.jackpot;
      x.stackable=true;x.bound=false;x.tradeLocked=false;x.blackMarket=false;x.img=c.img;
      setCount(x,addNew);
      arr.push(x);
      moved+=addNew;left-=addNew;
    }
    return moved;
  }

  function make(t,n){
    var c=CFG[tier(t)];
    if(!c)return null;
    n=Math.max(1,Math.min(STACK_MAX,Math.floor(Number(n)||1)));
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
      var template=make(c.tier,Math.min(n,STACK_MAX));
      var moved=mergeChestIntoArray(INV.bag,template,n);
      if(moved!==n){
        if(!silent&&typeof showPickup==='function')showPickup('Недостаточно места для сундуков ОХ','#ff8c78');
        return 0;
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

  function storageArray(key){
    try{
      if(key==='bag'||key==='inventory')return INV.bag;
      if(!INV.storage)return null;
      if(key==='personal'||key==='clan'||key==='premium')return INV.storage[key];
    }catch(_){}
    return null;
  }

  function storageKey(v){
    v=String(v||'').trim().toLowerCase();
    if(/premium|прем/.test(v))return 'premium';
    if(/personal|личн/.test(v))return 'personal';
    if(/clan|клан/.test(v))return 'clan';
    if(/bag|inventory|инвентар|сумк/.test(v))return 'bag';
    return '';
  }

  function syncChestMove(){
    try{saveGame()}catch(_){}
    try{sendInvState();sendStorageState();sendAuctionState();updateUI()}catch(_){}
  }

  function moveChestStack(from,to,idx){
    idx=Math.floor(Number(idx));
    if(!Array.isArray(from)||!Array.isArray(to)||idx<0||idx>=from.length)return false;
    var item=from[idx],c=config(item);
    if(!c)return false;
    var n=count(item);
    if(n<=0){from.splice(idx,1);syncChestMove();return true}
    if(availableChestCapacity(to,c.tier)<n){
      try{showPickup('Недостаточно места · сундуки складываются до 999 в ячейке','#ff8c78')}catch(_){}
      return true;
    }
    var moved=mergeChestIntoArray(to,item,n);
    if(moved!==n){
      try{showPickup('Не удалось переместить весь стек сундуков','#ff7777')}catch(_){}
      return true;
    }
    from.splice(idx,1);
    syncChestMove();
    try{showPickup(c.name+' ×'+n+' перемещён',c.color)}catch(_){}
    return true;
  }

  function installStorageHooks(){
    if(window.__PPA_STAT_CHEST_STORAGE_HOOKS_V663)return true;
    if(typeof window.storageMove!=='function')return false;

    var base=window.storageMove;
    window.storageMove=function(mode,direction,idx,source){
      var i=Math.floor(Number(idx));
      var m=storageKey(mode),src=storageKey(source);
      var dir=String(direction||'').toLowerCase();
      var take=/take|out|withdraw|get|забрат|взят|получ/.test(dir);
      var put=/put|in|deposit|store|полож|сдат|вклад/.test(dir);

      try{
        if(src==='premium'||src==='personal'||src==='clan'){
          var from=storageArray(src);
          if(from&&config(from[i])&&(!put||take))return moveChestStack(from,INV.bag,i);
        }
        if(src==='bag'){
          var target=storageArray(m);
          if(target&&config(INV.bag&&INV.bag[i]))return moveChestStack(INV.bag,target,i);
        }
        if(m==='premium'||m==='personal'||m==='clan'){
          var box=storageArray(m);
          var storageItem=box&&box[i];
          var bagItem=INV.bag&&INV.bag[i];
          if(take&&storageItem&&config(storageItem))return moveChestStack(box,INV.bag,i);
          if(put&&bagItem&&config(bagItem))return moveChestStack(INV.bag,box,i);
          if(storageItem&&config(storageItem)&&!(bagItem&&config(bagItem)))return moveChestStack(box,INV.bag,i);
          if(bagItem&&config(bagItem)&&!(storageItem&&config(storageItem)))return moveChestStack(INV.bag,box,i);
        }
      }catch(e){
        console.warn('PPA OX chest storage move',e);
      }
      return base.apply(this,arguments);
    };

    window.__PPA_STAT_CHEST_STORAGE_HOOKS_V663=true;
    return true;
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
    var a=installAuctionHooks();
    var b=installStorageHooks();
    if(a&&b)return;
    setTimeout(bootAuction,350);
  }

  window.PPA_STAT_CHEST_STACK_MAX=STACK_MAX;
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
