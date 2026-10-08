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
function option(name,def=null){
  const i=args.indexOf(name);
  if(i<0)return def;
  if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(name+' requires a value');
  return args[i+1];
}
const reportPath=path.resolve(option('--output',path.join(root,'audit-output','dungeon-mob-art-current.json')));
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
// Older HTML releases can have a simple MOB_TABLE; report that table separately
// from narrative name mentions. In particular, slot 4 must not be silently
// changed from the approved slime to the obsolete scavenger bird.
const mobTableMatch=source.match(/\b(?:const|var|let)\s+MOB_TABLE\s*=\s*\[([\s\S]*?)\]\s*;/m);
const mobTable=[];
if(mobTableMatch){
  for(const m of mobTableMatch[1].matchAll(/\{([^{}]+)\}/g)){
    const lv=m[1].match(/\blvl\s*:\s*(\d+)/);
    const name=m[1].match(/\bn\s*:\s*(['"])(.*?)\1/);
    if(lv&&name)mobTable.push({level:Number(lv[1]),name:name[2]});
  }
}
const fourthEntries=mobTable.filter(x=>x.level===4);
const fourthStatus=fourthEntries.length!==1?'not_identifiable_from_source':
  fourthEntries[0].name==='Слайм-падальщик'?'correct_name_in_MOB_TABLE':
  fourthEntries[0].name==='Падальщик'?'OBSOLETE_BIRD_NAME_IN_MOB_TABLE':'unverified_fourth_mob_name';
function imageMeta(mime,b64){
  const bytes=Buffer.from(b64,'base64');
  const meta={mime,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){
    meta.width=bytes.readUInt32BE(16);meta.height=bytes.readUInt32BE(20);
  }
  return meta;
}
const spriteListMatch=source.match(/\bDUNGEON_MOB_SPRITES\s*=\s*\[([\s\S]*?)\]\s*;/m);
const mobImages=[];
if(spriteListMatch){
  for(const m of spriteListMatch[1].matchAll(/data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/g)){
    mobImages.push({index:mobImages.length,...imageMeta(m[1],m[2])});
  }
}
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
    ...imageMeta(match[1],match[2]),
    precedingCode:source.slice(Math.max(0,match.index-180),match.index)
      .replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g,'[EMBEDDED_IMAGE]')
      .replace(/\s+/g,' ').slice(-180)
  });
}
const report={
  note:'Read-only inventory. Labels do NOT establish actual runtime image-to-mob mapping.',
  sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),
  sourceCharacters:source.length,
  fourthStatus,
  mobTableSize:mobTable.length,
  mobTable,
  dungeonSpriteListSize:mobImages.length,
  dungeonSpriteListImages:mobImages,
  expectedFourthStarterMonster:'Слайм-падальщик',
  forbiddenVisualRegression:'Old bird Падальщик in slime slot',
  labels:labels.map(occurrences),
  embeddedImageCount:embedded.length,
  embeddedImages:embedded
};
const output=reportPath;
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2),'utf8');
console.log('PPA_DUNGEON_MOB_ART_AUDIT_OK');
console.log('Packed source SHA-256:',report.sourceSha256);
console.log('Fourth mob in inline MOB_TABLE:',fourthStatus);
console.log('MOB_TABLE:',mobTable.length,'DUNGEON_MOB_SPRITES:',mobImages.length);
console.log('Embedded image URIs:',embedded.length);
for(const row of report.labels)console.log(row.label+': '+row.count);
console.log('Report:',output);
console.log('Manual verification of runtime sprite bindings still required.');
