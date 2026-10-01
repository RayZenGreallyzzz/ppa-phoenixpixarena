import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const htmlPath=path.join(publicDir,'index.html');
if(!fs.existsSync(htmlPath))throw new Error('Player sprite asset cleanup: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const entries=[
 ['GNOME_IDLE_SRC','imgGnomeIdle'],['GNOME_RUN_SRC','imgGnomeRun'],['GNOME_ATTACK_SRC','imgGnomeAttack'],
 ['ARCHER_IDLE_SRC','imgArcherIdle'],['ARCHER_RUN_SRC','imgArcherRun'],['ARCHER_ATTACK_SRC','imgArcherAttack'],
 ['ASSASSIN_IDLE_SRC','imgAssassinIdle'],['ASSASSIN_RUN_SRC','imgAssassinRun'],['ASSASSIN_ATTACK_SRC','imgAssassinAttack'],
 ['TANK_IDLE_SRC','imgTankIdle'],['TANK_RUN_SRC','imgTankRun'],['TANK_ATTACK_SRC','imgTankAttack'],
 ['BERSERKER_IDLE_SRC','imgBerserkerIdle'],['BERSERKER_RUN_SRC','imgBerserkerRun'],['BERSERKER_ATTACK_SRC','imgBerserkerAttack'],
 ['PRIEST_IDLE_SRC','imgPriestIdle'],['PRIEST_RUN_SRC','imgPriestRun'],['PRIEST_ATTACK_SRC','imgPriestAttack'],
 ['MAGE_IDLE_SRC','imgMageIdle'],['MAGE_RUN_SRC','imgMageRun'],['MAGE_ATTACK_SRC','imgMageAttack'],
 ['PALADIN_IDLE_SRC','imgPaladinIdle'],['PALADIN_RUN_SRC','imgPaladinRun'],['PALADIN_ATTACK_SRC','imgPaladinAttack']
];

const assetPaths=[];
function occurrences(text,needle){return text.split(needle).length-1}
for(const [srcName,imgName] of entries){
  const srcRe=new RegExp(`const\\s+${srcName}\\s*=\\s*(['\"])([^'\"]+)\\1\\s*;`);
  const srcMatch=html.match(srcRe);
  if(!srcMatch)throw new Error(`Player sprite asset cleanup: ${srcName} declaration missing`);
  if(occurrences(html,srcName)!==1)throw new Error(`Player sprite asset cleanup: ${srcName} has live references (${occurrences(html,srcName)})`);
  const imgDeclRe=new RegExp(`const\\s+${imgName}\\s*=\\s*new\\s+Image\\(\\)\\s*;`);
  if(!imgDeclRe.test(html))throw new Error(`Player sprite asset cleanup: ${imgName} declaration missing`);
  if(occurrences(html,imgName)!==2)throw new Error(`Player sprite asset cleanup: ${imgName} unexpected reference count ${occurrences(html,imgName)}`);
  const imgUse=`img:${imgName}`;
  if(occurrences(html,imgUse)!==1)throw new Error(`Player sprite asset cleanup: ${imgUse} expected once`);
  assetPaths.push(srcMatch[2]);
  html=html.replace(srcRe,'');
  html=html.replace(imgDeclRe,'');
  html=html.replace(imgUse,'img:null');
}

for(const [srcName,imgName] of entries){
  if(html.includes(srcName)||html.includes(imgName))throw new Error(`Player sprite asset cleanup: legacy symbol survived: ${srcName}/${imgName}`);
}

fs.writeFileSync(htmlPath,html,'utf8');

function textFiles(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())textFiles(p,out);
    else if(/\.(?:html|js|css|json|txt|map)$/i.test(ent.name))out.push(p);
  }
  return out;
}
const texts=textFiles(publicDir);
let deleted=0;
for(const relRaw of [...new Set(assetPaths)]){
  const rel=String(relRaw).replace(/^\.\//,'');
  const stillUsed=texts.some(p=>fs.readFileSync(p,'utf8').includes(relRaw)||fs.readFileSync(p,'utf8').includes(rel));
  if(stillUsed)throw new Error(`Player sprite asset cleanup: asset still referenced after cleanup: ${relRaw}`);
  const abs=path.join(publicDir,rel);
  if(fs.existsSync(abs)){fs.unlinkSync(abs);deleted++;}
}

console.log(`Player sprite asset cleanup: ${entries.length} dead class Image objects removed; ${deleted} unreferenced atlas files removed; stress/debug fallback remains primitive-only`);
