'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '../../..');
const {chromium, launchOptions} = require(path.join(repo,
  'design/all-pages-ninepatch-20261030/runtime.cjs'));
const out = path.join(repo, 'design/level3-varied-20261102');
fs.mkdirSync(out, {recursive: true});
(async () => {
  const browser = await chromium.launch({...launchOptions,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const errors = [], missing = [], checks = [];
  try {
    const page = await browser.newPage({viewport: {width: 407, height: 795}});
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith('http://127.0.0.1:8913')
        && response.status() >= 400) missing.push(response.url());
    });
    await page.goto('http://127.0.0.1:8913');
    await page.waitForFunction(() => window.__levelReview, {timeout: 60000});
    await page.evaluate(async () => {
      window.g = __levelReview.game;
      window.cc = __levelReview.cc;
      window.data = await System.import('chunks:///_virtual/GameData.ts');
      window.frames = async count => {
        for (let i = 0; i < count; i++)
          await new Promise(resolve => requestAnimationFrame(resolve));
      };
      window.fixture = async (index, seed, style = 1) => {
        g.selectPageStyle(style);
        g.loadLevel(index, false, data.createLevel(index, seed, undefined, 12345));
        g.positionReferenceShell();
        const toast = g.node.getChildByName('DesignToast');
        if (toast) toast.active = false;
        await frames(6);
      };
      window.metrics = () => {
        const bounds = n => n.getComponent(cc.UITransform).getBoundingBoxToWorld();
        const shell = g.node.getChildByName('ReferenceShell');
        const panel = bounds(shell.getChildByName('BoardArtwork'));
        const tiles = Array.from(g.tileNodes.values()).filter(n => n.active);
        const boxes = tiles.map(bounds);
        const factor = innerWidth / cc.view.getVisibleSize().width;
        return {nodes: tiles.length, tileWidth: boxes[0].width * factor,
          tileScale: g.levelData.config.tileScale || 1,
          total: g.levelData.total, layers: g.levelData.config.layers.length,
          contained: boxes.every(b => b.x >= panel.x && b.y >= panel.y
            && b.x + b.width <= panel.x + panel.width
            && b.y + b.height <= panel.y + panel.height),
          selectable: g.levelData.tiles.filter(t => g.isTileSelectable(t)).length};
      };
    });
    for (const size of [{width: 407, height: 795}, {width: 390, height: 844},
      {width: 360, height: 640}, {width: 320, height: 568}]) {
      await page.setViewportSize(size);
      await page.evaluate(() => fixture(1, 0));
      const second = await page.evaluate(() => metrics());
      if (size.width === 407) await page.screenshot({
        path: path.join(out, 'second-level.png')});
      for (let family = 0; family < 3; family++) {
        await page.evaluate(family => fixture(2,
          data.VARIED_LAYOUT_SEED_START + family), family);
        const third = await page.evaluate(() => metrics());
        assert(third.contained, 'tiles outside panel');
        assert.strictEqual(third.nodes, 36);
        assert.strictEqual(third.selectable, 18);
        assert.strictEqual(third.tileScale, 1);
        assert.strictEqual(third.total, 888);
        assert.strictEqual(third.layers, 50);
        // A short screen may need an overall fit; standard phones should
        // preserve at least the second level's apparent face size.
        if (size.height >= 795) assert(third.tileWidth >= second.tileWidth * .98);
        checks.push({...size, family, second, third});
        if (size.width === 407) {
          await page.screenshot({
            path: path.join(out, family === 0 ? 'third-level.png'
              : `third-level-family-${family}.png`)});
          const clip = await page.evaluate(() => {
            const panel = g.node.getChildByName('ReferenceShell')
              .getChildByName('BoardArtwork');
            const b = panel.getComponent(cc.UITransform).getBoundingBoxToWorld();
            const v = cc.view.getVisibleSize(), o = cc.view.getVisibleOrigin();
            return {x: (b.x - o.x) / v.width * innerWidth,
              y: (1 - (b.y + b.height - o.y) / v.height) * innerHeight,
              width: b.width / v.width * innerWidth,
              height: b.height / v.height * innerHeight};
          });
          await page.screenshot({path: path.join(out, `shape-${family}.png`), clip});
        }
      }
    }
    await page.setViewportSize({width: 407, height: 795});
    await page.evaluate(() => fixture(2, data.RANDOM_LAYOUT_SEED_START));
    await page.screenshot({path: path.join(out, 'third-level-before.png')});
    for (const style of [4, 8, 9]) {
      await page.evaluate(style => fixture(2,
        data.VARIED_LAYOUT_SEED_START, style), style);
      assert((await page.evaluate(() => metrics())).contained);
    }
    await page.evaluate(() => fixture(2, data.VARIED_LAYOUT_SEED_START));
    const first = await page.evaluate(() => {
      window.route = data.buildLevelThreeRoute(g.levelData.tiles,
        g.levelData.layoutSeed);
      const tile = g.levelData.tiles[route[0]];
      const n = g.tileNodes.get(tile.id);
      const b = n.getComponent(cc.UITransform).getBoundingBoxToWorld();
      const v = cc.view.getVisibleSize(), o = cc.view.getVisibleOrigin();
      return {id: tile.id, x: (b.x + b.width / 2 - o.x) / v.width * innerWidth,
        y: (1 - (b.y + b.height / 2 - o.y) / v.height) * innerHeight};
    });
    await page.mouse.click(first.x, first.y);
    await page.waitForFunction(id => g.findTile(id).removed && !g.locked,
      first.id);
    const gameplay = await page.evaluate(async () => {
      const layers = new Set();
      for (const index of route.slice(1, 45)) {
        const tile = g.levelData.tiles[index];
        if (!g.isTileSelectable(tile) || !g.tileNodes.get(tile.id)?.active)
          throw Error('Unexposed or blocked route tile: ' + tile.id);
        layers.add(tile.layer);
        g.onTileClicked(tile);
        while (g.locked) await frames(1);
        if (g.gameEnded) throw Error('Early defeat');
      }
      const domain = await System.import('chunks:///_virtual/PlayerData.ts');
      const save = {version: 1, boardVersion: domain.BOARD_VERSION,
        levelIndex: 2, layoutSeed: g.levelData.layoutSeed,
        ingredientSeed: g.levelData.ingredientSeed,
        ingredientPoolVersion: g.levelData.ingredientPoolVersion,
        types: g.levelData.tiles.map(t => t.type),
        removedIds: g.levelData.tiles.filter(t => t.removed).map(t => t.id),
        tray: g.tray.slice(), reserve: [], reviveUsed: false,
        rewardedMilestones: g.rewardedMilestones, toolUses: {...g.toolUses},
        lastMove: null, status: 'playing'};
      const restored = domain.restoreLevel(save);
      if (restored.config.layers.length !== 50
        || restored.tiles.filter(t => t.removed).length !== 45)
        throw Error('50-layer save restoration failed');
      return {removed: g.levelData.tiles.filter(t => t.removed).length,
        tray: g.tray.length, layers: Array.from(layers),
        restoredLayers: restored.config.layers.length};
    });
    assert.strictEqual(gameplay.removed, 45);
    assert.strictEqual(gameplay.tray, 0);
    assert(gameplay.layers.length > 1, 'must exercise lower-layer exposure');
    await page.evaluate(() => frames(60));
    await page.screenshot({path: path.join(out, 'third-level-after-45.png')});
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(missing, []);
    const gallery = await browser.newPage({viewport: {width: 960, height: 420}});
    const cards = ['菱形', '花形', '蝶形'].map((name, i) => {
      const png = fs.readFileSync(path.join(out, `shape-${i}.png`)).toString('base64');
      return `<article><h2>${name}</h2><img src="data:image/png;base64,${png}"></article>`;
    }).join('');
    await gallery.setContent(`<html lang="zh"><meta charset="utf-8"><style>
      body{margin:0;padding:18px;background:#202822;color:#fff3d0;
        font-family:Microsoft YaHei,sans-serif;box-sizing:border-box}
      main{display:flex;gap:18px}article{width:296px}h2{font-size:20px;
        margin:0 0 12px;text-align:center;font-weight:500}
      img{width:296px;display:block;border-radius:16px}
      </style><main>${cards}</main></html>`);
    await gallery.screenshot({path: path.join(out, 'three-shapes.png')});
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({
      build: '20261102-level3-varied', checks, gameplay, errors, missing,
    }, null, 2));
    console.log(JSON.stringify({checks: checks.length, gameplay, errors, missing}));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
