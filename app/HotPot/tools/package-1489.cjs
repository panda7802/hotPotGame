'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../..');
const source=path.join(root,'tmp/build-1489-20261030/app/HotPot/build/wechatgame-cloud-dev');
const output=path.join(root,'exports/HotPot-1489-ingredients-20261030');
const client=path.join(output,'wechatgame');
if(fs.existsSync(output))throw Error('Refusing to overwrite an existing delivery: '+output);
const game=JSON.parse(fs.readFileSync(path.join(source,'game.json'),'utf8'));
if(!game.cloud)throw Error('Missing original cloud capability');
const main=fs.readFileSync(path.join(source,'subpackages/main/game.js'),'utf8');
for(const name of ['市井朱红','奶油黏土','青瓷雅韵','宣纸朱印','20261029-ui1489-food50']){
  if(!main.includes(name))throw Error('Missing new build marker: '+name);
}
if(!main.includes('titleFill'))throw Error('Package is missing the final title materials');
fs.mkdirSync(output,{recursive:true});
fs.cpSync(source,client,{recursive:true});
// Standalone client imports do not require an external cloud-function directory.
const configFile=path.join(client,'project.config.json');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
delete config.cloudfunctionRoot;
config.projectname='锅里捞啥-四主题新食材';
fs.writeFileSync(configFile,JSON.stringify(config,null,2));
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())walk(file);
  else{const bytes=fs.readFileSync(file);files.push({file:path.relative(client,file).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
}}
walk(client);
const total=files.reduce((sum,file)=>sum+file.bytes,0);
if(total>=4000000)throw Error('Client exceeds 4,000,000-byte limit: '+total);
const subpackages=(game.subpackages||game.subPackages||[]).map(p=>({name:p.name,root:p.root,bytes:files.filter(f=>f.file.startsWith(p.root.replace(/\/$/,'')+'/')).reduce((sum,f)=>sum+f.bytes,0)}));
const mainBytes=total-subpackages.reduce((sum,p)=>sum+p.bytes,0);
if(mainBytes>=2000000||subpackages.some(p=>p.bytes>=2000000))throw Error('Individual local package exceeds 2 MB');
const report={build:'20261029-ui1489-food50',packagedDate:'2026-10-30',styles:[1,4,8,9],ingredientCount:50,totalClientBytes:total,limitBytes:4000000,remainingBytes:4000000-total,mainPackageBytes:mainBytes,subpackages,files:files.sort((a,b)=>a.file.localeCompare(b.file)),cloud:'Existing environment retained; no remote deployment or publication',validation:'Cocos 3.8.8 release build and local runtime regression; see source design/implemented-1489/runtime/verification.json'};
fs.writeFileSync(path.join(output,'build-report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(output,'导入说明.md'),`# 锅里捞啥 · 四主题新食材版\n\n2026-10-30，Cocos Creator 3.8.8 微信小游戏。\n\n1. 在微信开发者工具选择「小游戏」，导入同目录的 wechatgame 文件夹。\n2. AppID 沿用 wx943cc2d81ec6f820，使用具有该项目权限的微信账号。\n3. 在「我的 → 页面风格」中预览和确认 1 市井朱红、4 奶油黏土、8 青瓷雅韵、9 宣纸朱印。\n\n客户端共 **${total.toLocaleString('en-US')} 字节**，严格低于 4,000,000 字节，余量 ${4000000-total} 字节；按未压缩客户端逐文件统计，非 ZIP 大小。每个本地包也低于 2,000,000 字节。完整文件与 SHA256 见 build-report.json。\n\n50种透明食材共享两张图集；牌面、托盘、按钮、弹框随主题切换，当前对局、图鉴、成就与地区保留。关卡和免费复活规则沿用现有版本。旧主题偏好按材质迁移，不重置游戏存档。\n\n沿用现有云环境 cloud1-d2gc9q7cobffff893 与现有云函数，本轮未部署云函数、修改云数据库或公开发布。未执行手机扫码真机验证。源码、原始美术与设计截图不属于客户端，不要复制进 wechatgame 目录。\n`, 'utf8');
console.log(JSON.stringify({output,total,remaining:4000000-total,mainBytes,subpackages},null,2));
