import fs from 'node:fs';
const p='gateway/player-3d-unified-runtime.js';
let s=fs.readFileSync(p,'utf8');
function once(a,b,label){const n=s.split(a).length-1;if(n!==1)throw new Error(`${label}: expected 1 anchor, got ${n}`);s=s.replace(a,b)}
once(
"      if(now<e.movingUntil&&e.hasMotionYaw)return e.lastMotionYaw;\n      let f=Number(P&&P.face),dir=4;",
"      // Idle owns the last real movement yaw. Legacy P.face is only a startup/attack fallback.\n      if(e.hasMotionYaw&&!attack)return e.lastMotionYaw;\n      let f=Number(P&&P.face),dir=4;",
'local idle yaw'
);
once(
"    if(now<e.movingUntil&&e.hasMotionYaw)return e.lastMotionYaw;\n    const f=Number(r.face);let dir=2;",
"    // Preserve the last real movement yaw while idle; attack still follows network face.\n    const remoteAttack=String(r.anim||'').toLowerCase()==='attack';\n    if(e.hasMotionYaw&&!remoteAttack)return e.lastMotionYaw;\n    const f=Number(r.face);let dir=2;",
'remote idle yaw'
);
fs.writeFileSync(p,s);
console.log('Player3D idle yaw patch applied');
