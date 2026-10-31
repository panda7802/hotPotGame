'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const repo=path.resolve(__dirname,'../../..'),project=path.join(repo,'app/HotPot'),built=path.join(project,'build/wechatgame-cloud-dev');
const delivery=process.argv[2]?path.resolve(process.argv[2]):path.join(repo,'exports/HotPot-four-style-ui-4mb-20261031');
const marker=fs.readFileSync(path.join(project,'assets/scripts/core/HotPotTileSkin.ts'),'utf8').match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const f=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('No links in package: '+f);return e.isDirectory()?files(f):[f]})}
assert(fs.readFileSync(path.join(built,'subpackages/main/game.js'),'utf8').includes(marker),'Stale WeChat client');
const runtime=JSON.parse(fs.readFileSync(path.join(repo,'.codex-work/confirmed-ui/four-style-runtime/verification.json')));assert.equal(runtime.checks.length,16);assert.deepEqual(runtime.errors,[]);assert.deepEqual(runtime.missing,[]);
assert(!fs.existsSync(delivery),'Refusing to replace delivery; pass a new output directory');
const client=path.join(delivery,'wechatgame');fs.mkdirSync(delivery,{recursive:true});fs.cpSync(built,client,{recursive:true});
const configFile=path.join(client,'project.config.json'),config=JSON.parse(fs.readFileSync(configFile));delete config.cloudfunctionRoot;config.projectname='锅里捞啥-四风格-4MB版';config.compileType='game';config.miniprogramRoot='./';fs.writeFileSync(configFile,JSON.stringify(config,null,2));
const inventory=files(client).map(f=>({file:path.relative(client,f).replaceAll('\\','/'),bytes:fs.statSync(f).size,sha256:hash(f)}));
const game=JSON.parse(fs.readFileSync(path.join(client,'game.json'))),packages=game.subpackages.map(p=>({name:p.name,root:p.root,bytes:inventory.filter(f=>f.file.startsWith(p.root.replace(/\/$/,'')+'/')).reduce((n,f)=>n+f.bytes,0)}));
const total=inventory.reduce((n,f)=>n+f.bytes,0),main=total-packages.reduce((n,p)=>n+p.bytes,0);assert(total<4000000,'Complete client exceeds 4 MB');assert(main<4000000,'Launch package exceeds 4 MB');
const report={build:marker,totalClientBytes:total,limitBytes:4000000,remainingBytes:4000000-total,mainPackageBytes:main,subpackages:packages,runtime,files:inventory};fs.writeFileSync(path.join(delivery,'build-report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(delivery,'导入说明.md'),[
'# 锅里捞啥 · 四风格 4MB 版','',
'微信开发者工具选择「小游戏」，导入本目录的 **wechatgame** 子文件夹。不要导入源码工程、web目录或整个交付目录。沿用 project.config.json 中的项目 AppID。','',
'完整客户端所有文件（包含全部分包）合计 **'+total.toLocaleString('en-US')+' 字节**，严格低于 4,000,000 字节；余量 '+(4000000-total).toLocaleString('en-US')+' 字节。主包 '+main.toLocaleString('en-US')+' 字节。这里统计的是解压后的全部客户端文件，不是 ZIP 压缩体积。逐文件大小和 SHA-256 见 build-report.json。','',
'保留 01/04/08/09 四套主题、连续背景、标题安全区、大牌面、七格托盘、立体按钮和微信菜单分享。背景使用 JPEG、透明 UI 图集使用索引 PNG；图集坐标按纹理尺寸换算，九宫格边框保持原有尺寸。高清素材保存在源码仓库 design/four-style-previews-20261031/production-masters，不进入微信包。','',
'通过 TypeScript、16组设备/主题的真实引擎点击检查、寄存区、取牌和资源加载检查，以及微信构建及包体积校验。尚需微信真机确认宿主胶囊、安全区、系统字体与实际分享。','',
'本目录仅包含客户端，未部署云函数；继续使用项目现有云环境。'
].join('\n')+'\n');
console.log(JSON.stringify({delivery,totalClientBytes:total,remainingBytes:4000000-total,mainPackageBytes:main,subpackages:packages},null,2));
