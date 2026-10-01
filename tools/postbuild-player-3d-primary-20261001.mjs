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

// Primary 3D renders in screen space, not inside the location canvas bounds.
// The game camera remains authoritative for world -> canvas coordinates; the
// transparent WebGL layer only converts the published feet point to viewport
// pixels. This prevents characters from being clipped when the map camera is
// clamped at arena/dungeon/town edges.
let runtime=fs.readFileSync(runtimeDst,'utf8');
const oldViewport=`  function resizeToGameCanvas(){
    if(!renderer||!camera||typeof cv==='undefined'||!cv)return null;
    const r=cv.getBoundingClientRect();if(!(r.width>2&&r.height>2))return null;
    host.style.left=r.left+'px';host.style.top=r.top+'px';host.style.width=r.width+'px';host.style.height=r.height+'px';
    const renderW=r.width+OVERSCAN_PX*2,renderH=r.height+OVERSCAN_PX*2;
    if(Math.abs(lastRectW-r.width)>.5||Math.abs(lastRectH-r.height)>.5){
      lastRectW=r.width;lastRectH=r.height;
      renderer.setSize(Math.max(2,Math.round(renderW)),Math.max(2,Math.round(renderH)),false);
      renderer.domElement.style.left=(-OVERSCAN_PX)+'px';renderer.domElement.style.top=(-OVERSCAN_PX)+'px';
      renderer.domElement.style.width=renderW+'px';renderer.domElement.style.height=renderH+'px';
      const frustumH=renderH/PX_PER_UNIT,aspect=renderW/renderH;camera.left=-frustumH*aspect/2;camera.right=frustumH*aspect/2;camera.top=frustumH/2;camera.bottom=-frustumH/2;camera.updateProjectionMatrix();
    }
    return {rect:r,renderW,renderH,offset:OVERSCAN_PX};
  }`;
const newViewport=`  function resizeToScreen(){
    if(!renderer||!camera||typeof cv==='undefined'||!cv)return null;
    const r=cv.getBoundingClientRect();if(!(r.width>2&&r.height>2))return null;
    const renderW=Math.max(2,Math.round(window.innerWidth||document.documentElement.clientWidth||r.width));
    const renderH=Math.max(2,Math.round(window.innerHeight||document.documentElement.clientHeight||r.height));
    host.style.left='0px';host.style.top='0px';host.style.width=renderW+'px';host.style.height=renderH+'px';
    if(Math.abs(lastRectW-renderW)>.5||Math.abs(lastRectH-renderH)>.5){
      lastRectW=renderW;lastRectH=renderH;
      renderer.setSize(renderW,renderH,false);
      renderer.domElement.style.left='0px';renderer.domElement.style.top='0px';
      renderer.domElement.style.width=renderW+'px';renderer.domElement.style.height=renderH+'px';
      const frustumH=renderH/PX_PER_UNIT,aspect=renderW/renderH;camera.left=-frustumH*aspect/2;camera.right=frustumH*aspect/2;camera.top=frustumH/2;camera.bottom=-frustumH/2;camera.updateProjectionMatrix();
    }
    return {rect:r,renderW,renderH};
  }`;
if(!runtime.includes(oldViewport))throw new Error('Primary 3D build: old canvas viewport block not found');
runtime=runtime.replace(oldViewport,newViewport);

const oldAnchor=`  function anchorToGround(anchor,view){
    if(!THREE||!camera||!modelRoot||!anchor||!view)return false;
    const rect=view.rect,z=Math.max(.1,Number(anchor.zoom)||1),kx=rect.width/Math.max(1,Number(cv.width)||rect.width),ky=rect.height/Math.max(1,Number(cv.height)||rect.height);
    const px=view.offset+Number(anchor.x)*z*kx,py=view.offset+Number(anchor.y)*z*ky;if(!Number.isFinite(px)||!Number.isFinite(py))return false;
    const ndc=new THREE.Vector2(px/view.renderW*2-1,1-py/view.renderH*2),ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
    const hit=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit))return false;
    modelRoot.position.copy(hit);const cfg=configFor(loadedClass||'archer');modelRoot.scale.setScalar((Number(cfg.visualScale)||1)*z);return true;
  }`;
const newAnchor=`  function anchorToGround(anchor,view){
    if(!THREE||!camera||!modelRoot||!anchor||!view)return false;
    const rect=view.rect,z=Math.max(.1,Number(anchor.zoom)||1);
    const kx=rect.width/Math.max(1,Number(cv.width)||rect.width),ky=rect.height/Math.max(1,Number(cv.height)||rect.height);
    const px=rect.left+Number(anchor.x)*z*kx,py=rect.top+Number(anchor.y)*z*ky;
    if(!Number.isFinite(px)||!Number.isFinite(py))return false;
    const ndc=new THREE.Vector2(px/view.renderW*2-1,1-py/view.renderH*2),ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
    const hit=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit))return false;
    modelRoot.position.copy(hit);const cfg=configFor(loadedClass||'archer');modelRoot.scale.setScalar((Number(cfg.visualScale)||1)*z);return true;
  }`;
if(!runtime.includes(oldAnchor))throw new Error('Primary 3D build: old ground anchor block not found');
runtime=runtime.replace(oldAnchor,newAnchor);

const oldLabels=`      const x=(p.x*.5+.5)*view.renderW-view.offset,y=(-p.y*.5+.5)*view.renderH-view.offset;`;
const newLabels=`      const x=(p.x*.5+.5)*view.renderW,y=(-p.y*.5+.5)*view.renderH;`;
if(!runtime.includes(oldLabels))throw new Error('Primary 3D build: old label projection not found');
runtime=runtime.replace(oldLabels,newLabels);

const oldFrame=`    const view=resizeToGameCanvas();if(!view||!anchorToGround(anchor,view)){if(host)host.style.display='none';return}host.style.display='block';`;
const newFrame=`    const view=resizeToScreen();if(!view||!anchorToGround(anchor,view)){if(host)host.style.display='none';return}host.style.display='block';`;
if(!runtime.includes(oldFrame))throw new Error('Primary 3D build: old frame viewport call not found');
runtime=runtime.replace(oldFrame,newFrame);
fs.writeFileSync(runtimeDst,runtime,'utf8');

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
const scriptTag='\n<script src="/game/player-3d-runtime.js?v=20261001o"></script>\n';
if(!html.includes('player-3d-runtime.js?v=20261001o')){
  if(!html.includes('</body>'))throw new Error('Primary 3D build: </body> missing');
  html=html.replace('</body>',scriptTag+'</body>');
}

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Primary 3D V5: 8 classes · full-screen WebGL projection · no map-edge clipping · legacy local sprite paint bypassed');