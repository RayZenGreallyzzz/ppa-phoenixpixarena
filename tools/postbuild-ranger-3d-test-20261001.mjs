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

if(!fs.existsSync(htmlPath))throw new Error('Ranger 3D test: public/index.html missing after build');
if(!fs.existsSync(runtimeSrc))throw new Error('Ranger 3D test: runtime source missing');
if(!fs.existsSync(modelSrc))throw new Error('Ranger 3D test: Ranger_Mobile_Bow_Z90.glb missing');
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);
fs.copyFileSync(modelSrc,modelDst);

let html=fs.readFileSync(htmlPath,'utf8');
const marker='ranger-3d-test.js?v=20261001a';
if(!html.includes(marker)){
  const calibration='<style id="ppaRanger3DCalibration">#ppaRanger3DTestLayer{transform:translate(-50%,-42%) scale(.38)!important;transform-origin:50% 50%!important}</style>\n';
  const tag='\n'+calibration+'<script src="/game/ranger-3d-test.js?v=20261001a"></script>\n';
  if(!html.includes('</body>'))throw new Error('Ranger 3D test: </body> not found');
  html=html.replace('</body>',tag+'</body>');
  fs.writeFileSync(htmlPath,html,'utf8');
}

console.log('Ranger 3D test enabled: local archer only · calibrated x0.38 · /game/Ranger_Mobile_Bow_Z90.glb');
