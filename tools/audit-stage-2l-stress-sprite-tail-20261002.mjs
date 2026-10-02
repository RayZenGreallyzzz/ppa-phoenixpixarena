import fs from 'node:fs';

const html=fs.readFileSync('public/index.html','utf8');
const dead=[
  'v174AiSpriteCfg','v174AiDirIndex',
  'GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM',
  'GNOME_SOURCE_ROW','GNOME_FLIP_BY_DIR','ARCHER_SOURCE_ROW','ARCHER_FLIP_BY_DIR','ASSASSIN_RUN_SOURCE_ROW','ASSASSIN_4DIR_ROW',
  'TANK_4DIR_ROW','BERSERKER_4DIR_ROW','PRIEST_4DIR_ROW','MAGE_4DIR_ROW','PALADIN_4DIR_ROW',
  'GNOME_DRAW_SCALE','ARCHER_DRAW_SCALE','ASSASSIN_RUN_DRAW_SCALE','ASSASSIN_IDLE_DRAW_SCALE','ASSASSIN_ATTACK_DRAW_SCALE',
  'TANK_DRAW_SCALE','BERSERKER_DRAW_SCALE','PRIEST_DRAW_SCALE','MAGE_DRAW_SCALE','PALADIN_DRAW_SCALE'
];
for(const token of dead){
  const n=html.split(token).length-1;
  console.log(`DEAD ${token}: ${n}`);
  if(n)throw new Error('Stage 2L audit: dead sprite metadata survived: '+token);
}
const live=[
  'const PLAYER_ANIM_TIMING=',"function playerAnimTiming(name){",'const V174_AI_CLASS=',
  'function v174SpawnAiTrainingFighter','PPA_AI_TRAINING_ACTIVE','function v174DrawAiTrainingFighter(e,sx,sy){',
  'isAiFighter:true','PPA_ONLINE_STRESS',
  "cx.fillStyle='#9d63db';cx.beginPath();cx.arc(sx,sy-10,aiVisualSize*.35,0,Math.PI*2);cx.fill();",
  'PPA_PLAYER3D_LOCAL_ONLY_20261002'
];
for(const token of live){
  const n=html.split(token).length-1;
  console.log(`LIVE ${token}: ${n}`);
  if(!n)throw new Error('Stage 2L audit: required live feature missing: '+token);
}
const drawStart=html.indexOf('function v174DrawAiTrainingFighter(e,sx,sy){');
const drawEnd=html.indexOf('let __ppaHudNextAt=0;',drawStart);
if(drawStart<0||drawEnd<0)throw new Error('Stage 2L audit: AI Training renderer range missing');
const draw=html.slice(drawStart,drawEnd);
for(const token of ['drawImage','a.img','cfg.','phoneCharacterDrawHeight']){
  if(draw.includes(token))throw new Error('Stage 2L audit: sprite drawing survived inside AI Training renderer: '+token);
}
for(const protectedPath of ['public/game/dungeon-mob-events.js','public/game/dungeon60-dragon.js','public/game/boss-drop-boost.js','public/game/clan-boss-loot.js']){
  if(!fs.existsSync(protectedPath))throw new Error('Stage 2L audit: protected mob/boss runtime missing: '+protectedPath);
  console.log('PROTECTED '+protectedPath+': true');
}
console.log('STAGE_2L_FINAL_AUDIT_OK');
