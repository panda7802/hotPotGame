'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),web=path.join(root,'build/web-resolution');
const out=path.resolve(root,'../../design/screenfit-20261030');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(web,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
async function clear(page){await page.evaluate(()=>{for(const n of g.node.children.slice())if(n.name.endsWith('Overlay')){n.removeFromParent();n.destroy()}g.locked=false;g.gameEnded=false})}
async function press(page,names){
  const point=await page.evaluate(names=>{
    const n=names.reduce((n,name)=>n?.getChildByName(name),g.node);if(!n)throw Error(names.join('/'));
    const p=n.getWorldPosition(),size=cc.view.getVisibleSize(),origin=cc.view.getVisibleOrigin(),r=document.querySelector('canvas').getBoundingClientRect();
    return {x:r.left+(p.x-origin.x)/size.width*r.width,y:r.top+(1-(p.y-origin.y)/size.height)*r.height};
  },names);await page.mouse.click(point.x,point.y);await page.waitForTimeout(150);
}
async function measure(page,name,safeTop=0,safeBottom=0){
  return page.evaluate(({name,safeTop,safeBottom})=>{
    const overlay=g.node.getChildByName(name);
    const panel=name==='ReferenceShell'?overlay:overlay?.getChildByName('PlayerPanel')||overlay?.getChildByName('ResultPanel');
    if(!panel)throw Error('Missing panel '+name);
    const ui=panel.getComponent(cc.UITransform),b=ui.getBoundingBoxToWorld(),size=cc.view.getVisibleSize(),origin=cc.view.getVisibleOrigin();
    const ratio=size.height/size.width;
    if(Math.abs(panel.scale.x-panel.scale.y)>1e-6)throw Error('Non-uniform scale '+name);
    if(b.x<origin.x-.1||b.x+b.width>origin.x+size.width+.1||b.y<origin.y+safeBottom*size.width/innerWidth-.1||b.y+b.height>origin.y+size.height-safeTop*size.width/innerWidth+.1)throw Error('Outside safe area '+JSON.stringify({name,b,size,safeTop,safeBottom}));
    return {name,contentWidth:ui.width,contentHeight:ui.height,scale:panel.scale.x,viewportRatio:ratio};
  },{name,safeTop,safeBottom});
}
(async()=>{
  await new Promise(resolve=>server.listen(8899,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[],checks=[],missingLocalAssets=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',response=>{if(new URL(response.url()).hostname==='127.0.0.1'&&response.status()>=400)missingLocalAssets.push(response.url())});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:8899/');
    await page.waitForFunction(()=>typeof System!=='undefined');
    await page.evaluate(async()=>{window.cc=await System.import('cc')});
    await page.waitForFunction(()=>{const find=n=>{const g=n?.getComponent('HotPotGame');if(g)return g;for(const c of n?.children||[]){const result=find(c);if(result)return result}return null};window.g=find(cc.director.getScene());return g?.ingredientFrames.size===50&&g.playerService&&g.levelData},null,{timeout:60000});
    await page.waitForFunction(()=>g.audioClips.size===4);
    for(const [width,height] of [[390,844],[320,568],[430,932],[768,1024],[844,390]]){
      await clear(page);await page.setViewportSize({width,height});await page.waitForTimeout(450);
      for(const style of [1,4,8,9]){
        await clear(page);await page.evaluate(style=>g.selectPageStyle(style),style);await page.waitForTimeout(150);
        checks.push({width,height,style,...await measure(page,'ReferenceShell')});
        await page.evaluate(()=>g.showPlayerProfile());await page.waitForTimeout(200);
        checks.push({width,height,style,...await measure(page,'PlayerOverlay')});
        if(width===390&&(style===1||style===8)){await page.waitForTimeout(350);await page.screenshot({path:path.join(out,`web-profile-${style}.png`)})}
        // Actual touch coordinates must still open the intended card after fitting.
        await press(page,['PlayerOverlay','PlayerPanel','Button_食材图鉴']);
        checks.push({width,height,style,...await measure(page,'CollectionOverlay')});
        await press(page,['CollectionOverlay','PlayerPanel','Button_返回我的']);
        assert(await page.evaluate(()=>!!g.node.getChildByName('PlayerOverlay')));
        await press(page,['PlayerOverlay','PlayerPanel','Button_页面风格']);
        checks.push({width,height,style,...await measure(page,'StyleOverlay')});
        await press(page,['StyleOverlay','PlayerPanel','MenuClose']);
        assert(await page.evaluate(()=>!!g.node.getChildByName('PlayerOverlay')));
        await clear(page);await page.evaluate(()=>g.showRegionPicker([]));checks.push({width,height,style,...await measure(page,'RegionOverlay')});
        await clear(page);await page.evaluate(()=>g.showRestartConfirmation());checks.push({width,height,style,...await measure(page,'RestartConfirmOverlay')});
      }
      console.log(`Screen fit and real clicks OK: ${width}x${height}, 4 styles`);
    }
    // Resizing an already open menu must keep its data and hit regions together.
    await clear(page);await page.evaluate(()=>g.showPlayerProfile());
    const panelId=await page.evaluate(()=>g.node.getChildByName('PlayerOverlay').getChildByName('PlayerPanel').uuid);
    await page.setViewportSize({width:320,height:568});await page.waitForTimeout(400);
    checks.push({host:'open-menu-resize',...await measure(page,'PlayerOverlay')});
    assert.strictEqual(await page.evaluate(()=>g.node.getChildByName('PlayerOverlay').getChildByName('PlayerPanel').uuid),panelId);
    await press(page,['PlayerOverlay','PlayerPanel','Button_食材图鉴']);
    assert(await page.evaluate(()=>!!g.node.getChildByName('CollectionOverlay')));
    await clear(page);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(450);
    // Inject only the WeChat layout APIs; cloud/network requests remain blocked.
    await page.evaluate(()=>{window.wx={getWindowInfo:()=>({windowWidth:390,windowHeight:844,safeArea:{left:0,right:390,top:47,bottom:810}}),getMenuButtonBoundingClientRect:()=>({top:51,bottom:83,height:32})}});
    await page.setViewportSize({width:391,height:844});await page.waitForTimeout(150);
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
    for(const style of [1,4,8,9]){
      await clear(page);await page.evaluate(style=>g.selectPageStyle(style),style);await page.waitForTimeout(200);
      checks.push({host:'wechat-layout',style,...await measure(page,'ReferenceShell',91,34)});
      await page.evaluate(()=>g.showPlayerProfile());await page.waitForTimeout(300);
      checks.push({host:'wechat-layout',style,...await measure(page,'PlayerOverlay',91,34)});
      if(style===1||style===8)await page.screenshot({path:path.join(out,`wechat-layout-profile-${style}.png`)});
      await press(page,['PlayerOverlay','PlayerPanel','Button_页面风格']);
      checks.push({host:'wechat-layout',style,...await measure(page,'StyleOverlay',91,34)});
      for(const won of [true,false]){
        await clear(page);await page.evaluate(won=>{g.loadLevel(2,false);g.endGame(won)},won);await page.waitForTimeout(250);
        checks.push({host:'wechat-layout',style,result:won?'win':'revive',...await measure(page,'ResultOverlay',91,34)});
        if(!won){
          await press(page,['ResultOverlay','ResultPanel','Button_重新开始']);
          checks.push({host:'wechat-layout',style,...await measure(page,'RestartConfirmOverlay',91,34)});
          await press(page,['RestartConfirmOverlay','PlayerPanel','Button_继续当前游戏']);
          assert(await page.evaluate(()=>!!g.node.getChildByName('ResultOverlay')&&!g.node.getChildByName('RestartConfirmOverlay')));
        }
      }
    }
    assert.deepStrictEqual(errors,[]);
    assert.deepStrictEqual(missingLocalAssets,[],'All referenced local assets must still exist after cleanup');
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,pageErrors:errors,missingLocalAssets,loadedIngredients:50,loadedAudio:4,wechat:'Layout API simulation in the actual web engine; physical WeChat device still required',network:'External requests blocked'},null,2));
    console.log(`Screen-fit runtime OK: ${checks.length} checks; no page errors`);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
