'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const assert = require('assert'), crypto = require('crypto');
const {inspectWechatPackages} = require('./wechat-package-budget.cjs');
const root = path.resolve(__dirname, '..');
const build = path.resolve(process.argv[2] || path.join(root, 'build/wechatgame-cloud-dev'));
const reportFile = path.resolve(process.argv[3] || path.join(root, 'temp/wechat-lossless-validation.json'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function walk(folder) {
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    assert(!entry.isSymbolicLink());const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(build);
const budget = inspectWechatPackages(build);
const {bytes, packages, mainBytes} = budget;
for (const file of files.filter(file => file.endsWith('.js'))) {
  new vm.Script(fs.readFileSync(file, 'utf8'), {filename: path.relative(build, file)});
}
const media = files.filter(file => /\.(png|jpe?g|mp3)$/i.test(file));
const mediaHashes = media.map(file => ({file, hash: hash(fs.readFileSync(file))}));
const unchangedMedia = [];
const victoryFolder = path.join(root, 'assets/victory');
const sources = [...walk(path.join(root, 'assets/resources')),
  ...(fs.existsSync(victoryFolder) ? walk(victoryFolder) : [])];
for (const source of sources.filter(file => /\.(png|jpe?g|mp3)$/i.test(file))) {
  const sourceHash = hash(fs.readFileSync(source));
  const matches = mediaHashes.filter(item => item.hash === sourceHash);
  assert.strictEqual(matches.length, 1, 'Media missing, duplicated or modified: ' + source);
  unchangedMedia.push({source: path.relative(root, source).replaceAll('\\', '/'),
    packaged: path.relative(build, matches[0].file).replaceAll('\\', '/'),
    bytes: fs.statSync(source).size, sha256: sourceHash});
}
if (fs.existsSync(victoryFolder)) {
  const settings = JSON.parse(fs.readFileSync(path.join(build, 'src/settings.json')));
  for (const style of [1,4,8,9]) {
    const name = 'victory-0' + style;
    const item = packages.find(item => item.name === name);
    assert(item, 'Missing victory subpackage: ' + name);
    const image = unchangedMedia.find(item => item.source === `assets/victory/style-0${style}/win.jpg`);
    assert(image && image.packaged.startsWith(item.root), 'Victory art must stay in its own theme subpackage');
    assert.strictEqual(mediaHashes.filter(media => path.relative(build, media.file)
      .replaceAll('\\', '/').startsWith(item.root)).length, 1,
    'Each victory theme must contain one image; do not retain the old PNG');
    assert(!settings.assets.preloadBundles.some(item => (typeof item === 'string' ? item : item.bundle) === name),
      'Victory art must not preload at startup');
  }
}
const retired = fs.readFileSync(path.join(root, 'art-source/retired-tiles-20261103/tiles.png'));
assert(!mediaHashes.some(item => item.hash === hash(retired)), 'Retired undrawn texture was packaged');
const resourceConfig = JSON.parse(fs.readFileSync(path.join(build, 'subpackages/resources/config.json')));
assert(!Object.values(resourceConfig.paths).some(item => item[0].startsWith('reference/tiles')));

const records = new Map(), loaded = new Map();
const context = {System: {register(name, dependencies, declare) {
  if (typeof name === 'string') records.set(name, {dependencies, declare});
  else dependencies(() => {}, {}).execute();
}}};
vm.runInNewContext(fs.readFileSync(path.join(build, 'src/chunks/bundle.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(build, 'subpackages/main/game.js'), 'utf8'), context);
function load(name) {
  if (name === 'cc') return {cclegacy: {_RF: {push() {}, pop() {}}}};
  if (loaded.has(name)) return loaded.get(name);
  const record = records.get(name);assert(record, name);
  const values = {};loaded.set(name, values);
  const module = record.declare((key, value) => {
    if (typeof key === 'string') values[key] = value;else Object.assign(values, key);
    return value;
  }, {meta: {url: name}});
  record.dependencies.forEach((dependency, i) => module.setters[i]?.(load(
    dependency.startsWith('.') ? new URL(dependency, name).href : dependency)));
  module.execute();return values;
}
const data = load('chunks:///_virtual/GameData.ts');
const config = load('chunks:///_virtual/GameConfig.ts');
const domain = load('chunks:///_virtual/PlayerData.ts');
assert.strictEqual(config.INGREDIENTS.length, 60);
assert.strictEqual(config.HIDDEN_INGREDIENT_WEIGHT, .1);
assert.strictEqual(domain.PLAY_SESSION_VERSION, 7);
const hidden = new Set(Array.from(config.HIDDEN_INGREDIENTS, item => item.id));
for (const start of [1, 42, 12345, data.INGREDIENT_SEED_MAX]) {
  const seed = data.firstThirdLevelIngredientSeed(start);
  assert(Array.from(data.selectLevelIngredients(2, seed)).some(id => hidden.has(id)));
}
assert.strictEqual(domain.emptyProgress().thirdLevelEntered, false);
assert.strictEqual(domain.mergeProgress(domain.emptyProgress(),
  {...domain.emptyProgress(), thirdLevelEntered: true}).thirdLevelEntered, true);
const inventory = board => JSON.stringify(Array.from(board.tiles, tile => tile.type).sort());
const discovered = new Set();
for (let seed = 1; seed < 2000; seed++) {
  for (const index of [0, 1, 2]) {
    const pool = Array.from(data.selectLevelIngredients(index, seed * 123457));
    if (index < 2) assert(!pool.some(id => hidden.has(id)));
    else pool.filter(id => hidden.has(id)).forEach(id => discovered.add(id));
  }
}
assert.strictEqual(discovered.size, 10);
for (const index of [0, 1, 2]) {
  const board = data.createLevel(index);
  const restarted = data.createRestartLevel(board);
  assert.strictEqual(inventory(board), inventory(restarted));
  assert.strictEqual(board.ingredientSeed, restarted.ingredientSeed);
  assert.strictEqual(board.ingredientPoolVersion, 4);
}
const report = {build: fs.readFileSync(path.join(root, 'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1], bytes, mainBytes, packages, packageBudget: budget,
  mediaByteIdentical: true, unchangedMedia, retiredTextureExcluded: true,
  allJsParses: true, bundledIngredients: 60, hiddenWeight: .1, protocol: 7,
  allHiddenReachable: true, manualRestartKeepsInventory: true,
  firstThirdLevelGuarantee: true, firstEntryFlagCloudMerge: true,
  mainSha256: hash(fs.readFileSync(path.join(build, 'subpackages/main/game.js')))};
fs.mkdirSync(path.dirname(reportFile), {recursive: true});
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`WeChat client: ${bytes} bytes; main ${mainBytes}; ${unchangedMedia.length} source media files byte-identical; 60 ingredients/protocol 7/manual restart: OK`);
