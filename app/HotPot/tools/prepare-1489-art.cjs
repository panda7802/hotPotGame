'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const source=path.resolve(root,'../../design/ingredients-1489-20261029');
const assets=path.join(root,'assets/resources');
const templateFile=path.join(assets,'ingredients/food-a.png.meta');
const template=JSON.parse(fs.readFileSync(fs.existsSync(templateFile) ? templateFile
  : path.join(assets,'ingredients/expanded-atlas.png.meta'),'utf8'));
function meta(file,width,height){
  if(fs.existsSync(file+'.meta'))return;
  const uuid=crypto.randomUUID(),old=template.uuid;
  const value=JSON.parse(JSON.stringify(template).replaceAll(old,uuid));
  const ext=path.extname(file),name=path.basename(file,ext);
  value.files=['.json',ext];value.subMetas['6c48a'].displayName=name;
  Object.assign(value.userData,{hasAlpha:ext==='.png',width,height});
  fs.writeFileSync(file+'.meta',JSON.stringify(value,null,2));
}
async function food(letter,rows,columns){
  const input=path.join(source,'atlas-'+letter+'-source.png');
  const layers=[];const cell=160;
  for(let i=0;i<25;i++){
    const x=i%5,y=Math.floor(i/5);
    // Technical slicing/repacking only; original generated sources are preserved.
    const crop=await sharp(input).extract({left:columns[x],top:rows[y],
      width:columns[x+1]-columns[x],height:rows[y+1]-rows[y]})
      .resize(144,144,{fit:'contain',background:'#00000000'}).png().toBuffer();
    layers.push({input:crop,left:x*cell+8,top:y*cell+8});
  }
  const output=path.join(assets,'ingredients/food-'+letter+'.png');
  await sharp({create:{width:800,height:800,channels:4,background:'#00000000'}})
    .composite(layers).png({palette:true,colours:256,effort:10,
      compressionLevel:9,dither:.5}).toFile(output);
  meta(output,800,800);
  return {file:path.relative(assets,output),bytes:fs.statSync(output).size};
}
async function main(){
  const report=[];
  report.push(await food('a',[0,280,510,746,975,1254],[0,275,510,752,1000,1254]));
  report.push(await food('b',[0,276,508,740,978,1254],[0,270,513,751,1005,1254]));
  const crops=[['01',0,0,431,857],['04',431,0,432,857],
    ['08',0,857,431,965],['09',431,857,432,965]];
  for(const [id,left,top,width,height] of crops){
    for(const [prefix,w,h,q] of [['style',576,1216,64],['thumb',96,203,55]]){
      const output=path.join(assets,'themes',prefix+'-'+id+'.jpg');
      await sharp(path.join(source,'backgrounds-source.png'))
        .extract({left,top,width,height}).resize(w,h,{fit:'fill'})
        .jpeg({quality:q,mozjpeg:true,chromaSubsampling:'4:2:0'}).toFile(output);
      meta(output,w,h);report.push({file:path.relative(assets,output),bytes:fs.statSync(output).size});
    }
  }
  fs.writeFileSync(path.join(source,'runtime-art-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
