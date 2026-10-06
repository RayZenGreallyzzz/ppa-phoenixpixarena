import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');
const htmlPath=path.join(ROOT,'public','index.html');
for(const p of [runtimePath,htmlPath])if(!fs.existsSync(p))throw new Error('Player3D distance LOD cache: missing '+p);

const runtime=fs.readFileSync(runtimePath,'utf8');
if(!runtime.includes('PPA_PLAYER3D_DISTANCE_LOD_20261006'))throw new Error('Player3D distance LOD cache: distance LOD marker missing');
if(runtime.includes('PPA_PLAYER3D_LOD_SEAMLESS_SWAP_20261006'))throw new Error('Player3D distance LOD cache: seamless swap must not be active');

let html=fs.readFileSync(htmlPath,'utf8');
const rx=/player-3d-unified-runtime\.js\?v=[^"']+/g;
const matches=html.match(rx)||[];
if(matches.length!==1)throw new Error('Player3D distance LOD cache: runtime script tag count='+matches.length);
html=html.replace(rx,'player-3d-unified-runtime.js?v=20261006dlod4rollback');
const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v669-player3d-distance-lod-rollback-20261006">');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] Player3D distance LOD rollback cache bust active · seamless swap disabled');
