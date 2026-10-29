'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'design/reference-replica-20261030/runtime');fs.mkdirSync(out,{recursive:true});
async function clean(page){await page.evaluate(()=>{for(const n of window.g.node.children.slice())if(n.name.endsWith('Overlay')){n.removeFromParent();n.destroy()}window.g.locked=false;window.g.gameEnded=false})}
async function shot(page,name){await page.waitForTimeout(500);await page.screenshot({path:path.join(out,name+'.png')})}
async function press(page,path){const point=await page.evaluate(names=>{const n=names.reduce((n,k)=>n.getChildByName(k),window.g.node);if(!n)throw Error(names.join('/'));const p=n.getWorldPosition(),r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+p.x/720*r.width,y:r.top+(1-p.y/window.g.viewportHeight)*r.height}},path);await page.mouse.click(point.x,point.y);await page.waitForTimeout(220)}
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR '+e.message)});
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await page.goto('http://127.0.0.1:8896/');
await page.waitForFunction(()=>typeof System!=='undefined');await page.evaluate(async()=>{window.cc=await System.import('cc')});
await page.waitForFunction(()=>{const find=n=>{const g=n?.getComponent('HotPotGame');if(g)return g;for(const c of n?.children||[]){const f=find(c);if(f)return f}return null};window.g=find(window.cc.director.getScene());return window.g?.ingredientFrames.size===50&&window.g.levelData&&window.g.playerService},null,{timeout:30000});
const completed=[];
for(const id of [1,4,8,9]){
await clean(page);await page.evaluate(id=>{window.g.selectPageStyle(id);window.g.loadLevel(2);window.g.playerService.local.state.progress.discovered=[...window.g.ingredientFrames.keys()]},id);await shot(page,'main-'+id);
await page.evaluate(()=>window.g.showPlayerProfile());await shot(page,'profile-'+id);
await press(page,['PlayerOverlay','PlayerPanel','Button_页面风格']);
assert(await page.evaluate(()=>!!window.g.node.getChildByName('StyleOverlay')));await shot(page,'picker-'+id);
await press(page,['StyleOverlay','PlayerPanel','PageStyle_'+(id===1?4:1)]);
await press(page,['StyleOverlay','PlayerPanel','MenuClose']);
assert(await page.evaluate(()=>!!window.g.node.getChildByName('PlayerOverlay')));
await clean(page);await page.evaluate(()=>window.g.showRegionPicker([],true));await shot(page,'rank-'+id);
await clean(page);await page.evaluate(()=>window.g.showCollection());await shot(page,'collection-'+id);
await clean(page);await page.evaluate(()=>window.g.showIngredientDetail('shrimp'));await shot(page,'detail-'+id);
await clean(page);await page.evaluate(()=>window.g.showCollection('achievements'));await shot(page,'achievements-'+id);
await clean(page);await page.evaluate(()=>window.g.showRegionPicker([]));await shot(page,'region-'+id);
await clean(page);await page.evaluate(()=>window.g.showRestartConfirmation());await shot(page,'restart-'+id);
await clean(page);await page.evaluate(()=>{const g=window.g;g.loadLevel(2);const types=new Set();g.tray=[];for(const tile of g.levelData.tiles){if(!types.has(tile.type)&&types.size<7){types.add(tile.type);tile.removed=true;g.tray.push(tile.type)}}g.reviveUsed=false;g.endGame(false)});await shot(page,'revive-'+id);
for(const level of [0,1,2]){await clean(page);await page.evaluate(level=>{const g=window.g;g.loadLevel(level);g.levelData.tiles.forEach(t=>t.removed=true);g.tray=[];g.reserve=[];g.endGame(true)},level);await shot(page,'win'+(level+1)+'-'+id)}
completed.push(id);console.log('Captured approved-art pages '+id);
}
await clean(page);await page.setViewportSize({width:320,height:568});await page.evaluate(()=>{window.g.loadLevel(0);window.g.showPlayerProfile()});await shot(page,'short-profile');
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({styles:completed,pageErrors:errors,referenceDirectory:'design/ui-expanded-1489-2026-10-29',network:'External requests blocked; local preview data only'},null,2));
assert.deepStrictEqual(errors,[]);console.log('Reference UI runtime: 4 themes, full pages, actual style clicks/cancel and no page errors: OK');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
