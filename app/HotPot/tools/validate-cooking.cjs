'use strict';

const assert = require('node:assert/strict');
const root = '../cloudfunctions/hotpotPlayerDev/';
const data = require(root + 'CookingData');
const progress = require(root + 'CookingProgress');
const player = require(root + 'PlayerData');
const {INGREDIENTS} = require(root + 'GameConfig');
const {createHandler} = require(root + 'handler');
const regions = require(root + 'regions.json');
const discovered = INGREDIENTS.map(food => food.id);
const source = 'devicecooking1';

assert.equal(data.RECIPES.length, 13);
assert.equal(data.RECIPES.filter(dish => !dish.advanced).length, 6);
assert.equal(new Set(data.RECIPES.map(data.recipeKey)).size, 13);

for (const dish of data.RECIPES) {
  const batches = data.recipeBatches(dish);
  assert.deepEqual(batches.flat(), dish.ingredients);
  assert(batches.every(batch => batch.length <= 3));
  const portions = Object.fromEntries(dish.ingredients);
  assert.deepEqual([data.scoreCooking(dish, portions).stars, data.scoreCooking(dish, portions).score],
    [5, data.recipeMax(dish)]);
  assert(dish.ingredients.every(([id]) => discovered.includes(id)));

  let seed = 42;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let sample = 0; sample < 32; sample++) {
    for (const batch of batches) {
      const drops = data.cookingDrops(dish, batch, discovered, 25 / batches.length, random);
      assert(drops.every((drop, i) => drop.lane >= 0 && drop.lane < 4
        && (!i || drop.arrival - drops[i - 1].arrival >= 3 * data.COOKING_MOVE_TIME)));
      for (const [id, target] of batch) {
        const count = drops.filter(drop => drop.id === id).length;
        assert(count === target + 1 || count === target + 2);
      }
    }
  }
}

const [soup, shrimp] = data.RECIPES;
const score = portions => {
  const {score, stars} = data.scoreCooking(soup, portions);
  return [score, stars];
};
assert.deepEqual(score({tomato: 3, toufu: 2}), [83, 3]);
assert.deepEqual(score({tomato: 4, toufu: 2}), [83, 3]);
assert.deepEqual(score({tomato: 3, toufu: 3, corn: 1}), [83, 3]);
assert.deepEqual(score({tomato: 6, toufu: 6}), [0, 0]);

const seafood = data.findRecipe('mixed-seafood@1');
const round = new data.CookingRound(seafood, [
  [{id: 'kingcrab', lane: 2, arrival: 0.1}, {id: 'shrimp', lane: 2, arrival: 0.9}],
  [{id: 'toufu', lane: 1, arrival: 1}],
]);
assert.equal(round.move(1), true);
round.advance(0.1);
assert.deepEqual(round.portions, {}, 'plate must be fully in its lane to catch');
assert.equal(round.nextBatch(), false);
round.advance(0.8);
assert.deepEqual(round.portions, {shrimp: 1});
assert.equal(round.nextBatch(), true);
assert(round.hasFood, 'food from the first batch remains available at settlement');
assert(round.move(-1));
round.advance(1);
assert.deepEqual(round.portions, {shrimp: 1, toufu: 1});
assert.deepEqual([...round.caught].map(drop => drop.id), ['shrimp', 'toufu']);

const tiltRound = new data.CookingRound(soup, [[
  {id: 'tomato', lane: 2, arrival: 0.08},
  {id: 'toufu', lane: 3, arrival: 0.2},
]]);
assert.equal(tiltRound.moveTo(3), true);
assert.equal(tiltRound.moveTo(0), false);
tiltRound.advance(0.21);
assert.deepEqual(tiltRound.portions, {toufu: 1}, 'a direct tilt catches only at the destination');

const at = 1_800_000_000_000;
const portions = {tomato: 3, toufu: 3};
const key = data.recipeKey(soup);
const a = progress.settleCooking(progress.emptyCooking(), soup, portions, source, 1, at);
assert.equal(progress.settleCooking(a, soup, portions, source, 1, at), a);
assert.equal(progress.settleCooking(a, data.practiceRecipe(discovered), portions, source, 2, at), a);
const later = progress.settleCooking(a, soup, {tomato: 1}, source, 2, at + 10);
const b = progress.settleCooking(progress.emptyCooking(), shrimp, {shrimp: 4, corn: 3}, 'devicecooking2', 1, at - 10);
const combined = progress.mergeCooking(later, b);
assert.deepEqual(combined, progress.mergeCooking(b, later));
assert.equal(progress.distinctCookingClears(combined), 2);
assert.equal(progress.cookingClearCount(combined), 2);
assert.deepEqual(combined.dishes[key].best, portions);
assert.equal(combined.dishes[key].firstPerfect, at);
assert.equal(progress.cookingCooldown(combined, key, at + 10), 600000);
assert.equal(progress.skipCookingCooldown(combined, key, `${source}-1`), combined);
const skipped = progress.skipCookingCooldown(combined, key, `${source}-2`);
assert.equal(progress.cookingCooldown(progress.mergeCooking(combined, skipped), key, at + 10), 0);
assert.deepEqual(progress.validateCooking(JSON.parse(JSON.stringify(skipped))), skipped);
assert.deepEqual(progress.validateCooking({...skipped, signature: {key, at}}), skipped);
assert.equal(progress.cookingRankTime(combined), 0);
console.log('Cooking recipes, drop reachability, multi-batch catches, scoring, cooldown and merge: OK');

async function validateCloud() {
  const records = new Map();
  const queries = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const collection = () => ({
    doc(id) {
      return {
        async get() {
          if (!records.has(id)) throw new Error('document not found');
          return {data: clone(records.get(id))};
        },
        async set({data: row}) { records.set(id, clone(row)); },
        async remove() { records.delete(id); },
      };
    },
    where(filter) {
      queries.push(filter);
      let data = [...records.values()].filter(row => Object.entries(filter).every(([key, value]) => row[key] === value));
      const orders = [];
      return {
        orderBy(key) { orders.push(key); return this; },
        limit(count) {
          data.sort((a, b) => {
            for (const key of orders) {
              if (a[key] < b[key]) return -1;
              if (a[key] > b[key]) return 1;
            }
            return 0;
          });
          data = data.slice(0, count);
          return this;
        },
        field(fields) { data = data.map(row => Object.fromEntries(Object.keys(fields).map(key => [key, row[key]]))); return this; },
        async get() { return {data}; },
      };
    },
  });
  const settings = {enabled: true, environmentId: 'test-cooking', appId: 'wx-test', collectionName: 'hotpot_players_dev'};
  let transactions = Promise.resolve();
  const db = {collection, runTransaction(callback) {
    const execution = transactions.then(async () => ({result: await callback({collection})}));
    transactions = execution.catch(() => {});
    return execution;
  }};
  const makeClient = (id, web = false) => createHandler({
    getWXContext: () => ({APPID: settings.appId, ...(web ? {UID: id} : {OPENID: id}), ENV: settings.environmentId}),
    database: () => db,
  }, settings, player, regions, settings.environmentId);
  const alice = makeClient('alice'), bob = makeClient('bob', true);
  assert.equal((await alice({action: 'cookingLeaderboard', scope: 1})).code, 'REGION_REQUIRED');
  const full = data.RECIPES.reduce((save, dish, index) => progress.settleCooking(save, dish,
    Object.fromEntries(dish.ingredients), source, index + 1, 1), progress.emptyCooking());
  const makeState = province => ({
    ...player.emptyPlayerState(),
    profile: {regionCodes: [province.code, province.children?.[0]?.code,
      province.children?.[0]?.children?.[0]?.code].filter(Boolean)},
    progress: {...player.emptyProgress(), discovered, cooking: full},
  });
  const province1 = regions.find(region => region.children?.length);
  const province2 = regions.find(region => region.code !== province1.code);
  const send = (client, state, expectedRevision) => client({action: 'save', state,
    expectedRevision, mutationId: `cooking-save-${expectedRevision}`});
  const before = Date.now();
  const first = await send(alice, makeState(province1), 0);
  const second = await send(bob, makeState(province2), 0);
  assert(first.ok && second.ok, JSON.stringify([first.code, second.code]));
  assert.equal(first.cookingSyncVersion, 1);
  const completedAt = progress.cookingRankTime(first.player.state.progress.cooking);
  assert(completedAt >= before && completedAt <= Date.now());
  assert.equal((await alice({action: 'cookingLeaderboard', scope: 0})).rows.length, 2);
  for (const scope of [1, 2]) {
    const result = await alice({action: 'cookingLeaderboard', scope});
    assert.deepEqual(result.rows, [{playerId: first.player.playerId, at: completedAt}]);
  }
  assert.deepEqual(queries[1], {cookingCatalog: data.COOKING_CATALOG, cookingProvince: province1.code});
  assert.deepEqual(queries[2], {cookingCatalog: data.COOKING_CATALOG, cookingCity: province1.children[0].code});
  const legacy = makeState(province1);
  delete legacy.progress.cooking;
  const legacySave = await send(alice, legacy, 1);
  assert.equal(progress.cookingRankTime(legacySave.player.state.progress.cooking), completedAt);
  assert.equal(progress.cookingClearCount(legacySave.player.state.progress.cooking), 13);
  console.log('Cooking cloud saves, old client compatibility, server timestamps and three ranking scopes: OK');

  const rename = (client, nickname) => client({action: 'renamePlayer', nickname});
  assert.equal((await rename(alice, '🙂')).code, 'INVALID_NICKNAME');
  const results = await Promise.all([rename(alice, 'Ｎａｂｅ_01'), rename(bob, 'nabe_01')]);
  assert(results[0].ok && results[0].nickname === 'Nabe_01');
  assert.equal(results[1].code, 'NICKNAME_TAKEN');
  assert.equal((await rename(alice, 'Nabe_01')).nicknameRevision, 1);
  assert.equal((await rename(alice, '小馆厨师')).nicknameRevision, 2);
  assert((await rename(bob, 'nabe_01')).ok, 'previous nickname released');
  const spoofed = makeState(province1);
  spoofed.profile.nickname = 'nabe_01';
  spoofed.profile.nicknameRevision = 999;
  const savedAfterRename = await send(alice, spoofed, 2);
  assert.equal(savedAfterRename.player.state.profile.nickname, '小馆厨师');
  assert.equal(savedAfterRename.player.state.profile.nicknameRevision, 2);
  const all = await alice({action: 'cookingLeaderboard', scope: 0});
  assert.equal(all.playSessionVersion, player.PLAY_SESSION_VERSION);
  assert.deepEqual(new Set(all.rows.map(row => row.nickname)), new Set(['小馆厨师', 'nabe_01']));
  console.log('Nickname normalization, concurrent claims, idempotency, old name release, save protection and ranking display: OK');
}

validateCloud().catch(error => { console.error(error); process.exitCode = 1; });
