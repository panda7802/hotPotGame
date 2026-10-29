'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {execFileSync} = require('child_process');
const {performance} = require('perf_hooks');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const project = path.resolve(__dirname, '..');
const modules = new Map();
let uploads = 0;
let uploaded;
let builds = 0;

class Node {
  constructor() { this.children = []; this.components = new Map(); }
  addChild(child) { child.parent = this; this.children.push(child); }
  getChildByName() { return this.children[0]; }
  setSiblingIndex() {}
  setPosition() {}
  getComponent(type) { return this.components.get(type); }
  addComponent(type) {
    const component = new type();
    this.components.set(type, component);
    return component;
  }
}
class UITransform { setContentSize() {} }
class Sprite {}
Sprite.SizeMode = {CUSTOM: 1};
class SpriteFrame { addRef() {} }
class Texture2D {
  reset(info) { Object.assign(this, info); }
  addRef() {}
  uploadData(data) { uploads++; uploaded = data; }
}
const cc = {
  Node, UITransform, Sprite, SpriteFrame, Texture2D,
  Rect: class { constructor(x, y, width, height) {
    Object.assign(this, {x, y, width, height});
  } },
  Size: class { constructor(width, height) {
    Object.assign(this, {width, height});
  } },
  Graphics: class { constructor() {
    assert.fail('food tiles must never allocate a Graphics component');
  } },
};

/** Load real TypeScript with only the rendering boundary replaced. */
function load(file, source) {
  file = path.resolve(file);
  if (!source && modules.has(file)) {
    return modules.get(file);
  }
  const result = ts.transpileModule(source || fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019}, reportDiagnostics: true,
  });
  assert.strictEqual(result.diagnostics.length, 0);
  const exports = {};
  vm.runInNewContext(result.outputText, {
    exports, Math, Uint8Array,
    require: (name) => name === 'cc' ? cc
      : load(path.resolve(path.dirname(file), `${name}.ts`)),
  });
  if (!source) {
    modules.set(file, exports);
  }
  return exports;
}
const ui = load(path.join(project, 'assets/scripts/core/HotPotUi.ts'));
let texture;
for (let i = 0; i < 888; i++) {
  const node = new Node();
  ui.drawFoodTile(node, 110.4, 91.2, i % 2 === 0);
  const frame = node.children[0].getComponent(Sprite).spriteFrame;
  texture = texture || frame.texture;
  assert.strictEqual(frame.texture, texture);
  assert.strictEqual(frame.originalSize.width, 112);
  ui.drawFoodTile(node, 110.4, 91.2, i % 2 !== 0);
  assert.strictEqual(node.children.length, 1);
}
assert.strictEqual(uploads, 1);
assert.strictEqual(uploaded.byteLength, 93184);
const artifact = path.join(project, 'temp/mobile-performance');
fs.mkdirSync(artifact, {recursive: true});
fs.writeFileSync(path.join(artifact, 'tile-faces.rgba'), uploaded);
console.log('888 tiles: zero Graphics, one 224x104 texture, '
  + '93,184 RGBA bytes, face changes reuse sprites: OK');

const dataFile = path.join(project, 'assets/scripts/data/GameData.ts');
const current = load(dataFile);
const previousSource = execFileSync('git', [
  'show', 'HEAD:app/HotPot/assets/scripts/data/GameData.ts',
], {cwd: project, encoding: 'utf8'});
const previous = load(dataFile, previousSource);
for (const seed of [0, 1, 42, 1073741823,
  2147483647, 2147483648, 4294967292]) {
  for (const index of [0, 1, 2]) {
    const before = previous.createLevel(index, seed, undefined, 12345);
    const after = current.createLevel(index, seed, undefined, 12345);
    assert.strictEqual(JSON.stringify(after), JSON.stringify(before),
      `geometry/ordered blockers/ingredients changed: ${index}/${seed}`);
  }
}
console.log('Spatial lookup: exact legacy/new geometry, ingredient '
  + 'distribution and ordered blocker lists match the previous build: OK');

const originalCreate = current.createLevel;
current.createLevel = (...args) => {
  builds++;
  return originalCreate(...args);
};
const domain = load(path.join(project, 'assets/scripts/data/PlayerData.ts'));
const level = originalCreate(2, 2147483647, undefined, 12345);
const save = {
  version: 1, boardVersion: domain.BOARD_VERSION, levelIndex: 2,
  layoutSeed: level.layoutSeed, ingredientSeed: level.ingredientSeed,
  types: level.tiles.map((tile) => tile.type), removedIds: [],
  tray: [], reserve: [], reviveUsed: false, rewardedMilestones: 0,
  toolUses: {undo: 1, bomb: 1, shuffle: 1}, lastMove: null,
  status: 'playing',
};
for (let i = 0; i < 12; i++) {
  domain.validateGameSave(save);
  domain.restoreLevel(save);
}
assert.strictEqual(builds, 2,
  'inventory and geometry must each build once, not on every restore');
console.log('12 save/restore cycles: only two template generations: OK');

/** Local measurements compare generation only; no claim about phone FPS. */
function measure(create) {
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const start = performance.now();
    create(2, 2147483647 + i, undefined, 12345);
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[6];
}
const timings = {
  generationBeforeMs: measure(previous.createLevel),
  generationAfterMs: measure(originalCreate),
  tileTextureBytes: uploaded.byteLength,
};
fs.writeFileSync(path.join(artifact, 'results.json'),
  JSON.stringify(timings, null, 2));
console.log('Local generation medians:', JSON.stringify(timings));
