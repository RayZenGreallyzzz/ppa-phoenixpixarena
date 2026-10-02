import fs from 'node:fs';
const html=fs.readFileSync('public/index.html','utf8');
function show(label,needle,before=300,after=2200){
 const i=html.indexOf(needle); console.log(`=== ${label} @ ${i} ===`);
 if(i>=0) console.log(html.slice(Math.max(0,i-before),Math.min(html.length,i+after)).replace(/\s+/g,' '));
}
show('AI CFG','function v174AiSpriteCfg');
show('AI DRAW','function v174DrawAiTrainingFighter');
show('ONLINE STRESS','PPA_ONLINE_STRESS');
show('REMOTE DRAW','function ppaOnlineDrawRemote');
for(const k of ['GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM']){
 const i=html.indexOf(`const ${k}=`); console.log(`${k} @ ${i}:`,i>=0?html.slice(i,i+450).replace(/\s+/g,' '):'MISSING');
}
for(const n of ['mobile-sprite-performance.js','remote-sprite-renderer.js']){
 let c=0,p=0; while((p=html.indexOf(n,p))!==-1){c++;p+=n.length;} console.log(`REF ${n}: ${c}`);
}
