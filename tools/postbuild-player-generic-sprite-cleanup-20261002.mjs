import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath)) throw new Error('Stage 2H cleanup: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const count=(text,needle)=>text.split(needle).length-1;
const exactAnimCount=(html.match(/\bANIM\b/g)||[]).length;

for(const sym of ['SPR_IDLE','SPR_RUN','SPR_ATK']){
  const n=count(html,sym);
  if(n!==1) throw new Error(`Stage 2H cleanup: ${sym} expected declaration-only count 1, got ${n}`);
}
for(const sym of ['imgIdle','imgRun','imgAtk']){
  const n=count(html,sym);
  if(n!==2) throw new Error(`Stage 2H cleanup: ${sym} expected declaration+ANIM count 2, got ${n}`);
}
if(exactAnimCount!==1) throw new Error(`Stage 2H cleanup: exact legacy ANIM expected count 1, got ${exactAnimCount}`);

for(const sym of ['imgIdle','imgRun','imgAtk']){
  for(const pattern of [`${sym}.src=`,`${sym}.src =`,`src:${sym}`,`src: ${sym}`]){
    if(html.includes(pattern)) throw new Error(`Stage 2H cleanup: live source binding survived: ${pattern}`);
  }
}

const comment='// Sprite sheets (assassin: idle/breathing, run, attack)';
let start=html.indexOf(comment);
if(start<0) start=html.indexOf('const SPR_IDLE=');
if(start<0) throw new Error('Stage 2H cleanup: generic sprite block start missing');
const animStart=html.indexOf('const ANIM=',start);
if(animStart<0) throw new Error('Stage 2H cleanup: legacy ANIM declaration missing');
const end=html.indexOf('};',animStart);
if(end<0) throw new Error('Stage 2H cleanup: legacy ANIM end missing');

html=html.slice(0,start)+html.slice(end+2);

for(const sym of ['SPR_IDLE','SPR_RUN','SPR_ATK','imgIdle','imgRun','imgAtk']){
  if(html.includes(sym)) throw new Error(`Stage 2H cleanup: legacy symbol survived: ${sym}`);
}
if((html.match(/\bANIM\b/g)||[]).length!==0) throw new Error('Stage 2H cleanup: exact legacy ANIM survived');
for(const keep of ['GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM']){
  if(!html.includes(keep)) throw new Error(`Stage 2H cleanup: required stress/debug metadata missing: ${keep}`);
}
if(!html.includes('PPA_ONLINE_STRESS')) throw new Error('Stage 2H cleanup: stress tool missing');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Stage 2H cleanup: generic legacy player SPR_IDLE/RUN/ATK + imgIdle/imgRun/imgAtk + ANIM block removed; class stress metadata preserved');
