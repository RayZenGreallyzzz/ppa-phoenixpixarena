import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','remote-player-3d-runtime.js');
const runtimeDst=path.join(gameDir,'remote-player-3d-runtime.js');

for(const p of [htmlPath,runtimeSrc])if(!fs.existsSync(p))throw new Error('Remote 3D build: missing '+p);
fs.mkdirSync(gameDir,{recursive:true});
fs.copyFileSync(runtimeSrc,runtimeDst);

let html=fs.readFileSync(htmlPath,'utf8');
if(!html.includes('/game/player-3d-runtime.js'))throw new Error('Remote 3D build: local primary 3D runtime must be installed first');
if(!html.includes('/game/remote-sprite-renderer.js'))throw new Error('Remote 3D build: legacy remote renderer missing; V1 safety fallback requires it');

const tag='\n<script src="/game/remote-player-3d-runtime.js?v=20261001a"></script>\n';
if(!html.includes('remote-player-3d-runtime.js?v=20261001a')){
  if(!html.includes('</body>'))throw new Error('Remote 3D build: </body> missing');
  html=html.replace('</body>',tag+'</body>');
}

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Remote 3D V1: shared WebGL renderer · approved 8 GLBs · realtime state only · sprite fallback retained for safety');
