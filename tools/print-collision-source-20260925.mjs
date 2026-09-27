import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function clean(s){
  return String(s||'')
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'[IMG]')
    .replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
}

function section(label,startNeedle,endNeedle,max=40000){
  const a=src.indexOf(startNeedle);
  if(a<0){console.log('MISS '+label+' start');return}
  let b=src.indexOf(endNeedle,a+startNeedle.length);
  if(b<0||b-a>max)b=Math.min(src.length,a+max);
  console.log('\n===== '+label+' @ '+a+' =====\n'+clean(src.slice(a,b+endNeedle.length)));
}

section('PREMIUM UI GOODS',"const PREMIUM_GOODS=[","];\n\nconst BUNDLES",60000);
section('PREMIUM GO PAGE',"function goPage(index,animate=true){","grid.addEventListener('wheel'",16000);

const cssStart=src.indexOf('#grid{',src.indexOf('ПРЕМИУМ МАГАЗИН')-200000);
if(cssStart>=0){
  const cssEnd=src.indexOf('.card{',cssStart);
  console.log('\n===== PREMIUM PAGE CSS @ '+cssStart+' =====\n'+clean(src.slice(cssStart,Math.min(cssEnd+100,cssStart+20000))));
}

const rg=src.indexOf('function renderGeneric(){',src.indexOf("const PREMIUM_GOODS=["));
if(rg>=0){
  const end=src.indexOf('const CLASS_CHANGE_OPTIONS=',rg);
  console.log('\n===== PREMIUM RENDER GENERIC @ '+rg+' =====\n'+clean(src.slice(rg,Math.min(end,rg+22000))));
}
