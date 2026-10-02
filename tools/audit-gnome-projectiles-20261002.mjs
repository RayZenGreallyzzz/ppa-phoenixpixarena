import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const raw=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const src=raw.replace(/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]');

const queries=[
  ['PROJECTILE_PUSH', /(?:projectiles?|bullets?|shots?)\s*\.\s*push\s*\(/gi],
  ['PROJECTILE_ASSIGN', /(?:projectiles?|bullets?|shots?)\s*\[[^\]]+\]\s*=/gi],
  ['SPAWN_PROJECTILE_CALL', /(?:spawn|add|create|fire|shoot)[A-Za-z0-9_]*(?:Projectile|Bullet|Shot|Cannon)[A-Za-z0-9_]*\s*\(/gi],
  ['SHOOT_CD', /shootCD/gi],
  ['ATTACK_QUEUED', /attackQueued/gi],
  ['TARGET_ID', /P\.tid/g],
  ['CANNON', /cannon/gi],
  ['GNOME', /gnome/gi],
  ['PVP', /(?:pvp|pk|playerTarget|targetPlayer|attackPlayer)/gi],
];

function oneLine(s){return s.replace(/\s+/g,' ').trim()}
function snippet(i,len=0,radius=900){
  const a=Math.max(0,i-radius), b=Math.min(src.length,i+len+radius);
  return oneLine(src.slice(a,b));
}

const out=[];
for(const [name,re] of queries){
  const hits=[];
  let m;
  while((m=re.exec(src))){hits.push({i:m.index,match:m[0],text:snippet(m.index,m[0].length)});if(hits.length>=40)break;if(m[0].length===0)re.lastIndex++}
  out.push(`\n## ${name} (${hits.length}${hits.length===40?'+':''})`);
  hits.forEach((h,n)=>out.push(`\n### ${name} #${n+1} @${h.i} :: ${h.match}\n${h.text}`));
}

// Also report compact co-occurrence zones: these are far more useful than raw keyword dumps.
const anchors=[];
for(const term of ['shootCD','attackQueued','P.tid','projectile','cannon','gnome']){
  let p=0;
  while((p=src.indexOf(term,p))>=0){anchors.push({p,term});p+=term.length}
}
anchors.sort((a,b)=>a.p-b.p);
const clusters=[];
for(const a of anchors){
  const nearby=anchors.filter(b=>Math.abs(b.p-a.p)<=1800);
  const terms=new Set(nearby.map(x=>x.term));
  if(terms.size>=3){
    const start=Math.max(0,Math.min(...nearby.map(x=>x.p))-500);
    const end=Math.min(src.length,Math.max(...nearby.map(x=>x.p))+1300);
    if(!clusters.some(c=>Math.abs(c.start-start)<1000)) clusters.push({start,end,terms:[...terms]});
  }
}
out.push(`\n## HIGH_SIGNAL_CLUSTERS (${clusters.length})`);
clusters.slice(0,20).forEach((c,n)=>out.push(`\n### CLUSTER #${n+1} @${c.start}-${c.end} [${c.terms.join(', ')}]\n${oneLine(src.slice(c.start,c.end))}`));

const text=out.join('\n')+'\n';
fs.writeFileSync('gnome-projectile-audit.txt',text);
console.log(`Wrote gnome-projectile-audit.txt (${text.length} chars)`);
console.log(`High-signal clusters: ${clusters.length}`);
