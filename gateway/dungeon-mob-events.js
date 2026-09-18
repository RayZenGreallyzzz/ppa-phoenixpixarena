(function(){
  'use strict';

  var seq=0;
  var seen=new Map();
  var applying=0;

  function rt(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function room(){var d=rt();return String((d&&d.room)||'')}
  function active(){try{return typeof P!=='undefined'&&P&&P.scene==='dungeon'&&/^dungeon-/.test(room())&&typeof window.PPA_RT_SEND==='function'}catch(_){return false}}
  function selfId(){try{return String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||'')}catch(_){return''}}
  function partyId(){try{return String((window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'')}catch(_){return''}}
  function keyOf(e){if(!e||e.isBoss||e.si==null)return'';var si=Math.floor(Number(e.si));return Number.isFinite(si)&&si>=0&&si<10000?'s'+si:''}
  function entities(){try{return (typeof EN!=='undefined'&&Array.isArray(EN))?EN:[]}catch(_){return[]}}
  function find(key){var a=entities();for(var i=0;i<a.length;i++)if(keyOf(a[i])===key)return a[i];return null}
  function cleanupSeen(){var now=Date.now();seen.forEach(function(at,id){if(now-at>12000)seen.delete(id)})}

  function rewardAllowed(e){
    try{
      if(!active()||!keyOf(e))return true;
      var killer=String((e&&e.__ppaEventKiller)||'');
      var party=String((e&&e.__ppaEventParty)||'');
      if(!killer)return true;
      if(killer===selfId())return true;
      var mine=partyId();
      return !!(mine&&party&&mine===party);
    }catch(_){return true}
  }
  window.PPA_MOB_REWARD_ELIGIBLE=rewardAllowed;

  function installDropGuard(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaEventGuard)return;
      var base=dropLoot;
      var wrapped=function(e){
        if(e&&!e.isBoss&&!rewardAllowed(e))return;
        return base.apply(this,arguments);
      };
      wrapped.__ppaEventGuard=1;dropLoot=wrapped;
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  window.PPA_MOB_EVENT_DAMAGE=function(e,amount){
    try{
      if(applying||!active())return false;
      var key=keyOf(e),dmg=Number(amount);
      if(!key||!Number.isFinite(dmg)||dmg<=0)return false;
      var id=(selfId()||'self')+':'+Date.now().toString(36)+':'+(++seq);
      return !!window.PPA_RT_SEND({type:'mob-hit-event',room:room(),key:key,amount:Math.round(dmg*100)/100,event:id});
    }catch(_){return false}
  };

  window.PPA_DUNGEON_MOB_EVENT_RECEIVE=function(m){
    try{
      if(!m||String(m.room||'')!==room())return;
      var id=String(m.event||'');
      cleanupSeen();if(id&&seen.has(id))return;if(id)seen.set(id,Date.now());
      var key=String(m.key||''),dmg=Number(m.amount);
      if(!/^s\d{1,4}$/.test(key)||!Number.isFinite(dmg)||dmg<=0)return;
      var e=find(key);if(!e||e.hp<=0)return;
      e.__ppaEventKiller=String(m.attacker||'');
      e.__ppaEventParty=String(m.party||'');
      applying++;
      try{
        e.hp=Math.max(0,Number(e.hp||0)-dmg);
        e.flash=Math.max(Number(e.flash)||0,7);
        e.aggro=true;
      }finally{applying--}
    }catch(err){console.warn('PPA mob event receive',err)}
  };

  function boot(){installDropGuard();setTimeout(installDropGuard,300);setInterval(installDropGuard,4000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();