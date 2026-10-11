import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NATIVE_NPC_SERVICES,projectNativeNpcReadOnly}
 from '../src/native-npc-readonly.js';

// No live network, D1, payment, Telegram session, or save write.
const state={
  gold:1234,ppa:92,gram:7,arenaTokens:5,
  storage:{personal:[{uid:'weapon-plus7'}],premium:[],clan:[{uid:'pet-1'}]},
  blackMarket:{refreshAt:1900000000000,
    offers:[{id:'offerA',name:'Пет',price:450,item:{uid:'pet-1',stats:{atk:9}}}],
    bought:{offerA:1}},
  pvp:{rating:1140,wins:4,losses:2},
  materials:{iron:30},feathers:{phoenix:3}
};
const original=structuredClone(state);
for(const service of NATIVE_NPC_SERVICES) {
  const view=projectNativeNpcReadOnly(service,state,1800000000000);
  assert(view && view.service===service);
  assert.equal(view.readOnly,true);
  assert.equal(view.actionsEnabled,false);
  assert.equal(view.currency.gold,1234);
  assert.equal(view.currency.ppa,92);
  assert.equal(view.currency.gram,7);
  assert(!('canBuy' in view));
  assert(!('inventoryWrite' in view));
}
const market=projectNativeNpcReadOnly('blackmarket',state,1800000000000);
assert.equal(market.offers.length,1);
assert.equal(market.offers[0].bought,1);
market.offers[0].item.stats.atk=999;
assert.equal(state.blackMarket.offers[0].item.stats.atk,9,
  'Server projection aliased original Telegram save');
assert.equal(projectNativeNpcReadOnly('blackmarket',state,2000000000000).offers.length,0);
const forge=projectNativeNpcReadOnly('forge',state,1800000000000);
assert.equal(forge.recipeActionsEnabled,false);
assert.equal(forge.materials.iron,30);
const storage=projectNativeNpcReadOnly('storage',state);
assert.equal(storage.storageCount.personal,1);
assert.equal(storage.storageCount.clan,1);
assert.equal(projectNativeNpcReadOnly('impossible',state),null);
assert.equal(projectNativeNpcReadOnly('merchant',null),null);
assert.deepEqual(state,original);

const src=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const part=src.split("if (url.pathname.startsWith('/api/game/npc/')) {")[1];
assert(part,'Stable Worker NPC route is missing');
const route=part.split("return apiError('Game API route not found', 404, 'NOT_FOUND');\n  } catch (err)")[0];
for(const essential of [
 'PPA_GODOT_STATE_READ_ENABLED',
 "request.method !== 'GET'",
 'NATIVE_NPC_SERVICES.includes(service)',
 'phoenixGameSessionFromRequest(request, env, true)',
 "auth.gameId !== 'phoenix-pix-arena'",
 'phoenixAccountRow(env, auth.accountId)',
 'account.telegram_id',
 'loadSave(env, ownerId)',
 'saved.bootstrapFromProfile',
 'Number.isSafeInteger(saved.version)',
 'projectNativeNpcReadOnly(service, saved.state)',
 'ownerId, service, version: saved.version',
 'readOnly: true'
]) assert(route.includes(essential),'Missing safety check '+essential);
assert(!route.includes('saveGameState('),'NPC route must never mutate a save');
assert(!route.includes('executeNativeCommandOnce'),'NPC route must never mutate inventory');
assert(!route.includes('body.price'),'NPC route must not accept a client quote');
const main=src.split("if (url.pathname === '/api/game/state') {")[1];
assert(main.includes('PPA_GODOT_STATE_READ_ENABLED'));
console.log('PPA_STABLE_NPC_READ_CUTOVER_OK signed_owner=1 game=1 save_gate=1 services='+NATIVE_NPC_SERVICES.length+
 ' stock_cloned=1 expired_market=1 no_price_write=1 no_D1_mutation=1');
