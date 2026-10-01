import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('3D decouple: public/index.html missing');

let html=fs.readFileSync(htmlPath,'utf8');

const legacyClassBlock=`  const primary3DClass=playerUsesGnomeSprites()?'gnome'
    :playerUsesArcherSprites()?'archer'
    :playerUsesAssassinSprites()?'assassin'
    :playerUsesTankSprites()?'tank'
    :playerUsesBerserkerSprites()?'barbarian'
    :playerUsesPriestSprites()?'priest'
    :playerUsesMageSprites()?'mage'
    :playerUsesPaladinSprites()?'paladin':'';`;

const directClassBlock=`  const __ppa3DRaw=(P&&(P.classKey||P.cls||P.className||(P._saved&&P._saved.cls)))||'';
  const __ppa3DText=String(__ppa3DRaw||'').trim();
  const __ppa3DLower=__ppa3DText.toLowerCase();
  let primary3DClass='';
  try{if(typeof classKeyFromName==='function')primary3DClass=String(classKeyFromName(__ppa3DText)||'').toLowerCase()}catch(_){}
  if(!['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(primary3DClass)){
    if(__ppa3DLower==='tank'||__ppa3DLower.includes('страж'))primary3DClass='tank';
    else if(__ppa3DLower==='barbarian'||__ppa3DLower.includes('бер')||__ppa3DLower.includes('barb'))primary3DClass='barbarian';
    else if(__ppa3DLower==='paladin'||__ppa3DLower.includes('пал'))primary3DClass='paladin';
    else if(__ppa3DLower==='gnome'||__ppa3DLower.includes('гном')||__ppa3DLower.includes('cannon'))primary3DClass='gnome';
    else if(__ppa3DLower==='archer'||__ppa3DLower.includes('луч'))primary3DClass='archer';
    else if(__ppa3DLower==='mage'||__ppa3DLower.includes('маг'))primary3DClass='mage';
    else if(__ppa3DLower==='assassin'||__ppa3DLower.includes('асс'))primary3DClass='assassin';
    else if(__ppa3DLower==='priest'||__ppa3DLower.includes('жр'))primary3DClass='priest';
    else primary3DClass='';
  }
  window.__PPA3D_LOCAL_CLASS=primary3DClass;`;

const classCount=html.split(legacyClassBlock).length-1;
if(classCount!==1)throw new Error('3D decouple: expected exactly one legacy class selector, found '+classCount);
html=html.replace(legacyClassBlock,directClassBlock);

const legacyNick=`try{if(!(playerUsesGnomeSprites()||playerUsesArcherSprites()||playerUsesAssassinSprites()||playerUsesTankSprites()||playerUsesBerserkerSprites()||playerUsesPriestSprites()||playerUsesMageSprites()||playerUsesPaladinSprites()))drawPlayerNickname()}catch(_){}`;
const directNick=`try{if(!window.__PPA3D_LOCAL_CLASS)drawPlayerNickname()}catch(_){}`;
const nickCount=html.split(legacyNick).length-1;
if(nickCount!==1)throw new Error('3D decouple: expected exactly one legacy nickname guard, found '+nickCount);
html=html.replace(legacyNick,directNick);

// Guardrails: verify only the primary-3D selector/nickname cutover itself.
// Other legacy drawing branches may still legitimately contain playerUses*Sprites
// until remote/UI migration is complete, so do not scan the whole drawPlayer body.
if(html.includes(legacyClassBlock))throw new Error('3D decouple: legacy primary 3D class selector survived replacement');
if(html.includes(legacyNick))throw new Error('3D decouple: legacy primary 3D nickname guard survived replacement');
if(!html.includes(directClassBlock))throw new Error('3D decouple: direct gameplay class selector missing after replacement');
if(!html.includes(directNick))throw new Error('3D decouple: direct 3D nickname guard missing after replacement');
if(!html.includes('window.__PPA3D_LOCAL_ANCHOR={'))throw new Error('3D decouple: primary 3D anchor missing after rewrite');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Primary 3D decouple: local class selection now uses gameplay class data only; unrelated legacy sprite helpers preserved');
