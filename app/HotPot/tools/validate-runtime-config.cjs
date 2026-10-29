'use strict';
const assert = require('assert');
const {createHandler} = require('../cloudfunctions/hotpotPlayerDev/handler');
const {normalizeRuntimeConfig} = require('../cloudfunctions/hotpotPlayerDev/RuntimeConfig');
const defaults = {collectionHeadingTaps: 6, collectionIngredientTaps: 3};
const settings = {enabled: true, environmentId: 'config-dev-test',
  collectionName: 'hotpot_players_dev', appId: 'test-app'};
let document = {collectionHeadingTaps: 2, collectionIngredientTaps: 4};
let reads = 0;
const cloud = {
  getWXContext: () => ({ENV: settings.environmentId,
    APPID: settings.appId, OPENID: 'test-player'}),
  database: () => ({collection(name) {
    assert.strictEqual(name, 'hotpot_config_dev');
    return {doc(id) {
      assert.strictEqual(id, 'runtime');
      return {async get() {reads++; return {data: document};}};
    }};
  }}),
};
(async () => {
  for (const value of [null, {}, {collectionHeadingTaps: 0},
    {collectionHeadingTaps: '2', collectionIngredientTaps: 100},
    {collectionHeadingTaps: 1.5, collectionIngredientTaps: -1}]) {
    assert.deepStrictEqual(normalizeRuntimeConfig(value), defaults);
  }
  const handler = createHandler(cloud, settings, {}, [], settings.environmentId);
  assert.deepStrictEqual((await handler({action: 'config'})).config, document);
  // Request fields must never override an operator's document.
  assert.deepStrictEqual((await handler({action: 'config',
    collectionHeadingTaps: 1, collectionIngredientTaps: 1})).config, document);
  document = {collectionHeadingTaps: 9, collectionIngredientTaps: 5};
  assert.deepStrictEqual((await handler({action: 'config'})).config, document);
  document = null;
  assert.deepStrictEqual((await handler({action: 'config'})).config, defaults);
  assert.strictEqual(reads, 4);
  cloud.getWXContext = () => ({ENV: settings.environmentId});
  assert.strictEqual((await handler({action: 'config'})).code, 'IDENTITY_REQUIRED');
  assert.strictEqual(reads, 4);
  console.log('Runtime config: live edits, read-only action, identity guard, missing/invalid field defaults: OK');
})().catch((error) => {console.error(error); process.exitCode = 1;});
