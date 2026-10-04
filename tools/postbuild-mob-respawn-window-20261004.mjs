import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
const serverPath=path.join(ROOT,'src','realtime-stable.js');
if(!fs.existsSync(htmlPath))throw new Error('Mob respawn postbuild: public/index.html missing');
if(!fs.existsSync(serverPath))throw new Error('Mob respawn postbuild: src/realtime-stable.js missing');

let html=fs.readFileSync(htmlPath,'utf8');
let server=fs.readFileSync(serverPath,'utf8');

const localRe=/Date\.now\(\)\s*\+\s*MOB_RESPAWN_MS/g;
const localMatches=html.match(localRe)||[];
if(localMatches.length<1){
  console.warn('[PPA BUILD WARN] ordinary mob local respawn target not found; realtime server patch will still apply');
}else{
  html=html.replace(localRe,'Date.now()+20000+Math.floor(Math.random()*5001)');
}

if(!server.includes('PPA_DUNGEON_MOB_RESPAWN_WINDOW_20261004')){
  const oldConst='const DUNGEON_MOB_RESPAWN_MS = 14_000;';
  const oldReturn='return now + DUNGEON_MOB_RESPAWN_MS;';
  if(!server.includes(oldConst))throw new Error('Mob respawn postbuild: realtime respawn constant not found');
  if(!server.includes(oldReturn))throw new Error('Mob respawn postbuild: realtime respawn return not found');
  server=server.replace(oldConst,`// PPA_DUNGEON_MOB_RESPAWN_WINDOW_20261004\nconst DUNGEON_MOB_RESPAWN_MIN_MS = 20_000;\nconst DUNGEON_MOB_RESPAWN_MAX_MS = 25_000;\nfunction dungeonMobRespawnDelay(){\n  return DUNGEON_MOB_RESPAWN_MIN_MS + Math.floor(Math.random()*(DUNGEON_MOB_RESPAWN_MAX_MS-DUNGEON_MOB_RESPAWN_MIN_MS+1));\n}`);
  server=server.replace(oldReturn,'return now + dungeonMobRespawnDelay();');
}

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v649-mob-respawn-20-25s-20261004">');

fs.writeFileSync(htmlPath,html,'utf8');
fs.writeFileSync(serverPath,server,'utf8');
console.log('[PPA BUILD] Ordinary dungeon mob respawn: randomized 20-25 seconds on client fallback and realtime server');
