import fs from 'node:fs';

const html=fs.readFileSync('public/index.html','utf8');
const tokens=[
  'v174AiSpriteCfg','v174DrawAiTrainingFighter','isAiFighter','V174_AI_CLASS','PPA_ONLINE_STRESS',
  'GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM',
  'GNOME_SOURCE_ROW','ARCHER_SOURCE_ROW','ASSASSIN_RUN_SOURCE_ROW','ASSASSIN_4DIR_ROW','TANK_4DIR_ROW','BERSERKER_4DIR_ROW','PRIEST_4DIR_ROW','MAGE_4DIR_ROW','PALADIN_4DIR_ROW',
  'GNOME_DRAW_SCALE','ARCHER_DRAW_SCALE','ASSASSIN_IDLE_DRAW_SCALE','TANK_DRAW_SCALE','BERSERKER_DRAW_SCALE','PRIEST_DRAW_SCALE','MAGE_DRAW_SCALE','PALADIN_DRAW_SCALE'
];
function count(needle){return html.split(needle).length-1}
function contexts(needle,limit=20,radius=420){
  const out=[];let p=0;
  while((p=html.indexOf(needle,p))!==-1&&out.length<limit){
    out.push(html.slice(Math.max(0,p-radius),Math.min(html.length,p+needle.length+radius)).replace(/\s+/g,' '));
    p+=Math.max(1,needle.length);
  }
  return out;
}
for(const t of tokens){
  console.log(`TOKEN ${t}: ${count(t)}`);
  for(const c of contexts(t,12)) console.log(`CTX ${t}: ${c}`);
}
for(const pattern of ['isAiFighter:true','isAiFighter: true','isAiFighter = true','isAiFighter=true']){
  console.log(`CREATE ${pattern}: ${count(pattern)}`);
  for(const c of contexts(pattern,20,650)) console.log(`CREATECTX ${pattern}: ${c}`);
}
for(const protectedPath of ['public/game/dungeon-mob-events.js','public/game/dungeon60-dragon.js','public/game/boss-drop-boost.js','public/game/clan-boss-loot.js']){
  if(!fs.existsSync(protectedPath))throw new Error('protected mob/boss runtime missing: '+protectedPath);
  console.log('PROTECTED '+protectedPath+': true');
}
console.log('STAGE_2L_AUDIT_DONE');
