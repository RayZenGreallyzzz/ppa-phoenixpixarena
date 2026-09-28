import fs from 'node:fs';
import zlib from 'node:zlib';
const src=zlib.gunzipSync(Buffer.concat(Array.from({length:12},(_,i)=>fs.readFileSync('PPA'+String(i+1).padStart(2,'0')+'.bin')))).toString('utf8');
let out='';
for(const needle of ['function drawPlayer','drawPlayerNickname','fillText(','strokeText(']){
  let pos=0,c=0;
  while((pos=src.indexOf(needle,pos))>=0&&c<80){
    const ctx=src.slice(Math.max(0,pos-2200),Math.min(src.length,pos+4200));
    if(needle==='function drawPlayer'||needle==='drawPlayerNickname'||/P\.x|P\.y|animFrame|frame|face|shadow/i.test(ctx)){
      out+='\n===== '+needle+' #'+(++c)+' @ '+pos+' =====\n'+ctx;
    }else c++;
    pos+=needle.length;
  }
}
fs.writeFileSync('diag-player-number.txt',out);

const defs=['PALADIN_ANIM','TANK_ANIM','BERSERKER_ANIM','ASSASSIN_ANIM','ARCHER_ANIM','PRIEST_ANIM','MAGE_ANIM','GNOME_ANIM','PALADIN_RUN','PALADIN_IDLE','PALADIN_ATTACK'];
let defsOut='';
for(const n of defs){
  let p=0,c=0;
  while((p=src.indexOf(n,p))>=0&&c<30){
    defsOut+='\n===== DEF '+n+' #'+(++c)+' @ '+p+' =====\n'+src.slice(Math.max(0,p-1800),Math.min(src.length,p+5000));
    p+=n.length;
  }
}
fs.appendFileSync('diag-player-number.txt','\n\n'+defsOut);

// rerun asset extraction

const palNames=['PALADIN_IDLE_SRC','PALADIN_RUN_SRC','PALADIN_ATTACK_SRC'];
let palOut='';
for(const n of palNames){
  const re=new RegExp("const "+n+"='data:image\\/png;base64,([^']+)'");
  const m=src.match(re);
  palOut += '\n###'+n+'###\n'+(m?m[1]:'NOT_FOUND')+'\n';
}
fs.appendFileSync('diag-player-number.txt','\n\n'+palOut);

// trigger paladin alignment audit

const startNeedles=['RayZenGX','С любовью','build256','BUILD256','build 256','Build 256','256'];
let startOut='';
for(const n of startNeedles){
  let p=0,c=0;
  while((p=src.indexOf(n,p))>=0&&c<30){
    startOut+='\n===== START '+n+' #'+(++c)+' @ '+p+' =====\n'+src.slice(Math.max(0,p-2200),Math.min(src.length,p+4200));
    p+=n.length;
  }
}
fs.appendFileSync('diag-player-number.txt','\n\n'+startOut);

// startup label scan trigger
