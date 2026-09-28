import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const indexPath=path.join(ROOT,'public','index.html');
const runtimeSrc=path.join(ROOT,'gateway','newbie-chest-runtime.js');
const runtimeDst=path.join(ROOT,'public','game','newbie-chest-runtime.js');
const assetSrc=path.join(ROOT,'assets-src','newbie-chest-gray.webp');
const assetDst=path.join(ROOT,'public','assets','newbie-chest-gray.webp');

if(!fs.existsSync(indexPath))throw new Error('Newbie chest: public/index.html missing');
if(!fs.existsSync(runtimeSrc))throw new Error('Newbie chest: runtime missing');
if(!fs.existsSync(assetSrc))throw new Error('Newbie chest: approved gray chest art missing');

fs.mkdirSync(path.dirname(runtimeDst),{recursive:true});
fs.mkdirSync(path.dirname(assetDst),{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.copyFileSync(assetSrc,assetDst);

function esc(code){
  return String(code)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
}

let html=fs.readFileSync(indexPath,'utf8');

const statNeedle=esc([
  "  if(v.it&&(v.it.statChest===true||String(v.it.refId||'').indexOf('stat_chest_')===0||String(v.it.uid||'').indexOf('stat_chest_')===0||/сундук\\s+ох/i.test(String(v.it.name||'')))){",
  "    _sel=-1;"
].join('\n'));

const newbieBranch=esc([
  "  if(v.it&&(v.it.newbieChest===true||String(v.it.refId||'')==='newbie_chest_gray_v1'||String(v.it.uid||'')==='newbie_chest_gray_v1'||String(v.it.name||'').toLowerCase()==='серый сундук новичка')){",
  "    _sel=-1;",
  "    try{if(parent&&typeof parent.PPA_OPEN_NEWBIE_CHEST==='function')parent.PPA_OPEN_NEWBIE_CHEST(v.it)}catch(_){}",
  "    return;",
  "  }"
].join('\n'));

if(html.indexOf('PPA_OPEN_NEWBIE_CHEST')<0){
  const at=html.indexOf(statNeedle);
  if(at<0)throw new Error('Newbie chest: character bag tap target not found after OX chest patch');
  html=html.slice(0,at)+newbieBranch+'\n'+html.slice(at);
}

const scriptTag='<script src="/game/newbie-chest-runtime.js?v=v1-20260928"></script>';
if(html.indexOf(scriptTag)<0){
  const bodyEnd=html.lastIndexOf('</body>');
  if(bodyEnd<0)throw new Error('Newbie chest: parent body end missing');
  html=html.slice(0,bodyEnd)+scriptTag+'\n'+html.slice(bodyEnd);
}

const required=[
  'PPA_OPEN_NEWBIE_CHEST',
  'newbie_chest_gray_v1',
  '/game/newbie-chest-runtime.js?v=v1-20260928'
];
for(const x of required)if(html.indexOf(x)<0)throw new Error('Newbie chest validation missing: '+x);

fs.writeFileSync(indexPath,html,'utf8');
console.log('[PPA POSTBUILD] Gray newbie chest integrated: class gray set + 4 active books + 100 HP/MP.');
