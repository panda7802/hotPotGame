'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..');
const build=path.resolve(process.argv[2]||path.join(root,'build/wechatgame-cloud-dev'));
const output=path.join(repo,'design/asset-audit-20261030');
const assets=[];
function add(file,use){assets.push({file,use})}
for(const name of ['bgm','match','win','lose'])add(`audio/${name}.mp3`,'HotPotResources: background music or match/win/lose effect');
add('data/regions.json','HotPotState + HotPotReferenceCollection: province/city/county data');
for(const sheet of ['a','b'])add(`ingredients/food-${sheet}.png`,'HotPotResources: 25 ingredients per shared sheet, 50 in total');
for(const id of ['01','04','08','09']){
  add(`reference/shell-${id}.jpg`,'HotPotReferenceShell: main gameplay composition for this selectable theme');
  add(`reference/a-${id}.jpg`,'HotPotReferenceMenus/Results: ranking, profile, style picker and three level results');
  add(`reference/b-${id}.jpg`,'HotPotReferenceCollection/Results: collection, detail, achievements, region, revive and restart');
}
add('reference/tiles.png','HotPotTileSkin: four selectable themes share this tile-face atlas');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
const runtime=path.join(root,'assets/resources');
const actual=walk(runtime).filter(f=>!f.endsWith('.meta')).map(f=>path.relative(runtime,f).replaceAll('\\','/')).sort();
assert.deepStrictEqual(actual,assets.map(a=>a.file).sort(),'Unexpected runtime resource: confirm its active loader before adding it');
const config=JSON.parse(fs.readFileSync(path.join(build,'subpackages/resources/config.json'),'utf8'));
const packagedNames=[...new Set(Object.values(config.paths).map(p=>p[0].replace(/\/texture$/,'')))].sort();
assert.deepStrictEqual(packagedNames,assets.map(a=>a.file.replace(/\.[^.]+$/,'')).sort(),'Packaged resource manifest must match the audited source assets');
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const native=walk(path.join(build,'subpackages/resources/native')).map(file=>({file,bytes:fs.statSync(file).size,hash:sha(fs.readFileSync(file))}));
for(const asset of assets){
  const source=fs.readFileSync(path.join(runtime,asset.file));asset.bytes=source.length;asset.sha256=sha(source);
  if(!asset.file.endsWith('.json')){
    const matches=native.filter(f=>f.hash===asset.sha256);
    assert.strictEqual(matches.length,1,'Each used image/audio must be packaged once: '+asset.file);
    asset.packagedFile=path.relative(build,matches[0].file).replaceAll('\\','/');
  }
}
assert.strictEqual(native.length,19,'Only 15 used images and 4 audio files should remain in the native resources');
for(const name of ['HotPotRegion.ttf','OFL.txt'])assert(fs.existsSync(path.join(root,'assets/art-archive/unused-region-font',name)),'Keep legacy font and its license together outside runtime resources');
const baseline=JSON.parse(fs.readFileSync(path.join(repo,'exports/HotPot-screenfit-20261030/build-report.json'),'utf8'));
const bytes=walk(build).reduce((sum,file)=>sum+fs.statSync(file).size,0);
const report={build:fs.readFileSync(path.join(root,'assets/scripts/core/HotPotTileSkin.ts'),'utf8').match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1],
  auditedBuild:path.relative(repo,build).replaceAll('\\','/'),baselineClientBytes:baseline.totalClientBytes,currentClientBytes:bytes,
  resourceCount:assets.length,imageCount:15,audioCount:4,dataCount:1,
  removedFromRuntime:[{file:'fonts/HotPotRegion.ttf',bytes:31744,reason:'Only the overridden legacy region picker used this font; active pages use system fonts'},
    {file:'fonts/OFL.txt',bytes:4490,reason:'Font and accompanying license are retained together under assets/art-archive/unused-region-font'}],
  otherUnusedRuntimeResources:[],duplicateNativeAssets:[],assets};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({resourceCount:assets.length,imageCount:15,audioCount:4,currentClientBytes:bytes,archivedSourceBytes:36234,unknownOrDuplicateRuntimeAssets:0,report:path.join(output,'report.json')},null,2));
