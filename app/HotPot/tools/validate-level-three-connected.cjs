'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const project = path.resolve(__dirname, '..');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(project, 'assets/scripts/data', name + '.ts');
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019}, reportDiagnostics: true,
  });
  assert.strictEqual(result.diagnostics.length, 0);
  const exports = {};
  vm.runInNewContext(result.outputText, {exports,
    require: name => load(name.replace('./', ''))});
  cache.set(name, exports);
  return exports;
}
const data = load('GameData');
const plain = value => JSON.parse(JSON.stringify(value));
const totals = tiles => {
  const counts = {};
  for (const tile of tiles) counts[tile.type] = (counts[tile.type] || 0) + 1;
  return counts;
};
const seeds = [data.CONNECTED_LAYOUT_SEED_START,
  data.CONNECTED_LAYOUT_SEED_START + 1,
  data.CONNECTED_LAYOUT_SEED_START + 2, data.CONNECTED_LAYOUT_SEED_END,
  ...Array.from({length: 36}, (_, i) =>
    data.CONNECTED_LAYOUT_SEED_START + 123457 * (i + 1)),
  data.VARIED_LAYOUT_SEED_START, data.VARIED_LAYOUT_SEED_START + 1,
  data.VARIED_LAYOUT_SEED_START + 2, data.VARIED_LAYOUT_SEED_END,
  ...Array.from({length: 36}, (_, i) =>
    data.VARIED_LAYOUT_SEED_START + 123457 * (i + 1))];
let crossLayerBoards = 0;
for (const seed of seeds) {
  const foods = 1 + seed % data.INGREDIENT_SEED_MAX;
  const board = data.createLevel(2, seed, undefined, foods);
  const varied = seed >= data.VARIED_LAYOUT_SEED_START;
  assert.strictEqual(board.total, 888);
  assert.strictEqual(board.config.layers.length, varied ? 50 : 37);
  assert.strictEqual(board.config.tileScale, 1);
  assert.deepStrictEqual(plain(data.createLevel(2, seed, undefined, foods)),
    plain(board), 'seeds must reproduce foods, geometry and blockers');
  assert.deepStrictEqual(totals(board.tiles),
    totals(data.createLevel(2, 0, undefined, foods).tiles),
    'food inventory must remain compatible with save validation');
  const byId = new Map(board.tiles.map(t => [t.id, t]));
  const width = 110.4, height = 91.2;
  for (const tile of board.tiles) {
    assert(Math.abs(tile.x) + width / 2 <= 310);
    assert(Math.abs(tile.y) + height / 2 <= (varied ? 310 : 270));
    const actual = board.tiles.filter(other => other.layer > tile.layer
      && Math.abs(tile.x - other.x) < width
      && Math.abs(tile.y - other.y) < height).map(t => t.id);
    assert.deepStrictEqual(Array.from(tile.blockedBy).sort(), plain(actual).sort(),
      'all visual overlaps must block, with no invisible blockers');
    assert(!board.tiles.some(other => other.id !== tile.id
      && other.layer === tile.layer
      && Math.abs(tile.x - other.x) < width
      && Math.abs(tile.y - other.y) < height), 'same layer overlap');
    assert(tile.blockedBy.every(id => byId.has(id)));
  }
  const top = board.tiles.filter(t => t.layer === board.config.layers.length - 1);
  const queue = [top[0]], reached = new Set(queue);
  while (queue.length) {
    const tile = queue.pop();
    for (const other of top) {
      if (!reached.has(other) && Math.abs(tile.x - other.x) <= 115
        && Math.abs(tile.y - other.y) <= 97) {
        reached.add(other); queue.push(other);
      }
    }
  }
  assert.strictEqual(reached.size, varied ? 18 : 24,
    'top formation must stay connected');
  assert(top.some(t => Math.abs(t.x) < (varied ? 120 : 60)
    && Math.abs(t.y) < (varied ? 80 : 50)),
  'playable tiles must stay close to the center');
  const coordinates = new Set(board.tiles.map(t => `${t.x}:${t.y}`));
  assert.strictEqual(coordinates.size, varied ? 36 : 48,
    'keep lightweight rendering');
  const route = data.buildLevelThreeRoute(board.tiles, seed);
  assert.strictEqual(new Set(route).size, 888);
  const removed = new Set(), tray = new Map();
  let peak = 0;
  for (const index of route) {
    const tile = board.tiles[index];
    assert(tile.blockedBy.every(id => removed.has(id)),
      'every step in the guaranteed solution must be selectable');
    removed.add(tile.id);
    const count = (tray.get(tile.type) || 0) + 1;
    tray.set(tile.type, count === 3 ? 0 : count);
    const occupied = Array.from(tray.values()).reduce((a, b) => a + b, 0);
    peak = Math.max(peak, occupied);
    assert(occupied < 7, 'solution must never lose to a full tray');
  }
  assert.strictEqual(peak, 6, 'route should require temporary storage');
  assert(Array.from(tray.values()).every(n => n === 0));
  if (Array.from({length: board.config.layers.length}, (_, layer) =>
    Object.values(totals(board.tiles.filter(t => t.layer === layer)))
      .some(n => n % 3 !== 0)).some(Boolean)) crossLayerBoards++;
}
assert.strictEqual(crossLayerBoards, seeds.length,
  'new boards must require cross-layer matching');
console.log(`${seeds.length} boards: reproducible, 888 tiles, `
  + 'full-size faces, 37/50 layers, 48/36 render positions, exact blockers, '
  + 'preserved inventory and legal six-slot full solutions OK');
