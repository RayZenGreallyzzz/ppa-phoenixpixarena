import fs from 'node:fs';
const p=process.argv[2]||'gateway/ppa-bridge.js';
const s=fs.readFileSync(p,'utf8');
function must(x,msg){if(!x)throw new Error(msg)}
const a=s.indexOf("if(err&&err.code==='SAVE_VERSION_CONFLICT')");
const b=s.indexOf('throw err;',a);
must(a>=0&&b>a,'save conflict handler missing');
const block=s.slice(a,b);
must(block.includes('cloudSaveLoaded=false;'),'conflict must close save gate');
must(block.includes('saveConflictKey!==conflictKey'),'conflict toast dedupe latch missing');
must(block.includes('window.PPA_CLOUD.ready=false'),'cloud ready flag must drop on conflict');
must(!/noteSaveVersion\s*\(\s*conflictCurrent/.test(block),'conflict must not advance known save version');
const load=s.indexOf('ppaLoadSave:async function()');
must(load>=0,'cloud load entry missing');
const loadBlock=s.slice(load,Math.min(s.length,load+900));
must(loadBlock.includes("saveConflict=null;saveConflictKey='';"),'real cloud load must clear conflict latch');
must(loadBlock.includes('cloudSaveLoaded=true;'),'real cloud load must reopen save gate');
console.log(`save protection invariants OK: ${p}`);
