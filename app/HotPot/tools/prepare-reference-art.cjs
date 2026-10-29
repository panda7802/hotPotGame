'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..');
const out=path.join(root,'assets/resources/reference');fs.mkdirSync(out,{recursive:true});
const template=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/ingredients/food-a.png.meta'),'utf8'));
function meta(file){if(fs.existsSync(file+'.meta'))return;const id=crypto.randomUUID(),data=JSON.parse(JSON.stringify(template).replaceAll(template.uuid,id));data.files=['.json',path.extname(file)];data.userData.hasAlpha=path.extname(file)==='.png';data.subMetas['6c48a'].displayName=path.basename(file,path.extname(file));fs.writeFileSync(file+'.meta',JSON.stringify(data,null,2));}
(async()=>{const report=[];
const cleanedStyles=[1,4,8,9].filter(id=>fs.existsSync(path.join(repo,'design/reference-replica-20261030/source/a-clean-0'+id+'.png')));
const auxLayouts={};
for(const id of [1,9]){
  const file=path.join(repo,'design/reference-replica-20261030/source/b-derived-0'+id+'.png');if(!fs.existsSync(file))continue;
  const m=await sharp(file).metadata();
  auxLayouts[id]=id===1?{width:941,height:1672,cols:[[0,342],[345,281],[629,312]],rows:[[0,784],[787,885]]}
    :{width:m.width,height:m.height,cols:[[0,Math.floor(m.width/3)],[Math.round(m.width/3),Math.floor(m.width/3)],[Math.round(m.width*2/3),Math.floor(m.width/3)]],rows:[[0,Math.floor(m.height/2)],[Math.round(m.height/2),Math.floor(m.height/2)]]};
}
const patchColors={};
const profileRaw=await sharp(path.join(repo,'design/ui-expanded-1489-2026-10-29/style-01/A.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});
const boxes=[[.40,.266,.39,.055],[.40,.326,.39,.045],[.24,.435,.15,.04],[.58,.435,.21,.04]];
for(const box of boxes){
  const left=388+box[0]*378,top=box[1]*638,right=left+box[2]*378,bottom=top+box[3]*638;
  patchColors['1-profile-'+box.map(v=>v.toFixed(4)).join(',')]=[[left-2,top-2],[right+2,top-2],[left-2,bottom+2],[right+2,bottom+2]].map(([x,y])=>{
    const at=(Math.round(y)*profileRaw.info.width+Math.round(x))*profileRaw.info.channels;return [...profileRaw.data.slice(at,at+3)];
  });
}
fs.writeFileSync(path.join(root,'assets/scripts/data/ReferenceAssets.ts'),'export const REFERENCE_CLEAN_STYLES: number[] = '+JSON.stringify(cleanedStyles)+';\nexport const REFERENCE_AUX_LAYOUTS: Record<number,any> = '+JSON.stringify(auxLayouts)+';\nexport const REFERENCE_PATCH_COLORS: Record<string,number[][]> = '+JSON.stringify(patchColors)+';\n');
const tileSource=path.join(repo,'design/reference-replica-20261030/source/tiles-source.png');
const tileLayers=[];
for(let i=0;i<4;i++){
  const cell=await sharp(tileSource).extract({left:i%2*627,top:Math.floor(i/2)*627,width:627,height:627}).png().toBuffer();
  const input=await sharp(cell).trim({threshold:25}).resize(112,104,{fit:'contain',background:'#00000000'}).png().toBuffer();
  tileLayers.push({input,left:i*112,top:0});
}
const tiles=path.join(out,'tiles.png');
await sharp({create:{width:448,height:104,channels:4,background:'#00000000'}}).composite(tileLayers).png({palette:true,colours:128,compressionLevel:9}).toFile(tiles);meta(tiles);
for(const id of ['01','04','08','09']){
  const shell=path.join(out,'shell-'+id+'.jpg');
  await sharp(path.join(repo,'design/reference-replica-20261030/source/shell-'+id+'.png')).resize(540,960,{fit:'fill'}).jpeg({quality:70,mozjpeg:true}).toFile(shell);meta(shell);
  for(const group of ['A','B']){
    const derived=path.join(repo,'design/reference-replica-20261030/source/b-derived-'+id+'.png');
    const source=group==='B'&&fs.existsSync(derived)?derived:path.join(repo,'design/ui-expanded-1489-2026-10-29/style-'+id+'/'+group+'.png');
    if(!fs.existsSync(source))continue;
    const file=path.join(out,group.toLowerCase()+'-'+id+'.jpg');
    let image=sharp(source);
    const sourceInfo=await sharp(source).metadata();
    const layers=[];
    if(group==='A'){
      const rows=id==='01'?[[0,638],[643,724]]:id==='08'?[[0,629],[634,732]]:id==='04'?[[0,835],[839,833]]:[[0,834],[839,833]];
      const cols=id==='01'?[[0,383],[388,378],[771,380]]:id==='08'?[[0,387],[396,362],[772,379]]:[[0,312],[318,307],[631,310]];
      layers.push({input:await sharp(source).extract({left:0,top:0,width:sourceInfo.width,height:rows[0][1]}).png().toBuffer(),left:0,top:0});
      const bounds=id==='01'?[.12,.14,.78,.59]:id==='04'?[.10,.19,.80,.48]:id==='08'?[.075,.20,.85,.51]:[.08,.135,.84,.525];
      for(let i=0;i<3;i++){
        const left=Math.max(cols[i][0],Math.floor(cols[i][0]+bounds[0]*cols[i][1])-2);
        const top=Math.floor(rows[1][0]+bounds[1]*rows[1][1])-2;
        const width=Math.min(Math.ceil(bounds[2]*cols[i][1])+4,sourceInfo.width-left);
        const height=Math.min(Math.ceil(bounds[3]*rows[1][1])+4,sourceInfo.height-top);
        layers.push({input:await sharp(source).extract({left,top,width,height}).png().toBuffer(),left,top});
      }
      image=sharp({create:{width:sourceInfo.width,height:sourceInfo.height,channels:3,background:'#FFFFFF'}});
    }
    const clean=path.join(repo,'design/reference-replica-20261030/source/a-clean-'+id+'.png');
    if(group==='A'&&fs.existsSync(clean)){
      const m=await sharp(source).metadata();
      const cleaned=await sharp(clean).resize(m.width,m.height,{fit:'fill'}).png().toBuffer();
      const split=id==='01'?.468:id==='08'?.461:.5;
      const front=await sharp(cleaned).extract({left:0,top:0,width:Math.floor(m.width*2/3),height:Math.floor(m.height*split)}).png().toBuffer();
      layers.push({input:front,left:0,top:0});
    }
    if(layers.length)image=image.composite(layers);
    await image.resize({width:group==='A'?1200:780,withoutEnlargement:true}).jpeg({quality:group==='A'?73:48,mozjpeg:true}).toFile(file);meta(file);
  }
}
for(const letter of ['a','b']){
  const file=path.join(root,'assets/resources/ingredients/food-'+letter+'.png');
  if((await sharp(file).metadata()).width!==640){
    const image=await sharp(file).resize(640,640).png({palette:true,colours:192,compressionLevel:9,effort:10}).toBuffer();
    fs.writeFileSync(file,image);
  }
}
for(const f of fs.readdirSync(out).filter(f=>/\.(jpg|png)$/.test(f))){report.push({file:f,bytes:fs.statSync(path.join(out,f)).size})}
fs.writeFileSync(path.join(repo,'design/reference-replica-20261030/art-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
