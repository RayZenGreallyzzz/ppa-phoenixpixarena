import fs from 'node:fs';
const p='gateway/ppa-bridge.js';
let s=fs.readFileSync(p,'utf8');

function once(oldText,newText,label){
  const n=s.split(oldText).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 anchor, got ${n}`);
  s=s.replace(oldText,newText);
}

once(
  "  var saveConflict=null;\n  var cloudSaveLoaded=false;",
  "  var saveConflict=null;\n  var saveConflictKey='';\n  var cloudSaveLoaded=false;",
  'state latch'
);

once(
`          saveConflict={
            at:Date.now(),
            expectedVersion:expected,
            currentVersion:Number(err.data&&err.data.currentVersion)||null
          };
          try{
            if(window.PPA_CLOUD){
              window.PPA_CLOUD.saveConflict=saveConflict;
              window.PPA_CLOUD.ready=false;
            }
          }catch(_){}
          try{
            if(typeof showPickup==='function')showPickup('СЕЙВ ЗАЩИЩЁН · старые данные НЕ перезаписали облако','#ffb36b');
          }catch(_){}
`,
`          var conflictCurrent=Number(err.data&&err.data.currentVersion);
          if(!Number.isFinite(conflictCurrent))conflictCurrent=null;
          var conflictKey=String(expected)+'>'+String(conflictCurrent==null?'?':conflictCurrent);
          saveConflict={
            at:Date.now(),
            expectedVersion:expected,
            currentVersion:conflictCurrent
          };
          // Do not advance knownSaveVersion here. The local snapshot that lost the
          // version race is stale and must never be retried against a newer version.
          // Close the save gate until a real /api/save/load re-establishes authority.
          cloudSaveLoaded=false;
          try{
            if(window.PPA_CLOUD){
              window.PPA_CLOUD.saveConflict=saveConflict;
              window.PPA_CLOUD.ready=false;
            }
          }catch(_){}
          if(saveConflictKey!==conflictKey){
            saveConflictKey=conflictKey;
            try{
              if(typeof showPickup==='function')showPickup('СЕЙВ ЗАЩИЩЁН · старые данные НЕ перезаписали облако','#ffb36b');
            }catch(_){}
          }
`,
  'conflict handler'
);

once(
`      noteSaveVersion(r&&r.version!=null?r.version:0);
      cloudSaveLoaded=true;
      return r;`,
`      noteSaveVersion(r&&r.version!=null?r.version:0);
      cloudSaveLoaded=true;
      saveConflict=null;saveConflictKey='';
      try{if(window.PPA_CLOUD)window.PPA_CLOUD.saveConflict=null}catch(_){}
      return r;`,
  'cloud load clears latch'
);

once(
`      noteSaveVersion(loaded&&loaded.version!=null?loaded.version:0);
      cloudSaveLoaded=true;

      // First registration`,
`      noteSaveVersion(loaded&&loaded.version!=null?loaded.version:0);
      cloudSaveLoaded=true;
      saveConflict=null;saveConflictKey='';
      try{if(window.PPA_CLOUD)window.PPA_CLOUD.saveConflict=null}catch(_){}

      // First registration`,
  'registration load clears latch'
);

once(
`    knownSaveVersion=null;
    saveConflict=null;
    cloudSaveLoaded=false;`,
`    knownSaveVersion=null;
    saveConflict=null;saveConflictKey='';
    cloudSaveLoaded=false;`,
  'delete reset latch'
);

fs.writeFileSync(p,s);
console.log('save conflict latch patch applied');
