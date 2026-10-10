import assert from 'node:assert/strict';
import { projectNativeNpcReadOnly } from '../src/native-npc-readonly.js';

const source = {
  gold: 1250, ppa: 24000, gram: 12,
  materials: {'Кристалл Бездны': 7, 'Магическая руда': 35, 'UNKNOWN': -2},
  feathers: {phoenix: 3},
  bag: [{uid:'secret-original-uid',upgrade:7}],
};
const before = JSON.stringify(source);
const forge = projectNativeNpcReadOnly('forge', source);
assert.equal(forge.service,'forge');
assert.equal(forge.currency.ppa,24000);
assert.equal(forge.materials['Кристалл Бездны'],7);
assert.equal(forge.materials['Магическая руда'],35);
assert.equal(forge.materials.UNKNOWN,null);
assert.equal(forge.feathers.phoenix,3);
assert.equal(forge.recipeActionsEnabled,false);
assert.equal(forge.actionsEnabled,false);
assert.equal(forge.readOnly,true);
assert.equal(forge.catalogSource,'public-live-PPA:blacksmithFrame');
assert.equal(forge.bag,undefined);
assert.equal(forge.items,undefined);
assert.equal(JSON.stringify(source),before,'Must not mutate canonical save');

const absent=projectNativeNpcReadOnly('forge',{ppa:0});
assert.equal(absent.materials,null,'Unknown resource map cannot look like zero stock');
assert.equal(absent.feathers,null);
assert.equal(absent.currency.gold,null);
assert.equal(absent.currency.ppa,0);
const bad=projectNativeNpcReadOnly('forge',{
  materials:{'A':1.5,'B':'45','C':Infinity},
  feathers:{phoenix:-1},
});
for (const key of ['A','B','C']) assert.equal(bad.materials[key],null);
assert.equal(bad.feathers.phoenix,null);
const merchant=projectNativeNpcReadOnly('merchant',source);
assert.equal(merchant.materials,undefined,'Do not expose private resource ledger to other NPCs');
assert.equal(projectNativeNpcReadOnly('wrong',source),null);
console.log('PPA_NATIVE_FORGE_RESOURCE_VIEW_OK true_values=1 no_fake_stocks=1 readonly=1');
