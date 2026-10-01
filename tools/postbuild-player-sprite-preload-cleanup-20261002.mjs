import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Player sprite preload cleanup: public/index.html missing');

let html=fs.readFileSync(htmlPath,'utf8');
const marker='/* PPA_PLAYER_SPRITE_PRELOAD_DISABLED_20261002 */';
if(html.includes(marker)){
  console.log('Player sprite preload cleanup: already applied');
  process.exit(0);
}

const resourcesStart='const RESOURCES=[';
const start=html.indexOf(resourcesStart);
if(start<0)throw new Error('Player sprite preload cleanup: RESOURCES array not found');
const end=html.indexOf('\n];',start);
if(end<0)throw new Error('Player sprite preload cleanup: RESOURCES array end not found');

let block=html.slice(start,end+3);
const playerImages=[
  'imgIdle','imgRun','imgAtk',
  'imgGnomeIdle','imgGnomeRun','imgGnomeAttack',
  'imgArcherIdle','imgArcherRun','imgArcherAttack',
  'imgAssassinIdle','imgAssassinRun','imgAssassinAttack',
  'imgTankIdle','imgTankRun','imgTankAttack',
  'imgBerserkerIdle','imgBerserkerRun','imgBerserkerAttack',
  'imgPriestIdle','imgPriestRun','imgPriestAttack',
  'imgMageIdle','imgMageRun','imgMageAttack',
  'imgPaladinIdle','imgPaladinRun','imgPaladinAttack'
];

let removed=0;
for(const img of playerImages){
  const escaped=img.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`^[\\t ]*\\{name:[^\\n]+,img:${escaped},src:[^\\n]+\\},?[\\t ]*\\n?`,'m');
  const hits=block.match(re);
  if(!hits)throw new Error('Player sprite preload cleanup: expected RESOURCES entry for '+img);
  block=block.replace(re,'');
  removed++;
}

if(removed!==27)throw new Error('Player sprite preload cleanup: expected 27 removals, got '+removed);
for(const img of playerImages){
  if(new RegExp(`img:${img}(?:,|\\})`).test(block))throw new Error('Player sprite preload cleanup: player preload survived for '+img);
}
if(!block.includes("name:'Safe Zone Map'"))throw new Error('Player sprite preload cleanup: non-player resources were damaged');

const replacement=marker+'\n'+block;
html=html.slice(0,start)+replacement+html.slice(end+3);
fs.writeFileSync(htmlPath,html,'utf8');
console.log('Player sprite preload cleanup: removed 27 legacy player sprite resources; maps/mobs/UI preload untouched');
