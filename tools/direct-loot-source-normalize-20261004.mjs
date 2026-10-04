// Canonical packed-source normalization for direct currency/material rewards.
// This runs at build time on the unpacked PPA source. It does NOT install any
// runtime hook/override and does not alter drop chances or reward quantities.

const MARKER='/* PPA_DIRECT_GOLD_MATERIAL_STORAGE_20261004 */';

function count(text,needle){return text.split(needle).length-1;}

function balancedEnd(text,openAt,openChar='{',closeChar='}'){
  let depth=0,quote=null,escape=false,line=false,block=false;
  for(let i=openAt;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(line){if(ch==='\n')line=false;continue;}
    if(block){if(ch==='*'&&nx==='/'){block=false;i++;}continue;}
    if(quote){
      if(escape){escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==='/'&&nx==='/'){line=true;i++;continue;}
    if(ch==='/'&&nx==='*'){block=true;i++;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch===openChar)depth++;
    else if(ch===closeChar){depth--;if(depth===0)return i;}
  }
  return -1;
}

function replaceGoldWorldDrop(source){
  // Structural match: tolerate whitespace and extra object fields while still
  // requiring the canonical gold variable and gold world-drop type.
  const re=/if\s*\(\s*gold\s*>\s*0\s*\)\s*LOOT\.push\s*\(\s*\{[^;]{0,1200}?kind\s*:\s*['"]gold['"][^;]{0,1200}?amount\s*:\s*gold\b[^;]{0,1200}?\}\s*\)\s*;/g;
  const matches=[...source.matchAll(re)];
  if(matches.length!==1){
    const kinds=count(source,"kind:'gold'")+count(source,'kind:"gold"');
    throw new Error(`Direct loot source normalize: expected 1 canonical gold world-drop, found ${matches.length}; gold-kind tokens=${kinds}`);
  }
  const goldNew=`${MARKER}\n  if(gold>0){\n    INV.gold+=gold;\n    showPickup('+'+gold+' золота','#ffcc44');\n    scheduleCombatSave();\n    sendMerchantState();\n  }`;
  return source.slice(0,matches[0].index)+goldNew+source.slice(matches[0].index+matches[0][0].length);
}

function replaceMaterialWorldDrop(source){
  const sig='function pushMaterialDrop(e,rarity,amount){';
  const start=source.indexOf(sig);
  if(start<0||source.indexOf(sig,start+1)>=0)throw new Error('Direct loot source normalize: pushMaterialDrop signature count changed');
  const open=source.indexOf('{',start),end=balancedEnd(source,open);
  if(open<0||end<0)throw new Error('Direct loot source normalize: pushMaterialDrop bounds invalid');
  const oldFn=source.slice(start,end+1);
  if(!oldFn.includes('LOOT.push')||!(/kind\s*:\s*['"]material['"]/.test(oldFn))){
    throw new Error('Direct loot source normalize: pushMaterialDrop is no longer a material world-drop helper');
  }
  const materialNew=`function pushMaterialDrop(e,rarity,amount){\n  var pool=MATERIAL_BY_RARITY[rarity]||[];if(!pool.length)return;\n  var name=randFrom(pool),def=MATERIAL_DB[name],n=amount||1;\n  INV.materials[name]=(INV.materials[name]||0)+n;\n  showPickup(name+' ×'+n,RCOL_P[def.rarity]||'#a7adb5');\n  scheduleCombatSave();\n  sendBlacksmithState();\n}`;
  return source.slice(0,start)+materialNew+source.slice(end+1);
}

export function applyDirectLootStorage(input){
  if(typeof input!=='string'||input.length<1000)throw new Error('Direct loot source normalize: packed source text missing');
  if(input.includes(MARKER))throw new Error('Direct loot source normalize: marker already present in canonical source');

  let source=replaceGoldWorldDrop(input);
  source=replaceMaterialWorldDrop(source);

  // Final guards: direct reward paths must exist and the canonical gold/material
  // world-object constructors must be gone. PPA/equipment/books/runes stay intact.
  if(count(source,MARKER)!==1)throw new Error('Direct loot source normalize: marker insertion failed');
  if(/if\s*\(\s*gold\s*>\s*0\s*\)\s*LOOT\.push\s*\(\s*\{[^;]{0,1200}?kind\s*:\s*['"]gold['"]/.test(source)){
    throw new Error('Direct loot source normalize: canonical gold world-drop survived');
  }
  const materialStart=source.indexOf('function pushMaterialDrop(e,rarity,amount){');
  const materialEnd=materialStart>=0?balancedEnd(source,source.indexOf('{',materialStart)):-1;
  if(materialStart<0||materialEnd<0)throw new Error('Direct loot source normalize: rewritten material helper missing');
  const materialFn=source.slice(materialStart,materialEnd+1);
  if(materialFn.includes('LOOT.push')||/kind\s*:\s*['"]material['"]/.test(materialFn))throw new Error('Direct loot source normalize: material world-drop survived');

  for(const keep of [
    'INV.gold+=gold;',
    "showPickup('+'+gold+' золота','#ffcc44');",
    'INV.materials[name]=(INV.materials[name]||0)+n;',
    "showPickup(name+' ×'+n,RCOL_P[def.rarity]||'#a7adb5');",
    'sendMerchantState();','sendBlacksmithState();',"kind:'ppa'"
  ])if(!source.includes(keep))throw new Error('Direct loot source normalize: protected result missing '+keep);

  return {source,stats:{goldWorldDropsRemoved:1,materialWorldDropHelpersRewritten:1}};
}

export const DIRECT_LOOT_SOURCE_MARKER=MARKER;
