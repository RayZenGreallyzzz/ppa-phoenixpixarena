(function(){
  'use strict';

  var STACK_MAX=999;
  var CFG={
    emerald:{
      tier:'emerald',name:'Изумрудный сундук ОХ',rarity:'uncommon',
      min:2,max:50,jackpot:50,price:3,minGram:3,minPpa:3000,
      refId:'stat_chest_emerald',img:'/assets/stat-chest-emerald.svg',color:'#74e58a',
      odds:'2 ОХ — 55% · 3–5 — 25% · 6–10 — 12% · 11–20 — 5% · 21–30 — 2% · 31–49 — 0.8% · 50 — 0.2%',
      chanceRows:[['3–5 ОХ','25%'],['6–10 ОХ','12%'],['11–20 ОХ','5%'],['21–30 ОХ','2%'],['31–49 ОХ','0.8%']]
    },
    sapphire:{
      tier:'sapphire',name:'Сапфировый сундук ОХ',rarity:'rare',
      min:5,max:80,jackpot:80,price:7,minGram:7,minPpa:7000,
      refId:'stat_chest_sapphire',img:'/assets/stat-chest-sapphire.svg',color:'#67a8ff',
      odds:'5 ОХ — 55% · 6–10 — 20% · 11–20 — 12% · 21–35 — 7% · 36–50 — 3% · 51–79 — 2.6% · 80 — 0.4%',
      chanceRows:[['6–10 ОХ','20%'],['11–20 ОХ','12%'],['21–35 ОХ','7%'],['36–50 ОХ','3%'],['51–79 ОХ','2.6%']]
    },
    amethyst:{
      tier:'amethyst',name:'Аметистовый сундук ОХ',rarity:'epic',
      min:10,max:110,jackpot:110,price:17,minGram:17,minPpa:17000,
      refId:'stat_chest_amethyst',img:'/assets/stat-chest-amethyst.svg',color:'#c47aff',
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
      '#ppaOxChestModal{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:calc(18px + env(safe-area-inset-top,0px)) 16px calc(18px + env(safe-area-inset-bottom,0px));background:radial-gradient(circle at 50% 42%,rgba(0,0,0,.18),rgba(0,0,0,.78) 74%);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);box-sizing:border-box;font-family:Georgia,\'Times New Roman\',serif}'+
      '#ppaOxChestModal *{box-sizing:border-box}'+
      '.ppa-ox-card{position:relative;width:min(92vw,430px);max-height:min(86vh,720px);overflow:auto;border:2px solid #c49a49;border-radius:18px;padding:18px 18px 16px;color:#f6ecd2;background:var(--ox-panel);box-shadow:0 0 0 2px rgba(76,47,17,.8),0 14px 45px rgba(0,0,0,.72),0 0 26px var(--ox-glow),inset 0 0 38px rgba(0,0,0,.48);-webkit-overflow-scrolling:touch}'+
      '.ppa-ox-card:before,.ppa-ox-card:after{content:\'✦\';position:absolute;top:7px;color:#e8c66c;font-size:15px;text-shadow:0 0 7px rgba(232,198,108,.5)}'+
      '.ppa-ox-card:before{left:10px}.ppa-ox-card:after{right:10px}'+
      '.ppa-ox-title{padding:1px 26px 10px;text-align:center;color:#f3d581;font-size:20px;font-weight:800;line-height:1.18;text-shadow:0 2px 2px #000,0 0 10px rgba(235,195,94,.24)}'+
      '.ppa-ox-sub{margin:-3px 0 12px;text-align:center;color:var(--ox-accent2);font:700 12px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:.08em;text-transform:uppercase;opacity:.92}'+
      '.ppa-ox-hero{display:grid;grid-template-columns:74px 1fr;gap:12px;align-items:center;margin:2px 0 14px;padding:11px;border:1px solid rgba(223,185,91,.48);border-radius:13px;background:linear-gradient(180deg,rgba(255,232,172,.055),rgba(0,0,0,.16));box-shadow:inset 0 0 18px rgba(0,0,0,.28)}'+
      '.ppa-ox-img{width:68px;height:68px;object-fit:contain;filter:drop-shadow(0 5px 7px rgba(0,0,0,.55)) drop-shadow(0 0 8px var(--ox-glow))}'+
      '.ppa-ox-guarantee-label{font:700 12px/1.2 system-ui,-apple-system,sans-serif;color:#d8c8a2;letter-spacing:.035em;margin-bottom:4px}'+
      '.ppa-ox-guarantee{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}'+
      '.ppa-ox-guarantee strong{color:var(--ox-accent2);font-size:25px;line-height:1;text-shadow:0 0 10px var(--ox-glow)}'+
      '.ppa-ox-100{display:inline-flex;align-items:center;padding:4px 9px;border:1px solid #d7af53;border-radius:999px;color:#ffe39b;background:rgba(130,92,26,.23);font:800 12px/1 system-ui,-apple-system,sans-serif;box-shadow:inset 0 0 8px rgba(255,213,112,.10)}'+
      '.ppa-ox-section{margin-top:10px}'+
      '.ppa-ox-section-title{display:flex;align-items:center;gap:8px;margin-bottom:7px;color:#ebd49a;font:800 12px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:.07em;text-transform:uppercase}'+
      '.ppa-ox-section-title:before,.ppa-ox-section-title:after{content:\'\';height:1px;flex:1;background:linear-gradient(90deg,transparent,#8d7138,transparent)}'+
      '.ppa-ox-list{display:grid;gap:6px}'+
      '.ppa-ox-row{display:flex;justify-content:space-between;align-items:center;padding:8px 11px;border:1px solid rgba(219,184,101,.22);border-radius:10px;background:var(--ox-chip);font:700 13px/1.1 system-ui,-apple-system,sans-serif}'+
      '.ppa-ox-row .reward{color:#f5ecd9}.ppa-ox-row .chance{min-width:48px;text-align:right;color:var(--ox-accent);text-shadow:0 0 8px var(--ox-glow)}'+
      '.ppa-ox-jackpot{margin-top:9px;padding:10px 12px;border:1px solid #d5aa4d;border-radius:11px;background:linear-gradient(90deg,rgba(120,76,17,.22),rgba(255,210,91,.10),rgba(120,76,17,.22));box-shadow:inset 0 0 15px rgba(255,195,71,.07);text-align:center}'+
      '.ppa-ox-jackpot span{display:block;color:#d9bb72;font:800 10px/1.2 system-ui,-apple-system,sans-serif;letter-spacing:.13em;text-transform:uppercase;margin-bottom:4px}'+
      '.ppa-ox-jackpot strong{color:#ffd65f;font-size:19px;text-shadow:0 0 11px rgba(255,197,61,.42)}'+
      '.ppa-ox-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px}'+
      '.ppa-ox-btn{appearance:none;border-radius:10px;padding:11px 8px;font:800 13px/1 system-ui,-apple-system,sans-serif;letter-spacing:.035em;cursor:pointer;touch-action:manipulation}'+
      '.ppa-ox-cancel{border:1px solid #6c604e;color:#d8cdb9;background:linear-gradient(#2a2826,#181716)}'+
      '.ppa-ox-open{border:1px solid #d4ad55;color:#fff2cb;background:linear-gradient(180deg,#8b6428,#5b3c16);box-shadow:inset 0 1px rgba(255,255,255,.15),0 0 12px rgba(221,170,73,.12)}'+
      '.ppa-ox-open:disabled,.ppa-ox-cancel:disabled{opacity:.55;cursor:default}'+
      '@media(max-width:380px){.ppa-ox-card{padding:15px 14px 13px}.ppa-ox-title{font-size:18px}.ppa-ox-hero{grid-template-columns:60px 1fr}.ppa-ox-img{width:56px;height:56px}.ppa-ox-row{padding:7px 9px;font-size:12px}}';
    document.head.appendChild(style);

    var root=document.createElement('div');
    root.id='ppaOxChestModal';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.innerHTML=
      '<div class="ppa-ox-card" id="ppaOxChestCard">'+
        '<div class="ppa-ox-title" id="ppaOxChestTitle"></div>'+
        '<div class="ppa-ox-sub">Шансы награды</div>'+
        '<div class="ppa-ox-hero">'+
          '<img class="ppa-ox-img" id="ppaOxChestImg" alt="">'+
          '<div>'+
            '<div class="ppa-ox-guarantee-label">Гарантированная награда</div>'+
            '<div class="ppa-ox-guarantee"><strong id="ppaOxChestGuaranteed"></strong><span class="ppa-ox-100">100%</span></div>'+
          '</div>'+
        '</div>'+
        '<div class="ppa-ox-section">'+
          '<div class="ppa-ox-section-title">Дополнительная награда</div>'+
          '<div class="ppa-ox-list" id="ppaOxChestRows"></div>'+
        '</div>'+
        '<div class="ppa-ox-jackpot"><span>Джекпот</span><strong id="ppaOxChestJackpot"></strong></div>'+
        '<div class="ppa-ox-actions">'+
          '<button class="ppa-ox-btn ppa-ox-cancel" id="ppaOxChestCancel" type="button">Отмена</button>'+
          '<button class="ppa-ox-btn ppa-ox-open" id="ppaOxChestOpen" type="button">Открыть</button>'+
        '</div>'+
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
