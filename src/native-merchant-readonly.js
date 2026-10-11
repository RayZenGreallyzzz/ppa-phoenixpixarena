// Minimal non-spending native merchant catalogue for stable PPA Worker.
// 12 exact original Telegram merchantFrame entries (also audited by
// tools/test-shared-merchant.mjs in the staged feature). This module does NOT
// buy, create, deliver, or change any PPA items, gold or wallet balances.
export const ORIGINAL_MERCHANT_VIEW_ROWS=Object.freeze([
 ['hp_small','Малое зелье HP',100,'gold','potions','hp'],
 ['hp_medium','Среднее зелье HP',250,'gold','potions','hpMedium'],
 ['hp_large','Большое зелье HP',500,'gold','potions','hpLarge'],
 ['mp_small','Малое зелье маны',100,'gold','potions','mp'],
 ['mp_medium','Среднее зелье маны',250,'gold','potions','mpMedium'],
 ['mp_large','Большое зелье маны',500,'gold','potions','mpLarge'],
 ['magic_small','Магическая сила',750,'gold','consumables','magicSmall'],
 ['atk_speed_small','Скорость атаки',750,'gold','consumables','atkSpeedSmall'],
 ['run_speed_small','Скорость бега',750,'gold','consumables','speedSmall'],
 ['phys_small','Физическая сила',750,'gold','consumables','physSmall'],
 ['xp_scroll','Свиток опыта',1000,'gold','consumables','xpScroll'],
 ['portal_scroll','Свиток телепорта',20,'ppa','consumables','portalStone']
].map(([id,name,price,currency,group,key])=>Object.freeze({id,name,price,currency,group,key})));

const safeBalance=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
  ?value:null;
const safeCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;

// For an authenticated owner and an existing save version only.
// Deliberately does not expose buy capabilities or misleading fake balances.
export function projectOriginalMerchantReadOnly(ownerId,saved) {
 if(!/^\d{1,24}$/.test(String(ownerId||''))||!saved ||
    !saved.state||typeof saved.state!=='object'||Array.isArray(saved.state)||
    !Number.isSafeInteger(saved.version)||saved.version<1)return null;
 const state=saved.state;
 return {connected:true,self:{id:String(ownerId)},version:saved.version,
  wallet:{gold:safeBalance(state.gold),ppa:safeBalance(state.ppa)},
  offers:ORIGINAL_MERCHANT_VIEW_ROWS.map(({group,key,...offer})=>({
   ...offer,owned:safeCount(state[group]?.[key])
  }))};
}
