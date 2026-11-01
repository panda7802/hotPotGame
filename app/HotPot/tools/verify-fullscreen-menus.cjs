'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const repo=path.resolve(__dirname,'../../..');
const {chromium,launchOptions}=require(path.join(repo,'design/all-pages-ninepatch-20261030/runtime.cjs'));
const web=path.join(repo,'app/HotPot/build/web-menu-review');
const out=path.join(repo,'design/implemented-fullscreen-20261101');
const build=fs.readFileSync(path.join(repo,'app/HotPot/assets/scripts/core/HotPotTileSkin.ts'),'utf8').match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
assert(fs.readFileSync(path.join(web,'assets/main/index.js'),'utf8').includes(build),'Stale web build');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(web,'.'+(p==='/'?'/index.html':p));
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',({'.js':'application/javascript','.json':'application/json','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function click(page,overlay,name){
  const point=await page.evaluate(({overlay,name})=>{
    const n=findNode(overlay?g.node.getChildByName(overlay):g.node.getChildByName('ReferenceShell'),name);
    if(!n)throw Error('Missing '+overlay+'/'+name);
    const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld(),v=cc.view.getVisibleSize(),o=cc.view.getVisibleOrigin(),r=document.querySelector('canvas').getBoundingClientRect();
    return {x:r.x+(b.x+b.width/2-o.x)/v.width*r.width,y:r.y+(1-(b.y+b.height/2-o.y)/v.height)*r.height};
  },{overlay,name});
  await page.mouse.click(point.x,point.y);await page.waitForTimeout(130);
}
async function active(page,name){
  assert.strictEqual(await page.evaluate(name=>g.node.children.find(n=>n.name.endsWith('Overlay'))?.name||null,name),name);
}
async function layout(page,overlay){
  const result=await page.evaluate(overlay=>{
    const root=g.node.getChildByName(overlay),p=root.getChildByName('PlayerPanel');
    const box=n=>{const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld();return{x:b.x,y:b.y,w:b.width,h:b.height}};
    const v=cc.view.getVisibleSize(),o=cc.view.getVisibleOrigin(),bg=box(root.getChildByName('FullBleedBackground'));
    const header=p.getChildByName('DesignHeader'),footer=p.getChildByName('DesignFooter'),body=p.getChildByName('DesignBody');
    const brand=box(findNode(header,'MenuBrand')),button=box(footer.children.find(n=>n.name.startsWith('Button_'))),middle=box(body);
    return {backgroundCovers:bg.x<=o.x+.1&&bg.y<=o.y+.1&&bg.x+bg.w>=o.x+v.width-.1&&bg.y+bg.h>=o.y+v.height-.1,
      singleBackground:!findNode(p,'PageBackground'),noTopButtons:!findNode(header,'MenuBack')&&!findNode(header,'MenuClose'),
      widthRatio:brand.w/v.width,headerScale:header.scale.x,footerScale:footer.scale.x,
      bodyScale:body.scale.x,footerVisible:button.y>=o.y-.1&&button.y+button.h<=o.y+v.height+.1,
      contentAboveFooter:middle.y>=button.y+button.h-1,contentBelowHeader:middle.y+middle.h<=brand.y+1};
  },overlay);
  assert(result.backgroundCovers&&result.singleBackground,'Single full-bleed background required');
  assert(result.noTopButtons,'Submenus must not have top back/close buttons');
  assert(Math.abs(result.widthRatio-516/720)<.001,'Header must scale with width, not screen height');
  assert(result.headerScale===1&&result.footerScale===1);
  assert(result.footerVisible&&result.contentAboveFooter&&result.contentBelowHeader,'Layout overlaps or clips');
  return result;
}
async function shot(page,name){await page.waitForTimeout(220);await page.screenshot({path:path.join(out,name+'.png')})}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({...launchOptions,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[],missing=[],checks=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)missing.push(response.url())});
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin);await page.waitForFunction(()=>typeof System!=='undefined');
    await page.evaluate(async()=>{window.cc=await System.import('cc')});
    await page.waitForFunction(()=>{
      const visit=n=>{const c=n?.getComponent('HotPotGame');if(c)return c;for(const child of n?.children||[]){const result=visit(child);if(result)return result}};
      window.g=visit(cc.director.getScene());return g?.ingredientFrames.size===50&&g.playerService&&g.levelData&&g.audioClips.size===5;
    },null,{timeout:90000});
    await page.evaluate(async()=>{window.theme=await System.import('chunks:///_virtual/PageTheme.ts')});
    await page.evaluate(()=>{
      window.findNode=(root,name)=>{if(root?.name===name)return root;for(const child of root?.children||[]){const found=findNode(child,name);if(found)return found}return null};
      // Local rendering fixture only; no cloud request or source data is changed.
      g.playerService.local.state.profile.regionCodes=['320000','320100','320104'];
      g.playerService.regionWins={'320000':1288,'330000':1066,'440000':988,'510000':876,'370000':765,'410000':654,'320100':421,'320104':123};
      g.playerService.local.state.progress.discovered=[...g.ingredientFrames.keys()];
    });
    for(const size of [{width:390,height:844},{width:360,height:640}]){
      await page.setViewportSize(size);await page.waitForTimeout(350);
      for(const style of [1,4,8,9]){
        await page.evaluate(style=>{g.selectPageStyle(style);g.loadLevel(1)},style);await page.waitForTimeout(200);
        assert(await page.evaluate(()=>!!findNode(g.node,'BookShrimp')&&!!findNode(g.node,'BookCarrot')),'Illustrated book must show both foods');
        await click(page,null,'Button_食材图鉴');await active(page,'CollectionOverlay');
        const collection=await layout(page,'CollectionOverlay');
        if(size.width===390)await shot(page,'collection-'+style);
        const firstCard=await page.evaluate(()=>findNode(g.node,'CollectionContent').children[0].name);
        await click(page,'CollectionOverlay',firstCard);await active(page,'CollectionDetailOverlay');
        await layout(page,'CollectionDetailOverlay');await click(page,'CollectionDetailOverlay','Button_返回');await active(page,'CollectionOverlay');
        await click(page,'CollectionOverlay','Button_返回');await active(page,null);
        await click(page,null,'Button_设置');await active(page,'PlayerOverlay');await layout(page,'PlayerOverlay');
        assert(!await page.evaluate(()=>!!findNode(g.node.getChildByName('PlayerOverlay'),'Button_食材图鉴')));
        if(size.width===390)await shot(page,'profile-'+style);
        await click(page,'PlayerOverlay','Button_我的成就');await layout(page,'CollectionOverlay');
        await click(page,'CollectionOverlay','Button_返回');await active(page,'PlayerOverlay');
        await click(page,'PlayerOverlay','Button_地域排行榜');await layout(page,'RegionOverlay');
        assert.strictEqual(await page.evaluate(()=>findNode(g.node,'RegionContent').children.filter(n=>n.name.startsWith('RankRow_')).length),6);
        if(size.width===390)await shot(page,'ranking-'+style);
        await click(page,'RegionOverlay','RankScope_1');await layout(page,'RegionOverlay');
        await click(page,'RegionOverlay','RankScope_2');await layout(page,'RegionOverlay');
        await click(page,'RegionOverlay','Button_返回');await active(page,'PlayerOverlay');
        await click(page,'PlayerOverlay','Button_选择地区');await layout(page,'RegionOverlay');
        await click(page,'RegionOverlay','Region_330000');
        assert(!await page.evaluate(()=>findNode(g.node,'Button_保存地区').referenceDisabled));
        await click(page,'RegionOverlay','Button_返回');await active(page,'PlayerOverlay');
        assert.deepStrictEqual(await page.evaluate(()=>g.playerService.state.profile.regionCodes),['320000','320100','320104'],'Return must not save unconfirmed region');
        await click(page,'PlayerOverlay','Button_页面风格');await layout(page,'StyleOverlay');
        const preview=style===8?4:8;await click(page,'StyleOverlay','PageStyle_'+preview);
        await click(page,'StyleOverlay','Button_返回');await active(page,'PlayerOverlay');
        assert.strictEqual(await page.evaluate(()=>theme.getPageTheme().id),style,'Return must discard style preview');
        await click(page,'PlayerOverlay','Button_继续游戏');await active(page,null);
        checks.push({style,width:size.width,height:size.height,illustratedBook:true,singleBackground:true,fixedHeaderFooter:true,returnToParent:true,noCloseButtons:true,rankingSixRows:true,previewRollback:true,collection});
      }
    }
    // Resize an open submenu without rebuilding it or losing its data/return path.
    await click(page,null,'Button_设置');await click(page,'PlayerOverlay','Button_地域排行榜');
    await page.setViewportSize({width:430,height:932});await page.waitForTimeout(400);await layout(page,'RegionOverlay');
    await click(page,'RegionOverlay','Button_返回');await active(page,'PlayerOverlay');
    await click(page,'PlayerOverlay','Button_继续游戏');
    // Native WeChat metrics: preserve the notch, capsule and home indicator.
    await page.evaluate(()=>{window.wx={getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight,safeArea:{left:0,right:innerWidth,top:44,bottom:innerHeight-24}}),getMenuButtonBoundingClientRect:()=>({bottom:80,height:32})}});
    await click(page,null,'Button_设置');await layout(page,'PlayerOverlay');
    await click(page,'PlayerOverlay','Button_继续游戏');
    assert.deepStrictEqual(errors,[]);assert.deepStrictEqual(missing,[]);
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({build,checks,resizeOpenPage:true,wechatSafeArea:true,errors,missing},null,2));
    console.log(JSON.stringify({build,cases:checks.length,resizeOpenPage:true,wechatSafeArea:true,errors,missing,out},null,2));
  }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
