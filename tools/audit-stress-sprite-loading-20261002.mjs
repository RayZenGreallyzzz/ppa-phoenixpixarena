import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
const names=['imgIdle','imgRun','imgAtk','imgGnomeIdle','imgGnomeRun','imgGnomeAttack','imgArcherIdle','imgArcherRun','imgArcherAttack','imgAssassinIdle','imgAssassinRun','imgAssassinAttack','imgTankIdle','imgTankRun','imgTankAttack','imgBerserkerIdle','imgBerserkerRun','imgBerserkerAttack','imgPriestIdle','imgPriestRun','imgPriestAttack','imgMageIdle','imgMageRun','imgMageAttack','imgPaladinIdle','imgPaladinRun','imgPaladinAttack'];
console.log('=== STRESS SPRITE LOAD AUDIT ===');
for(const n of names){
  const pats=[`${n}.src=`,`${n}.src =`,`src:${n}`,`src: ${n}`];
  const hits=[];
  for(const p of pats){let i=0;while((i=html.indexOf(p,i))!==-1){hits.push(i);i+=p.length;}}
  console.log(`IMAGE ${n} SRC_ASSIGNMENTS ${hits.length}`);
  for(const pos of [...new Set(hits)].slice(0,6)) console.log(html.slice(Math.max(0,pos-220),Math.min(html.length,pos+360)).replace(/\s+/g,' '));
}
for(const needle of ['function v174AiSpriteCfg','function v174DrawAiTrainingFighter','PPA_ONLINE_STRESS','debugRemotes']){
  let from=0,count=0;
  while((from=html.indexOf(needle,from))!==-1){count++;console.log(`NEEDLE ${needle} HIT ${count}`,html.slice(Math.max(0,from-260),Math.min(html.length,from+900)).replace(/\s+/g,' '));from+=needle.length;}
  console.log(`NEEDLE ${needle} COUNT ${count}`);
}
console.log('=== END STRESS SPRITE LOAD AUDIT ===');
