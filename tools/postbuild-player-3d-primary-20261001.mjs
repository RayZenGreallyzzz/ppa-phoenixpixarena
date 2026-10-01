import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','player-3d-runtime.js');
const runtimeDst=path.join(gameDir,'player-3d-runtime.js');

const MODEL_FILES=[
  'Tank_Mobile_Shield_Hammer_Final.glb',
  'Berserker_Final.glb',
  'Paladin_Final.glb',
  'Dwarf.glb',
  'Ranger_Mobile_Bow_Z90.glb',
  'Mage_Final.glb',
  'Assassin.glb',
  'Priest_Final_GitHub.glb'
];

for(const p of [htmlPath,runtimeSrc,...MODEL_FILES.map(f=>path.join(ROOT,f))]){
  if(!fs.existsSync(p))throw new Error('Primary 3D build: missing '+p);
}
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
for(const file of MODEL_FILES)fs.copyFileSync(path.join(ROOT,file),path.join(gameDir,file));

let html=fs.readFileSync(htmlPath,'utf8');

// Clean cutover for all 8 local classes.
// Gameplay world position / collision / movement / combat remain in the original game.
// drawPlayer publishes only the original feet baseline for the 3D renderer and exits
// before legacy shadow, sprite and fallback body drawing.
const bobNeedle="const bob=P.scene==='fartzone'?0:Math.sin(P.bob)*(isGnome?2.0:3);";
const bobCount=html.split(bobNeedle).length-1;
if(bobCount!==1)throw new Error('Primary 3D build: expected exactly one local player bob anchor, found '+bobCount);
html=html.replace(bobNeedle,bobNeedle+`
  const primary3DClass=playerUsesGnomeSprites()?'gnome'
    :playerUsesArcherSprites()?'archer'
    :playerUsesAssassinSprites()?'assassin'
    :playerUsesTankSprites()?'tank'
    :playerUsesBerserkerSprites()?'barbarian'
    :playerUsesPriestSprites()?'priest'
    :playerUsesMageSprites()?'mage'
    :playerUsesPaladinSprites()?'paladin':'';
  if(primary3DClass){
    window.__PPA3D_LOCAL_ANCHOR={
      classKey:primary3DClass,
      x:sx,
      y:sy+visualBody*0.40,
      visualBody:visualBody,
      zoom:cameraZoom(),
      scene:P.scene,
      worldX:P.x,
      worldY:P.y
    };
    return;
  }`);

// 3D runtime owns local nickname/clan labels for these classes.
const nickNeedle='try{drawPlayerNickname()}catch(_){}';
const nickCount=html.split(nickNeedle).length-1;
if(nickCount!==1)throw new Error('Primary 3D build: expected exactly one local nickname draw, found '+nickCount);
html=html.replace(
  nickNeedle,
  "try{if(!(playerUsesGnomeSprites()||playerUsesArcherSprites()||playerUsesAssassinSprites()||playerUsesTankSprites()||playerUsesBerserkerSprites()||playerUsesPriestSprites()||playerUsesMageSprites()||playerUsesPaladinSprites()))drawPlayerNickname()}catch(_){}"
);

// No per-class postbuild scale multipliers. Runtime normalizes every GLB by body-only
// skinned-mesh bounds; attached weapons never participate in character height.
const scriptTag='\n<script src="/game/player-3d-runtime.js?v=20261001n"></script>\n';
if(!html.includes('player-3d-runtime.js?v=20261001n')){
  if(!html.includes('</body>'))throw new Error('Primary 3D build: </body> missing');
  html=html.replace('</body>',scriptTag+'</body>');
}

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Primary 3D V4: 8 classes · attack-target facing · 128px WebGL overscan · legacy local sprite paint bypassed');