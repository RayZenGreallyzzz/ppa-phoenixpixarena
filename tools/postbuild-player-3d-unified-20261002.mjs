import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','player-3d-unified-runtime.js');
const remoteSrc=path.join(ROOT,'gateway','remote-player-3d-dispatch.js');
const runtimeDst=path.join(gameDir,'player-3d-unified-runtime.js');
const remoteDst=path.join(gameDir,'remote-player-3d-dispatch.js');
const MODELS=['Tank_Mobile_Shield_Hammer_Final.glb','Berserker_Final.glb','Paladin_Final.glb','Dwarf.glb','Ranger_Mobile_Bow_Z90.glb','Mage_Final.glb','Assassin.glb','Priest_Final_GitHub.glb'];
for(const p of [htmlPath,runtimeSrc,remoteSrc,...MODELS.map(f=>path.join(ROOT,f))])if(!fs.existsSync(p))throw new Error('Unified 3D build: missing '+p);
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.copyFileSync(remoteSrc,remoteDst);
for(const f of MODELS)fs.copyFileSync(path.join(ROOT,f),path.join(gameDir,f));

let html=fs.readFileSync(htmlPath,'utf8');

function functionRange(src,signature){
  const start=src.indexOf(signature);
  if(start<0)throw new Error('Unified 3D build: function signature missing: '+signature);
  if(src.indexOf(signature,start+signature.length)>=0)throw new Error('Unified 3D build: function signature not unique: '+signature);
  const open=src.indexOf('{',start+signature.length-1);
  if(open<0)throw new Error('Unified 3D build: opening brace missing: '+signature);
  let depth=0,state='code',quote='',escaped=false;
  for(let i=open;i<src.length;i++){
    const ch=src[i],next=src[i+1]||'';
    if(state==='line'){if(ch==='\n')state='code';continue}
    if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++}continue}
    if(state==='string'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote){state='code';quote=''}
      continue;
    }
    if(state==='template'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch==='`'){state='code'}
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue}
    if(ch==='/'&&next==='*'){state='block';i++;continue}
    if(ch==='\''||ch==='"'){state='string';quote=ch;continue}
    if(ch==='`'){state='template';continue}
    if(ch==='{'){depth++;continue}
    if(ch==='}'){
      depth--;
      if(depth===0)return [start,i+1];
      if(depth<0)break;
    }
  }
  throw new Error('Unified 3D build: closing brace missing: '+signature);
}
function replaceFunction(src,signature,replacement){const [a,b]=functionRange(src,signature);return src.slice(0,a)+replacement+src.slice(b)}
function removeFunction(src,signature){const [a,b]=functionRange(src,signature);return src.slice(0,a)+src.slice(b)}

const animDefNeedle='function playerAnimDef(name){';
if((html.split(animDefNeedle).length-1)!==1)throw new Error('Unified 3D build: playerAnimDef definition not unique');
const gameplayTiming=`const PLAYER_ANIM_TIMING={
  default:{idle:{frames:6,fps:6},run:{frames:8,fps:10},attack:{frames:7,fps:14}},
  gnome:{idle:{frames:4,fps:5},run:{frames:4,fps:9},attack:{frames:4,fps:11}},
  archer:{idle:{frames:4,fps:5},run:{frames:4,fps:10},attack:{frames:4,fps:12}},
  assassin:{idle:{frames:4,fps:4},run:{frames:4,fps:10},attack:{frames:4,fps:12}},
  tank:{idle:{frames:4,fps:4},run:{frames:4,fps:9},attack:{frames:4,fps:10}},
  barbarian:{idle:{frames:4,fps:4},run:{frames:4,fps:10},attack:{frames:4,fps:11}},
  priest:{idle:{frames:4,fps:4},run:{frames:4,fps:9},attack:{frames:4,fps:10}},
  mage:{idle:{frames:4,fps:4},run:{frames:4,fps:9},attack:{frames:4,fps:10}},
  paladin:{idle:{frames:4,fps:4},run:{frames:4,fps:9},attack:{frames:4,fps:10}}
};
function playerClassKey(){
  const raw=(P&&(P.classKey||P.cls||P.className||(P._saved&&P._saved.cls)))||'';
  const text=String(raw||'').trim(),lower=text.toLowerCase();
  let k='';
  try{if(typeof classKeyFromName==='function')k=String(classKeyFromName(text)||'').toLowerCase()}catch(_){}
  if(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(k))return k;
  if(lower==='tank'||lower.includes('страж'))return'tank';
  if(lower==='barbarian'||lower.includes('бер')||lower.includes('barb'))return'barbarian';
  if(lower==='paladin'||lower.includes('пал'))return'paladin';
  if(lower==='gnome'||lower.includes('гном')||lower.includes('cannon'))return'gnome';
  if(lower==='archer'||lower.includes('луч'))return'archer';
  if(lower==='mage'||lower.includes('маг'))return'mage';
  if(lower==='assassin'||lower.includes('асс'))return'assassin';
  if(lower==='priest'||lower.includes('жр'))return'priest';
  return'';
}
function playerIsClass(key){return playerClassKey()===key}
function playerAnimTiming(name){
  const k=playerClassKey();
  const set=PLAYER_ANIM_TIMING[k]||PLAYER_ANIM_TIMING.default;
  return set[name]||set.idle;
}
`;
html=html.replace(animDefNeedle,gameplayTiming+animDefNeedle);
const timingReplacements=[
  ["P.animFrame=P.animFrame%Math.max(1,playerAnimDef('run').frames);","P.animFrame=P.animFrame%Math.max(1,playerAnimTiming('run').frames);"],
  ["const a=playerAnimDef('attack');","const a=playerAnimTiming('attack');"],
  ["const a = playerAnimDef(nextAnim);","const a = playerAnimTiming(nextAnim);"]
];
for(const [from,to] of timingReplacements){
  const n=html.split(from).length-1;
  if(n!==1)throw new Error('Unified 3D build: expected one gameplay animation timing target, found '+n+' for '+from);
  html=html.replace(from,to);
}
if(!html.includes('const PLAYER_ANIM_TIMING={'))throw new Error('Unified 3D build: gameplay animation timing table missing');
if(!html.includes("playerAnimTiming('attack')"))throw new Error('Unified 3D build: attack state still depends on sprite animation definition');

const gameplayClassReplacements=[
  [`if(playerUsesGnomeSprites()){
      try{gnomeFireCannonball()}catch(_){PLAYER_CANNONBALLS.length=0}
    }else if(playerUsesArcherSprites()){
      try{archerFireArrow()}catch(_){PLAYER_ARROWS.length=0}
    }else{
      melee();
    }`,
   "if(playerIsClass('gnome')){ try{gnomeFireCannonball()}catch(_){PLAYER_CANNONBALLS.length=0} }else if(playerIsClass('archer')){ try{archerFireArrow()}catch(_){PLAYER_ARROWS.length=0} }else{ melee(); }"],
  ["if(movingNow && P.attackMode!=='melee' && !playerUsesArcherSprites() && !playerUsesPriestSprites() && !playerUsesMageSprites()){",
   "if(movingNow && P.attackMode!=='melee' && !playerIsClass('archer') && !playerIsClass('priest') && !playerIsClass('mage')){"],
  ["if(P.attacking&&movingForAnim&&P.attackMode!=='melee'&&!playerUsesArcherSprites()&&!playerUsesPriestSprites()&&!playerUsesMageSprites()){",
   "if(P.attacking&&movingForAnim&&P.attackMode!=='melee'&&!playerIsClass('archer')&&!playerIsClass('priest')&&!playerIsClass('mage')){" ]
];
for(const [from,to] of gameplayClassReplacements){
  const n=html.split(from).length-1;
  if(n!==1)throw new Error('Unified 3D build: expected one gameplay class predicate target, found '+n+' for '+from);
  html=html.replace(from,to);
}
for(const [from] of gameplayClassReplacements){if(html.includes(from))throw new Error('Unified 3D build: sprite-named gameplay predicate survived')}

html=removeFunction(html,'function playerAnimDef(name){');

const local3DFunction=`function drawPlayer(){
  /* PPA_PLAYER3D_LOCAL_ONLY_20261002 */
  const primary3DClass=playerClassKey();
  window.__PPA3D_LOCAL_CLASS=primary3DClass;
  if(!primary3DClass)return;
  const __ppa3DLocal={classKey:primary3DClass,worldX:Number(P.x),worldY:Number(P.y),scene:P.scene};
  window.__PPA3D_LOCAL_PENDING=__ppa3DLocal;
  try{if(window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.local==='function')window.PPA_PLAYER3D.local(__ppa3DLocal)}catch(_){}
}`;
html=replaceFunction(html,'function drawPlayer(){',local3DFunction);

if(html.includes('playerAnimDef('))throw new Error('Unified 3D build: legacy playerAnimDef reference survived final local-render removal');
const [drawA,drawB]=functionRange(html,'function drawPlayer(){');
const drawBody=html.slice(drawA,drawB);
for(const forbidden of ['playerUses','drawImage','visualBody','phoneCharacter','ANIM[P.anim]','cx.ellipse','PT.push']){
  if(drawBody.includes(forbidden))throw new Error('Unified 3D build: legacy local render token survived drawPlayer replacement: '+forbidden);
}
if(!drawBody.includes('PPA_PLAYER3D_LOCAL_ONLY_20261002'))throw new Error('Unified 3D build: canonical local 3D drawPlayer missing');

// Player3D owns the local nickname/clan/HP projection from the 3D rig. Remove
// the old Canvas HUD call and its sprite-size/topY helpers entirely.
const nickNeedle='try{drawPlayerNickname()}catch(_){}';
if((html.split(nickNeedle).length-1)!==1)throw new Error('Unified 3D build: local nickname draw call not unique');
html=html.replace(nickNeedle,'/* PPA_PLAYER3D_HUD_OWNS_LOCAL_LABELS_20261002 */');
for(const sig of [
  'function ppaPlayerNickname(){',
  'function ppaPlayerVisualTopScreenY(){',
  'function ppaPlayerClanName(){',
  'function drawPlayerNickname(){'
])html=removeFunction(html,sig);

// These helpers existed only for local sprite selection/direction. Gameplay was
// already moved to playerClassKey/playerIsClass, and stress bots use their own
// v174AiDirIndex/v174AiSpriteCfg path, so remove the dead local sprite layer.
for(const sig of [
  'function playerUsesGnomeSprites(){',
  'function playerUsesArcherSprites(){',
  'function playerUsesAssassinSprites(){',
  'function playerUsesTankSprites(){',
  'function playerUsesBerserkerSprites(){',
  'function playerUsesPriestSprites(){',
  'function playerUsesMageSprites(){',
  'function playerUsesPaladinSprites(){',
  'function playerUsesEightDirSprites(){',
  'function playerDir8(){',
  'function dir8Canonical(dx,dy){'
])html=removeFunction(html,sig);

for(const dead of [
  'playerUsesGnomeSprites','playerUsesArcherSprites','playerUsesAssassinSprites','playerUsesTankSprites',
  'playerUsesBerserkerSprites','playerUsesPriestSprites','playerUsesMageSprites','playerUsesPaladinSprites',
  'playerUsesEightDirSprites','playerDir8','dir8Canonical','ppaPlayerNickname','ppaPlayerVisualTopScreenY',
  'ppaPlayerClanName','drawPlayerNickname'
]){
  if(html.includes(dead))throw new Error('Unified 3D build: dead local sprite/HUD symbol survived: '+dead);
}
if(!html.includes('PPA_PLAYER3D_HUD_OWNS_LOCAL_LABELS_20261002'))throw new Error('Unified 3D build: Player3D HUD ownership marker missing');
if(!html.includes('function v174AiSpriteCfg(e){'))throw new Error('Unified 3D build: stress-bot sprite route was damaged');
if(!html.includes('GNOME_ANIM[a]')||!html.includes('PALADIN_ANIM[a]'))throw new Error('Unified 3D build: stress-bot class atlas route was damaged');

html=html.replace(/\n?<script src="\/game\/player-3d-runtime\.js\?v=[^"]+"><\/script>\n?/g,'\n');
html=html.replace(/\n?<script src="\/game\/remote-player-3d-runtime\.js\?v=[^"]+"><\/script>\n?/g,'\n');
const tag='\n<script src="/game/player-3d-unified-runtime.js?v=20261002u4"></script>\n';
if(!html.includes('player-3d-unified-runtime.js?v=20261002u4')){if(!html.includes('</body>'))throw new Error('Unified 3D build: </body> missing');html=html.replace('</body>',tag+'</body>')}
html=html.replace(/remote-player-3d-dispatch\.js\?v=[^"']+/g,'remote-player-3d-dispatch.js?v=20261002u5');
if(!html.includes('window.__PPA3D_LOCAL_PENDING=__ppa3DLocal'))throw new Error('Unified 3D build: local registration missing');
if(!html.includes('worldX:Number(P.x),worldY:Number(P.y)'))throw new Error('Unified 3D build: local world-space anchor missing');
if(!html.includes('player-3d-unified-runtime.js?v=20261002u4'))throw new Error('Unified 3D build: runtime tag missing');
fs.writeFileSync(htmlPath,html,'utf8');
console.log('Unified Player3D V4: local/remote real players are 3D-only · legacy local sprite renderer/HUD/direction helpers removed · stress bot sprites isolated');