'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
const repo=path.resolve(__dirname,'../../..'),dest=path.join(repo,'app/HotPot/assets/resources/game-ui');
const sharp=require(require.resolve('sharp',{paths:[repo,path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')]}));
const masters=path.join(repo,'design/four-style-previews-20261031/production-masters');
fs.mkdirSync(masters,{recursive:true});
const report=[];
(async()=>{
 for(const id of ['01','04','08','09']){
  for(const prefix of ['style','bg']){
   const name=prefix+'-'+id+'.png',original=path.join(masters,name),current=path.join(dest,name);
   if(!fs.existsSync(original)){if(!fs.existsSync(current))throw Error('Missing original '+name);fs.copyFileSync(current,original)}
   const output=path.join(dest,prefix+'-'+id+(prefix==='bg'?'.jpg':'.png'));
   const buffer=prefix==='bg'?await sharp(original).resize({width:540}).jpeg({quality:76,mozjpeg:true}).toBuffer():await sharp(original).resize({width:576}).png({palette:true,quality:80,dither:.3,effort:10,compressionLevel:9}).toBuffer();
   fs.writeFileSync(output,buffer);
   if(prefix==='bg'){
    const oldMeta=current+'.meta',newMeta=output+'.meta';
    if(fs.existsSync(oldMeta)&&!fs.existsSync(newMeta)){
     const m=JSON.parse(fs.readFileSync(oldMeta,'utf8'));m.files=m.files.map(s=>s==='.png'?'.jpg':s);m.userData.hasAlpha=false;fs.writeFileSync(newMeta,JSON.stringify(m,null,2));
    }
    if(fs.existsSync(current))fs.unlinkSync(current);if(fs.existsSync(oldMeta))fs.unlinkSync(oldMeta);
   }
   report.push({file:path.relative(repo,output).replaceAll('\\','/'),bytes:buffer.length,master:path.relative(repo,original).replaceAll('\\','/')});
  }
  // The first-level scene is now assembled from the same live nodes as later levels.
  for(const suffix of ['.jpg','.jpg.meta']){
   const source=path.join(repo,'app/HotPot/assets/resources/reference/first-'+id+suffix),target=path.join(masters,'first-'+id+suffix);
   if(!source.startsWith(repo+path.sep)||!target.startsWith(repo+path.sep))throw Error('Archive path outside repo');
   if(fs.existsSync(source)){if(!fs.existsSync(target))fs.copyFileSync(source,target);fs.unlinkSync(source)}
  }
 }
 fs.writeFileSync(path.join(repo,'.codex-work/confirmed-ui/compact-game-ui.json'),JSON.stringify({atlasSourceWidth:1024,runtimeAtlasWidth:576,backgroundWidth:540,resources:report},null,2));
 console.log(JSON.stringify({newImageBytes:report.reduce((n,r)=>n+r.bytes,0),resources:report},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
