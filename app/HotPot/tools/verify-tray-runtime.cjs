'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const repo = path.resolve(__dirname, '../../..');
const {chromium, launchOptions} = require(path.join(repo,
  'design/all-pages-ninepatch-20261030/runtime.cjs'));
const web = path.join(repo, 'app/HotPot/build/web-tray-review');
const out = path.join(repo, 'tmp/tray-fix-20261102');
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(web, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404).end(); return;
  }
  res.setHeader('Content-Type', ({'.js':'application/javascript',
    '.json':'application/json','.html':'text/html','.css':'text/css',
    '.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg',
    '.mp3':'audio/mpeg'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({...launchOptions,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors = [], missing = [], checks = [];
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      if (r.url().startsWith(origin) && r.status() >= 400) missing.push(r.url());
    });
    await page.route('**/*', r => r.request().url().startsWith(origin)
      ? r.continue() : r.abort());
    await page.goto(origin);
    await page.waitForFunction(() => typeof System !== 'undefined');
    await page.evaluate(async () => window.cc = await System.import('cc'));
    await page.waitForFunction(() => {
      const find = n => {
        const g = n?.getComponent('HotPotGame'); if (g) return g;
        for (const child of n?.children || []) {
          const g = find(child); if (g) return g;
        }
      };
      window.g = find(cc.director.getScene());
      return g?.ingredientFrames.size === 50 && g.levelData && g.playerService;
    }, null, {timeout:90000});
    await page.evaluate(() => {
      // Isolated local fixtures: no save writes or network traffic.
      g.checkpointGame = () => {};
      g.setSoundEnabled?.(false);
      window.frames = async count => {
        for (let i = 0; i < count; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      };
      window.pick = type => {
        const tile = g.levelData.tiles.find(t => !t.removed
          && g.isTileSelectable(t) && g.tileNodes.has(t.id));
        tile.type = type;
        const node = g.tileNodes.get(tile.id);
        g.drawTile(node, type, false);
        g.onTileClicked(tile);
        return node;
      };
    });
    for (const size of [{width:390,height:844},{width:360,height:640}]) {
      await page.setViewportSize(size);
      for (const style of [1,4,8,9]) {
        const result = await page.evaluate(async style => {
          g.selectPageStyle(style); g.loadLevel(1);
          g.tray = ['beef','beef','shrimp']; g.renderTray();
          const original = g.trayItems().slice();
          const slots = g.trayNode.children.filter(n => n.name.startsWith('TraySlot_'));
          const incoming = pick('beef');
          const image = incoming.getChildByName('IngredientImage');
          const samples = [];
          let adopted = false, imagePreserved = false, matchPosition = null;
          for (let i = 0; i < 28; i++) {
            await frames(1);
            samples.push({x:original[2].position.x,
              flying:incoming.parent === g.foodTransitionLayer,
              matched:!!g.trayNode.getChildByName('MatchEffects')});
            if (incoming.parent?.name === 'TrayItem_2' && !adopted) {
              adopted = true;
              imagePreserved = incoming.getChildByName('IngredientImage') === image;
              matchPosition = original[2].position.x;
            }
          }
          const effects = g.trayNode.getChildByName('MatchEffects');
          const matchedOriginals = !!effects && original.slice(0,2)
            .every(n => n.parent === effects);
          const slotReuse = slots.every(n => n === g.trayNode.getChildByName(n.name));
          const bReuse = g.trayItems()[0] === original[2];
          // Next pick interrupts the previous left shift, retaining B's identity.
          const second = pick('corn');
          const secondImage = second.getChildByName('IngredientImage');
          await frames(25);
          const secondAdopted = second.parent === g.trayNode
            .getChildByName('TrayItem_1');
          const beforeRender = g.trayItems().slice();
          g.renderTray();
          const renderReuse = beforeRender.every((n,i) => n === g.trayItems()[i]);
          const secondImageReuse = second.getChildByName('IngredientImage') === secondImage;
          const settled = g.tray.slice();
          await frames(35);
          return {style, samples, adopted, imagePreserved, matchPosition,
            matchedOriginals, slotReuse, bReuse, secondAdopted, renderReuse,
            secondImageReuse, settled, final:g.tray.slice(),
            effectsGone:!g.trayNode.getChildByName('MatchEffects')};
        }, style);
        assert(result.samples.some(s => s.flying && !s.matched && Math.abs(s.x) < .01),
          'B must reach slot 4 before A lands');
        for (const key of ['adopted','imagePreserved','matchedOriginals','slotReuse',
          'bReuse','secondAdopted','renderReuse','secondImageReuse','effectsGone']) {
          assert(result[key], style + ': ' + key);
        }
        assert(Math.abs(result.matchPosition) < .01, 'B right-shift before match');
        assert.deepStrictEqual(result.settled, ['shrimp','corn']);
        assert.deepStrictEqual(result.final, result.settled, 'stale callback isolation');
        checks.push({...size,...result});
        await page.screenshot({path:path.join(out, `settled-${style}-${size.width}.png`)});
      }
    }
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(missing, []);
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({
      build:'20261102-tray-insertion-smooth',checks,errors,missing}, null, 2));
    console.log('Real Cocos: eight theme/viewport runs; insertion before landing, '
      + 'same food/image/slot nodes, rapid next pick and stale callbacks OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => {console.error(e);process.exitCode=1;server.close();});
