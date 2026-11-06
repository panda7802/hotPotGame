'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ts=require('./prepare-cloud.cjs').loadTypeScript();
const root=path.resolve(__dirname,'../assets/scripts');
let visible={width:720,height:1280},safe={x:0,y:0,width:720,height:1280};
const cc={view:{getVisibleSize:()=>visible},sys:{getSafeAreaRect:()=>safe}};
const context={exports:{},globalThis:{}};
context.require=name=>{
  if(name==='cc')return cc;
  if(name.endsWith('ReferenceAssets')){
    const output=ts.transpileModule(fs.readFileSync(path.join(root,'data/ReferenceAssets.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    const c={exports:{}};vm.runInNewContext(output,c);return c.exports;
  }
  if(name.endsWith('PageTheme'))return {};
  throw Error(name);
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'core/HotPotReferenceLayout.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
const {referenceSource,referenceHeight,referenceFit,referenceArea}=context.exports;
let cases=0;
for(const [width,height] of [[320,568],[375,667],[390,844],[393,852],[430,932],[768,1024],[844,390]]){
  for(const id of [1,4,8,9])for(const page of ['shell','profile','picker','rank','collection','detail','achievements','region','revive','restart','win1','win2','win3']){
    const h=referenceHeight(page,id),source=referenceSource(page,id);
    assert(Math.abs(720/h-source.w/source.h)<1e-9,'Intrinsic aspect ratio must be preserved');
    const area={width:720,height:720*height/width,left:0,right:0,top:720*88/width,bottom:720*34/width};
    const fit=referenceFit(h,area);
    assert(fit.scale>0);
    assert(fit.x-360*fit.scale>=-area.width/2+area.left-1e-7);
    assert(fit.x+360*fit.scale<=area.width/2-area.right+1e-7);
    assert(fit.y-h/2*fit.scale>=-area.height/2+area.bottom-1e-7);
    assert(fit.y+h/2*fit.scale<=area.height/2-area.top+1e-7);
    cases++;
  }
}
visible={width:720,height:720*844/390};safe={x:0,y:720*34/390,width:720,height:720*(844-47-34)/390};
context.globalThis.wx={getWindowInfo:()=>({windowWidth:390,windowHeight:844,safeArea:{left:0,right:390,top:47,bottom:810}}),getMenuButtonBoundingClientRect:()=>({bottom:83,height:32})};
const area=referenceArea();
assert(Math.abs(area.top-103*720/390)<1e-7,'Reserve the WeChat capsule, including its current 20px bottom gap');
assert(Math.abs(area.bottom-34*720/390)<1e-7,'Reserve the home indicator');
context.globalThis.wx={getWindowInfo:()=>{throw Error('Old host')}};
assert.doesNotThrow(()=>referenceArea());
console.log(`Reference screen fit: ${cases} page/device cases, source aspect ratios, notch/capsule/home area and older-host fallback OK`);

const headerContext={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'core/HotPotGameLayout.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,headerContext);
let headerCases=0;
for(const aspect of [736/284,829/302,801/342,805/256])
for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[768,1024]])
for(const capsule of [false,true])for(const first of [true,false])for(const reserve of [false,true]){
  const ratio=720/width;
  const l=headerContext.exports.gameInterfaceLayout({width:720,height:height*ratio,left:0,right:0,
    top:capsule?103*ratio:0,systemTop:capsule?47*ratio:0,menuBottom:capsule?83*ratio:0,bottom:capsule?34*ratio:0},first,reserve,aspect);
  assert(Math.abs(l.brand[0]+l.brand[2]/2-360)<.001);
  assert(Math.abs(l.brand[2]/l.brand[3]-aspect)<.001,'Keep each brand illustration proportional');
  assert(l.brand[1]+l.brand[3]<=l.collection[1],'Controls must be below the title');
  assert(l.collection[0]+l.collection[2]<=l.stage[0] && l.stage[0]+l.stage[2]<=l.settings[0]);
  assert(l.collection[0]>=0&&l.settings[0]+l.settings[2]<=720);
  assert(Math.min(l.collection[2],l.collection[3])/ratio>=44-.001,'Keep a 44px touch target');
  if(capsule)assert(l.brand[1]>=83*ratio,'Stay below the WeChat capsule');
  assert(l.board[1]+l.board[3]<=l.tray[1] && l.play[3]>=80);
  if(!first)assert(l.tray[1]+l.tray[3]<=l.tools[0][1] && l.tools[0][1]+l.tools[0][3]<=l.controls[0][1],'Keep room for second-level tools');
  headerCases++;
}
console.log(`Four-theme header: ${headerCases} aspect/viewport/capsule/tool/reserve cases OK`);
