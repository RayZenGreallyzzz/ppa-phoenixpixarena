import fs from 'node:fs';
import zlib from 'node:zlib';
import {patchGnomeCannonSource} from './source-gnome-cannon-fix-20261002.mjs';

function mustReplace(text,oldText,newText,label){
  const n=text.split(oldText).length-1;
  if(n!==1)throw new Error(label+': expected 1 exact anchor, got '+n);
  return text.replace(oldText,newText);
}
function mustCount(text,needle,n,label){
  const got=text.split(needle).length-1;
  if(got!==n)throw new Error(label+': expected '+n+', got '+got);
}

// 1) Build pipeline: patch canonical game source before externalize/postbuild.
{
  const p='build.mjs';
  let s=fs.readFileSync(p,'utf8');
  s=mustReplace(
    s,
    "import {stripDeadPlayerSpriteAssets} from './tools/player-source-cleanup-20261002.mjs';",
    "import {stripDeadPlayerSpriteAssets} from './tools/player-source-cleanup-20261002.mjs';\nimport {patchGnomeCannonSource} from './tools/source-gnome-cannon-fix-20261002.mjs';",
    'build import'
  );
  const oldPipe="const playerSourceCleanup=stripDeadPlayerSpriteAssets(source);\nconst sourceForBuild=playerSourceCleanup.source;\nconsole.log(`[PPA BUILD] Stage 5A1 pre-externalize player cleanup: ${playerSourceCleanup.stats.classAssetsRemoved} embedded class atlases + ${playerSourceCleanup.stats.preloadsRemoved} preload rows + ${playerSourceCleanup.stats.genericSourcesRemoved} generic sprite sources removed`);";
  const newPipe="const playerSourceCleanup=stripDeadPlayerSpriteAssets(source);\nconst gnomeCannonSource=patchGnomeCannonSource(playerSourceCleanup.source);\nconst sourceForBuild=gnomeCannonSource.source;\nconsole.log(`[PPA BUILD] Stage 5A1 pre-externalize player cleanup: ${playerSourceCleanup.stats.classAssetsRemoved} embedded class atlases + ${playerSourceCleanup.stats.preloadsRemoved} preload rows + ${playerSourceCleanup.stats.genericSourcesRemoved} generic sprite sources removed`);\nconsole.log('[PPA BUILD] Gnome cannon: Player3D muzzle + lethal in-flight reservation enabled');";
  s=mustReplace(s,oldPipe,newPipe,'build source pipeline');
  fs.writeFileSync(p,s);
}

// 2) Unified Player3D: expose actual DwarfCannon endpoint in canonical game coordinates.
{
  const p='gateway/player-3d-unified-runtime.js';
  let s=fs.readFileSync(p,'utf8');
  s=mustReplace(
    s,
    "let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null;",
    "let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null,scratchMuzzleA=null,scratchMuzzleB=null;\n  const muzzleResult={x:0,y:0,node:'DwarfCannon'};",
    'Player3D scratch state'
  );
  s=mustReplace(
    s,
    "scratchProject=new THREE.Vector3();\n    scratchHead=new THREE.Vector3();\n    groundResult.hit=scratchGround;",
    "scratchProject=new THREE.Vector3();\n    scratchHead=new THREE.Vector3();\n    scratchMuzzleA=new THREE.Vector3();\n    scratchMuzzleB=new THREE.Vector3();\n    groundResult.hit=scratchGround;",
    'Player3D scratch init'
  );
  const marker="  async function loadAsset(cls){";
  mustCount(s,marker,1,'Player3D loadAsset marker');
  const helper=[
    "  function localMuzzle(tx,ty){",
    "    try{",
    "      if(!THREE||!camera||!scratchMuzzleA||!scratchMuzzleB)return null;",
    "      const e=instances.get('local');",
    "      if(!e||e.cls!=='gnome'||!e.model)return null;",
    "      const cannon=e.model.getObjectByName('DwarfCannon');",
    "      if(!cannon||!cannon.geometry)return null;",
    "      if(!cannon.geometry.boundingBox)cannon.geometry.computeBoundingBox();",
    "      const b=cannon.geometry.boundingBox;if(!b)return null;",
    "      const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;",
    "      const cx=(b.min.x+b.max.x)*.5,cy=(b.min.y+b.max.y)*.5,cz=(b.min.z+b.max.z)*.5;",
    "      if(sx>=sy&&sx>=sz){scratchMuzzleA.set(b.min.x,cy,cz);scratchMuzzleB.set(b.max.x,cy,cz)}",
    "      else if(sy>=sx&&sy>=sz){scratchMuzzleA.set(cx,b.min.y,cz);scratchMuzzleB.set(cx,b.max.y,cz)}",
    "      else{scratchMuzzleA.set(cx,cy,b.min.z);scratchMuzzleB.set(cx,cy,b.max.z)}",
    "      cannon.updateWorldMatrix(true,false);",
    "      cannon.localToWorld(scratchMuzzleA);cannon.localToWorld(scratchMuzzleB);",
    "      const view=resize();if(!view||!prepareWorldMap()||!mapState.ready)return null;",
    "      scratchProject.copy(scratchMuzzleA).project(camera);",
    "      const apx=(scratchProject.x*.5+.5)*view.w,apy=(-scratchProject.y*.5+.5)*view.h;",
    "      scratchProject.copy(scratchMuzzleB).project(camera);",
    "      const bpx=(scratchProject.x*.5+.5)*view.w,bpy=(-scratchProject.y*.5+.5)*view.h;",
    "      const denX=mapState.z*mapState.kx,denY=mapState.z*mapState.ky;",
    "      if(!Number.isFinite(denX)||!Number.isFinite(denY)||Math.abs(denX)<1e-6||Math.abs(denY)<1e-6)return null;",
    "      const ax=Number(cam.x||0)+(apx-mapState.left)/denX,ay=Number(cam.y||0)+(apy-mapState.top)/denY;",
    "      const bx=Number(cam.x||0)+(bpx-mapState.left)/denX,by=Number(cam.y||0)+(bpy-mapState.top)/denY;",
    "      if(![ax,ay,bx,by].every(Number.isFinite))return null;",
    "      const mx=(ax+bx)*.5,my=(ay+by)*.5,dx=Number(tx)-mx,dy=Number(ty)-my;",
    "      const da=(ax-mx)*dx+(ay-my)*dy,db=(bx-mx)*dx+(by-my)*dy;",
    "      if(db>=da){muzzleResult.x=bx;muzzleResult.y=by}else{muzzleResult.x=ax;muzzleResult.y=ay}",
    "      return muzzleResult;",
    "    }catch(_){return null}",
    "  }",
    "",
  ].join('\n');
  s=s.replace(marker,helper+marker);
  s=mustReplace(
    s,
    "version:'unified-v2-world',\n    local:registerLocal,\n    remote:registerRemote,",
    "version:'unified-v2-world',\n    local:registerLocal,\n    remote:registerRemote,\n    localMuzzle:localMuzzle,",
    'Player3D export'
  );
  mustCount(s,'localMuzzle:localMuzzle',1,'Player3D muzzle export');
  mustCount(s,"getObjectByName('DwarfCannon')",1,'DwarfCannon muzzle source');
  fs.writeFileSync(p,s);
}

// 3) Combat FX renderer: same queue can render a local projectile too.
{
  const p='gateway/remote-combat-fx.js';
  let s=fs.readFileSync(p,'utf8');
  const marker='\n  function drawFx(){';
  mustCount(s,marker,1,'remote combat FX draw marker');
  const helper=[
    '',
    "  window.PPA_LOCAL_COMBAT_FX=function(d){",
    "    try{",
    "      var m=Object.assign({from:'local'},d||{});",
    "      window.PPA_REMOTE_COMBAT_FX_RECEIVE(m);",
    "      return true;",
    "    }catch(_){return false}",
    "  };",
  ].join('\n');
  s=s.replace(marker,helper+marker);
  mustCount(s,'window.PPA_LOCAL_COMBAT_FX=function(d)',1,'local combat FX API');
  fs.writeFileSync(p,s);
}

// 4) Realtime PK/Arena: resolve Player3D muzzle, render locally, then broadcast same origin to peers.
{
  const p='gateway/realtime-client.js';
  let s=fs.readFileSync(p,'utf8');
  const sendAnchor="  function send(o){try{if(RT.ws&&RT.ws.readyState===WebSocket.OPEN){RT.ws.send(JSON.stringify(o));return true}}catch(_){}return false}\n";
  mustCount(s,sendAnchor,1,'realtime send anchor');
  const helper=[
    "  function combatFxOrigin(kind,sx,sy,tx,ty){",
    "    var o={x:Number(sx)||0,y:Number(sy)||0};",
    "    if(kind==='gnome-cannon'){",
    "      try{",
    "        var api=window.PPA_PLAYER3D;",
    "        var m=api&&typeof api.localMuzzle==='function'?api.localMuzzle(tx,ty):null;",
    "        if(m&&Number.isFinite(Number(m.x))&&Number.isFinite(Number(m.y))){o.x=Number(m.x);o.y=Number(m.y)}",
    "      }catch(_){}",
    "    }",
    "    return o;",
    "  }",
    "  function emitCombatFx(kind,sx,sy,tx,ty,animMs){",
    "    var o=combatFxOrigin(kind,sx,sy,tx,ty);",
    "    var dx=(Number(tx)||0)-o.x,dy=(Number(ty)||0)-o.y;",
    "    var d={kind:kind,x:o.x,y:o.y,tx:Number(tx)||0,ty:Number(ty)||0,ang:Math.atan2(dy,dx),animMs:animMs||420};",
    "    try{if(kind==='gnome-cannon'&&window.PPA_LOCAL_COMBAT_FX)window.PPA_LOCAL_COMBAT_FX(d)}catch(_){}",
    "    try{if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX(d)}catch(_){}",
    "  }",
  ].join('\n')+'\n';
  s=s.replace(sendAnchor,sendAnchor+helper);
  const oldFx="if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX({kind:kind,x:sx,y:sy,tx:rp.x,ty:rp.y,ang:Math.atan2(rp.y-sy,rp.x-sx),animMs:420});";
  mustCount(s,oldFx,2,'PK/Arena old FX call sites');
  s=s.split(oldFx).join('emitCombatFx(kind,sx,sy,rp.x,rp.y,420);');
  mustCount(s,'emitCombatFx(kind,sx,sy,rp.x,rp.y,420);',2,'PK/Arena shared FX');
  fs.writeFileSync(p,s);
}

// 5) Validate source transform against canonical packed source before any build.
{
  const parts=Array.from({length:12},(_,i)=>'PPA'+String(i+1).padStart(2,'0')+'.bin');
  const raw=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
  const patched=patchGnomeCannonSource(raw).source;
  mustCount(patched,'function basicAttackDamage(target,critMul)',1,'source basic damage helper');
  mustCount(patched,"typeof api.localMuzzle==='function'",1,'source muzzle bridge');
  mustCount(patched,'pendingMin>=Math.max(1,Number(target.hp)||0)',1,'source lethal reservation');
}

console.log('Gnome cannon runtime refactor applied and canonical source transform verified.');
