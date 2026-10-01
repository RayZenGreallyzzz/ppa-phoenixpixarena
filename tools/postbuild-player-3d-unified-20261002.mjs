import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','player-3d-unified-runtime.js');
const remoteSrc=path.join(ROOT,'gateway','remote-sprite-renderer.js');
const runtimeDst=path.join(gameDir,'player-3d-unified-runtime.js');
const remoteDst=path.join(gameDir,'remote-sprite-renderer.js');
const MODELS=['Tank_Mobile_Shield_Hammer_Final.glb','Berserker_Final.glb','Paladin_Final.glb','Dwarf.glb','Ranger_Mobile_Bow_Z90.glb','Mage_Final.glb','Assassin.glb','Priest_Final_GitHub.glb'];
for(const p of [htmlPath,runtimeSrc,remoteSrc,...MODELS.map(f=>path.join(ROOT,f))])if(!fs.existsSync(p))throw new Error('Unified 3D build: missing '+p);
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.copyFileSync(remoteSrc,remoteDst);
for(const f of MODELS)fs.copyFileSync(path.join(ROOT,f),path.join(gameDir,f));

let html=fs.readFileSync(htmlPath,'utf8');

// Gameplay animation state must not depend on sprite images. Preserve the exact
// legacy frames/fps values, but expose them as pure class timing data. Three.js
// owns visual animation; these values only drive P.anim/P.animFrame state and
// attack completion timing used by existing gameplay/realtime code.
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
  try{return typeof classKeyFromName==='function'?String(classKeyFromName(P.cls)||'').toLowerCase():''}catch(_){return''}
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
if(html.includes("P.animFrame=P.animFrame%Math.max(1,playerAnimDef('run').frames)"))throw new Error('Unified 3D build: run state still depends on sprite animation definition');
if(html.includes("const a=playerAnimDef('attack');"))throw new Error('Unified 3D build: attack state still depends on sprite animation definition');
if(html.includes("const a = playerAnimDef(nextAnim);"))throw new Error('Unified 3D build: idle/run state still depends on sprite animation definition');

// Class gameplay behavior must depend on the semantic class key, never on the
// existence/name of a sprite renderer. Preserve the exact existing actions and
// conditions while replacing only their class predicates.
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
if(!html.includes("if(playerIsClass('gnome')){ try{gnomeFireCannonball()}"))throw new Error('Unified 3D build: gnome gameplay class route missing');
if(!html.includes("else if(playerIsClass('archer')){ try{archerFireArrow()}"))throw new Error('Unified 3D build: archer gameplay class route missing');
for(const [from] of gameplayClassReplacements){if(html.includes(from))throw new Error('Unified 3D build: sprite-named gameplay predicate survived');}

const bobNeedle="const bob=P.scene==='fartzone'?0:Math.sin(P.bob)*(isGnome?2.0:3);";
if((html.split(bobNeedle).length-1)!==1)throw new Error('Unified 3D build: local bob anchor not unique');
const localCutover=`
  const __ppa3DRaw=(P&&(P.classKey||P.cls||P.className||(P._saved&&P._saved.cls)))||'';
  const __ppa3DText=String(__ppa3DRaw||'').trim();
  const __ppa3DLower=__ppa3DText.toLowerCase();
  let primary3DClass='';
  try{if(typeof classKeyFromName==='function')primary3DClass=String(classKeyFromName(__ppa3DText)||'').toLowerCase()}catch(_){}
  if(!['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(primary3DClass)){
    if(__ppa3DLower==='tank'||__ppa3DLower.includes('страж'))primary3DClass='tank';
    else if(__ppa3DLower==='barbarian'||__ppa3DLower.includes('бер')||__ppa3DLower.includes('barb'))primary3DClass='barbarian';
    else if(__ppa3DLower==='paladin'||__ppa3DLower.includes('пал'))primary3DClass='paladin';
    else if(__ppa3DLower==='gnome'||__ppa3DLower.includes('гном')||__ppa3DLower.includes('cannon'))primary3DClass='gnome';
    else if(__ppa3DLower==='archer'||__ppa3DLower.includes('луч'))primary3DClass='archer';
    else if(__ppa3DLower==='mage'||__ppa3DLower.includes('маг'))primary3DClass='mage';
    else if(__ppa3DLower==='assassin'||__ppa3DLower.includes('асс'))primary3DClass='assassin';
    else if(__ppa3DLower==='priest'||__ppa3DLower.includes('жр'))primary3DClass='priest';
  }
  window.__PPA3D_LOCAL_CLASS=primary3DClass;
  if(primary3DClass){
    const __ppa3DLocal={classKey:primary3DClass,worldX:Number(P.x),worldY:Number(P.y),scene:P.scene};
    window.__PPA3D_LOCAL_PENDING=__ppa3DLocal;
    try{if(window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.local==='function')window.PPA_PLAYER3D.local(__ppa3DLocal)}catch(_){}
    return;
  }`;
const oldLocalAnchorSignature='__ppa3DLocal={classKey:primary3DClass,x:sx';
html=html.replace(bobNeedle,bobNeedle+localCutover);
const nickNeedle='try{drawPlayerNickname()}catch(_){}';
if((html.split(nickNeedle).length-1)!==1)throw new Error('Unified 3D build: local nickname draw not unique');
html=html.replace(nickNeedle,"try{if(!window.__PPA3D_LOCAL_CLASS)drawPlayerNickname()}catch(_){}");
html=html.replace(/\n?<script src="\/game\/player-3d-runtime\.js\?v=[^"]+"><\/script>\n?/g,'\n');
html=html.replace(/\n?<script src="\/game\/remote-player-3d-runtime\.js\?v=[^"]+"><\/script>\n?/g,'\n');
const tag='\n<script src="/game/player-3d-unified-runtime.js?v=20261002u3"></script>\n';
if(!html.includes('player-3d-unified-runtime.js?v=20261002u3')){if(!html.includes('</body>'))throw new Error('Unified 3D build: </body> missing');html=html.replace('</body>',tag+'</body>')}
html=html.replace(/remote-sprite-renderer\.js\?v=[^"']+/g,'remote-sprite-renderer.js?v=20261002u3');
if(!html.includes('window.__PPA3D_LOCAL_PENDING=__ppa3DLocal'))throw new Error('Unified 3D build: local registration missing');
if(!html.includes('worldX:Number(P.x),worldY:Number(P.y)'))throw new Error('Unified 3D build: local world-space anchor missing');
if(html.includes(oldLocalAnchorSignature))throw new Error('Unified 3D build: legacy local 3D anchor survived');
if(!html.includes('player-3d-unified-runtime.js?v=20261002u3'))throw new Error('Unified 3D build: runtime tag missing');
fs.writeFileSync(htmlPath,html,'utf8');
console.log('Unified Player3D: canonical world x/y · one renderer/cache · gameplay timing/class behavior decoupled from sprites · no legacy real-player body rendering');