import { RealtimeHub as BaseRealtimeHub } from './realtime.js';

function attOf(ws) {
  try { return ws.deserializeAttachment() || {}; } catch (_) { return {}; }
}

function cleanRoom(v) {
  v = String(v || 'safe').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return v || 'safe';
}

function cleanName(v) {
  return String(v || 'Игрок').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 24) || 'Игрок';
}

function cleanPet(v) {
  return String(v || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 48);
}

function cleanClass(v) {
  v = String(v || '').trim().toLowerCase();
  return ['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(v) ? v : '';
}

function cleanMobKey(v) {
  v = String(v || '');
  return (/^s\d{1,4}$/.test(v) || ['p20','b40','b60','wtitan'].includes(v)) ? v : '';
}

function finite(v, min, max, fallback = 0) {
  v = Number(v);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

const CLAN_BOSS_RESPAWN_MS = 12 * 60 * 60 * 1000;
const CLAN_BOSS_QA_TEST_OPEN = true;
const CLAN_BOSS_QA_RESPAWN_MS = 10 * 1000;
function clanBossRespawnMs(){return CLAN_BOSS_QA_TEST_OPEN?CLAN_BOSS_QA_RESPAWN_MS:CLAN_BOSS_RESPAWN_MS}
const CLAN_BOSS_CONFIG = Object.freeze({
  clan_boss_1: Object.freeze({ id:'clan_boss_1', mhp:5000000 }),
  clan_boss_2: Object.freeze({ id:'clan_boss_2', mhp:45000000 }),
});
function clanBossConfig(v){
  return CLAN_BOSS_CONFIG[String(v||'')] || null;
}
function clanBossRoom(clanId,bossId){
  clanId=String(clanId||'').trim();
  bossId=String(bossId||'').trim();
  return clanId&&clanBossConfig(bossId)?cleanRoom('clanboss-'+clanId+'-'+bossId):'';
}
function isClanBossRoom(v){return cleanRoom(v).startsWith('clanboss-')}
function jsonObj(v){try{const x=JSON.parse(String(v||'{}'));return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch(_){return{}}}
function jsonArr(v){try{const x=JSON.parse(String(v||'[]'));return Array.isArray(x)?x:[]}catch(_){return[]}}

const DUNGEON_CAPACITY = 40;
const DUNGEON_RESERVE_MS = 90_000;
const DUNGEON_MOB_RESPAWN_MS = 14_000;
const DUNGEON_PHOENIX_RESPAWN_MS = 2 * 60 * 60 * 1000;
const DUNGEON_LORD40_RESPAWN_MS = 6 * 60 * 60 * 1000;
const DUNGEON_BOSS60_RESPAWN_MS = 6 * 60 * 60 * 1000;

// TEMP QA: while PPA_BOSS_TEST_OPEN is enabled in the client build, let the
// Crystal Titan be fought repeatedly without waiting for the 18:00 cycle.
// Turn this off together with the client QA flag before release.
const WORLD_BOSS_QA_TEST_OPEN = true;
const WORLD_BOSS_QA_RESPAWN_MS = 4_000;

function mobAuthorityRoom(v) {
  const room = cleanRoom(v);
  return room.startsWith('dungeon-') || room === 'worldboss';
}

function mobRespawnAt(key, rec, now = Date.now()) {
  key = cleanMobKey(key);
  if (key === 'p20') return now + DUNGEON_PHOENIX_RESPAWN_MS;
  if (key === 'b40') return now + DUNGEON_LORD40_RESPAWN_MS;
  if (key === 'b60') return now + DUNGEON_BOSS60_RESPAWN_MS;
  if (key === 'wtitan') {
    if (WORLD_BOSS_QA_TEST_OPEN) return now + WORLD_BOSS_QA_RESPAWN_MS;
    const resetAt = Math.max(0, Number(rec && rec.resetAt) || 0);
    return resetAt > now ? resetAt : now + 24 * 60 * 60 * 1000;
  }
  return now + DUNGEON_MOB_RESPAWN_MS;
}

function dungeonInfo(v) {
  const room = cleanRoom(v);
  if (!room.startsWith('dungeon-')) return null;
  const m = room.match(/^(dungeon-[a-z0-9_-]*?)-i([1-9]\d*)$/);
  if (m) return { base: m[1], room, instance: Math.max(1, Number(m[2]) || 1) };
  return { base: room, room: '', instance: 0 };
}

function dungeonRoom(base, instance) {
  const d = dungeonInfo(base);
  return d ? (d.base + '-i' + Math.max(1, Math.floor(Number(instance) || 1))) : cleanRoom(base);
}

function wsJson(ws, data) {
  try { ws.send(JSON.stringify(data)); return true; } catch (_) { return false; }
}

// Arena basic attacks are class-authoritative. Never trust a client to turn
// a melee class into a ranged attacker by reporting a larger attackRange.
const ARENA_BASIC_RANGE_BY_CLASS=Object.freeze({
  tank:72,barbarian:78,paladin:74,assassin:48,
  gnome:360,archer:420,mage:390,priest:330
});
function arenaBasicRangeFor(a){
  const cls=cleanClass(a&&a.classKey);
  const fixed=ARENA_BASIC_RANGE_BY_CLASS[cls];
  return Number.isFinite(Number(fixed))?Number(fixed):Math.max(60,Math.min(480,Number(a&&a.attackRange)||60));
}
function arenaIsMeleeClass(a){
  const cls=cleanClass(a&&a.classKey);
  return cls==='tank'||cls==='barbarian'||cls==='paladin'||cls==='assassin';
}
function arenaSkillRangeCapFor(a,requested){
  const cls=cleanClass(a&&a.classKey);
  const req=Math.max(80,Math.min(700,Number(requested)||180));
  // Assassin damaging skills resolve next to the target (dash lands in melee;
  // cross/sentence are close-range), so the server must never accept a 700px hit.
  if(cls==='assassin')return Math.min(req,180);
  return req;
}

function playerPkRoomAllowed(v){
  const room=cleanRoom(v);
  if(!room||room==='safe')return false;
  if(room.startsWith('pvp1-')||room.startsWith('pvpteam-'))return false;
  if(room==='pvp1'||room==='pvpteam')return false;
  if(room.startsWith('clansiege')||room.startsWith('clanboss-'))return false;
  return true;
}

function packetFromAtt(a) {
  return {
    i: String(a.pid || ''),
    n: cleanName(a.name || 'Игрок'),
    c: String(a.classKey || 'ГЕРОЙ').slice(0, 24),
    g: String(a.clanId || '').slice(0, 80),
    cn: String(a.clanName || '').trim().slice(0, 24),
    r: cleanRoom(a.room),
    x: Number(a.x) || 0,
    y: Number(a.y) || 0,
    h: Math.max(0, Number(a.h) || 0),
    m: Math.max(1, Number(a.m) || 1),
    f: Number.isFinite(Number(a.f)) ? Number(a.f) : 1,
    a: String(a.a || 'idle').slice(0, 12),
    l: Math.max(1, Math.min(999, Math.round(Number(a.l) || 1))),
    b: Math.max(0, Math.round(Number(a.b) || 0)),
    p: String(a.partyId || ''),
    av: String(a.arenaSide || ''),
    am: String(a.arenaMatchId || ''),
    pt: cleanPet(a.pet || ''),
    hu: Math.max(0, Number(a.hiddenUntil) || 0),
    at: Math.max(1, Number(a.atk) || 1),
    df: Math.max(0, Number(a.def) || 0),
    ar: Math.max(60, Number(a.attackRange) || 60),
    cr: Math.max(0, Number(a.crit) || 0),
    cd: Math.max(100, Number(a.critDmg) || 180),
    as: Math.max(.35, Number(a.atkSpd) || 1),
    q: Number(a.q) || 0,
    t: Date.now(),
  };
}

export class RealtimeHub extends BaseRealtimeHub {
  ensureRoomIndex() {
    if (this._roomIndex) return this._roomIndex;
    this._roomIndex = new Map();
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      const room = cleanRoom(a.room);
      let set = this._roomIndex.get(room);
      if (!set) this._roomIndex.set(room, set = new Set());
      set.add(ws);
    }
    return this._roomIndex;
  }

  roomSockets(room) {
    room = cleanRoom(room);
    const idx = this.ensureRoomIndex();
    return idx.get(room) || new Set();
  }

  indexAdd(ws, room) {
    room = cleanRoom(room);
    const idx = this.ensureRoomIndex();
    let set = idx.get(room);
    if (!set) idx.set(room, set = new Set());
    set.add(ws);
  }

  indexRemove(ws, room) {
    room = cleanRoom(room);
    const idx = this.ensureRoomIndex();
    const set = idx.get(room);
    if (!set) return;
    set.delete(ws);
    if (!set.size) idx.delete(room);
  }

  indexMove(ws, oldRoom, newRoom) {
    oldRoom = cleanRoom(oldRoom);
    newRoom = cleanRoom(newRoom);
    if (oldRoom === newRoom) {
      this.indexAdd(ws, newRoom);
      return;
    }
    this.indexRemove(ws, oldRoom);
    this.indexAdd(ws, newRoom);
  }

  hasReplacement(pid, except) {
    pid = String(pid || '');
    if (!pid) return false;
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      const a = attOf(ws);
      if (String(a.pid || '') === pid) return true;
    }
    return false;
  }

  countRoom(room) {
    const ids = new Set();
    for (const ws of this.roomSockets(room)) {
      const a = attOf(ws);
      if (a.pid) ids.add(String(a.pid));
    }
    return ids.size;
  }

  roomCount(room) {
    return this.countRoom(room);
  }

  roomBroadcast(room, data, except) {
    room = cleanRoom(room);
    const raw = JSON.stringify(data);
    for (const ws of this.roomSockets(room)) {
      if (ws === except) continue;
      try { ws.send(raw); } catch (_) {}
    }
  }

  sendRoomSnapshot(ws, room) {
    room = cleanRoom(room);
    const byPid = new Map();
    for (const other of this.roomSockets(room)) {
      if (other === ws) continue;
      const a = attOf(other);
      const pid = String(a.pid || '');
      if (!pid) continue;
      if (!Number.isFinite(Number(a.x)) || !Number.isFinite(Number(a.y))) continue;
      const prev = byPid.get(pid);
      if (!prev || Number(a.lastSeenAt || 0) >= Number(prev.lastSeenAt || 0)) byPid.set(pid, a);
    }
    const players = [...byPid.values()].map(packetFromAtt);
    wsJson(ws, {
      type: 'snapshot',
      room,
      serverRoom: room,
      roomCount: this.countRoom(room),
      players,
      ts: Date.now(),
    });
  }

  clanBossStorageKey(clanId) {
    return 'clan-boss:' + String(clanId || '').trim();
  }

  async clanBossStored(clanId) {
    clanId=String(clanId||'').trim();
    if(!clanId)return null;
    try{
      const st=await this.ctx.storage.get(this.clanBossStorageKey(clanId));
      return st&&typeof st==='object'?st:null;
    }catch(_){return null}
  }

  async clanBossPersist(st) {
    if(!st||!st.clanId)return false;
    await this.ctx.storage.put(this.clanBossStorageKey(st.clanId),st);
    return true;
  }

  async clanBossMembership(a) {
    if(!a||!a.telegramId||!this.env||!this.env.DB)return null;
    const row=await this.env.DB.prepare(
      'SELECT cm.clan_id,c.name AS clan_name FROM clan_members cm LEFT JOIN clans c ON c.id=cm.clan_id WHERE cm.telegram_id=?1 LIMIT 1'
    ).bind(String(a.telegramId)).first();
    if(!row||!row.clan_id)return null;
    a.clanId=String(row.clan_id).slice(0,80);
    a.clanName=String(row.clan_name||'').trim().slice(0,24);
    return {clanId:a.clanId,clanName:a.clanName};
  }

  async clanBossCooldownFromMeta(clanId) {
    if(!this.env||!this.env.DB||!clanId)return 0;
    try{
      const row=await this.env.DB.prepare('SELECT progress_json FROM clan_meta WHERE clan_id=?1').bind(String(clanId)).first();
      const p=jsonObj(row&&row.progress_json||'{}');
      return Math.max(0,Number(p.bossReadyAt)||0);
    }catch(_){return 0}
  }

  clanBossPublicState(st,room,recipient,now=Date.now()) {
    if(!st)return null;
    room=cleanRoom(room||clanBossRoom(st.clanId,st.bossId));
    let partySize=0,aliveCount=0;
    for(const peer of this.roomSockets(room)){
      const pa=attOf(peer);
      if(String(pa.clanId||'')!==String(st.clanId||''))continue;
      if(!pa.pid)continue;
      partySize++;
      if(!pa.deadLocked&&Number(pa.h)>0)aliveCount++;
    }
    const dmg=st.damageByPid&&typeof st.damageByPid==='object'?st.damageByPid:{};
    const pid=String(recipient&&recipient.pid||'');
    const hp=Math.max(0,Number(st.hp)||0),mhp=Math.max(1,Number(st.mhp)||1);
    const respawnAt=Math.max(0,Number(st.respawnAt)||0);
    const active=String(st.status)==='active'&&hp>0;
    return {
      active,bossId:String(st.bossId||''),bossHp:hp,bossMaxHp:mhp,
      partySize,aliveCount,
      playerDamage:Math.max(0,Number(dmg[pid])||0),
      totalDamage:Object.values(dmg).reduce((sum,v)=>sum+Math.max(0,Number(v)||0),0),
      rewardedDamage:0,earnedCoins:0,
      status:active?'fighting':(respawnAt>now?'cooldown':'ready'),
      startedAt:Number(st.startedAt)||0,updatedAt:Number(st.updatedAt)||0,
      defeatedAt:Number(st.defeatedAt)||0,cooldownUntil:respawnAt,bossReadyAt:respawnAt,
      lastEvent:active?'Рейд идёт':(respawnAt>now?(CLAN_BOSS_QA_TEST_OPEN?'ТЕСТ · босс восстанавливается 10 секунд':'Босс повержен · откат 12 часов'):'Босс готов'),
      qaTest:CLAN_BOSS_QA_TEST_OPEN,respawnMs:clanBossRespawnMs(),
      enterScene:'clanboss1'
    };
  }

  async sendClanBossState(ws,a,st=null,now=Date.now()) {
    if(!a||!a.clanBossRoom||!a.clanId)return false;
    st=st||await this.clanBossStored(a.clanId);
    if(!st)return false;
    wsJson(ws,{type:'clan-boss-state',room:cleanRoom(a.clanBossRoom),bossState:this.clanBossPublicState(st,a.clanBossRoom,a,now),ts:now});
    return true;
  }

  async broadcastClanBossState(st,room,now=Date.now()) {
    if(!st)return;
    room=cleanRoom(room||clanBossRoom(st.clanId,st.bossId));
    for(const peer of this.roomSockets(room)){
      const pa=attOf(peer);
      if(String(pa.clanId||'')!==String(st.clanId||''))continue;
      wsJson(peer,{type:'clan-boss-state',room,bossState:this.clanBossPublicState(st,room,pa,now),ts:now});
    }
  }

  async clanBossEnter(ws,a,bossId,requestId,now=Date.now()) {
    requestId=String(requestId||'').slice(0,80);
    const cfg=clanBossConfig(bossId);
    if(!cfg){
      wsJson(ws,{type:'clan-boss-reject',requestId,reason:'Неизвестный клановый босс.',ts:now});
      return;
    }
    const member=await this.clanBossMembership(a);
    if(!member){
      wsJson(ws,{type:'clan-boss-reject',requestId,reason:'Ты не состоишь в клане.',ts:now});
      return;
    }

    const metaCooldown=CLAN_BOSS_QA_TEST_OPEN?0:await this.clanBossCooldownFromMeta(member.clanId);
    let st=await this.clanBossStored(member.clanId);
    // QA must start from a clean realtime raid, not inherit a stale 12h state
    // created by an older production-style build.
    if(CLAN_BOSS_QA_TEST_OPEN&&st&&st.qaMode!==true)st=null;
    if(st&&String(st.status)==='active'&&Number(st.hp)>0&&String(st.bossId)!==cfg.id){
      wsJson(ws,{type:'clan-boss-reject',requestId,reason:'Другой клановый босс уже активен.',bossState:this.clanBossPublicState(st,clanBossRoom(st.clanId,st.bossId),a,now),ts:now});
      return;
    }

    const storedCooldown=st?Math.max(0,Number(st.respawnAt)||0):0;
    const cooldown=Math.max(metaCooldown,storedCooldown);
    if(cooldown>now&&!(st&&String(st.status)==='active'&&Number(st.hp)>0)){
      const coolState=st||{clanId:member.clanId,bossId:cfg.id,hp:0,mhp:cfg.mhp,status:'cooldown',startedAt:0,updatedAt:now,defeatedAt:cooldown-clanBossRespawnMs(),respawnAt:cooldown,damageByPid:{},telegramByPid:{},nameByPid:{},rewardsByPid:{},qaMode:CLAN_BOSS_QA_TEST_OPEN};
      coolState.status='cooldown';coolState.respawnAt=cooldown;
      if(st)await this.sendClanBossReward(ws,a,st,now);
      wsJson(ws,{type:'clan-boss-reject',requestId,reason:'Босс ещё восстанавливается.',bossState:this.clanBossPublicState(coolState,clanBossRoom(member.clanId,cfg.id),a,now),ts:now});
      return;
    }

    if(!st||String(st.status)!=='active'||!(Number(st.hp)>0)){
      st={
        clanId:member.clanId,bossId:cfg.id,
        hp:cfg.mhp,mhp:cfg.mhp,status:'active',
        startedAt:now,updatedAt:now,defeatedAt:0,respawnAt:0,
        damageByPid:{},telegramByPid:{},nameByPid:{},rewardsByPid:{},qaMode:CLAN_BOSS_QA_TEST_OPEN
      };
      await this.clanBossPersist(st);
    }

    const room=clanBossRoom(member.clanId,st.bossId);
    a.clanBossId=String(st.bossId);
    a.clanBossRoom=room;
    a.lastClanBossSeq=0;
    a.lastClanBossStateAt=0;
    this.moveSocketRoom(ws,a,room,now);
    ws.serializeAttachment(a);
    const bossState=this.clanBossPublicState(st,room,a,now);
    wsJson(ws,{type:'clan-boss-entered',requestId,room,bossState,ts:now});
    this.sendRoomSnapshot(ws,room);
    await this.broadcastClanBossState(st,room,now);
    this.sendOnlineCount();
  }

  clanBossLeave(ws,a,now=Date.now()) {
    const old=cleanRoom(a&&a.room);
    if(a){
      a.clanBossId='';a.clanBossRoom='';a.lastClanBossSeq=0;a.lastClanBossStateAt=0;
      this.moveSocketRoom(ws,a,'safe',now);
      ws.serializeAttachment(a);
    }
    wsJson(ws,{type:'clan-boss-left',room:'safe',ts:now});
    if(old&&old!=='safe')this.sendRoomSnapshot(ws,'safe');
    this.sendOnlineCount();
  }

  clanBossRollMistressReward(st,pid,now=Date.now()) {
    pid=String(pid||'');
    if(!st||String(st.bossId)!=='clan_boss_1'||!pid)return null;
    if(!st.rewardsByPid||typeof st.rewardsByPid!=='object')st.rewardsByPid={};
    const existing=st.rewardsByPid[pid];
    if(existing&&existing.rewardId)return existing;

    let green=2+Math.floor(Math.random()*3);
    let blue=1+Math.floor(Math.random()*2);
    const normalStones=2+Math.floor(Math.random()*3);
    if(Math.random()<0.15){
      if(Math.random()<0.5)green+=1;
      else blue+=1;
    }
    const damage=Math.max(0,Number(st.damageByPid&&st.damageByPid[pid])||0);
    const clanCoins=Math.max(0,Math.floor(damage/10000));
    const reward={
      rewardId:'cbr:'+String(st.clanId||'')+':'+String(st.bossId||'')+':'+String(st.defeatedAt||now)+':'+pid,
      bossId:'clan_boss_1',
      greenResources:green,
      blueResources:blue,
      normalStones,
      premiumStone:Math.random()<0.04,
      blueGear:Math.random()<0.12,
      grayRune:Math.random()<0.10,
      runeRoll:Math.floor(Math.random()*1000000000),
      clanCoins,
      createdAt:now,
      acked:false
    };
    st.rewardsByPid[pid]=reward;
    return reward;
  }

  clanBossEnsureRewards(st,now=Date.now()) {
    if(!st||String(st.bossId)!=='clan_boss_1')return;
    if(!st.rewardsByPid||typeof st.rewardsByPid!=='object')st.rewardsByPid={};
    const dmg=st.damageByPid&&typeof st.damageByPid==='object'?st.damageByPid:{};
    for(const pid of Object.keys(dmg)){
      if(Math.max(0,Number(dmg[pid])||0)<=0)continue;
      this.clanBossRollMistressReward(st,pid,now);
    }
  }

  async sendClanBossReward(ws,a,st=null,now=Date.now()) {
    if(!ws||!a||!a.pid)return false;
    st=st||await this.clanBossStored(a.clanId);
    if(!st||!st.rewardsByPid||typeof st.rewardsByPid!=='object')return false;
    const reward=st.rewardsByPid[String(a.pid||'')];
    if(!reward||reward.acked===true)return false;
    wsJson(ws,{type:'clan-boss-reward',reward:Object.assign({},reward),ts:now});
    return true;
  }

  async clanBossRewardAck(a,rewardId,now=Date.now()) {
    if(!a||!a.clanId||!a.pid||!rewardId)return false;
    const st=await this.clanBossStored(a.clanId);
    if(!st||!st.rewardsByPid||typeof st.rewardsByPid!=='object')return false;
    const reward=st.rewardsByPid[String(a.pid||'')];
    if(!reward||String(reward.rewardId||'')!==String(rewardId||''))return false;
    if(reward.acked===true)return true;
    reward.acked=true;reward.ackedAt=now;
    st.updatedAt=now;
    await this.clanBossPersist(st);
    return true;
  }

  async clanBossRecordDefeat(st,a,now=Date.now()) {
    if(!this.env||!this.env.DB||!st||!st.clanId)return;
    try{
      const row=await this.env.DB.prepare('SELECT progress_json,events_json FROM clan_meta WHERE clan_id=?1').bind(String(st.clanId)).first();
      if(!row)return;
      const progress=jsonObj(row.progress_json||'{}');
      progress.bossReadyAt=Math.max(0,Number(st.respawnAt)||0);
      progress.lastBossId=String(st.bossId||'');
      progress.personalByMember=progress.personalByMember&&typeof progress.personalByMember==='object'?progress.personalByMember:{};
      let clanCoinGain=0;
      const rewards=st.rewardsByPid&&typeof st.rewardsByPid==='object'?st.rewardsByPid:{};
      const telegramByPid=st.telegramByPid&&typeof st.telegramByPid==='object'?st.telegramByPid:{};
      for(const pid of Object.keys(rewards)){
        const rw=rewards[pid]||{},coins=Math.max(0,Math.floor(Number(rw.clanCoins)||0));
        if(!coins)continue;
        clanCoinGain+=coins;
        const tid=String(telegramByPid[pid]||'');
        if(tid)progress.personalByMember[tid]=Math.max(0,Number(progress.personalByMember[tid])||0)+coins;
      }
      progress.coins=Math.max(0,Number(progress.coins)||0)+clanCoinGain;
      const events=jsonArr(row.events_json||'[]');
      events.unshift({
        id:'ce_'+crypto.randomUUID(),type:'clanBossDefeated',
        playerId:String(a&&a.telegramId||''),playerName:cleanName(a&&a.name||'Игрок'),
        text:(CLAN_BOSS_QA_TEST_OPEN?'ТЕСТ · клановый босс · откат 10 секунд':'Клановый босс повержен · откат 12 часов')+(clanCoinGain?' · монеты клана +'+clanCoinGain:''),ts:now
      });
      await this.env.DB.prepare('UPDATE clan_meta SET progress_json=?1,events_json=?2,updated_at=?3 WHERE clan_id=?4')
        .bind(JSON.stringify(progress),JSON.stringify(events.slice(0,300)),now,String(st.clanId)).run();
    }catch(e){console.warn('Clan boss defeat meta',e)}
  }

  async clanBossHit(ws,a,m,now=Date.now()) {
    const room=cleanRoom(a&&a.room);
    const expected=clanBossRoom(a&&a.clanId,a&&a.clanBossId);
    if(!a||!a.clanId||!a.clanBossId||!expected||room!==expected||a.deadLocked||!(Number(a.h)>0)){
      wsJson(ws,{type:'clan-boss-reject',reason:'Удар по клановому боссу отклонён.',ts:now});
      return;
    }

    const seq=Math.max(0,Math.floor(Number(m.seq)||0));
    if(!seq||seq<=Math.max(0,Number(a.lastClanBossSeq)||0))return;
    const st=await this.clanBossStored(a.clanId);
    if(!st||String(st.status)!=='active'||!(Number(st.hp)>0)||String(st.bossId)!==String(a.clanBossId)){
      if(st)await this.sendClanBossState(ws,a,st,now);
      return;
    }

    const atk=Math.max(1,Math.min(2500,Number(a.atk)||1));
    const critDmg=Math.max(100,Math.min(350,Number(a.critDmg)||180));
    const maxHit=Math.max(500,Math.min(250000,Math.ceil(atk*40+critDmg*25+10000)));
    const requested=finite(m.amount,0,maxHit,0);
    if(!(requested>0))return;

    const before=Math.max(0,Number(st.hp)||0);
    const damage=Math.min(before,requested);
    st.hp=Math.max(0,before-damage);
    st.updatedAt=now;
    if(!st.damageByPid||typeof st.damageByPid!=='object')st.damageByPid={};
    if(!st.telegramByPid||typeof st.telegramByPid!=='object')st.telegramByPid={};
    if(!st.nameByPid||typeof st.nameByPid!=='object')st.nameByPid={};
    const pid=String(a.pid||'');
    st.damageByPid[pid]=Math.round((Math.max(0,Number(st.damageByPid[pid])||0)+damage)*100)/100;
    st.telegramByPid[pid]=String(a.telegramId||'');
    st.nameByPid[pid]=cleanName(a.name||'Игрок');
    a.lastClanBossSeq=seq;
    ws.serializeAttachment(a);

    let defeated=false;
    if(st.hp<=0){
      defeated=true;
      st.hp=0;st.status='cooldown';st.defeatedAt=now;st.respawnAt=now+clanBossRespawnMs();st.qaMode=CLAN_BOSS_QA_TEST_OPEN;
    }
    await this.clanBossPersist(st);
    await this.broadcastClanBossState(st,room,now);

    if(defeated){
      this.clanBossEnsureRewards(st,now);
      await this.clanBossPersist(st);
      await this.clanBossRecordDefeat(st,a,now);
      for(const peer of this.roomSockets(room)){
        const pa=attOf(peer);
        if(String(pa.clanId||'')!==String(st.clanId||''))continue;
        await this.sendClanBossReward(peer,pa,st,now);
      }
      this.roomBroadcast(room,{
        type:'clan-boss-defeated',room,bossId:String(st.bossId||''),
        cooldownUntil:Number(st.respawnAt)||0,
        bossState:this.clanBossPublicState(st,room,a,now),ts:now
      },null);
    }
  }

  dungeonReservations() {
    if (!this._dungeonReservations) this._dungeonReservations = new Map();
    return this._dungeonReservations;
  }

  partyPids(partyId) {
    partyId = String(partyId || '');
    if (!partyId) return [];
    const ids = new Set();
    for (const ws of this.sockets()) {
      const a = attOf(ws);
      if (String(a.partyId || '') === partyId && a.pid) ids.add(String(a.pid));
    }
    return [...ids];
  }

  roomPidSet(room) {
    const ids = new Set();
    for (const ws of this.roomSockets(room)) {
      const a = attOf(ws);
      if (a.pid) ids.add(String(a.pid));
    }
    return ids;
  }

  pidInRoom(pid, room) {
    pid = String(pid || '');
    if (!pid) return false;
    for (const ws of this.roomSockets(room)) if (String(attOf(ws).pid || '') === pid) return true;
    return false;
  }

  clearDungeonRoomState(room) {
    room = cleanRoom(room);
    const d = dungeonInfo(room);
    if (!d || !d.instance) return;
    const prefix = room + '|';
    const { health, dead } = this.mobStores();
    for (const key of [...health.keys()]) if (String(key).startsWith(prefix)) health.delete(key);
    for (const key of [...dead.keys()]) if (String(key).startsWith(prefix)) dead.delete(key);
    this.forgetMobRoom(room);
  }

  roomHasReservation(room, now = Date.now()) {
    room = cleanRoom(room);
    for (const r of this.dungeonReservations().values()) {
      if (r && r.room === room && Number(r.expiresAt || 0) > now) return true;
    }
    return false;
  }

  maybeCleanupDungeon(room, now = Date.now()) {
    room = cleanRoom(room);
    const d = dungeonInfo(room);
    if (!d || !d.instance) return;
    if (this.countRoom(room) > 0 || this.roomHasReservation(room, now)) return;
    this.clearDungeonRoomState(room);
  }

  pruneDungeonReservations(now = Date.now()) {
    const map = this.dungeonReservations();
    for (const [key, r] of [...map.entries()]) {
      if (!r || !r.partyId || !r.room) {
        map.delete(key);
        continue;
      }
      const pids = this.partyPids(r.partyId);
      if (!pids.length) {
        map.delete(key);
        this.maybeCleanupDungeon(r.room, now);
        continue;
      }
      r.pids = new Set(pids);
      const inside = pids.some((pid) => this.pidInRoom(pid, r.room));
      if (inside) r.expiresAt = now + DUNGEON_RESERVE_MS;
      if (!inside && Number(r.expiresAt || 0) <= now) {
        map.delete(key);
        this.maybeCleanupDungeon(r.room, now);
      }
    }
  }

  reservedSlots(room, exceptKey = '', now = Date.now()) {
    room = cleanRoom(room);
    const occupied = this.roomPidSet(room);
    const partyNeeds = new Map();

    for (const [key, r] of this.dungeonReservations()) {
      if (key === exceptKey || !r || r.room !== room || Number(r.expiresAt || 0) <= now) continue;
      const partyId = String(r.partyId || '');
      if (!partyId) continue;
      partyNeeds.set(partyId, r.pids instanceof Set ? new Set(r.pids) : new Set(r.pids || []));
    }

    // An active party member inside an instance implicitly reserves seats for the
    // rest of the live party. This survives Durable Object hibernation because
    // partyId lives in the WebSocket attachment, not only in memory.
    for (const ws of this.roomSockets(room)) {
      const a = attOf(ws);
      const partyId = String(a.partyId || '');
      if (!partyId || exceptKey.endsWith('|' + partyId)) continue;
      if (!partyNeeds.has(partyId)) partyNeeds.set(partyId, new Set(this.partyPids(partyId)));
    }

    let count = 0;
    for (const pids of partyNeeds.values()) {
      for (const pid of pids) if (!occupied.has(String(pid))) count++;
    }
    return count;
  }

  candidateDungeonRooms(base) {
    const d = dungeonInfo(base);
    if (!d) return [];
    const out = new Set();
    const idx = this.ensureRoomIndex();
    for (const room of idx.keys()) {
      const x = dungeonInfo(room);
      if (x && x.instance && x.base === d.base) out.add(x.room);
    }
    for (const r of this.dungeonReservations().values()) {
      const x = r && dungeonInfo(r.room);
      if (x && x.instance && x.base === d.base) out.add(x.room);
    }
    return [...out];
  }

  moveSocketRoom(ws, a, targetRoom, now = Date.now()) {
    targetRoom = cleanRoom(targetRoom);
    const oldRoom = cleanRoom(a.room);
    if (oldRoom !== targetRoom) {
      this.roomBroadcast(oldRoom, { type: 'leave', id: a.pid, room: oldRoom, ts: now }, ws);
      this.indexMove(ws, oldRoom, targetRoom);
      a.room = targetRoom;
      a.lastSeenAt = now;
      ws.serializeAttachment(a);
      this.roomBroadcast(targetRoom, { type: 'join', player: packetFromAtt(a), room: targetRoom, ts: now }, ws);
      this.maybeCleanupDungeon(oldRoom, now);
    } else {
      a.room = targetRoom;
      a.lastSeenAt = now;
      this.indexAdd(ws, targetRoom);
      ws.serializeAttachment(a);
    }
    return targetRoom;
  }

  assignDungeon(ws, a, requested, now = Date.now()) {
    const info = dungeonInfo(requested);
    if (!info) return cleanRoom(a.room);
    const base = info.base;
    this.pruneDungeonReservations(now);

    const partyId = String(a.partyId || '');
    const ownPid = String(a.pid || '');
    const pids = partyId ? this.partyPids(partyId) : [ownPid];
    if (ownPid && !pids.includes(ownPid)) pids.push(ownPid);
    const unit = [...new Set(pids.filter(Boolean))];
    const resKey = partyId ? (base + '|' + partyId) : '';
    const reservations = this.dungeonReservations();
    let reservation = resKey ? reservations.get(resKey) : null;
    if (reservation) {
      reservation.pids = new Set(unit);
      reservation.expiresAt = now + DUNGEON_RESERVE_MS;
    }

    const current = dungeonInfo(a.room);
    let target = '';
    const canFit = (room) => {
      const occupied = this.roomPidSet(room);
      const otherReserved = this.reservedSlots(room, resKey, now);
      let missing = 0;
      for (const pid of unit) if (!occupied.has(pid)) missing++;
      return occupied.size + otherReserved + missing <= DUNGEON_CAPACITY;
    };

    if (reservation && dungeonInfo(reservation.room)?.base === base && canFit(reservation.room)) {
      target = reservation.room;
    } else if (!partyId && current && current.instance && current.base === base && this.countRoom(current.room) <= DUNGEON_CAPACITY) {
      target = current.room;
    }

    if (!target) {
      const rooms = this.candidateDungeonRooms(base);
      const ranked = [];
      for (const room of rooms) {
        if (!canFit(room)) continue;
        const occupied = this.roomPidSet(room);
        const otherReserved = this.reservedSlots(room, resKey, now);
        let partyInside = 0;
        for (const pid of unit) if (occupied.has(pid)) partyInside++;
        const x = dungeonInfo(room);
        ranked.push({ room, partyInside, load: occupied.size + otherReserved, instance: x ? x.instance : 999999 });
      }
      ranked.sort((x, y) => (y.partyInside - x.partyInside) || (y.load - x.load) || (x.instance - y.instance));
      if (ranked.length) target = ranked[0].room;
    }

    if (!target) {
      const used = new Set(this.candidateDungeonRooms(base).map((room) => dungeonInfo(room)?.instance).filter(Boolean));
      let instance = 1;
      while (used.has(instance)) instance++;
      target = dungeonRoom(base, instance);
    }

    if (partyId) {
      reservations.set(resKey, {
        base,
        room: target,
        partyId,
        pids: new Set(unit),
        expiresAt: now + DUNGEON_RESERVE_MS,
      });

      // If a party was created or enlarged after somebody already entered this
      // dungeon, move the members who are already in the same dungeon base to
      // the newly selected instance. Members who are still in town are not
      // teleported; their seats remain reserved until they enter normally.
      for (const peer of this.sockets()) {
        if (peer === ws) continue;
        const pa = attOf(peer);
        if (String(pa.partyId || '') !== partyId) continue;
        const pd = dungeonInfo(pa.room);
        if (!pd || !pd.instance || pd.base !== base || pd.room === target) continue;
        this.moveSocketRoom(peer, pa, target, now);
        const ti = dungeonInfo(target);
        wsJson(peer, {
          type: 'room-assigned',
          base,
          room: target,
          instance: ti ? ti.instance : 1,
          capacity: DUNGEON_CAPACITY,
          roomCount: this.countRoom(target),
          partyReserved: unit.length,
          migrated: true,
          ts: now,
        });
        this.sendRoomSnapshot(peer, target);
      }
    }

    this.moveSocketRoom(ws, a, target, now);
    const t = dungeonInfo(target);
    wsJson(ws, {
      type: 'room-assigned',
      base,
      room: target,
      instance: t ? t.instance : 1,
      capacity: DUNGEON_CAPACITY,
      roomCount: this.countRoom(target),
      partyReserved: partyId ? unit.length : 1,
      ts: now,
    });
    this.sendRoomSnapshot(ws, target);
    if (partyId) this.sendPartyState(partyId);
    return target;
  }

  mobStores() {
    if (!this._mobHealth) this._mobHealth = new Map();
    if (!this._mobDead) this._mobDead = new Map();
    if (!this._mobEvents) this._mobEvents = new Map();
    return { health: this._mobHealth, dead: this._mobDead, events: this._mobEvents };
  }

  mobCompound(room, key) {
    return cleanRoom(room) + '|' + cleanMobKey(key);
  }

  mobStorageKey(room) {
    return 'mob-authority:' + cleanRoom(room);
  }

  mobLoadedRooms() {
    if (!this._mobLoadedRooms) this._mobLoadedRooms = new Set();
    return this._mobLoadedRooms;
  }

  async ensureMobRoomLoaded(room) {
    room = cleanRoom(room);
    if (!mobAuthorityRoom(room)) return;
    const loaded = this.mobLoadedRooms();
    if (loaded.has(room)) return;
    loaded.add(room);

    let saved = null;
    try { saved = await this.ctx.storage.get(this.mobStorageKey(room)); } catch (_) { saved = null; }
    if (!saved || typeof saved !== 'object' || Number(saved.version || 0) < 2 || !saved.mobs) return;

    const { health, dead } = this.mobStores();
    const now = Date.now();
    for (const [key, row] of Object.entries(saved.mobs || {})) {
      const cleanKey = cleanMobKey(key);
      if (!cleanKey || !row || typeof row !== 'object') continue;
      const mhp = Math.max(1, Number(row.mhp) || 1);
      const deadUntil = Math.max(0, Number(row.deadUntil) || 0);
      const hp = deadUntil > now ? 0 : Math.max(1, Math.min(mhp, Number(row.hp) || mhp));
      const ck = this.mobCompound(room, cleanKey);
      health.set(ck, {
        hp, mhp,
        updatedAt: Math.max(0, Number(row.updatedAt) || now),
        killer: String(row.killer || ''),
        party: String(row.party || ''),
        x: row.x != null && Number.isFinite(Number(row.x)) ? Number(row.x) : undefined,
        y: row.y != null && Number.isFinite(Number(row.y)) ? Number(row.y) : undefined,
        hx: row.hx != null && Number.isFinite(Number(row.hx)) ? Number(row.hx) : undefined,
        hy: row.hy != null && Number.isFinite(Number(row.hy)) ? Number(row.hy) : undefined,
        sp: Math.max(0.1, Number(row.sp) || 1),
        sz: Math.max(8, Number(row.sz) || 30),
        dmg: Math.max(1, Number(row.dmg) || 1),
        baseMhp: Math.max(1, Number(row.baseMhp) || Number(row.mhp) || 1),
        baseDmg: Math.max(1, Number(row.baseDmg) || Number(row.dmg) || 1),
        baseSz: Math.max(8, Number(row.baseSz) || Number(row.sz) || 30),
        elite: !!row.elite,
        eliteWindowKey: String(row.eliteWindowKey || ''),
        eliteExpiresAt: Math.max(0, Number(row.eliteExpiresAt) || 0),
        eliteMode: String(row.eliteMode || ''),
        eliteDefBonus: Math.max(0, Number(row.eliteDefBonus) || 0),
        eliteKilledKey: String(row.eliteKilledKey || ''),
        nextAttackAt: Math.max(0, Number(row.nextAttackAt) || 0),
        nextSpecialAt: Math.max(0, Number(row.nextSpecialAt) || 0),
        nextProjectileAt: Math.max(0, Number(row.nextProjectileAt) || 0),
        nextAoeAt: Math.max(0, Number(row.nextAoeAt) || 0),
        specialImpactAt: Math.max(0, Number(row.specialImpactAt) || 0),
        specialKind: String(row.specialKind || ''),
        resetAt: Math.max(0, Number(row.resetAt) || 0),
        aggro: !!row.aggro,
        target: String(row.target || ''),
        dir: Number.isFinite(Number(row.dir)) ? Number(row.dir) : 1,
        moving: !!row.moving,
        rootUntil: Math.max(0, Number(row.rootUntil) || 0),
        slowUntil: Math.max(0, Number(row.slowUntil) || 0),
        slowMul: Math.max(.25, Math.min(.95, Number(row.slowMul) || 1)),
        tauntUntil: Math.max(0, Number(row.tauntUntil) || 0),
        tauntPid: String(row.tauntPid || ''),
        positioned: !!row.positioned && row.x != null && row.y != null && row.hx != null && row.hy != null,
      });
      if (deadUntil > now) {
        dead.set(ck, {
          room, key: cleanKey, at: deadUntil,
          killer: String(row.killer || ''),
          party: String(row.party || ''),
        });
      }
    }
  }

  async persistMobRoom(room) {
    room = cleanRoom(room);
    if (!mobAuthorityRoom(room)) return;
    const { health, dead } = this.mobStores();
    const prefix = room + '|';
    const mobs = {};
    for (const [ck, rec] of health.entries()) {
      if (!String(ck).startsWith(prefix) || !rec) continue;
      const key = String(ck).slice(prefix.length);
      const d = dead.get(ck);
      mobs[key] = {
        hp: Math.max(0, Number(rec.hp) || 0),
        mhp: Math.max(1, Number(rec.mhp) || 1),
        updatedAt: Math.max(0, Number(rec.updatedAt) || Date.now()),
        deadUntil: d ? Math.max(0, Number(d.at) || 0) : 0,
        killer: d ? String(d.killer || '') : String(rec.killer || ''),
        party: d ? String(d.party || '') : String(rec.party || ''),
        x: Number.isFinite(Number(rec.x)) ? Number(rec.x) : null,
        y: Number.isFinite(Number(rec.y)) ? Number(rec.y) : null,
        hx: Number.isFinite(Number(rec.hx)) ? Number(rec.hx) : null,
        hy: Number.isFinite(Number(rec.hy)) ? Number(rec.hy) : null,
        sp: Math.max(0.1, Number(rec.sp) || 1),
        sz: Math.max(8, Number(rec.sz) || 30),
        dmg: Math.max(1, Number(rec.dmg) || 1),
        baseMhp: Math.max(1, Number(rec.baseMhp) || Number(rec.mhp) || 1),
        baseDmg: Math.max(1, Number(rec.baseDmg) || Number(rec.dmg) || 1),
        baseSz: Math.max(8, Number(rec.baseSz) || Number(rec.sz) || 30),
        elite: !!rec.elite,
        eliteWindowKey: String(rec.eliteWindowKey || ''),
        eliteExpiresAt: Math.max(0, Number(rec.eliteExpiresAt) || 0),
        eliteMode: String(rec.eliteMode || ''),
        eliteDefBonus: Math.max(0, Number(rec.eliteDefBonus) || 0),
        eliteKilledKey: String(rec.eliteKilledKey || ''),
        nextAttackAt: Math.max(0, Number(rec.nextAttackAt) || 0),
        nextSpecialAt: Math.max(0, Number(rec.nextSpecialAt) || 0),
        nextProjectileAt: Math.max(0, Number(rec.nextProjectileAt) || 0),
        nextAoeAt: Math.max(0, Number(rec.nextAoeAt) || 0),
        specialImpactAt: Math.max(0, Number(rec.specialImpactAt) || 0),
        specialKind: String(rec.specialKind || ''),
        resetAt: Math.max(0, Number(rec.resetAt) || 0),
        aggro: !!rec.aggro,
        target: String(rec.target || ''),
        dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1,
        moving: !!rec.moving,
        rootUntil: Math.max(0, Number(rec.rootUntil) || 0),
        slowUntil: Math.max(0, Number(rec.slowUntil) || 0),
        slowMul: Math.max(.25, Math.min(.95, Number(rec.slowMul) || 1)),
        tauntUntil: Math.max(0, Number(rec.tauntUntil) || 0),
        tauntPid: String(rec.tauntPid || ''),
        positioned: !!rec.positioned,
      };
    }
    try { await this.ctx.storage.put(this.mobStorageKey(room), { version: 2, mobs }); } catch (_) {}
  }

  forgetMobRoom(room) {
    room = cleanRoom(room);
    this.mobLoadedRooms().delete(room);
    const p = this.ctx.storage.delete(this.mobStorageKey(room));
    try { if (this.ctx && typeof this.ctx.waitUntil === 'function') this.ctx.waitUntil(p); } catch (_) {}
  }

  pruneMobStores(now = Date.now()) {
    const { events } = this.mobStores();
    for (const [id, at] of events) if (now - Number(at || 0) > 15000) events.delete(id);
  }

  processMobRespawns(room, now = Date.now()) {
    room = cleanRoom(room);
    if (!mobAuthorityRoom(room)) return false;
    this.pruneMobStores(now);
    const { health, dead } = this.mobStores();
    let changed = false;
    for (const [ck, d] of [...dead.entries()]) {
      if (!d || d.room !== room) continue;
      // A Titan tombstone from the normal daily cycle can survive a Worker
      // deployment in Durable Object storage. During QA, collapse only those
      // old long tombstones immediately; fresh QA kills still stay dead for
      // WORLD_BOSS_QA_RESPAWN_MS so death/loot UI can complete once.
      if (WORLD_BOSS_QA_TEST_OPEN && room === 'worldboss' && d.key === 'wtitan' &&
          Number(d.at) - now > 30_000) {
        d.at = now;
        dead.set(ck, d);
        changed = true;
      }
      if (Number(d.at) > now) continue;
      const rec = health.get(ck);
      if (!rec) { dead.delete(ck); changed = true; continue; }
      if(rec.elite&&(rec.eliteKilledKey===rec.eliteWindowKey||Number(rec.eliteExpiresAt||0)<=now)){
        this.demoteServerElite(rec,false);
      }
      rec.hp = Math.max(1, Number(rec.mhp) || 1);
      rec.updatedAt = now;
      rec.killer = '';
      rec.party = '';
      if (Number.isFinite(Number(rec.hx))) rec.x = Number(rec.hx);
      if (Number.isFinite(Number(rec.hy))) rec.y = Number(rec.hy);
      rec.aggro = false;
      rec.target = '';
      rec.moving = false;
      rec.rootUntil = 0;
      rec.slowUntil = 0;
      rec.slowMul = 1;
      rec.tauntUntil = 0;
      rec.tauntPid = '';
      rec.nextAttackAt = 0;
      rec.nextSpecialAt = 0;
      rec.nextProjectileAt = 0;
      rec.nextAoeAt = 0;
      rec.specialImpactAt = 0;
      rec.specialKind = '';
      health.set(ck, rec);
      dead.delete(ck);
      changed = true;
      this.roomBroadcast(room, {
        type: 'mob-authority', room, key: d.key,
        hp: rec.hp, mhp: rec.mhp, respawnAt: 0,
        killer: '', party: '',
        x: rec.x, y: rec.y, aggro: false, dir: rec.dir, moving: false,
        sz: rec.sz,elite:!!rec.elite,eliteWindowKey:String(rec.eliteWindowKey||''),
        eliteExpiresAt:Math.max(0,Number(rec.eliteExpiresAt)||0),eliteMode:String(rec.eliteMode||''),
        eliteDefBonus:Math.max(0,Number(rec.eliteDefBonus)||0),ts: now,
      }, null);
    }
    return changed;
  }

  sendMobAuthoritySnapshot(ws, room, now = Date.now()) {
    room = cleanRoom(room);
    if (!mobAuthorityRoom(room)) return;
    this.processMobRespawns(room, now);
    const { health, dead } = this.mobStores();
    const prefix = room + '|';
    const rows = [];
    for (const [ck, rec] of health.entries()) {
      if (!String(ck).startsWith(prefix) || !rec) continue;
      const key = String(ck).slice(prefix.length);
      const d = dead.get(ck);
      rows.push([
        key,
        Math.max(0, Number(rec.hp) || 0),
        Math.max(1, Number(rec.mhp) || 1),
        d && Number(d.at) > now ? Number(d.at) : 0,
        d ? String(d.killer || '') : '',
        d ? String(d.party || '') : '',
        Number.isFinite(Number(rec.x)) ? Math.round(Number(rec.x) * 10) / 10 : null,
        Number.isFinite(Number(rec.y)) ? Math.round(Number(rec.y) * 10) / 10 : null,
        rec.aggro ? 1 : 0,
        Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1,
        rec.moving ? 1 : 0,
        String(rec.target || ''),
        Math.max(8, Number(rec.sz) || 30),
        rec.elite?1:0,
        String(rec.eliteWindowKey||''),
        Math.max(0,Number(rec.eliteExpiresAt)||0),
        String(rec.eliteMode||''),
        Math.max(0,Number(rec.eliteDefBonus)||0),
      ]);
    }

    const chunkSize = 72;
    if (!rows.length) {
      wsJson(ws, { type: 'mob-authority-snapshot', room, rows: [], reset: true, done: true, ts: now });
      return;
    }
    for (let i = 0; i < rows.length; i += chunkSize) {
      wsJson(ws, {
        type: 'mob-authority-snapshot',
        room,
        rows: rows.slice(i, i + chunkSize),
        reset: i === 0,
        done: i + chunkSize >= rows.length,
        ts: now,
      });
    }
  }

  mobAiTickTimes() {
    if (!this._mobAiTickTimes) this._mobAiTickTimes = new Map();
    return this._mobAiTickTimes;
  }

  mobAiLoops() {
    if (!this._mobAiLoops) this._mobAiLoops = new Set();
    return this._mobAiLoops;
  }

  roomHasAggroMob(room) {
    room = cleanRoom(room);
    const { health, dead } = this.mobStores();
    const prefix = room + '|';
    const now = Date.now();
    for (const [ck, rec] of health.entries()) {
      if (!String(ck).startsWith(prefix) || !rec || !(Number(rec.hp) > 0) || (!rec.aggro && !rec.moving)) continue;
      const d = dead.get(ck);
      if (!d || Number(d.at) <= now) return true;
    }
    return false;
  }

  ensureMobAiLoop(room) {
    room = cleanRoom(room);
    if (!mobAuthorityRoom(room)) return;
    const loops = this.mobAiLoops();
    if (loops.has(room)) return;
    loops.add(room);
    const step = async () => {
      try {
        if (this.countRoom(room) <= 0) { loops.delete(room); return; }
        await this.ensureMobRoomLoaded(room);
        const now = Date.now();
        if (this.processMobRespawns(room, now)) await this.persistMobRoom(room);
        this.tickMobAI(room, now);
        await this.maybePersistMobMovement(room, now);
        if (!this.roomHasAggroMob(room)) { loops.delete(room); return; }
        setTimeout(step, 100);
      } catch (_) {
        loops.delete(room);
      }
    };
    setTimeout(step, 0);
  }

  mobPositionBroadcastTimes() {
    if (!this._mobPositionBroadcastTimes) this._mobPositionBroadcastTimes = new Map();
    return this._mobPositionBroadcastTimes;
  }

  mobPersistTimes() {
    if (!this._mobPersistTimes) this._mobPersistTimes = new Map();
    return this._mobPersistTimes;
  }

  eliteSyncTimes() {
    if (!this._eliteSyncTimes) this._eliteSyncTimes = new Map();
    return this._eliteSyncTimes;
  }

  eliteWindow(now = Date.now()) {
    // TEMP LIVE TEST: keep the server-owned elite active continuously so QA can
    // run through 1–20, 21–40 and 41–60 immediately. One elite per dungeon room
    // per 30-minute test key; killing it does not respawn another until the key changes.
    const testBucket=Math.floor(now/(30*60*1000));
    const testEnd=(testBucket+1)*(30*60*1000);
    return{key:'elite-test-'+testBucket,active:true,end:testEnd};
  }

  eliteHash(str) {
    let h=2166136261>>>0;
    str=String(str||'');
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
    return h>>>0;
  }

  eliteModeForRoom(room) {
    room=cleanRoom(room);
    if(room.startsWith('dungeon-41-60'))return'41-60';
    if(room.startsWith('dungeon-21-40'))return'21+';
    if(room.startsWith('dungeon-1-20'))return'1-20';
    return'';
  }

  demoteServerElite(rec, refill) {
    if(!rec)return false;
    const was=!!rec.elite;
    const baseMhp=Math.max(1,Number(rec.baseMhp)||Number(rec.mhp)||1);
    const baseDmg=Math.max(1,Number(rec.baseDmg)||Number(rec.dmg)||1);
    const baseSz=Math.max(8,Number(rec.baseSz)||Number(rec.sz)||30);
    rec.elite=false;rec.eliteWindowKey='';rec.eliteExpiresAt=0;rec.eliteMode='';rec.eliteDefBonus=0;
    rec.mhp=baseMhp;rec.dmg=baseDmg;rec.sz=baseSz;
    if(refill&&Number(rec.hp)>0)rec.hp=baseMhp;
    else if(Number(rec.hp)>0)rec.hp=Math.max(1,Math.min(baseMhp,Number(rec.hp)||baseMhp));
    return was;
  }

  mobAuthorityPayload(room,key,rec,now=Date.now()) {
    return{
      type:'mob-authority',room,key,
      hp:Math.max(0,Number(rec.hp)||0),mhp:Math.max(1,Number(rec.mhp)||1),
      respawnAt:0,killer:String(rec.killer||''),party:String(rec.party||''),
      x:rec.x,y:rec.y,aggro:!!rec.aggro,dir:Number.isFinite(Number(rec.dir))?Number(rec.dir):1,
      moving:!!rec.moving,target:String(rec.target||''),sz:Math.max(8,Number(rec.sz)||30),
      elite:!!rec.elite,eliteWindowKey:String(rec.eliteWindowKey||''),
      eliteExpiresAt:Math.max(0,Number(rec.eliteExpiresAt)||0),
      eliteMode:String(rec.eliteMode||''),eliteDefBonus:Math.max(0,Number(rec.eliteDefBonus)||0),
      ts:now
    };
  }

  syncServerElite(room, now=Date.now(), broadcast=true) {
    room=cleanRoom(room);
    const mode=this.eliteModeForRoom(room);
    if(!mode)return false;
    const {health}=this.mobStores(),prefix=room+'|',rows=[];
    for(const [ck,rec] of health.entries()){
      if(!String(ck).startsWith(prefix)||!rec)continue;
      const key=String(ck).slice(prefix.length);
      if(!/^s\d{1,4}$/.test(key)||!Number.isFinite(Number(rec.roomIndex))||Number(rec.roomIndex)<0)continue;
      rows.push({key,rec,roomIndex:Number(rec.roomIndex)});
    }
    if(!rows.length)return false;

    const w=this.eliteWindow(now),rooms=[...new Set(rows.map(x=>x.roomIndex))].sort((a,b)=>a-b);
    let selected=null;
    if(w.active&&rooms.length){
      const ri=rooms[this.eliteHash(w.key+'|'+mode+'|room')%rooms.length];
      const cand=rows.filter(x=>x.roomIndex===ri).sort((a,b)=>Number(a.key.slice(1))-Number(b.key.slice(1)));
      if(cand.length)selected=cand[this.eliteHash(w.key+'|'+mode+'|mob|'+ri)%cand.length];
    }

    let changed=false;
    for(const item of rows){
      const rec=item.rec;
      const should=!!(selected&&item.key===selected.key&&rec.eliteKilledKey!==w.key);
      if(!should&&rec.elite){
        if(this.demoteServerElite(rec,true)){rec.updatedAt=now;changed=true;if(broadcast)this.roomBroadcast(room,this.mobAuthorityPayload(room,item.key,rec,now),null)}
      }
    }

    if(selected&&selected.rec.eliteKilledKey!==w.key){
      const rec=selected.rec;
      const same=rec.elite&&String(rec.eliteWindowKey||'')===w.key;
      const baseMhp=Math.max(1,Number(rec.baseMhp)||Number(rec.mhp)||1);
      const baseDmg=Math.max(1,Number(rec.baseDmg)||Number(rec.dmg)||1);
      const baseSz=Math.max(8,Number(rec.baseSz)||Number(rec.sz)||30);
      const hpMul=(mode==='1-20')?7:8;
      const dmgBonus=mode==='41-60'?42:(mode==='21+'?14:12);
      const defBonus=mode==='41-60'?9:(mode==='21+'?3:2);
      if(!same){
        const ratio=Number(rec.hp)>0?Math.max(.05,Math.min(1,Number(rec.hp)/Math.max(1,Number(rec.mhp)||baseMhp))):0;
        rec.elite=true;rec.eliteWindowKey=w.key;rec.eliteMode=mode;rec.eliteExpiresAt=w.end;rec.eliteDefBonus=defBonus;
        rec.mhp=Math.round(baseMhp*hpMul);rec.dmg=baseDmg+dmgBonus;rec.sz=baseSz;
        if(ratio>0)rec.hp=Math.max(1,Math.round(rec.mhp*ratio));
        rec.updatedAt=now;changed=true;
        if(broadcast)this.roomBroadcast(room,this.mobAuthorityPayload(room,selected.key,rec,now),null);
      }else{
        rec.eliteExpiresAt=w.end;
      }
    }
    return changed;
  }

  maybeSyncServerElite(room,now=Date.now()) {
    room=cleanRoom(room);
    if(!this.eliteModeForRoom(room))return false;
    const times=this.eliteSyncTimes(),prev=Number(times.get(room)||0);
    if(now-prev<1500)return false;
    times.set(room,now);
    return this.syncServerElite(room,now,true);
  }

  bossDelay(seed, now, base, span) {
    let h = Math.floor(now / 1000) | 0;
    const t = String(seed || '');
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) | 0;
    h = Math.abs(h);
    return base + (span > 0 ? (h % span) : 0);
  }

  tickBossSpecial(room, now, rec, mobKey, players, x, y) {
    if (!rec || !(Number(rec.hp) > 0) || !players.length) return false;
    const nearest = () => {
      let best = null, bd = Infinity;
      for (const p of players) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = p; }
      }
      return { p: best, d: bd };
    };
    const n = nearest();

    if (mobKey === 'p20' || mobKey === 'b40') {
      if (!n.p || n.d > 620) return false;
      const phoenix = mobKey === 'p20';
      const kind = phoenix ? 'phoenix-aoe' : 'lord40-aoe';
      const radius = phoenix ? 205 : 180;
      const dmg = phoenix ? 36 : 26;
      if (phoenix) {
        if (!(Number(rec.nextProjectileAt) > 0)) rec.nextProjectileAt = now + 2500;
        if (now >= Number(rec.nextProjectileAt || 0)) {
          rec.nextProjectileAt = (now - rec.nextProjectileAt > 7500) ? now + 2500 : rec.nextProjectileAt + 2500;
          this.roomBroadcast(room, {
            type: 'boss-special', room, key: mobKey, kind: 'phoenix-fire', phase: 'launch',
            target: n.p.pid, tx: Math.round(n.p.x * 10) / 10, ty: Math.round(n.p.y * 10) / 10,
            x, y, dmg: 85, damageType: 'magic', dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
          }, null);
        }
      }
      if (!(Number(rec.nextSpecialAt) > 0)) {
        rec.nextSpecialAt = now + this.bossDelay(mobKey, now, 9000, 4001);
      }
      if (!rec.specialImpactAt && now >= Number(rec.nextSpecialAt || 0)) {
        rec.specialKind = kind;
        rec.specialImpactAt = now + 700;
        rec.nextSpecialAt = now + this.bossDelay(mobKey, now + 701, phoenix ? 10000 : 9000, 4001);
        this.roomBroadcast(room, {
          type: 'boss-special', room, key: mobKey, kind, phase: 'telegraph',
          x, y, radius, dmg, damageType: 'magic',
          impactAt: rec.specialImpactAt, dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
        }, null);
      }
      if (rec.specialImpactAt && now >= Number(rec.specialImpactAt)) {
        const targets = players.filter(p => Math.hypot(p.x - x, p.y - y) <= radius).map(p => p.pid);
        this.roomBroadcast(room, {
          type: 'boss-special', room, key: mobKey, kind, phase: 'impact',
          x, y, radius, dmg, damageType: 'magic', targets,
          dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
        }, null);
        rec.specialImpactAt = 0;
        rec.specialKind = '';
      }
      return true;
    }

    if (mobKey === 'b60') {
      if (!n.p || n.d > 560) return false;
      const radius = 235;
      const dmg = 125;
      if (!(Number(rec.nextAoeAt) > 0)) {
        rec.nextAoeAt = now + this.bossDelay('b60-aoe', now, 10500, 4501);
      }
      if (!rec.specialImpactAt && now >= Number(rec.nextAoeAt || 0)) {
        rec.specialKind = 'dragon60-aoe';
        rec.specialImpactAt = now + 900;
        rec.nextAoeAt = now + this.bossDelay('b60-aoe', now + 901, 10500, 4501);
        // The special replaces roughly one normal claw attack instead of simply
        // adding free DPS on top of the existing boss balance.
        rec.nextAttackAt = Math.max(Number(rec.nextAttackAt) || 0, rec.specialImpactAt + 450);
        this.roomBroadcast(room, {
          type: 'boss-special', room, key: mobKey, kind: 'dragon60-aoe', phase: 'telegraph',
          x, y, radius, dmg, damageType: 'magic',
          impactAt: rec.specialImpactAt,
          dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
        }, null);
      }
      if (rec.specialImpactAt && rec.specialKind === 'dragon60-aoe' && now >= Number(rec.specialImpactAt)) {
        const targets = players.filter(p => Math.hypot(p.x - x, p.y - y) <= radius).map(p => p.pid);
        this.roomBroadcast(room, {
          type: 'boss-special', room, key: mobKey, kind: 'dragon60-aoe', phase: 'impact',
          x, y, radius, dmg, damageType: 'magic', targets,
          dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
        }, null);
        rec.specialImpactAt = 0;
        rec.specialKind = '';
      }
      return true;
    }

    if (mobKey === 'wtitan') {
      if (!n.p || n.d > 2200) return false;
      if (!(Number(rec.nextSpecialAt) > 0)) rec.nextSpecialAt = now + 5000;
      if (now >= Number(rec.nextSpecialAt || 0)) {
        rec.nextSpecialAt = (now - rec.nextSpecialAt > 15000) ? now + 5000 : rec.nextSpecialAt + 5000;
        this.roomBroadcast(room, {
          type: 'boss-special', room, key: mobKey, kind: 'titan-crystal', phase: 'launch',
          target: n.p.pid, tx: Math.round(n.p.x * 10) / 10, ty: Math.round(n.p.y * 10) / 10,
          x, y, dmg: 14, damageType: 'magic', dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
        }, null);
      }
      if (!(Number(rec.nextAoeAt) > 0)) {
        const choices = [7000, 12000, 16000];
        rec.nextAoeAt = now + choices[Math.abs(Math.floor(now / 1000)) % choices.length];
      }
      if (!rec.specialImpactAt && now >= Number(rec.nextAoeAt || 0)) {
        const choices = [7000, 12000, 16000];
        rec.nextAoeAt = now + choices[Math.abs(Math.floor(now / 1000) + 1) % choices.length];
        rec.specialKind = 'titan-aoe';
        rec.specialImpactAt = now + 620;
        this.roomBroadcast(room, {
          type: 'boss-special', room, key: mobKey, kind: 'titan-aoe', phase: 'telegraph',
          x, y, radius: 330, dmg: 22, damageType: 'magic',
          impactAt: rec.specialImpactAt, dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
        }, null);
      }
      if (rec.specialImpactAt && rec.specialKind === 'titan-aoe' && now >= Number(rec.specialImpactAt)) {
        const targets = players.filter(p => Math.hypot(p.x - x, p.y - (y + 8)) <= 330).map(p => p.pid);
        this.roomBroadcast(room, {
          type: 'boss-special', room, key: mobKey, kind: 'titan-aoe', phase: 'impact',
          x, y, radius: 330, dmg: 22, damageType: 'magic', targets,
          dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1, ts: now,
        }, null);
        rec.specialImpactAt = 0;
        rec.specialKind = '';
      }
      return true;
    }
    return false;
  }

  mobFacingDir(dx, dy, prev = 1) {
    const ax = Math.abs(Number(dx) || 0), ay = Math.abs(Number(dy) || 0);
    prev = Math.round(Number(prev));
    if (!(ax + ay > 0.01)) return (prev >= 0 && prev <= 3) ? prev : 1;
    // Exactly the same dominant-axis rule as the old local dungeon AI.
    return ax > ay ? (dx < 0 ? 2 : 3) : (dy < 0 ? 0 : 1);
  }

  tickMobAI(room, now = Date.now()) {
    room = cleanRoom(room);
    if (!mobAuthorityRoom(room)) return false;

    const ticks = this.mobAiTickTimes();
    const prev = Number(ticks.get(room) || 0);
    if (prev && now - prev < 90) return false;
    const dt = Math.max(40, Math.min(180, prev ? now - prev : 100));
    ticks.set(room, now);

    const { health, dead } = this.mobStores();
    const prefix = room + '|';
    const players = [];
    for (const ws of this.roomSockets(room)) {
      const p = attOf(ws);
      if (!p.pid || !(Number(p.h) > 0)) continue;
      if (!Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) continue;
      if (Number(p.hiddenUntil) > now) continue;
      players.push({ pid: String(p.pid), x: Number(p.x), y: Number(p.y) });
    }

    const byPid = new Map(players.map((p) => [p.pid, p]));
    const rows = [];
    for (const [ck, rec] of health.entries()) {
      if (!String(ck).startsWith(prefix) || !rec || !(Number(rec.hp) > 0)) continue;
      const drec = dead.get(ck);
      if (drec && Number(drec.at) > now) continue;
      if (![rec.x, rec.y, rec.hx, rec.hy].every((v) => Number.isFinite(Number(v)))) continue;

      let x = Number(rec.x), y = Number(rec.y);
      const hx = Number(rec.hx), hy = Number(rec.hy);
      const sp = Math.max(0.1, Number(rec.sp) || 1);
      if (Number(rec.rootUntil) > 0 && now >= Number(rec.rootUntil)) rec.rootUntil = 0;
      if (Number(rec.slowUntil) > 0 && now >= Number(rec.slowUntil)) {
        rec.slowUntil = 0;
        rec.slowMul = 1;
      }
      const controlMoveMul = Number(rec.rootUntil) > now
        ? 0
        : (Number(rec.slowUntil) > now ? Math.max(.25, Math.min(1, Number(rec.slowMul) || 1)) : 1);
      let effectiveSp = sp * controlMoveMul;
      const sz = Math.max(8, Number(rec.sz) || 30);
      const mobKey = String(ck).slice(prefix.length);
      const phoenix = mobKey === 'p20';
      const lord40 = mobKey === 'b40';
      const boss60 = mobKey === 'b60';
      const titan = mobKey === 'wtitan';
      if (boss60 && controlMoveMul > 0) {
        // 780 ms swoop + 320 ms hover, with burst speed adjusted so average
        // pursuit speed stays essentially unchanged.
        const swoopPhase = now % 1100;
        effectiveSp *= swoopPhase < 780 ? 1.41 : 0;
      }
      const isAuthorityBoss = phoenix || lord40 || boss60 || titan;
      const stationaryBoss = phoenix || lord40 || titan;
      const reach = lord40 ? 112 : (phoenix ? 100 : (boss60 ? 112 : (titan ? 0 : (42 + (sz - 30) * 0.35))));
      const normalLevel = Math.max(1, Math.round(Number(rec.lvl) || 1));
      const normalAggroRadius = normalLevel <= 2 ? 90 : (normalLevel <= 4 ? 115 : (normalLevel <= 6 ? 140 : (normalLevel <= 10 ? 170 : 200)));
      const aggroRadius = titan ? 1800 : ((phoenix || lord40) ? 620 : (boss60 ? 420 : normalAggroRadius));
      const reacquireRadius = titan ? 2200 : ((phoenix || lord40) ? 700 : (boss60 ? 520 : 260));
      const attackEvery = lord40 ? 1200 : (phoenix ? 1100 : (boss60 ? 1200 : 850));
      const hasRoomBounds = !isAuthorityBoss &&
        [rec.roomMinX, rec.roomMinY, rec.roomMaxX, rec.roomMaxY].every((v) => Number.isFinite(Number(v))) &&
        Number(rec.roomMaxX) > Number(rec.roomMinX) && Number(rec.roomMaxY) > Number(rec.roomMinY);
      const roomPad = Math.max(10, sz * 0.18);
      const inOwnRoom = (px, py, pad = 0) => !hasRoomBounds || (
        px >= Number(rec.roomMinX) + pad && px <= Number(rec.roomMaxX) - pad &&
        py >= Number(rec.roomMinY) + pad && py <= Number(rec.roomMaxY) - pad
      );
      const clampOwnRoom = (px, py, pad = 0) => ({
        x: hasRoomBounds ? Math.max(Number(rec.roomMinX) + pad, Math.min(Number(rec.roomMaxX) - pad, px)) : px,
        y: hasRoomBounds ? Math.max(Number(rec.roomMinY) + pad, Math.min(Number(rec.roomMaxY) - pad, py)) : py,
      });
      const leash = boss60 ? 420 : (stationaryBoss ? 0 : (hasRoomBounds ? Infinity : 260));
      let target = rec.target ? byPid.get(String(rec.target)) : null;

      if (!isAuthorityBoss && Number(rec.tauntUntil) > 0) {
        if (now < Number(rec.tauntUntil)) {
          const forced = byPid.get(String(rec.tauntPid || ''));
          if (forced) {
            rec.aggro = true;
            rec.target = forced.pid;
            target = forced;
          }
        } else {
          rec.tauntUntil = 0;
          rec.tauntPid = '';
          rec.target = '';
          target = null;
        }
      }

      // Original dungeon behaviour: ordinary mobs aggro when a player passes
      // close to them. The radius is level-scaled (90/115/140/170/200), so only
      // the nearby pack wakes up; hitting a mob still forces aggro immediately.
      if (!rec.aggro && players.length) {
        let best = null, bd = Infinity;
        for (const p of players) {
          if (!isAuthorityBoss && !inOwnRoom(p.x, p.y, 0)) continue;
          const pd = Math.hypot(p.x - x, p.y - y);
          if (pd < bd) { bd = pd; best = p; }
        }
        if (best && bd <= aggroRadius) {
          rec.aggro = true;
          rec.target = best.pid;
          target = best;
        }
      }

      if (rec.aggro && !target && players.length) {
        let best = null, bd = Infinity;
        for (const p of players) {
          if (!isAuthorityBoss && !inOwnRoom(p.x, p.y, 0)) continue;
          const pd = Math.hypot(p.x - x, p.y - y);
          if (pd < bd) { bd = pd; best = p; }
        }
        if (best && (isAuthorityBoss ? bd <= reacquireRadius : true)) {
          target = best;
          rec.target = best.pid;
        }
      }

      this.tickBossSpecial(room, now, rec, mobKey, players, x, y);

      let vx = 0, vy = 0, moving = false;
      if (rec.aggro && target) {
        let chaseX = target.x, chaseY = target.y;
        let edgeChase = false;
        if (!isAuthorityBoss && hasRoomBounds && !inOwnRoom(target.x, target.y, 0)) {
          const edge = clampOwnRoom(target.x, target.y, Math.max(12, sz * 0.22));
          chaseX = edge.x; chaseY = edge.y; edgeChase = true;
        }
        const dx = chaseX - x, dy = chaseY - y, dist = Math.hypot(dx, dy);
        const homeD = Math.hypot(x - hx, y - hy);
        if (isAuthorityBoss && (dist > reacquireRadius || homeD > leash + 20)) {
          rec.aggro = false;
          rec.target = '';
          target = null;
        } else if (edgeChase && dist <= Math.max(14, effectiveSp * 3.2)) {
          // Player left this mob's room: reach the doorway/edge, drop aggro,
          // then the next ticks naturally walk the mob back home.
          rec.aggro = false;
          rec.target = '';
          target = null;
        } else if (dist > (edgeChase ? 10 : reach) && dist > 0.001 && !stationaryBoss) {
          const stop = edgeChase ? 10 : reach;
          const step = Math.min(Math.max(0, dist - stop), effectiveSp * 60 * (dt / 1000));
          vx = dx / dist * step;
          vy = dy / dist * step;
          moving = step > 0.01;
        } else if (!edgeChase && dist <= reach && !titan) {
          if (Math.abs(dx) + Math.abs(dy) > 0.01) {
            rec.dir = this.mobFacingDir(dx, dy, rec.dir);
          }
          const nextAttackAt = Math.max(0, Number(rec.nextAttackAt) || 0);
          if (now >= nextAttackAt) {
            rec.nextAttackAt = now + attackEvery;
            this.roomBroadcast(room, {
              type: 'mob-attack',
              room,
              key: String(ck).slice(prefix.length),
              target: String(target.pid || ''),
              dmg: Math.max(1, Math.round(Number(rec.dmg) || 1)),
              x: Math.round(x * 10) / 10,
              y: Math.round(y * 10) / 10,
              dir: Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1,
              ts: now,
            }, null);
          }
        }
      }

      if (stationaryBoss) {
        x = hx; y = hy; rec.x = hx; rec.y = hy; moving = false;
      } else if (!rec.aggro) {
        const dx = hx - x, dy = hy - y, dist = Math.hypot(dx, dy);
        if (dist > 1) {
          const step = Math.min(dist, effectiveSp * 60 * (dt / 1000));
          vx = dx / dist * step;
          vy = dy / dist * step;
          moving = step > 0.01;
        }
      }

      if (moving) {
        x += vx; y += vy;
        if (hasRoomBounds) {
          const cl = clampOwnRoom(x, y, roomPad);
          x = cl.x; y = cl.y;
        } else {
          const homeD = Math.hypot(x - hx, y - hy);
          if (homeD > leash) {
            const dx = x - hx, dy = y - hy;
            x = hx + dx / homeD * leash;
            y = hy + dy / homeD * leash;
          }
        }
        rec.x = x; rec.y = y;
      }

      let fx = vx, fy = vy;
      if (!moving && target) { fx = target.x - x; fy = target.y - y; }
      if (Math.abs(fx) + Math.abs(fy) > 0.01) {
        rec.dir = this.mobFacingDir(fx, fy, rec.dir);
      }
      rec.moving = moving;
      rec.updatedAt = now;
      if (rec.aggro || moving) {
        rows.push([
          String(ck).slice(prefix.length),
          Math.round(x * 10) / 10,
          Math.round(y * 10) / 10,
          rec.aggro ? 1 : 0,
          Number.isFinite(Number(rec.dir)) ? Number(rec.dir) : 1,
          moving ? 1 : 0,
          String(rec.target || ''),
        ]);
      }
    }

    if (rows.length) {
      // AI remains 10 Hz server-authoritative, but clients do not need 10 position
      // packets/sec. Render interpolation fills the gaps smoothly and cuts mobile load.
      const sends = this.mobPositionBroadcastTimes();
      const lastSend = Number(sends.get(room) || 0);
      if (!lastSend || now - lastSend >= 100) {
        sends.set(room, now);
        this.roomBroadcast(room, { type: 'mob-position', room, rows, ts: now }, null);
      }
    }
    return rows.length > 0;
  }

  async maybePersistMobMovement(room, now = Date.now()) {
    room = cleanRoom(room);
    if (!mobAuthorityRoom(room)) return;
    const times = this.mobPersistTimes();
    const prev = Number(times.get(room) || 0);
    if (now - prev < 2000) return;
    times.set(room, now);
    await this.persistMobRoom(room);
  }

  mobDeadRows(room, now = Date.now()) {
    room = cleanRoom(room);
    this.processMobRespawns(room, now);
    const { dead } = this.mobStores();
    const out = [];
    for (const d of dead.values()) {
      if (d && d.room === room && Number(d.at) > now) {
        out.push([d.key, Number(d.at), String(d.killer || ''), String(d.party || '')]);
      }
      if (out.length >= 64) break;
    }
    return out;
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }

    const pid = String(request.headers.get('x-ppa-player-id') || '');
    const telegramId = String(request.headers.get('x-ppa-telegram-id') || '');
    const name = cleanName(request.headers.get('x-ppa-player-name') || 'Игрок');
    const clanId = String(request.headers.get('x-ppa-clan-id') || '').slice(0, 80);
    const clanName = String(request.headers.get('x-ppa-clan-name') || '').trim().slice(0, 24);
    const classKey = String(request.headers.get('x-ppa-class-key') || '').slice(0, 24);
    if (!pid || !telegramId) return new Response('Unauthorized', { status: 401 });

    const oldSockets = [];
    for (const old of this.sockets()) {
      const a = attOf(old);
      if (String(a.pid || '') === pid) oldSockets.push(old);
    }

    this.ensureRoomIndex();
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      pid, telegramId, name, clanId, clanName, classKey,
      room: 'safe', partyId: '', pet: '', lastChat: 0, lastMove: 0,
      lastSeenAt: Date.now(), lastSnapshotPush: 0, lastMobSnapshotAt: 0, hiddenUntil: 0,
      atk: 1, def: 0, attackRange: 60, crit: 0, critDmg: 180, atkSpd: 1,
      deadLocked:false,deadAt:0,pkEnabled:false,pkHpLockUntil:0,lastPkAttack:0,lastPkSkill:0,lastPkControl:0,
      arenaQueueMode:'',arenaQueuedAt:0,arenaMatchId:'',arenaMode:'',arenaSide:'',arenaHpLockUntil:0,
      arenaBlueWins:0,arenaRedWins:0,lastArenaAttack:0,lastArenaSkill:0,lastArenaControl:0,
      q: 0, l: 1, b: 0,
    });
    this.indexAdd(server, 'safe');

    wsJson(server, { type: 'hello', pid, name, clanId, clanName, serverRoom: 'safe', ts: Date.now() });

    for (const old of oldSockets) {
      try { old.close(4001, 'Reconnected'); } catch (_) {}
    }

    this.sendOnlineCount();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 4096) return;
    let m = null;
    try { m = JSON.parse(message); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;

    const a = attOf(ws);
    const now = Date.now();

    if (m.type === 'clan-boss-enter') {
      await this.clanBossEnter(ws,a,String(m.bossId||''),String(m.requestId||''),now);
      return;
    }

    if (m.type === 'clan-boss-leave') {
      this.clanBossLeave(ws,a,now);
      return;
    }

    if (m.type === 'clan-boss-state-request') {
      await this.sendClanBossState(ws,a,null,now);
      await this.sendClanBossReward(ws,a,null,now);
      return;
    }

    if (m.type === 'clan-boss-reward-ack') {
      await this.clanBossRewardAck(a,String(m.rewardId||''),now);
      return;
    }

    if (m.type === 'clan-boss-hit') {
      await this.clanBossHit(ws,a,m,now);
      return;
    }

    if (m.type === 'player-respawn-confirm') {
      if(a.arenaMatchId)return;
      if(!a.deadLocked&&Number(a.h)>0&&!m.wasDead){
        wsJson(ws,{type:'player-respawn-state',ok:true,room:cleanRoom(a.room),h:Math.max(1,Number(a.h)||1),m:Math.max(1,Number(a.m)||1),ts:now});
        return;
      }

      const oldRoom=cleanRoom(a.room);
      let wanted=cleanRoom(m.room||oldRoom);
      // Native respawn may either stay in the current respawn-enabled map
      // (dungeon/siege/clan boss) or return to the peaceful city.
      if(wanted!==oldRoom&&wanted!=='safe')wanted='safe';

      if(wanted!==oldRoom)this.moveSocketRoom(ws,a,wanted,now);
      a.deadLocked=false;a.deadAt=0;a.pkEnabled=false;a.pkHpLockUntil=0;
      a.lastPkAttack=0;a.lastPkSkill=0;a.lastPkControl=0;a.hiddenUntil=0;
      a.m=Math.max(1,Math.round(Number(m.m)||Number(a.m)||1));
      a.h=Math.max(1,Math.min(a.m,Math.round(Number(m.h)||a.m)));
      if(Number.isFinite(Number(m.x)))a.x=Math.round(Number(m.x)*10)/10;
      if(Number.isFinite(Number(m.y)))a.y=Math.round(Number(m.y)*10)/10;
      a.lastSeenAt=now;
      ws.serializeAttachment(a);

      const room=cleanRoom(a.room);
      wsJson(ws,{type:'player-respawn-state',ok:true,room,h:a.h,m:a.m,x:a.x,y:a.y,ts:now});
      this.roomBroadcast(room,{type:'move',player:packetFromAtt(a),room,ts:now},ws);
      this.sendRoomSnapshot(ws,room);
      this.sendOnlineCount();
      return;
    }

    if (m.type === 'player-pk-toggle') {
      const room=cleanRoom(a.room);
      const enabled=!!m.enabled&&playerPkRoomAllowed(room)&&!a.arenaMatchId&&!a.deadLocked&&Number(a.h)>0;
      a.pkEnabled=enabled;
      if(!enabled){a.lastPkAttack=0;a.lastPkSkill=0;a.lastPkControl=0}
      ws.serializeAttachment(a);
      wsJson(ws,{type:'player-pk-state',enabled,room,ts:now});
      return;
    }

    if (m.type === 'player-pk-hit' || m.type === 'player-pk-skill-hit') {
      const skill=m.type==='player-pk-skill-hit';
      const room=cleanRoom(a.room),targetPid=String(m.target||'');
      const reject=(reason)=>wsJson(ws,{type:'player-pk-reject',reason:String(reason||'атака отклонена'),target:targetPid,ts:now});
      if(!a.pkEnabled){reject('режим ПК выключен');return}
      if(!playerPkRoomAllowed(room)||a.arenaMatchId){reject('в этой зоне ПК запрещён');return}
      if(a.deadLocked||!(Number(a.h)>0)||!targetPid||targetPid===String(a.pid||'')){reject('цель недоступна');return}

      let targetWs=null,ta=null;
      for(const peer of this.roomSockets(room)){
        const pa=attOf(peer);
        if(String(pa.pid||'')===targetPid){targetWs=peer;ta=pa;break}
      }
      if(!targetWs||!ta){reject('игрок уже не в этой зоне');return}
      if(ta.deadLocked||!(Number(ta.h)>0)){reject('игрок уже повержен');return}
      if(Number(ta.hiddenUntil)>now){reject('игрок скрыт');return}

      const ax=Number(a.x),ay=Number(a.y),tx=Number(ta.x),ty=Number(ta.y);
      if(![ax,ay,tx,ty].every(Number.isFinite)){reject('позиция синхронизируется');return}
      const range=skill?arenaSkillRangeCapFor(a,finite(m.range,80,700,180)):arenaBasicRangeFor(a);
      const clsNow=cleanClass(a.classKey);
      const slack=skill?42:(clsNow==='assassin'?6:(arenaIsMeleeClass(a)?12:58));
      if(Math.hypot(tx-ax,ty-ay)>range+slack){reject(skill?'игрок вне радиуса навыка':'игрок вне радиуса атаки');return}

      if(skill){
        if(now-Number(a.lastPkSkill||0)<80)return;
        a.lastPkSkill=now;
      }else{
        const atkSpd=Math.max(.35,Math.min(4.5,Number(a.atkSpd)||1));
        const minDelay=Math.max(180,Math.round(1000/atkSpd*.82));
        if(now-Number(a.lastPkAttack||0)<minDelay)return;
        a.lastPkAttack=now;
      }

      const atk=Math.max(1,Math.min(2500,Number(a.atk)||1));
      const maxClient=skill?Math.max(12,Math.round((10+atk)*8)):Math.max(8,Math.round((10+atk)*3.25));
      let damage=Math.max(1,Math.min(maxClient,Math.round(Number(m.amount)||1)));
      if(!skill){
        const targetDef=Math.max(0,Math.min(2500,Number(ta.def)||0));
        const softCap=Math.max(1,Math.round((10+atk)*(1-targetDef/(targetDef+170))*2.2));
        damage=Math.max(1,Math.min(damage,softCap));
      }

      ta.h=Math.max(0,Math.round(Number(ta.h)-damage));
      ta.pkHpLockUntil=now+900;
      if(!(Number(ta.h)>0)){
        ta.h=0;ta.deadLocked=true;ta.deadAt=now;ta.pkEnabled=false;
      }
      ta.lastSeenAt=now;
      targetWs.serializeAttachment(ta);
      if(Number(a.hiddenUntil)>now)a.hiddenUntil=0;
      a.lastSeenAt=now;ws.serializeAttachment(a);

      const payload={
        type:skill?'player-pk-skill-hit':'player-pk-hit',room,
        attacker:String(a.pid||''),target:targetPid,damage,crit:!!m.crit,
        hp:Math.max(0,Number(ta.h)||0),mhp:Math.max(1,Number(ta.m)||1),
        damageType:skill?String(m.damageType||'physical').slice(0,16):'physical',
        killed:!(Number(ta.h)>0),ts:now
      };
      wsJson(ws,payload);wsJson(targetWs,payload);
      return;
    }

    if (m.type === 'player-pk-control') {
      const room=cleanRoom(a.room),targetPid=String(m.target||''),kind=String(m.kind||'');
      const reject=(reason)=>wsJson(ws,{type:'player-pk-reject',reason:String(reason||'эффект отклонён'),target:targetPid,ts:now});
      if(!a.pkEnabled||!playerPkRoomAllowed(room)||a.arenaMatchId)return;
      if(kind!=='slow'&&kind!=='root')return;
      let targetWs=null,ta=null;
      for(const peer of this.roomSockets(room)){
        const pa=attOf(peer);
        if(String(pa.pid||'')===targetPid){targetWs=peer;ta=pa;break}
      }
      if(!targetWs||!ta||!(Number(ta.h)>0)){reject('цель недоступна');return}
      const ax=Number(a.x),ay=Number(a.y),tx=Number(ta.x),ty=Number(ta.y);
      const range=arenaSkillRangeCapFor(a,finite(m.range,80,700,180));
      if(![ax,ay,tx,ty].every(Number.isFinite)||Math.hypot(tx-ax,ty-ay)>range+42){reject('игрок вне радиуса навыка');return}
      if(now-Number(a.lastPkControl||0)<120)return;
      a.lastPkControl=now;ws.serializeAttachment(a);
      const duration=Math.max(100,Math.min(4500,Math.round(finite(m.duration,100,4500,1000))));
      const mul=kind==='slow'?Math.max(.25,Math.min(.95,finite(m.mul,.25,.95,.55))):0;
      wsJson(targetWs,{type:'player-pk-control',room,attacker:String(a.pid||''),target:targetPid,kind,mul,duration,ts:now});
      return;
    }

    if (m.type === 'arena-queue-join') {
      const mode = String(m.mode || '1x1').toLowerCase().replace('×','x');
      if(a.deadLocked||!(Number(a.h)>0)){
        wsJson(ws,{type:'arena-queue-state',state:'cancelled',mode,message:'Сначала возродись в респ-зоне',ts:now});
        return;
      }
      if (mode !== '1x1') {
        wsJson(ws,{type:'arena-queue-state',state:'cancelled',mode,message:'Сейчас доступен живой 1×1',ts:now});
        return;
      }
      if (a.arenaMatchId) {
        wsJson(ws,{type:'arena-queue-state',state:'cancelled',mode,message:'Матч уже активен',ts:now});
        return;
      }
      a.arenaQueueMode=mode;a.arenaQueuedAt=now;ws.serializeAttachment(a);

      let otherWs=null,otherA=null;
      for (const peer of this.sockets()) {
        if (peer===ws) continue;
        const pa=attOf(peer);
        if (String(pa.pid||'')===String(a.pid||'')) continue;
        if (String(pa.arenaQueueMode||'')!==mode || pa.arenaMatchId) continue;
        if (!otherA || Number(pa.arenaQueuedAt||0)<Number(otherA.arenaQueuedAt||0)){otherWs=peer;otherA=pa}
      }
      if (!otherWs||!otherA) {
        wsJson(ws,{type:'arena-queue-state',state:'waiting',mode,message:'1×1 · ждём второго игрока…',ts:now});
        return;
      }

      const matchId=(now.toString(36)+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,8)).toLowerCase();
      const room=cleanRoom('pvp1-'+matchId);

      otherA.arenaQueueMode='';otherA.arenaQueuedAt=0;otherA.arenaMatchId=matchId;otherA.arenaMode=mode;otherA.arenaSide='blue';
      otherA.arenaHpLockUntil=0;otherA.arenaBlueWins=0;otherA.arenaRedWins=0;otherA.lastArenaAttack=0;otherA.lastArenaSkill=0;otherA.lastArenaControl=0;
      otherA.h=Math.max(1,Number(otherA.m)||Number(otherA.h)||1);

      a.arenaQueueMode='';a.arenaQueuedAt=0;a.arenaMatchId=matchId;a.arenaMode=mode;a.arenaSide='red';
      a.arenaHpLockUntil=0;a.arenaBlueWins=0;a.arenaRedWins=0;a.lastArenaAttack=0;a.lastArenaSkill=0;a.lastArenaControl=0;
      a.h=Math.max(1,Number(a.m)||Number(a.h)||1);

      this.moveSocketRoom(otherWs,otherA,room,now);
      this.moveSocketRoom(ws,a,room,now);

      wsJson(otherWs,{type:'arena-match',matched:true,mode,matchId,room,side:'blue',opponentId:String(a.pid||''),opponentName:cleanName(a.name||'Игрок'),ts:now});
      wsJson(ws,{type:'arena-match',matched:true,mode,matchId,room,side:'red',opponentId:String(otherA.pid||''),opponentName:cleanName(otherA.name||'Игрок'),ts:now});
      this.sendRoomSnapshot(otherWs,room);this.sendRoomSnapshot(ws,room);this.sendOnlineCount();
      return;
    }

    if (m.type === 'arena-queue-cancel') {
      if (!a.arenaMatchId) {
        a.arenaQueueMode='';a.arenaQueuedAt=0;ws.serializeAttachment(a);
        wsJson(ws,{type:'arena-queue-state',state:'cancelled',mode:String(m.mode||'1x1'),message:'Поиск отменён',ts:now});
      }
      return;
    }

    if (m.type === 'arena-leave') {
      a.arenaQueueMode='';a.arenaQueuedAt=0;a.arenaMatchId='';a.arenaMode='';a.arenaSide='';
      a.arenaHpLockUntil=0;a.arenaBlueWins=0;a.arenaRedWins=0;a.lastArenaAttack=0;a.lastArenaSkill=0;a.lastArenaControl=0;
      this.moveSocketRoom(ws,a,'safe',now);this.sendRoomSnapshot(ws,'safe');this.sendOnlineCount();
      return;
    }

    if (m.type === 'arena-hit' || m.type === 'arena-skill-hit') {
      const skill=m.type==='arena-skill-hit';
      const matchId=String(m.matchId||''),room=cleanRoom(a.room),targetPid=String(m.target||'');
      const reject=(reason)=>wsJson(ws,{type:'arena-reject',reason:String(reason||'атака отклонена'),target:targetPid,ts:now});
      if (!matchId || matchId!==String(a.arenaMatchId||'')) {reject('матч уже не активен');return}
      if (!(room.startsWith('pvp1-')||room.startsWith('pvpteam-'))) {reject('неверная комната арены');return}
      if (!(Number(a.h)>0) || !targetPid || targetPid===String(a.pid||'')) {reject('цель недоступна');return}

      let targetWs=null,ta=null;
      for (const peer of this.roomSockets(room)) {
        const pa=attOf(peer);
        if (String(pa.pid||'')===targetPid && String(pa.arenaMatchId||'')===matchId) {targetWs=peer;ta=pa;break}
      }
      if (!targetWs||!ta) {reject('соперник вышел из матча');return}
      if (String(ta.arenaSide||'')===String(a.arenaSide||'')) {reject('союзника атаковать нельзя');return}
      if (!(Number(ta.h)>0)) return;
      if (Number(ta.hiddenUntil)>now) {reject('соперник скрыт');return}

      const ax=Number(a.x),ay=Number(a.y),tx=Number(ta.x),ty=Number(ta.y);
      if (![ax,ay,tx,ty].every(Number.isFinite)) {reject('позиция синхронизируется');return}
      const range=skill
        ?arenaSkillRangeCapFor(a,finite(m.range,80,700,180))
        :arenaBasicRangeFor(a);
      const clsNow=cleanClass(a&&a.classKey);
      const hitSlack=skill?42:(clsNow==='assassin'?6:(arenaIsMeleeClass(a)?12:58));
      if (Math.hypot(tx-ax,ty-ay)>range+hitSlack) {reject(skill?'соперник вне радиуса навыка':'соперник вне радиуса атаки');return}

      if (skill) {
        if (now-Number(a.lastArenaSkill||0)<80)return;
        a.lastArenaSkill=now;
      } else {
        const atkSpd=Math.max(.35,Math.min(4.5,Number(a.atkSpd)||1));
        const minDelay=Math.max(180,Math.round(1000/atkSpd*.82));
        if (now-Number(a.lastArenaAttack||0)<minDelay)return;
        a.lastArenaAttack=now;
      }

      const atk=Math.max(1,Math.min(2500,Number(a.atk)||1));
      const maxClient=skill?Math.max(12,Math.round((10+atk)*8)):Math.max(8,Math.round((10+atk)*3.25));
      let damage=Math.max(1,Math.min(maxClient,Math.round(Number(m.amount)||1)));
      if (!skill) {
        const targetDef=Math.max(0,Math.min(2500,Number(ta.def)||0));
        const softCap=Math.max(1,Math.round((10+atk)*(1-targetDef/(targetDef+170))*2.2));
        damage=Math.max(1,Math.min(damage,softCap));
      }

      ta.h=Math.max(0,Math.round(Number(ta.h)-damage));ta.arenaHpLockUntil=now+650;ta.lastSeenAt=now;targetWs.serializeAttachment(ta);
      if (Number(a.hiddenUntil)>now)a.hiddenUntil=0;
      a.lastSeenAt=now;ws.serializeAttachment(a);

      const targetHp=Math.max(0,Number(ta.h)||0);
      const roundOver=!(targetHp>0),winnerSide=roundOver?String(a.arenaSide||''):'';
      let blueWins=Math.max(0,Number(a.arenaBlueWins)||Number(ta.arenaBlueWins)||0);
      let redWins=Math.max(0,Number(a.arenaRedWins)||Number(ta.arenaRedWins)||0);
      if(roundOver){
        if(winnerSide==='blue')blueWins++;
        else if(winnerSide==='red')redWins++;
      }
      const matchOver=roundOver&&(blueWins>=2||redWins>=2);
      const roundToken=roundOver?(matchId+':'+now):'';
      const payload={type:skill?'arena-skill-hit':'arena-hit',matchId,room,attacker:String(a.pid||''),target:targetPid,damage,crit:!!m.crit,
        hp:targetHp,mhp:Math.max(1,Number(ta.m)||1),damageType:skill?String(m.damageType||'physical').slice(0,16):'physical',
        roundOver,winner:winnerSide,roundToken,scoreBlue:blueWins,scoreRed:redWins,matchOver,ts:now};
      wsJson(ws,payload);wsJson(targetWs,payload);

      if (roundOver) {
        for (const peer of this.roomSockets(room)) {
          const pa=attOf(peer);if (String(pa.arenaMatchId||'')!==matchId)continue;
          pa.arenaBlueWins=blueWins;pa.arenaRedWins=redWins;
          pa.h=Math.max(1,Number(pa.m)||1);pa.arenaHpLockUntil=0;
          pa.lastArenaAttack=0;pa.lastArenaSkill=0;pa.lastArenaControl=0;
          if(matchOver){
            pa.arenaMatchId='';pa.arenaMode='';pa.arenaSide='';
            pa.arenaQueueMode='';pa.arenaQueuedAt=0;
          }
          peer.serializeAttachment(pa);
        }
      }
      return;
    }

    if (m.type === 'arena-control') {
      const matchId=String(m.matchId||''),room=cleanRoom(a.room),targetPid=String(m.target||''),kind=String(m.kind||'');
      const reject=(reason)=>wsJson(ws,{type:'arena-reject',reason:String(reason||'эффект отклонён'),target:targetPid,ts:now});
      if (!matchId||matchId!==String(a.arenaMatchId||'')||(kind!=='slow'&&kind!=='root'))return;
      let targetWs=null,ta=null;
      for (const peer of this.roomSockets(room)) {
        const pa=attOf(peer);
        if (String(pa.pid||'')===targetPid&&String(pa.arenaMatchId||'')===matchId){targetWs=peer;ta=pa;break}
      }
      if (!targetWs||!ta||String(ta.arenaSide||'')===String(a.arenaSide||'')){reject('цель недоступна');return}
      const ax=Number(a.x),ay=Number(a.y),tx=Number(ta.x),ty=Number(ta.y),range=Math.max(80,Math.min(700,finite(m.range,80,700,180)));
      if (![ax,ay,tx,ty].every(Number.isFinite)||Math.hypot(tx-ax,ty-ay)>range+74){reject('соперник вне радиуса навыка');return}
      if (now-Number(a.lastArenaControl||0)<120)return;
      a.lastArenaControl=now;ws.serializeAttachment(a);
      const duration=Math.max(100,Math.min(4500,Math.round(finite(m.duration,100,4500,1000))));
      const mul=kind==='slow'?Math.max(.25,Math.min(.95,finite(m.mul,.25,.95,.55))):0;
      wsJson(targetWs,{type:'arena-control',matchId,room,attacker:String(a.pid||''),target:targetPid,kind,mul,duration,ts:now});
      return;
    }

    if (m.type === 'player-combat-fx') {
      const room = cleanRoom(a.room);
      const kind = String(m.kind || '');
      if (!['gnome-cannon','archer-arrow','melee'].includes(kind)) return;
      if (!(Number(a.h) > 0)) return;
      if (now - Number(a.lastCombatFx || 0) < 70) return;
      a.lastCombatFx = now;
      ws.serializeAttachment(a);

      let x = finite(m.x, -100000, 100000, Number(a.x) || 0);
      let y = finite(m.y, -100000, 100000, Number(a.y) || 0);
      let tx = finite(m.tx, -100000, 100000, x);
      let ty = finite(m.ty, -100000, 100000, y);
      let ang = finite(m.ang, -Math.PI * 4, Math.PI * 4, Math.atan2(ty - y, tx - x));
      const animMs = Math.max(240, Math.min(700, Math.round(finite(m.animMs, 240, 700, 480))));

      this.roomBroadcast(room, {
        type:'player-combat-fx', room, from:String(a.pid || ''), kind,
        x:Math.round(x * 10) / 10, y:Math.round(y * 10) / 10,
        tx:Math.round(tx * 10) / 10, ty:Math.round(ty * 10) / 10,
        ang, animMs, ts:now
      }, ws);
      return;
    }

    if (m.type === 'player-stealth') {
      const duration = Math.max(0, Math.min(3000, Math.round(finite(m.duration, 0, 3000, 0))));
      const liveClass = String(a.classKey || '').toLowerCase();
      if (liveClass !== 'assassin') return;
      a.hiddenUntil = duration > 0 ? now + duration : 0;
      a.lastSeenAt = now;
      ws.serializeAttachment(a);

      // Smoke immediately breaks directed aggro. Ground effects already placed
      // before smoke are not cancelled; only new targeting is blocked.
      const room = cleanRoom(a.room);
      if (mobAuthorityRoom(room)) {
        await this.ensureMobRoomLoaded(room);
        const { health } = this.mobStores();
        const prefix = room + '|';
        for (const [ck, rec] of health.entries()) {
          if (!String(ck).startsWith(prefix) || !rec) continue;
          if (String(rec.target || '') === String(a.pid || '')) {
            rec.aggro = false;
            rec.target = '';
            rec.moving = false;
            rec.nextAttackAt = 0;
            rec.tauntUntil = 0;
            rec.tauntPid = '';
            rec.updatedAt = now;
          }
        }
        await this.persistMobRoom(room);
      }
      this.roomBroadcast(room, { type: 'move', player: packetFromAtt(a), room, ts: now }, ws);
      return;
    }

    if (m.type === 'group-skill') {
      const skill = String(m.skill || '');
      if (String(a.classKey || '').toLowerCase() !== 'priest') return;
      const partyId = String(a.partyId || '');
      if (!partyId || !['priest_healing_light','priest_holy_barrier','priest_divine_rebirth'].includes(skill)) return;
      const room = cleanRoom(a.room);
      const rank = Math.max(1, Math.min(3, Math.round(finite(m.rank, 1, 3, 1))));
      const pct = Math.max(0, Math.min(55, finite(m.pct, 0, 55, 0)));
      const reduction = Math.max(0, Math.min(45, finite(m.reduction, 0, 45, 0)));
      const durationMs = Math.max(0, Math.min(6500, Math.round(finite(m.durationMs, 0, 6500, 0))));
      const target = String(m.target || '');

      if (skill === 'priest_divine_rebirth') {
        if (!target) return;
        for (const peer of this.roomSockets(room)) {
          const pa = attOf(peer);
          if (String(pa.pid || '') !== target || String(pa.partyId || '') !== partyId) continue;
          if (Number(pa.h) > 0&&!pa.deadLocked) return;
          const revivePct=Math.max(1,pct);
          pa.deadLocked=false;pa.deadAt=0;pa.pkHpLockUntil=0;
          pa.h=Math.max(1,Math.round(Math.max(1,Number(pa.m)||1)*revivePct/100));
          pa.lastSeenAt=now;peer.serializeAttachment(pa);
          wsJson(peer, { type:'group-skill', skill, rank, pct:revivePct, hp:pa.h, from:String(a.pid||''), ts:now });
          return;
        }
        return;
      }

      for (const peer of this.roomSockets(room)) {
        if (peer === ws) continue;
        const pa = attOf(peer);
        if (String(pa.partyId || '') !== partyId || !(Number(pa.h) > 0)) continue;
        wsJson(peer, {
          type:'group-skill', skill, rank, pct,
          reduction, durationMs, from:String(a.pid||''), ts:now
        });
      }
      return;
    }

    if (m.type === 'mob-taunt-event') {
      const room = cleanRoom(a.room);
      const key = cleanMobKey(m.key);
      const event = String(m.event || '').slice(0, 96);
      const duration = Math.max(500, Math.min(4000, Math.round(finite(m.duration, 500, 4000, 3000))));
      if (!mobAuthorityRoom(room) || cleanRoom(m.room || room) !== room) return;
      // Taunt affects ordinary dungeon mobs only; bosses keep their boss AI.
      if (!/^s\d{1,4}$/.test(key)) return;

      await this.ensureMobRoomLoaded(room);
      const { health, dead, events } = this.mobStores();
      if (event && events.has(event)) return;
      if (event) events.set(event, now);
      const ck = this.mobCompound(room, key);
      const rec = health.get(ck), tomb = dead.get(ck);
      if (!rec || !(Number(rec.hp) > 0) || (tomb && Number(tomb.at) > now)) return;

      rec.aggro = true;
      rec.target = String(a.pid || '');
      rec.tauntPid = String(a.pid || '');
      rec.tauntUntil = now + duration;
      rec.updatedAt = now;
      health.set(ck, rec);
      this.ensureMobAiLoop(room);
      return;
    }

    if (m.type === 'mob-catalog') {
      const room = cleanRoom(a.room);
      if (!mobAuthorityRoom(room) || cleanRoom(m.room || room) !== room) return;
      await this.ensureMobRoomLoaded(room);
      if (this.processMobRespawns(room, now)) await this.persistMobRoom(room);

      const { health } = this.mobStores();
      const rows = Array.isArray(m.rows) ? m.rows.slice(0, 64) : [];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const key = cleanMobKey(row[0]);
        const mhp = Math.max(1, finite(row[1], 1, 10000000, 1));
        const x = finite(row[2], -100000, 100000, NaN);
        const y = finite(row[3], -100000, 100000, NaN);
        const sp = Math.max(0.1, finite(row[4], 0.1, 100, 1));
        const sz = Math.max(8, finite(row[5], 8, 500, 30));
        const dmg = Math.max(1, finite(row[6], 1, 1000000, 1));
        const clientResetAt = key === 'wtitan' ? finite(row[7], now - 300000, now + 36 * 60 * 60 * 1000, 0) : 0;
        const mobLevel = Math.max(1, Math.min(999, Math.round(finite(row[8], 1, 999, 1))));
        const mobRoomIndex = row[9] == null ? -1 : Math.round(finite(row[9], -1, 10000, -1));
        const roomMinX = row[10] == null ? NaN : finite(row[10], -100000, 100000, NaN);
        const roomMinY = row[11] == null ? NaN : finite(row[11], -100000, 100000, NaN);
        const roomMaxX = row[12] == null ? NaN : finite(row[12], -100000, 100000, NaN);
        const roomMaxY = row[13] == null ? NaN : finite(row[13], -100000, 100000, NaN);
        const hasRoomBounds = mobRoomIndex >= 0 && [roomMinX, roomMinY, roomMaxX, roomMaxY].every(Number.isFinite)
          && roomMaxX > roomMinX && roomMaxY > roomMinY;
        if (!key) continue;

        const ck = this.mobCompound(room, key);
        let rec = health.get(ck);
        if (!rec) {
          rec = {
            hp: mhp, mhp, updatedAt: now, killer: '', party: '',
            x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0,
            hx: Number.isFinite(x) ? x : 0, hy: Number.isFinite(y) ? y : 0,
            sp, sz, dmg,
            baseMhp:mhp,baseDmg:dmg,baseSz:sz,
            elite:false,eliteWindowKey:'',eliteExpiresAt:0,eliteMode:'',eliteDefBonus:0,eliteKilledKey:'',
            nextAttackAt: 0,
            nextSpecialAt: 0, nextProjectileAt: 0, nextAoeAt: 0, specialImpactAt: 0, specialKind: '',
            resetAt: clientResetAt > now ? clientResetAt : 0,
            lvl: mobLevel,
            roomIndex: hasRoomBounds ? mobRoomIndex : -1,
            roomMinX: hasRoomBounds ? roomMinX : null, roomMinY: hasRoomBounds ? roomMinY : null,
            roomMaxX: hasRoomBounds ? roomMaxX : null, roomMaxY: hasRoomBounds ? roomMaxY : null,
            aggro: false, target: '', dir: 1, moving: false,
            rootUntil: 0, slowUntil: 0, slowMul: 1, tauntUntil: 0, tauntPid: '', positioned: true,
          };
          health.set(ck, rec);
        } else {
          const prevMhp = Math.max(1, Number(rec.mhp) || mhp);
          const prevHp = Number.isFinite(Number(rec.hp)) ? Number(rec.hp) : prevMhp;
          rec.baseMhp=mhp;rec.baseDmg=dmg;rec.baseSz=sz;
          if(!rec.elite){
            rec.mhp = mhp;
            // When a balance patch raises max HP, carry the added max HP into current HP.
            if (mhp > prevMhp && prevHp > 0) {
              rec.hp = Math.min(mhp, prevHp + (mhp - prevMhp));
            } else {
              rec.hp = Math.max(0, Math.min(prevHp, mhp));
            }
          }
          if (Number.isFinite(x) && Number.isFinite(y)) {
            rec.hx = x; rec.hy = y;
            if (!rec.positioned || !Number.isFinite(Number(rec.x)) || !Number.isFinite(Number(rec.y))) {
              rec.x = x; rec.y = y;
            }
            rec.positioned = true;
          }
          rec.sp = sp;if(!rec.elite){rec.sz=sz;rec.dmg=dmg}rec.lvl = mobLevel;
          if (hasRoomBounds) {
            rec.roomIndex = mobRoomIndex;
            rec.roomMinX = roomMinX; rec.roomMinY = roomMinY;
            rec.roomMaxX = roomMaxX; rec.roomMaxY = roomMaxY;
          }
          if (key === 'wtitan' && clientResetAt > now && !(Number(rec.resetAt) > now)) rec.resetAt = clientResetAt;
          rec.updatedAt = now;
          health.set(ck, rec);
        }
      }

      if (m.done !== true) return;
      this.syncServerElite(room,now,true);
      await this.persistMobRoom(room);
      this.sendMobAuthoritySnapshot(ws, room, now);
      return;
    }

    if (m.type === 'mob-hit-event') {
      const room = cleanRoom(a.room);
      const key = cleanMobKey(m.key);
      const amount = finite(m.amount, 0, 10000000, 0);
      const mhp = Math.max(1, finite(m.mhp, 1, 10000000, 1));
      const event = String(m.event || '').slice(0, 96);
      const hitKind = String(m.kind || '').slice(0,16);
      if (!mobAuthorityRoom(room) || cleanRoom(m.room || room) !== room) return;
      if (!key || !(amount > 0)) return;

      await this.ensureMobRoomLoaded(room);
      if (this.processMobRespawns(room, now)) await this.persistMobRoom(room);
      const { health, dead, events } = this.mobStores();
      if (event && events.has(event)) return;
      if (event) events.set(event, now);

      const ck = this.mobCompound(room, key);
      let rec = health.get(ck);
      if (!rec) rec = { hp: mhp, mhp, updatedAt: now, killer: '', party: '' };
      rec.mhp = Math.max(1, Number(rec.mhp) || mhp);
      const existingDead = dead.get(ck);
      if (existingDead && Number(existingDead.at) > now) {
        this.sendMobAuthoritySnapshot(ws, room, now);
        return;
      }

      if (hitKind === 'ruri') {
        if (cleanPet(a.pet || '') !== 'Великий Рури') return;
        if (now - Number(a.lastRuriAttack || 0) < 1700) return;
        const ax=Number(a.x),ay=Number(a.y),mx=Number(rec.x),my=Number(rec.y);
        if (![ax,ay,mx,my].every(Number.isFinite)) {
          this.sendMobAuthoritySnapshot(ws, room, now);
          return;
        }
        if (Math.hypot(mx-ax,my-ay) > 300) {
          this.sendMobAuthoritySnapshot(ws, room, now);
          return;
        }
        const maxRuriDamage=Math.max(1,Math.ceil((Number(a.atk)||1)*0.31)+2);
        if (amount > maxRuriDamage) return;
        a.lastRuriAttack=now;
        ws.serializeAttachment(a);
      }

      if (hitKind === 'basic' && arenaIsMeleeClass(a)) {
        const ax=Number(a.x),ay=Number(a.y),mx=Number(rec.x),my=Number(rec.y);
        if (![ax,ay,mx,my].every(Number.isFinite)) {
          this.sendMobAuthoritySnapshot(ws, room, now);
          return;
        }
        const basicRange=arenaBasicRangeFor(a);
        const mobSz=Math.max(8,Number(rec.sz)||30);
        const bodyEdge=Math.min(8,Math.max(0,(mobSz-30)*.15));
        const netSlack=6;
        if (Math.hypot(mx-ax,my-ay)>basicRange+bodyEdge+netSlack) {
          this.sendMobAuthoritySnapshot(ws, room, now);
          return;
        }
      }

      rec.hp = Math.max(0, Math.min(rec.mhp, Number(rec.hp) || rec.mhp) - amount);
      rec.updatedAt = now;
      rec.killer = String(a.pid || '');
      rec.party = String(a.partyId || '');
      rec.aggro = rec.hp > 0;
      rec.target = rec.hp > 0 ? String(a.pid || '') : '';
      health.set(ck, rec);
      if (rec.aggro) this.ensureMobAiLoop(room);

      let respawnAt = 0, killer = rec.killer, party = rec.party;
      if (rec.hp <= 0) {
        if(rec.elite&&rec.eliteWindowKey)rec.eliteKilledKey=String(rec.eliteWindowKey);
        rec.aggro = false;
        rec.target = '';
        rec.moving = false;
        rec.rootUntil = 0;
        rec.slowUntil = 0;
        rec.slowMul = 1;
        rec.nextAttackAt = 0;
        rec.nextSpecialAt = 0;
        rec.nextAoeAt = 0;
        rec.specialImpactAt = 0;
        rec.specialKind = '';
        health.set(ck, rec);
        respawnAt = mobRespawnAt(key, rec, now);
        dead.set(ck, { room, key, at: respawnAt, killer, party });
        setTimeout(async () => {
          try {
            await this.ensureMobRoomLoaded(room);
            if (this.processMobRespawns(room, Date.now())) await this.persistMobRoom(room);
          } catch (_) {}
        }, DUNGEON_MOB_RESPAWN_MS + 50);
      }

      await this.persistMobRoom(room);
      this.roomBroadcast(room, {
        type: 'mob-authority', room, key,
        hp: Math.round(rec.hp * 100) / 100,
        mhp: Math.round(rec.mhp * 100) / 100,
        respawnAt, killer, party, event,
        x: rec.x, y: rec.y, aggro: !!rec.aggro, dir: rec.dir, moving: !!rec.moving,
        target: String(rec.target || ''), sz: rec.sz,elite:!!rec.elite,
        eliteWindowKey:String(rec.eliteWindowKey||''),eliteExpiresAt:Math.max(0,Number(rec.eliteExpiresAt)||0),
        eliteMode:String(rec.eliteMode||''),eliteDefBonus:Math.max(0,Number(rec.eliteDefBonus)||0),ts: now,
      }, null);
      return;
    }

    if (m.type === 'mob-control-event') {
      const room = cleanRoom(a.room);
      const key = cleanMobKey(m.key);
      const kind = String(m.kind || '');
      const event = String(m.event || '').slice(0, 96);
      const duration = Math.max(100, Math.min(6000, Math.round(finite(m.duration, 100, 6000, 0))));
      const mul = Math.max(.25, Math.min(.95, finite(m.mul, .25, .95, .55)));
      if (!mobAuthorityRoom(room) || cleanRoom(m.room || room) !== room) return;
      // Crowd control is for ordinary dungeon mobs only; bosses remain control-immune.
      if (!/^s\d{1,4}$/.test(key) || (kind !== 'slow' && kind !== 'root') || !(duration > 0)) return;

      await this.ensureMobRoomLoaded(room);
      if (this.processMobRespawns(room, now)) await this.persistMobRoom(room);
      const { health, dead, events } = this.mobStores();
      if (event && events.has(event)) return;
      if (event) events.set(event, now);

      const ck = this.mobCompound(room, key);
      const rec = health.get(ck);
      const tomb = dead.get(ck);
      if (!rec || !(Number(rec.hp) > 0) || (tomb && Number(tomb.at) > now)) return;

      if (kind === 'root') {
        rec.rootUntil = Math.max(Number(rec.rootUntil) || 0, now + duration);
      } else {
        rec.slowMul = Math.max(.25, Math.min(1, Math.min(Number(rec.slowMul) || 1, mul)));
        rec.slowUntil = Math.max(Number(rec.slowUntil) || 0, now + duration);
      }
      rec.updatedAt = now;
      health.set(ck, rec);
      if (rec.aggro || rec.moving) this.ensureMobAiLoop(room);
      await this.persistMobRoom(room);
      this.roomBroadcast(room, {
        type: 'mob-control', room, key, kind,
        mul: kind === 'slow' ? rec.slowMul : 0,
        until: kind === 'root' ? rec.rootUntil : rec.slowUntil,
        event, ts: now,
      }, null);
      return;
    }

    if (m.type === 'room-request') {
      const info = dungeonInfo(m.base || m.room || '');
      if (!info) return;
      const assignedRoom = this.assignDungeon(ws, a, info.base, now);
      await this.ensureMobRoomLoaded(assignedRoom);
      if (this.processMobRespawns(assignedRoom, now)) await this.persistMobRoom(assignedRoom);
      this.sendMobAuthoritySnapshot(ws, assignedRoom, now);
      return;
    }

    if (m.type === 'pet-state') {
      const room = cleanRoom(a.room);
      const pet = cleanPet(m.pet || '');
      if (pet !== cleanPet(a.pet || '')) {
        a.pet = pet;
        a.lastSeenAt = now;
        ws.serializeAttachment(a);
        this.roomBroadcast(room, { type: 'move', player: packetFromAtt(a), room }, ws);
      }
      return;
    }

    if (m.type === 'mob-state' || m.type === 'mob-damage' || m.type === 'mob-dead') {
      // Legacy protocol retired. Authoritative flow is mob-catalog +
      // mob-hit-event + server mob-authority/mob-position/mob-attack.
      return;
    }

    if (m.type === 'mob-state') {
      const room = cleanRoom(a.room);
      if (!room.startsWith('dungeon-') || cleanRoom(m.room || room) !== room) return;
      this.pruneMobStores(now);
      const { health, dead } = this.mobStores();
      const rows = [];
      const input = Array.isArray(m.rows) ? m.rows.slice(0, 16) : [];
      for (const row of input) {
        if (!Array.isArray(row) || row.length < 5) continue;
        const key = cleanMobKey(row[0]);
        if (!key) continue;
        const x = finite(row[1], -100000, 100000, NaN);
        const y = finite(row[2], -100000, 100000, NaN);
        const clientHp = finite(row[3], 0, 10000000, NaN);
        const mhp = Math.max(1, finite(row[4], 1, 10000000, 1));
        if (![x, y, clientHp, mhp].every(Number.isFinite)) continue;
        const ck = this.mobCompound(room, key);
        const tomb = dead.get(ck);
        let rec = health.get(ck);
        if (tomb && Number(tomb.at) > now) {
          rec = { hp: 0, mhp, updatedAt: now };
          health.set(ck, rec);
        } else if (!rec || now - Number(rec.updatedAt || 0) > 30000) {
          // A state snapshot is never allowed to manufacture a death.
          // Fresh mobs start from positive client HP (or full HP if client reported 0).
          const seedHp = clientHp > 0 ? Math.min(clientHp, mhp) : mhp;
          rec = { hp: Math.max(1, seedHp), mhp, updatedAt: now };
          health.set(ck, rec);
        } else {
          rec.mhp = Math.max(1, Number(rec.mhp) || mhp);
          rec.hp = Math.max(1, Math.min(Number(rec.hp) || rec.mhp, rec.mhp));
          rec.updatedAt = now;
        }
        rows.push([
          key, Math.round(x * 10) / 10, Math.round(y * 10) / 10,
          Math.round(rec.hp * 100) / 100, Math.round(rec.mhp * 100) / 100,
          row[5] ? 1 : 0,
          row[6] == null ? null : finite(row[6], -8, 8, 0),
          row[7] ? 1 : 0,
          row[8] == null ? null : finite(row[8], -8, 8, 0),
          row[9] ? 1 : 0,
        ]);
      }
      this.roomBroadcast(room, {
        type: 'mob-state', from: a.pid, room, rows,
        dead: this.mobDeadRows(room, now), ts: now,
      }, ws);
      return;
    }

    if (m.type === 'mob-damage') {
      const room = cleanRoom(a.room);
      if (!room.startsWith('dungeon-') || cleanRoom(m.room || room) !== room) return;
      const key = cleanMobKey(m.key);
      const amount = finite(m.amount, 0, 10000000, 0);
      const before = finite(m.before, 0, 10000000, NaN);
      const event = String(m.event || '').slice(0, 96);
      if (!key || !(amount > 0) || !Number.isFinite(before)) return;

      this.pruneMobStores(now);
      const { health, dead, events } = this.mobStores();
      const ck = this.mobCompound(room, key);
      let rec = health.get(ck);
      const killer = String(a.pid || '');
      const killerParty = String(a.partyId || '');
      if (event && events.has(event)) {
        if (rec) wsJson(ws, {
          type: 'mob-hp', room, key, hp: rec.hp, mhp: rec.mhp,
          killer, party: killerParty, event, ts: now,
        });
        return;
      }
      if (event) events.set(event, now);

      const tomb = dead.get(ck);
      if (tomb && Number(tomb.at) > now) {
        rec = rec || { hp: 0, mhp: Math.max(1, before), updatedAt: now };
        rec.hp = 0;rec.updatedAt = now;health.set(ck, rec);
      } else {
        if (!rec) rec = { hp: before, mhp: Math.max(1, before), updatedAt: now };
        let cur = Math.max(0, Number(rec.hp) || 0);
        cur = Math.min(cur, before);
        rec.hp = Math.max(0, cur - amount);
        rec.updatedAt = now;
        health.set(ck, rec);
      }

      let respawnAt = null;
      let firstDeath = false;
      let deathInfo = null;
      if (rec.hp <= 0) {
        let d = dead.get(ck);
        if (!d || Number(d.at) <= now) {
          d = { room, key, at: now + 10000, killer, party: killerParty };
          dead.set(ck, d);
          firstDeath = true;
        }
        deathInfo = d;
        respawnAt = Number(d.at);
      }

      const rewardKiller = deathInfo ? String(deathInfo.killer || '') : killer;
      const rewardParty = deathInfo ? String(deathInfo.party || '') : killerParty;
      this.roomBroadcast(room, {
        type: 'mob-hp', room, key,
        hp: Math.round(rec.hp * 100) / 100,
        mhp: Math.round((Number(rec.mhp) || Math.max(1, before)) * 100) / 100,
        respawnAt, killer: rewardKiller, party: rewardParty, event, ts: now,
      }, null);
      if (firstDeath) {
        this.roomBroadcast(room, {
          type: 'mob-dead', room, key, respawnAt,
          killer: rewardKiller, party: rewardParty, ts: now,
        }, null);
      }
      return;
    }

    if (m.type === 'ping') {
      a.lastSeenAt = now;
      {
        const pingRoom = cleanRoom(a.room);
        if (isClanBossRoom(pingRoom)&&a.clanBossRoom&&cleanRoom(a.clanBossRoom)===pingRoom&&now-Number(a.lastClanBossStateAt||0)>=5000) {
          a.lastClanBossStateAt=now;
          await this.sendClanBossState(ws,a,null,now);
        }
        if (mobAuthorityRoom(pingRoom)) {
          await this.ensureMobRoomLoaded(pingRoom);
          if (this.processMobRespawns(pingRoom, now)) await this.persistMobRoom(pingRoom);

          // Long farming sessions can miss a single respawn broadcast during a
          // mobile WebSocket hiccup / Durable Object wake. Repair client state
          // periodically with a fresh authoritative snapshot instead of allowing
          // dead tombstones to accumulate until the dungeon looks empty.
          if (now - Number(a.lastMobSnapshotAt || 0) >= 20000) {
            a.lastMobSnapshotAt = now;
            this.sendMobAuthoritySnapshot(ws, pingRoom, now);
          }
        }
      }
      ws.serializeAttachment(a);
      wsJson(ws, {
        type: 'pong',
        ts: now,
        clientTs: Number(m.clientTs) || 0,
        room: cleanRoom(a.room),
        roomCount: this.countRoom(a.room),
      });
      return;
    }

    if (m.type === 'room') {
      let requested = cleanRoom(m.room);
      if(requested==='clanboss1'||(isClanBossRoom(requested)&&(!a.clanBossRoom||cleanRoom(a.clanBossRoom)!==requested)))requested='safe';
      const d = dungeonInfo(requested);
      if (d) {
        const current = dungeonInfo(a.room);
        if (d.instance && current && current.instance && cleanRoom(a.room) === requested) {
          a.lastSeenAt = now;
          ws.serializeAttachment(a);
          wsJson(ws, {
            type: 'room-assigned',
            base: d.base,
            room: requested,
            instance: d.instance,
            capacity: DUNGEON_CAPACITY,
            roomCount: this.countRoom(requested),
            ts: now,
          });
          this.sendRoomSnapshot(ws, requested);
        } else {
          this.assignDungeon(ws, a, d.base, now);
        }
        {
          const mobRoom = cleanRoom(a.room);
          await this.ensureMobRoomLoaded(mobRoom);
          if (this.processMobRespawns(mobRoom, now)) await this.persistMobRoom(mobRoom);
          this.sendMobAuthoritySnapshot(ws, mobRoom, now);
        }
        return;
      }

      const room = this.moveSocketRoom(ws, a, requested, now);
      this.sendRoomSnapshot(ws, room);
      if (mobAuthorityRoom(room)) {
        await this.ensureMobRoomLoaded(room);
        if (this.processMobRespawns(room, now)) await this.persistMobRoom(room);
        this.sendMobAuthoritySnapshot(ws, room, now);
      }
      if (a.partyId) this.sendPartyState(a.partyId);
      return;
    }

    if (m.type === 'move') {
      if (now - (Number(a.lastMove) || 0) < 90) return;

      const oldRoom = cleanRoom(a.room);
      let wantedRoom = m.room != null ? cleanRoom(m.room) : oldRoom;
      if(wantedRoom==='clanboss1'||(isClanBossRoom(wantedRoom)&&(!a.clanBossRoom||cleanRoom(a.clanBossRoom)!==wantedRoom)))wantedRoom='safe';
      const wantedDungeon = dungeonInfo(wantedRoom);
      const currentDungeon = dungeonInfo(oldRoom);
      let currentRoom = oldRoom;

      if (wantedDungeon) {
        if (currentDungeon && currentDungeon.instance && currentDungeon.base === wantedDungeon.base) {
          currentRoom = oldRoom;
        } else {
          currentRoom = this.assignDungeon(ws, a, wantedDungeon.base, now);
        }
      } else if (wantedRoom !== oldRoom) {
        currentRoom = this.moveSocketRoom(ws, a, wantedRoom, now);
        this.sendRoomSnapshot(ws, currentRoom);
      }

      a.lastMove = now;
      a.lastSeenAt = now;
      if(!a.deadLocked){
        a.x = Number.isFinite(Number(m.x)) ? Math.round(Number(m.x) * 10) / 10 : Number(a.x) || 0;
        a.y = Number.isFinite(Number(m.y)) ? Math.round(Number(m.y) * 10) / 10 : Number(a.y) || 0;
      }
      {
        const incomingH=Math.max(0,Math.round(Number(m.h)||0));
        const incomingDead=(m.dead===true||Number(m.dead)===1);
        if(!a.arenaMatchId){
          if(a.deadLocked){
            // Zero HP is sticky. Normal movement/regen packets can NEVER revive.
            a.h=0;
          }else if(incomingDead||incomingH<=0){
            a.h=0;a.deadLocked=true;a.deadAt=now;a.pkEnabled=false;
            a.pkHpLockUntil=0;a.lastPkAttack=0;a.lastPkSkill=0;a.lastPkControl=0;
            wsJson(ws,{type:'player-death-state',locked:true,h:0,room:currentRoom,ts:now});
          }else if(now<Number(a.pkHpLockUntil||0)&&incomingH>Number(a.h||0)){
            // Keep recent server-authoritative PK damage until the client catches up.
          }else{
            a.h=incomingH;
          }
        }
        // Arena round HP remains governed by the arena state machine.
      }
      a.m = Math.max(1, Math.round(Number(m.m) || 1));
      a.atk = finite(m.at, 1, 2500, Number(a.atk)||1);
      a.def = finite(m.df, 0, 2500, Number(a.def)||0);
      a.attackRange = finite(m.ar, 60, 480, Number(a.attackRange)||60);
      if(a.arenaMatchId)a.attackRange=arenaBasicRangeFor(a);
      a.crit = finite(m.cr, 0, 60, Number(a.crit)||0);
      a.critDmg = finite(m.cd, 100, 350, Number(a.critDmg)||180);
      a.atkSpd = finite(m.as, .35, 4.5, Number(a.atkSpd)||1);
      {
        const face = Number(m.f);
        a.f = Number.isFinite(face) ? Math.max(-8, Math.min(8, Math.round(face))) : (Number.isFinite(Number(a.f)) ? Number(a.f) : 1);
      }
      a.a = String(m.a || 'idle').slice(0, 12);
      a.l = Math.max(1, Math.min(999, Math.round(Number(m.l) || Number(a.l) || 1)));
      a.b = Math.max(0, Math.round(Number(m.b) || Number(a.b) || 0));
      {
        const liveClass = cleanClass(m.c);
        if (liveClass) a.classKey = liveClass;
      }
      a.q = (Number(a.q) || 0) + 1;
      a.room = currentRoom;
      if(!playerPkRoomAllowed(currentRoom)||a.arenaMatchId){
        a.pkEnabled=false;a.lastPkAttack=0;a.lastPkSkill=0;a.lastPkControl=0;
      }

      const pushSnapshot = now - (Number(a.lastSnapshotPush) || 0) >= 1200;
      if (pushSnapshot) a.lastSnapshotPush = now;
      ws.serializeAttachment(a);

      if (mobAuthorityRoom(currentRoom)) {
        await this.ensureMobRoomLoaded(currentRoom);
        if(this.maybeSyncServerElite(currentRoom,now))await this.persistMobRoom(currentRoom);
        this.tickMobAI(currentRoom, now);
        if (this.roomHasAggroMob(currentRoom)) this.ensureMobAiLoop(currentRoom);
        await this.maybePersistMobMovement(currentRoom, now);
      }

      this.roomBroadcast(currentRoom, { type: 'move', player: packetFromAtt(a), room: currentRoom }, ws);
      if (pushSnapshot) this.sendRoomSnapshot(ws, currentRoom);
      return;
    }

    return super.webSocketMessage(ws, message);
  }

  scheduleGoneCheck(ws) {
    const a = attOf(ws);
    const pid = String(a.pid || '');
    const room = cleanRoom(a.room);
    const partyId = String(a.partyId || '');
    this.indexRemove(ws, room);
    if (!pid) {
      this.maybeCleanupDungeon(room);
      this.sendOnlineCount();
      return;
    }

    setTimeout(() => {
      if (this.hasReplacement(pid, ws)) {
        this.sendOnlineCount();
        return;
      }
      this.roomBroadcast(room, { type: 'leave', id: pid, room, ts: Date.now() }, ws);
      if (a.arenaMatchId) this.roomBroadcast(room,{type:'arena-opponent-left',matchId:String(a.arenaMatchId||''),id:pid,ts:Date.now()},ws);
      if (partyId) this.sendPartyState(partyId);
      this.pruneDungeonReservations(Date.now());
      this.maybeCleanupDungeon(room, Date.now());
      this.sendOnlineCount();
    }, 5000);
  }

  async webSocketClose(ws) {
    this.scheduleGoneCheck(ws);
  }

  async webSocketError(ws) {
    this.scheduleGoneCheck(ws);
  }
}
