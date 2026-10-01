import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','ranger-3d-test.js');
const modelSrc=path.join(ROOT,'Ranger_Mobile_Bow_Z90.glb');
const runtimeDst=path.join(gameDir,'ranger-3d-test.js');
const modelDst=path.join(gameDir,'Ranger_Mobile_Bow_Z90.glb');

if(!fs.existsSync(htmlPath))throw new Error('Ranger 3D: public/index.html missing after build');
if(!fs.existsSync(runtimeSrc))throw new Error('Ranger 3D: runtime source missing');
if(!fs.existsSync(modelSrc))throw new Error('Ranger 3D: Ranger_Mobile_Bow_Z90.glb missing');
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.copyFileSync(modelSrc,modelDst);

// V7 collision-safe render patch. Keep the legacy sprite geometry byte-for-byte
// equivalent from the engine's point of view: only replace its pixels with a
// transparent canvas of the ORIGINAL image dimensions. Dungeon collision/mask
// code must never see different frame/image dimensions or anchors.
let runtime=fs.readFileSync(runtimeDst,'utf8');
runtime=runtime.replace(/__PPA_RANGER_3D_MAIN_V6/g,'__PPA_RANGER_3D_MAIN_V7');
runtime=runtime.replace(/20261001f/g,'20261001g');
runtime=runtime.replace(
  /function transparentAtlas\(a\)\{[\s\S]*?\n  \}\n  function installHide2D/,
`function transparentAtlas(a){
    try{
      var img=a&&a.img;
      var w=Math.max(0,Math.round(Number(img&&(img.naturalWidth||img.width))||0));
      var h=Math.max(0,Math.round(Number(img&&(img.naturalHeight||img.height))||0));
      if(!(w>1&&h>1)){
        var fw=Math.max(1,Math.round(Number(a&&a.fw)||1));
        var fh=Math.max(1,Math.round(Number(a&&a.fh)||1));
        var frames=Math.max(1,Math.min(16,Math.round(Number(a&&a.frames)||1)));
        w=fw*frames;h=fh*8;
      }
      var key=w+'x'+h;
      if(transparentAtlases[key])return transparentAtlases[key];
      var c=document.createElement('canvas');c.width=w;c.height=h;
      try{c.complete=true;c.naturalWidth=w;c.naturalHeight=h}catch(_){}
      transparentAtlases[key]=c;return c;
    }catch(_){return null}
  }
  function installHide2D`
);
// Do not monkey-patch the shared dungeon canvas context. That was only used
// to hide the old shadow/name and can interfere with dungeon drawing state.
runtime=runtime.replace(/installLegacyPaintSuppression\(\);/g,'');
// Raise the new 3D nickname farther above the head.
runtime=runtime.replace('*visualScale-10','*visualScale-30');
runtime=runtime.replace('RANGER 3D MAIN · ON','RANGER 3D COLLISION FIX · ON');
fs.writeFileSync(runtimeDst,runtime,'utf8');

let html=fs.readFileSync(htmlPath,'utf8');
const marker='ranger-3d-test.js?v=20261001g';
if(!html.includes(marker)){
  const tag='\n<script src="/game/ranger-3d-test.js?v=20261001g"></script>\n';
  if(!html.includes('</body>'))throw new Error('Ranger 3D: </body> not found');
  html=html.replace('</body>',tag+'</body>');
  fs.writeFileSync(htmlPath,html,'utf8');
}

console.log('Ranger 3D V7: dungeon collision geometry preserved · shared canvas untouched · nickname raised');
