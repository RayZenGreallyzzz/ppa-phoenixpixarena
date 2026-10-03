import fs from 'node:fs';

function replaceOne(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 target, found ${n}`);
  return src.replace(from,to);
}

// Realtime identity is already in-band in canonical source. Do not rewrite it.
const rt=fs.readFileSync('gateway/realtime-client.js','utf8');
const identity=fs.readFileSync('gateway/realtime-identity-sync.js','utf8');
const server=fs.readFileSync('src/realtime-stable.js','utf8');
if(!rt.includes('PPA_REALTIME_IDENTITY_INBAND_20261003')||!rt.includes("type:'identity-sync'"))throw new Error('canonical in-band realtime identity client missing');
if(identity.includes('PPA_REALTIME_RECONNECT')||!identity.includes('PPA_REALTIME_IDENTITY_INBAND_20261003'))throw new Error('identity watcher can still force reconnect');
if(!server.includes("m.type === 'identity-sync'"))throw new Error('canonical in-band realtime identity server missing');

// Local Player3D must survive transient canonical-state gaps. The old 1500ms
// destroy timer removes the GLB and forces an async clone/reload, which is the
// exact visible disappearance seen during reconnect/hydration churn.
const p3Path='gateway/player-3d-unified-runtime.js';
let p3=fs.readFileSync(p3Path,'utf8');
p3=replaceOne(p3,
  "  let localStateMissingSince=0,localSceneToken=null;",
  "  let localSceneToken=null;",
  'remove local missing-state destroy timer declaration'
);
const oldSync=`  function syncLocalFromGame(now){
    try{
      if(typeof P==='undefined'||!P)throw new Error('local state unavailable');
      const cls=localClass(),x=Number(P.x),y=Number(P.y);
      if(!cls||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('local state incomplete');
      const nextScene=String(P.scene==null?'':P.scene);
      if(localSceneToken!==null&&localSceneToken!==nextScene){
        const current=instances.get('local');
        if(current){
          current.lastWX=null;current.lastWY=null;current.movingUntil=0;
          current.lastMotionYaw=0;current.hasMotionYaw=false;
          if(current.root)current.root.visible=false;
        }
      }
      localSceneToken=nextScene;
      localStateMissingSince=0;
      localAnchor.classKey=cls;
      localAnchor.worldX=x;
      localAnchor.worldY=y;
      localAnchor.scene=nextScene;
      upsert('local','local',cls,null,localAnchor);
      return true;
    }catch(_){
      if(!localStateMissingSince)localStateMissingSince=now;
      if(now-localStateMissingSince>1500){
        const e=instances.get('local');
        if(e)removeEntry('local',e);
        localSceneToken=null;
      }
      return false;
    }
  }
`;
const newSync=`  function syncLocalFromGame(now){
    try{
      if(typeof P==='undefined'||!P)return false;
      const x=Number(P.x),y=Number(P.y);
      if(!Number.isFinite(x)||!Number.isFinite(y))return false;
      const cls=localClass()||normalizeClass(localAnchor.classKey);
      if(!cls)return false;
      const nextScene=String(P.scene==null?'':P.scene);
      if(localSceneToken!==null&&localSceneToken!==nextScene){
        const current=instances.get('local');
        if(current){
          current.lastWX=null;current.lastWY=null;current.movingUntil=0;
          current.lastMotionYaw=0;current.hasMotionYaw=false;
          if(current.root)current.root.visible=false;
        }
      }
      localSceneToken=nextScene;
      localAnchor.classKey=cls;
      localAnchor.worldX=x;
      localAnchor.worldY=y;
      localAnchor.scene=nextScene;
      upsert('local','local',cls,null,localAnchor);
      return true;
    }catch(_){return false}
  }
`;
p3=replaceOne(p3,oldSync,newSync,'persistent local Player3D lifecycle');
if(p3.includes('localStateMissingSince'))throw new Error('local Player3D destroy timer survived');
fs.writeFileSync(p3Path,p3,'utf8');

// Force Telegram/WebView to fetch both the new Player3D runtime and the already
// corrected in-band realtime client instead of reusing v631/u13 cache entries.
const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=fs.readFileSync(postPath,'utf8');
post=post.replaceAll('player-3d-unified-runtime.js?v=20261003u13','player-3d-unified-runtime.js?v=20261003u14');
if(!post.includes('player-3d-unified-runtime.js?v=20261003u14'))throw new Error('Player3D u14 cache bump missing');
fs.writeFileSync(postPath,post,'utf8');

const buildPath='build.mjs';
let build=fs.readFileSync(buildPath,'utf8');
build=replaceOne(build,"const CLIENT_BUILD = 'v631-dwarf-muzzle-axis-20261002';","const CLIENT_BUILD = 'v632-realtime-player3d-stability-20261003';",'client cache key');
fs.writeFileSync(buildPath,build,'utf8');

console.log('Applied persistent local Player3D lifecycle + realtime/Player3D cache bust.');
