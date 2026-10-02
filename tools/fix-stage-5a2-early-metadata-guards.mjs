import fs from 'node:fs';
const p='tools/player-source-cleanup-20261002.mjs';
let s=fs.readFileSync(p,'utf8');
const old=`  for(const name of CLASS_ANIMS){if(count(source,name)!==2||!source.slice(source.indexOf(\`const \${name}=\`),source.indexOf('};',source.indexOf(\`const \${name}=\`))+2).includes('img:null'))throw new Error('Stage 5A2 source cleanup: class metadata invalid '+name)}
  for(const name of AI_SIMPLE.slice(0,-2)){if(count(source,name)!==2)throw new Error(\`Stage 5A2 source cleanup: \${name} expected declaration+selector use\`)}
  for(const name of AI_SIMPLE.slice(-2)){if(count(source,name)!==1)throw new Error(\`Stage 5A2 source cleanup: \${name} expected definition-only\`)}
  if(count(source,'v174AiDirIndex')!==2||count(source,'v174AiSpriteCfg')!==2)throw new Error('Stage 5A2 source cleanup: AI selector counts changed');`;
const neu=`  for(const name of CLASS_ANIMS){
    const prefix=\`const \${name}=\`,start=source.indexOf(prefix);
    if(start<0||source.indexOf(prefix,start+prefix.length)>=0)throw new Error('Stage 5A2 source cleanup: class metadata declaration invalid '+name);
    const open=source.indexOf('{',start),close=balancedEnd(source,open),block=source.slice(start,close+1);
    if(!block.includes('img:null'))throw new Error('Stage 5A2 source cleanup: class metadata was not image-neutralized '+name);
  }
  for(const name of AI_SIMPLE){
    const re=new RegExp(\`const\\\\s+\${name}\\\\s*=\\\\s*[^;]+;\`,'g'),hits=source.match(re)||[];
    if(hits.length!==1)throw new Error(\`Stage 5A2 source cleanup: \${name} expected one declaration, got \${hits.length}\`);
  }
  if(count(source,'function v174AiDirIndex(e){')!==1||count(source,'function v174AiSpriteCfg(e){')!==1)throw new Error('Stage 5A2 source cleanup: AI selector definitions changed');`;
if((s.split(old).length-1)!==1)throw new Error('Stage 5A2 guard block target changed');
s=s.replace(old,neu);
const oldDead=`  const dead=['v174AiSpriteCfg','v174AiDirIndex',...CLASS_ANIMS,...AI_SIMPLE];
  for(const name of dead)if(source.includes(name))throw new Error('Stage 5A2 source cleanup: AI sprite metadata survived '+name);`;
const newDead=`  for(const sig of ['function v174AiSpriteCfg(e){','function v174AiDirIndex(e){'])if(source.includes(sig))throw new Error('Stage 5A2 source cleanup: AI sprite selector definition survived '+sig);
  for(const name of CLASS_ANIMS)if(source.includes(\`const \${name}=\`))throw new Error('Stage 5A2 source cleanup: class sprite metadata declaration survived '+name);
  for(const name of AI_SIMPLE){const re=new RegExp(\`const\\\\s+\${name}\\\\s*=\`);if(re.test(source))throw new Error('Stage 5A2 source cleanup: sprite metadata declaration survived '+name);}`;
if((s.split(oldDead).length-1)!==1)throw new Error('Stage 5A2 dead guard target changed');
s=s.replace(oldDead,newDead);
fs.writeFileSync(p,s,'utf8');
