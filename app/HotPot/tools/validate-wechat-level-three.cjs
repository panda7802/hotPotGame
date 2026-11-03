'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const build = path.resolve(process.argv[2]
  || path.join(root, 'build/wechatgame-cloud-dev'));
const main = fs.readFileSync(path.join(build, 'subpackages/main/game.js'), 'utf8');
const marker = fs.readFileSync(path.join(root,
  'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
assert(main.includes(marker), 'WeChat bundle has stale client code');
const registrations = new Map(), loaded = new Map();
const environment = {System: {register(name, dependencies, declare) {
  if (typeof name === 'string') registrations.set(name, {dependencies, declare});
  else dependencies(() => {}, {}).execute();
}}};
vm.runInNewContext(fs.readFileSync(path.join(build, 'src/chunks/bundle.js'),
  'utf8'), environment);
vm.runInNewContext(main, environment);
const cc = {cclegacy: {_RF: {push() {}, pop() {}}}};
function load(name) {
  if (name === 'cc') return cc;
  if (loaded.has(name)) return loaded.get(name);
  const record = registrations.get(name);
  assert(record, 'Missing bundled module: ' + name);
  const exports = {};
  loaded.set(name, exports);
  const module = record.declare((key, value) => {
    if (typeof key === 'string') exports[key] = value;
    else Object.assign(exports, key);
    return value;
  }, {meta: {url: name}});
  record.dependencies.forEach((dependency, i) => {
    const target = dependency.startsWith('.') ? new URL(dependency, name).href
      : dependency;
    module.setters[i]?.(load(target));
  });
  module.execute();
  return exports;
}
const data = load('chunks:///_virtual/GameData.ts');
const domain = load('chunks:///_virtual/PlayerData.ts');
const cloud = require('../cloudfunctions/hotpotPlayerDev/PlayerData.js');
const snapshot = (board, removedIds = []) => ({version: 1,
  boardVersion: domain.BOARD_VERSION, levelIndex: 2,
  ...(board.layoutSeed ? {layoutSeed: board.layoutSeed} : {}),
  ingredientSeed: board.ingredientSeed,
  ingredientPoolVersion: board.ingredientPoolVersion,
  types: Array.from(board.tiles, tile => tile.type), removedIds,
  tray: [], reserve: [], reviveUsed: false, rewardedMilestones: 0,
  toolUses: {undo: 1, bomb: 1, shuffle: 1}, lastMove: null, status: 'playing'});
const checks = [];
for (let family = 0; family < 3; family++) {
  const board = data.createLevel(2, data.VARIED_LAYOUT_SEED_START + family,
    undefined, 12345);
  assert.strictEqual(board.total, 888);
  assert.strictEqual(board.config.layers.length, 50);
  assert.strictEqual(board.config.tileScale, 1);
  const route = Array.from(data.buildLevelThreeRoute(board.tiles, board.layoutSeed));
  const removed = new Set(), tray = new Map();
  let peak = 0;
  for (const index of route) {
    const tile = board.tiles[index];
    assert(tile.blockedBy.every(id => removed.has(id)), 'blocked solution step');
    removed.add(tile.id);
    tray.set(tile.type, ((tray.get(tile.type) || 0) + 1) % 3);
    const slots = Array.from(tray.values()).reduce((sum, n) => sum + n, 0);
    peak = Math.max(peak, slots);
    assert(slots < 7, 'solution fills the seven-slot tray');
  }
  assert.strictEqual(removed.size, 888);
  assert(Array.from(tray.values()).every(n => n === 0));
  const save = snapshot(board, route.slice(0, 45).map(i => board.tiles[i].id));
  const restored = domain.restoreLevel(save);
  cloud.validateGameSave(JSON.parse(JSON.stringify(save)));
  assert.strictEqual(restored.config.layers.length, 50);
  assert.strictEqual(restored.tiles.filter(t => t.removed).length, 45);
  assert(!domain.shouldUpgradeUnstartedLevelThree(save));
  checks.push({family, total: board.total, layers: 50, scale: 1,
    peak, savedAndRestored: 45});
}
for (const seed of [0, data.RANDOM_LAYOUT_SEED_START,
  data.CONNECTED_LAYOUT_SEED_START]) {
  const old = data.createLevel(2, seed, undefined, 12345);
  const save = snapshot(old);
  assert(domain.shouldUpgradeUnstartedLevelThree(save));
  const first = old.tiles.find(t => t.blockedBy.length === 0);
  const progressed = {...save, removedIds: [first.id], tray: [first.type]};
  assert(!domain.shouldUpgradeUnstartedLevelThree(progressed));
  assert.strictEqual(domain.restoreLevel(progressed).config.layers.length, 37);
}
const out = process.env.HOTPOT_WECHAT_DOMAIN_OUTPUT || path.resolve(root, '../../tmp/level3-wechat-fix-20261102');
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'wechat-domain-verification.json'),
  JSON.stringify({build: marker, package: build, checks,
    mainSha256: crypto.createHash('sha256').update(main).digest('hex'),
    legacyUntouchedUpgrade: true, progressedSavePreserved: true}, null, 2));
console.log('Actual WeChat bundle: three shapes, 888 tiles, 50 layers, '
  + 'full solutions, save/restore and prepared cloud compatibility OK');
