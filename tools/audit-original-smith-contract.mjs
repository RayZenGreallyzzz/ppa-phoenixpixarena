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
console.log('PPA_ORIGINAL_SMITH_CONTRACT_SOURCE_OK',sha,'chars',source.length);
