'use strict';
// Export the current verified Creator build as a normal WeChat subpackage project.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const assert = require('assert');
const {execFileSync} = require('child_process');
const {inspectWechatPackages} = require('./wechat-package-budget.cjs');
const repo = path.resolve(__dirname, '../../..');
const project = path.join(repo, 'app/HotPot');
const source = path.resolve(process.argv[2] || path.join(project, 'build/wechatgame-cloud-dev'));
const output = path.resolve(process.argv[3] || path.join(repo, 'exports/HotPot-subpackages-20261104'));
assert.strictEqual(path.dirname(output), path.join(repo, 'exports'), 'Export must be directly inside exports');
assert(!fs.existsSync(output), 'Do not overwrite an earlier delivery');
const validationFile = path.join(project, 'temp/wechat-subpackages-validation.json');
execFileSync(process.execPath, [path.join(__dirname, 'validate-wechat-lossless.cjs'),
  source, validationFile], {stdio: 'inherit'});
const verification = JSON.parse(fs.readFileSync(validationFile, 'utf8'));
const client = path.join(output, 'wechatgame');
fs.cpSync(source, client, {recursive: true});
const configFile = path.join(client, 'project.config.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
config.projectname = 'HotPot-Subpackages';
config.cloudfunctionRoot = '../cloudfunctions/';
config.compileType = 'game';
config.miniprogramRoot = './';
fs.writeFileSync(configFile, JSON.stringify(config));
fs.cpSync(path.join(project, 'cloudfunctions/hotpotPlayerDev'),
  path.join(output, 'cloudfunctions/hotpotPlayerDev'), {recursive: true,
    filter: file => !['node_modules', 'generated'].includes(path.basename(file))
      && (!fs.statSync(file).isFile() || /\.(js|json)$/i.test(file))});
const budget = inspectWechatPackages(client);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function inventory(folder) {
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    assert(!entry.isSymbolicLink());
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? inventory(file) : [{
      file: path.relative(client, file).replaceAll('\\', '/'),
      bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file))}];
  });
}
const files = inventory(client);
assert.strictEqual(hash(fs.readFileSync(path.join(client, 'subpackages/main/game.js'))),
  verification.mainSha256);
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify({
  build: verification.build, ...budget, verification, files,
  wechatUpload: {status: 'not-executed', note: '本地验证不能代替微信服务器上传校验。'},
}, null, 2));
fs.writeFileSync(path.join(output, '导入说明.md'), [
  '# 锅里捞啥：微信小游戏分包版', '',
  `导入本目录中的 wechatgame 文件夹；${budget.packages.length} 个分包随主包一起由微信开发者工具上传，不需要自行部署 CDN。`,
  `当前主包 ${budget.mainBytes} 字节；全部文件合计 ${budget.bytes} 字节。`,
  '主包采用严格小于 4,000,000 字节的预算，主包和分包合计采用独立的 30,000,000 字节项目预算。',
  '整个客户端超过 4MB 不再触发项目构建失败。分包声明及 game.js 入口已校验。', '',
  '## 构建、上传、发布', '',
  '1. 使用 Creator 3.8.8 打开 app/HotPot，更新代码后重启 Creator 以刷新构建扩展。',
  '2. 构建发布导入 tools/wechat-cloud-dev.build.json；平台为微信小游戏，发布包名称为 wechatgame-cloud-dev，主包压缩类型为小游戏分包。',
  '3. 构建成功后，微信开发者工具打开 build/wechatgame-cloud-dev；使用本导出时则打开本目录中的 wechatgame。',
  '4. 检查模拟器、预览及真机运行后，点击右上角上传，填写下一版本号和备注。',
  '5. 上传成功后，在微信公众平台的版本管理中按现有流程提交审核、审核通过后发布。', '',
  '源工程 build/wechatgame-cloud-dev 的 cloudfunctionRoot 为 ../../cloudfunctions/；本导出的配套云函数放在 ../cloudfunctions/。',
  '对局协议 7 须配套支持珍藏图鉴的 hotpotPlayerDev。当前保底使用已有的图鉴发现记录，未收录任何珍藏时生效；不再依赖首次进入第三关标记。',
  '打包阶段保持图片和音频源文件字节；通关图已按手机尺寸压缩，文字和按钮仍实时渲染。保留 60 种食材、重开规则、图鉴全开和游戏圈入口。',
  'Creator 构建、包内逻辑、媒体一致性及分包检查已验证；实际微信上传、审核和线上发布状态另行记录。',
  '逐文件字节数和 SHA-256 见 build-report.json；报告及云函数放在小游戏导入目录外。', '',
].join('\n'));
console.log(JSON.stringify({output, build: verification.build, ...budget}, null, 2));
