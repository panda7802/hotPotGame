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
const bombTiles = (type, count, removed = false) => Array.from({length: count}, (_, index) => ({
    id: `${type}-${removed}-${index}`, type, removed, x: 0, y: 0, layer: 0, blockedBy: [],
}));
for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 12]) {
    const tiles = bombTiles('beef', count);
    const targets = data.selectBombTargets(tiles, () => 0.25);
    assert.strictEqual(targets.length, count >= 6 ? 6 : count >= 3 ? 3 : 0);
    assert.strictEqual(new Set(targets.map(tile => tile.id)).size, targets.length);
    assert(tiles.every(tile => !tile.removed), 'selection must not mutate the board');
}
const mixedBombTiles = [...bombTiles('beef', 2), ...bombTiles('shrimp', 5), ...bombTiles('corn', 9, true)];
const mixedTargets = data.selectBombTargets(mixedBombTiles, () => 0.99);
assert.strictEqual(mixedTargets.length, 3);
assert(mixedTargets.every(tile => tile.type === 'shrimp' && !tile.removed),
    'bomb must skip insufficient types and already selected tiles');
const coveredTiles = bombTiles('fish', 6).map(tile => ({...tile, blockedBy: ['upper-tile']}));
assert.strictEqual(data.selectBombTargets(coveredTiles, () => 0.5).length, 6,
    'covered but unselected tiles are eligible');
assert.strictEqual(data.LEVELS.length, 3, 'must contain exactly three levels');

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
data.LEVELS.forEach((config, index) => {
    const level = data.createLevel(index);
    assert.strictEqual(level.total, config.layers.reduce((sum, count) => sum + count, 0));
    assert.strictEqual(config.traySize, 7);
    assert.strictEqual(level.total, [18, 30, 888][index]);
    if (config.level === 3) {
        assert.strictEqual(config.layers.length, 37, 'level three must have 37 layers');
        assert(config.layers.every(count => count === 24), 'each deep layer must contain 24 tiles');
        level.tiles.forEach(tile => {
            assert(!level.tiles.some(other => other.id !== tile.id && other.layer === tile.layer &&
                    Math.abs(other.x - tile.x) < 92 * 1.2 * config.tileScale &&
                    Math.abs(other.y - tile.y) < 76 * 1.2 * config.tileScale),
                `${tile.id} must not overlap another tile in its own layer`);
        });
        level.tiles.filter(tile => tile.layer < config.layers.length - 1).forEach(tile => {
            const directlyAbove = level.tiles.filter(upper => upper.layer === tile.layer + 1 &&
                Math.abs(upper.x - tile.x) < 92 * 1.2 * 0.82 &&
                Math.abs(upper.y - tile.y) < 76 * 1.2 * 0.82);
            assert(directlyAbove.length >= 2, `${tile.id} must be covered by at least two tiles in the next layer`);
            assert(directlyAbove.every(upper => tile.blockedBy.includes(upper.id)),
                `${tile.id} must remain blocked by each overlapping tile`);
        });
        for (let layer = 0; layer < config.layers.length - 1; layer += 1) {
            const lowerTiles = level.tiles.filter(tile => tile.layer === layer);
            const upperTiles = level.tiles.filter(tile => tile.layer === layer + 1);
            const coveredRows = new Set(lowerTiles.filter(tile => {
                const blockers = upperTiles.filter(upper => tile.blockedBy.includes(upper.id));
                return new Set(blockers.map(upper => upper.y)).size >= 2;
            }).map(tile => tile.y));
            assert(coveredRows.size >= 3,
                `level three layer ${layer} must include vertical overlaps`);
        }
    }
    assert(config.typeCount >= 1 && config.typeCount <= 10, 'each level must use between one and ten ingredient types');
    assert.strictEqual(new Set(level.tiles.map((tile) => tile.type)).size, config.typeCount,
        `level ${config.level} must use exactly ${config.typeCount} ingredient types`);
    if (config.rows === 8) {
        const imageHeight = config.level === 3 ? (76 * 1.2 - 4) * 0.82 : data.EIGHT_ROW_IMAGE_HEIGHT;
        assert.strictEqual(config.rows, 8, `level ${config.level} must use the eight-row layout`);
        config.layers.forEach((_, layerIndex) => {
            const rowYs = Array.from(new Set(level.tiles
                .filter((tile) => tile.layer === layerIndex)
                .map((tile) => tile.y))).sort((a, b) => a - b);
            assert.strictEqual(rowYs.length, 8, `level ${config.level} layer ${layerIndex} must contain eight rows`);
            for (let row = 1; row < rowYs.length; row += 1) {
                assert(rowYs[row] - rowYs[row - 1] - imageHeight >= imageHeight * 0.1,
                    `level ${config.level} layer ${layerIndex} image gap must be at least 10% of image height`);
            }
        });
    }
    config.layers.forEach((count) => assert.strictEqual(count % 3, 0));
    level.tiles.forEach((tile) => {
        seenIngredientTypes.add(tile.type);
        const tileScale = config.tileScale || (config.rows === 8 ? 0.82 : 1);
        assert(Math.abs(tile.x) + 92 * 1.2 * tileScale / 2 <= 344 &&
            Math.abs(tile.y) + 76 * 1.2 * tileScale / 2 <= 420, 'tile outside board');
        if (index >= 2) assert(Math.abs(tile.y) + data.EIGHT_ROW_IMAGE_HEIGHT / 2 <= 420,
            'enlarged image outside board');
        tile.blockedBy.forEach((id) => {
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
        level.tiles.filter((tile) => tile.layer === layerIndex).forEach((tile) => {
            if (!groups.has(tile.type)) groups.set(tile.type, []);
            groups.get(tile.type).push(tile);
        });
        groups.forEach((tiles, type) => {
            assert.strictEqual(tiles.length % 3, 0);
            tiles.forEach((tile) => {
                assert(!tile.blockedBy.some((id) => !level.tiles.find((item) => item.id === id).removed));
                tile.removed = true;
                insertGroupedAndResolve(tray, type);
                assert(tray.length < config.traySize, 'verified route overflowed tray');
            });
        });
    }
    assert.strictEqual(tray.length, 0);
    console.log(`Level ${config.level}: ${level.total} tiles / ${config.layers.length} layers / OK`);
});

data.INGREDIENTS.forEach((ingredient) => {
    assert(seenIngredientTypes.has(ingredient.id), `ingredient ${ingredient.id} is never used by any level`);
});

console.log('All V0.1 levels are structurally valid and have a verified solution route.');
