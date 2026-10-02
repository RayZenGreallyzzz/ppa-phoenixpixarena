import fs from 'node:fs';

const htmlPath='public/index.html';
if(!fs.existsSync(htmlPath))throw new Error('Stage 2L cleanup: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const count=(needle)=>(html.split(needle).length-1);

function findBalancedEnd(text,openAt,openChar='{',closeChar='}'){
  let depth=0,quote=null,escape=false,lineComment=false,blockComment=false;
  for(let i=openAt;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(lineComment){if(ch==='\n')lineComment=false;continue;}
    if(blockComment){if(ch==='*'&&nx==='/'){blockComment=false;i++;}continue;}
    if(quote){
      if(escape){escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote){quote=null;continue;}
      continue;
    }
    if(ch==='/'&&nx==='/'){lineComment=true;i++;continue;}
    if(ch==='/'&&nx==='*'){blockComment=true;i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch===openChar)depth++;
    else if(ch===closeChar){depth--;if(depth===0)return i;}
  }
  throw new Error('Stage 2L cleanup: balanced block end not found');
}

function removeFunction(signature){
  const start=html.indexOf(signature);
  if(start<0)throw new Error(`Stage 2L cleanup: function missing: ${signature}`);
  if(html.indexOf(signature,start+signature.length)>=0)throw new Error(`Stage 2L cleanup: duplicate function signature: ${signature}`);
  const open=html.indexOf('{',start);
  const end=findBalancedEnd(html,open);
  html=html.slice(0,start)+html.slice(end+1);
}

function removeObjectConst(name){
  const prefix=`const ${name}=`;
  const start=html.indexOf(prefix);
  if(start<0)throw new Error(`Stage 2L cleanup: ${name} declaration missing`);
  if(html.indexOf(prefix,start+prefix.length)>=0)throw new Error(`Stage 2L cleanup: duplicate ${name} declaration`);
  const open=html.indexOf('{',start+prefix.length);
  if(open<0)throw new Error(`Stage 2L cleanup: ${name} object start missing`);
  const close=findBalancedEnd(html,open);
  let end=close+1;
  while(end<html.length&&/\s/.test(html[end]))end++;
  if(html[end]!==';')throw new Error(`Stage 2L cleanup: ${name} declaration semicolon missing`);
  html=html.slice(0,start)+html.slice(end+1);
}

function removeSimpleConst(name){
  const re=new RegExp(`const\\s+${name}\\s*=\\s*[^;]+;`,'g');
  const matches=html.match(re)||[];
  if(matches.length!==1)throw new Error(`Stage 2L cleanup: ${name} expected one simple declaration, got ${matches.length}`);
  html=html.replace(re,'');
}

// Guard the live features before touching any old visual metadata.
for(const keep of [
  'const PLAYER_ANIM_TIMING=',"function playerAnimTiming(name){",'const V174_AI_CLASS=',
  'function v174SpawnAiTrainingFighter','PPA_AI_TRAINING_ACTIVE','function v174DrawAiTrainingFighter(e,sx,sy){',
  'PPA_ONLINE_STRESS'
]){
  if(!html.includes(keep))throw new Error(`Stage 2L cleanup: required live feature missing before cleanup: ${keep}`);
}
if(!html.includes('isAiFighter:true'))throw new Error('Stage 2L cleanup: AI Training fighter creation missing');

const animNames=['GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM'];
for(const name of animNames){
  if(count(name)!==2)throw new Error(`Stage 2L cleanup: ${name} expected declaration+sprite-config count 2, got ${count(name)}`);
  const prefix=`const ${name}=`;
  const start=html.indexOf(prefix);
  const end=html.indexOf('};',start);
  const block=html.slice(start,end+2);
  if(!block.includes('img:null'))throw new Error(`Stage 2L cleanup: ${name} is not the already-disabled img:null metadata`);
}

const spriteReferencedSimple=[
  'GNOME_SOURCE_ROW','ARCHER_SOURCE_ROW','ASSASSIN_RUN_SOURCE_ROW','ASSASSIN_4DIR_ROW','TANK_4DIR_ROW',
  'BERSERKER_4DIR_ROW','PRIEST_4DIR_ROW','MAGE_4DIR_ROW','PALADIN_4DIR_ROW',
  'GNOME_DRAW_SCALE','ARCHER_DRAW_SCALE','ASSASSIN_RUN_DRAW_SCALE','ASSASSIN_IDLE_DRAW_SCALE','ASSASSIN_ATTACK_DRAW_SCALE',
  'TANK_DRAW_SCALE','BERSERKER_DRAW_SCALE','PRIEST_DRAW_SCALE','MAGE_DRAW_SCALE','PALADIN_DRAW_SCALE'
];
for(const name of spriteReferencedSimple){
  if(count(name)!==2)throw new Error(`Stage 2L cleanup: ${name} expected declaration+sprite-config count 2, got ${count(name)}`);
}
for(const name of ['GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR']){
  if(count(name)!==1)throw new Error(`Stage 2L cleanup: ${name} expected definition-only count 1, got ${count(name)}`);
}
if(count('v174AiDirIndex')!==2)throw new Error(`Stage 2L cleanup: v174AiDirIndex expected definition+sprite-render count 2, got ${count('v174AiDirIndex')}`);
if(count('v174AiSpriteCfg')!==2)throw new Error(`Stage 2L cleanup: v174AiSpriteCfg expected definition+sprite-render count 2, got ${count('v174AiSpriteCfg')}`);

// Rewrite only the obsolete sprite branch of AI Training rendering. Its visible
// fallback is already the purple primitive because every class animation img is null.
const drawSig='function v174DrawAiTrainingFighter(e,sx,sy){';
const drawStart=html.indexOf(drawSig);
const drawOpen=html.indexOf('{',drawStart);
const drawEnd=findBalancedEnd(html,drawOpen);
let draw=html.slice(drawStart,drawEnd+1);
const cfgLine="const cfg=v174AiSpriteCfg(e),a=cfg.anim,di=v174AiDirIndex(e);";
const bobLine='const bob=Math.sin(e.bob)*2;';
if((draw.split(cfgLine).length-1)!==1)throw new Error('Stage 2L cleanup: AI sprite config line changed');
if((draw.split(bobLine).length-1)!==1)throw new Error('Stage 2L cleanup: AI sprite bob line changed');
draw=draw.replace(cfgLine,'').replace(bobLine,'');

const branchSig='if(a&&a.img&&a.img.complete&&a.img.naturalWidth>0){';
const branchStart=draw.indexOf(branchSig);
if(branchStart<0)throw new Error('Stage 2L cleanup: AI sprite draw branch missing');
const branchOpen=draw.indexOf('{',branchStart);
const branchClose=findBalancedEnd(draw,branchOpen);
let p=branchClose+1;
while(p<draw.length&&/\s/.test(draw[p]))p++;
if(!draw.startsWith('else{',p))throw new Error('Stage 2L cleanup: AI primitive fallback else missing');
const elseOpen=draw.indexOf('{',p);
const elseClose=findBalancedEnd(draw,elseOpen);
const primitive="cx.fillStyle='#9d63db';cx.beginPath();cx.arc(sx,sy-10,aiVisualSize*.35,0,Math.PI*2);cx.fill();";
const oldElseBody=draw.slice(elseOpen+1,elseClose).replace(/\s+/g,'');
if(oldElseBody!==primitive.replace(/\s+/g,''))throw new Error('Stage 2L cleanup: current primitive AI fallback changed unexpectedly');
draw=draw.slice(0,branchStart)+primitive+draw.slice(elseClose+1);

for(const bad of ['v174AiSpriteCfg','v174AiDirIndex','a.img','cfg.','cx.drawImage','phoneCharacterDrawHeight']){
  if(draw.includes(bad))throw new Error(`Stage 2L cleanup: dead sprite token survived in AI renderer: ${bad}`);
}
html=html.slice(0,drawStart)+draw+html.slice(drawEnd+1);

// Remove the two functions that existed only to select sprite rows/frames.
removeFunction('function v174AiSpriteCfg(e){');
if(count('v174AiDirIndex')!==1)throw new Error(`Stage 2L cleanup: v174AiDirIndex expected definition-only after renderer rewrite, got ${count('v174AiDirIndex')}`);
removeFunction('function v174AiDirIndex(e){');

// Remove class sprite metadata individually; never touch PLAYER_ANIM_TIMING or AI combat data.
for(const name of animNames)removeObjectConst(name);
for(const name of [...spriteReferencedSimple,'GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR'])removeSimpleConst(name);

const dead=[
  'v174AiSpriteCfg','v174AiDirIndex',...animNames,...spriteReferencedSimple,'GNOME_FLIP_BY_DIR','ARCHER_FLIP_BY_DIR'
];
for(const name of dead){
  if(html.includes(name))throw new Error(`Stage 2L cleanup: dead AI sprite metadata survived: ${name}`);
}

for(const keep of [
  'const PLAYER_ANIM_TIMING=',"function playerAnimTiming(name){",'const V174_AI_CLASS=',
  'function v174SpawnAiTrainingFighter','PPA_AI_TRAINING_ACTIVE','function v174DrawAiTrainingFighter(e,sx,sy){',
  'isAiFighter:true','PPA_ONLINE_STRESS',primitive
]){
  if(!html.includes(keep))throw new Error(`Stage 2L cleanup: required live feature missing after cleanup: ${keep}`);
}

for(const protectedPath of ['public/game/dungeon-mob-events.js','public/game/dungeon60-dragon.js','public/game/boss-drop-boost.js','public/game/clan-boss-loot.js']){
  if(!fs.existsSync(protectedPath))throw new Error('Stage 2L cleanup: protected mob/boss runtime missing: '+protectedPath);
}

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Stage 2L cleanup: dead AI Training sprite selector/draw branch + class sprite metadata removed; AI combat/training, primitive visual fallback, online stress, Player3D and mob/boss systems preserved');
