import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const indexPath=path.join(ROOT,'public','index.html');
const runtimeSrc=path.join(ROOT,'gateway','newbie-chest-runtime.js');
const runtimeDst=path.join(ROOT,'public','game','newbie-chest-runtime.js');
const assetDst=path.join(ROOT,'public','assets','newbie-chest-gray.webp');
const newbieChestArtB64='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';

if(!fs.existsSync(indexPath))throw new Error('Newbie chest: public/index.html missing');
if(!fs.existsSync(runtimeSrc))throw new Error('Newbie chest: runtime missing');

fs.mkdirSync(path.dirname(runtimeDst),{recursive:true});
fs.mkdirSync(path.dirname(assetDst),{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.writeFileSync(assetDst,Buffer.from(newbieChestArtB64,'base64'));

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

// Personal storage has its own iframe click handler. Intercept the newbie chest
// there as well so tapping it opens the same confirmation window instead of
// merely selecting it for transfer.
const storageClickNeedle=esc([
  "      if(!it){selected={side:null,idx:-1};render();return}",
  "      selected={side:side,idx:i};render();"
].join('\n'));
const storageClickPatch=esc([
  "      if(!it){selected={side:null,idx:-1};render();return}",
  "      if(it&&(it.newbieChest===true||String(it.refId||'')==='newbie_chest_gray_v1'||String(it.uid||'')==='newbie_chest_gray_v1'||String(it.name||'').toLowerCase()==='серый сундук новичка')){",
  "        selected={side:null,idx:-1};",
  "        try{if(parent&&typeof parent.PPA_OPEN_NEWBIE_CHEST==='function')parent.PPA_OPEN_NEWBIE_CHEST(it)}catch(_){}",
  "        render();return;",
  "      }",
  "      selected={side:side,idx:i};render();"
].join('\n'));
if(html.indexOf(storageClickNeedle)<0)throw new Error('Newbie chest: personal storage tap target not found');
html=html.replace(storageClickNeedle,storageClickPatch);

const scriptTag='<script src="/game/newbie-chest-runtime.js?v=v2-20260928"></script>';
if(html.indexOf(scriptTag)<0){
  const bodyEnd=html.lastIndexOf('</body>');
  if(bodyEnd<0)throw new Error('Newbie chest: parent body end missing');
  html=html.slice(0,bodyEnd)+scriptTag+'\n'+html.slice(bodyEnd);
}

const required=[
  'PPA_OPEN_NEWBIE_CHEST',
  'newbie_chest_gray_v1',
  '/game/newbie-chest-runtime.js?v=v2-20260928'
];
for(const x of required)if(html.indexOf(x)<0)throw new Error('Newbie chest validation missing: '+x);

fs.writeFileSync(indexPath,html,'utf8');
console.log('[PPA POSTBUILD] Gray newbie chest integrated: class gray set + 4 active books + 100 HP/MP.');
