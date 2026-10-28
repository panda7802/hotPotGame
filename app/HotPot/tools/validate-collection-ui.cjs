'use strict';
// Reproduce missing Cocos component exports without opening the editor.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const root = path.resolve(__dirname, '..');

/**
 * 测试中模拟 Vec3 的最小行为。
 */
class Vec3 {
  /**
   * 初始化实例的内部状态和依赖。
   */
  constructor(x = 0, y = 0, z = 0) {
    /**
     * 三维坐标分量，供测试中的节点定位使用。
     */
    Object.assign(this, {x, y, z});
  }
}
Vec3.ZERO = new Vec3();
Vec3.ONE = new Vec3(1, 1, 1);
/**
 * 测试中模拟 UITransform 的最小行为。
 */
class UITransform {
  /**
   * 更新 setContentSize 对应的状态。
   */
  setContentSize(width, height) {
    Object.assign(this, {width, height});
  }
  /**
   * 更新 setAnchorPoint 对应的状态。
   */
  setAnchorPoint(x, y) {
    this.anchorPoint = {x, y};
  }
}
/**
 * 测试中模拟 Graphics 的最小行为。
 */
class Graphics {
  /**
   * 为测试场景提供 clear 所需的模拟行为。
   */
  /**
   * 为测试场景提供 roundRect 所需的模拟行为。
   */
  /**
   * 为测试场景提供 fill 所需的模拟行为。
   */
  /**
   * 为测试场景提供 stroke 所需的模拟行为。
   */
  /**
   * 为测试场景提供 moveTo 所需的模拟行为。
   */
  /**
   * 为测试场景提供 lineTo 所需的模拟行为。
   */
  clear() {}
  roundRect() {}
  fill() {}
  stroke() {}
  moveTo() {}
  lineTo() {}
}
/**
 * 测试中模拟 Label 的最小行为。
 */
class Label {}
Label.HorizontalAlign = Label.VerticalAlign = {CENTER: 1};
Label.Overflow = {SHRINK: 1};
/**
 * 测试中模拟 Mask 的最小行为。
 */
class Mask {}
/**
 * 测试中模拟 ScrollView 的最小行为。
 */
class ScrollView {}
/**
 * 测试中模拟 Node 的最小行为。
 */
class Node {
  /**
   * 初始化实例的内部状态和依赖。
   */
  constructor(name) {
    /**
     * 节点名称，用于按名称查找弹窗和控件。
     */
    this.name = name;
    /**
     * 当前节点的子节点列表。
     */
    this.children = [];
    /**
     * 测试组件类型到实例的映射。
     */
    this.components = new Map();
    /**
     * 节点事件到回调的映射。
     */
    this.events = new Map();
    /**
     * 节点是否仍允许接受资源加载结果。
     */
    this.isValid = true;
  }
  /**
   * 更新测试节点的父子关系或销毁状态。
   */
  addChild(child) {
    child.parent = this;
    this.children.push(child);
  }
  /**
   * 读取或查找 getChildByName 对应的数据，供测试使用。
   */
  /**
   * 按条件筛选或判断条目：child.name === name。
   */
  getChildByName(name) {
    return this.children.find((child) => child.name === name);
  }
  /**
   * 读取或查找 getComponent 对应的数据，供测试使用。
   */
  getComponent(type) {
    assert(type, 'getComponent: Type must be non-nil');
    return this.components.get(type) || null;
  }
  /**
   * 在组件替身中查找或添加指定类型的组件。
   */
  addComponent(type) {
    assert(type, 'addComponent: Type must be non-nil');
    const component = new type();
    component.node = this;
    this.components.set(type, component);
    return component;
  }
  /**
   * 更新 setPosition 对应的状态。
   */
  setPosition(x, y, z = 0) {
    this.position = typeof x === 'number' ? new Vec3(x, y, z) : x;
  }
  setScale(x, y, z = 1) {
    this.scale = new Vec3(x, y, z);
  }
  setSiblingIndex(index) {
    if (this.parent) {
      const nodes = this.parent.children;
      nodes.splice(nodes.indexOf(this), 1);
      nodes.splice(index, 0, this);
    }
  }
  /**
   * 为测试场景提供 on 所需的模拟行为。
   */
  on(event, handler) {
    this.events.set(event, handler);
  }
  /**
   * 为测试场景提供 emit 所需的模拟行为。
   */
  emit(event) {
    this.events.get(event)?.();
  }
  /**
   * 更新测试节点的父子关系或销毁状态。
   */
  removeFromParent() {
    /**
     * 按条件筛选或判断条目：child !== this。
     */
    if (this.parent) {
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
    }
    this.parent = null;
  }
  /**
   * 更新测试节点的父子关系或销毁状态。
   */
  destroy() {
    this.removeFromParent();
    this.isValid = false;
  }
}
Node.EventType = {
  TOUCH_START: 'start',
  TOUCH_END: 'end',
  TOUCH_CANCEL: 'cancel',
};
const cc = {
  Node,
  Vec3,
  UITransform,
  Graphics,
  Label,
  Mask,
  ScrollView,
  /**
   * 测试中模拟 匿名组件 的最小行为。
   */
  /**
   * 测试中模拟 匿名组件 的最小行为。
   */
  /**
   * 测试中模拟 匿名组件 的最小行为。
   */
  Component: class {},
  BlockInputEvents: class {},
  UIOpacity: class {},
  /**
   * 测试中模拟 匿名组件 的最小行为。
   */
  /**
   * 为测试场景提供 fromHEX 所需的模拟行为。
   */
  Color: class {
    fromHEX(value) {
      this.hex = value;
      return this;
    }
  },
  /**
   * 为测试场景提供 ccclass 所需的模拟行为。
   */
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  _decorator: {ccclass: () => (value) => value},
  /**
   * 为测试场景提供 tween 所需的模拟行为。
   */
  /**
   * 为测试场景提供 stop 所需的模拟行为。
   */
  /**
   * 为测试场景提供 to 所需的模拟行为。
   */
  /**
   * 创建并清空小游戏的 WebGL 启动画布。
   */
  tween() {
    const chain = {
      stop() {
        return chain;
      },
      to() {
        return chain;
      },
      start() {
        return chain;
      },
    };
    return chain;
  },
};
const warnings = [];
const cache = new Map();
/**
 * 载入测试模块并创建隔离的运行环境。
 */
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) {
    return cache.get(filename);
  }
  const compiled = ts.transpileModule(
    fs.readFileSync(filename + '.ts', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        experimentalDecorators: true,
      },
      reportDiagnostics: true,
      fileName: filename + '.ts',
    },
  );
  assert.strictEqual(compiled.diagnostics.length, 0);
  const exports = {};
  cache.set(filename, exports);
  vm.runInNewContext(compiled.outputText, {
    exports,
    setTimeout,
    clearTimeout,
    /**
     * 为测试场景提供 warn 所需的模拟行为。
     */
    console: {warn: (...values) => warnings.push(values)},
    /**
     * 为测试场景提供 require 所需的模拟行为。
     */
    require: (name) =>
      name === 'cc' ? cc : load(path.resolve(path.dirname(filename), name)),
  });
  return exports;
}
const {HotPotGame} = load(path.join(root, 'assets/scripts/core/HotPotGame'));
const {emptyPlayerState} = load(
  path.join(root, 'assets/scripts/data/PlayerData'),
);
const engine = JSON.parse(
  fs.readFileSync(path.join(root, 'settings/v2/packages/engine.json'), 'utf8'),
);
const preview = engine.modules.configs.defaultConfig;
assert.strictEqual(
  preview.cache.mask._value,
  true,
  'editor preview must enable Mask, not only build overrides',
);
assert(
  preview.includeModules.includes('mask') &&
    preview.includeModules.includes('ui'),
);

/**
 * 建立用于界面验证的游戏实例和组件替身。
 */
function createGame() {
  const game = new HotPotGame();
  game.node = new Node('Game');
  game.levelData = {};
  game.playerService = {
    state: emptyPlayerState(),
    statusText: '本机保存',
    regionWins: {},
    leaderboardText: '云端排行 · 完成第三关计 1 次',
    regionCount(code) {
      return this.regionWins[code] || 0;
    },
    sortedRegions(nodes) {
      return nodes.slice().sort((a, b) => this.regionCount(b.code)
        - this.regionCount(a.code));
    },
    refreshLeaderboard: () => Promise.resolve(),
    regions: JSON.parse(
      fs.readFileSync(
        path.join(root, 'assets/resources/data/regions.json'),
        'utf8',
      ),
    ),
  };
  /**
   * 显示短暂的文字提示。
   */
  game.toasts = [];
  game.showToast = (text) => game.toasts.push(text);
  return game;
}
/**
 * 查找并检查弹窗中的滚动区域。
 */
function scrollOf(game, overlayName, viewportName) {
  const panel = game.node
    .getChildByName(overlayName)
    .getChildByName('PlayerPanel');
  const viewport = panel.getChildByName(viewportName);
  assert(viewport.getComponent(Mask), 'the list must be clipped');
  const scroll = viewport.getComponent(ScrollView);
  assert(scroll.vertical && !scroll.horizontal && scroll.cancelInnerEvents);
  assert(
    scroll.content.getComponent(UITransform).height >
      viewport.getComponent(UITransform).height,
  );
  assert.strictEqual(scroll.content.getComponent(UITransform).anchorPoint.y, 1);
  return {panel, viewport, scroll};
}

const game = createGame();
game.playerService.regionWins.OVERSEAS = 12;
game.showPlayerProfile();
game.node.getChildByName('PlayerOverlay').getChildByName('PlayerPanel')
  .getChildByName('Button_云端地域排行榜').emit(Node.EventType.TOUCH_END);
const ranking = scrollOf(game, 'RegionOverlay', 'RegionViewport');
const topRegion = ranking.scroll.content.children[0];
assert(topRegion.getChildByName('Label').getComponent(Label)
  .string.includes('12次'));
topRegion.emit(Node.EventType.TOUCH_END);
assert.strictEqual(game.playerService.state.profile.regionCodes.length, 0);
game.dismissPlayerMenu('RegionOverlay');
/**
 * 为测试提供当前调用所需的回调行为。
 */
assert.doesNotThrow(() => game.showCollection());
let collection = scrollOf(game, 'CollectionOverlay', 'CollectionViewport');
assert.strictEqual(collection.scroll.content.children.length, 23);
collection.panel
  .getChildByName('Button_我的成就')
  .emit(Node.EventType.TOUCH_END);
collection = scrollOf(game, 'CollectionOverlay', 'CollectionViewport');
assert.strictEqual(collection.scroll.content.children.length, 14);
collection.panel
  .getChildByName('Button_食材图鉴')
  .emit(Node.EventType.TOUCH_END);
collection = scrollOf(game, 'CollectionOverlay', 'CollectionViewport');
collection.scroll.content.children[0].emit(Node.EventType.TOUCH_END);
const detail = game.node
  .getChildByName('CollectionDetailOverlay')
  .getChildByName('PlayerPanel');
detail.getChildByName('Button_返回图鉴').emit(Node.EventType.TOUCH_END);
assert(game.node.getChildByName('CollectionOverlay'));
game.dismissPlayerMenu('CollectionOverlay');
game.showRegionPicker([]);
scrollOf(game, 'RegionOverlay', 'RegionViewport');
game.dismissPlayerMenu('RegionOverlay');
console.log(
  'Collection UI: preview Mask enabled, 2' +
    '3 cards, 14 achievements, tab/detail n' +
    'avigation and clipped vertical region ' +
    'scrolling: OK',
);

// The hidden sequence must be silent, ordered and scoped to an open collection.
/**
 * 获取指定名称的弹窗面板。
 */
function panelOf(game, name = 'CollectionOverlay') {
  return game.node.getChildByName(name)?.getChildByName('PlayerPanel');
}
/**
 * 模拟点击图鉴标题。
 */
function tapHeading(game, count) {
  for (let i = 0; i < count; i++) {
    panelOf(game)
      .getChildByName('HeadingPlaque')
      .getChildByName('Label')
      .emit(Node.EventType.TOUCH_END);
  }
}
/**
 * 模拟点击食材图鉴入口。
 */
function tapIngredients(game, count) {
  for (let i = 0; i < count; i++)
    panelOf(game)
      .getChildByName('Button_食材图鉴')
      .emit(Node.EventType.TOUCH_END);
}
const hidden = createGame();
hidden.showCollection();
tapIngredients(hidden, 3);
tapHeading(hidden, 5);
tapIngredients(hidden, 3);
assert(
  !panelOf(hidden, 'BackdoorOverlay'),
  'wrong order or fewer than six title taps must not open it',
);
tapHeading(hidden, 6);
tapIngredients(hidden, 2);
assert(
  !panelOf(hidden, 'BackdoorOverlay'),
  'two ingredient taps must not open it',
);
assert.strictEqual(
  hidden.toasts.length,
  0,
  'the partial sequence must stay silent',
);
tapIngredients(hidden, 1);
assert(!panelOf(hidden) && panelOf(hidden, 'BackdoorOverlay'));
assert(hidden.hasPlayerMenu(), 'the backdoor must block game actions');
assert(
  !panelOf(hidden, 'BackdoorOverlay').getChildByName('Unlimited_undo'),
  'first level has no tool switches',
);
assert.strictEqual(hidden.toasts.length, 0);
panelOf(hidden, 'BackdoorOverlay')
  .getChildByName('Button_返回游戏')
  .emit(Node.EventType.TOUCH_END);
assert(!hidden.hasPlayerMenu());
hidden.showCollection();
tapHeading(hidden, 6);
tapIngredients(hidden, 2);
panelOf(hidden)
  .getChildByName('Button_返回游戏')
  .emit(Node.EventType.TOUCH_END);
hidden.showCollection();
tapIngredients(hidden, 1);
assert(
  !panelOf(hidden, 'BackdoorOverlay'),
  'leaving the collection must discard the partial sequence',
);
tapHeading(hidden, 6);
panelOf(hidden)
  .getChildByName('Button_我的成就')
  .emit(Node.EventType.TOUCH_END);
tapIngredients(hidden, 3);
assert(
  !panelOf(hidden, 'BackdoorOverlay'),
  'switching to achievements interrupts the sequence',
);
hidden.dismissPlayerMenu('CollectionOverlay');
hidden.showCollection('achievements');
tapHeading(hidden, 6);
tapIngredients(hidden, 3);
assert(
  panelOf(hidden, 'BackdoorOverlay'),
  'the title works on either collection tab',
);
hidden.dismissPlayerMenu('BackdoorOverlay');
hidden.levelIndex = 1;
hidden.showBackdoor();
for (const type of ['undo', 'bomb', 'shuffle']) {
  const button = panelOf(hidden, 'BackdoorOverlay').getChildByName(
    `Unlimited_${type}`,
  );
  button.emit(Node.EventType.TOUCH_END);
  assert(hidden.unlimitedTools[type]);
  assert.strictEqual(
    button
      .getChildByName('Label')
      .getComponent(Label)
      .string.endsWith('无限使用'),
    true,
  );
  button.emit(Node.EventType.TOUCH_END);
  assert(!hidden.unlimitedTools[type]);
}
/**
 * 生成并显示指定关卡，按需保存。
 */
hidden.loadLevel = (index) => {
  hidden.levelIndex = index;
};
panelOf(hidden, 'BackdoorOverlay')
  .getChildByName('Button_进入第3关 · 千层盛宴')
  .emit(Node.EventType.TOUCH_END);
assert.strictEqual(hidden.levelIndex, 2);
assert(panelOf(hidden, 'BackdoorOverlay').getChildByName('Unlimited_shuffle'));
let leaveThreeCalls = 0;
/**
 * 将调试棋盘缩减为可直接消除的三张牌。
 */
hidden.leaveThreeMatchingTiles = () => {
  leaveThreeCalls++;
  assert(!hidden.hasPlayerMenu());
};
panelOf(hidden, 'BackdoorOverlay')
  .getChildByName('Button_本关只留3个相同食材')
  .emit(Node.EventType.TOUCH_END);
assert.strictEqual(
  leaveThreeCalls,
  1,
  'the button closes the backdoor and applies the endgame setup',
);
hidden.levelIndex = 0;
hidden.showBackdoor();
assert(
  panelOf(hidden, 'BackdoorOverlay').getChildByName(
    'Button_本关只留3个相同食材',
  ),
  'the three-tile action is available on level one too',
);
hidden.dismissPlayerMenu('BackdoorOverlay');
console.log(
  'Hidden entry: silent 6+3 sequence, wro' +
    'ng-order/exit resets, tab navigation, ' +
    'level selection and independent tool s' +
    'witches: OK',
);

for (const missing of ['Mask', 'ScrollView']) {
  const component = cc[missing];
  cc[missing] = undefined;
  try {
    const stalePreview = createGame();
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    assert.doesNotThrow(() => stalePreview.showCollection());
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    assert.doesNotThrow(() => stalePreview.showCollection('achievements'));
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    assert.doesNotThrow(() => stalePreview.showRegionPicker([]));
    assert.strictEqual(
      stalePreview.node.children.length,
      0,
      'missing exports must not leave a blocking half-built overlay',
    );
    assert.strictEqual(stalePreview.toasts.length, 3);
  } finally {
    cc[missing] = component;
  }
}
assert.strictEqual(warnings.length, 6);
/**
 * 为测试提供当前调用所需的回调行为。
 */
assert.doesNotThrow(
  () => createGame().showCollection(),
  'the collection remains usable after components are restored',
);
console.log(
  'Missing Mask/ScrollView: no nil compon' +
    'ent calls, no partial overlays, visibl' +
    'e recovery message and retry after exp' +
    'orts return: OK',
);

// Exercise the real loader and real atlas dimensions without the editor
// runtime.
/**
 * 测试中模拟 匿名组件 的最小行为。
 */
/**
 * 初始化实例的内部状态和依赖。
 */
cc.Rect = class {
  constructor(x, y, width, height) {
    Object.assign(this, {x, y, width, height});
  }
};
/**
 * 测试中模拟 匿名组件 的最小行为。
 */
cc.SpriteFrame = class {};
cc.Sprite = class {};
cc.Sprite.Type = {SLICED: 1};
cc.Sprite.SizeMode = {CUSTOM: 1};
/**
 * 载入测试模块并创建隔离的运行环境。
 */
cc.resources = {
  load(resource, _type, done) {
    const file = path.join(
      root,
      'assets/resources',
      resource.replace(/\/texture$/, '.png'),
    );
    const bytes = fs.readFileSync(file);
    done(null, {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)});
  },
};
const ui = load(path.join(root, 'assets/scripts/core/HotPotUi'));
for (const [width, height] of [[102, 48], [124, 58], [264, 64], [510, 70]]) {
  const button = ui.makeButton(
    new Node('Test'), '图鉴', Vec3.ZERO, width, height, '#A3613B', () => {},
  );
  const skin = button.getChildByName('LacquerSkin');
  const frame = skin.getComponent(cc.Sprite).spriteFrame;
  const label = button.getChildByName('Label').getComponent(UITransform);
  assert(label.width <= width - 2 * frame.insetLeft * skin.scale.x);
  assert(label.height <= height - 2 * frame.insetTop * skin.scale.y);
  assert(Math.abs(skin.getComponent(UITransform).width * skin.scale.x
    - width) < 0.001);
  assert.strictEqual(button.children[0], skin);
}
console.log('Button skins: compact/large label bounds clear all borders: OK');
const loaded = createGame();
let ready = 0;
/**
 * 为测试提供当前调用所需的回调行为。
 */
loaded.loadIngredientImages(() => ready++);
assert.strictEqual(
  ready,
  1,
  'initialization must wait for all atlases exactly once',
);
assert.strictEqual(loaded.ingredientFrames.size, 23);
for (const frame of loaded.ingredientFrames.values()) {
  if (!frame.rect) {
    continue;
  } // standalone tea-tree mushroom
  const {x, y, width, height} = frame.rect;
  assert(width > 0 && height > 0 && x >= 0 && y >= 0);
  assert(
    x + width <= frame.texture.width && y + height <= frame.texture.height,
  );
}
assert.strictEqual(loaded.ingredientFrames.get('lamb').rect.width, 256);
assert.strictEqual(loaded.ingredientFrames.get('yam').rect.x, 512);
assert.strictEqual(loaded.ingredientFrames.get('kelp').rect.y, 256);
console.log(
  'Production food art: all 23 frames loa' +
    'd, new sheets crop to exact 256px cell' +
    's and complete once: OK',
);
