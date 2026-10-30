'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..'),dest=path.join(root,'assets/resources/reference');
const archive=path.join(root,'assets/art-archive/pre-design-720-reference');
function meta(file){if(fs.existsSync(file+'.meta'))return;const template=JSON.parse(fs.readFileSync(path.join(dest,'shell-01.jpg.meta'),'utf8'));const old=template.uuid,id=crypto.randomUUID();const m=JSON.parse(JSON.stringify(template).replaceAll(old,id));m.subMetas['6c48a'].displayName=path.basename(file,'.jpg');m.userData.width=720;m.userData.height=1280;fs.writeFileSync(file+'.meta',JSON.stringify(m,null,2));}
(async()=>{
fs.mkdirSync(archive,{recursive:true});
for(const id of ['01','04','08','09']){
  const file=path.join(dest,'bg-'+id+'.jpg');
  await sharp(path.join(repo,'design/ui-4themes-720x1280-20261030/assets/bg-'+id+'-source.png')).resize(720,1280,{fit:'cover'}).jpeg({quality:68,mozjpeg:true}).toFile(file);meta(file);
  const shell=path.join(dest,'shell-'+id+'.jpg');
  await sharp(path.join(repo,'design/reference-replica-20261030/source/shell-'+id+'.png')).resize(720,1280,{fit:'fill'}).jpeg({quality:75,mozjpeg:true}).toFile(shell);
  const shellMeta=JSON.parse(fs.readFileSync(shell+'.meta','utf8'));shellMeta.userData.width=720;shellMeta.userData.height=1280;fs.writeFileSync(shell+'.meta',JSON.stringify(shellMeta,null,2));
  // Obsolete six-page atlases are preserved outside the runtime resources bundle.
  for(const prefix of ['a','b'])for(const suffix of ['.jpg','.jpg.meta']){
    const from=path.join(dest,prefix+'-'+id+suffix),to=path.join(archive,path.basename(from));
    if(fs.existsSync(from)){if(fs.existsSync(to))throw Error('Archive already exists '+to);fs.renameSync(from,to);}
  }
}
const assets=fs.readdirSync(dest).filter(f=>/\.(jpg|png)$/.test(f)).map(file=>({file,bytes:fs.statSync(path.join(dest,file)).size}));
console.log(JSON.stringify({images:assets,total:assets.reduce((s,f)=>s+f.bytes,0)},null,2));
})();
