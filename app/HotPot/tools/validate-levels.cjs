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
assert.strictEqual(data.LEVELS.length, 10, 'V0.1 must contain ten levels');

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
    assert(config.typeCount >= 1 && config.typeCount <= 10, 'each level must use between one and ten ingredient types');
    assert.strictEqual(new Set(level.tiles.map((tile) => tile.type)).size, config.typeCount,
        `level ${config.level} must use exactly ${config.typeCount} ingredient types`);
    if (index >= 2) {
        assert.strictEqual(config.rows, 8, `level ${config.level} must use the eight-row layout`);
        config.layers.forEach((_, layerIndex) => {
            const rowYs = Array.from(new Set(level.tiles
                .filter((tile) => tile.layer === layerIndex)
                .map((tile) => tile.y))).sort((a, b) => a - b);
            assert.strictEqual(rowYs.length, 8, `level ${config.level} layer ${layerIndex} must contain eight rows`);
            for (let row = 1; row < rowYs.length; row += 1) {
                assert(rowYs[row] - rowYs[row - 1] - data.EIGHT_ROW_IMAGE_HEIGHT >= data.EIGHT_ROW_IMAGE_HEIGHT * 0.1,
                    `level ${config.level} layer ${layerIndex} image gap must be at least 10% of image height`);
            }
        });
    }
    config.layers.forEach((count) => assert.strictEqual(count % 3, 0));
    level.tiles.forEach((tile) => {
        seenIngredientTypes.add(tile.type);
        const tileScale = config.rows === 8 ? 0.82 : 1;
        assert(Math.abs(tile.x) + 92 * 1.2 * tileScale / 2 <= 344 &&
            Math.abs(tile.y) + 76 * 1.2 * tileScale / 2 <= 420, 'tile outside board');
        if (index >= 2) assert(Math.abs(tile.y) + data.EIGHT_ROW_IMAGE_HEIGHT / 2 <= 420,
            'enlarged image outside board');
        tile.blockedBy.forEach((id) => {
            const blocker = level.tiles.find((candidate) => candidate.id === id);
            assert(blocker && blocker.layer > tile.layer, 'blocker must be higher');
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
