const fs=require('fs');const path=require('path');const assert=require('assert');
const {chromium}=require('C:/Users/13520/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp=require('C:/Users/13520/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=__dirname;
(async()=>{
 const game=fs.readFileSync(path.join(root,'../../app/HotPot/assets/scripts/core/HotPotGame.ts'),'utf8');
 const body=game.match(/protected nextLevel\(\): void \{([^}]+)\}/)[1];const next=new Function('LEVELS',body);const calls=[];
 for(let i=0;i<3;i++){const ctx={levelIndex:i,loadLevel:index=>calls.push(index)};next.call(ctx,[1,2,3]);}assert.deepStrictEqual(calls,[1,2,0]);
 const tools=fs.readFileSync(path.join(root,'../../app/HotPot/assets/scripts/core/HotPotTools.ts'),'utf8');assert(/'返回游戏',[\s\S]*?\(\) => this.nextLevel\(\)/.test(tools));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='file:///'+path.join(root,'index.html').replace(/\\/g,'/');await page.goto(url);await page.waitForTimeout(500);
 assert.equal(await page.locator('#foods .foodcard').count(),50);assert.equal(await page.locator('.phone').count(),11);
 for(let t=0;t<5;t++){await page.evaluate(t=>{setTheme(t);setView('all')},t);await page.waitForTimeout(100);await page.screenshot({path:path.join(root,`direction-0${t+1}.png`),fullPage:true});assert.equal(await page.locator('.overlay').count(),6);}
 await page.evaluate(()=>{setTheme(0);setView('compare')});await page.screenshot({path:path.join(root,'five-styles.png'),fullPage:true});
 const shots=[];for(let t=0;t<5;t++){await page.evaluate(t=>{setTheme(t);setView(0)},t);const f=path.join(root,`home-0${t+1}.png`);await page.locator('.phone').screenshot({path:f});shots.push(f)}
 await sharp({create:{width:1800,height:850,channels:3,background:'#f3f1eb'}}).composite(await Promise.all(shots.map(async(p,i)=>({input:await sharp(p).resize({width:340,height:760,fit:'contain',background:'#f3f1eb'}).toBuffer(),left:15+i*360,top:45})))).png().toFile(path.join(root,'five-homes.png'));
 await page.evaluate(()=>{setTheme(0);setView(5)});await page.getByRole('button',{name:'返回游戏',exact:true}).click();assert.equal(await page.evaluate(()=>level),1);
 await page.evaluate(()=>{setView(3);pendingTheme=1;render()});await page.getByRole('button',{name:'预览并应用此风格'}).click();assert.equal(await page.evaluate(()=>theme),1);
 await page.evaluate(()=>{pendingRegion='玄武区';setView(8)});await page.getByRole('button',{name:'确认保存'}).click();assert.equal(await page.evaluate(()=>region),'江苏省 / 南京市 / 玄武区');
 await page.evaluate(()=>{setTheme(0);setView('all')});await page.locator('#foods').screenshot({path:path.join(root,'50-ingredients.png')});
 const overflow=await page.locator('.phone').evaluateAll(nodes=>nodes.map((n,i)=>({i,over:n.scrollWidth>n.clientWidth+1})).filter(x=>x.over));assert.deepStrictEqual(overflow,[]);assert.deepStrictEqual(errors,[]);
 await page.goto('file:///'+path.join(root,'meat-comparison.html').replace(/\\/g,'/'));await page.setViewportSize({width:1100,height:800});await page.screenshot({path:path.join(root,'meat-comparison.png'),fullPage:true});
 await browser.close();fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify({levelTransitions:calls,styles:5,pagesPerStyle:11,ingredients:50,prototypeInteractions:'passed',runtimeEngineTest:false,consoleErrors:errors},null,2));console.log('PASS: transitions 1→2→3→1; 5 styles × 11 pages; 50 ingredients; prototype interactions and screenshots.');
})().catch(e=>{console.error(e);process.exit(1)});
