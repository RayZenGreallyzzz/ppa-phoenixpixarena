import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const packed=Buffer.concat(parts.map(p=>fs.readFileSync(p)));
const buf=zlib.gunzipSync(packed);
const source=buf.toString('utf8');
const sha=crypto.createHash('sha256').update(buf).digest('hex');
console.log('SOURCE_SHA',sha);
console.log('SOURCE_BYTES',buf.length);
console.log('SOURCE_LINES',source.split('\n').length);

const count=(needle)=>(source.split(needle).length-1);
const lineOf=(needle)=>{
  const i=source.indexOf(needle);if(i<0)return -1;
  return source.slice(0,i).split('\n').length;
};
const tokens=[
  'const RESOURCES=[','const SPR_IDLE=','const SPR_RUN=','const SPR_ATK=',
  'const GNOME_IDLE_SRC=','const ARCHER_IDLE_SRC=','const ASSASSIN_IDLE_SRC=',
  'const TANK_IDLE_SRC=','const BERSERKER_IDLE_SRC=','const PRIEST_IDLE_SRC=',
  'const MAGE_IDLE_SRC=','const PALADIN_IDLE_SRC=',
  'function drawPlayer(){','function playerAnimDef(name){','function playerUsesGnomeSprites(){',
  'function v174AiSpriteCfg(e){','function v174AiDirIndex(e){','const GNOME_ANIM=',
  'function v174DrawAiTrainingFighter(e,sx,sy){','PPA_ONLINE_STRESS'
];
for(const t of tokens)console.log('TOKEN',JSON.stringify(t),'count='+count(t),'line='+lineOf(t));

const srcNames=[
 'GNOME_IDLE_SRC','GNOME_RUN_SRC','GNOME_ATTACK_SRC','ARCHER_IDLE_SRC','ARCHER_RUN_SRC','ARCHER_ATTACK_SRC',
 'ASSASSIN_IDLE_SRC','ASSASSIN_RUN_SRC','ASSASSIN_ATTACK_SRC','TANK_IDLE_SRC','TANK_RUN_SRC','TANK_ATTACK_SRC',
 'BERSERKER_IDLE_SRC','BERSERKER_RUN_SRC','BERSERKER_ATTACK_SRC','PRIEST_IDLE_SRC','PRIEST_RUN_SRC','PRIEST_ATTACK_SRC',
 'MAGE_IDLE_SRC','MAGE_RUN_SRC','MAGE_ATTACK_SRC','PALADIN_IDLE_SRC','PALADIN_RUN_SRC','PALADIN_ATTACK_SRC'
];
let embeddedClassAssets=0,remoteClassAssets=0;
for(const name of srcNames){
  const re=new RegExp(`const\\s+${name}\\s*=\\s*(['\"])([\\s\\S]*?)\\1\\s*;`);
  const m=source.match(re);
  if(!m){console.log('CLASS_SRC_MISSING',name);continue}
  const v=m[2];const kind=v.startsWith('data:image/')?'embedded':/^https?:\/\//.test(v)?'remote':'local';
  if(kind==='embedded')embeddedClassAssets++;if(kind==='remote')remoteClassAssets++;
  console.log('CLASS_SRC',name,'kind='+kind,'len='+v.length,'prefix='+v.slice(0,60));
}
console.log('CLASS_SRC_SUMMARY embedded='+embeddedClassAssets+' remote='+remoteClassAssets+' total='+srcNames.length);

for(const name of ['SPR_IDLE','SPR_RUN','SPR_ATK']){
  const re=new RegExp(`const\\s+${name}\\s*=\\s*(['\"])([^'\"]+)\\1\\s*;`);
  const m=source.match(re);console.log('GENERIC_SRC',name,m?m[2]:'MISSING');
}

const rs=source.indexOf('const RESOURCES=['),re=rs<0?-1:source.indexOf('\n];',rs);
if(rs>=0&&re>rs){
  const block=source.slice(rs,re+3);
  const imgs=['imgIdle','imgRun','imgAtk','imgGnomeIdle','imgGnomeRun','imgGnomeAttack','imgArcherIdle','imgArcherRun','imgArcherAttack','imgAssassinIdle','imgAssassinRun','imgAssassinAttack','imgTankIdle','imgTankRun','imgTankAttack','imgBerserkerIdle','imgBerserkerRun','imgBerserkerAttack','imgPriestIdle','imgPriestRun','imgPriestAttack','imgMageIdle','imgMageRun','imgMageAttack','imgPaladinIdle','imgPaladinRun','imgPaladinAttack'];
  const present=imgs.filter(x=>block.includes(`img:${x}`));
  console.log('PLAYER_PRELOADS_IN_SOURCE',present.length,present.join(','));
  console.log('SAFE_ZONE_RESOURCE_PRESENT',block.includes("name:'Safe Zone Map'"));
}

const build=fs.readFileSync('build.mjs','utf8');
const bl=build.split('\n');
console.log('BUILD_LINES',bl.length);
const interesting=[];
for(let i=0;i<bl.length;i++){
  const l=bl[i];
  if(/data:image|externaliz|writeFileSync\([^\n]*index\.html|indexPath|let html\b|const html\b|source\.replace|replaceAll\(|assetsDir/.test(l))interesting.push([i+1,l.trim()]);
}
for(const [n,l] of interesting.slice(0,140))console.log('BUILD_PIPELINE',n,l.slice(0,240));
console.log('BUILD_PIPELINE_MATCHES',interesting.length);

// Show compact source contexts around the key legacy blocks without dumping embedded images.
const sourceLines=source.split('\n');
for(const needle of ['const SPR_IDLE=','const GNOME_IDLE_SRC=','const RESOURCES=[','function playerAnimDef(name){','function drawPlayer(){','function v174AiSpriteCfg(e){','function v174DrawAiTrainingFighter(e,sx,sy){']){
  const ln=lineOf(needle);if(ln<0)continue;
  console.log('CTX_BEGIN',needle,'line='+ln);
  for(let n=Math.max(1,ln-2);n<=Math.min(sourceLines.length,ln+5);n++){
    let text=sourceLines[n-1];
    if(text.length>300)text=text.slice(0,300)+'…';
    console.log(String(n).padStart(6),text);
  }
  console.log('CTX_END',needle);
}
