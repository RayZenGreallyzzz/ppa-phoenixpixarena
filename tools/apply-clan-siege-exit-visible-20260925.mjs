import fs from 'node:fs';

const path='build.mjs';
let s=fs.readFileSync(path,'utf8');
const before=s;

function replaceOnce(name, from, to){
  if(typeof from==='string'){
    if(!s.includes(from)) throw new Error(name+' target not found');
    s=s.replace(from,to);
    return;
  }
  if(!from.test(s)) throw new Error(name+' target not found');
  s=s.replace(from,to);
}

replaceOnce(
  'client build id',
  /const CLIENT_BUILD = '[^']+';/,
  "const CLIENT_BUILD = 'v602-clan-siege-exit-visible-20260925';"
);

// Button must be visible during the whole clansiege scene, not only after phase==='won'.
replaceOnce(
  'show exit during clansiege',
  "if(exit)exit.style.display=PPA_SIEGE.phase==='won'?'block':'none';",
  "if(exit)exit.style.display='block';"
);

// Put it clearly below the compact timer panel with a small gap.
replaceOnce(
  'exit top under panel',
  "top:42px;transform:translateX(-50%);z-index:58;display:none;min-width:96px;height:32px;",
  "top:50px;transform:translateX(-50%);z-index:58;display:none;min-width:96px;height:32px;"
);

replaceOnce(
  'audit exit visible placement',
  "   !output.includes(\"PPA_SIEGE.hudLastAt\") ||\n   !output.includes(\"clanSiegeClearCastleObstacles\") ||",
  "   !output.includes(\"PPA_SIEGE.hudLastAt\") ||\n   !output.includes(\"if(exit)exit.style.display='block'\") ||\n   !output.includes(\"top:50px;transform:translateX(-50%)\") ||\n   !output.includes(\"clanSiegeClearCastleObstacles\") ||"
);

if(s===before) throw new Error('No changes applied');
if(!s.includes("v602-clan-siege-exit-visible-20260925")) throw new Error('build id not updated');
if(!s.includes("if(exit)exit.style.display='block'")) throw new Error('exit visibility patch missing');
if(!s.includes("top:50px;transform:translateX(-50%)")) throw new Error('exit placement patch missing');

fs.writeFileSync(path,s,'utf8');
console.log('Applied clan siege exit visibility and spacing fix.');
