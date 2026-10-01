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

// Test baseline: normalize every class to the Archer's current visual height.
// Gameplay geometry remains untouched; this changes only the rendered GLB size.
let runtime=fs.readFileSync(runtimeDst,'utf8');
const gnomeSizeNeedle="gnome:{model:'/game/Dwarf.glb?v=20261001i',targetHeight:1.68,visualScale:.88,yawOffset:0}";
const gnomeSizeCount=runtime.split(gnomeSizeNeedle).length-1;
if(gnomeSizeCount!==1)throw new Error('Primary 3D build: expected exactly one gnome size config, found '+gnomeSizeCount);
runtime=runtime.replace(
  gnomeSizeNeedle,
  "gnome:{model:'/game/Dwarf.glb?v=20261001i',targetHeight:2.34,visualScale:.88,yawOffset:0}"
);
fs.writeFileSync(runtimeDst,runtime,'utf8');

let html=fs.readFileSync(htmlPath,'utf8');

// Clean architectural cutover for ALL eight local player classes.
// Keep P.x/P.y, collision, movement, camera, combat, skills and inventory untouched.
// drawPlayer() publishes the original feet baseline, then exits before any old
// shadow/dust/sprite/fallback/melee body paint can execute.
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

// The PRIMARY 3D runtime owns the local player labels for all eight classes.
const nickNeedle='try{drawPlayerNickname()}catch(_){}';
const nickCount=html.split(nickNeedle).length-1;
if(nickCount!==1)throw new Error('Primary 3D build: expected exactly one local nickname draw, found '+nickCount);
html=html.replace(
  nickNeedle,
  "try{if(!(playerUsesGnomeSprites()||playerUsesArcherSprites()||playerUsesAssassinSprites()||playerUsesTankSprites()||playerUsesBerserkerSprites()||playerUsesPriestSprites()||playerUsesMageSprites()||playerUsesPaladinSprites()))drawPlayerNickname()}catch(_){}"
);

// Runtime is independent of the legacy sprite system: no playerAnimDef wrappers,
// no CanvasRenderingContext monkey patches and no transparent replacement atlases.
const scriptTag='\n<script src="/game/player-3d-runtime.js?v=20261001j"></script>\n';
if(!html.includes('player-3d-runtime.js?v=20261001j')){
  if(!html.includes('</body>'))throw new Error('Primary 3D build: </body> missing');
  html=html.replace('</body>',scriptTag+'</body>');
}

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Primary 3D V2.1: all 8 classes use Archer baseline size · legacy body render bypassed · gameplay/collision untouched');
