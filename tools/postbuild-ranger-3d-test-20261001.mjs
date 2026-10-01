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

let html=fs.readFileSync(htmlPath,'utf8');
const marker='ranger-3d-test.js?v=20261001f';
if(!html.includes(marker)){
  const tag='\n<script src="/game/ranger-3d-test.js?v=20261001f"></script>\n';
  if(!html.includes('</body>'))throw new Error('Ranger 3D: </body> not found');
  html=html.replace('</body>',tag+'</body>');
  fs.writeFileSync(htmlPath,html,'utf8');
}

console.log('Ranger 3D V6 PRIMARY: -12% scale · no legacy/new shadows · 3D name above head · local archer sprite render disabled');
