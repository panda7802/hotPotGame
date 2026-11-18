const {chromium}=require('playwright'),path=require('path');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const p=await browser.newPage({viewport:{width:754,height:878},deviceScaleFactor:1});
    await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8910/')?r.continue():r.abort());
    await p.goto('http://127.0.0.1:8910/');await p.waitForFunction(()=>typeof System!=='undefined');
    await p.evaluate(async()=>{window.cc=await System.import('cc')});
    await p.waitForFunction(()=>{const find=n=>{const c=n?.getComponent('HotPotGame');if(c)return c;for(const child of n?.children||[]){const result=find(child);if(result)return result}return null};window.g=find(cc.director.getScene());return g?.levelData&&g.playerService&&g.ingredientFrames.size===50});
    await p.evaluate(()=>{g.previewPageStyle(8);g.loadLevel(0)});await p.waitForTimeout(1300);
    await p.screenshot({path:path.resolve(__dirname,'../../../design/implemented-720-20261030/runtime-polish/fix-review.png')});
  }finally{await browser.close()}
})();
