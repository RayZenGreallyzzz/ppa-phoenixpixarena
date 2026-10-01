import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','player-3d-unified-runtime.js');
const adapterSrc=path.join(ROOT,'gateway','remote-player-3d-adapter.js');
const runtimeDst=path.join(gameDir,'player-3d-unified-runtime.js');
const adapterDst=path.join(gameDir,'remote-sprite-renderer.js');
const MODELS=['Tank_Mobile_Shield_Hammer_Final.glb','Berserker_Final.glb','Paladin_Final.glb','Dwarf.glb','Ranger_Mobile_Bow_Z90.glb','Mage_Final.glb','Assassin.glb','Priest_Final_GitHub.glb'];
for(const p of [htmlPath,runtimeSrc,adapterSrc,...MODELS.map(f=>path.join(ROOT,f))])if(!fs.existsSync(p))throw new Error('Unified 3D build: missing '+p);
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.copyFileSync(adapterSrc,adapterDst);
for(const f of MODELS)fs.copyFileSync(path.join(ROOT,f),path.join(gameDir,f));

let html=fs.readFileSync(htmlPath,'utf8');
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
    const __ppa3DLocal={classKey:primary3DClass,x:sx,y:sy+visualBody*0.40,zoom:cameraZoom(),body:visualBody,scene:P.scene,worldX:P.x,worldY:P.y};
    window.__PPA3D_LOCAL_PENDING=__ppa3DLocal;
    try{if(window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.local==='function')window.PPA_PLAYER3D.local(__ppa3DLocal)}catch(_){}
    return;
  }`;
html=html.replace(bobNeedle,bobNeedle+localCutover);
const nickNeedle='try{drawPlayerNickname()}catch(_){}';
if((html.split(nickNeedle).length-1)!==1)throw new Error('Unified 3D build: local nickname draw not unique');
html=html.replace(nickNeedle,"try{if(!window.__PPA3D_LOCAL_CLASS)drawPlayerNickname()}catch(_){}");
html=html.replace(/\n?<script src="\/game\/player-3d-runtime\.js\?v=[^"]+"><\/script>\n?/g,'\n');
html=html.replace(/\n?<script src="\/game\/remote-player-3d-runtime\.js\?v=[^"]+"><\/script>\n?/g,'\n');
const tag='\n<script src="/game/player-3d-unified-runtime.js?v=20261002u1"></script>\n';
if(!html.includes('player-3d-unified-runtime.js?v=20261002u1')){if(!html.includes('</body>'))throw new Error('Unified 3D build: </body> missing');html=html.replace('</body>',tag+'</body>')}
html=html.replace(/remote-sprite-renderer\.js\?v=[^"']+/g,'remote-sprite-renderer.js?v=20261002u1');
if(!html.includes('window.__PPA3D_LOCAL_PENDING=__ppa3DLocal'))throw new Error('Unified 3D build: local registration missing');
if(!html.includes('player-3d-unified-runtime.js?v=20261002u1'))throw new Error('Unified 3D build: runtime tag missing');
fs.writeFileSync(htmlPath,html,'utf8');
console.log('Unified Player3D: one renderer/cache · hips/feet pivot · head HUD anchor · no legacy real-player body rendering');