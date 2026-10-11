import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ORIGINAL_MERCHANT_VIEW_ROWS,projectOriginalMerchantReadOnly}
 from '../src/native-merchant-readonly.js';

// Only owner-bound, no external data and no live PPA save.
const save={
 version:17,state:{gold:3050,ppa:73,consumables:{xpScroll:7,portalStone:2},
  potions:{hp:12,hpMedium:4,mpLarge:1}}
};
const snapshot=JSON.stringify(save);
const view=projectOriginalMerchantReadOnly('12345678',save);
assert.equal(view.connected,true);
assert.equal(view.self.id,'12345678');
assert.equal(view.version,17);
assert.equal(view.wallet.gold,3050);
assert.equal(view.wallet.ppa,73);
assert.equal(view.offers.length,12);
assert.equal(ORIGINAL_MERCHANT_VIEW_ROWS.length,12);
assert.deepEqual(view.offers.map(x=>x.id),[
 'hp_small','hp_medium','hp_large','mp_small','mp_medium','mp_large',
 'magic_small','atk_speed_small','run_speed_small','phys_small','xp_scroll','portal_scroll']);
assert.equal(view.offers.find(x=>x.id==='hp_small').owned,12);
assert.equal(view.offers.find(x=>x.id==='hp_medium').owned,4);
assert.equal(view.offers.find(x=>x.id==='portal_scroll').price,20);
assert.equal(view.offers.find(x=>x.id==='portal_scroll').currency,'ppa');
assert.equal(view.offers.find(x=>x.id==='xp_scroll').owned,7);
assert.equal(view.offers.find(x=>x.id==='mp_large').owned,1);
assert.equal(view.offers.find(x=>x.id==='magic_small').price,750);
assert(!view.actions && !view.canBuy);
view.offers[0].price=1000000;
assert.equal(ORIGINAL_MERCHANT_VIEW_ROWS[0].price,100);
assert.equal(JSON.stringify(save),snapshot);
assert.equal(projectOriginalMerchantReadOnly('fake',save),null);
assert.equal(projectOriginalMerchantReadOnly('12345678',{version:0,state:save.state}),null);
assert.equal(projectOriginalMerchantReadOnly('12345678',{version:17,state:null}),null);
const missing=projectOriginalMerchantReadOnly('12345678',{version:18,state:{}});
assert.equal(missing.wallet.gold,null,'Never invent a gold balance');
assert.equal(missing.offers[0].owned,null,'Unknown count is not an owned zero');

const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const merchant=worker.split("if (url.pathname === '/api/game/merchant/state' ||")[1]
  ?.split("// Existing Phoenix game-state feature gate also controls these READ-ONLY")[0];
assert(merchant,'Missing owner-bound read route');
for(const needle of [
 'PPA_GODOT_STATE_READ_ENABLED',
 "request.method !== (action ? 'POST' : 'GET')",
 'phoenixGameSessionFromRequest(request, env, true)',
 "auth.gameId !== 'phoenix-pix-arena'",
 'phoenixAccountRow(env, auth.accountId)',
 'account.telegram_id',
 'load: id => loadSave(env, id)',
 'saved.bootstrapFromProfile',
 'projectOriginalMerchantReadOnly(ownerId, saved)',
 "contract: 'ppa-merchant-v1'",
 "ownerId, actions: String(env.PPA_MERCHANT_ACTIONS_ENABLED || '') === '1' ? ['buy'] : []"
])assert(merchant.includes(needle),'Missing merchant guard: '+needle);
assert(merchant.includes("action && String(env.PPA_MERCHANT_ACTIONS_ENABLED || '') !== '1'"),
  'Default closed action gate required');
assert(merchant.includes('sharedMerchantOperation(env, ownerId, \'action\', body, persistence)'),
  'Use previously audited server purchase rules when actions are enabled');
assert(!merchant.includes('body.price'),'Client cannot quote a price');
console.log('PPA_STABLE_MERCHANT_READ_OK offers=12 original_ids=1 signed_owner=1 read_only_default=1 no_fake_money=1 buy_gate=1');
