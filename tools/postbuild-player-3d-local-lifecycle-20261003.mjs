import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');
const htmlPath=path.join(ROOT,'public','index.html');
for(const p of [runtimePath,htmlPath])if(!fs.existsSync(p))throw new Error('Player3D local lifecycle: missing '+p);

let src=fs.readFileSync(runtimePath,'utf8');

const registerNeedle=`  function registerLocal(a){
    const cls=normalizeClass(a&&a.classKey)||localClass();
    if(!cls||!a||!Number.isFinite(Number(a.worldX))||!Number.isFinite(Number(a.worldY)))return false;
    return upsert('local','local',cls,null,a);
  }
`;
if((src.split(registerNeedle).length-1)!==1)throw new Error('Player3D local lifecycle: registerLocal target is not unique');

const lifecycle=`${registerNeedle}  // PPA_PLAYER3D_LOCAL_LIFECYCLE_20261003
  // Local Player3D owns its lifecycle directly from canonical game state P.
  // This is scene-independent: city, dungeon, arena and other maps no longer
  // depend on a legacy drawPlayer() call to create or refresh the 3D instance.
  const localLifecycleAnchor={classKey:'',worldX:0,worldY:0,scene:null};
  function syncLocalFromGame(){
    try{
      if(typeof P==='undefined'||!P)return false;
      const cls=localClass(),x=Number(P.x),y=Number(P.y);
      if(!cls||!Number.isFinite(x)||!Number.isFinite(y))return false;
      localLifecycleAnchor.classKey=cls;
      localLifecycleAnchor.worldX=x;
      localLifecycleAnchor.worldY=y;
      localLifecycleAnchor.scene=P.scene;
      return registerLocal(localLifecycleAnchor);
    }catch(_){return false}
  }
`;
src=src.replace(registerNeedle,lifecycle);

const frameNeedle=`  function frame(now){
    requestAnimationFrame(frame);
    if(!THREE||!renderer||!scene||!camera)return;
`;
const frameReplacement=`  function frame(now){
    requestAnimationFrame(frame);
    syncLocalFromGame();
    if(!THREE||!renderer||!scene||!camera)return;
`;
if((src.split(frameNeedle).length-1)!==1)throw new Error('Player3D local lifecycle: frame target is not unique');
src=src.replace(frameNeedle,frameReplacement);

if(!src.includes('PPA_PLAYER3D_LOCAL_LIFECYCLE_20261003'))throw new Error('Player3D local lifecycle: marker missing');
if(!src.includes('syncLocalFromGame();'))throw new Error('Player3D local lifecycle: frame sync missing');
if(!src.includes("return registerLocal(localLifecycleAnchor);"))throw new Error('Player3D local lifecycle: canonical local upsert missing');
fs.writeFileSync(runtimePath,src,'utf8');

let html=fs.readFileSync(htmlPath,'utf8');
const oldTag='player-3d-unified-runtime.js?v=20261002u7';
const newTag='player-3d-unified-runtime.js?v=20261003u8';
if((html.split(oldTag).length-1)!==1)throw new Error('Player3D local lifecycle: expected exactly one old runtime cache tag');
html=html.replace(oldTag,newTag);
if(!html.includes(newTag))throw new Error('Player3D local lifecycle: new runtime cache tag missing');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('Player3D local lifecycle: scene-independent local registration enabled · city startup fixed · cache 20261003u8');
