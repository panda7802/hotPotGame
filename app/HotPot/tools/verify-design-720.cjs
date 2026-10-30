'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..'),buildMarker=fs.readFileSync(path.join(root,'app/HotPot/assets/scripts/core/HotPotTileSkin.ts'),'utf8').match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1],revision=buildMarker.endsWith('-ranking')?'-ranking':buildMarker.endsWith('-polish')?'-polish':'',web=path.join(root,'tmp/build-ui720-20261030/app/HotPot/build/web-ui720'),out=path.join(root,'design/implemented-720-20261030/runtime'+revision);fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(web,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.js':'application/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)});
async function clear(page){await page.evaluate(()=>{for(const n of g.node.children.slice())if(n.name.endsWith('Overlay')){n.removeFromParent();n.destroy()}g.locked=false;g.gameEnded=false})}
async function click(page,names){const p=await page.evaluate(names=>{const n=names.reduce((n,k)=>n?.getChildByName(k),g.node);if(!n)throw Error('Missing '+names.join('/'));const b=n.getComponent(cc.UITransform).getBoundingBoxToWorld(),v=cc.view.getVisibleSize(),o=cc.view.getVisibleOrigin(),r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+(b.x+b.width/2-o.x)/v.width*r.width,y:r.y+(1-(b.y+b.height/2-o.y)/v.height)*r.height}},names);await page.mouse.click(p.x,p.y);await page.waitForTimeout(120)}
async function shot(page,name){await page.waitForTimeout(280);await page.screenshot({path:path.join(out,name+'.png')})}
async function profileMenuFits(page){return page.evaluate(()=>{
  const p=g.node.getChildByName('PlayerOverlay').getChildByName('PlayerPanel');
  const names=['ProfileStats','Button_食材图鉴','Button_我的成就','Button_地域排行榜','Button_选择地区','Button_页面风格','Button_继续游戏'];
  const boxes=names.map(name=>p.getChildByName(name).getComponent(cc.UITransform).getBoundingBoxToWorld());
  for(let i=1;i<boxes.length;i++)if(boxes[i].y+boxes[i].height>boxes[i-1].y)throw Error('Profile rows overlap: '+names[i]);
  return {name:'Profile menu',options:5,statisticsInteractive:false};
})}
async function safePanel(page,name){return page.evaluate(name=>{
  const n=g.node.getChildByName(name),p=name==='ReferenceShell'?n:n?.getChildByName('PlayerPanel')||n?.getChildByName('ResultPanel');if(!p)throw Error('Missing '+name);
  const ui=p.getComponent(cc.UITransform),b=ui.getBoundingBoxToWorld(),v=cc.view.getVisibleSize(),o=cc.view.getVisibleOrigin();
  if(ui.width!==720||ui.height!==1280)throw Error('Wrong canvas '+name+' '+ui.width+'x'+ui.height);
  if(Math.abs(p.scale.x-p.scale.y)>1e-6)throw Error('Nonuniform scale '+name);
  if(b.x<o.x-.2||b.y<o.y-.2||b.x+b.width>o.x+v.width+.2||b.y+b.height>o.y+v.height+.2)throw Error('Panel clipped '+name);
  return {name,width:ui.width,height:ui.height,scale:p.scale.x};
},name)}
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],missing=[],checks=[];
try{
const page=await browser.newPage({viewport:{width:720,height:1280},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url())});await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
await page.goto(origin);await page.waitForFunction(()=>typeof System!=='undefined');await page.evaluate(async()=>{window.cc=await System.import('cc')});
await page.waitForFunction(()=>{const find=n=>{const g=n?.getComponent('HotPotGame');if(g)return g;for(const c of n?.children||[]){const f=find(c);if(f)return f}return null};window.g=find(cc.director.getScene());return g?.ingredientFrames.size===50&&g.playerService&&g.levelData},null,{timeout:60000});
await page.waitForFunction(()=>g.audioClips.size===4);
await page.evaluate(()=>{window.toasts=[];const show=g.showToast.bind(g);g.showToast=(message,color)=>{toasts.push(message);show(message,color)}});
const stateNames=['PlayerOverlay','StyleOverlay','CollectionOverlay','CollectionDetailOverlay','RegionOverlay','BackdoorOverlay','RestartConfirmOverlay','ResultOverlay'];
for(const style of [1,4,8,9]){
  await clear(page);await page.evaluate(style=>{g.selectPageStyle(style);g.playerService.local.state.progress.discovered=[...g.ingredientFrames.keys()].slice(0,23)},style);
  await page.evaluate(()=>g.loadLevel(0));const type=await page.evaluate(()=>g.levelData.tiles.filter(t=>g.isTileSelectable(t)).sort((a,b)=>b.layer-a.layer)[0].type);
  for(let move=0;move<3;move++){
    const picked=await page.evaluate(type=>g.levelData.tiles.filter(t=>t.type===type&&g.isTileSelectable(t)).sort((a,b)=>b.layer-a.layer)[0].id,type);
    await click(page,['ReferenceShell','Board','Tile_'+picked]);await page.waitForTimeout(350);assert(await page.evaluate(id=>g.findTile(id).removed&&!g.locked,picked));
  }
  assert.equal(await page.evaluate(()=>g.tray.length),0);
  assert(!await page.evaluate(()=>toasts.some(s=>/\+30|连消/.test(s))),'ordinary matches must not display score popups');
  for(const level of [0,1,2]){await page.evaluate(level=>g.loadLevel(level),level);assert.equal(await page.evaluate(()=>g.toolBar.active),level>0);assert.equal(await page.evaluate(()=>g.node.getChildByName('ReferenceShell').getChildByName('FirstLevelBottom').active),level===0);await shot(page,'game'+(level+1)+'-'+style)}
  await page.evaluate(()=>g.showPlayerProfile());checks.push({style,...await safePanel(page,'PlayerOverlay')});await shot(page,'profile-'+style);
  checks.push({style,...await profileMenuFits(page)});
  const profileId=await page.evaluate(()=>g.node.getChildByName('PlayerOverlay').uuid);
  for(const column of [0,1,2]){
    const point=await page.evaluate(column=>{const b=g.node.getChildByName('PlayerOverlay').getChildByName('PlayerPanel').getChildByName('ProfileStats').getComponent(cc.UITransform).getBoundingBoxToWorld(),v=cc.view.getVisibleSize(),o=cc.view.getVisibleOrigin(),r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+(b.x+b.width*(column+.5)/3-o.x)/v.width*r.width,y:r.y+(1-(b.y+b.height/2-o.y)/v.height)*r.height}},column);
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>g.node.getChildByName('PlayerOverlay')?.uuid),profileId,'Statistics must remain on the profile page');
    assert(!await page.evaluate(()=>!!g.node.getChildByName('RegionOverlay')),'Statistics must not open ranking');
  }
  await click(page,['PlayerOverlay','PlayerPanel','Button_地域排行榜']);assert(await page.evaluate(()=>!!g.node.getChildByName('RegionOverlay')));await shot(page,'rank-option-'+style);
  await click(page,['RegionOverlay','PlayerPanel','Button_返回我的']);assert(await page.evaluate(()=>!!g.node.getChildByName('PlayerOverlay')));
  await click(page,['PlayerOverlay','PlayerPanel','Button_页面风格']);
  await click(page,['StyleOverlay','PlayerPanel','PageStyle_'+(style===1?4:1)]);await click(page,['StyleOverlay','PlayerPanel','Button_取消换肤']);
  assert.equal(await page.evaluate(()=>g.node.getChildByName('ReferenceShell').getChildByName('WarmBackground')!==null),true);
  assert.equal(await page.evaluate(()=>g.node.getChildByName('PlayerOverlay')!==null),true);
  await click(page,['PlayerOverlay','PlayerPanel','Button_页面风格']);checks.push({style,...await safePanel(page,'StyleOverlay')});await shot(page,'picker-'+style);
  await click(page,['StyleOverlay','PlayerPanel','PageStyle_'+style]);await click(page,['StyleOverlay','PlayerPanel','Button_应用所选风格']);assert(await page.evaluate(()=>!!g.node.getChildByName('PlayerOverlay')));
  await click(page,['PlayerOverlay','PlayerPanel','Button_食材图鉴']);assert.equal(await page.evaluate(()=>g.node.getChildByName('CollectionOverlay').getChildByName('PlayerPanel').getChildByName('CollectionViewport').getChildByName('CollectionContent').children.length),50);await shot(page,'collection-'+style);
  await click(page,['CollectionOverlay','PlayerPanel','CollectionViewport','CollectionContent','IngredientCard_shrimp']);await shot(page,'detail-'+style);assert(await page.evaluate(()=>!!g.node.getChildByName('CollectionDetailOverlay')));
  await click(page,['CollectionDetailOverlay','PlayerPanel','Button_返回图鉴']);
  await page.evaluate(()=>{const panel=g.node.getChildByName('CollectionOverlay').getChildByName('PlayerPanel');panel.getChildByName('CollectionViewport').getComponent(cc.ScrollView).scrollToBottom(0)});await shot(page,'collection-end-'+style);
  const offset=await page.evaluate(()=>g.node.getChildByName('CollectionOverlay').getChildByName('PlayerPanel').getChildByName('CollectionViewport').getComponent(cc.ScrollView).getScrollOffset().y);assert(offset>1000);
  await clear(page);await page.evaluate(()=>g.showIngredientDetail('vermicelli'));await shot(page,'detail-locked-'+style);
  await clear(page);await page.evaluate(()=>g.showCollection('achievements'));await shot(page,'achievements-'+style);
  await clear(page);await page.evaluate(()=>{g.playerService.local.state.profile.regionCodes=[];g.showRegionPicker([])});const disabled=await page.evaluate(()=>g.node.getChildByName('RegionOverlay').getChildByName('PlayerPanel').getChildByName('Button_保存地区').referenceDisabled);assert(disabled);await shot(page,'region-pending-'+style);
  await clear(page);await page.evaluate(()=>{const a=g.playerService.regions.find(r=>r.children?.length);g.showRegionPicker([a.code])});assert(await page.evaluate(()=>g.node.getChildByName('RegionOverlay').getChildByName('PlayerPanel').getChildByName('Button_保存地区').referenceDisabled));
  await clear(page);await page.evaluate(()=>{const a=g.playerService.regions.find(r=>!r.children?.length);g.showRegionPicker([a.code])});assert(!await page.evaluate(()=>g.node.getChildByName('RegionOverlay').getChildByName('PlayerPanel').getChildByName('Button_保存地区').referenceDisabled));
  await clear(page);await page.evaluate(()=>{const a=g.playerService.regions.find(r=>r.children?.some(c=>c.children?.length)),b=a.children.find(r=>r.children?.length),c=b.children[0];g.showRegionPicker([a.code,b.code,c.code])});await shot(page,'region-'+style);await click(page,['RegionOverlay','PlayerPanel','Button_保存地区']);assert.equal(await page.evaluate(()=>g.playerService.state.profile.regionCodes.length),3);
  await clear(page);await page.evaluate(()=>g.showRegionPicker([],true));await shot(page,'rank-empty-'+style);
  for(const scope of [0,1,2]){await clear(page);await page.evaluate(scope=>g.showDesignRanking(scope),scope);checks.push({style,scope,...await safePanel(page,'RegionOverlay')})}
  await clear(page);await page.evaluate(()=>{g.playerService.runtimeConfig={collectionHeadingTaps:2,collectionIngredientTaps:2};g.showCollection()});
  for(let tap=0;tap<2;tap++)await click(page,['CollectionOverlay','PlayerPanel','CollectionHeading']);
  for(let tap=0;tap<2;tap++)await click(page,['CollectionOverlay','PlayerPanel','Button_食材图鉴']);assert(await page.evaluate(()=>!!g.node.getChildByName('BackdoorOverlay')));
  await clear(page);await page.evaluate(()=>g.showBackdoor());await shot(page,'backdoor-'+style);await click(page,['BackdoorOverlay','PlayerPanel','Unlimited_undo']);assert(await page.evaluate(()=>g.unlimitedTools.undo));
  await clear(page);await page.evaluate(()=>g.showRestartConfirmation());await shot(page,'restart-'+style);await click(page,['RestartConfirmOverlay','PlayerPanel','RestartDialog','Button_继续当前游戏']);assert(!await page.evaluate(()=>!!g.node.getChildByName('RestartConfirmOverlay')));
  await clear(page);await page.evaluate(()=>{g.loadLevel(2);const used=new Set();g.tray=[];for(const tile of g.levelData.tiles)if(!used.has(tile.type)&&used.size<7){used.add(tile.type);tile.removed=true;g.tray.push(tile.type)}g.reviveUsed=false;g.endGame(false)});await shot(page,'revive-'+style);
  await click(page,['ResultOverlay','ResultPanel','ReviveDialog','Button_免费复活，继续捞']);assert(await page.evaluate(()=>g.reviveUsed&&!g.gameEnded&&g.reserve.length===3));
  await page.evaluate(()=>g.endGame(false));await shot(page,'revive-used-'+style);assert(await page.evaluate(()=>g.node.getChildByName('ResultOverlay').getChildByName('ResultPanel').getChildByName('ReviveDialog').getChildByName('Button_免费复活已用完').referenceDisabled));
  await click(page,['ResultOverlay','ResultPanel','ReviveDialog','Button_重新开始']);await click(page,['RestartConfirmOverlay','PlayerPanel','RestartDialog','Button_确定重新开始']);assert(await page.evaluate(()=>!g.gameEnded&&g.tray.length===0&&!g.reviveUsed));
  for(const level of [0,1,2]){await clear(page);await page.evaluate(level=>{g.loadLevel(level);g.levelData.tiles.forEach(t=>t.removed=true);g.tray=[];g.reserve=[];g.endGame(true)},level);await shot(page,'win'+(level+1)+'-'+style);await click(page,['ResultOverlay','ResultPanel','WinDialog',level===2?'Button_再来一轮':'Button_下一关']);assert.equal(await page.evaluate(()=>g.levelIndex),(level+1)%3)}
  await clear(page);await page.evaluate(()=>g.toggleSound());assert.equal(await page.evaluate(()=>g.toastLabel.string),await page.evaluate(()=>g.soundEnabled?'声音已开启':'声音已关闭'));
  console.log('Four-theme native UI: style '+style+' pages, real clicks, scroll, revival and result flow OK');
}
for(const [width,height] of [[320,568],[390,844],[430,932],[754,878],[768,1024],[844,390]]){
  await clear(page);await page.setViewportSize({width,height});await page.waitForTimeout(250);
  checks.push({width,height,...await safePanel(page,'ReferenceShell')});
  const covers=()=>{
    const assertCover=node=>{const b=node.getComponent(cc.UITransform).getBoundingBoxToWorld(),v=cc.view.getVisibleSize(),o=cc.view.getVisibleOrigin();if(b.x>o.x+.2||b.y>o.y+.2||b.x+b.width<o.x+v.width-.2||b.y+b.height<o.y+v.height-.2)throw Error('Viewport scenery leaves a blank edge');return true};
    return assertCover(g.node.getChildByName('ReferenceScreenBackground').getChildByName('FullBleedBackground'));
  };
  assert(await page.evaluate(covers));
  if(width===754){await page.evaluate(()=>{g.selectPageStyle(8);g.loadLevel(0)});await shot(page,'wide-first-level');}
  for(const method of ['showPlayerProfile','showPageStyles','showCollection','showBackdoor','showRestartConfirmation']){
    await clear(page);await page.evaluate(method=>g[method](),method);const names={showPlayerProfile:'PlayerOverlay',showPageStyles:'StyleOverlay',showCollection:'CollectionOverlay',showBackdoor:'BackdoorOverlay',showRestartConfirmation:'RestartConfirmOverlay'};checks.push({width,height,...await safePanel(page,names[method])});
    if(method!=='showRestartConfirmation')assert(await page.evaluate(name=>{const n=g.node.getChildByName(name).getChildByName('FullBleedBackground'),b=n.getComponent(cc.UITransform).getBoundingBoxToWorld(),v=cc.view.getVisibleSize(),o=cc.view.getVisibleOrigin();return b.x<=o.x+.2&&b.y<=o.y+.2&&b.x+b.width>=o.x+v.width-.2&&b.y+b.height>=o.y+v.height-.2},names[method]));
    if(method==='showPlayerProfile')checks.push({width,height,...await profileMenuFits(page)});
  }
}
await clear(page);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.wx={getWindowInfo:()=>({windowWidth:390,windowHeight:844,safeArea:{left:0,right:390,top:47,bottom:810}}),getMenuButtonBoundingClientRect:()=>({height:32,bottom:87})};g.showPlayerProfile()});checks.push({wechat:'safe-area simulation',...await safePanel(page,'PlayerOverlay')});
assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({build:buildMarker,styles:[1,4,8,9],checks,pageErrors:errors,missingLocalAssets:missing,loadedIngredients:50,loadedAudio:4,noScorePopups:true,firstLevelToolsHidden:true,viewportSceneryCovers:true,profileStatisticsInert:true,dedicatedRankingOption:true,network:'External requests blocked; fixture changes apply to this isolated test browser only',wechat:'Safe-area API simulation; physical device testing still required'},null,2));console.log('Native UI verification passed: '+checks.length+' layout checks, 4 styles, no page errors.');
}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
