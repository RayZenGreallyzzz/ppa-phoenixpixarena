import fs from 'node:fs';

const html=fs.readFileSync('public/index.html','utf8');
const runtime=fs.readFileSync('public/game/player-3d-unified-runtime.js','utf8');
const remote=fs.readFileSync('public/game/remote-player-3d-dispatch.js','utf8');

function count(text,needle){return text.split(needle).length-1}
function contexts(text,needle,radius=1400,limit=12){
  const out=[];let p=0;
  while((p=text.indexOf(needle,p))!==-1&&out.length<limit){
    out.push(text.slice(Math.max(0,p-radius),Math.min(text.length,p+needle.length+radius)).replace(/\s+/g,' '));
    p+=Math.max(1,needle.length);
  }
  return out;
}

console.log('drawPlayer definition count:',count(html,'function drawPlayer(){'));
console.log('drawPlayer call count:',count(html,'drawPlayer();'));
for(const c of contexts(html,'drawPlayer();',1800,10))console.log('DRAWPLAYER_CALL_CTX:',c);
console.log('ppaOnlineDrawRemote occurrences:',count(html,'ppaOnlineDrawRemote'));
for(const c of contexts(html,'ppaOnlineDrawRemote',1300,10))console.log('REMOTE_DRAW_CTX:',c);

if(count(html,'function drawPlayer(){')!==1)throw new Error('Stage 3 audit: drawPlayer definition not unique');
if(count(html,'drawPlayer();')<1)throw new Error('Stage 3 audit: drawPlayer is never called');
if(!html.includes('PPA_PLAYER3D_LOCAL_ONLY_20261002'))throw new Error('Stage 3 audit: canonical local Player3D draw missing');
if(!html.includes('worldX:Number(P.x),worldY:Number(P.y)'))throw new Error('Stage 3 audit: local canonical world anchor missing');
if(!remote.includes('worldX:Number(r.x),worldY:Number(r.y)'))throw new Error('Stage 3 audit: remote canonical world anchor missing');
if(/\bP\.scene\s*===|\bP\.scene\s*!==/.test(runtime))throw new Error('Stage 3 audit: Player3D runtime contains scene-specific gate');
if(/\bP\.scene\s*===|\bP\.scene\s*!==/.test(remote))throw new Error('Stage 3 audit: remote Player3D dispatch contains scene-specific gate');
if(!runtime.includes("if(!e||e.cls!==cls){"))throw new Error('Stage 3 audit: class-change instance replacement missing');
if(!runtime.includes("const ttl=e.kind==='local'?500:1800;"))throw new Error('Stage 3 audit: expected local/remote liveness handling missing');
if(!runtime.includes('const mapped=worldToGround(e.anchor.worldX,e.anchor.worldY,view);'))throw new Error('Stage 3 audit: common world projection missing');

const models=['Tank_Mobile_Shield_Hammer_Final.glb','Berserker_Final.glb','Paladin_Final.glb','Dwarf.glb','Ranger_Mobile_Bow_Z90.glb','Mage_Final.glb','Assassin.glb','Priest_Final_GitHub.glb'];
for(const f of models){
  const p='public/game/'+f;
  if(!fs.existsSync(p))throw new Error('Stage 3 audit: class model missing: '+p);
  console.log('MODEL OK:',f,fs.statSync(p).size);
}

for(const p of ['public/game/dungeon-mob-events.js','public/game/dungeon60-dragon.js','public/game/boss-drop-boost.js','public/game/clan-boss-loot.js']){
  if(!fs.existsSync(p))throw new Error('Stage 3 audit: protected mob/boss runtime missing: '+p);
}

for(const scene of ['safe','dungeon','pvp1','fartzone'])console.log(`SCENE_TOKEN ${scene}:`,count(html,scene));
console.log('STAGE_3_PLAYER3D_SCENE_AUDIT_OK');
