const fs=require('fs'),path=require('path');
const repo=path.resolve(__dirname,'..');
for(const project of [path.join(repo,'app/HotPot'),path.join(repo,'tmp/build-1489-20261030/app/HotPot')]){
  const from=path.join(project,'assets/resources/themes');
  const to=path.join(project,'assets/art-archive/pre-reference-replica/themes');
  fs.mkdirSync(to,{recursive:true});
  if(!from.startsWith(repo+path.sep))throw Error('Unsafe archive target');
  for(const file of fs.readdirSync(from)){
    if(!/^(style|thumb)-0[1489]\.jpg(\.meta)?$/.test(file))continue;
    const src=path.join(from,file),dst=path.join(to,file);
    if(fs.existsSync(dst))throw Error('Existing archive: '+dst);
    fs.renameSync(src,dst);
  }
}
