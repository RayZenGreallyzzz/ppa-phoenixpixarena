// Canonical packed-source normalization for direct currency/material rewards.
// This runs at build time on the unpacked PPA source. It does NOT install any
// runtime hook/override and does not alter drop chances or reward quantities.

const MARKER='/* PPA_DIRECT_GOLD_MATERIAL_STORAGE_20261004 */';

function count(text,needle){return text.split(needle).length-1;}

export function applyDirectLootStorage(input){
  if(typeof input!=='string'||input.length<1000)throw new Error('Direct loot source normalize: packed source text missing');
  if(input.includes(MARKER))throw new Error('Direct loot source normalize: marker already present in canonical source');

  let source=input;

  const goldOld="if(gold>0)LOOT.push({x:e.x+(Math.random()-.5)*20,y:e.y+(Math.random()-.5)*20,kind:'gold',amount:gold,bob:Math.random()*6});";
  const goldNew=`${MARKER}\n  if(gold>0){\n    INV.gold+=gold;\n    showPickup('+'+gold+' золота','#ffcc44');\n    scheduleCombatSave();\n    sendMerchantState();\n  }`;
  if(count(source,goldOld)!==1)throw new Error('Direct loot source normalize: canonical gold world-drop anchor changed');
  source=source.replace(goldOld,goldNew);

  const materialOld=`function pushMaterialDrop(e,rarity,amount){\n  var pool=MATERIAL_BY_RARITY[rarity]||[];if(!pool.length)return;\n  var name=randFrom(pool),def=MATERIAL_DB[name];\n  LOOT.push({\n    x:e.x+(Math.random()-.5)*34,y:e.y+(Math.random()-.5)*34,\n    kind:'material',name:name,rarity:def.rarity,src:def.src,amount:amount||1,bob:Math.random()*6\n  });\n}`;
  const materialNew=`function pushMaterialDrop(e,rarity,amount){\n  var pool=MATERIAL_BY_RARITY[rarity]||[];if(!pool.length)return;\n  var name=randFrom(pool),def=MATERIAL_DB[name],n=amount||1;\n  INV.materials[name]=(INV.materials[name]||0)+n;\n  showPickup(name+' ×'+n,RCOL_P[def.rarity]||'#a7adb5');\n  scheduleCombatSave();\n  sendBlacksmithState();\n}`;
  if(count(source,materialOld)!==1)throw new Error('Direct loot source normalize: canonical material world-drop helper changed');
  source=source.replace(materialOld,materialNew);

  // Final guards: direct reward paths must exist and the two canonical world
  // object constructors must be gone. PPA/equipment/books/runes remain untouched.
  if(count(source,MARKER)!==1)throw new Error('Direct loot source normalize: marker insertion failed');
  if(source.includes("kind:'gold',amount:gold,bob:Math.random()*6"))throw new Error('Direct loot source normalize: gold world-drop survived');
  if(source.includes("kind:'material',name:name,rarity:def.rarity,src:def.src,amount:amount||1,bob:Math.random()*6"))throw new Error('Direct loot source normalize: material world-drop survived');
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
