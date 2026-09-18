import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const EXPECTED_PARTS = 12;
const EXPECTED_SOURCE_SHA256 = 'caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts = Array.from({length:EXPECTED_PARTS},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const CLIENT_BUILD = 'v319-mob-diag-in-main-panel-20260918-1627';

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

output = output.replace(
  'https://telegram.org/js/telegram-web-app.js"',
  'https://telegram.org/js/telegram-web-app.js?63"'
);

if (!output.includes('<head>')) throw new Error('PPA <head> not found');
output = output.replace('<head>', '<head>\n<script>window.PPA_REALTIME_V2_ACTIVE=true;</script>');

const legacyInitNeedle = 'async function PPAOnlineInit(){\n';
if (!output.includes(legacyInitNeedle)) throw new Error('Legacy PPAOnlineInit patch target not found');
output = output.replace(legacyInitNeedle, "async function PPAOnlineInit(){\n  if(window.PPA_REALTIME_V2_ACTIVE)return;\n");

const legacyTickNeedle = 'function PPAOnlineTick(){\n';
if (!output.includes(legacyTickNeedle)) throw new Error('Legacy PPAOnlineTick patch target not found');
output = output.replace(legacyTickNeedle, "function PPAOnlineTick(){\n  if(window.PPA_REALTIME_V2_ACTIVE)return;\n");

const legacyCleanupNeedle = 'function ppaOnlineCleanup(){\n';
if (!output.includes(legacyCleanupNeedle)) throw new Error('Legacy ppaOnlineCleanup patch target not found');
output = output.replace(legacyCleanupNeedle, "function ppaOnlineCleanup(){\n  if(window.PPA_REALTIME_V2_ACTIVE)return;\n");

const migrationNeedle = 'var migrationState=ppaMigrationSaveObject();\n      if(ppaSaveHasCharacterState(migrationState)){';
const migrationPatch = "var migrationState=ppaMigrationSaveObject();\n      if(profileNick&&/^[A-Za-zА-Яа-яЁё0-9_]{3,18}$/u.test(profileNick))migrationState.playerName=profileNick;\n      if(ppaSaveHasCharacterState(migrationState)){";
if (!output.includes(migrationNeedle)) throw new Error('PPA Telegram migration patch target not found');
output = output.replace(migrationNeedle, migrationPatch);

const catchNeedle = "  }catch(err){\n    console.error('PPA Gateway bootstrap:',err);\n    ppaShowGatewayError('Не удалось подтвердить Telegram-сессию. Закройте Mini App и откройте игру снова через бота.');\n    return true;\n  }finally{";
const catchPatch = "  }catch(err){\n    console.error('PPA Gateway bootstrap:',err);\n    var _ppaErrCode=String((err&&err.code)||('HTTP_'+String((err&&err.status)||'ERR')));\n    var _ppaErrMsg=String((err&&err.message)||'Ошибка Gateway');\n    var _ppaLocalClass=(P&&P._saved&&P._saved.cls)?classKeyFromName(P._saved.cls):'';\n    if(_ppaLocalClass&&CLASS_BASE[_ppaLocalClass]){\n      PPA_CLOUD.ready=false;\n      try{showPickup('ОБЛАКО НЕДОСТУПНО · ЛОКАЛЬНЫЙ СЕЙВ','#ffb36b')}catch(_){}\n      applyClass({name:CLASS_BASE[_ppaLocalClass].name});\n      beginGame();\n      return true;\n    }\n    ppaShowGatewayError('Gateway: '+_ppaErrCode+' · '+_ppaErrMsg);\n    return true;\n  }finally{";
if (!output.includes(catchNeedle)) throw new Error('PPA Gateway fallback patch target not found');
output = output.replace(catchNeedle, catchPatch);

const saveToolsRe = /&lt;div id=&quot;saveTools&quot;&gt;[\s\S]*?&lt;\/div&gt;\s*&lt;\/section&gt;/;
if (!saveToolsRe.test(output)) throw new Error('PPA save tools block not found');
output = output.replace(saveToolsRe, '&lt;/section&gt;');

// Online dungeon mobs use server-authoritative spawn/HP/position/AI events.
// Clients keep only rendering, local controls, and offline fallback behavior.
const combatCreditNeedle = 'P.kil++;P.xp+=e.xp;';
if (!output.includes(combatCreditNeedle)) throw new Error('PPA shared mob reward patch target not found');
output = output.split(combatCreditNeedle).join("if(!window.PPA_MOB_REWARD_ELIGIBLE||window.PPA_MOB_REWARD_ELIGIBLE(e)){P.kil++;P.xp+=e.xp;}");

const basicMobEventNeedle = `  const r=basicAttackRoll(target);
  target.hp-=r.damage;
  target.flash=7;target.aggro=true;`;
const basicMobEventPatch = `  const r=basicAttackRoll(target);
  const _ppaServerHit=window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(target,r.damage);
  if(!_ppaServerHit)target.hp-=r.damage;
  target.flash=7;target.aggro=true;`;
if (!output.includes(basicMobEventNeedle)) throw new Error('PPA basic shared mob hit patch target not found');
output = output.replace(basicMobEventNeedle,basicMobEventPatch);

const skillMobEventNeedle = `  if(e.isAiFighter&&typeof v225AiIncomingDamageMul==='function')dmg=Math.max(1,Math.round(dmg*v225AiIncomingDamageMul(e)));
  e.hp-=dmg;
  applyPlayerVampirism(dmg,.6);`;
const skillMobEventPatch = `  if(e.isAiFighter&&typeof v225AiIncomingDamageMul==='function')dmg=Math.max(1,Math.round(dmg*v225AiIncomingDamageMul(e)));
  const _ppaServerSkillHit=window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(e,dmg);
  if(!_ppaServerSkillHit)e.hp-=dmg;
  applyPlayerVampirism(dmg,.6);`;
if (!output.includes(skillMobEventNeedle)) throw new Error('PPA skill shared mob hit patch target not found');
output = output.replace(skillMobEventNeedle,skillMobEventPatch);

const rangedMobEventNeedle = `          const raw=Math.max(1,Math.floor(P.atk||12)-(t.def||0));
          t.hp=Math.max(0,t.hp-raw);
          t.flash=6;t.aggro=true;`;
const rangedMobEventPatch = `          const raw=Math.max(1,Math.floor(P.atk||12)-(t.def||0));
          const _ppaServerRangeHit=window.PPA_MOB_EVENT_DAMAGE&&window.PPA_MOB_EVENT_DAMAGE(t,raw);
          if(!_ppaServerRangeHit)t.hp=Math.max(0,t.hp-raw);
          t.flash=6;t.aggro=true;`;
if (!output.includes(rangedMobEventNeedle)) throw new Error('PPA ranged shared mob hit patch target not found');
output = output.split(rangedMobEventNeedle).join(rangedMobEventPatch);

const localRespawnNeedle = "if(P.scene==='dungeon'&&!e.isBoss&&e.si!==undefined)RESPAWN_Q.push({at:Date.now()+MOB_RESPAWN_MS,si:e.si});";
if (!output.includes(localRespawnNeedle)) throw new Error('PPA local mob respawn patch target not found');
output = output.split(localRespawnNeedle).join("if(P.scene==='dungeon'&&!e.isBoss&&e.si!==undefined&&!window.PPA_REALTIME_V2_ACTIVE)RESPAWN_Q.push({at:Date.now()+MOB_RESPAWN_MS,si:e.si});");

// In online mode the old single-player dungeon spawner is forbidden from
// creating the mob roster. The server catalog/snapshot creates alive mobs.
const localSpawnLoopNeedle = "for(let si=0;si<DG_ACTIVE_SPAWNS.length;si++)spawnMobAtPoint(si,false);";
if (!output.includes(localSpawnLoopNeedle)) throw new Error('PPA local dungeon spawn loop target not found');
output = output.replace(localSpawnLoopNeedle,
  "if(!window.PPA_REALTIME_V2_ACTIVE){for(let si=0;si<DG_ACTIVE_SPAWNS.length;si++)spawnMobAtPoint(si,false);}else if(window.PPA_MOB_SERVER_REGISTER){setTimeout(()=>window.PPA_MOB_SERVER_REGISTER(),0);}"
);

// Block every accidental normal-mob creation path in an online dungeon.
// Only the authoritative bridge may temporarily set __PPA_SERVER_SPAWN_CALL.
const spawnMobFnNeedle = "function spawnMobAtPoint(si,fx){";
if (!output.includes(spawnMobFnNeedle)) throw new Error('PPA spawnMobAtPoint gate target not found');
output = output.replace(spawnMobFnNeedle,
  "function spawnMobAtPoint(si,fx){if(window.PPA_REALTIME_V2_ACTIVE&&P&&P.scene==='dungeon'&&!window.__PPA_SERVER_SPAWN_CALL)return;"
);

// In online dungeons normal mob attack timing/damage is server-driven.
// Local single-player AI must not secretly hit the local player between packets.
const localMobAttackNeedle = "if(e.aggro&&d<=reach&&e.atkCD<=0){";
if (!output.includes(localMobAttackNeedle)) throw new Error('PPA local mob attack gate target not found');
output = output.split(localMobAttackNeedle).join(
  "if(!(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE())&&e.aggro&&d<=reach&&e.atkCD<=0){"
);

// Generic dungeon monster rendering used to face the LOCAL player, so an observer
// could see a mob attack in the wrong direction. Prefer authoritative server dir.
const renderFacingNeedle = `      const dxp=P.x-e.x,dyp=P.y-e.y;
      // 4 visible states:
      // 0 right, 1 left, 2 upper-turn, 3 lower-turn
      let state=0;
      if(Math.abs(dxp)>Math.abs(dyp))state=dxp>=0?0:1;
      else state=dyp<0?2:3;
      e.visDir=state;`;
const renderFacingPatch = `      const dxp=P.x-e.x,dyp=P.y-e.y;
      // 4 visible states:
      // 0 right, 1 left, 2 upper-turn, 3 lower-turn
      let state=0;
      if(window.PPA_SERVER_MOBS_ACTIVE&&window.PPA_SERVER_MOBS_ACTIVE()&&Number.isFinite(Number(e.__ppaServerDir))){
        const _sd=Number(e.__ppaServerDir);
        state=_sd===3?0:_sd===2?1:_sd===0?2:3;
      }else if(Math.abs(dxp)>Math.abs(dyp))state=dxp>=0?0:1;
      else state=dyp<0?2:3;
      e.visDir=state;`;
if (output.includes(renderFacingNeedle)) output = output.replace(renderFacingNeedle,renderFacingPatch);

const filesToPublish = [
  ['gateway/ppa-bridge.js','ppa-bridge.js','Telegram gateway bridge missing'],
  ['gateway/online-client.js','online-client.js','Online client bridge missing'],
  ['gateway/realtime-client.js','realtime-client.js','Realtime client bridge missing'],
  ['gateway/dungeon-mob-events.js','dungeon-mob-events.js','Dungeon mob event bridge missing'],
  ['gateway/realtime-debug-bridge.js','realtime-debug-bridge.js','Realtime debug bridge missing'],
  ['gateway/remote-sprite-renderer.js','remote-sprite-renderer.js','Remote sprite renderer missing'],
  ['gateway/remote-pet-renderer.js','remote-pet-renderer.js','Remote pet renderer missing'],
  ['gateway/realtime-identity-sync.js','realtime-identity-sync.js','Realtime identity sync missing'],
  ['gateway/class-sync-client.js','class-sync-client.js','Realtime class sync missing'],
  ['gateway/telegram-safe-ui.js','telegram-safe-ui.js','Telegram safe UI helper missing'],
  ['gateway/mobile-hud-tweaks.js','mobile-hud-tweaks.js','Mobile HUD tweaks missing'],
  ['gateway/social-ui.js','social-ui.js','Social UI missing'],
];
for (const [srcName,dstName,err] of filesToPublish) {
  const src=path.join(ROOT,srcName);if(!fs.existsSync(src))throw new Error(`${err}: ${srcName}`);
  fs.copyFileSync(src,path.join(gameDir,dstName));
}

if (!output.includes('</body>')) throw new Error('PPA main </body> not found');
const js=(name)=>`/game/${name}?v=${CLIENT_BUILD}`;
output = output.replace('</body>', `<script src="${js('telegram-safe-ui.js')}"></script>\n<script src="${js('mobile-hud-tweaks.js')}"></script>\n<script src="${js('online-client.js')}"></script>\n<script src="${js('realtime-client.js')}"></script>\n<script src="${js('dungeon-mob-events.js')}"></script>\n<script src="${js('realtime-debug-bridge.js')}"></script>\n<script src="${js('remote-sprite-renderer.js')}"></script>\n<script src="${js('remote-pet-renderer.js')}"></script>\n<script src="${js('class-sync-client.js')}"></script>\n<script src="${js('social-ui.js')}"></script>\n<script src="${js('realtime-identity-sync.js')}"></script>\n</body>`);

fs.writeFileSync(path.join(publicDir, 'index.html'), output, 'utf8');
console.log(`PPA build complete: ${count} unique embedded images externalized.`);
console.log('Telegram bridge: /game/ppa-bridge.js');
console.log('Telegram safe UI: /game/telegram-safe-ui.js');
console.log('Mobile HUD tweaks: /game/mobile-hud-tweaks.js');
console.log('Online bridge: /game/online-client.js');
console.log('Realtime bridge: /game/realtime-client.js');
console.log('Dungeon mob events: /game/dungeon-mob-events.js');
console.log('Realtime debug bridge: /game/realtime-debug-bridge.js');
console.log('Remote player sprites: /game/remote-sprite-renderer.js');
console.log('Remote pet renderer: /game/remote-pet-renderer.js');
console.log('Realtime class sync: /game/class-sync-client.js');
console.log('Social UI: /game/social-ui.js');
console.log('Realtime identity sync: /game/realtime-identity-sync.js');
console.log(`Client build cache key: ${CLIENT_BUILD}`);
console.log('Legacy Supabase realtime: disabled');
console.log('Telegram migration lockout guard: enabled');
console.log('Portable save buttons: removed');
console.log(`index.html: ${(Buffer.byteLength(output)/1024/1024).toFixed(2)} MiB`);