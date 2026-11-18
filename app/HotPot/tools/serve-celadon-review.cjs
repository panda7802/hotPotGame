'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const repo=path.resolve(__dirname,'../../..');
const root=path.join(repo,'tmp/hidden-ingredients-build-20261103/app/HotPot/build/web-hidden-ingredients');
const data=require('../cloudfunctions/hotpotPlayerDev/GameData');
const domain=require('../cloudfunctions/hotpotPlayerDev/PlayerData');
const {HIDDEN_INGREDIENTS}=require('../cloudfunctions/hotpotPlayerDev/GameConfig');
const hiddenIds=HIDDEN_INGREDIENTS.map(food=>food.id);
const port=Number(process.env.PORT||8915);
let seed=1,level;
while(true){
  if(data.selectLevelIngredients(2,seed).includes('matsutake')){
    level=data.createLevel(2,data.VARIED_LAYOUT_SEED_START,undefined,seed);
    if(level.tiles.some(tile=>tile.type==='matsutake'&&tile.blockedBy.length===0))break;
  }seed++;
}
const save={version:1,boardVersion:domain.BOARD_VERSION,levelIndex:2,
  layoutSeed:level.layoutSeed,ingredientSeed:seed,ingredientPoolVersion:4,
  types:level.tiles.map(tile=>tile.type),removedIds:[],tray:[],reserve:[],
  reviveUsed:false,rewardedMilestones:0,toolUses:{undo:1,bomb:1,shuffle:1},
  lastMove:null,status:'playing'};
const entry=`(async()=>{
  const query=new URLSearchParams(location.search);
  const selected=Number(query.get('style')),style=[1,4,8,9].includes(selected)?selected:8;
  localStorage.setItem('hotpot.page-style.v2',String(style));
  let busy=false;
  const timer=setInterval(async()=>{
    if(busy||!window.System)return;busy=true;
    try{
      const cc=await System.import('cc');
      const find=node=>{const g=node?.getComponent('HotPotGame');if(g)return g;for(const c of node?.children||[]){const g=find(c);if(g)return g}};
      const g=find(cc.director.getScene());
      if(!g?.achievementNotificationsReady||!g?.playerService||g?.ingredientFrames.size!==60)return;
      clearInterval(timer);g.checkpointGame=()=>{};g.setSoundEnabled?.(false);
      g.selectPageStyle(style);g.playerService.local.state.progress.discovered=${JSON.stringify(hiddenIds)};
      if(query.get('level')==='2')g.loadLevel(1,false);else g.restoreGame(${JSON.stringify(save)});
      if(query.get('view')==='collection'){g.designIngredientGroup='hidden';g.showCollection()}
      if(query.get('view')==='settings')g.showPlayerProfile();
      window.__celadonReview=window.__themeReview={game:g,cc,style};
    }finally{busy=false}
  },150);
})();`;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript',
  '.json':'application/json','.css':'text/css','.png':'image/png',
  '.jpg':'image/jpeg','.wasm':'application/wasm','.mp3':'audio/mpeg'};
http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  // Visual-review fixtures only; nothing is sent to a remote player account.
  res.setHeader('Content-Security-Policy',"connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__celadon-review.js'){
    res.setHeader('Content-Type',mime['.js']);return res.end(entry);
  }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  if(file===path.join(root,'index.html'))return res.end(fs.readFileSync(file,'utf8').replace('</body>','<script src="/__celadon-review.js"></script></body>'));
  fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log('Theme animation review: http://127.0.0.1:'+port));
