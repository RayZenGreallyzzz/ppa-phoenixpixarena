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

function readObjectPropertyExpression(obj,prop){
  const re=new RegExp('\\b'+prop+'\\s*:','g');
  const hits=[...obj.matchAll(re)];
  if(hits.length!==1)return null;
  let i=hits[0].index+hits[0][0].length;
  while(i<obj.length&&/\s/.test(obj[i]))i++;
  const start=i;
  let quote=null,escape=false,line=false,block=false,paren=0,bracket=0,brace=0;
  for(;i<obj.length;i++){
    const ch=obj[i],nx=obj[i+1];
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
    if(ch==='(')paren++;
    else if(ch===')')paren--;
    else if(ch==='[')bracket++;
    else if(ch===']')bracket--;
    else if(ch==='{')brace++;
    else if(ch==='}'){
      if(brace===0&&paren===0&&bracket===0)break;
      brace--;
    }else if(ch===','&&paren===0&&bracket===0&&brace===0)break;
  }
  const expr=obj.slice(start,i).trim();
  return expr||null;
}

function findPpaWorldDrops(source){
  const hits=[];
  let pos=0;
  while((pos=source.indexOf('LOOT.push',pos))>=0){
    const openParen=source.indexOf('(',pos+'LOOT.push'.length);
    if(openParen<0){pos+='LOOT.push'.length;continue;}
    let objStart=openParen+1;
    while(objStart<source.length&&/\s/.test(source[objStart]))objStart++;
    if(source[objStart]!=='{'){pos=openParen+1;continue;}
    const objEnd=balancedEnd(source,objStart,'{','}');
    const callEnd=balancedEnd(source,openParen,'(',')');
    if(objEnd<0||callEnd<0||objEnd>callEnd)throw new Error('Direct loot source normalize: malformed LOOT.push object');
    const obj=source.slice(objStart,objEnd+1);
    if(/\bkind\s*:\s*['"]ppa['"]/.test(obj)){
      const amountExpr=readObjectPropertyExpression(obj,'amount');
      if(!amountExpr)throw new Error('Direct loot source normalize: PPA world-drop amount expression missing/ambiguous');
      hits.push({start:pos,end:callEnd+1,amountExpr});
    }
    pos=callEnd+1;
  }
  return hits;
}

function replaceGoldWorldDrops(source){
  // Replace every canonical computed-gold world object. This deliberately
  // matches the semantic path (gold>0 -> LOOT.push -> kind gold -> amount gold)
  // rather than one brittle literal string. Other gold tokens/readers remain.
  const re=/if\s*\(\s*gold\s*>\s*0\s*\)\s*LOOT\.push\s*\(\s*\{[^;]{0,1200}?kind\s*:\s*['"]gold['"][^;]{0,1200}?amount\s*:\s*gold\b[^;]{0,1200}?\}\s*\)\s*;/g;
  const matches=[...source.matchAll(re)];
  if(matches.length<1)throw new Error('Direct loot source normalize: no canonical gold world-drop paths found');

  const direct=`if(gold>0){\n    INV.gold+=gold;\n    showPickup('+'+gold+' золота','#ffcc44');\n    scheduleCombatSave();\n    sendMerchantState();\n  }`;

  let out='',last=0;
  for(let i=0;i<matches.length;i++){
    const m=matches[i];
    out+=source.slice(last,m.index);
    if(i===0)out+=MARKER+'\n  ';
    out+=direct;
    last=m.index+m[0].length;
  }
  out+=source.slice(last);
  return {source:out,count:matches.length};
}

function replacePpaWorldDrops(source){
  const hits=findPpaWorldDrops(source);
  if(hits.length<1)throw new Error('Direct loot source normalize: no PPA world-drop paths found');
  let out='',last=0;
  for(const hit of hits){
    out+=source.slice(last,hit.start);
    out+=`(()=>{const _ppaDirectAmount=Math.max(0,Math.floor(Number(${hit.amountExpr})||0));if(_ppaDirectAmount>0){INV.ppa=(Number(INV.ppa)||0)+_ppaDirectAmount;showPickup('+'+_ppaDirectAmount+' PPA','#ffb35c');scheduleCombatSave();sendInvState();updateUI();}return LOOT.length;})()`;
    last=hit.end;
  }
  out+=source.slice(last);
  return {source:out,count:hits.length};
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

  const gold=replaceGoldWorldDrops(input);
  const ppa=replacePpaWorldDrops(gold.source);
  let source=replaceMaterialWorldDrop(ppa.source);

  // Final guards: direct reward paths must exist and all canonical gold/PPA/material
  // world-object constructors must be gone. Equipment/books/runes stay intact.
  if(count(source,MARKER)!==1)throw new Error('Direct loot source normalize: marker insertion failed');
  if(/if\s*\(\s*gold\s*>\s*0\s*\)\s*LOOT\.push\s*\(\s*\{[^;]{0,1200}?kind\s*:\s*['"]gold['"]/.test(source)){
    throw new Error('Direct loot source normalize: canonical gold world-drop survived');
  }
  if(findPpaWorldDrops(source).length!==0)throw new Error('Direct loot source normalize: PPA world-drop survived');
  const materialStart=source.indexOf('function pushMaterialDrop(e,rarity,amount){');
  const materialEnd=materialStart>=0?balancedEnd(source,source.indexOf('{',materialStart)):-1;
  if(materialStart<0||materialEnd<0)throw new Error('Direct loot source normalize: rewritten material helper missing');
  const materialFn=source.slice(materialStart,materialEnd+1);
  if(materialFn.includes('LOOT.push')||/kind\s*:\s*['"]material['"]/.test(materialFn))throw new Error('Direct loot source normalize: material world-drop survived');

  for(const keep of [
    'INV.gold+=gold;',
    "showPickup('+'+gold+' золота','#ffcc44');",
    'INV.ppa=(Number(INV.ppa)||0)+_ppaDirectAmount;',
    "showPickup('+'+_ppaDirectAmount+' PPA','#ffb35c');",
    'INV.materials[name]=(INV.materials[name]||0)+n;',
    "showPickup(name+' ×'+n,RCOL_P[def.rarity]||'#a7adb5');",
    'sendMerchantState();','sendInvState();','sendBlacksmithState();','updateUI();'
  ])if(!source.includes(keep))throw new Error('Direct loot source normalize: protected result missing '+keep);

  return {source,stats:{goldWorldDropsRemoved:gold.count,ppaWorldDropsRemoved:ppa.count,materialWorldDropHelpersRewritten:1}};
}

export const DIRECT_LOOT_SOURCE_MARKER=MARKER;
