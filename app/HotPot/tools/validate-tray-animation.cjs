'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const creatorRoot = process.env.COCOS_CREATOR_388 || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8';
const ts = require(path.join(creatorRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'typescript'));
const sourcePath = path.join(__dirname, '..', 'assets', 'scripts', 'core', 'HotPotGame.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, experimentalDecorators: true},
    fileName: sourcePath, reportDiagnostics: true,
});
assert.strictEqual(compiled.diagnostics.length, 0);

// Keep tween completion pending so multiple matches can run concurrently.
const completions = [];
const animatedTargets = [];

class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        Object.assign(this, {x, y, z});
    }

    clone() {
        return new Vec3(this.x, this.y, this.z);
    }
}

Vec3.ONE = new Vec3(1, 1, 1);

class Node {
    constructor(name) {
        this.name = name;
        this.children = [];
        this.position = new Vec3();
    }

    addChild(child) {
        child.setParent(this);
    }

    setParent(parent) {
        this.removeFromParent();
        this.parent = parent;
        parent.children.push(this);
    }

    removeFromParent() {
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent = null;
    }

    destroy() {
        this.removeFromParent();
        this.destroyed = true;
    }

    getComponent() {
        return {};
    }
}

const cc = {
    _decorator: {ccclass: () => klass => klass}, Component: class {
    }, Node, Vec3,
    tween(target) {
        animatedTargets.push(target);
        const callbacks = [];
        const chain = {
            to() {
                return chain;
            }, delay() {
                return chain;
            },
            call(callback) {
                callbacks.push(callback);
                return chain;
            },
            start() {
                completions.push(...callbacks);
                return chain;
            },
        };
        return chain;
    },
};
const moduleObject = {exports: {}};
vm.runInNewContext(compiled.outputText, {
    exports: moduleObject.exports,
    require: name => name === 'cc' ? cc : {},
});
const Game = moduleObject.exports.HotPotGame;

function makeGame(tray) {
    const game = new Game();
    game.tray = tray.slice();
    game.trayNode = new Node('Tray');
    game.levelData = {config: {traySize: 7}};
    game.remainingTiles = () => 20;
    game.playEffect = game.showToast = game.createTrayMatchBurst = () => {
    };
    game.renderReserve = game.dismissOverlay = () => {
    };
    game.updateProgress = game.updateToolButtons = () => {
    };
    game.endGame = won => {
        game.result = won;
        game.gameEnded = true;
        game.locked = true;
    };
    game.renderTray = () => {
        game.trayNode.children.slice().filter(child => child.name !== 'MatchEffects').forEach(child => child.destroy());
        game.tray.forEach((_, i) => game.trayNode.addChild(new Node(`TrayItem_${i}`)));
    };
    return game;
}

function pick(game, type) {
    assert(!game.locked && !game.gameEnded, 'next pick must be allowed during match animation');
    game.locked = true;
    game.insertIntoTray(type);
    game.resolveTray();
}

const game = makeGame(['beef', 'beef', 'shrimp', 'shrimp', 'corn', 'fish']);
pick(game, 'beef'); // Seventh tile completes a triple: only four occupied slots.
assert.deepStrictEqual(game.tray, ['shrimp', 'shrimp', 'corn', 'fish']);
assert.strictEqual(game.result, undefined);
assert(!game.locked);
pick(game, 'shrimp'); // Another triple before either animation finishes.
assert.deepStrictEqual(game.tray, ['corn', 'fish']);
assert.strictEqual(game.trayNode.children.filter(child => child.name === 'MatchEffects').length, 2);
pick(game, 'egg');
const settled = game.tray.slice();
completions.splice(0).reverse().forEach(callback => callback());
assert.deepStrictEqual(game.tray, settled, 'old animation callbacks must not delete new tiles');
assert.strictEqual(game.result, undefined);

const restart = makeGame(['beef', 'beef']);
pick(restart, 'beef');
restart.clearMatchEffects();
restart.tray = ['corn'];
restart.locked = true; // A new move after restart/undo must keep its own lock.
completions.splice(0).forEach(callback => callback());
assert.deepStrictEqual(restart.tray, ['corn']);
assert.strictEqual(restart.locked, true);

const full = makeGame(['beef', 'beef', 'shrimp', 'shrimp', 'corn', 'corn']);
pick(full, 'fish');
assert.strictEqual(full.result, false, 'seven unmatched tiles must still lose');
const win = makeGame(['beef', 'beef']);
win.remainingTiles = () => 0;
pick(win, 'beef');
assert.strictEqual(win.result, true);
assert.strictEqual(win.tray.length, 0);
console.log('Concurrent matches, seventh-slot match, stale callbacks, full tray and victory: OK');

const revival = makeGame(['beef', 'beef', 'shrimp', 'shrimp', 'corn', 'corn', 'fish']);
revival.levelData.tiles = [];
revival.gameEnded = true;
revival.locked = true;
const original = revival.tray.slice().sort();
revival.revive();
assert.strictEqual(revival.tray.length, 4);
assert.strictEqual(revival.reserve.length, 3);
assert.deepStrictEqual([...revival.tray, ...revival.reserve].sort(), original,
    'reviving must preserve every ingredient');
assert(revival.reviveUsed && !revival.gameEnded && !revival.locked);
revival.revive();
assert.strictEqual(revival.reserve.length, 3, 'double click must not grant another revive');
revival.takeReservedTile(0);
assert.strictEqual(revival.reserve.length, 2);
assert.strictEqual(revival.tray.length, 5);
revival.levelIndex = 1;
revival.toolUses.undo = 1;
revival.rebuildBoardTiles = revival.updateProgress = revival.updateToolButtons = () => {
};
revival.useUndoTool();
assert.strictEqual(revival.reserve.length, 3, 'undo must restore the reserved tile');
assert.strictEqual(revival.tray.length, 4);
assert(revival.reviveUsed, 'undo cannot restore the revive allowance');
revival.gameEnded = true;
revival.tray = original.slice();
revival.revive();
assert.strictEqual(revival.tray.length, 7, 'second failure cannot revive again');

const reserveFinish = makeGame([]);
reserveFinish.levelData.tiles = [];
reserveFinish.remainingTiles = () => 0;
reserveFinish.reserve = ['beef', 'beef', 'beef'];
reserveFinish.resolveTray();
assert.strictEqual(reserveFinish.result, undefined, 'reserved tiles must prevent early victory');
reserveFinish.takeReservedTile(0);
reserveFinish.takeReservedTile(0);
reserveFinish.takeReservedTile(0);
assert.strictEqual(reserveFinish.result, true);
assert.strictEqual(reserveFinish.reserve.length, 0);
assert.strictEqual(reserveFinish.tray.length, 0);
console.log('Free revive, ingredient conservation, duplicate requests, reserve undo and final match: OK');

const stages = makeGame([]);
stages.levelData = {total: 888, config: {level: 3, traySize: 7}};
let remaining = 789;
stages.remainingTiles = () => remaining;
assert.strictEqual(stages.grantBoilRewards(), '');
remaining = 786; // Triple crosses 100 at 102; exact equality must not be required.
assert(stages.grantBoilRewards());
assert.strictEqual(stages.rewardedMilestones, 1);
assert.strictEqual(Object.values(stages.toolUses).reduce((a, b) => a + b), 1);
remaining = 789; // Undo and replay cannot duplicate a milestone reward.
stages.grantBoilRewards();
remaining = 786;
assert.strictEqual(stages.grantBoilRewards(), '');
remaining = 0;
stages.tray = ['beef', 'beef'];
stages.reserve = ['corn'];
assert.strictEqual(stages.clearedTileCount(), 885, 'picked and reserved tiles are not eliminated');
stages.grantBoilRewards();
assert.strictEqual(stages.rewardedMilestones, 8);
assert.strictEqual(Object.values(stages.toolUses).reduce((a, b) => a + b), 8);
stages.levelData.config.level = 2;
stages.rewardedMilestones = 0;
assert.strictEqual(stages.grantBoilRewards(), '', 'other levels have no stage rewards');

completions.splice(0);
const flip = makeGame(['corn']);
flip.levelIndex = 1;
flip.toolUses.shuffle = 2;
flip.board = new Node('Board');
flip.drawTile = () => {
};
flip.levelData.tiles = ['beef', 'shrimp', 'beef'].map((type, i) => ({
    id: `tile${i}`, type, removed: false, blockedBy: [], x: i * 100, y: 0, layer: 0,
}));
flip.levelData.tiles.forEach(tile => {
    const node = new Node(tile.id);
    node.scale = new Vec3(1, 1, 1);
    flip.tileNodes.set(tile.id, node);
});
flip.levelData.tiles[0].blockedBy = ['tile1'];
animatedTargets.length = 0;
const beforeFlip = flip.levelData.tiles.map(tile => tile.type).sort();
flip.useShuffleTool();
assert(flip.levelData.tiles.every(tile => animatedTargets.includes(flip.tileNodes.get(tile.id))),
    'all remaining tiles, including covered tiles, must join the shuffle animation');
assert(flip.locked, 'flip animation must temporarily lock input');
flip.useShuffleTool();
assert.strictEqual(flip.toolUses.shuffle, 1, 'double click must not consume two tools');
completions.splice(0).forEach(callback => callback());
assert(!flip.locked);
assert.deepStrictEqual(flip.levelData.tiles.map(tile => tile.type).sort(), beforeFlip);
assert.deepStrictEqual(flip.tray, ['corn']);
flip.useShuffleTool();
flip.levelData = {config: {level: 1, traySize: 7}, tiles: []};
flip.locked = true;
completions.splice(0).forEach(callback => callback());
assert(flip.locked, 'old flip callback cannot unlock a new game');
console.log('100-tile milestones, no reward farming, eight rewards, flip animation and stale callbacks: OK');

const countdown = makeGame([]);
countdown.levelData = {total: 888, tiles: [], config: {level: 3}};
countdown.progressLabel = {};
countdown.remainingTiles = () => 885;
Game.prototype.updateProgress.call(countdown);
assert.strictEqual(countdown.progressLabel.string, '距离下一次获取道具还有97个');
countdown.rewardedMilestones = 1;
countdown.remainingTiles = () => 786;
Game.prototype.updateProgress.call(countdown);
assert.strictEqual(countdown.progressLabel.string, '距离下一次获取道具还有98个');
countdown.rewardedMilestones = 8;
countdown.remainingTiles = () => 87;
Game.prototype.updateProgress.call(countdown);
assert.strictEqual(countdown.progressLabel.string, '本局开锅道具已全部领取，继续捞！');
console.log('Third-level reward countdown and final reward message: OK');
