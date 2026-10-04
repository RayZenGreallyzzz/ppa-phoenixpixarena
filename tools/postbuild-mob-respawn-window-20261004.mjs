import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Mob respawn postbuild: public/index.html missing');

let html=fs.readFileSync(htmlPath,'utf8');
const localRe=/Date\.now\(\)\s*\+\s*MOB_RESPAWN_MS/g;
const localMatches=html.match(localRe)||[];
if(localMatches.length<1){
  console.warn('[PPA BUILD WARN] ordinary mob local respawn target not found; authoritative server remains 16-25s');
}else{
  html=html.replace(localRe,'Date.now()+16000+Math.floor(Math.random()*9001)');
}

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v650-mob-respawn-16-25s-20261004">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Ordinary dungeon mob local fallback respawn: randomized 16-25 seconds; authoritative timing owned by realtime wrapper');
