import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const publicDir=path.join(ROOT,'public');
const gameDir=path.join(publicDir,'game');
const htmlPath=path.join(publicDir,'index.html');
const runtimeSrc=path.join(ROOT,'gateway','remote-player-3d-runtime-v2.js');
const runtimeDst=path.join(gameDir,'remote-player-3d-runtime.js');
const bridgeSrc=path.join(ROOT,'gateway','remote-sprite-renderer-3d-bridge.js');
const bridgeDst=path.join(gameDir,'remote-sprite-renderer.js');

for(const p of [htmlPath,runtimeSrc,bridgeSrc,bridgeDst])if(!fs.existsSync(p))throw new Error('Remote 3D V2 build: missing '+p);
fs.mkdirSync(gameDir,{recursive:true});

// Keep the existing script URL/order used by the game, but replace only the
// renderer implementation in the built output. Realtime state, combat and
// networking stay untouched.
fs.copyFileSync(bridgeSrc,bridgeDst);
fs.copyFileSync(runtimeSrc,runtimeDst);

let html=fs.readFileSync(htmlPath,'utf8');
if(!html.includes('/game/player-3d-runtime.js'))throw new Error('Remote 3D V2 build: local primary 3D runtime must be installed first');
if(!html.includes('/game/remote-sprite-renderer.js'))throw new Error('Remote 3D V2 build: remote renderer script tag missing');

// Force Telegram/WebView to take the new bridge and runtime instead of a cached V1.
html=html.replace(/\/game\/remote-sprite-renderer\.js(?:\?v=[^"']*)?/g,'/game/remote-sprite-renderer.js?v=20261002b');
html=html.replace(/\n?<script src="\/game\/remote-player-3d-runtime\.js\?v=[^"]+"><\/script>\n?/g,'\n');
const tag='\n<script src="/game/remote-player-3d-runtime.js?v=20261002b"></script>\n';
if(!html.includes('</body>'))throw new Error('Remote 3D V2 build: </body> missing');
html=html.replace('</body>',tag+'</body>');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('Remote 3D V2: real remote players claim approved GLBs explicitly; HUD retained; stress BOT sprites intentionally unchanged');
