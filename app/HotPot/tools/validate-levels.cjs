'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const creatorRoot = process.env.COCOS_CREATOR_388 || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8';
const typescript = require(path.join(creatorRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'typescript'));
const sourcePath = path.join(__dirname, '..', 'assets', 'scripts', 'data', 'GameData.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = typescript.transpileModule(source, {
  compilerOptions: {module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2019},
  fileName: sourcePath,
  reportDiagnostics: true,
});
assert.strictEqual((compiled.diagnostics || []).length, 0, 'GameData.ts transpilation failed');

const moduleObject = {exports: {}};
vm.runInNewContext(`(function(module,exports){${compiled.outputText}\n})(module,module.exports);`, {
  module: moduleObject,
  console,
});
const data = moduleObject.exports;
// 炸道具：仅操作棋盘剩余牌，不会重复选择或改变输入数据。
/**
 * 为测试场景提供 bombTiles 所需的模拟行为。
 */
/**
 * 为测试提供当前调用所需的回调行为。
 */
const bombTiles =  (type, count, removed = false) => Array.from({length: count}, (_, index) => ({
  id: `${type}-${removed}-${index}`, type, removed, x: 0, y: 0, layer: 0, blockedBy: [],
}));
for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 12]) {
  const tiles = bombTiles('beef', count);
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  const targets = data.selectBombTargets(tiles, () => 0.25);
  assert.strictEqual(targets.length, count >= 6 ? 6 : count >= 3 ? 3 : 0);
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  assert.strictEqual(new Set(targets.map( tile => tile.id)).size, targets.length);
  /**
   * 按条件筛选或判断条目：!tile.removed。
   */
  assert(tiles.every( tile => !tile.removed), 'selection must not mutate the board');
}
const mixedBombTiles = [...bombTiles('beef', 2), ...bombTiles('shrimp', 5), ...bombTiles('corn', 9, true)];
/**
 * 为测试提供当前调用所需的回调行为。
 */
const mixedTargets = data.selectBombTargets(mixedBombTiles, () => 0.99);
assert.strictEqual(mixedTargets.length, 3);
/**
 * 按条件筛选或判断条目：tile.type === 'shrimp' && !tile.removed。
 */
assert(mixedTargets.every( tile => tile.type === 'shrimp' && !tile.removed),
  'bomb must skip insufficient types and already selected tiles');
/**
 * 将当前条目转换为后续处理所需的值。
 */
const coveredTiles = bombTiles('fish', 6).map( tile => ({...tile, blockedBy: ['upper-tile']}));
/**
 * 为测试提供当前调用所需的回调行为。
 */
assert.strictEqual(data.selectBombTargets(coveredTiles, () => 0.5).length, 6,
  'covered but unselected tiles are eligible');
assert.strictEqual(data.LEVELS.length, 3, 'must contain exactly three levels');

/**
 * 模拟将同类牌相邻插入托盘。
 */
function insertGrouped(tray, type) {
  let insertAt = tray.length;
  for (let i = tray.length - 1; i >= 0; i -= 1) {
    if (tray[i] === type) {
      insertAt = i + 1;
      break;
    }
  }
  tray.splice(insertAt, 0, type);
  return insertAt;
}

/**
 * 模拟插入食材并消除连续三张。
 */
function insertGroupedAndResolve(tray, type) {
  insertGrouped(tray, type);
  for (let i = 0; i <= tray.length - 3; i += 1) {
    if (tray[i] === tray[i + 1] && tray[i] === tray[i + 2]) {
      tray.splice(i, 3);
      break;
    }
  }
  return tray;
}

// 回归测试：新牛肉先归并到两张牛肉后，再触发三消，虾保留在托盘中。
const groupedTray = ['beef', 'beef', 'shrimp'];
assert.strictEqual(insertGrouped(groupedTray, 'beef'), 2, 'new beef must join the existing beef group');
assert.deepStrictEqual(
  groupedTray,
  ['beef', 'beef', 'beef', 'shrimp'],
  'tray must automatically group identical ingredients',
);
assert.deepStrictEqual(insertGroupedAndResolve(['beef', 'beef', 'shrimp'], 'beef'), ['shrimp']);

const seenIngredientTypes = new Set();
/**
 * 验证关卡牌数、覆盖关系和可解性。
 */
function validateLevel(config, index, layoutSeed = 0, report = true, ingredientSeed = 0) {
  const level = data.createLevel(index, layoutSeed, undefined, ingredientSeed);
  /**
   * 把集合条目汇总为一个结果。
   */
  assert.strictEqual(level.total, config.layers.reduce((sum, count) => sum + count, 0));
  assert.strictEqual(config.traySize, 7);
  assert.strictEqual(level.total, [18, 30, 888][index]);
  if (config.level === 3) {
    assert.strictEqual(config.layers.length, 37, 'level three must have 37 layers');
    /**
     * 按条件筛选或判断条目：count === 24。
     */
    assert(config.layers.every( count => count === 24), 'each deep layer must contain 24 tiles');
    /**
     * 依次处理集合中的每个条目。
     */
    level.tiles.forEach( tile => {
      /**
       * 按条件筛选或判断条目：other.id !== tile.id && other.layer === tile.layer && Math.a。
       */
      assert(!level.tiles.some( other => other.id !== tile.id && other.layer === tile.layer &&
        Math.abs(other.x - tile.x) < 92 * 1.2 * config.tileScale &&
        Math.abs(other.y - tile.y) < 76 * 1.2 * config.tileScale),
        `${tile.id} must not overlap another tile in its own layer`);
    });
    /**
     * 按条件筛选或判断条目：tile.layer < config.layers.length - 1。
     */
    /**
     * 依次处理集合中的每个条目。
     */
    level.tiles.filter( tile => tile.layer < config.layers.length - 1).forEach( tile => {
      /**
       * 按条件筛选或判断条目：upper.layer === tile.layer + 1 && Math.abs(upper.x - tile.x)。
       */
      const directlyAbove = level.tiles.filter( upper => upper.layer === tile.layer + 1 &&
        Math.abs(upper.x - tile.x) < 92 * 1.2 * 0.82 &&
        Math.abs(upper.y - tile.y) < 76 * 1.2 * 0.82);
      assert(directlyAbove.length >= 2, `${tile.id} must be covered by at least two tiles in the next layer`);
      /**
       * 按条件筛选或判断条目：tile.blockedBy.includes(upper.id)。
       */
      assert(directlyAbove.every( upper => tile.blockedBy.includes(upper.id)),
        `${tile.id} must remain blocked by each overlapping tile`);
    });
    for (let layer = 0; layer < config.layers.length - 1; layer += 1) {
      /**
       * 按条件筛选或判断条目：tile.layer === layer。
       */
      const lowerTiles = level.tiles.filter( tile => tile.layer === layer);
      /**
       * 按条件筛选或判断条目：tile.layer === layer + 1。
       */
      const upperTiles = level.tiles.filter( tile => tile.layer === layer + 1);
      /**
       * 按条件筛选或判断条目：{ const blockers = upperTiles.filter(upper => tile.blockedBy。
       */
      const coveredRows = new Set(lowerTiles.filter( tile => {
        /**
         * 按条件筛选或判断条目：tile.blockedBy.includes(upper.id)。
         */
        const blockers = upperTiles.filter( upper => tile.blockedBy.includes(upper.id));
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        return new Set(blockers.map( upper => upper.y)).size >= 2;
      /**
       * 将当前条目转换为后续处理所需的值。
       */
      }).map( tile => tile.y));
      assert(coveredRows.size >= 3,
        `level three layer ${layer} must include vertical overlaps`);
    }
  }
  assert(config.typeCount >= 1 && config.typeCount <= 10, 'each level must use between one and ten ingredient types');
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  assert.strictEqual(new Set(level.tiles.map((tile) => tile.type)).size, config.typeCount,
    `level ${config.level} must use exactly ${config.typeCount} ingredient types`);
  if (config.rows === 8) {
    const imageHeight = config.level === 3 ? (76 * 1.2 - 4) * 0.82 : data.EIGHT_ROW_IMAGE_HEIGHT;
    assert.strictEqual(config.rows, 8, `level ${config.level} must use the eight-row layout`);
    /**
     * 依次处理集合中的每个条目。
     */
    config.layers.forEach((_, layerIndex) => {
      const rowYs = Array.from(new Set(level.tiles
        /**
         * 按条件筛选或判断条目：tile.layer === layerIndex。
         */
        .filter((tile) => tile.layer === layerIndex)
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        /**
         * 按指定顺序比较并排列条目。
         */
        .map((tile) => tile.y))).sort((a, b) => a - b);
      assert.strictEqual(rowYs.length, 8, `level ${config.level} layer ${layerIndex} must contain eight rows`);
      for (let row = 1; row < rowYs.length; row += 1) {
        assert(rowYs[row] - rowYs[row - 1] - imageHeight >= imageHeight * 0.1,
          `level ${config.level} layer ${layerIndex} image gap must be at least 10% of image height`);
      }
    });
  }
  /**
   * 依次处理集合中的每个条目。
   */
  config.layers.forEach((count) => assert.strictEqual(count % 3, 0));
  /**
   * 依次处理集合中的每个条目。
   */
  level.tiles.forEach((tile) => {
    seenIngredientTypes.add(tile.type);
    const tileScale = config.tileScale || (config.rows === 8 ? 0.82 : 1);
    assert(Math.abs(tile.x) + 92 * 1.2 * tileScale / 2 <= 344 &&
      Math.abs(tile.y) + 76 * 1.2 * tileScale / 2 <= 420, 'tile outside board');
    if (index >= 2) assert(Math.abs(tile.y) + data.EIGHT_ROW_IMAGE_HEIGHT / 2 <= 420,
      'enlarged image outside board');
    /**
     * 依次处理集合中的每个条目。
     */
    tile.blockedBy.forEach((id) => {
      /**
       * 按条件筛选或判断条目：candidate.id === id。
       */
      const blocker = level.tiles.find((candidate) => candidate.id === id);
      assert(blocker && blocker.layer > tile.layer, 'blocker must be higher');
      if (config.level === 3) {
        const width = 92 * 1.2 * tileScale;
        const height = 76 * 1.2 * tileScale;
        const overlapWidth = width - Math.abs(tile.x - blocker.x);
        const overlapHeight = height - Math.abs(tile.y - blocker.y);
        assert(overlapWidth * overlapHeight / (width * height) >= 0.2,
          `${tile.id} and ${blocker.id} must overlap by at least 20% of the tile area`);
      }
    });
  });

  let tray = [];
  for (let layerIndex = config.layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const groups = new Map();
    /**
     * 按条件筛选或判断条目：tile.layer === layerIndex。
     */
    /**
     * 依次处理集合中的每个条目。
     */
    level.tiles.filter((tile) => tile.layer === layerIndex).forEach((tile) => {
      if (!groups.has(tile.type)) groups.set(tile.type, []);
      groups.get(tile.type).push(tile);
    });
    /**
     * 依次处理集合中的每个条目。
     */
    groups.forEach((tiles, type) => {
      assert.strictEqual(tiles.length % 3, 0);
      /**
       * 依次处理集合中的每个条目。
       */
      tiles.forEach((tile) => {
        /**
         * 按条件筛选或判断条目：!level.tiles.find((item) => item.id === id).removed。
         */
        /**
         * 按条件筛选或判断条目：item.id === id。
         */
        assert(!tile.blockedBy.some((id) => !level.tiles.find((item) => item.id === id).removed));
        tile.removed = true;
        insertGroupedAndResolve(tray, type);
        assert(tray.length < config.traySize, 'verified route overflowed tray');
      });
    });
  }
  assert.strictEqual(tray.length, 0);
  if (report) console.log(`Level ${config.level}: ${level.total} tiles / ${config.layers.length} layers / OK`);
}

/**
 * 依次处理集合中的每个条目。
 */
data.LEVELS.forEach((config, index) => validateLevel(config, index));
/**
 * 提取棋盘几何信息用于一致性检查。
 */
/**
 * 将当前条目转换为后续处理所需的值。
 */
const geometry =  level => JSON.stringify(level.tiles.map(({x, y, blockedBy}) => ({x, y, blockedBy})));
const shapes = new Set();
// Cover the seed endpoints and widely separated seeds, including all geometry
// invariants and a complete legal top-to-bottom playthrough for each board.
const seeds = [1, 2, 2147483645, 2147483646,
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  ...Array.from({length: 28}, (_, i) => 20261023 + i * 67867967),
  data.RANDOM_LAYOUT_SEED_START, data.RANDOM_LAYOUT_SEED_START + 1, data.RANDOM_LAYOUT_SEED_START + 2,
  data.RANDOM_LAYOUT_SEED_END,
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  ...Array.from({length: 28}, (_, i) => data.RANDOM_LAYOUT_SEED_START + 20261023 + i * 67867967)];
for (const seed of seeds) {
  validateLevel(data.LEVELS[2], 2, seed, false);
  const level = data.createLevel(2, seed);
  assert.strictEqual(level.layoutSeed, seed);
  shapes.add(geometry(level));
  assert.strictEqual(geometry(data.createLevel(2, seed)), geometry(level), 'same seed must reproduce the exact layout');
}
assert(shapes.size >= 28, 'different seeds must produce varied shapes');
let previous = data.createLevel(2);
for (let retry = 0; retry < 12; retry += 1) {
  const next = data.createLevel(2, undefined, previous.layoutSeed);
  assert.notStrictEqual(data.levelThreeLayoutFamily(next.layoutSeed), data.levelThreeLayoutFamily(previous.layoutSeed),
    'retry must change the overall formation, not only offsets');
  assert.notStrictEqual(geometry(next), geometry(previous));
  previous = next;
}
/**
 * 将当前条目转换为后续处理所需的值。
 */
assert.notDeepStrictEqual(data.createLevel(2, data.RANDOM_LAYOUT_SEED_START).tiles.map( tile => tile.type),
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  data.createLevel(2, data.RANDOM_LAYOUT_SEED_START + 1).tiles.map( tile => tile.type),
  'new layouts must randomize ingredient positions too');
assert.strictEqual(geometry(data.createLevel(0)), geometry(data.createLevel(0, 0)));
assert.strictEqual(geometry(data.createLevel(1)), geometry(data.createLevel(1, 0)));
console.log(`Random third-level layouts: ${shapes.size} shapes / ${seeds.length} seeds / distinct formations, randomized foods, geometry, bounds, coverage and full solutions OK`);

assert.strictEqual(data.INGREDIENTS.length, 23);
/**
 * 将当前条目转换为后续处理所需的值。
 */
const signatures = data.LEVELS.map(() => new Set());
for (let seed = 1; seed <= 1000; seed++) {
  /**
   * 依次处理集合中的每个条目。
   */
  data.LEVELS.forEach((config, index) => {
    const selected = data.selectLevelIngredients(index, seed * 123457);
    assert.strictEqual(new Set(selected).size, config.typeCount);
    assert(!(selected.includes('beef') && selected.includes('lamb')), 'beef and lamb must never share a level');
    /**
     * 依次处理集合中的每个条目。
     */
    selected.forEach( type => seenIngredientTypes.add(type));
    signatures[index].add(selected.join(','));
  });
}
/**
 * 按条件筛选或判断条目：set.size > 900。
 */
assert(signatures.every( set => set.size > 900), 'every level must draw varied ingredient combinations');
for (let seed = 1; seed <= 6; seed++) {
  /**
   * 依次处理集合中的每个条目。
   */
  data.LEVELS.forEach((config, index) => validateLevel(config, index,
    index === 2 ? data.RANDOM_LAYOUT_SEED_START + seed : 0, false, seed * 10000019));
}
/**
 * 依次处理集合中的每个条目。
 */
data.INGREDIENTS.forEach((ingredient) => {
  assert(seenIngredientTypes.has(ingredient.id), `ingredient ${ingredient.id} is never used by any level`);
});

console.log('23 ingredient pool: 3000 draws, beef/lamb exclusion, per-level variety and complete randomized-board solutions: OK');
console.log('All V0.1 levels are structurally valid and have a verified solution route.');
