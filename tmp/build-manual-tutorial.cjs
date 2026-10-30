'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const project = path.join(root, 'app/HotPot');
const dest = path.join(root, 'doc/手动开发教程配套');
const checkRoot = path.join(root, 'tmp/manual-tutorial-check');
const ts = require('D:/ProgramData/cocos/editor/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript');
const manifest = [];
const frozen = new Map();
function take(rel, bytes) {
  if (bytes === undefined) bytes = fs.readFileSync(path.join(project, rel));
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes, 'utf8');
  frozen.set(rel, bytes);
  manifest.push({path:rel, bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  const target = path.join(checkRoot, 'app/HotPot', rel);
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, bytes);
}
for (const folder of ['data', 'core']) {
  for (const name of fs.readdirSync(path.join(project, 'assets/scripts', folder)).filter(n=>n.endsWith('.ts')).sort()) take('assets/scripts/'+folder+'/'+name);
}
for (const name of ['index.js','handler.js','request-context.js','leaderboard.js','runtime-config.js','package.json','package-lock.json','config.json','settings.json']) take('cloudfunctions/hotpotPlayerDev/'+name);
for (const name of ['RuntimeConfig','GameConfig','GameData','PlayerTypes','RegionData','PlayerData']) {
  const source = frozen.get('assets/scripts/data/'+name+'.ts').toString('utf8');
  const result = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019},fileName:name+'.ts',reportDiagnostics:true});
  if(result.diagnostics.length) throw Error(name+' failed transpilation');
  take('cloudfunctions/hotpotPlayerDev/'+name+'.js', result.outputText);
}
const regions = fs.readFileSync(path.join(root,'doc/res/regions.json'));
take('cloudfunctions/hotpotPlayerDev/regions.json', regions);
for(const name of ['prepare-cloud.cjs','typecheck.cjs','validate-levels.cjs','validate-player-save.cjs','validate-tray-animation.cjs','validate-runtime-config.cjs','validate-mobile-performance.cjs','validate-reference-layout.cjs']) take('tools/'+name);
for(const rel of ['tsconfig.json','settings/v2/packages/project.json','settings/v2/packages/engine.json']) take(rel);
function walk(dir) {
  for(const entry of fs.readdirSync(path.join(project,dir),{withFileTypes:true})) {
    const rel=dir+'/'+entry.name;
    if(entry.isDirectory())walk(rel);
    else if(!entry.name.endsWith('.meta')) {
      const bytes=rel==='assets/resources/data/regions.json'?regions:fs.readFileSync(path.join(project,rel));
      take(rel,bytes);
      const output=path.join(dest,'素材',rel.slice('assets/resources/'.length));
      fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);
    }
  }
}
walk('assets/resources');
fs.mkdirSync(path.join(checkRoot,'doc/res'),{recursive:true});
fs.writeFileSync(path.join(checkRoot,'doc/res/regions.json'),regions);
fs.mkdirSync(dest,{recursive:true});
function appendix(name,title,filter) {
  const entries=[...frozen].filter(([rel])=>filter(rel));
  const text=['# '+title,'','本附录是 2026-10-30 手动教程的固定参考代码。每个二级标题是相对于新建 Cocos 工程 `app/HotPot` 的保存路径。','',
  '在 VS Code 中逐个创建同名文件，只复制代码围栏内部的内容，不复制围栏和标题。内容完整，不需要让 AI 补全。脚本 `.meta` 由新工程的 Creator 自动生成。','',
  ...entries.flatMap(([rel,bytes])=>['## '+rel,'','````'+(rel.endsWith('.json')?'json':rel.endsWith('.ts')?'typescript':'javascript'),bytes.toString('utf8').replace(/\r\n/g,'\n').replace(/\n$/,''),'````',''])].join('\n');
  fs.writeFileSync(path.join(dest,name),text,'utf8');
  return {name,files:entries.length};
}
const results=[
  appendix('01-数据层完整代码.md','数据层完整代码',r=>r.startsWith('assets/scripts/data/')),
  appendix('02-客户端完整代码.md','客户端完整代码',r=>r.startsWith('assets/scripts/core/')),
  appendix('03-云函数完整代码.md','云函数完整代码',r=>r.startsWith('cloudfunctions/')),
  appendix('04-校验工具与工程设置.md','校验工具与工程设置',r=>r.startsWith('tools/')||r.startsWith('settings/')||r==='tsconfig.json'),
];
fs.writeFileSync(path.join(dest,'文件清单.json'),JSON.stringify({date:'2026-10-30',creator:'3.8.8',note:'云端六个共享 JS 从本教程冻结 TS 转译；未进行任何云部署。文件路径相对于 app/HotPot。',appendices:results,files:manifest},null,2)+'\n');
console.log(JSON.stringify({appendices:results,files:manifest.length,checkRoot},null,2));
