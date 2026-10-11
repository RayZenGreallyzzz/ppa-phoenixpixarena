// Original Telegram PPA CLAN_BONUS_VALUES and clanBonusPct() numeric rule.
// REFERENCE ONLY: these ranks are NEVER accepted from the Godot client as
// proof of membership, owned clan upgrades, siege winner or combat power.
export const ORIGINAL_CLAN_BONUS_VALUES=Object.freeze({
  mobDamage:[0,2,4,7],bossDamage:[0,3,6,10],
  hp:[0,3,6,10],mp:[0,3,6,10],
  xp:[0,3,6,10],gold:[0,3,6,10]
});
const safe=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function auditOriginalClanBonusReference(ranks) {
  const deny=status=>({source:'telegram-ppa-clan-upgrades',
    status,readOnly:true,mayApplyToCombat:false,
    serverMembershipVerified:false,clanCastleWinnerVerified:false,
    bonusPercent:null,multipliers:null});
  if(!safe(ranks))return deny('SERVER_CLAN_RANKS_REQUIRED');
  const pct={};
  for(const [name,levels] of Object.entries(ORIGINAL_CLAN_BONUS_VALUES)){
    const rank=ranks[name]??0;
    if(!Number.isSafeInteger(rank)||rank<0||rank>3)
      return deny('INVALID_CLAN_UPGRADE_RANK');
    pct[name]=levels[rank];
  }
  return {source:'telegram-ppa-clan-upgrades',
    status:'REFERENCE_ONLY',
    readOnly:true,mayApplyToCombat:false,
    serverMembershipVerified:false,clanCastleWinnerVerified:false,
    bonusPercent:pct,
    multipliers:{
      mobDamage:1+pct.mobDamage/100,
      clanBossDamage:1+pct.bossDamage/100,
      hp:1+pct.hp/100,mp:1+pct.mp/100,
      xpExcludingCastle:1+pct.xp/100,
      goldExcludingCastle:1+pct.gold/100
    }
  };
}
