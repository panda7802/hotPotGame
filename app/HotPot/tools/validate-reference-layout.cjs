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
for(const [width,height] of [[320,568],[360,640],[375,667],[390,844],[430,932],[768,1024]]){
  for(const capsule of [false,true]){
    const ratio=720/width;
    const layout=headerContext.exports.gameInterfaceLayout({width:720,height:height*ratio,left:0,right:0,
      top:capsule?103*ratio:0,systemTop:capsule?47*ratio:0,
      menuBottom:capsule?83*ratio:0,bottom:capsule?34*ratio:0},false,false);
    const {collection,brand,settings,stage}=layout;
    assert(collection[0]>=0 && settings[0]+settings[2]<=720);
    assert(collection[0]+collection[2]<brand[0], 'Collection entry must not overlap logo');
    assert(Math.abs(brand[0]+brand[2]/2-360)<0.001, 'Title must be centered on the screen');
    assert(brand[0]+brand[2]<settings[0], 'Logo must not overlap settings');
    for(const box of [collection,brand,settings]) assert(box[1]+box[3]<=stage[1], 'Header must stay above stage label');
    if(capsule) for(const box of [collection,brand,settings]) assert(box[1]>=83*ratio,
      'Header must stay below the real WeChat capsule');
    assert(Math.min(collection[2],collection[3])/ratio>=44, 'Collection touch target must remain usable on small phones');
    headerCases++;
  }
}
console.log(`Centered header: ${headerCases} phone/tablet and WeChat capsule cases, centered title, separate controls and usable touch size: OK`);
