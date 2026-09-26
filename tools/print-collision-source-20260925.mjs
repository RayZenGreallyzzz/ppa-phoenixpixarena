import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

function excerpt(label,pos,pre=1800,post=4200){
  console.log('\n===== '+label+' @ '+pos+' =====');
  console.log(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post)));
}

const terms=[
  'function updateSmartAttackInput','updateSmartAttackInput()',
  'const _moveX','const _moveY',
  'jX','jY','joy','joystick',
  'requestAnimationFrame','performance.now','Date.now()',
  'deltaTime','delta','dt',
  'P.x+=','P.y+=','P.x -=','P.y -=',
  'P.x =','P.y =',
  'speed','moveSpeed','walkSpeed',
  'function hitWall','function collide','function collision','function blocked',
  'function canMove','function movePlayer','function updatePlayer','tryMove',
  'solidAt','isWall','isBlocked','isSolid','collideRect','wallAt',
  'cam.x','cam.y','cameraZoom'
];

for(const term of terms){
  let pos=0,count=0;
  while((pos=src.indexOf(term,pos))>=0&&count<20){
    excerpt(term+' hit '+(++count),pos);
    pos+=Math.max(1,term.length);
  }
}

console.log('\n===== LIKELY MOVEMENT FUNCTIONS =====');
const re=/function\s+([A-Za-z0-9_$]*(?:move|Move|update|Update|loop|Loop|tick|Tick|wall|Wall|solid|Solid|collid|Collid|block|Block|camera|Camera)[A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*\{/g;
let m,n=0;
while((m=re.exec(src))&&n<180){
  const name=m[1];
  if(/move|update|loop|tick|wall|solid|collid|block|camera/i.test(name)){
    console.log(m.index+' '+name+'('+m[2]+')');
    excerpt('FUNC '+name,m.index,1000,2600);
    n++;
  }
}

// movement FPS source audit 20260926
