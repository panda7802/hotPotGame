'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const assert = require('assert');
const {chromium, launchOptions} = require('./browser-runtime.cjs');
const root = path.resolve(__dirname, '..'), repo = path.resolve(root, '../..');
const web = path.join(repo, 'tmp/hidden-ingredients-build-20261103/app/HotPot/build/web-hidden-ingredients');
const out = process.env.HOTPOT_COLLECTION_OUT || path.join(repo, 'tmp/collection-first-rare-20261104');
const data = require(path.join(root, 'cloudfunctions/hotpotPlayerDev/GameData'));
const domain = require(path.join(root, 'cloudfunctions/hotpotPlayerDev/PlayerData'));
const {HIDDEN_INGREDIENTS} = require(path.join(root, 'cloudfunctions/hotpotPlayerDev/GameConfig'));
const hiddenIds = HIDDEN_INGREDIENTS.map(item => item.id);
const expectedBuild = fs.readFileSync(path.join(root, 'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
assert(fs.readFileSync(path.join(web, 'assets/main/index.js'), 'utf8')
  .includes(expectedBuild), 'Stale web build');
let formattedShaderStages = 0;
if (process.env.HOTPOT_VERIFY_MINIFIED_SHADERS === '1') {
  const {compactShader} = require('./optimize-wechat-lossless.cjs');
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if ((key === 'glsl1' || key === 'glsl3') && value[key]) {
        for (const stage of ['vert', 'frag']) if (typeof value[key][stage] === 'string') {
          value[key][stage] = compactShader(value[key][stage]);formattedShaderStages++;
        }
      } else visit(value[key]);
    }
  };
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.json')) {
        const value = JSON.parse(fs.readFileSync(file));visit(value);
        fs.writeFileSync(file, JSON.stringify(value));
      }
    }
  };
  walk(path.join(web, 'assets/internal/import'));
  assert(formattedShaderStages > 0);
}
let seed = 1, level;
while (true) {
  if (data.selectLevelIngredients(2, seed).includes('caviar')) {
    level = data.createLevel(2, data.VARIED_LAYOUT_SEED_START, undefined, seed);
    if (level.tiles.some(tile => tile.type === 'caviar' && tile.blockedBy.length === 0)) break;
  }
  seed++;
}
const save = {version: 1, boardVersion: domain.BOARD_VERSION, levelIndex: 2,
  layoutSeed: level.layoutSeed, ingredientSeed: seed, ingredientPoolVersion: 4,
  types: level.tiles.map(tile => tile.type), removedIds: [], tray: [], reserve: [],
  reviveUsed: false, rewardedMilestones: 0, toolUses: {undo: 1, bomb: 1, shuffle: 1},
  lastMove: null, status: 'playing'};
fs.mkdirSync(out, {recursive: true});
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(web, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file)
    || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.js': 'application/javascript', '.json': 'application/json',
    '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.mp3': 'audio/mpeg', '.wasm': 'application/wasm'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function click(page, name) {
  const point = await page.evaluate(name => {
    const node = findNode(g.node, name);
    if (!node) throw Error('Missing button: ' + name);
    const bounds = node.getComponent(cc.UITransform).getBoundingBoxToWorld();
    const size = cc.view.getVisibleSize(), origin = cc.view.getVisibleOrigin();
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    return {x: canvas.x + (bounds.x + bounds.width / 2 - origin.x) / size.width * canvas.width,
      y: canvas.y + (1 - (bounds.y + bounds.height / 2 - origin.y) / size.height) * canvas.height};
  }, name);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(180);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({...launchOptions,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const errors = [], missing = [], checks = [], shaderErrors = [];
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /(?:fail|error).*shader|shader.*(?:fail|error)|GL_INVALID_(?:OPERATION|VALUE)/i.test(message.text())) shaderErrors.push(message.text());
    });
    page.on('response', response => {
      if (response.url().startsWith(origin) && response.status() >= 400) missing.push(response.url());
    });
    await page.route('**/*', route => route.request().url().startsWith(origin)
      ? route.continue() : route.abort());
    await page.goto(origin);
    await page.waitForFunction(() => typeof System !== 'undefined');
    await page.evaluate(async () => {window.cc = await System.import('cc');});
    await page.waitForFunction(() => {
      window.findNode = (node, name) => {
        if (node?.name === name) return node;
        for (const child of node?.children || []) {const found = findNode(child, name); if (found) return found;}
        return null;
      };
      const find = node => {
        const game = node?.getComponent('HotPotGame'); if (game) return game;
        for (const child of node?.children || []) {const game = find(child); if (game) return game;}
      };
      window.g = find(cc.director.getScene());
      return g?.ingredientFrames.size === 60 && g?.playerService && g?.levelData;
    }, null, {timeout: 90000});
    await page.evaluate(() => {window.realCheckpointGame = g.checkpointGame.bind(g); g.checkpointGame = () => {}; g.setSoundEnabled?.(false);});
    for (const size of [{width: 390, height: 844}, {width: 360, height: 640}]) {
      await page.setViewportSize(size);
      for (const style of [1, 4, 8, 9]) {
        const result = await page.evaluate(({style, hiddenIds}) => {
          g.dismissPlayerMenu('CollectionOverlay');g.dismissPlayerMenu('CollectionDetailOverlay');
          g.selectPageStyle(style);
          g.playerService.local.state.progress.discovered = [];
          g.designIngredientGroup = 'ingredients';
          g.showCollection();
          const panel = findNode(g.node, 'CollectionOverlay');
          const cards = panel.getComponentsInChildren(cc.UITransform)
            .map(component => component.node).filter(node => node.name.startsWith('IngredientCard_'));
          const ordinaryOnly = cards.length === 50 && hiddenIds.every(id => !findNode(panel, 'IngredientCard_' + id));
          return {cards: cards.length, ordinaryOnly};
        }, {style, hiddenIds});
        assert.strictEqual(result.cards, 50);assert(result.ordinaryOnly);
        await page.waitForTimeout(180);
        await page.screenshot({path: path.join(out, `${style}-${size.width}-normal.png`)});
        await click(page, 'IngredientGroup_hidden');
        const locked = await page.evaluate(hiddenIds => {
          const panel = findNode(g.node, 'CollectionOverlay');
          const cards = panel.getComponentsInChildren(cc.UITransform)
            .map(component => component.node).filter(node => node.name.startsWith('IngredientCard_'));
          return cards.length === 10 && hiddenIds.every(id => {
            const card = findNode(panel, 'IngredientCard_' + id);
            return card && !findNode(card, 'IngredientImage')
              && card.getComponentsInChildren(cc.Label).some(label => label.string === '隐藏珍藏');
          });
        }, hiddenIds);
        assert(locked);
        await page.waitForTimeout(250);
        await page.screenshot({path: path.join(out, `${style}-${size.width}-locked.png`)});
        const unlocked = await page.evaluate(hiddenIds => {
          g.dismissPlayerMenu('CollectionOverlay');
          g.playerService.local.state.progress.discovered = hiddenIds;
          g.showCollection();
          const panel = findNode(g.node, 'CollectionOverlay');
          return hiddenIds.every(id => !!findNode(findNode(panel, 'IngredientCard_' + id), 'IngredientImage'));
        }, hiddenIds);
        assert(unlocked);
        await page.waitForTimeout(250);
        await page.screenshot({path: path.join(out, `${style}-${size.width}-unlocked.png`)});
        await page.evaluate(() => {
          g.dismissPlayerMenu('CollectionOverlay');
          g.playerService.local.state.progress.discovered = [];
          g.showBackdoor();
        });
        await page.waitForTimeout(100);
        await page.screenshot({path: path.join(out, `${style}-${size.width}-backdoor.png`)});
        await click(page, 'Button_图鉴全开');
        const allOpen = await page.evaluate(() => g.playerService.state.progress.discovered.length === 60);
        assert(allOpen);
        await page.evaluate(() => g.dismissPlayerMenu('BackdoorOverlay'));
        checks.push({style, size, ordinaryCards: result.cards, premiumCards: 10, locked, unlocked, allOpen});
      }
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(() => {
      g.dismissPlayerMenu('CollectionOverlay');g.showCollection();
      findNode(g.node, 'CollectionViewport').getComponent(cc.ScrollView).scrollToBottom(0);
    });
    await page.waitForTimeout(100);
    const premiumOffset = await page.evaluate(() => findNode(g.node, 'CollectionViewport').getComponent(cc.ScrollView).getScrollOffset().y);
    await click(page, 'IngredientGroup_ingredients');
    await page.evaluate(() => findNode(g.node, 'CollectionViewport').getComponent(cc.ScrollView).scrollToBottom(0));
    await page.waitForTimeout(100);
    await click(page, 'IngredientGroup_hidden');
    const tabOffset = await page.evaluate(() => findNode(g.node, 'CollectionViewport').getComponent(cc.ScrollView).getScrollOffset().y);
    assert(Math.abs(tabOffset - premiumOffset) < 1, 'Each tab must keep its own scroll offset');
    await click(page, 'IngredientCard_caviar');
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => findNode(g.node, 'CollectionDetailOverlay')
      .getComponentsInChildren(cc.Label).some(label => label.string === '鱼子酱')));
    await page.screenshot({path: path.join(out, 'caviar-detail.png')});
    await click(page, 'Button_返回');
    const detailReturn = await page.evaluate(() => g.designIngredientGroup === 'hidden'
      && !!findNode(g.node, 'IngredientCard_caviar') && !findNode(g.node, 'IngredientCard_beef'));
    assert(detailReturn, 'Returning from detail must keep the premium tab');
    const picked = await page.evaluate(save => {
      g.dismissPlayerMenu('CollectionOverlay');g.dismissPlayerMenu('CollectionDetailOverlay');g.restoreGame(save);
      const tile = g.levelData.tiles.find(tile => tile.type === 'caviar' && g.isTileSelectable(tile));
      const node = g.tileNodes.get(tile.id);
      const frame = findNode(node, 'IngredientImage').getComponent(cc.Sprite).spriteFrame;
      g.onTileClicked(tile);
      return {correctFrame: frame === g.ingredientFrames.get('caviar'), tray: g.tray.includes('caviar')};
    }, save);
    assert(picked.correctFrame && picked.tray);
    await page.waitForTimeout(700);
    await page.screenshot({path: path.join(out, 'caviar-board-tray.png')});
    const restarts = await page.evaluate(save => {
      const inventory = () => JSON.stringify(g.levelData.tiles.map(tile => tile.type).sort());
      const cases = [];
      for (let index = 0; index < 3; index++) {
        if (index === 2) g.restoreGame(save); else g.loadLevel(index, false);
        const before = inventory(), seed = g.levelData.ingredientSeed;
        const arrangement = JSON.stringify(g.levelData.tiles);
        g.restartLevel();
        cases.push({index, preserved: inventory() === before && g.levelData.ingredientSeed === seed,
          layoutChanged: JSON.stringify(g.levelData.tiles) !== arrangement});
      }
      const beforeFailure = g.levelData.ingredientSeed;
      g.gameEnded = true;g.lastResult = 'lost';g.restartLevel();
      cases.push({event: 'failure', refreshed: g.levelData.ingredientSeed !== beforeFailure});
      const beforeWin = g.levelData.ingredientSeed;
      g.gameEnded = true;g.lastResult = 'won';g.restartLevel();
      cases.push({event: 'win', refreshed: g.levelData.ingredientSeed !== beforeWin});
      g.playerService.local.state.playDate = '2000-01-01';
      g.restartLevel();
      cases.push({event: 'daily', resetToFirst: g.levelIndex === 0});
      return cases;
    }, save);
    assert(restarts.slice(0, 3).every(item => item.preserved && item.layoutChanged));
    assert(restarts[3].refreshed && restarts[4].refreshed && restarts[5].resetToFirst);
    let ordinarySeed = 1;
    while (data.selectLevelIngredients(2, ordinarySeed).some(id => hiddenIds.includes(id))) ordinarySeed++;
    const firstVisit = await page.evaluate(({state, ordinarySeed, max, hiddenIds}) => {
      g.dismissPlayerMenu('CollectionOverlay');g.dismissPlayerMenu('CollectionDetailOverlay');
      g.playerService.local.state = state;
      g.checkpointGame = window.realCheckpointGame;
      const random = Math.random;
      Math.random = () => (ordinarySeed - 0.5) / max;
      try {
        const hasRare = () => g.levelData.tiles.some(tile => hiddenIds.includes(tile.type));
        g.loadLevel(0);const firstClean = !hasRare();
        g.loadLevel(1);const secondClean = !hasRare();
        g.nextLevel();
        const guaranteed = hasRare(), recorded = g.playerService.state.progress.thirdLevelEntered;
        const discovered = g.playerService.state.progress.discovered.length;
        const inventory = JSON.stringify(g.levelData.tiles.map(tile => tile.type).sort());
        g.restartLevel();
        const restartPreserved = inventory === JSON.stringify(g.levelData.tiles.map(tile => tile.type).sort());
        g.loadLevel(0);g.loadLevel(2);
        return {firstClean, secondClean, guaranteed, recorded, discovered, restartPreserved,
          laterUsesNormalDraw: !hasRare() && g.levelData.ingredientSeed === ordinarySeed};
      } finally {Math.random = random;}
    }, {state: {...domain.emptyPlayerState(), playDate: domain.localPlayDate()}, ordinarySeed,
      max: data.INGREDIENT_SEED_MAX, hiddenIds});
    assert(firstVisit.firstClean && firstVisit.secondClean && firstVisit.guaranteed && firstVisit.recorded);
    assert.strictEqual(firstVisit.discovered, 0);
    assert(firstVisit.restartPreserved && firstVisit.laterUsesNormalDraw);
    assert.deepStrictEqual(errors, []);assert.deepStrictEqual(missing, []);assert.deepStrictEqual(shaderErrors, []);
    fs.writeFileSync(path.join(out, 'runtime-checks.json'), JSON.stringify({build: expectedBuild, checks, detailReturn, picked, restarts, firstVisit, formattedShaderStages, shaderErrors, errors, missing}, null, 2));
    console.log('Real Cocos runtime: 8 theme/viewport combinations, 50/10 ingredient tabs, independent scrolling, detail return, first-third-level guarantee, one-time checkpoint, manual restarts and normal later draws: OK');
  } finally {await browser.close();server.close();}
})().catch(error => {console.error(error);server.close();process.exitCode = 1;});
