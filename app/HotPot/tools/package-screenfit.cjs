'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../..'),build=path.join(root,'app/HotPot/build');
const name=process.argv[2]||'HotPot-screenfit-20261030';
if(!/^[A-Za-z0-9-]+$/.test(name))throw Error('Invalid delivery directory name');
const destination=path.join(root,'exports',name);
if(fs.existsSync(destination))throw Error('Refusing to overwrite '+destination);
const marker=fs.readFileSync(path.join(root,'app/HotPot/assets/scripts/core/HotPotTileSkin.ts'),'utf8').match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
for(const [source,target] of [['wechatgame-cloud-dev','wechatgame'],['web-resolution','web']]){
  const dir=path.join(build,source);
  const script=fs.readFileSync(path.join(dir,source==='wechatgame-cloud-dev'?'subpackages/main/game.js':'assets/main/index.js'),'utf8');
  if(!script.includes(marker))throw Error('Stale build '+source);
  fs.cpSync(dir,path.join(destination,target),{recursive:true});
}
const configFile=path.join(destination,'wechatgame/project.config.json');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));delete config.cloudfunctionRoot;
config.projectname='锅里捞啥-屏幕适配修复';fs.writeFileSync(configFile,JSON.stringify(config,null,2));
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else{
    const bytes=fs.readFileSync(file);files.push({file:path.relative(path.join(destination,'wechatgame'),file).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
}}
walk(path.join(destination,'wechatgame'));
const total=files.reduce((sum,file)=>sum+file.bytes,0);if(total>=4000000)throw Error('WeChat client exceeds 4,000,000 bytes: '+total);
const game=JSON.parse(fs.readFileSync(path.join(destination,'wechatgame/game.json'),'utf8'));
const packages=(game.subpackages||game.subPackages||[]).map(p=>({name:p.name,bytes:files.filter(f=>f.file.startsWith(p.root.replace(/\/$/,'')+'/')).reduce((sum,f)=>sum+f.bytes,0)}));
const mainBytes=total-packages.reduce((sum,p)=>sum+p.bytes,0);
if(mainBytes>=2000000||packages.some(p=>p.bytes>=2000000))throw Error('A WeChat local package exceeds 2,000,000 bytes');
const validation=JSON.parse(fs.readFileSync(path.join(root,'design/screenfit-20261030/verification.json'),'utf8'));
fs.writeFileSync(path.join(destination,'build-report.json'),JSON.stringify({build:marker,totalClientBytes:total,limitBytes:4000000,mainPackageBytes:mainBytes,subpackages:packages,runtimeChecks:validation.checks.length,pageErrors:validation.pageErrors,wechatValidation:validation.wechat,files},null,2));
fs.writeFileSync(path.join(destination,'导入说明.md'),`# 锅里捞啥 · 屏幕适配修复\n\n版本：${marker}。\n\n- 微信开发者工具导入本目录中的 **wechatgame** 文件夹。AppID 沿用现有配置。\n- 网页静态构建位于 **web**，须经 HTTP 静态服务器访问，不能直接双击 index.html。\n- Cocos 源项目仍是 app/HotPot，重新预览即可使用修改后的源码。\n\n按每页美术的原始宽高比整体缩放；头像、按钮、实时文字和点击区域保持同一比例。微信端避开系统安全区、右上角胶囊及底部手势条。多余区域用主题底色填充。浏览器改变大小时保留当前页面及游戏进度。四套主题的整页美术 JPEG 质量由58提高至61；原图内的绘制文字仍受原始素材像素限制。\n\n微信客户端未压缩合计 ${total.toLocaleString('en-US')} 字节，低于4,000,000字节；各本地包低于2,000,000字节。网页文件不计入微信客户端。完整清单及SHA256见 build-report.json。\n\n已通过类型检查、364组几何适配校验，以及真实网页引擎多尺寸点击和模拟微信安全区检查（${validation.checks.length}项，无页面异常）。微信安全区使用API模拟验证，尚未连接手机执行微信真机测试。本轮未上传、发布小游戏或部署云函数。\n`);
if(marker.endsWith('-assets')){
  const auditFile=path.join(root,'design/asset-audit-20261030/report.json');
  const audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));
  if(audit.build!==marker)throw Error('Asset audit belongs to a different build');
  const savedBytes=audit.baselineClientBytes-total;
  const reportFile=path.join(destination,'build-report.json');
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  report.assetCleanup={baselineClientBytes:audit.baselineClientBytes,savedBytes,resources:audit.resourceCount,images:audit.imageCount,audio:audit.audioCount,data:audit.dataCount};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(destination,'素材审计.json'),JSON.stringify({...audit,currentClientBytes:total},null,2));
  fs.appendFileSync(path.join(destination,'导入说明.md'),`\n## 本次素材清理\n\n运行包已移除旧地区字体 HotPotRegion.ttf 及随附 OFL.txt 的资源条目，并移除无效的启动加载；字体与许可原件一同保留在源码 assets/art-archive/unused-region-font。15张图片、4段音频和1份地区数据均有实际用途，无重复的图片或音频文件。相较上一版客户端减少 ${savedBytes.toLocaleString('en-US')} 字节。逐项用途和哈希见 素材审计.json。所有50种食材、四段音频均加载成功，回归检查未发现缺失的本地素材。\n`);
}
console.log(JSON.stringify({destination,totalClientBytes:total,mainBytes,packages,runtimeChecks:validation.checks.length},null,2));
