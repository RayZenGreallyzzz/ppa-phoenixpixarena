// Native PPA contract guard: read-only authenticated state transfer.
// No Cloudflare secrets or real player data used.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/game/state')");
const end = source.indexOf("\n    return apiError('Game API route not found'", start);
assert(start > 0 && end > start, 'Godot state route is missing');
const route = source.slice(start, end);
assert(route.includes("PPA_GODOT_STATE_READ_ENABLED"), "Production gate must default OFF");
assert(route.includes("String(env.PPA_GODOT_STATE_READ_ENABLED || '') !== '1'"), "No implicit production enable");
assert(route.includes("request.method !== 'GET'"), 'Only GET can read native save');
assert(route.includes("phoenixGameSessionFromRequest(request, env, true)"), 'Must validate signed game session');
assert(route.includes("auth.gameId !== 'phoenix-pix-arena'"), 'No cross-game save access');
assert(route.includes("phoenixAccountRow(env, auth.accountId)"), 'Never trust client-supplied owner');
assert(route.includes("accountRow.telegram_id"), 'Always resolve saved state through linked Telegram ID');
assert(route.includes("loadSave(env, telegramId)"), 'Read from the authoritative existing save system');
assert(route.includes("readOnly: true"), 'Explicitly identify immutable client snapshot');
assert(!/saveGameState|registerCharacter|upsertBoundInitialSave|\.run\(|DELETE FROM|UPDATE saves|INSERT INTO/.test(route),
  'Never mutate account/character/save from native read route');
assert(!/searchParams\.get\(['"]telegramId|body\.telegramId|request\.headers\.get\(['"]x-telegram-id/.test(route),
  'Never allow arbitrary Telegram ID lookup from native');
console.log('PPA_NATIVE_AUTH_READONLY_CONTRACT_OK signed_session=1 account_bound=1 saves_writes=0');
