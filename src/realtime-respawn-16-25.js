import { RealtimeHub as StableRealtimeHub } from './realtime-stable.js';

// PPA_DUNGEON_MOB_RESPAWN_16_25_20261004
// Narrow server-side override for ordinary dungeon mobs only.
// Bosses and server-elite mobs keep the timers owned by realtime-stable.js.
function attOf(ws){
  try{return ws.deserializeAttachment()||{}}catch(_){return{}}
}
function cleanRoom(v){
  v=String(v||'safe').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72);
  return v||'safe';
}
function ordinaryMobKey(v){
  v=String(v||'');
  return /^s\d{1,4}$/.test(v)?v:'';
}
function ordinaryRespawnDelay(){
  return 16000+Math.floor(Math.random()*9001); // 16,000..25,000 ms inclusive
}

export class RealtimeHub extends StableRealtimeHub {
  async webSocketMessage(ws,message){
    let probe=null,watch=null;
    if(typeof message==='string'&&message.length<=4096){
      try{probe=JSON.parse(message)}catch(_){}
    }

    if(probe&&probe.type==='mob-hit-event'){
      const key=ordinaryMobKey(probe.key);
      const a=attOf(ws),room=cleanRoom(a.room);
      if(key&&room.startsWith('dungeon-')){
        try{
          await this.ensureMobRoomLoaded(room);
          const {health,dead}=this.mobStores();
          const ck=this.mobCompound(room,key);
          const rec=health.get(ck),tomb=dead.get(ck),now=Date.now();
          watch={
            room,key,ck,
            wasAlive:!!(rec&&Number(rec.hp)>0&&!(tomb&&Number(tomb.at)>now)),
            wasElite:!!(rec&&rec.elite)
          };
        }catch(_){watch=null}
      }
    }

    await super.webSocketMessage(ws,message);

    if(!watch||!watch.wasAlive||watch.wasElite)return;
    try{
      const {health,dead}=this.mobStores();
      const rec=health.get(watch.ck),tomb=dead.get(watch.ck);
      const now=Date.now();
      // Only a hit that transitioned a live ordinary mob to dead reaches here.
      if(!rec||Number(rec.hp)>0||rec.elite||!tomb||!(Number(tomb.at)>now))return;

      const respawnAt=now+ordinaryRespawnDelay();
      tomb.at=respawnAt;
      dead.set(watch.ck,tomb);
      await this.persistMobRoom(watch.room);

      // Parent already broadcast its old deadline; immediately correct clients
      // with the authoritative 16-25 second deadline.
      this.roomBroadcast(watch.room,{
        type:'mob-authority',room:watch.room,key:watch.key,
        hp:0,mhp:Math.max(1,Number(rec.mhp)||1),respawnAt,
        killer:String(tomb.killer||rec.killer||''),party:String(tomb.party||rec.party||''),
        event:String(probe&&probe.event||''),
        x:rec.x,y:rec.y,aggro:false,dir:rec.dir,moving:false,target:'',
        sz:rec.sz,elite:false,eliteWindowKey:'',eliteExpiresAt:0,eliteMode:'',eliteDefBonus:0,
        ts:now
      },null);

      const delay=Math.max(0,respawnAt-Date.now())+50;
      setTimeout(async()=>{
        try{
          await this.ensureMobRoomLoaded(watch.room);
          if(this.processMobRespawns(watch.room,Date.now()))await this.persistMobRoom(watch.room);
        }catch(_){}
      },delay);
    }catch(_){}
  }
}
