'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {execFileSync} = require('child_process');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '../..');
const cloud = path.join(root, 'cloudfunctions/hotpotPlayerDev');
const config = require(path.join(cloud, 'GameConfig'));
const data = require(path.join(cloud, 'GameData'));
const domain = require(path.join(cloud, 'PlayerData'));
const plain = value => JSON.parse(JSON.stringify(value));

assert.strictEqual(config.NORMAL_INGREDIENTS.length, 50);
assert.strictEqual(config.HIDDEN_INGREDIENTS.length, 10);
assert.strictEqual(new Set(config.INGREDIENTS.map(item => item.id)).size, 60);
const rare = new Set(config.HIDDEN_INGREDIENTS.map(item => item.id));
const collection = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,
  'assets/scripts/data/CollectionData.ts'), 'utf8'), {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019}}).outputText,
{exports: collection, require: id => require(path.join(cloud, id))});
const fullMenuState = domain.emptyPlayerState();
fullMenuState.progress.discovered = config.NORMAL_INGREDIENTS.map(item => item.id);
assert(collection.achievementEntries(fullMenuState).find(item => item.id === 'full-menu').unlocked);
fullMenuState.progress.discovered = [...rare];
assert(!collection.achievementEntries(fullMenuState).find(item => item.id === 'full-menu').unlocked);

// Compare the actual previous algorithm, including complete saved boards.
const oldModules = {};
const compatibilityRevision = '98d0f650e79d4fb672967340e7c6815529c8a56c';
function previous(name) {
  if (oldModules[name]) return oldModules[name];
  const source = execFileSync('git', ['show',
    `${compatibilityRevision}:app/HotPot/assets/scripts/data/${name}.ts`], {cwd: repo, encoding: 'utf8'});
  const compiled = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019}}).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {exports, require: id => previous(id.slice(2))});
  oldModules[name] = exports;
  return exports;
}
const old = previous('GameData');
for (const version of [1, 2, 3, 4]) {
  for (let i = 0; i < 3; i++) {
    for (const seed of [0, 1, 42, 12345, 76543, 10000019, data.INGREDIENT_SEED_MAX]) {
      assert.deepStrictEqual(plain(data.selectLevelIngredients(i, seed, version)),
        plain(old.selectLevelIngredients(i, seed, version)));
      const layout = i === 2 ? data.VARIED_LAYOUT_SEED_START + 1 : 0;
      assert.deepStrictEqual(plain(data.createLevel(i, layout, undefined, seed, version)),
        plain(old.createLevel(i, layout, undefined, seed, version)));
    }
  }
}

let encounters = 0;
let firstHidden = 0;
let multipleHidden = false;
const seen = new Map();
for (let n = 1; n <= 10000; n++) {
  const seed = n * 123457;
  for (let i = 0; i < 3; i++) {
    const selected = data.selectLevelIngredients(i, seed);
    assert.strictEqual(selected.length, config.LEVELS[i].typeCount);
    assert.strictEqual(new Set(selected).size, selected.length);
    assert(!(selected.includes('beef') && selected.includes('lamb')));
    const hidden = selected.filter(id => rare.has(id));
    if (i < 2) assert.strictEqual(hidden.length, 0);
    if (i === 2 && rare.has(selected[0])) firstHidden++;
    if (hidden.length > 1) multipleHidden = true;
    if (hidden.length) {
      encounters++;
      hidden.forEach(id => {if (!seen.has(id)) seen.set(id, seed);});
    }
  }
}
assert.strictEqual(config.HIDDEN_INGREDIENT_WEIGHT, 0.1);
const observedWeightRatio = (firstHidden / 10) / ((10000 - firstHidden) / 50);
assert(Math.abs(observedWeightRatio - 0.1) < 0.015, `Weight ratio ${observedWeightRatio}`);
assert(multipleHidden, 'Weighted draws must not impose the old one-hidden-per-board cap');
assert.strictEqual(seen.size, 10, 'All hidden ingredients must be reachable');

const regions = domain.validateRegions(require(path.join(cloud, 'regions.json')));
const firstVisitKinds = new Set();
assert(data.needsHiddenIngredientGuarantee([]));
assert(data.needsHiddenIngredientGuarantee(config.NORMAL_INGREDIENTS.map(food => food.id)));
for (const id of rare) {
  assert(!data.needsHiddenIngredientGuarantee([id]));
  assert(!data.needsHiddenIngredientGuarantee(['beef', id]));
}
for (const start of [1, 42, data.INGREDIENT_SEED_MAX, ...Array.from({length: 1000}, (_, i) => 1 + i * 123457)]) {
  const seed = data.guaranteedHiddenIngredientSeed(start);
  const selected = data.selectLevelIngredients(2, seed);
  assert(selected.some(id => rare.has(id)), 'Guaranteed third-level entry must contain a hidden ingredient');
  selected.filter(id => rare.has(id)).forEach(id => firstVisitKinds.add(id));
  if (data.selectLevelIngredients(2, start).some(id => rare.has(id))) assert.strictEqual(seed, start);
}
assert.strictEqual(firstVisitKinds.size, 10, 'First visit must not be fixed to one premium ingredient');
const legacyProgress = plain(domain.emptyProgress());
delete legacyProgress.thirdLevelEntered;
assert.strictEqual(domain.validateProgress(legacyProgress).thirdLevelEntered, false);
assert.throws(() => domain.validateProgress({...legacyProgress, thirdLevelEntered: 'yes'}));
legacyProgress.bestCleared[2] = 3;
assert.strictEqual(domain.validateProgress(legacyProgress).thirdLevelEntered, true);
console.log('Uncollected premium ingredient guarantee: empty/ordinary-only collection eligible, any of 10 collected premium kinds ineligible; 1003 starting seeds guaranteed; legacy progress migration: OK');
for (const [id, seed] of seen) {
  let level;
  for (let offset = 0; offset < 64; offset++) {
    level = data.createLevel(2, data.VARIED_LAYOUT_SEED_START + offset, undefined, seed);
    if (level.tiles.some(tile => tile.type === id && tile.blockedBy.length === 0)) break;
  }
  const save = {version: 1, boardVersion: domain.BOARD_VERSION, levelIndex: 2,
    layoutSeed: level.layoutSeed, ingredientSeed: seed, ingredientPoolVersion: 4,
    types: level.tiles.map(tile => tile.type), removedIds: [], tray: [], reserve: [],
    reviveUsed: false, rewardedMilestones: 0, toolUses: {undo: 1, bomb: 1, shuffle: 1},
    lastMove: null, status: 'playing'};
  assert.strictEqual(level.ingredientPoolVersion, 4);
  assert.deepStrictEqual(domain.validateGameSave(plain(save)), save);
  assert.deepStrictEqual(plain(domain.restoreLevel(save)), plain(level));
  const entered = domain.validatePlayerState({...domain.emptyPlayerState(), save}, regions);
  assert.strictEqual(entered.progress.thirdLevelEntered, true);
  assert.strictEqual(entered.progress.discovered.length, 0, 'Entering alone must not discover ingredients');
  assert.deepStrictEqual(entered.save.types, save.types, 'Existing third-level board must remain unchanged');
  const nextDay = domain.enterPlayDay(entered, '2026-11-05');
  assert.strictEqual(nextDay.save, null);
  assert.strictEqual(nextDay.progress.thirdLevelEntered, true);
  const mergedEntry = domain.mergeProgress(domain.emptyProgress(), entered.progress);
  assert.strictEqual(mergedEntry.thirdLevelEntered, true);
  assert.strictEqual(domain.mergeProgress(entered.progress, domain.emptyProgress()).thirdLevelEntered, true);
  assert.strictEqual(domain.validatePlayerState(JSON.parse(JSON.stringify(nextDay)), regions).progress.thirdLevelEntered, true);
  const counts = new Map();
  save.types.forEach(type => counts.set(type, (counts.get(type) || 0) + 1));
  assert([...counts.values()].every(count => count % 3 === 0));
  const tile = level.tiles.find(tile => tile.type === id && tile.blockedBy.length === 0);
  assert(tile, 'A hidden ingredient must be obtainable on the top layer');
  save.removedIds.push(tile.id);
  save.tray.push(id);
  save.lastMove = {removedIds: [], tray: [], reserve: []};
  const state = domain.validatePlayerState({profile: {regionCodes: []}, save,
    progress: domain.emptyProgress()}, regions);
  assert(state.progress.discovered.includes(id), 'Picking must permanently discover hidden food');
  const merged = domain.mergeProgress(state.progress, domain.emptyProgress());
  assert(merged.discovered.includes(id), 'Cloud merge must retain discovery');
  const shuffled = plain(save);
  const remaining = shuffled.types.filter((_, i) => level.tiles[i].id !== tile.id).reverse();
  shuffled.types = shuffled.types.map((type, i) => level.tiles[i].id === tile.id ? type : remaining.shift());
  domain.validateGameSave(shuffled);
  const foreign = plain(save);
  foreign.ingredientPoolVersion = 2;
  assert.throws(() => domain.validateGameSave(foreign), 'v2 must reject hidden food');
}

if (process.argv.includes('--art')) {
  const atlas = fs.readFileSync(path.join(root, 'assets/resources/ingredients/food-c.png'));
  assert.strictEqual(atlas.readUInt32BE(16), 800);
  assert.strictEqual(atlas.readUInt32BE(20), 800);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/ingredients/food-c.png.meta')));
  assert(meta.userData.hasAlpha);
  assert.notStrictEqual(meta.uuid, JSON.parse(fs.readFileSync(path.join(root,
    'assets/resources/ingredients/food-b.png.meta'))).uuid);
}
console.log(`Hidden ingredients: ${encounters}/10000 third-level encounters, all 10 reachable; ` +
  `first-draw per-kind hidden/normal ratio ${observedWeightRatio.toFixed(4)}; ` +
  'old v1-v4 boards unchanged, restore/shuffle/discovery/cloud merge validated.');

const inventory = level => JSON.stringify(level.tiles.map(tile => tile.type).sort());
for (const version of [1, 2, 3, 4]) {
  for (const index of [0, 1, 2]) {
    for (const seed of [0, 1, 12345, 2147483646]) {
      let level = data.createLevel(index, index === 2 ? data.VARIED_LAYOUT_SEED_START : 0,
        undefined, seed, version);
      const expected = inventory(level);
      for (let retry = 0; retry < 5; retry++) {
        const restarted = data.createRestartLevel(level);
        assert.strictEqual(inventory(restarted), expected, 'Manual restart changed ingredient counts');
        assert.strictEqual(restarted.ingredientSeed, level.ingredientSeed);
        assert.strictEqual(restarted.ingredientPoolVersion, level.ingredientPoolVersion);
        if (index === 2) assert.notStrictEqual(restarted.layoutSeed, level.layoutSeed);
        else assert.notDeepStrictEqual(restarted.tiles.map(tile => tile.type), level.tiles.map(tile => tile.type));
        const save = {version: 1, boardVersion: domain.BOARD_VERSION, levelIndex: index,
          ...(restarted.layoutSeed ? {layoutSeed: restarted.layoutSeed} : {}),
          ...(restarted.ingredientSeed ? {ingredientSeed: restarted.ingredientSeed} : {}),
          ...(restarted.ingredientPoolVersion ? {ingredientPoolVersion: restarted.ingredientPoolVersion} : {}),
          types: restarted.tiles.map(tile => tile.type), removedIds: [], tray: [], reserve: [],
          reviveUsed: false, rewardedMilestones: 0,
          toolUses: index ? {undo: 1, bomb: 1, shuffle: 1} : {undo: 0, bomb: 0, shuffle: 0},
          lastMove: null, status: 'playing'};
        domain.validateGameSave(save);
        assert.strictEqual(inventory(domain.restoreLevel(save)), expected);
        level = restarted;
      }
    }
  }
}
console.log('Manual restart: all 3 levels × 4 pool versions × 4 seeds × 5 retries, unchanged inventory, new layouts and save restore: OK');
