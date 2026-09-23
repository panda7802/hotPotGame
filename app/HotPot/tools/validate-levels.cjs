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
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2019 },
    fileName: sourcePath,
    reportDiagnostics: true,
});
assert.strictEqual((compiled.diagnostics || []).length, 0, 'GameData.ts transpilation failed');

const moduleObject = { exports: {} };
vm.runInNewContext(`(function(module,exports){${compiled.outputText}\n})(module,module.exports);`, {
    module: moduleObject,
    console,
});
const data = moduleObject.exports;
assert.strictEqual(data.LEVELS.length, 10, 'V0.1 must contain ten levels');

data.LEVELS.forEach((config, index) => {
    const level = data.createLevel(index);
    assert.strictEqual(level.total, config.layers.reduce((sum, count) => sum + count, 0));
    assert.strictEqual(config.traySize, 7);
    config.layers.forEach((count) => assert.strictEqual(count % 3, 0));
    level.tiles.forEach((tile) => {
        assert(Math.abs(tile.x) <= 300 && Math.abs(tile.y) <= 220, 'tile outside board');
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
                tray.push(type);
                if (tray.filter((item) => item === type).length === 3) tray = tray.filter((item) => item !== type);
                assert(tray.length < config.traySize, 'verified route overflowed tray');
            });
        });
    }
    assert.strictEqual(tray.length, 0);
    console.log(`Level ${config.level}: ${level.total} tiles / ${config.layers.length} layers / OK`);
});

console.log('All V0.1 levels are structurally valid and have a verified solution route.');
