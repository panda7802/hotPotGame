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
class Vec3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, {x, y, z}); }
    clone() { return new Vec3(this.x, this.y, this.z); }
}
Vec3.ONE = new Vec3(1, 1, 1);
class Node {
    constructor(name) { this.name = name; this.children = []; this.position = new Vec3(); }
    addChild(child) { child.setParent(this); }
    setParent(parent) { this.removeFromParent(); this.parent = parent; parent.children.push(this); }
    removeFromParent() {
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent = null;
    }
    destroy() { this.removeFromParent(); this.destroyed = true; }
    getComponent() { return {}; }
}
const cc = {
    _decorator: {ccclass: () => klass => klass}, Component: class {}, Node, Vec3,
    tween() {
        const callbacks = [];
        const chain = {
            to() { return chain; }, delay() { return chain; },
            call(callback) { callbacks.push(callback); return chain; },
            start() { completions.push(...callbacks); return chain; },
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
    game.playEffect = game.showToast = game.createTrayMatchBurst = () => {};
    game.endGame = won => { game.result = won; game.gameEnded = true; game.locked = true; };
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
