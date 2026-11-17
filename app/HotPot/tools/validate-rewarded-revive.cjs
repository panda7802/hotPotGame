'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const timers = new Set();
function loadAdModules() {
  const cache = new Map();
  function load(name) {
    const source = path.resolve(__dirname, '../assets/scripts/core', name + '.ts');
    if (cache.has(source)) return cache.get(source);
    const exports = {};
    cache.set(source, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
    }).outputText, {
      exports, require: load, globalThis: {}, console: {warn() {}},
      setTimeout: callback => {timers.add(callback); return callback;},
      clearTimeout: callback => timers.delete(callback),
    });
    return exports;
  }
  return load;
}
const loadAdModule = loadAdModules();
const {WechatRewardedVideoService} = loadAdModule('WechatRewardedVideoService');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const ad = {
    closes: new Set(), errors: new Set(), shows: 0, loads: 0, destroyed: false,
    show() {this.shows++; return Promise.resolve();},
    load() {this.loads++; return Promise.resolve();},
    onClose(callback) {this.closes.add(callback);},
    offClose(callback) {this.closes.delete(callback);},
    onError(callback) {this.errors.add(callback);},
    offError(callback) {this.errors.delete(callback);},
    destroy() {this.destroyed = true;},
    close(result) {for (const listener of [...this.closes]) listener(result);},
  };
  let creations = 0;
  const service = new WechatRewardedVideoService({
    createRewardedVideoAd(options) {
      assert.equal(options.adUnitId, 'adunit-406d51b037be9f14');
      creations++;
      return ad;
    },
  });
  return {service, ad, creations: () => creations};
}

async function main() {
  assert.equal(await new WechatRewardedVideoService({}).show(), 'unsupported');
  const {service, ad, creations} = fixture();
  service.prepare();
  service.prepare();
  assert.equal(creations(), 1);
  let pending = service.show();
  assert.equal(await service.show(), 'busy');
  const oldClose = [...ad.closes][0];
  ad.close({isEnded: true});
  oldClose({isEnded: true});
  assert.equal(await pending, 'completed');
  assert.equal(ad.closes.size, 0);
  assert.equal(ad.errors.size, 0);
  assert.equal(timers.size, 0);
  pending = service.show();
  oldClose({isEnded: true});
  ad.close({isEnded: false});
  assert.equal(await pending, 'cancelled');
  pending = service.show();
  ad.close(undefined);
  assert.equal(await pending, 'cancelled');

  const slots = [];
  const separate = new WechatRewardedVideoService({createRewardedVideoAd({adUnitId}) {
    const ad = fixture().ad;
    slots.push({adUnitId, ad});
    return ad;
  }});
  separate.prepare();
  pending = separate.show('adunit-4bfa2babdf8bbd0e');
  assert.equal(slots[1].adUnitId, 'adunit-4bfa2babdf8bbd0e');
  assert(slots[0].ad.destroyed);
  assert.equal(await separate.show(), 'busy');
  slots[1].ad.close({isEnded: true});
  assert.equal(await pending, 'completed');
  pending = separate.show();
  assert.equal(slots[2].adUnitId, 'adunit-406d51b037be9f14');
  assert(slots[1].ad.destroyed);
  slots[2].ad.close({isEnded: false});
  assert.equal(await pending, 'cancelled');
  separate.dispose();

  const retry = fixture();
  retry.ad.show = function () {
    this.shows++;
    return this.shows === 1 ? Promise.reject(Error('cache miss')) : Promise.resolve();
  };
  pending = retry.service.show();
  await tick();
  assert.equal(retry.ad.loads, 1);
  assert.equal(retry.ad.shows, 2);
  retry.ad.close({isEnded: true});
  assert.equal(await pending, 'completed');
  const failure = fixture();
  failure.ad.show = () => Promise.reject(Error('show failed'));
  failure.ad.load = () => Promise.reject(Error('load failed'));
  assert.equal(await failure.service.show(), 'failed');

  const late = fixture();
  let resolveLoad;
  late.ad.show = () => Promise.reject(Error('not loaded'));
  late.ad.load = () => new Promise(resolve => {resolveLoad = resolve;});
  pending = late.service.show();
  await tick();
  late.service.dispose();
  resolveLoad();
  await tick();
  assert.equal(await pending, 'cancelled');
  assert(late.ad.destroyed);

  const timeout = fixture();
  pending = timeout.service.show();
  for (const callback of [...timers]) callback();
  assert.equal(await pending, 'failed');
  assert(timeout.ad.destroyed);
  const error = fixture();
  pending = error.service.show();
  await tick();
  for (const callback of [...error.ad.errors]) callback(Error('playback error'));
  assert.equal(await pending, 'failed');
  assert.equal(timers.size, 0);
  const data = require('../cloudfunctions/hotpotPlayerDev/GameData');
  const domain = require('../cloudfunctions/hotpotPlayerDev/PlayerData');
  const level = data.createLevel(2, data.VARIED_LAYOUT_SEED_START);
  const tray = [];
  const reserve = [];
  const removedIds = [];
  for (const tile of level.tiles) {
    if (tray.length < 4 && tray.filter(type => type === tile.type).length < 2) {
      tray.push(tile.type);
    } else if (reserve.length < 6) {
      reserve.push(tile.type);
    } else {
      continue;
    }
    removedIds.push(tile.id);
    if (tray.length === 4 && reserve.length === 6) break;
  }
  const save = {version: 1, boardVersion: domain.BOARD_VERSION, levelIndex: 2,
    layoutSeed: level.layoutSeed, ingredientSeed: level.ingredientSeed,
    ingredientPoolVersion: level.ingredientPoolVersion, types: level.tiles.map(tile => tile.type),
    removedIds, tray, reserve, reviveUsed: true, rewardedMilestones: 0,
    toolUses: {undo: 1, bomb: 1, shuffle: 1}, lastMove: null, status: 'playing'};
  assert.equal(domain.validateGameSave(save).reserve.length, 6);
  assert.equal(domain.validateGameSave({...save, lastMove: {tray, reserve, removedIds}}).lastMove.reserve.length, 6);
  assert.throws(() => domain.validateGameSave({...save, reserve: reserve.slice(1)}), /不守恒/);
  assert.equal(domain.restoreLevel(save).tiles.filter(tile => tile.removed).length, removedIds.length);
  console.log('Rewarded video: completion, cancellation, unknown close, retry, failure, '
    + 'busy, stale callbacks, disposal, timeout and repeated-revive cloud saves OK');

  const {WechatNativeAdService} = loadAdModule('WechatNativeAdService');
  const nativeAds = [];
  let nativeShows = 0;
  let nativeDestroyed = false;
  const host = {createCustomAd({adUnitId}) {
    const ad = {adUnitId, style: {}, onError() {},
      onClose(close) {this.close = close;}, onResize(resize) {this.resize = resize;},
      async show() {nativeShows++;}, async hide() {},
      destroy() {this.destroyed = nativeDestroyed = true;}};
    nativeAds.push(ad);
    return ad;
  }};
  const native = new WechatNativeAdService(host);
  const bounds = {width: 300, left: 20, top: 400};
  assert(native.prepare(bounds.width, 'settings'));
  native.show(bounds, 'ranking', () => {});
  await tick();
  assert.equal(nativeAds.length, 1);
  assert.equal(nativeAds[0].adUnitId, 'adunit-253cf09b57a1e3d9');
  assert.equal(nativeShows, 1);
  native.show(bounds, 'collection', () => {});
  await tick();
  const collection = nativeAds[1];
  assert(nativeAds[0].destroyed);
  assert.equal(collection.adUnitId, 'adunit-c71919c100419c22');
  collection.resize({width: 300, height: 120});
  assert.equal(native.size(300, 'collection').height, 120);
  assert.equal(native.size(300, 'achievements').height, 105);
  let closed = false;
  native.show(bounds, 'achievements', reason => {closed = reason === 'closed';});
  await tick();
  assert(collection.destroyed);
  collection.close();
  assert.equal(closed, false);
  assert.equal(nativeAds[2].adUnitId, 'adunit-ed625cbfe9bd497b');
  native.position({...bounds, width: 280}, 'achievements');
  await tick();
  assert(nativeAds[2].destroyed);
  assert.equal(nativeAds[3].adUnitId, 'adunit-ed625cbfe9bd497b');
  assert.equal(nativeShows, 4);

  loadAdModule('AdSession').disableAdsForSession();
  native.dispose();
  retry.service.dispose();
  assert(nativeDestroyed && retry.ad.destroyed);
  assert.equal(await retry.service.show(), 'skipped');
  assert.equal(native.prepare(bounds.width, 'collection'), false);
  assert.equal(new WechatNativeAdService(host).supported, false);
  assert.equal(nativeAds.length, 4);
  const recreated = fixture();
  recreated.service.prepare();
  assert.equal(await recreated.service.show(), 'skipped');
  assert.equal(recreated.creations(), 0);

  const restarted = loadAdModules();
  const restartedNative = new (restarted('WechatNativeAdService').WechatNativeAdService)(host);
  assert.equal(restartedNative.prepare(bounds.width, 'achievements'), true);
  assert.equal(nativeAds.length, 5);
  restartedNative.dispose();
  const restartedRewarded = new (restarted('WechatRewardedVideoService').WechatRewardedVideoService)({});
  assert.equal(await restartedRewarded.show(), 'unsupported');
  console.log('Native placements, independent measurements, stale callbacks and ad switch OK');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
