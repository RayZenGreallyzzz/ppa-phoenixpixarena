import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const EXPECTED_PARTS = 12;
const EXPECTED_SOURCE_SHA256 = 'caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const parts = Array.from({length:EXPECTED_PARTS},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const CLIENT_BUILD = 'v306-combat-queue-mob-facing-20260918-1302';

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

const combatCreditNeedle = 'P.kil++;P.xp+=e.xp;';
if (!output.includes(combatCreditNeedle)) throw new Error('PPA combat credit patch target not found');
output = output.split(combatCreditNeedle).join("if(!window.PPA_MOB_REWARD_ELIGIBLE||window.PPA_MOB_REWARD_ELIGIBLE(e)){P.kil++;P.xp+=e.xp;}"); 

// Android Telegram WebView can emit pointerdown + touchstart + touchend + click
// for a single physical tap. The source bound combat to all four, so a long
// press could issue a second Smart Attack on release and silently select/kill
// the next mob. Use one input family only.
const attackInputNeedle = `bA.addEventListener('pointerdown',attackPointerDown,{passive:false});
bA.addEventListener('touchstart',triggerAttackInput,{passive:false});
bA.addEventListener('touchend',triggerAttackInput,{passive:false});
bA.addEventListener('click',triggerAttackInput,{passive:false});
bA.addEventListener('pointerup',attackPointerEnd,{passive:false});
bA.addEventListener('pointercancel',attackPointerEnd,{passive:false});
bA.addEventListener('contextmenu',e=>e.preventDefault());`;
const attackInputPatch = `if(window.PointerEvent){
  bA.addEventListener('pointerdown',attackPointerDown,{passive:false});
  bA.addEventListener('pointerup',attackPointerEnd,{passive:false});
  bA.addEventListener('pointercancel',attackPointerEnd,{passive:false});
}else{
  bA.addEventListener('touchstart',triggerAttackInput,{passive:false});
  bA.addEventListener('touchend',attackPointerEnd,{passive:false});
}
bA.addEventListener('contextmenu',e=>e.preventDefault());`;
if (!output.includes(attackInputNeedle)) throw new Error('PPA single attack input patch target not found');
output = output.replace(attackInputNeedle, attackInputPatch);

// Never turn taps made DURING basic-attack cooldown into a future hidden attack.
// Out-of-range Smart Attack still works: one tap may run to one target and strike once.
const attackQueueNeedle = `  if(inRange&&P.shootCD<=0){
    cancelSmartAttack();
    attackQueued=true;
  }else{
    // Even if attack is cooling down, start approaching now and fire once ready.
    startSmartAttack(cur);
  }`;
const attackQueuePatch = `  if(inRange){
    cancelSmartAttack();
    if(P.shootCD<=0)attackQueued=true;
    return;
  }
  // Only an out-of-range press may create Smart Attack movement.
  // Repeated taps during cooldown are ignored instead of becoming delayed attacks.
  startSmartAttack(cur);`;
if (!output.includes(attackQueueNeedle)) throw new Error('PPA attack cooldown queue patch target not found');
output = output.replace(attackQueueNeedle, attackQueuePatch);

// Mark actual combat damage exactly where the game applies it. Realtime mob sync
// no longer guesses from button state, animations, flash, or local HP cleanup.
const basicHitNeedle = `  const r=basicAttackRoll(target);
  target.hp-=r.damage;
  target.flash=7;target.aggro=true;`;
const basicHitPatch = `  const r=basicAttackRoll(target);
  if(window.PPA_MOB_MARK_HIT)window.PPA_MOB_MARK_HIT(target,900);
  target.hp-=r.damage;
  target.flash=7;target.aggro=true;`;
if (!output.includes(basicHitNeedle)) throw new Error('PPA basic explicit-hit patch target not found');
output = output.replace(basicHitNeedle, basicHitPatch);

const skillHitNeedle = `  if(e.isAiFighter&&typeof v225AiIncomingDamageMul==='function')dmg=Math.max(1,Math.round(dmg*v225AiIncomingDamageMul(e)));
  e.hp-=dmg;
  applyPlayerVampirism(dmg,.6);`;
const skillHitPatch = `  if(e.isAiFighter&&typeof v225AiIncomingDamageMul==='function')dmg=Math.max(1,Math.round(dmg*v225AiIncomingDamageMul(e)));
  if(window.PPA_MOB_MARK_HIT)window.PPA_MOB_MARK_HIT(e,1400);
  e.hp-=dmg;
  applyPlayerVampirism(dmg,.6);`;
if (!output.includes(skillHitNeedle)) throw new Error('PPA skill explicit-hit patch target not found');
output = output.replace(skillHitNeedle, skillHitPatch);

// Gnome/archer fallback damage must also be explicit if the normal helper throws.
const rangedFallbackNeedle = `          const raw=Math.max(1,Math.floor(P.atk||12)-(t.def||0));
          t.hp=Math.max(0,t.hp-raw);
          t.flash=6;t.aggro=true;`;
const rangedFallbackPatch = `          const raw=Math.max(1,Math.floor(P.atk||12)-(t.def||0));
          if(window.PPA_MOB_MARK_HIT)window.PPA_MOB_MARK_HIT(t,900);
          t.hp=Math.max(0,t.hp-raw);
          t.flash=6;t.aggro=true;`;
if (!output.includes(rangedFallbackNeedle)) throw new Error('PPA ranged fallback explicit-hit patch target not found');
output = output.split(rangedFallbackNeedle).join(rangedFallbackPatch);

// A cannonball used to damage the target after travelling only the ORIGINAL
// distance, even when the mob had already moved elsewhere. That looked like a
// random remote death. Make the projectile hit only on visible contact.
const cannonPushNeedle = `    remaining:dist,
    target:target
  });`;
const cannonPushPatch = `    remaining:dist,
    target:target,
    bornAt:Date.now()
  });`;
if (!output.includes(cannonPushNeedle)) throw new Error('PPA cannonball bornAt patch target not found');
output = output.replace(cannonPushNeedle, cannonPushPatch);

const cannonUpdateNeedle = `    b.x+=b.vx;
    b.y+=b.vy;
    b.remaining-=Math.hypot(b.vx,b.vy);

    if(b.remaining<=0){
      const t=b.target;
      if(t&&t.hp>0){
        try{
          applyBasicAttackHit(t);
        }catch(_){
          const raw=Math.max(1,Math.floor(P.atk||12)-(t.def||0));
          if(window.PPA_MOB_MARK_HIT)window.PPA_MOB_MARK_HIT(t,900);
          t.hp=Math.max(0,t.hp-raw);
          t.flash=6;t.aggro=true;
        }
      }
      PLAYER_CANNONBALLS.splice(i,1);
    }`;
const cannonUpdatePatch = `    b.x+=b.vx;
    b.y+=b.vy;
    b.remaining-=Math.hypot(b.vx,b.vy);

    const t=b.target;
    if(!t||t.hp<=0||Date.now()-Number(b.bornAt||0)>2600){
      PLAYER_CANNONBALLS.splice(i,1);
      continue;
    }
    const hitR=Math.max(22,Math.min(62,(Number(t.sz)||30)*.72));
    const hitD=Math.hypot((Number(t.x)||0)-b.x,(Number(t.y)||0)-b.y);
    if(hitD<=hitR||b.remaining<=0){
      // If the mob moved far from the shot line, the shell misses instead of
      // damaging it at a completely different location.
      if(hitD<=Math.max(hitR,54)){
        try{
          applyBasicAttackHit(t);
        }catch(_){
          const raw=Math.max(1,Math.floor(P.atk||12)-(t.def||0));
          if(window.PPA_MOB_MARK_HIT)window.PPA_MOB_MARK_HIT(t,900);
          t.hp=Math.max(0,t.hp-raw);
          t.flash=6;t.aggro=true;
        }
      }
      PLAYER_CANNONBALLS.splice(i,1);
    }`;
if (!output.includes(cannonUpdateNeedle)) throw new Error('PPA cannonball contact patch target not found');
output = output.replace(cannonUpdateNeedle, cannonUpdatePatch);

// When a mob stops to attack, face the target instead of keeping the last
// movement row. This direction is included in mob-state and fixes remote
// clients showing spiders/animated mobs attacking backwards.
const mobFacingNeedle = `      if(e.type&&e.type.caveSpider){
        if(move){
          if(Math.abs(tx)>Math.abs(ty))e.spiderDir=tx<0?2:3;
          else e.spiderDir=ty<0?0:1;
          e.spiderMoving=true;
        }else{
          e.spiderMoving=false;
        }
      }

      if(e.animPack){
        if(move){
          if(Math.abs(tx)>Math.abs(ty))e.animDir=tx<0?2:3;
          else e.animDir=ty<0?0:1;
          e.animMoving=true;
        }else{
          e.animMoving=false;
        }
      }`;
const mobFacingPatch = `      const _mobFaceX=move?tx:(e.aggro?(chaseX-e.x):0);
      const _mobFaceY=move?ty:(e.aggro?(chaseY-e.y):0);

      if(e.type&&e.type.caveSpider){
        if(Math.abs(_mobFaceX)+Math.abs(_mobFaceY)>.01){
          if(Math.abs(_mobFaceX)>Math.abs(_mobFaceY))e.spiderDir=_mobFaceX<0?2:3;
          else e.spiderDir=_mobFaceY<0?0:1;
        }
        e.spiderMoving=!!move;
      }

      if(e.animPack){
        if(Math.abs(_mobFaceX)+Math.abs(_mobFaceY)>.01){
          if(Math.abs(_mobFaceX)>Math.abs(_mobFaceY))e.animDir=_mobFaceX<0?2:3;
          else e.animDir=_mobFaceY<0?0:1;
        }
        e.animMoving=!!move;
      }`;
if (!output.includes(mobFacingNeedle)) throw new Error('PPA mob attack facing patch target not found');
output = output.replace(mobFacingNeedle, mobFacingPatch);

const filesToPublish = [
  ['gateway/ppa-bridge.js','ppa-bridge.js','Telegram gateway bridge missing'],
  ['gateway/online-client.js','online-client.js','Online client bridge missing'],
  ['gateway/realtime-client.js','realtime-client.js','Realtime client bridge missing'],
  ['gateway/dungeon-mob-sync.js','dungeon-mob-sync.js','Dungeon mob sync bridge missing'],
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
output = output.replace('</body>', `<script src="${js('telegram-safe-ui.js')}"></script>\n<script src="${js('mobile-hud-tweaks.js')}"></script>\n<script src="${js('online-client.js')}"></script>\n<script src="${js('realtime-client.js')}"></script>\n<script src="${js('dungeon-mob-sync.js')}"></script>\n<script src="${js('realtime-debug-bridge.js')}"></script>\n<script src="${js('remote-sprite-renderer.js')}"></script>\n<script src="${js('remote-pet-renderer.js')}"></script>\n<script src="${js('class-sync-client.js')}"></script>\n<script src="${js('social-ui.js')}"></script>\n<script src="${js('realtime-identity-sync.js')}"></script>\n</body>`);

fs.writeFileSync(path.join(publicDir, 'index.html'), output, 'utf8');
console.log(`PPA build complete: ${count} unique embedded images externalized.`);
console.log('Telegram bridge: /game/ppa-bridge.js');
console.log('Telegram safe UI: /game/telegram-safe-ui.js');
console.log('Mobile HUD tweaks: /game/mobile-hud-tweaks.js');
console.log('Online bridge: /game/online-client.js');
console.log('Realtime bridge: /game/realtime-client.js');
console.log('Dungeon mob sync: /game/dungeon-mob-sync.js');
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