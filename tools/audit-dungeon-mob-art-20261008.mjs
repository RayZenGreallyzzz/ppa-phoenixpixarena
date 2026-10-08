/**
 * Read-only visual asset audit of the CURRENT PPA packed source.
 * Does not modify public/index.html, images, server, map, spawns or loot.
 * Usage: node tools/audit-dungeon-mob-art-20261008.mjs
 *        node tools/audit-dungeon-mob-art-20261008.mjs --source-file file.html
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const root=process.cwd();
const args=process.argv.slice(2);
const sourceOpt=args.indexOf('--source-file');
if(sourceOpt>=0&&(!args[sourceOpt+1]||args[sourceOpt+1].startsWith('--'))){
  throw new Error('--source-file requires a filename');
}
let source;
if(sourceOpt>=0){
  source=fs.readFileSync(path.resolve(args[sourceOpt+1]),'utf8');
}else{
  const files=Array.from({length:12},(_,i)=>'PPA'+String(i+1).padStart(2,'0')+'.bin');
  for(const f of files)if(!fs.existsSync(path.join(root,f)))throw new Error('Missing original packed source: '+f);
  source=zlib.gunzipSync(Buffer.concat(files.map(f=>fs.readFileSync(path.join(root,f))))).toString('utf8');
}
const labels=[
  'Пепельная крыса','Пещерный паук','Обугленный жук',
  'Слайм-падальщик','Слайм','Падальщик',
  'Гоблин-разведчик','Костяной воин','Пепельный волк','Грибная тварь',
  'Культист','Проклятый рыцарь','Каменный голем','Лавовый элементаль',
  'Адская гончая','Огненный демон','Пустотный наблюдатель','Элитный голем'
];
const lower=source.toLocaleLowerCase('ru-RU');
function occurrences(label){
  const needle=label.toLocaleLowerCase('ru-RU'),hits=[];
  let i=0,total=0;
  while((i=lower.indexOf(needle,i))!==-1){
    if(label==='Падальщик'&&/слайм[-\s]*$/iu.test(lower.slice(Math.max(0,i-12),i))){
      i+=needle.length;
      continue;
    }
    total++;
    if(hits.length<6){
      const snippet=source.slice(Math.max(0,i-125),Math.min(source.length,i+label.length+125))
        .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g,'[EMBEDDED_IMAGE]')
        .replace(/\s+/g,' ');
      hits.push({index:i,context:snippet});
    }
    i+=needle.length;
  }
  return {label,count:total,samples:hits};
}
const embedded=[];
const imageRe=/data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/g;
for(const match of source.matchAll(imageRe)){
  embedded.push({
    index:match.index,
    mime:match[1],
    approxBytes:Math.floor(match[2].length*3/4),
    precedingCode:source.slice(Math.max(0,match.index-180),match.index)
      .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g,'[EMBEDDED_IMAGE]')
      .replace(/\s+/g,' ').slice(-180)
  });
}
const report={
  note:'Read-only inventory. Labels do NOT establish actual runtime image-to-mob mapping.',
  sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),
  sourceCharacters:source.length,
  expectedFourthStarterMonster:'Слайм-падальщик',
  forbiddenVisualRegression:'Old bird Падальщик in slime slot',
  labels:labels.map(occurrences),
  embeddedImageCount:embedded.length,
  embeddedImages:embedded
};
const output=path.join(root,'audit-output','dungeon-mob-art-current.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2),'utf8');
console.log('PPA_DUNGEON_MOB_ART_AUDIT_OK');
console.log('Packed source SHA-256:',report.sourceSha256);
console.log('Embedded image URIs:',embedded.length);
for(const row of report.labels)console.log(row.label+': '+row.count);
console.log('Report:',output);
console.log('Manual verification of runtime sprite bindings still required.');
