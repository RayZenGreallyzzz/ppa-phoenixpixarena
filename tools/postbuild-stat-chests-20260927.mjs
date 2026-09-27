import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const indexPath=path.join(ROOT,'public','index.html');
const runtimeSrc=path.join(ROOT,'gateway','stat-chests-runtime.js');
const gameDir=path.join(ROOT,'public','game');
const assetsDir=path.join(ROOT,'public','assets');

if(!fs.existsSync(indexPath))throw new Error('OX chests: public/index.html missing');
if(!fs.existsSync(runtimeSrc))throw new Error('OX chests: gateway/stat-chests-runtime.js missing');
fs.mkdirSync(gameDir,{recursive:true});
fs.mkdirSync(assetsDir,{recursive:true});
fs.copyFileSync(runtimeSrc,path.join(gameDir,'stat-chests-runtime.js'));

function esc(code){
  return String(code)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
}

function svg(main,light,dark,gem){
  return '<?xml version="1.0" encoding="UTF-8"?>'+
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'+
    '<defs>'+
    '<linearGradient id="lid" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+light+'"/><stop offset="1" stop-color="'+main+'"/></linearGradient>'+
    '<linearGradient id="box" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+main+'"/><stop offset="1" stop-color="'+dark+'"/></linearGradient>'+
    '<filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'+
    '</defs>'+
    '<ellipse cx="128" cy="218" rx="82" ry="17" fill="#000" opacity=".28"/>'+
    '<path d="M50 103c4-34 33-57 78-57s74 23 78 57l-18 15H68z" fill="url(#lid)" stroke="#d9b86a" stroke-width="8" stroke-linejoin="round"/>'+
    '<path d="M45 108h166v93c0 10-8 18-18 18H63c-10 0-18-8-18-18z" fill="url(#box)" stroke="#caa45b" stroke-width="8"/>'+
    '<path d="M45 132h166" stroke="#f1d083" stroke-width="7"/>'+
    '<path d="M76 106v113M180 106v113" stroke="#8a652d" stroke-width="9" opacity=".9"/>'+
    '<rect x="107" y="126" width="42" height="55" rx="9" fill="#241a31" stroke="#f1d083" stroke-width="7"/>'+
    '<path d="M128 138l12 13-12 20-12-20z" fill="'+gem+'" filter="url(#glow)"/>'+
    '<path d="M73 84c24-23 88-29 112 0" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="6" stroke-linecap="round"/>'+
    '<g fill="'+gem+'" opacity=".9" filter="url(#glow)"><circle cx="40" cy="83" r="4"/><circle cx="217" cy="91" r="5"/><circle cx="200" cy="54" r="3"/><circle cx="58" cy="48" r="3"/></g>'+
    '</svg>';
}

fs.writeFileSync(path.join(assetsDir,'stat-chest-emerald.svg'),svg('#23894a','#52d47a','#12552f','#7dff9c'),'utf8');
fs.writeFileSync(path.join(assetsDir,'stat-chest-sapphire.svg'),svg('#2369bd','#58a9ff','#123b73','#7fc8ff'),'utf8');
fs.writeFileSync(path.join(assetsDir,'stat-chest-amethyst.svg'),svg('#7430a8','#bc63e8','#3d155e','#e099ff'),'utf8');

// User-approved transparent chest renders uploaded to repo root.
// 21_34_02 is the combined/reference composition and is not used as an item icon.
const uploadedChestArt={
  emerald:'Изображение ChatGPT 27 сент. 2026 г., 21_33_30.png',
  sapphire:'Изображение ChatGPT 27 сент. 2026 г., 21_33_41.png',
  amethyst:'Изображение ChatGPT 27 сент. 2026 г., 21_33_51.png'
};
for(const [tier,file] of Object.entries(uploadedChestArt)){
  const src=path.join(ROOT,file);
  if(!fs.existsSync(src))throw new Error('OX chest uploaded art missing: '+file);
  fs.copyFileSync(src,path.join(assetsDir,'stat-chest-'+tier+'.png'));
}

let html=fs.readFileSync(indexPath,'utf8');

function findProductObject(block,id){
  const needles=['id:&#x27;'+id+'&#x27;','id:&quot;'+id+'&quot;'];
  let p=-1;
  for(const n of needles){
    p=block.indexOf(n);
    if(p>=0)break;
  }
  if(p<0)return null;
  const start=block.lastIndexOf('{',p);
  if(start<0)return null;
  let depth=0,end=-1;
  for(let i=start;i<block.length;i++){
    const ch=block[i];
    if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0){end=i+1;break;}
    }
  }
  return end>start?{start,end,text:block.slice(start,end)}:null;
}

function cloneProduct(obj,overrideCode){
  return obj.text.slice(0,-1)+','+esc(overrideCode)+'}';
}

const overrides={
  emerald:"id:'statChestEmerald',name:'Изумрудный сундук ОХ',title:'Изумрудный сундук ОХ',label:'Изумрудный сундук ОХ',kind:'statChest',qty:1,price:3,chestTier:'emerald',statChestMin:2,statChestMax:50,statChestJackpot:50,rarity:'uncommon',rarityName:'Необычный',icon:'🎁',img:'/assets/stat-chest-emerald.png',cardArt:'/assets/stat-chest-emerald.png',iconArt:'/assets/stat-chest-emerald.png',desc:'2–50 ОХ · 50 ОХ — джекпот'",
  sapphire:"id:'statChestSapphire',name:'Сапфировый сундук ОХ',title:'Сапфировый сундук ОХ',label:'Сапфировый сундук ОХ',kind:'statChest',qty:1,price:7,chestTier:'sapphire',statChestMin:5,statChestMax:80,statChestJackpot:80,rarity:'rare',rarityName:'Редкий',icon:'🎁',img:'/assets/stat-chest-sapphire.png',cardArt:'/assets/stat-chest-sapphire.png',iconArt:'/assets/stat-chest-sapphire.png',desc:'5–80 ОХ · 80 ОХ — джекпот'",
  amethyst:"id:'statChestAmethyst',name:'Аметистовый сундук ОХ',title:'Аметистовый сундук ОХ',label:'Аметистовый сундук ОХ',kind:'statChest',qty:1,price:17,chestTier:'amethyst',statChestMin:10,statChestMax:110,statChestJackpot:110,rarity:'epic',rarityName:'Эпический',icon:'🎁',img:'/assets/stat-chest-amethyst.png',cardArt:'/assets/stat-chest-amethyst.png',iconArt:'/assets/stat-chest-amethyst.png',desc:'10–110 ОХ · 110 ОХ — джекпот'"
};

let scan=0,patchedBlocks=0;
while((scan=html.indexOf('const PREMIUM_GOODS=[',scan))>=0){
  // Previous postbuild steps can change whitespace/newlines around BUNDLES.
  // Locate the next BUNDLES declaration first, then take the nearest array
  // terminator before it instead of depending on one exact formatting string.
  const bundles=html.indexOf('const BUNDLES',scan);
  if(bundles<0)throw new Error('OX chests: Premium BUNDLES declaration not found after PREMIUM_GOODS');
  const end=html.lastIndexOf('];',bundles);
  if(end<scan)throw new Error('OX chests: Premium goods array end not found before BUNDLES');
  let block=html.slice(scan,end+2);

  if(block.indexOf('statChestEmerald')>=0){
    scan=end+2;
    continue;
  }

  const first=findProductObject(block,'stat15');
  const second=findProductObject(block,'stat30');
  if(!first||!second){
    scan=end+2;
    continue;
  }

  const replacements=[
    {start:first.start,end:first.end,text:cloneProduct(first,overrides.emerald)},
    {start:second.start,end:second.end,text:cloneProduct(second,overrides.sapphire)+','+cloneProduct(second,overrides.amethyst)}
  ].sort((a,b)=>b.start-a.start);

  for(const r of replacements)block=block.slice(0,r.start)+r.text+block.slice(r.end);
  html=html.slice(0,scan)+block+html.slice(end+2);
  patchedBlocks++;
  scan+=block.length;
}
if(!patchedBlocks)throw new Error('OX chests: old Premium stat15/stat30 products not found');

const oldPopular=esc("g.id==='stat15'||g.id==='stat30'");
const newPopular=esc("g.id==='statChestEmerald'||g.id==='statChestSapphire'||g.id==='statChestAmethyst'");
const popularCount=html.split(oldPopular).length-1;
if(!popularCount)throw new Error('OX chests: Premium Popular stat filter not found');
html=html.split(oldPopular).join(newPopular);

const oldStatBranch="}else if(g.kind==='statPoints'){";
const chestBranch=[
  "}else if(g.kind==='statChest'){",
  "    var _ppaChestTier=String(g.chestTier||'');",
  "    var _ppaChestAdded=(window.PPA_GIVE_STAT_CHEST&&window.PPA_GIVE_STAT_CHEST(_ppaChestTier,1,false))||0;",
  "    if(!_ppaChestAdded){",
  "      try{showPickup('Не удалось добавить сундук ОХ · проверь сумку','#ff7777')}catch(_){}",
  "      return;",
  "    }",
  "}else if(g.kind==='statPoints'){"
].join('\n');
if(html.indexOf(oldStatBranch)<0)throw new Error('OX chests: Premium purchase statPoints branch not found');
html=html.replace(oldStatBranch,chestBranch);

const bagOld=esc([
  "  ppaSetBagVisualSelection(i);",
  "  if(v.kind==='gear'){"
].join('\n'));
const bagNew=esc([
  "  ppaSetBagVisualSelection(i);",
  "  if(v.it&&v.it.statChest===true){",
  "    _sel=-1;",
  "    try{if(parent&&typeof parent.PPA_OPEN_STAT_CHEST==='function')parent.PPA_OPEN_STAT_CHEST(v.it)}catch(_){}",
  "    return;",
  "  }",
  "  if(v.kind==='gear'){"
].join('\n'));
if(html.indexOf(bagOld)<0)throw new Error('OX chests: character bag tap target not found');
html=html.replace(bagOld,bagNew);

const adminReturn='return {ok:true,added:added,repaired:repaired||0,total:box.length};';
const adminPatch=[
  "var chestUnits=0;",
  "if(typeof window.PPA_MAKE_STAT_CHEST==='function'){",
  "  [['emerald','admin_qa_stat_chest_emerald_100_v1'],['sapphire','admin_qa_stat_chest_sapphire_100_v1'],['amethyst','admin_qa_stat_chest_amethyst_100_v1']].forEach(function(row){",
  "    var tier=row[0],id=row[1];",
  "    var it=box.find(function(x){return x&&String(x.eventRewardId||'')===id});",
  "    if(it){",
  "      var cur=window.PPA_STAT_CHEST_COUNT?window.PPA_STAT_CHEST_COUNT(it):Math.max(0,Math.floor(Number(it.count)||0));",
  "      if(cur<100){if(window.PPA_SET_STAT_CHEST_COUNT)window.PPA_SET_STAT_CHEST_COUNT(it,100);else{it.count=100;it.qty=100;it.amount=100}chestUnits+=100-cur;repaired++;}",
  "      return;",
  "    }",
  "    var chest=window.PPA_MAKE_STAT_CHEST(tier,100);",
  "    if(!chest)return;",
  "    chest.eventRewardId=id;chest.eventRewardTemplate=true;chest.eventRewardStock=true;chest.rewardSource='admin-qa';",
  "    if(box.length<cap&&push(chest)){chestUnits+=100;return;}",
  "    if(Array.isArray(INV.bag)&&INV.bag.length<100&&!has(id)){INV.bag.push(chest);added++;chestUnits+=100;}",
  "  });",
  "}",
  "return {ok:true,added:added,repaired:repaired||0,chestUnits:chestUnits,total:box.length};"
].join('\n');
if(html.indexOf(adminReturn)<0)throw new Error('OX chests: admin reward stock return target not found');
html=html.replace(adminReturn,adminPatch);

const scriptTag='<script src="/game/stat-chests-runtime.js?v=v668-ox-art-all-ui-20260927"></script>';
if(html.indexOf(scriptTag)<0){
  const bodyEnd=html.lastIndexOf('</body>');
  if(bodyEnd<0)throw new Error('OX chests: parent body end missing');
  html=html.slice(0,bodyEnd)+scriptTag+'\n'+html.slice(bodyEnd);
}

const required=[
  'statChestEmerald','statChestSapphire','statChestAmethyst',
  '/assets/stat-chest-emerald.png','/assets/stat-chest-sapphire.png','/assets/stat-chest-amethyst.png',
  "g.kind==='statChest'","PPA_OPEN_STAT_CHEST","admin_qa_stat_chest_emerald_100_v1",
  'stat-chests-runtime.js?v=v668-ox-art-all-ui-20260927'
];
for(const x of required)if(html.indexOf(x)<0)throw new Error('OX chests validation missing: '+x);
if(html.indexOf(newPopular)<0)throw new Error('OX chests: new Popular filter missing');

fs.writeFileSync(indexPath,html,'utf8');
console.log('[PPA POSTBUILD] OX chests: Emerald 3 Gram / Sapphire 7 Gram / Amethyst 17 Gram.');
console.log('[PPA POSTBUILD] OX auction minimums: 3/7/17 Gram and 3000/7000/17000 PPA.');
console.log('[PPA POSTBUILD] OX admin QA: 100 of each chest scheduled for authorized admin.');
