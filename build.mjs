import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const EXPECTED_PARTS = 12;
const EXPECTED_SOURCE_SHA256 = 'caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts = Array.from({length:EXPECTED_PARTS},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);

const missing = parts.filter((name)=>!fs.existsSync(path.join(ROOT,name)));
if (missing.length) {
  throw new Error(`PPA source parts incomplete. Missing: ${missing.join(', ')}`);
}

console.log(`PPA build: joining ${parts.length} source parts...`);
const packed = Buffer.concat(parts.map((name) => fs.readFileSync(path.join(ROOT, name))));
const sourceBuffer = zlib.gunzipSync(packed);
const sourceHash = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
if (sourceHash !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`PPA source checksum mismatch: ${sourceHash}`);
}
const source = sourceBuffer.toString('utf8');

const publicDir = path.join(ROOT, 'public');
const assetsDir = path.join(publicDir, 'assets');
const gameDir = path.join(publicDir, 'game');
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(gameDir, { recursive: true });

const extByMime = { png: 'png', webp: 'webp', jpeg: 'jpg' };
const seen = new Map();
const dataUri = /data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/g;
let count = 0;

let output = source.replace(dataUri, (full, mime, b64) => {
  if (seen.has(full)) return seen.get(full);
  const bytes = Buffer.from(b64, 'base64');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const filename = `${hash}.${extByMime[mime]}`;
  fs.writeFileSync(path.join(assetsDir, filename), bytes);
  const url = `./assets/${filename}`;
  seen.set(full, url);
  count++;
  return url;
});

// Keep the Telegram Mini App SDK current so initData is populated reliably.
output = output.replace(
  'https://telegram.org/js/telegram-web-app.js"',
  'https://telegram.org/js/telegram-web-app.js?63"'
);

// An explicitly imported portable save may replace progress, but it must not
// bypass the nickname already bound to this verified Telegram profile.
const migrationNeedle = 'var migrationState=ppaMigrationSaveObject();\n      if(ppaSaveHasCharacterState(migrationState)){';
const migrationPatch = "var migrationState=ppaMigrationSaveObject();\n      if(profileNick&&/^[A-Za-zА-Яа-яЁё0-9_]{3,18}$/u.test(profileNick))migrationState.playerName=profileNick;\n      if(ppaSaveHasCharacterState(migrationState)){";
if (!output.includes(migrationNeedle)) {
  throw new Error('PPA Telegram migration patch target not found');
}
output = output.replace(migrationNeedle, migrationPatch);

// Gateway/cloud problems must never hard-lock a valid local character.
const catchNeedle = "  }catch(err){\n    console.error('PPA Gateway bootstrap:',err);\n    ppaShowGatewayError('Не удалось подтвердить Telegram-сессию. Закройте Mini App и откройте игру снова через бота.');\n    return true;\n  }finally{";
const catchPatch = "  }catch(err){\n    console.error('PPA Gateway bootstrap:',err);\n    var _ppaErrCode=String((err&&err.code)||('HTTP_'+String((err&&err.status)||'ERR')));\n    var _ppaErrMsg=String((err&&err.message)||'Ошибка Gateway');\n    var _ppaLocalClass=(P&&P._saved&&P._saved.cls)?classKeyFromName(P._saved.cls):'';\n    if(_ppaLocalClass&&CLASS_BASE[_ppaLocalClass]){\n      PPA_CLOUD.ready=false;\n      try{showPickup('ОБЛАКО НЕДОСТУПНО · ЛОКАЛЬНЫЙ СЕЙВ','#ffb36b')}catch(_){}\n      applyClass({name:CLASS_BASE[_ppaLocalClass].name});\n      beginGame();\n      return true;\n    }\n    ppaShowGatewayError('Gateway: '+_ppaErrCode+' · '+_ppaErrMsg);\n    return true;\n  }finally{";
if (!output.includes(catchNeedle)) {
  throw new Error('PPA Gateway fallback patch target not found');
}
output = output.replace(catchNeedle, catchPatch);

// Telegram Android WebView may swallow <a download>. Call the parent exporter
// directly from the inventory iframe so transient user activation is preserved
// for the Android Web Share / "Save to files" sheet.
const exportButtonNeedle = "onclick=&quot;parent.postMessage({type:&#x27;exportSave&#x27;},&#x27;*&#x27;)&quot;";
const exportButtonPatch = "onclick=&quot;parent.PPA_EXPORT_SAVE&amp;&amp;parent.PPA_EXPORT_SAVE()&quot;";
if (!output.includes(exportButtonNeedle)) {
  throw new Error('PPA save export button target not found');
}
output = output.replace(exportButtonNeedle, exportButtonPatch);

const exportStart = output.indexOf('function ppaExportSave(){');
const exportEnd = output.indexOf('function ppaImportSaveText(txt){', exportStart);
if (exportStart < 0 || exportEnd < 0) {
  throw new Error('PPA save export function target not found');
}
const exportPatch = `async function ppaExportSave(){
  try{
    var data={format:'PPA_PORTABLE_SAVE_V1',createdAt:new Date().toISOString(),values:{}};
    PPA_SAVE_EXPORT_KEYS.forEach(function(k){
      var v=localStorage.getItem(k);
      if(v!==null)data.values[k]=v;
    });
    var text=JSON.stringify(data,null,2);
    var name='PPA_SAVE_BACKUP_'+new Date().toISOString().slice(0,10)+'.json';

    // Best path for Telegram/Android: native share sheet. It lets the player
    // choose Files/Downloads, Drive, Telegram Saved Messages, etc.
    try{
      if(typeof File==='function'&&navigator&&typeof navigator.share==='function'){
        var file=new File([text],name,{type:'application/json'});
        var can=true;
        try{if(typeof navigator.canShare==='function')can=navigator.canShare({files:[file]})}catch(_){can=true}
        if(can){
          try{
            await navigator.share({files:[file],title:'PPA · резервный сейв'});
            showPickup('СЕЙВ СОХРАНЁН','#7dff9f');
            return true;
          }catch(shareErr){
            if(shareErr&&shareErr.name==='AbortError'){
              showPickup('СОХРАНЕНИЕ ОТМЕНЕНО','#ffcc77');
              return false;
            }
          }
        }
      }
    }catch(_){}

    // Browser/file fallback.
    var blob=new Blob([text],{type:'application/json'});
    var a=document.createElement('a');
    var u=URL.createObjectURL(blob);
    a.href=u;a.download=name;a.style.display='none';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){try{URL.revokeObjectURL(u)}catch(_){}},5000);
    showPickup('СЕЙВ ОТПРАВЛЕН В ЗАГРУЗКИ','#7dff9f');
    return true;
  }catch(e){
    console.warn('PPA save export:',e);
    showPickup('НЕ УДАЛОСЬ СОХРАНИТЬ СЕЙВ','#ff7777');
    return false;
  }
}
`;
output = output.slice(0, exportStart) + exportPatch + output.slice(exportEnd);

// Publish the verified Telegram bridge at the path already referenced by V278.
const bridgeSource = path.join(ROOT, 'gateway', 'ppa-bridge.js');
if (!fs.existsSync(bridgeSource)) {
  throw new Error('Telegram gateway bridge missing: gateway/ppa-bridge.js');
}
fs.copyFileSync(bridgeSource, path.join(gameDir, 'ppa-bridge.js'));

// Publish online clan / auction / wallet hooks and load them after the game code.
const onlineClientSource = path.join(ROOT, 'gateway', 'online-client.js');
if (!fs.existsSync(onlineClientSource)) {
  throw new Error('Online client bridge missing: gateway/online-client.js');
}
fs.copyFileSync(onlineClientSource, path.join(gameDir, 'online-client.js'));
if (!output.includes('</body>')) {
  throw new Error('PPA main </body> not found');
}
output = output.replace('</body>', '<script src="/game/online-client.js"></script>\n</body>');

fs.writeFileSync(path.join(publicDir, 'index.html'), output, 'utf8');
console.log(`PPA build complete: ${count} unique embedded images externalized.`);
console.log('Telegram bridge: /game/ppa-bridge.js');
console.log('Online bridge: /game/online-client.js');
console.log('Telegram migration lockout guard: enabled');
console.log('Android Telegram save export: native share enabled');
console.log(`index.html: ${(Buffer.byteLength(output)/1024/1024).toFixed(2)} MiB`);
