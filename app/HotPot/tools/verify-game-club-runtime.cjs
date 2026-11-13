'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const assert = require('assert');
const {chromium, launchOptions} = require('./browser-runtime.cjs');
const repo = path.resolve(__dirname, '../../..');
const web = path.join(repo,
  'tmp/game-club-page-manager-build-20261103/app/HotPot/build/web-game-club');
const out = path.join(repo, 'tmp/game-club-page-manager-verification-20261103');
const build = '20261103-game-club-page-manager';
assert(fs.readFileSync(path.join(web, 'assets/main/index.js'), 'utf8')
  .includes(build), 'Stale web build');
fs.mkdirSync(out, {recursive: true});
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(web, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file)
    || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.js': 'application/javascript',
    '.json': 'application/json', '.html': 'text/html', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
    '.wasm': 'application/wasm'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function click(page, name) {
  const point = await page.evaluate(name => {
    const n = findNode(g.node, name);
    if (!n) throw Error('Missing ' + name);
    const b = n.getComponent(cc.UITransform).getBoundingBoxToWorld();
    const v = cc.view.getVisibleSize(), o = cc.view.getVisibleOrigin();
    const r = document.querySelector('canvas').getBoundingClientRect();
    return {x: r.x + (b.x + b.width / 2 - o.x) / v.width * r.width,
      y: r.y + (1 - (b.y + b.height / 2 - o.y) / v.height) * r.height};
  }, name);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({...launchOptions,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const errors = [], missing = [], checks = [];
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844},
      deviceScaleFactor: 3});
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      if (r.url().startsWith(origin) && r.status() >= 400) missing.push(r.url());
    });
    await page.route('**/*', route => route.request().url().startsWith(origin)
      ? route.continue() : route.abort());
    await page.goto(origin);
    await page.waitForFunction(() => typeof System !== 'undefined');
    await page.evaluate(async () => {window.cc = await System.import('cc');});
    await page.waitForFunction(() => {
      const find = n => {
        const c = n?.getComponent('HotPotGame'); if (c) return c;
        for (const child of n?.children || []) {const f = find(child); if (f) return f;}
      };
      window.g = find(cc.director.getScene());
      return g?.playerService && g?.levelData && g?.ingredientFrames.size === 50;
    }, null, {timeout: 90000});
    await page.evaluate(() => {
      window.findNode = (n, name) => {
        if (n?.name === name) return n;
        for (const child of n?.children || []) {const f = findNode(child, name); if (f) return f;}
        return null;
      };
      window.boardSnapshot = () => JSON.stringify({tiles: g.levelData.tiles,
        tray: g.tray, reserve: g.reserve, tools: g.toolUses, run: g.runId});
      g.checkpointGame = () => {}; g.loadLevel(1, false);
      window.configuredOpenlink = g.gameClubOpenlink;
    });
    assert(await page.evaluate(() => configuredOpenlink.startsWith('-SSEykJv')),
      'Actual supplied home openlink must be in the build');
    await click(page, 'Button_设置'); await click(page, 'Button_游戏圈');
    assert(await page.evaluate(() => findNode(g.node, 'DesignToast')
      .getComponentsInChildren(cc.Label).some(l => l.string.includes('新版微信'))));
    await click(page, 'Button_继续游戏');
    await page.evaluate(async () => {
      const {WechatGameClubService} = await System.import(
        'chunks:///_virtual/WechatGameClubService.ts');
      window.clubLog = {created: 0, loads: 0, shows: 0, destroyed: 0};
      window.clubMode = 'success';
      // Local API fixture only; no network call to a real community is made.
      g.wechatGameClub = new WechatGameClubService({createPageManager() {
        clubLog.created++;
        return {load(options) {
          if (options.openlink !== configuredOpenlink) throw Error('Wrong openlink');
          clubLog.loads++;
          if (clubMode === 'network') return Promise.reject({errCode: -6, errInfo: 'fixture'});
          if (clubMode === 'deferred') return new Promise(resolve => {window.finishLoad = resolve;});
          return Promise.resolve({});
        }, async show() {clubLog.shows++;},
        destroy() {clubLog.destroyed++;}};
      }});
    });
    // An unconfigured entry must never call the platform with a blank openlink.
    await click(page, 'Button_设置');
    await page.evaluate(() => {g.gameClubOpenlink = '';});
    await click(page, 'Button_游戏圈');
    assert.equal(await page.evaluate(() => clubLog.created), 0);
    assert(await page.evaluate(() => findNode(g.node, 'DesignToast')
      .getComponentsInChildren(cc.Label).some(l => l.string.includes('尚未配置'))));
    await page.evaluate(() => {g.gameClubOpenlink = configuredOpenlink;});
    await click(page, 'Button_继续游戏');
    for (const size of [{width: 390, height: 844}, {width: 360, height: 640}]) {
      await page.setViewportSize(size); await page.waitForTimeout(350);
      for (const style of [1, 4, 8, 9]) {
        await page.evaluate(style => g.selectPageStyle(style), style);
        await click(page, 'Button_设置');
        const before = await page.evaluate(() => boardSnapshot());
        const shown = await page.evaluate(() => clubLog.shows);
        const visible = await page.evaluate(() => {
          const b = findNode(g.node, 'Button_游戏圈')
            .getComponent(cc.UITransform).getBoundingBoxToWorld();
          const v = cc.view.getVisibleSize(), o = cc.view.getVisibleOrigin();
          return b.x >= o.x && b.y >= o.y && b.x + b.width <= o.x + v.width
            && b.y + b.height <= o.y + v.height;
        });
        assert(visible);
        await click(page, 'Button_游戏圈');
        assert.equal(await page.evaluate(() => clubLog.shows), shown + 1);
        await page.evaluate(() => {cc.game.emit(cc.Game.EVENT_HIDE); cc.game.emit(cc.Game.EVENT_SHOW);});
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => boardSnapshot()), before);
        assert.equal(await page.evaluate(() => clubLog.shows), shown + 1,
          'Returning from background must not reopen the community');
        if (size.width === 390) await page.screenshot({path: path.join(out, 'profile-' + style + '.png')});
        const destroyed = await page.evaluate(() => clubLog.destroyed);
        await click(page, 'Button_我的成就');
        assert.equal(await page.evaluate(() => clubLog.destroyed), destroyed + 1);
        await click(page, 'Button_返回'); await click(page, 'Button_继续游戏');
        checks.push({style, ...size, entryVisible: true, loadShow: true,
          boardPreserved: true, menuCleanup: true});
      }
    }
    await click(page, 'Button_设置');
    await page.setViewportSize({width: 430, height: 932}); await page.waitForTimeout(400);
    await page.evaluate(() => {window.clubMode = 'network';});
    await click(page, 'Button_游戏圈');
    assert.equal(await page.evaluate(() => g.wechatGameClub.lastError.code), -6);
    assert(await page.evaluate(() => findNode(g.node, 'DesignToast')
      .getComponentsInChildren(cc.Label).some(l => l.string.includes('网络异常'))));
    await page.evaluate(() => {window.clubMode = 'deferred';});
    const beforeLoad = await page.evaluate(() => clubLog.loads);
    const beforeShow = await page.evaluate(() => clubLog.shows);
    await click(page, 'Button_游戏圈'); await click(page, 'Button_游戏圈');
    assert.equal(await page.evaluate(() => clubLog.loads), beforeLoad + 1);
    await click(page, 'Button_继续游戏');
    await page.evaluate(() => finishLoad({})); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => clubLog.shows), beforeShow);
    await click(page, 'Button_设置'); await click(page, 'Button_游戏圈');
    await page.evaluate(() => {g.onDestroy(); finishLoad({});});
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => clubLog.shows), beforeShow);
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(missing, []);
    const report = {build, checks, browserFallback: true, missingConfig: true,
      suppliedOpenlinkConfigured: true, deviceScaleFactor: 3,
      resizeOpenPage: true, networkError: true, duplicateTaps: true,
      latePageCancelled: true, sceneCleanup: true,
      nativeNavigation: 'Requires real WeChat verification', errors, missing};
    fs.writeFileSync(path.join(out, 'runtime.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({cases: checks.length, ...report, checks: undefined}, null, 2));
  } finally {await browser.close(); server.close();}
})().catch(error => {console.error(error); process.exitCode = 1; server.close();});