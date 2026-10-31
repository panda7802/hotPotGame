'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),os=require('os');
const repo=path.resolve(__dirname,'../../..'),design=path.join(repo,'design/all-pages-ninepatch-20261030');
const {chromium,launchOptions}=require(path.join(design,'runtime.cjs'));
const sharp=require(require.resolve('sharp',{paths:[path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),repo]}));
const dest=path.join(repo,'app/HotPot/assets/resources/reference'),ctx={};ctx.window=ctx;
vm.runInNewContext(fs.readFileSync(path.join(design,'themes.js'),'utf8'),ctx);
function meta(file){
  const target=file+'.meta';if(fs.existsSync(target))return;
  const sample=JSON.parse(fs.readFileSync(path.join(dest,'shell-01.jpg.meta'),'utf8'));
  const id=crypto.randomUUID(),m=JSON.parse(JSON.stringify(sample).replaceAll(sample.uuid,id));
  m.subMetas['6c48a'].displayName=path.basename(file,'.jpg');m.userData.width=720;m.userData.height=1280;
  fs.writeFileSync(target,JSON.stringify(m,null,2));
}
(async()=>{const browser=await chromium.launch(launchOptions);try{
  const page=await browser.newPage({viewport:{width:720,height:1280},deviceScaleFactor:1});
  const base='file:///'+design.replaceAll('\\','/')+'/screen.html';
  for(const id of [1,4,8,9]){
    const style=String(id).padStart(2,'0');
    for(const [state,prefix] of [['game2','shell'],['game1','first']]){
      await page.goto(base+`?theme=${id}&page=${state}&w=720&h=1280`);
      await page.evaluate(()=>document.fonts.ready);
      await page.addStyleTag({content:'.game-board,.game-level,.game-progress,.uses,.guide,.game-hit{visibility:hidden!important}.game-meter i{width:0!important}'});
      const file=path.join(dest,prefix+'-'+style+'.jpg');
      await sharp(await page.screenshot()).jpeg({quality:77,mozjpeg:true}).toFile(file);meta(file);
    }
    fs.copyFileSync(path.join(design,'assets/bg-'+style+'.jpg'),path.join(dest,'bg-'+style+'.jpg'));
  }
  // Rasterize the code-native tile faces once; 888 live tiles share four frames.
  const cells=[];
  for(const id of [1,4,8,9]){
    await page.goto(base+`?theme=${id}&page=game2&w=720&h=1280`);
    await page.evaluate(()=>{
      const root=document.querySelector('#screen');root.innerHTML='<div class="TileExport" style="position:absolute;width:112px;height:104px;left:0;top:0"><div class="tile" style="left:4px;top:0;width:104px;height:91px"></div></div>';
      root.style.background='transparent';document.body.style.background='transparent';
    });
    cells.push(await page.locator('.TileExport').screenshot({omitBackground:true}));
  }
  await sharp({create:{width:448,height:104,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(cells.map((input,i)=>({input,left:i*112,top:0}))).png().toFile(path.join(dest,'tiles.png'));
  const layouts=Object.values(ctx.THEMES).map(t=>[t.id,{top:t.top,start:t.start,
    firstStart:1280-((1280-t.footerSource)+(t.tray[1]-t.start)),
    level:t.level,progress:t.progress,meter:t.meter,tray:t.tray,badges:t.badges}]);
  const source='import {PageStyle} from "./PageTheme";\nexport interface ConfirmedShellLayout {top:number;start:number;firstStart:number;level:number[];progress:number[];meter:number[];tray:number[];badges:number[][]}\n'+
    'export const CONFIRMED_SHELLS:Record<PageStyle,ConfirmedShellLayout>='+JSON.stringify(Object.fromEntries(layouts))+';\n';
  const file=path.join(repo,'app/HotPot/assets/scripts/data/ConfirmedShells.ts');fs.writeFileSync(file,source);
  if(!fs.existsSync(file+'.meta'))fs.writeFileSync(file+'.meta',JSON.stringify({ver:'4.0.24',importer:'typescript',imported:true,uuid:crypto.randomUUID(),files:[],subMetas:{},userData:{}},null,2));
  const inventory=fs.readdirSync(dest).filter(f=>/\.(png|jpg)$/.test(f)).map(file=>({file,bytes:fs.statSync(path.join(dest,file)).size}));
  console.log(JSON.stringify({images:inventory,totalBytes:inventory.reduce((s,f)=>s+f.bytes,0)},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
