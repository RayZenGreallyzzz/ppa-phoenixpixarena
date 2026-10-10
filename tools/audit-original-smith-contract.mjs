import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// Read the SAME checksum-locked public Telegram game sources as its build.
// This QA ONLY inspects source signatures, no real account or game HTTP writes.
const data=Buffer.concat(Array.from({length:12},(_,i)=>readFileSync(
  new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url))));
const source=gunzipSync(data).toString('utf8');
const sha=createHash('sha256').update(source).digest('hex');
if(sha!=='a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7')
  throw Error('Legacy PPA source changed; stop before extracting incompatible craft logic');
const expressions=[
 /function\s+[\w$]*(?:craft|Craft|forge|Forge|sharpen|Sharpen|enhanc|Enhanc|blacksmith|Blacksmith|smith|Smith|petCraft|accCraft)[\w$]*\s*\([^)]*\)\s*\{/g,
 /(?:const|let|var)\s+(?:GEAR|ACC|PETS|CRAFT_RESOURCE_MULT)\s*=/g,
 /function\s+merchantBuy\(/g,
 /blacksmithFrame/g
];
for(let j=0;j<expressions.length;j++){
 const rx=expressions[j]; let match,shown=0;
 while((match=rx.exec(source))!==null && shown<30){
   const segment=source.slice(Math.max(0,match.index-240),Math.min(source.length,match.index+1750));
   // Intentionally log only source code around a public function or catalog,
   // never any users, game session, private environment or request headers.
   console.log('PPA_FORGE_SOURCE_SAMPLE',JSON.stringify({
     group:j,at:match.index,signature:match[0],
     excerpt:segment.slice(240).replace(/(?:Bearer|authorization|password|secret|token)\s*[:=]\s*['"][^'"]+['"]/ig,'[redacted]')
   }));
   shown++;
 }
 console.log('PPA_FORGE_SOURCE_GROUP',j,'samples',shown);
}
for (const functionName of ['blacksmithCraft','applyGearMagicWard','craftStats']) {
 const signature='function '+functionName+'(';
 const at=source.indexOf(signature);
 if(at<0) throw Error('Original PPA core forge function missing: '+functionName);
 const until=source.indexOf('\nfunction ',at+signature.length);
 const segment=source.slice(at,Math.min(until<0?at+9000:until,at+9000));
 // Keep output free of embedded huge art and player data. Function logic only.
 console.log('PPA_SMITH_EXACT_FUNCTION',JSON.stringify({name:functionName,body:segment}));
}
for (const signature of ['const CLASS_ITEM_NAMES=', 'var CLASS_ITEM_NAMES=', 'function itemBM(']) {
 const at=source.indexOf(signature);
 if(at<0) { console.log('PPA_SMITH_MISSING_OPTIONAL',signature); continue; }
 const until=source.indexOf('\nfunction ',at+signature.length);
 const raw=source.slice(at,Math.min(at+4600,until>0?until:at+4600));
 console.log('PPA_SMITH_REFERENCE',JSON.stringify({signature,excerpt:raw}));
}
for (const name of ['accessoryStatValues','petQty','qtyForRarity']) {
 const start=source.indexOf('function '+name+'(');
 if(start<0) throw Error('original '+name+' missing');
 const end=source.indexOf('\nfunction ',start+10);
 const code=source.slice(start,Math.min(end>start?end:start+2800,start+2800));
 console.log('PPA_SMITH_EXTRA_FUNCTION',JSON.stringify({name,code}));
}
for (const pattern of [/const LEGENDARY_CRAFT=\[([^;]+?)\];/,/const NECKLACE_STAT_VALUES=([^;]+);/,
                       /var RPREF=([^;]+);/,/const RPREF=([^;]+);/]) {
 const found=source.match(pattern);
 if(found) console.log('PPA_SMITH_EXTRA_CONSTANT',JSON.stringify({name:pattern.source,code:found[0].slice(0,7800)}));
}
for(const word of ['LEGENDARY_CRAFT','ACCESSORY_STAT_VALUES']){
 const idx=source.indexOf(word);
 console.log('PPA_SMITH_LOOKUP',JSON.stringify({word,index:idx,excerpt:source.slice(idx-50,idx+5500).slice(0,5500)}));
}

// Find the ORIGINAL parent handler for the blacksmithEnhance postMessage.
// Do not infer success probabilities/penalties from UI labels or change them.
for(const query of [
  "function blacksmithEnhance(", "function enhanceItem(", "function getEnhance",
  "function sharpenItem(", "case 'blacksmithEnhance'",
  "d.type==='blacksmithEnhance'", "d.type === 'blacksmithEnhance'",
  "type==='blacksmithEnhance'", "type === 'blacksmithEnhance'",
  "ENHANCE_CHANCES", "ENHANCE_BASE", "premium_rune", "normal_rune"
]) {
  const positions=[];
  let pos=0;
  while((pos=source.indexOf(query,pos))>=0 && positions.length<12) {
    positions.push(pos);
    pos+=query.length;
  }
  console.log('PPA_ORIGINAL_ENHANCE_LOCATOR',JSON.stringify({query,positions,
    previews:positions.map(i=>source.slice(Math.max(0,i-160),i+400))
      .map(x=>x.slice(0,560))}));
}


// Exact parent item sharpening semantics, not the cosmetic iframe.
for(const term of ['function blacksmithEnhance(', 'function v238SendSmithEnhanceDelta(',
  'function v238SmithEnhance', 'var ENH_CHANCE=', 'const ENH_CHANCE=',
  'var ENH_CHANCE_RUNE=', 'const ENH_CHANCE_RUNE=']) {
  const at=source.indexOf(term);
  if(at<0)continue;
  const end=term.startsWith('function ')
    ?source.indexOf('\nfunction ',at+term.length):at+350;
  const snippet=source.slice(at,Math.min(end>at?end:at+7500,at+7500));
  console.log('PPA_SMITH_ENHANCE_EXACT',JSON.stringify({term,at,code:snippet}));
}


for(const query of [
  'function ensureEnhBaseStats(', 'function applyEnhancementStats(',
  'function syncItemBM(', 'ENH_CHANCE_GAME=', 'ENH_CHANCE_RUNE_GAME=',
  'function v238SmithPersist', 'function v238SmithLiteItem('
]){
  const i=source.indexOf(query);
  if(i<0){console.log('PPA_ENHANCE_DETAIL_MISSING',query);continue;}
  const e=query.startsWith('function ') ?source.indexOf('\nfunction ',i+query.length):i+390;
  console.log('PPA_ENHANCE_DETAIL',JSON.stringify({query,code:source.slice(i,Math.min(e>i?e:i+4900,i+4900))}));
}

for(const q of ['const ENH_STAT_BONUS=', 'var ENH_STAT_BONUS=',
  'function sharpenRoundStat(', 'function applyAwakeningExtras(',
  'function applyPetEnhancementExtras(', 'function cloneNumericStats(',
  'function stellarGuardianPrepareBase(', 'const STELLAR_GUARDIAN_NAME=']) {
 const i=source.indexOf(q);
 if(i<0) { console.log('PPA_SHARP_RULE_MISSING',q); continue; }
 const end=q.startsWith('function ')?source.indexOf('\nfunction ',i+q.length):i+280;
 const code=source.slice(i,Math.min(end>i?end:i+4000,i+4000));
 console.log('PPA_SHARP_RULE',JSON.stringify({query:q,code}));
}


for(const q of [
  'function awakeningBonusForItem(', 'function petEnhBonusAtLevel(',
  'function awakeningStatLabel(', 'function petBonusLabel(',
  'const PET_ENH_PLUS5_BONUS=', 'function stellarGuardianProfile('
]){
 const at=source.indexOf(q);
 if(at<0)continue;
 const end=q.startsWith('function ')?source.indexOf('\nfunction ',at+q.length):at+1450;
 console.log('PPA_SHARP_EXTRAS',JSON.stringify({query:q,code:source.slice(at,Math.min(end>at?end:at+2300,at+2300))}));
}


// Identify original player inventory equip/unequip path before adding a
// shared server mutation; do not assume gear can be moved without a swap.
for(const needle of [
 'function equipItem(', 'function unequipItem(', 'function equipFromBag(',
 'function unequipToBag(', 'function equipGear(', 'function unequipGear(',
 "d.type==='equipItem'", "d.type==='unequipItem'",
 "d.type==='equip'", "d.type==='unequip'",
 'INV.equipped[', 'function swapEquip(', 'function equipFromInventory('
]) {
 const hits=[]; let at=0;
 while((at=source.indexOf(needle,at))>=0&&hits.length<12){
   hits.push(at);at+=needle.length;
 }
 console.log('PPA_ORIGINAL_EQUIP_LOCATOR',JSON.stringify({needle,count:hits.length,hits,
  nearby:hits.slice(0,5).map(i=>source.slice(Math.max(0,i-190),Math.min(source.length,i+650)))}));
}

console.log('PPA_ORIGINAL_SMITH_CONTRACT_SOURCE_OK',sha,'chars',source.length);
