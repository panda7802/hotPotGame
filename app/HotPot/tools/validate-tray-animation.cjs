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

/** 测试中模拟 Vec3 的最小行为。 */
class Vec3 {
    /** 初始化实例的内部状态和依赖。 */
    constructor(x = 0, y = 0, z = 0) {
        /** 动画测试中使用的三维坐标分量。 */
        Object.assign(this, {x, y, z});
    }

    /** 通过 JSON 创建可序列化数据的深拷贝。 */
    clone() {
        return new Vec3(this.x, this.y, this.z);
    }
}

Vec3.ONE = new Vec3(1, 1, 1);

/** 测试中模拟 Node 的最小行为。 */
class Node {
    /** 初始化实例的内部状态和依赖。 */
    constructor(name) {
        /** 测试节点的名称。 */
        this.name = name;
        /** 当前节点的子节点列表。 */
        this.children = [];
        /** 节点相对父节点的位置。 */
        this.position = new Vec3();
    }

    /** 更新测试节点的父子关系或销毁状态。 */
    addChild(child) {
        child.setParent(this);
    }

    /** 更新 setParent 对应的状态。 */
    setParent(parent) {
        this.removeFromParent();
        this.parent = parent;
        parent.children.push(this);
    }

    /** 更新测试节点的父子关系或销毁状态。 */
    removeFromParent() {
        if (this.parent) this.parent.children = this.parent.children.filter(/** 按条件筛选或判断条目：child !== this。 */ child => child !== this);
        this.parent = null;
    }

    /** 更新测试节点的父子关系或销毁状态。 */
    destroy() {
        this.removeFromParent();
        this.destroyed = true;
    }

    /** 读取或查找 getComponent 对应的数据，供测试使用。 */
    getComponent() {
        return {/** 更新 setContentSize 对应的状态。 */ setContentSize() {}, /** 为测试场景提供 clear 所需的模拟行为。 */ clear() {}, /** 为测试场景提供 roundRect 所需的模拟行为。 */ roundRect() {}, /** 为测试场景提供 fill 所需的模拟行为。 */ fill() {}};
    }

    /** 在组件替身中查找或添加指定类型的组件。 */
    addComponent() { return {}; }
    /** 更新 setPosition 对应的状态。 */
    setPosition(x, y, z = 0) { this.position = new Vec3(x, y, z); }
    /** 更新 setScale 对应的状态。 */
    setScale(x, y, z) { this.scale = new Vec3(x, y, z); }

    /** 读取或查找 getChildByName 对应的数据，供测试使用。 */
    getChildByName(name) {
        return this.children.find(/** 按条件筛选或判断条目：child.name === name。 */ child => child.name === name);
    }
}

const cc = {
    _decorator: {ccclass: /** 为测试场景提供 ccclass 所需的模拟行为。 */ () => /** 为测试提供当前调用所需的回调行为。 */ klass => klass}, Component: /** 测试中模拟 匿名组件 的最小行为。 */ class {
    }, Node, Vec3, Color: /** 测试中模拟 匿名组件 的最小行为。 */ class { /** 为测试场景提供 fromHEX 所需的模拟行为。 */ fromHEX() { return this; } },
    /** 为测试场景提供 tween 所需的模拟行为。 */
    tween(target) {
        animatedTargets.push(target);
        const callbacks = [];
        const chain = {
            /** 为测试场景提供 to 所需的模拟行为。 */
            to() {
                return chain;
            }, /** 为测试场景提供 delay 所需的模拟行为。 */ delay() {
                return chain;
            },
            /** 为测试场景提供 call 所需的模拟行为。 */
            call(callback) {
                callbacks.push(callback);
                return chain;
            },
            /** 创建并清空小游戏的 WebGL 启动画布。 */
            start() {
                completions.push(...callbacks);
                return chain;
            },
        };
        return chain;
    },
};
const moduleObject = {exports: {}};
const dependencies = {};
let fixedRandom = null;
const testMath = Object.create(Math);
testMath.random = /** 为测试场景提供 random 所需的模拟行为。 */ () => fixedRandom === null ? Math.random() : fixedRandom;
/** 编译并载入测试依赖模块。 */
function loadDependency(name, parent = sourcePath) {
    if (name === 'cc') return cc;
    const filename = path.resolve(path.dirname(parent), name) + '.ts';
    if (dependencies[filename]) return dependencies[filename];
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
    });
    const exports = {};
    vm.runInNewContext(result.outputText, {exports, setTimeout, clearTimeout, Math: testMath,
        require: /** 为测试场景提供 require 所需的模拟行为。 */ child => loadDependency(child, filename)});
    dependencies[filename] = exports;
    return exports;
}
vm.runInNewContext(compiled.outputText, {
    exports: moduleObject.exports,
    require: loadDependency,
});
const Game = moduleObject.exports.HotPotGame;

for (const [levelIndex, status, expected] of [[0, 'lost', 0], [1, 'lost', 1], [2, 'lost', 2],
    [2, 'playing', 2], [2, 'won', 2]]) {
    const retry = new Game();
    retry.levelIndex = levelIndex; retry.lastResult = status; retry.gameEnded = status !== 'playing';
    retry.loadLevel = /** 生成并显示指定关卡，按需保存。 */ index => { retry.loadedLevel = index; };
    retry.restartLevel();
    assert.strictEqual(retry.loadedLevel, expected, `retry rule for level ${levelIndex + 1}, ${status}`);
}
const dayResume = new Game();
dayResume.levelData = {};
dayResume.node = new Node('Game');
dayResume.playerService = {beginDailySession: /** 进入本地自然日对应的新对局。 */ () => true, flush: /** 立即执行待处理的同步。 */ async () => {}, isConflict: false};
dayResume.dismissPlayerMenu = dayResume.showToast = /** 显示短暂的文字提示。 */ () => {};
dayResume.loadLevel = /** 生成并显示指定关卡，按需保存。 */ index => { dayResume.resumedLevel = index; };
dayResume.resumePlayerDay();
assert.strictEqual(dayResume.resumedLevel, 0, 'foreground entry on a new day resets the visible board');
dayResume.playerService.beginDailySession = /** 进入本地自然日对应的新对局。 */ () => false;
dayResume.resumedLevel = 2;
dayResume.resumePlayerDay();
assert.strictEqual(dayResume.resumedLevel, 2, 'same-day foreground entry must not reset the visible board');

/** 建立托盘动画测试所用的游戏实例。 */
function makeGame(tray) {
    const game = new Game();
    game.node = new Node('Game');
    game.tray = tray.slice();
    game.trayNode = new Node('Tray');
    game.levelData = {config: {traySize: 7}};
    game.remainingTiles = /** 统计棋盘上尚未移除的牌。 */ () => 20;
    game.playEffect = game.showToast = game.createTrayMatchBurst = /** 在托盘指定位置播放消除粒子效果。 */ () => {
    };
    game.renderReserve = game.dismissOverlay = /** 关闭当前结果弹窗。 */ () => {
    };
    game.updateProgress = game.updateToolButtons = /** 刷新道具可用状态与次数。 */ () => {
    };
    game.endGame = /** 处理通关或失败，并保存本局结果。 */ won => {
        game.result = won;
        game.gameEnded = true;
        game.locked = true;
        game.lastResult = won ? 'won' : 'lost';
        game.checkpointGame();
    };
    game.renderTray = /** 依据托盘数据重新绘制食材节点。 */ () => {
        game.trayNode.children.slice().filter(/** 按条件筛选或判断条目：child.name !== 'MatchEffects'。 */ child => child.name !== 'MatchEffects').forEach(/** 依次处理集合中的每个条目。 */ child => child.destroy());
        game.tray.forEach(/** 依次处理集合中的每个条目。 */ (_, i) => game.trayNode.addChild(new Node(`TrayItem_${i}`)));
    };
    return game;
}

/** 模拟选择一张可取的棋盘牌。 */
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
assert.strictEqual(game.trayNode.children.filter(/** 按条件筛选或判断条目：child.name === 'MatchEffects'。 */ child => child.name === 'MatchEffects').length, 2);
pick(game, 'egg');
const settled = game.tray.slice();
completions.splice(0).reverse().forEach(/** 依次处理集合中的每个条目。 */ callback => callback());
assert.deepStrictEqual(game.tray, settled, 'old animation callbacks must not delete new tiles');
assert.strictEqual(game.result, undefined);

const restart = makeGame(['beef', 'beef']);
pick(restart, 'beef');
restart.clearMatchEffects();
restart.tray = ['corn'];
restart.locked = true; // A new move after restart/undo must keep its own lock.
completions.splice(0).forEach(/** 依次处理集合中的每个条目。 */ callback => callback());
assert.deepStrictEqual(restart.tray, ['corn']);
assert.strictEqual(restart.locked, true);

const full = makeGame(['beef', 'beef', 'shrimp', 'shrimp', 'corn', 'corn']);
pick(full, 'fish');
assert.strictEqual(full.result, false, 'seven unmatched tiles must still lose');
const win = makeGame(['beef', 'beef']);
win.remainingTiles = /** 统计棋盘上尚未移除的牌。 */ () => 0;
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
revival.rebuildBoardTiles = revival.updateProgress = revival.updateToolButtons = /** 刷新道具可用状态与次数。 */ () => {
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
reserveFinish.remainingTiles = /** 统计棋盘上尚未移除的牌。 */ () => 0;
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
stages.remainingTiles = /** 统计棋盘上尚未移除的牌。 */ () => remaining;
assert.strictEqual(stages.grantBoilRewards(), '');
remaining = 786; // Triple crosses 100 at 102; exact equality must not be required.
assert(stages.grantBoilRewards());
assert.strictEqual(stages.rewardedMilestones, 1);
assert.strictEqual(Object.values(stages.toolUses).reduce(/** 把集合条目汇总为一个结果。 */ (a, b) => a + b), 1);
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
assert.strictEqual(Object.values(stages.toolUses).reduce(/** 把集合条目汇总为一个结果。 */ (a, b) => a + b), 8);
stages.levelData.config.level = 2;
stages.rewardedMilestones = 0;
assert.strictEqual(stages.grantBoilRewards(), '', 'other levels have no stage rewards');

completions.splice(0);
const flip = makeGame(['corn']);
flip.levelIndex = 1;
flip.toolUses.shuffle = 2;
flip.board = new Node('Board');
flip.drawTile = /** 根据食材类型和遮挡状态绘制牌面。 */ () => {
};
flip.levelData.tiles = ['beef', 'shrimp', 'beef'].map(/** 将当前条目转换为后续处理所需的值。 */ (type, i) => ({
    id: `tile${i}`, type, removed: false, blockedBy: [], x: i * 100, y: 0, layer: 0,
}));
flip.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */ tile => {
    const node = new Node(tile.id);
    node.scale = new Vec3(1, 1, 1);
    flip.tileNodes.set(tile.id, node);
});
flip.levelData.tiles[0].blockedBy = ['tile1'];
animatedTargets.length = 0;
const beforeFlip = flip.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => tile.type).sort();
flip.useShuffleTool();
assert(flip.levelData.tiles.every(/** 按条件筛选或判断条目：animatedTargets.includes(flip.tileNodes.get(tile.id))。 */ tile => animatedTargets.includes(flip.tileNodes.get(tile.id))),
    'all remaining tiles, including covered tiles, must join the shuffle animation');
assert(flip.locked, 'flip animation must temporarily lock input');
flip.useShuffleTool();
assert.strictEqual(flip.toolUses.shuffle, 1, 'double click must not consume two tools');
completions.splice(0).forEach(/** 依次处理集合中的每个条目。 */ callback => callback());
assert(!flip.locked);
assert.deepStrictEqual(flip.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => tile.type).sort(), beforeFlip);
assert.deepStrictEqual(flip.tray, ['corn']);
flip.useShuffleTool();
flip.levelData = {config: {level: 1, traySize: 7}, tiles: []};
flip.locked = true;
completions.splice(0).forEach(/** 依次处理集合中的每个条目。 */ callback => callback());
assert(flip.locked, 'old flip callback cannot unlock a new game');
console.log('100-tile milestones, no reward farming, eight rewards, flip animation and stale callbacks: OK');

const countdown = makeGame([]);
countdown.levelData = {total: 888, tiles: [], config: {level: 3}};
countdown.progressLabel = {};
countdown.remainingTiles = /** 统计棋盘上尚未移除的牌。 */ () => 885;
Game.prototype.updateProgress.call(countdown);
assert.strictEqual(countdown.progressLabel.string, '距离下一次获取道具还有97个');
countdown.rewardedMilestones = 1;
countdown.remainingTiles = /** 统计棋盘上尚未移除的牌。 */ () => 786;
Game.prototype.updateProgress.call(countdown);
assert.strictEqual(countdown.progressLabel.string, '距离下一次获取道具还有98个');
countdown.rewardedMilestones = 8;
countdown.remainingTiles = /** 统计棋盘上尚未移除的牌。 */ () => 87;
Game.prototype.updateProgress.call(countdown);
assert.strictEqual(countdown.progressLabel.string, '本局开锅道具已全部领取，继续捞！');
console.log('Third-level reward countdown and final reward message: OK');

const actualData = loadDependency('../data/GameData');
const saveDomain = loadDependency('../data/PlayerData');
/** 为测试场景提供 persistedGame 所需的模拟行为。 */
function persistedGame() {
    const game = makeGame([]);
    const writes = [];
    game.playerService = {/** 更新当前对局并安排同步。 */ setSave(save) {writes.push(saveDomain.validateGameSave(save));}};
    game.board = new Node('Board');
    game.foodTransitionLayer = new Node('FoodTransitionLayer');
    game.toolBar = {};
    game.levelLabel = {};
    game.createTileNode = game.refreshTileStates = /** 刷新全部牌的可选状态和外观。 */ () => {};
    game.remainingTiles = Game.prototype.remainingTiles.bind(game);
    game.loadLevel(1);
    return {game, writes};
}
for (const reviveUsed of [false, true]) {
    const failure = persistedGame();
    failure.game.loadLevel(2);
    failure.game.reviveUsed = reviveUsed;
    const counts = {};
    const selected = failure.game.levelData.tiles.filter(/** 按条件筛选或判断条目：tile.blockedBy.length === 0。 */ tile => tile.blockedBy.length === 0).filter(/** 按条件筛选或判断条目：{ if ((counts[tile.type] || 0) >= 2) return false; counts[ti。 */ tile => {
        if ((counts[tile.type] || 0) >= 2) return false;
        counts[tile.type] = (counts[tile.type] || 0) + 1;
        return true;
    }).slice(0, 7);
    assert.strictEqual(selected.length, 7);
    selected.forEach(/** 依次处理集合中的每个条目。 */ tile => { tile.removed = true; failure.game.insertIntoTray(tile.type); });
    let failureDialog = false;
    failure.game.drawFailurePanel = /** 绘制失败弹窗中的操作区域。 */ () => { failureDialog = true; };
    Game.prototype.endGame.call(failure.game, false);
    const lostSave = failure.writes.at(-1);
    assert.strictEqual(lostSave.status, 'lost');
    assert.strictEqual(lostSave.levelIndex, 2);
    assert.strictEqual(failure.game.levelIndex, 2);
    assert(failureDialog && failure.game.node.getChildByName('ResultOverlay'), 'third-level failure must allow retrying the current level');
    const shape = /** 为测试场景提供 shape 所需的模拟行为。 */ level => JSON.stringify(level.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => [tile.x, tile.y]));
    const oldShape = shape(failure.game.levelData);
    if (!reviveUsed) {
        failure.game.revive();
        assert.strictEqual(shape(failure.game.levelData), oldShape, 'free revival must retain the current third-level layout');
        assert.strictEqual(failure.game.levelIndex, 2);
    }
    failure.game.restartLevel();
    assert.strictEqual(failure.writes.at(-1).levelIndex, 2);
    assert.strictEqual(failure.writes.at(-1).status, 'playing');
    assert.notStrictEqual(shape(failure.game.levelData), oldShape);
    assert.strictEqual(failure.writes.at(-1).layoutSeed, failure.game.levelData.layoutSeed);
    const reopened = persistedGame();
    reopened.game.restoreGame(lostSave);
    assert.strictEqual(reopened.game.levelIndex, 2);
    assert.strictEqual(shape(reopened.game.levelData), oldShape, 'restoring a same-day lost save must keep the saved third-level layout');
    const retrySave = failure.writes.at(-1);
    reopened.game.restoreGame(retrySave);
    assert.strictEqual(shape(reopened.game.levelData), shape(failure.game.levelData), 'restoring the retried game must keep the new layout');
}
for (const randomValue of [0, 0.123, 0.999999]) {
    fixedRandom = randomValue;
    try {
        const repeated = persistedGame();
        repeated.game.loadLevel(2);
        for (let retry = 0; retry < 3; retry += 1) {
            const before = JSON.stringify(repeated.game.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => [tile.x, tile.y]));
            repeated.game.restartLevel();
            assert.notStrictEqual(JSON.stringify(repeated.game.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => [tile.x, tile.y])), before,
                'even a repeated random value must produce a different layout on retry');
            assert.strictEqual(repeated.game.levelIndex, 2);
        }
    } finally { fixedRandom = null; }
}
console.log('Third-level retry: same level, different geometry even on RNG collisions, fresh checkpoints and exact layout restoration: OK');
const persisted = persistedGame();
assert.strictEqual(persisted.writes.length, 1);
const topTiles = persisted.game.levelData.tiles.filter(/** 按条件筛选或判断条目：tile.layer === 1。 */ tile => tile.layer === 1);
const matchType = topTiles[0].type;
for (const tile of topTiles.filter(/** 按条件筛选或判断条目：tile.type === matchType。 */ tile => tile.type === matchType).slice(0, 3)) {
    persisted.game.lastMoveSnapshot = {
        tray: persisted.game.tray.slice(), reserve: [],
        removedIds: persisted.game.levelData.tiles.filter(/** 按条件筛选或判断条目：item.removed。 */ item => item.removed).map(/** 将当前条目转换为后续处理所需的值。 */ item => item.id),
    };
    persisted.game.locked = true;
    tile.removed = true;
    persisted.game.insertIntoTray(tile.type);
    const beforeResolve = persisted.writes.length;
    persisted.game.checkpointGame();
    assert.strictEqual(persisted.writes.length, beforeResolve, 'flying tiles must not save half-settled state');
    persisted.game.resolveTray();
    assert.strictEqual(persisted.writes.length, beforeResolve + 1);
}
assert.strictEqual(persisted.writes.at(-1).tray.length, 0, 'save commits match immediately, before animation completes');
const saved = persisted.writes.at(-1);
const afterRestore = persisted.writes.length;
persisted.game.restoreGame(saved);
assert.strictEqual(persisted.writes.length, afterRestore, 'restoring a checkpoint must not overwrite it with a fresh level');
assert.deepStrictEqual(JSON.parse(JSON.stringify(persisted.game.levelData)), JSON.parse(JSON.stringify(saveDomain.restoreLevel(saved))));
persisted.game.useUndoTool();
assert.strictEqual(persisted.writes.at(-1).tray.length, 2);
assert.strictEqual(persisted.writes.at(-1).toolUses.undo, 0);

const savedRevive = persistedGame();
const selected = [];
const typeCounts = {};
for (const tile of savedRevive.game.levelData.tiles.filter(/** 按条件筛选或判断条目：tile.layer === 1。 */ tile => tile.layer === 1)) {
    if ((typeCounts[tile.type] || 0) < 2 && selected.length < 7) {
        selected.push(tile); typeCounts[tile.type] = (typeCounts[tile.type] || 0) + 1;
    }
}
assert.strictEqual(selected.length, 7);
selected.forEach(/** 依次处理集合中的每个条目。 */ tile => {tile.removed = true; savedRevive.game.insertIntoTray(tile.type);});
savedRevive.game.endGame(false);
assert.strictEqual(savedRevive.writes.at(-1).status, 'lost');
savedRevive.game.revive();
assert.strictEqual(savedRevive.writes.at(-1).reserve.length, 3);
assert.strictEqual(savedRevive.writes.at(-1).tray.length, 4);
assert(savedRevive.writes.at(-1).reviveUsed);
const revivalCheckpoint = savedRevive.writes.at(-1);
savedRevive.game.restoreGame(revivalCheckpoint);
assert(savedRevive.game.reviveUsed && savedRevive.game.reserve.length === 3);
savedRevive.game.takeReservedTile(0);
savedRevive.game.useUndoTool();
assert.strictEqual(savedRevive.writes.at(-1).reserve.length, 3, 'reserve/undo remains available after restoration');

completions.splice(0);
const savedFlip = persistedGame();
savedFlip.game.drawTile = /** 根据食材类型和遮挡状态绘制牌面。 */ () => {};
savedFlip.game.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */ tile => {
    const node = new Node(tile.id); node.scale = new Vec3(1, 1, 1);
    node.position = new Vec3(tile.x, tile.y, tile.layer);
    savedFlip.game.tileNodes.set(tile.id, node);
});
const writesBeforeFlip = savedFlip.writes.length;
savedFlip.game.useShuffleTool();
assert.strictEqual(savedFlip.writes.length, writesBeforeFlip, 'shuffle must wait until food types settle');
completions.splice(0).forEach(/** 依次处理集合中的每个条目。 */ callback => callback());
assert.strictEqual(savedFlip.writes.length, writesBeforeFlip + 1);
assert.strictEqual(savedFlip.writes.at(-1).toolUses.shuffle, 0);
assert.deepStrictEqual(JSON.parse(JSON.stringify(savedFlip.writes.at(-1).types)), JSON.parse(JSON.stringify(savedFlip.game.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => tile.type))));
console.log('Real save hooks: settled picks/matches, no restore overwrite, revive/reserve/undo and completed shuffle: OK');

// Unlimited use bypasses only the allowance, preserving normal actions and valid saves.
completions.splice(0);
const unlimited = persistedGame();
unlimited.game.toolUses = {undo: 0, bomb: 0, shuffle: 0};
unlimited.game.unlimitedTools = {undo: true, bomb: true, shuffle: true};
unlimited.game.useUndoTool();
assert.strictEqual(unlimited.game.toolUses.undo, 0, 'no move must remain a no-op');
for (let i = 0; i < 3; i++) {
    const tile = unlimited.game.levelData.tiles.find(/** 按条件筛选或判断条目：!tile.removed && tile.blockedBy.length === 0。 */ tile => !tile.removed && tile.blockedBy.length === 0);
    unlimited.game.lastMoveSnapshot = {tray: [], reserve: [], removedIds: []};
    tile.removed = true; unlimited.game.tray = [tile.type];
    unlimited.game.useUndoTool();
    assert(!tile.removed && unlimited.game.tray.length === 0);
    assert.strictEqual(unlimited.writes.at(-1).toolUses.undo, 0);
}
for (let i = 0; i < 3; i++) {
    const before = unlimited.game.remainingTiles();
    unlimited.game.useBombTool();
    assert(unlimited.game.remainingTiles() < before, 'bomb must work repeatedly with zero normal uses');
    assert.strictEqual(unlimited.writes.at(-1).toolUses.bomb, 0);
}
for (let i = 0; i < 3; i++) {
    const before = unlimited.writes.length;
    unlimited.game.useShuffleTool();
    assert(unlimited.game.locked);
    unlimited.game.useBombTool();
    assert.strictEqual(unlimited.writes.length, before, 'animation locks still apply in unlimited mode');
    completions.splice(0).forEach(/** 依次处理集合中的每个条目。 */ callback => callback());
    assert(!unlimited.game.locked);
    assert.strictEqual(unlimited.writes.length, before + 1);
    assert.strictEqual(unlimited.writes.at(-1).toolUses.shuffle, 0);
}
for (const type of ['undo', 'bomb', 'shuffle']) {
    unlimited.game.unlimitedTools[type] = false;
    assert(!unlimited.game.canUseTool(type), 'turning unlimited off must restore the exhausted allowance');
    unlimited.game.unlimitedTools[type] = true;
}
unlimited.game.gameEnded = true;
assert(!unlimited.game.canUseTool('bomb'), 'unlimited mode cannot act after game over');
unlimited.game.gameEnded = false;
unlimited.game.node.addChild(new Node('BackdoorOverlay'));
assert(!unlimited.game.canUseTool('bomb'), 'the backdoor must block tools while open');
unlimited.game.node.getChildByName('BackdoorOverlay').destroy();
const unlimitedSave = unlimited.writes.at(-1);
unlimited.game.restoreGame(unlimitedSave);
assert(Object.values(unlimited.game.unlimitedTools).every(/** 按条件筛选或判断条目：!value。 */ value => !value), 'restoring a save resets local debug switches');
for (const index of [1, 2, 0]) {
    unlimited.game.unlimitedTools = {undo: true, bomb: true, shuffle: true};
    unlimited.game.loadLevel(index);
    assert(Object.values(unlimited.game.unlimitedTools).every(/** 按条件筛选或判断条目：!value。 */ value => !value), 'restarting or switching level resets unlimited use');
}
unlimited.game.unlimitedTools = {undo: true, bomb: true, shuffle: true};
assert(!unlimited.game.canUseTool('bomb'), 'the first level never enables tools');
assert(unlimited.writes.every(/** 按条件筛选或判断条目：!('unlimitedTools' in save)。 */ save => !('unlimitedTools' in save)), 'debug flags must not enter player saves');
console.log('Unlimited tools: repeated undo/bomb/shuffle at zero allowance, valid saves, lock/menu/end guards and round reset: OK');

// A bomb must keep the other hundreds of board/image nodes intact.
const fastBomb = persistedGame(); fastBomb.game.loadLevel(2);
fastBomb.game.unlimitedTools.bomb = true;
fastBomb.game.refreshTileStates = Game.prototype.refreshTileStates.bind(fastBomb.game);
fastBomb.game.updateProgress = Game.prototype.updateProgress.bind(fastBomb.game);
fastBomb.game.progressLabel = {};
fastBomb.game.createTileNode = fastBomb.game.rebuildBoardTiles = /** 根据关卡数据重建棋盘牌节点。 */ () => assert.fail('bomb must never rebuild the board');
const allTiles = new Map(fastBomb.game.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => [tile.id, tile]));
for (const tile of allTiles.values()) {
    const node = new Node(`Tile_${tile.id}`);
    node.addChild(new Node('IngredientImage'));
    node.selectableState = fastBomb.game.isTileSelectable(tile, allTiles);
    fastBomb.game.board.addChild(node); fastBomb.game.tileNodes.set(tile.id, node);
}
fastBomb.game.findTile = /** 按编号查找棋盘食材牌。 */ () => assert.fail('board refresh must use indexed blocker lookup');
for (let repeat = 0; repeat < 3; repeat++) {
    const previousNodes = new Map(fastBomb.game.tileNodes);
    const previousStates = new Map(Array.from(previousNodes, /** 为测试提供当前调用所需的回调行为。 */ ([id, node]) => [id, node.selectableState]));
    const redraws = [];
    fastBomb.game.drawTile = /** 根据食材类型和遮挡状态绘制牌面。 */ (node, type, blocked) => { redraws.push(node); assert.strictEqual(blocked, !node.selectableState); };
    const before = fastBomb.game.remainingTiles();
    fastBomb.game.useBombTool();
    const eliminated = before - fastBomb.game.remainingTiles();
    assert(eliminated === 3 || eliminated === 6);
    assert.strictEqual(fastBomb.game.tileNodes.size, before - eliminated);
    let changed = 0;
    for (const [id, node] of previousNodes) {
        const tile = allTiles.get(id);
        if (tile.removed) {
            assert(node.destroyed && !node.parent && !fastBomb.game.tileNodes.has(id));
        } else {
            assert.strictEqual(fastBomb.game.tileNodes.get(id), node, 'surviving nodes must be reused');
            assert.strictEqual(node.children[0].name, 'IngredientImage');
            assert.strictEqual(node.selectableState, fastBomb.game.isTileSelectable(tile, allTiles));
            if (node.selectableState !== previousStates.get(id)) changed++;
        }
    }
    assert.strictEqual(redraws.length, changed, 'only newly uncovered tiles must be redrawn');
    assert(redraws.length < previousNodes.size / 4, 'bomb must not redraw most of the 888-tile board');
}
console.log('Bomb performance regression: no board reconstruction, surviving images reused, indexed blockers and only changed states redrawn: OK');

// Endgame setup must keep the original tile inventory/geometry and remain saveable.
completions.splice(0);
for (const index of [0, 1, 2]) {
    for (const status of ['playing', 'lost', 'won']) {
        const reduced = persistedGame(); const g = reduced.game; g.loadLevel(index);
        const geometry = JSON.stringify(g.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => [tile.id, tile.type, tile.x, tile.y, tile.layer, tile.blockedBy]));
        g.unlimitedTools.bomb = index > 0;
        g.reviveUsed = true;
        g.lastMoveSnapshot = {tray: [], reserve: [], removedIds: []};
        if (status === 'won') g.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */ tile => { tile.removed = true; });
        // Include tray and reserve contents, plus ended boards and pending match effects.
        g.tray = ['beef', 'beef']; g.reserve = ['corn'];
        g.gameEnded = status !== 'playing'; g.locked = status !== 'playing'; g.lastResult = status;
        const effects = new Node('MatchEffects'); g.trayNode.addChild(effects);
        g.leaveThreeMatchingTiles();
        assert(effects.destroyed);
        assert.strictEqual(g.remainingTiles(), 3);
        assert.strictEqual(new Set(g.levelData.tiles.filter(/** 按条件筛选或判断条目：!tile.removed。 */ tile => !tile.removed).map(/** 将当前条目转换为后续处理所需的值。 */ tile => tile.type)).size, 1);
        assert.strictEqual(g.tray.length + g.reserve.length, 0);
        assert(!g.gameEnded && !g.locked && g.lastResult === 'playing' && g.lastMoveSnapshot === null);
        assert.strictEqual(g.unlimitedTools.bomb, index > 0);
        assert(g.reviveUsed, 'endgame setup must not restore the revive allowance');
        assert.strictEqual(JSON.stringify(g.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */ tile => [tile.id, tile.type, tile.x, tile.y, tile.layer, tile.blockedBy])), geometry);
        const checkpoint = reduced.writes.at(-1);
        assert.strictEqual(checkpoint.removedIds.length, g.levelData.total - 3);
        assert.strictEqual(checkpoint.rewardedMilestones, index === 2 ? 8 : 0);
        const uses = JSON.stringify(checkpoint.toolUses);
        g.leaveThreeMatchingTiles();
        assert.strictEqual(JSON.stringify(reduced.writes.at(-1).toolUses), uses, 'repeated setup cannot farm rewards');
        g.restoreGame(reduced.writes.at(-1));
        assert.strictEqual(g.remainingTiles(), 3, 'the setup must round-trip through the real save validator');
        while (g.remainingTiles()) {
            const tile = g.levelData.tiles.find(/** 按条件筛选或判断条目：g.isTileSelectable(tile)。 */ tile => g.isTileSelectable(tile));
            assert(tile, 'the remaining triple must have an unblocked pick');
            tile.removed = true; pick(g, tile.type);
        }
        assert.strictEqual(reduced.writes.at(-1).status, 'won');
        assert.strictEqual(g.tray.length, 0);
        completions.splice(0).forEach(/** 依次处理集合中的每个条目。 */ callback => callback());
    }
}
const blockedSetup = persistedGame();
for (const guard of ['animation', 'menu']) {
    blockedSetup.game.locked = guard === 'animation';
    if (guard === 'menu') blockedSetup.game.node.addChild(new Node('BackdoorOverlay'));
    const before = blockedSetup.writes.length;
    blockedSetup.game.leaveThreeMatchingTiles();
    assert.strictEqual(blockedSetup.writes.length, before);
    assert.strictEqual(blockedSetup.game.remainingTiles(), 30);
}
console.log('Three-tile setup: all levels, active/lost/won boards, cleared tray/reserve, valid save/restore, idempotent rewards and final triple wins: OK');
