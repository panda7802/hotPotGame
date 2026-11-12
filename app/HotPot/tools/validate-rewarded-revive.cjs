'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const timers = new Set();
const exportsObject = {};
const source = path.join(__dirname, '../assets/scripts/core/WechatRewardedVideoService.ts');
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
}).outputText, {
  exports: exportsObject, globalThis: {}, console: {warn() {}},
  setTimeout: callback => {timers.add(callback); return callback;},
  clearTimeout: callback => timers.delete(callback),
});
const {WechatRewardedVideoService} = exportsObject;
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
}

main().catch(error => {console.error(error); process.exitCode = 1;});
