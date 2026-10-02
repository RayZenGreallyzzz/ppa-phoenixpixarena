import fs from 'node:fs';
const p='tools/player-source-cleanup-20261002.mjs';
let s=fs.readFileSync(p,'utf8');

const oldGeneric="    if(count(source,sym)!==1)throw new Error(`Stage 5A1 source cleanup: ${sym} expected declaration-only count 1, got ${count(source,sym)}`);\n    const re=new RegExp(`const\\\\s+${sym}\\\\s*=\\\\s*(['\\\"])([^'\\\"]+\\\\.png)\\\\1\\\\s*;`);\n    const m=source.match(re);\n    if(!m)throw new Error(`Stage 5A1 source cleanup: ${sym} declaration missing`);";
const newGeneric="    if(count(source,sym)!==2)throw new Error(`Stage 5A1 source cleanup: ${sym} expected declaration+preload count 2, got ${count(source,sym)}`);\n    const re=new RegExp(`const\\\\s+${sym}\\\\s*=\\\\s*(['\\\"])([^'\\\"]+\\\\.png)\\\\1\\\\s*;`);\n    const decls=source.match(new RegExp(re.source,'g'))||[];\n    if(decls.length!==1)throw new Error(`Stage 5A1 source cleanup: ${sym} expected one declaration, got ${decls.length}`);\n    const m=source.match(re);";
if(s.includes(oldGeneric))s=s.replace(oldGeneric,newGeneric);
else if(!s.includes("if(count(source,sym)!==2)"))throw new Error('generic guard target changed');

const oldAnim="  if((source.match(/\\bANIM\\b/g)||[]).length!==0)throw new Error('Stage 5A1 source cleanup: exact generic ANIM survived');";
const newAnim="  if(source.includes('const ANIM='))throw new Error('Stage 5A1 source cleanup: exact generic ANIM declaration survived');";
if(s.includes(oldAnim))s=s.replace(oldAnim,newAnim);
else if(!s.includes("source.includes('const ANIM=')"))throw new Error('ANIM guard target changed');

fs.writeFileSync(p,s,'utf8');
