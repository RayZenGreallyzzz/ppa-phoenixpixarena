import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','player-3d-runtime.js');
const runtimeDst=path.join(gameDir,'player-3d-runtime.js');
const rangerSrc=path.join(ROOT,'Ranger_Mobile_Bow_Z90.glb');
const rangerDst=path.join(gameDir,'Ranger_Mobile_Bow_Z90.glb');

for(const p of [htmlPath,runtimeSrc,rangerSrc]){
  if(!fs.existsSync(p))throw new Error('Primary 3D build: missing '+p);
}
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.copyFileSync(rangerSrc,rangerDst);

let html=fs.readFileSync(htmlPath,'utf8');

// Clean architectural cutover for the local Archer:
// keep P.x/P.y, collision, movement, camera and combat completely untouched.
// drawPlayer() publishes the ORIGINAL sprite foot baseline, then exits before
// any old shadow/dust/sprite/fallback/melee visual can execute.
const bobNeedle="const bob=P.scene==='fartzone'?0:Math.sin(P.bob)*(isGnome?2.0:3);";
const bobCount=html.split(bobNeedle).length-1;
if(bobCount!==1)throw new Error('Primary 3D build: expected exactly one local player bob anchor, found '+bobCount);
html=html.replace(bobNeedle,bobNeedle+`
  if(isArcher){
    window.__PPA3D_LOCAL_ANCHOR={
      classKey:'archer',
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

// The 3D runtime owns the local Archer name. Do not execute the old canvas
// nickname draw at all for this class.
const nickNeedle='try{drawPlayerNickname()}catch(_){}';
const nickCount=html.split(nickNeedle).length-1;
if(nickCount!==1)throw new Error('Primary 3D build: expected exactly one local nickname draw, found '+nickCount);
html=html.replace(nickNeedle,"try{if(!playerUsesArcherSprites())drawPlayerNickname()}catch(_){}");

// Runtime is independent of the legacy sprite system: no playerAnimDef wrappers,
// no CanvasRenderingContext monkey patches, no transparent replacement atlases.
const scriptTag='\n<script src="/game/player-3d-runtime.js?v=20261001h"></script>\n';
if(!html.includes('player-3d-runtime.js?v=20261001h')){
  if(!html.includes('</body>'))throw new Error('Primary 3D build: </body> missing');
  html=html.replace('</body>',scriptTag+'</body>');
}

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Primary 3D V1: Archer legacy draw bypassed before first 2D paint · exact +visualBody*0.40 foot anchor · old nickname draw bypassed · collision/camera untouched');
