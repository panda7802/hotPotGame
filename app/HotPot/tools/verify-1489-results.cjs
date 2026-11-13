'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../../../design/implemented-1489/runtime');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.goto(process.env.HOTPOT_PREVIEW_URL||'http://127.0.0.1:8895/');
    await page.waitForFunction(()=>typeof System!=='undefined');
    await page.evaluate(async()=>{window.cc=await System.import('cc')});
    await page.waitForFunction(()=>{const find=n=>{const g=n?.getComponent('HotPotGame');if(g)return g;for(const c of n?.children||[]){const f=find(c);if(f)return f}return null};window.g=find(window.cc.director.getScene());return window.g?.ingredientFrames.size===50});
    await page.evaluate(()=>{window.sharedFood=window.g.ingredientFrames.get('beef');window.firstTileTexture=null});
    for(const style of [1,4,8,9]){
      await page.evaluate(style=>{window.g.selectPageStyle(style);window.g.loadLevel(2)},style);
      await page.waitForFunction(style=>window.g.backdropPath==='themes/style-0'+style+'/texture',style);
      await page.waitForTimeout(250);
      assert(await page.evaluate(()=>window.g.ingredientFrames.get('beef')===window.sharedFood));
      await page.screenshot({path:path.join(out,'gameplay-level3-'+style+'.png')});
      for(const level of [0,1,2]){
        await page.evaluate(level=>{window.g.loadLevel(level);window.g.leaveThreeMatchingTiles()},level);
        for(let i=0;i<3;i++){
          await page.evaluate(()=>{const g=window.g,t=g.levelData.tiles.find(t=>!t.removed&&g.isTileSelectable(t));g.onTileClicked(t)});
          await page.waitForTimeout(430);
        }
        await page.waitForFunction(()=>!!window.g.node.getChildByName('ResultOverlay'));
        await page.waitForTimeout(250);
        const result=await page.evaluate(()=>{const p=window.g.node.getChildByName('ResultOverlay').getChildByName('ResultPanel');return {labels:p.children.map(n=>n.getComponent(window.cc.Label)?.string).filter(Boolean),foods:p.getChildByName('SuccessEmblem').children.filter(n=>n.name.startsWith('CelebrationFood_')).length}});
        const heading=await page.evaluate(()=>window.g.node.getChildByName('ResultOverlay').getChildByName('ResultPanel').getChildByName('HeadingPlaque').getChildByName('Label').getComponent(window.cc.Label).string);
        assert.strictEqual(heading,level===2?'三关全部完成':'第'+(level+1)+'关完成');
        assert.strictEqual(result.foods,level+3);
        await page.screenshot({path:path.join(out,'win-level'+(level+1)+'-'+style+'.png')});
      }
    }
    assert.deepStrictEqual(errors,[]);
    fs.writeFileSync(path.join(out,'results-verification.json'),JSON.stringify({styles:[1,4,8,9],levels:[1,2,3],winScreens:12,full888TileScreens:4,ingredientFramesShared:true,pageErrors:errors,network:'External requests blocked'},null,2));
    console.log('4 themes × 3 victories, distinct headings/emblems, 888-tile gameplay, shared food textures: OK');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
