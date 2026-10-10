// Read-only projections for Godot NPCs from the EXISTING legacy PPA save.
// No new merchant economy, battle rewards, inventory mutation or fake stats.
// A Phoenix game bearer must be verified in worker.js before calling this.
export const NATIVE_NPC_SERVICES = Object.freeze([
  'merchant', 'forge', 'storage', 'auction', 'clan', 'arena',
  'blackmarket', 'dungeon', 'fartzone',
]);

function numeric(state, names) {
  for (const name of names) {
    const value = state[name];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return null; // unknown must never become invented zero
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function projectNativeNpcReadOnly(service, state, now = Date.now()) {
  if (!NATIVE_NPC_SERVICES.includes(service)) return null;
  if (!object(state)) return null;
  const money = {
    gold: numeric(state, ['gold', 'goldBalance']),
    ppa: numeric(state, ['ppa', 'ppaBalance']),
    gram: numeric(state, ['gram', 'gramBalance']),
    arenaTokens: numeric(state, ['arenaTokens']),
    clanCoins: numeric(state, ['clanCoins']),
  };
  const out = { service, readOnly: true, currency: money, actionsEnabled: false };
  if (service === 'forge') {
    // Authoritative owned resources ONLY. The recipe catalog itself is
    // extracted from the original Telegram blacksmith by the native build;
    // this projection never invents prices, gear, material quantities or
    // a craft result. No equip/forge write operation is exposed here.
    const materials = object(state.materials);
    const feathers = object(state.feathers);
    const safeOwned = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
    out.materials = materials
      ? Object.fromEntries(Object.entries(materials)
          .filter(([name]) => typeof name === 'string' && name.length > 0 && name.length <= 120)
          .slice(0, 512).map(([name, value]) => [name, safeOwned(value)]))
      : null;
    out.feathers = feathers ? {phoenix: safeOwned(feathers.phoenix)} : null;
    out.recipeActionsEnabled = false;
    out.catalogSource = 'public-live-PPA:blacksmithFrame';
  }
  if (service === 'arena') {
    // Do not invent leaderboards or matchmaking; those belong to live PvP.
    const arena = object(state.pvp) || object(state.arena) || {};
    out.arenaTokens = money.arenaTokens;
    out.rating = numeric(arena, ['rating', 'pvpRating']);
    out.attemptsRemaining = numeric(arena, ['attemptsRemaining']);
    out.wins = numeric(arena, ['wins']);
    out.losses = numeric(arena, ['losses']);
    out.matchmakingEnabled = false;
  }
  if (service === 'blackmarket') {
    const market = object(state.blackMarket) || {};
    const expiry = numeric(market, ['refreshAt']);
    // Personal offers only if not expired, never newly rolled by native.
    out.offers = Array.isArray(market.offers) && expiry !== null && expiry > now
      ? market.offers.slice(0, 64).filter(object).map(item => ({ ...item }))
      : [];
    out.offersValidUntil = expiry;
    out.offersReadOnly = true;
  }
  if (service === 'storage') {
    const storage = object(state.storage) || {};
    const names = ['personal', 'premium', 'clan'];
    out.storageCount = Object.fromEntries(names.map(k => [k, Array.isArray(storage[k]) ? storage[k].filter(Boolean).length : null]));
  }
  return out;
}
