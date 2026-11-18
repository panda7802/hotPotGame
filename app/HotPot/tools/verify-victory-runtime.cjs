'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const assert = require('assert');
const {chromium, launchOptions} = require('./browser-runtime.cjs');
const root = path.resolve(__dirname, '..'), repo = path.resolve(root, '../..');
const web = path.join(repo, 'tmp/hidden-ingredients-build-20261103/app/HotPot/build/web-hidden-ingredients');
const out = path.resolve(process.env.HOTPOT_VICTORY_OUT || path.join(repo, 'tmp/victory-verification-20261104'));
const build = fs.readFileSync(path.join(root, 'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
assert(fs.readFileSync(path.join(web, 'assets/main/index.js'), 'utf8').includes(build), 'Stale web build');
fs.mkdirSync(out, {recursive: true});
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(web, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(web + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.js':'application/javascript','.json':'application/json',
    '.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function click(page, name) {
  const point = await page.evaluate(name => {
    const node = findNode(g.node, name);if (!node) throw Error('Missing button: ' + name);
    const bounds = node.getComponent(cc.UITransform).getBoundingBoxToWorld();
    const size = cc.view.getVisibleSize(), origin = cc.view.getVisibleOrigin();
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    return {x:canvas.x+(bounds.x+bounds.width/2-origin.x)/size.width*canvas.width,
      y:canvas.y+(1-(bounds.y+bounds.height/2-origin.y)/size.height)*canvas.height};
  }, name);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);
}
async function ready(page) {
  try {
    await page.waitForFunction(() => findNode(g.node, 'WinDialog')?.victoryArtworkReady === true,
      null, {timeout:20000});
  } catch(error) {
    await page.screenshot({path:path.join(out,'failure.png')});
    const state=await page.evaluate(()=>({labels:findNode(g.node,'WinDialog')?.getComponentsInChildren(cc.Label).map(label=>label.string),
      bundle:!!cc.assetManager.getBundle('victory-04')}));
    throw Error(error.message+' '+JSON.stringify(state));
  }
  await page.waitForTimeout(100);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({...launchOptions,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[], missing=[], requested=new Set(), checks=[];
  let failClay=false;
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message=>{if(message.type()==='error')console.log('[Browser]',message.text().slice(0,500));});
    page.on('request', request => {
      const bundle = request.url().match(/\/assets\/(victory-\d+)\//)?.[1];
      if (bundle) requested.add(bundle);
    });
    page.on('response', response => {
      if (response.url().startsWith(origin) && response.status()>=400
        && !(failClay && response.url().includes('/victory-04/'))) missing.push(response.url());
    });
    await page.route('**/*', route => {
      if (!route.request().url().startsWith(origin)) return route.abort();
      if (failClay && route.request().url().includes('/victory-04/')) return route.fulfill({status:503,body:'Retry test'});
      return route.continue();
    });
    await page.goto(origin);
    await page.waitForFunction(() => typeof System !== 'undefined');
    await page.evaluate(async () => {window.cc=await System.import('cc');});
    await page.waitForFunction(() => {
      window.findNode=(node,name)=>{
        if (node?.name===name) return node;
        for (const child of node?.children || []) {const result=findNode(child,name);if(result)return result;}
        return null;
      };
      const find=node=>{
        const game=node?.getComponent('HotPotGame');if(game)return game;
        for(const child of node?.children || []){const game=find(child);if(game)return game;}
      };
      window.g=find(cc.director.getScene());
      return g?.ingredientFrames.size===60 && g?.levelData && g?.playerService;
    },null,{timeout:90000});
    await page.evaluate(()=>{g.checkpointGame=()=>{};g.soundEnabled=false;});
    assert.strictEqual(requested.size,0,'Victory bundles must not download at startup');

    // Load failure keeps live buttons and offers a working retry.
    failClay=true;
    await page.evaluate(()=>{g.selectPageStyle(4);g.loadLevel(0,false);g.endGame(true);});
    await page.waitForFunction(()=>findNode(g.node,'WinDialog')?.getComponentsInChildren(cc.Label)
      .some(label=>label.string==='点击重试庆功盛宴'),null,{timeout:60000});
    assert(await page.evaluate(()=>!!findNode(g.node,'Button_下一关')));
    failClay=false;
    await page.evaluate(()=>{
      const label=findNode(g.node,'WinDialog').getComponentsInChildren(cc.Label)
        .find(label=>label.string==='点击重试庆功盛宴');label.node.emit(cc.Node.EventType.TOUCH_END);
    });
    await ready(page);
    assert.deepStrictEqual([...requested],['victory-04'],'Victory loads only the selected theme');
    const downloadFailureRetry=true;

    for(const size of [{width:390,height:844},{width:360,height:640}]) {
      await page.setViewportSize(size);
      for(const style of [1,4,8,9]) for(const index of [0,1,2]) {
        await page.evaluate(()=>g.dismissOverlay());
        await page.waitForTimeout(50); // Cocos removes destroyed nodes at frame end.
        await page.evaluate(({style,index})=>{
          g.selectPageStyle(style);g.loadLevel(index,false);g.endGame(true);
          g.endGame(true); // One modal and one active action per result.
        },{style,index});
        await ready(page);
        const state=await page.evaluate(()=>{
          const body=findNode(g.node,'WinDialog');
          const sprites=body.getComponentsInChildren(cc.Sprite).filter(sprite=>sprite.node.name.startsWith('VictoryArtwork_'));
          const primary=findNode(body,g.levelIndex===2?'Button_再来一轮':'Button_下一关');
          const secondary=findNode(body,'Button_返回游戏');
          const panel=findNode(g.node,'ResultPanel');
          const size=cc.view.getVisibleSize(),origin=cc.view.getVisibleOrigin();
          const inView=node=>{const rect=node.getComponent(cc.UITransform).getBoundingBoxToWorld();
            return rect.x>=origin.x && rect.y>=origin.y && rect.x+rect.width<=origin.x+size.width
              && rect.y+rect.height<=origin.y+size.height;};
          return {level:g.levelIndex,total:g.levelData.total,
            title:findNode(body,'VictoryTitle').getComponent(cc.Label).string,
            stats:findNode(body,'VictoryStats').getComponent(cc.Label).string,
            noClose:!findNode(panel,'MenuClose'),oneModal:g.node.children.filter(node=>node.name==='ResultOverlay').length===1,
            pixels:sprites.map(sprite=>[sprite.spriteFrame.texture.width,sprite.spriteFrame.texture.height]),
            controlsVisible:inView(primary)&&inView(secondary)&&inView(body),
            fallbackHidden:[primary,secondary,findNode(body,'DialogStats')].every(node=>!node.getComponent(cc.Graphics).enabled),
          };
        });
        assert.strictEqual(state.title,index===2?'全部通关！':`第 ${index+1} 关完成`);
        assert(state.stats.includes(state.total+' 块已清空'));
        assert(state.noClose && state.oneModal && state.controlsVisible && state.fallbackHidden);
        assert.deepStrictEqual(state.pixels,[[720,774]]);
        await page.screenshot({path:path.join(out,`${style}-${index+1}-${size.width}.png`)});
        await click(page,index===2?'Button_再来一轮':'Button_下一关');
        assert.strictEqual(await page.evaluate(()=>g.levelIndex),(index+1)%3);
        assert(await page.evaluate(()=>!findNode(g.node,'ResultOverlay')));
        await page.evaluate(index=>{g.loadLevel(index,false);g.endGame(true);},index);
        await ready(page);await click(page,'Button_返回游戏');
        assert.strictEqual(await page.evaluate(()=>g.levelIndex),(index+1)%3);
        assert(await page.evaluate(()=>!findNode(g.node,'ResultOverlay')));
        checks.push({style,index,size,...state,primaryWorks:true,secondaryWorks:true});
      }
    }
    assert.deepStrictEqual(errors,[]);assert.deepStrictEqual(missing,[]);
    fs.writeFileSync(path.join(out,'runtime-checks.json'),JSON.stringify({build,
      checks,downloadFailureRetry,startupLoadsNoVictoryArt:true,
      selectedThemeOnly:true,requested:[...requested],errors,missing},null,2));
    console.log('Real Cocos: 24 theme/level/viewport combinations, 48 button actions, no close, lazy bundles and failure retry: OK');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
