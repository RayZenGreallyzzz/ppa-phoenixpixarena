(function(){
  'use strict';

  var STACK_MAX=999;
  var CFG={
    emerald:{
      tier:'emerald',name:'Изумрудный сундук ОХ',rarity:'uncommon',
      min:2,max:50,jackpot:50,price:3,minGram:3,minPpa:3000,
      refId:'stat_chest_emerald',img:'/assets/stat-chest-emerald.png',color:'#74e58a',
      odds:'2 ОХ — 55% · 3–5 — 25% · 6–10 — 12% · 11–20 — 5% · 21–30 — 2% · 31–49 — 0.8% · 50 — 0.2%',
      chanceRows:[['3–5 ОХ','25%'],['6–10 ОХ','12%'],['11–20 ОХ','5%'],['21–30 ОХ','2%'],['31–49 ОХ','0.8%']]
    },
    sapphire:{
      tier:'sapphire',name:'Сапфировый сундук ОХ',rarity:'rare',
      min:5,max:80,jackpot:80,price:7,minGram:7,minPpa:7000,
      refId:'stat_chest_sapphire',img:'/assets/stat-chest-sapphire.png',color:'#67a8ff',
      odds:'5 ОХ — 55% · 6–10 — 20% · 11–20 — 12% · 21–35 — 7% · 36–50 — 3% · 51–79 — 2.6% · 80 — 0.4%',
      chanceRows:[['6–10 ОХ','20%'],['11–20 ОХ','12%'],['21–35 ОХ','7%'],['36–50 ОХ','3%'],['51–79 ОХ','2.6%']]
    },
    amethyst:{
      tier:'amethyst',name:'Аметистовый сундук ОХ',rarity:'epic',
      min:10,max:110,jackpot:110,price:17,minGram:17,minPpa:17000,
      refId:'stat_chest_amethyst',img:'/assets/stat-chest-amethyst.png',color:'#c47aff',
      odds:'10 ОХ — 49% · 11–20 — 15% · 21–35 — 12% · 36–50 — 9% · 51–70 — 6% · 71–90 — 4% · 91–109 — 4.5% · 110 — 0.5%',
      chanceRows:[['11–20 ОХ','15%'],['21–35 ОХ','12%'],['36–50 ОХ','9%'],['51–70 ОХ','6%'],['71–90 ОХ','4%'],['91–109 ОХ','4.5%']]
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
    var t=tier(x.statChestTier||x.refId||x.uid);
    if(!t){
      var hint=String((x.name||'')+' '+(x.title||'')+' '+(x.img||'')+' '+(x.image||'')).toLowerCase();
      if(hint.indexOf('stat-chest-emerald')>=0||(/изумрудн/.test(hint)&&/сундук/.test(hint)))t='emerald';
      else if(hint.indexOf('stat-chest-sapphire')>=0||(/сапфиров/.test(hint)&&/сундук/.test(hint)))t='sapphire';
      else if(hint.indexOf('stat-chest-amethyst')>=0||(/аметистов/.test(hint)&&/сундук/.test(hint)))t='amethyst';
    }
    return t?CFG[t]:null;
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

  var chestModalItem=null;
  var chestModalBusy=false;

  function chestModalTheme(c){
    if(c.tier==='emerald')return {
      accent:'#69e59a',accent2:'#c9ffdc',glow:'rgba(49,201,109,.28)',
      panel:'linear-gradient(180deg,rgba(12,31,25,.98),rgba(5,13,12,.99))',
      chip:'linear-gradient(180deg,rgba(34,105,66,.58),rgba(15,49,34,.72))'
    };
    if(c.tier==='amethyst')return {
      accent:'#cf83ff',accent2:'#f0d4ff',glow:'rgba(164,75,224,.30)',
      panel:'linear-gradient(180deg,rgba(32,18,42,.98),rgba(12,7,18,.99))',
      chip:'linear-gradient(180deg,rgba(104,47,139,.58),rgba(51,23,70,.72))'
    };
    return {
      accent:'#72b9ff',accent2:'#d5ecff',glow:'rgba(54,139,229,.30)',
      panel:'linear-gradient(180deg,rgba(13,28,46,.98),rgba(5,12,21,.99))',
      chip:'linear-gradient(180deg,rgba(38,91,145,.58),rgba(18,45,75,.72))'
    };
  }

  function ensureChestModal(){
    var old=document.getElementById('ppaOxChestModal');
    if(old)return old;

    var style=document.createElement('style');
    style.id='ppaOxChestModalStyle';
    style.textContent=
      '#ppaOxChestModal{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:calc(12px + env(safe-area-inset-top,0px)) 10px calc(12px + env(safe-area-inset-bottom,0px));background:radial-gradient(circle at 50% 44%,rgba(5,7,10,.30),rgba(0,0,0,.84) 72%);box-sizing:border-box;font-family:Georgia,\'Times New Roman\',serif}'+
      '#ppaOxChestModal *{box-sizing:border-box}'+
      '.ppa-ox-card{position:relative;width:min(52vw,340px);max-height:min(72vh,520px);overflow:auto;padding:14px 12px 10px;border:3px solid #d9a94d;border-radius:4px;color:#f7ecd0;background:radial-gradient(circle at 50% 15%,var(--ox-glow),transparent 32%),linear-gradient(180deg,#071019 0%,#05090d 45%,#020406 100%);box-shadow:0 0 0 2px #5f3d13,0 0 0 5px rgba(220,167,73,.22),0 20px 54px rgba(0,0,0,.84),0 0 34px var(--ox-glow),inset 0 0 60px rgba(0,0,0,.66);-webkit-overflow-scrolling:touch}'+
      '.ppa-ox-card:before,.ppa-ox-card:after{content:\'✦\';position:absolute;top:-7px;width:24px;height:24px;display:grid;place-items:center;color:#ffcf62;font-size:17px;text-shadow:0 0 10px #ffb12f,0 0 18px rgba(255,177,47,.65)}'+
      '.ppa-ox-card:before{left:-5px}.ppa-ox-card:after{right:-5px}'+
      '.ppa-ox-frame-bottom{position:absolute;left:8px;right:8px;bottom:5px;height:1px;background:linear-gradient(90deg,transparent,#f0bd58 15%,#704711 50%,#f0bd58 85%,transparent);pointer-events:none}'+
      '.ppa-ox-gem{position:absolute;left:50%;top:-12px;transform:translateX(-50%) rotate(45deg);width:23px;height:23px;border:2px solid #e5b54d;background:linear-gradient(135deg,var(--ox-accent2),var(--ox-accent));box-shadow:0 0 0 3px #4c2f0e,0 0 20px var(--ox-glow);z-index:3}'+
      '.ppa-ox-gem:after{content:\'\';position:absolute;inset:4px;border:1px solid rgba(255,255,255,.45)}'+
      '.ppa-ox-title{padding:6px 6px 9px;text-align:center;color:#f5d88c;font-size:clamp(14px,2.8vw,21px);font-weight:800;line-height:1.1;text-shadow:0 2px 2px #000,0 0 14px rgba(235,195,94,.28)}'+
      '.ppa-ox-title-name{color:var(--ox-accent);text-shadow:0 0 13px var(--ox-glow)}'+
      '.ppa-ox-hero{display:grid;grid-template-columns:minmax(86px,40%) 1fr;gap:8px;align-items:center;margin:1px 0 8px;padding:8px 10px 7px;border-top:1px solid rgba(226,182,83,.58);border-bottom:1px solid rgba(226,182,83,.58);background:radial-gradient(circle at 25% 55%,var(--ox-glow),transparent 50%),rgba(4,8,12,.42)}'+
      '.ppa-ox-art-wrap{min-height:68px;display:flex;align-items:center;justify-content:center}'+
      '.ppa-ox-img{width:min(100%,104px);height:68px;object-fit:contain;filter:drop-shadow(0 8px 10px rgba(0,0,0,.72)) drop-shadow(0 0 14px var(--ox-glow));transform:scale(1.08)}'+
      '.ppa-ox-values{display:grid;gap:7px;align-content:center}'+
      '.ppa-ox-value{display:grid;grid-template-columns:auto 1fr;align-items:baseline;column-gap:6px;position:relative;padding-bottom:5px}'+
      '.ppa-ox-value:not(:last-child):after{content:\'\';position:absolute;left:0;right:18%;bottom:0;height:1px;background:linear-gradient(90deg,#8d6a2a,transparent)}'+
      '.ppa-ox-value-label{font-size:clamp(11px,2vw,15px);color:#eed59d;white-space:nowrap}'+
      '.ppa-ox-value strong{font-size:clamp(18px,3vw,26px);line-height:1;color:var(--ox-accent2);text-shadow:0 0 13px var(--ox-glow)}'+
      '.ppa-ox-value.jackpot strong{color:#ffd45b;text-shadow:0 0 13px rgba(255,198,61,.45)}'+
      '.ppa-ox-section-head{display:flex;align-items:center;gap:6px;margin:7px 0 6px;color:#efc969;font-size:clamp(11px,2vw,15px);font-weight:800;text-align:center;text-transform:uppercase;letter-spacing:.04em}'+
      '.ppa-ox-section-head:before,.ppa-ox-section-head:after{content:\'\';height:1px;flex:1;background:linear-gradient(90deg,transparent,#b88931,transparent)}'+
      '.ppa-ox-guarantee-bar{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center;padding:7px 10px;margin:0 0 7px;border:2px solid var(--ox-accent);background:linear-gradient(90deg,transparent,var(--ox-glow),transparent),rgba(5,14,20,.78);box-shadow:inset 0 0 18px rgba(0,0,0,.5),0 0 12px var(--ox-glow)}'+
      '.ppa-ox-guarantee-icon{width:10px;height:10px;transform:rotate(45deg);border:2px solid var(--ox-accent2);background:var(--ox-accent);box-shadow:0 0 9px var(--ox-glow)}'+
      '.ppa-ox-guarantee-text{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;font-size:clamp(11px,2vw,15px);color:#f1dba4}'+
      '.ppa-ox-guarantee-text strong{color:var(--ox-accent2);font-size:clamp(16px,2.7vw,23px);text-shadow:0 0 10px var(--ox-glow)}'+
      '.ppa-ox-100{font-size:clamp(15px,2.6vw,22px);font-weight:800;color:#ffe68e;text-shadow:0 0 11px rgba(255,198,61,.38)}'+
      '.ppa-ox-extra-label{margin:4px 0 5px;text-align:center;color:#e6c57c;font-size:clamp(10px,1.8vw,14px);font-weight:700}'+
      '.ppa-ox-list{display:grid;grid-template-columns:1fr 1fr;column-gap:14px;row-gap:3px;padding:3px 8px 4px;border-top:1px solid rgba(187,139,49,.42);border-bottom:1px solid rgba(187,139,49,.42)}'+
      '.ppa-ox-row{display:grid;grid-template-columns:9px 1fr auto;gap:5px;align-items:center;padding:3px 0;font-size:clamp(10px,1.8vw,14px);font-weight:700;line-height:1.1}'+
      '.ppa-ox-row:before{content:\'◇\';color:#ffcf55;text-shadow:0 0 7px rgba(255,190,61,.35)}'+
      '.ppa-ox-row:nth-child(3n+1) .reward,.ppa-ox-row:nth-child(3n+1) .chance{color:#77b9ff}.ppa-ox-row:nth-child(3n+2) .reward,.ppa-ox-row:nth-child(3n+2) .chance{color:#ffd064}.ppa-ox-row:nth-child(3n) .reward,.ppa-ox-row:nth-child(3n) .chance{color:#df7bff}'+
      '.ppa-ox-row .chance{text-align:right;white-space:nowrap;text-shadow:0 0 7px rgba(0,0,0,.7)}'+
      '.ppa-ox-jackpot{margin:5px auto 0;width:min(100%,220px);display:flex;justify-content:center;align-items:baseline;gap:5px;padding:4px 7px;color:#ffd45b;font-size:clamp(12px,2.1vw,17px);font-weight:800;text-align:center;text-shadow:0 0 11px rgba(255,198,61,.4)}'+
      '.ppa-ox-jackpot span{color:#e6c57c;font-size:clamp(9px,1.5vw,12px);font-weight:700;text-transform:uppercase;letter-spacing:.08em}'+
      '.ppa-ox-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px;padding-top:1px}'+
      '.ppa-ox-btn{appearance:none;min-height:40px;border:2px solid #c8953e;border-radius:2px;padding:7px 6px;font-family:Georgia,\'Times New Roman\',serif;font-size:clamp(13px,2vw,16px);font-weight:800;cursor:pointer;touch-action:manipulation;box-shadow:inset 0 0 0 2px rgba(61,36,12,.7),0 4px 12px rgba(0,0,0,.38)}'+
      '.ppa-ox-cancel{color:#f2dba7;background:linear-gradient(180deg,#4a2d1e,#241710)}'+
      '.ppa-ox-open{color:#fff0b5;background:linear-gradient(180deg,#9b681d,#5f390e);box-shadow:inset 0 0 0 2px rgba(80,44,8,.65),0 0 16px rgba(255,185,47,.24),0 4px 12px rgba(0,0,0,.38)}'+
      '.ppa-ox-open:disabled,.ppa-ox-cancel:disabled{opacity:.55;cursor:default}'+
      '@media(max-width:520px){.ppa-ox-card{width:min(56vw,340px);max-height:70vh;padding:12px 8px 9px}.ppa-ox-hero{grid-template-columns:40% 1fr;gap:6px;padding:6px}.ppa-ox-art-wrap{min-height:58px}.ppa-ox-img{height:58px}.ppa-ox-list{column-gap:8px;padding-left:4px;padding-right:4px}.ppa-ox-row{font-size:10.5px;gap:3px}.ppa-ox-guarantee-bar{padding:5px 6px;gap:5px}.ppa-ox-actions{gap:7px}.ppa-ox-btn{min-height:38px;font-size:13px}}'+
      '@media(max-width:370px){.ppa-ox-card{width:min(62vw,320px);padding-left:7px;padding-right:7px}.ppa-ox-title{font-size:13px}.ppa-ox-value-label{font-size:10px}.ppa-ox-value strong{font-size:18px}.ppa-ox-list{column-gap:6px}.ppa-ox-row{font-size:9.5px}.ppa-ox-guarantee-text{font-size:10px}.ppa-ox-guarantee-text strong{font-size:15px}.ppa-ox-100{font-size:14px}}';
    document.head.appendChild(style);

    var root=document.createElement('div');
    root.id='ppaOxChestModal';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.innerHTML=
      '<div class="ppa-ox-card" id="ppaOxChestCard">'+
        '<div class="ppa-ox-gem"></div>'+
        '<div class="ppa-ox-title">Открыть «<span class="ppa-ox-title-name" id="ppaOxChestTitle"></span>»?</div>'+
        '<div class="ppa-ox-hero">'+
          '<div class="ppa-ox-art-wrap"><img class="ppa-ox-img" id="ppaOxChestImg" alt=""></div>'+
          '<div class="ppa-ox-values">'+
            '<div class="ppa-ox-value"><span class="ppa-ox-value-label">Минимум:</span><strong id="ppaOxChestMin"></strong></div>'+
            '<div class="ppa-ox-value jackpot"><span class="ppa-ox-value-label">Джекпот:</span><strong id="ppaOxChestMax"></strong></div>'+
          '</div>'+
        '</div>'+
        '<div class="ppa-ox-section-head">Награды и шансы</div>'+
        '<div class="ppa-ox-guarantee-bar">'+
          '<span class="ppa-ox-guarantee-icon"></span>'+
          '<div class="ppa-ox-guarantee-text"><span>Гарантировано:</span><strong id="ppaOxChestGuaranteed"></strong></div>'+
          '<div class="ppa-ox-100">100%</div>'+
        '</div>'+
        '<div class="ppa-ox-extra-label">Дополнительно может выпасть:</div>'+
        '<div class="ppa-ox-list" id="ppaOxChestRows"></div>'+
        '<div class="ppa-ox-jackpot"><span>Джекпот</span><strong id="ppaOxChestJackpot"></strong></div>'+
        '<div class="ppa-ox-actions">'+
          '<button class="ppa-ox-btn ppa-ox-cancel" id="ppaOxChestCancel" type="button">Отмена</button>'+
          '<button class="ppa-ox-btn ppa-ox-open" id="ppaOxChestOpen" type="button">Открыть</button>'+
        '</div>'+
        '<div class="ppa-ox-frame-bottom"></div>'+
      '</div>';
    document.body.appendChild(root);

    function close(){
      if(chestModalBusy)return;
      root.style.display='none';
      chestModalItem=null;
    }
    root.addEventListener('pointerdown',function(e){
      if(e.target===root)close();
    },{passive:true});
    document.getElementById('ppaOxChestCancel').addEventListener('click',close);
    document.getElementById('ppaOxChestOpen').addEventListener('click',async function(){
      if(chestModalBusy||!chestModalItem)return;
      chestModalBusy=true;
      var openBtn=document.getElementById('ppaOxChestOpen');
      var cancelBtn=document.getElementById('ppaOxChestCancel');
      openBtn.disabled=true;cancelBtn.disabled=true;openBtn.textContent='Открываю…';
      try{
        var ok=await openChest(chestModalItem);
        if(ok){root.style.display='none';chestModalItem=null}
      }finally{
        chestModalBusy=false;
        openBtn.disabled=false;cancelBtn.disabled=false;openBtn.textContent='Открыть';
      }
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&root.style.display!=='none'&&!chestModalBusy)close();
    });
    return root;
  }

  function openConfirm(it){
    var c=config(it);
    if(!c)return false;
    var root=ensureChestModal(),theme=chestModalTheme(c);
    chestModalItem=it;
    root.style.setProperty('--ox-accent',theme.accent);
    root.style.setProperty('--ox-accent2',theme.accent2);
    root.style.setProperty('--ox-glow',theme.glow);
    root.style.setProperty('--ox-panel',theme.panel);
    root.style.setProperty('--ox-chip',theme.chip);

    document.getElementById('ppaOxChestTitle').textContent=c.name;
    var img=document.getElementById('ppaOxChestImg');
    img.src=c.img||'';img.alt=c.name;
    document.getElementById('ppaOxChestMin').textContent=c.min+' ОХ';
    document.getElementById('ppaOxChestMax').textContent=c.jackpot+' ОХ';
    document.getElementById('ppaOxChestGuaranteed').textContent=c.min+' ОХ';

    var rows=document.getElementById('ppaOxChestRows');
    rows.innerHTML='';
    (c.chanceRows||[]).forEach(function(row){
      var el=document.createElement('div');
      el.className='ppa-ox-row';
      var reward=document.createElement('span');reward.className='reward';reward.textContent=row[0];
      var chance=document.createElement('span');chance.className='chance';chance.textContent=row[1];
      el.appendChild(reward);el.appendChild(chance);rows.appendChild(el);
    });

    document.getElementById('ppaOxChestJackpot').textContent=c.jackpot+' ОХ — '+(
      c.tier==='emerald'?'0.2%':(c.tier==='sapphire'?'0.4%':'0.5%')
    );

    root.style.display='flex';
    try{document.getElementById('ppaOxChestOpen').focus({preventScroll:true})}catch(_){}
    return true;
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
          hydrateChestVisual(y);
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
          hydrateChestVisual(x);
        }
      }catch(_){}
      return x;
    };

    window.__PPA_STAT_CHEST_AUCTION_HOOKS_V662=true;
    return true;
  }

  function hydrateChestVisual(it){
    try{
      var c=config(it);
      if(!c)return 0;
      var art=c.img;
      var changed=0;
      ['img','image','art','cardArt','iconArt','iconImg','src'].forEach(function(k){
        if(it[k]!==art){it[k]=art;changed++}
      });
      it.statChest=true;
      it.statChestTier=c.tier;
      return changed;
    }catch(_){return 0}
  }

  function refreshChestArtEverywhere(){
    var changed=0;
    try{
      var groups=[];
      if(Array.isArray(INV.bag))groups.push(INV.bag);
      if(INV.storage){
        if(Array.isArray(INV.storage.personal))groups.push(INV.storage.personal);
        if(Array.isArray(INV.storage.clan))groups.push(INV.storage.clan);
        if(Array.isArray(INV.storage.premium))groups.push(INV.storage.premium);
      }
      groups.forEach(function(arr){
        arr.forEach(function(it){changed+=hydrateChestVisual(it)});
      });
      (INV.auctionLots||[]).forEach(function(lot){
        var it=lot&&lot.item&&(lot.item.gear||lot.item);
        if(it)changed+=hydrateChestVisual(it);
      });
    }catch(_){}
    return changed;
  }

  function bootAuction(){
    refreshChestArtEverywhere();
    var a=installAuctionHooks();
    var b=installStorageHooks();
    if(a&&b)return;
    setTimeout(bootAuction,350);
  }

  // Two light repair passes are enough for old cloud saves. UI serializers
  // already hydrate chest art by refId, so avoid permanent wrappers/intervals.
  setTimeout(refreshChestArtEverywhere,900);
  setTimeout(refreshChestArtEverywhere,2400);

  window.PPA_REFRESH_STAT_CHEST_ART=refreshChestArtEverywhere;
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
