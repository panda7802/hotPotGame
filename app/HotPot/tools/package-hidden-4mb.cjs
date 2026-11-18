'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const assert = require('assert');
const repo = path.resolve(__dirname, '../../..');
const project = path.join(repo, 'app/HotPot');
const isolated = path.join(repo, 'tmp/hidden-ingredients-build-20261103/app/HotPot');
const source = path.join(isolated, 'build/wechatgame-cloud-dev');
const evidence = path.join(repo, 'tmp/hidden-ingredients-verification-20261103');
const output = path.join(repo, 'exports/HotPot-hidden-4mb-20261103');
const build = fs.readFileSync(path.join(project, 'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const verification = JSON.parse(fs.readFileSync(path.join(evidence, 'wechat-lossless-validation.json')));
const runtime = JSON.parse(fs.readFileSync(path.join(evidence, 'runtime-checks.json')));
const club = JSON.parse(fs.readFileSync(path.join(evidence, 'wechat-game-club.json')));
const domain = JSON.parse(fs.readFileSync(path.join(evidence, 'wechat-domain-verification.json')));
const optimization = JSON.parse(fs.readFileSync(path.join(isolated, 'temp/wechat-lossless-optimization.json')));
for (const report of [verification, runtime, club, domain]) assert.strictEqual(report.build, build);
const mainHash = hash(fs.readFileSync(path.join(source, 'subpackages/main/game.js')));
for (const report of [verification, club, domain]) assert.strictEqual(report.mainSha256, mainHash);
assert(optimization.optimizerVersion === 3 && optimization.savedBytes > 28000);
assert(optimization.mediaByteIdentical && verification.mediaByteIdentical);
assert(runtime.checks.length === 8 && !runtime.errors.length && !runtime.missing.length);
assert(runtime.checks.every(item => item.allOpen));
assert(runtime.formattedShaderStages > 0 && runtime.shaderErrors.length === 0);
assert(!fs.existsSync(output), 'Do not overwrite an earlier delivery');
const client = path.join(output, 'wechatgame');
fs.cpSync(source, client, {recursive: true});
const configFile = path.join(client, 'project.config.json');
const config = JSON.parse(fs.readFileSync(configFile));
config.projectname = 'HotPot-hidden-4mb';
config.cloudfunctionRoot = '../cloudfunctions/';
config.compileType = 'game';config.miniprogramRoot = './';
fs.writeFileSync(configFile, JSON.stringify(config));
fs.cpSync(path.join(project, 'cloudfunctions/hotpotPlayerDev'),
  path.join(output, 'cloudfunctions/hotpotPlayerDev'), {recursive: true,
    filter: file => !['node_modules', 'generated'].includes(path.basename(file))
      && (!fs.statSync(file).isFile() || /\.(js|json)$/i.test(file))});
function inventory(folder) {
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    assert(!entry.isSymbolicLink());const file = path.join(folder, entry.name);
    return entry.isDirectory() ? inventory(file) : [{
      file: path.relative(client, file).replaceAll('\\', '/'),
      bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file))}];
  });
}
const files = inventory(client), bytes = files.reduce((sum, file) => sum + file.bytes, 0);
assert(bytes < 4000000, 'Final imported client exceeds the complete-client budget');
const game = JSON.parse(fs.readFileSync(path.join(client, 'game.json')));
const packages = (game.subpackages || game.subPackages || []).map(item => ({
  name: item.name, root: item.root,
  bytes: files.filter(file => file.file.startsWith(item.root)).reduce((sum, file) => sum + file.bytes, 0),
}));
const mainBytes = bytes - packages.reduce((sum, item) => sum + item.bytes, 0);
assert.strictEqual(hash(fs.readFileSync(path.join(client, 'subpackages/main/game.js'))), mainHash);
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify({build,
  budgetBytes: 4000000, totalClientBytes: bytes, mainPackageBytes: mainBytes,
  budgetRemainingBytes: 4000000 - bytes, subpackages: packages,
  beforeClientBytes: 4066982, savedClientBytes: 4066982 - bytes,
  verification, optimization, runtime, club, domain, files}, null, 2));
fs.writeFileSync(path.join(output, '导入说明.md'), [
  '# 锅里捞啥：60 种食材 / 微信完整客户端 4MB 内', '',
  '版本：`' + build + '`。', '',
  '微信开发者工具导入本目录下的 `wechatgame` 文件夹，使用现有 AppID。',
  '完整客户端为 ' + bytes + ' 字节（含主包及全部分包），低于 4,000,000 字节。主包为 ' + mainBytes + ' 字节。',
  '图片与音频未经重新编码，24 个在用源媒体文件与包内文件 SHA-256 完全一致。',
  '压缩方式：排除从未绘制的旧牌面图集及无用纹理代码；微信适配脚本与启动代码压缩；GLSL 只去除冗余格式并验证词元一致，宏指令行保留。',
  '旧牌面原图及 .meta 保留在源码 art-source/retired-tiles-20261103。', '',
  '## 功能与配套云函数', '',
  '- 保留 50 种普通 + 10 种珍藏，仅第三关出现珍藏，珍藏/普通每种抽取权重 1:10。',
  '- 手动重开保留食材和数量，只重排布局；失败、通关后开新局或每日刷新才重抽。',
  '- 后门有“图鉴全开”，保存全部 60 种发现记录。保留游戏圈 PageManager 入口。',
  '- 对局协议为 7，食材池为版本 4；先部署本目录 cloudfunctions/hotpotPlayerDev（安装云端依赖），再预览新版客户端。', '',
  '## 验证状态', '',
  '- 已通过 Creator 3.8.8 微信构建、包体预算、包内域逻辑、游戏圈接口模拟及媒体一致性检查。',
  '- 网页四主题 × 两种屏幕尺寸的图鉴全开、食材入槽、重开、失败、通关和跨日行为通过；同样的 GLSL 格式压缩经过真实 WebGL 运行复验。',
  '- 未执行远程云函数部署、微信真机操作、提审或发布；本地检查不能替代真实微信能力验收。',
  '- 报告见 build-report.json。云函数、说明与报告位于小游戏导入目录之外，不混入客户端大小。',
].join('\n') + '\n');
console.log(JSON.stringify({output, build, bytes, mainBytes,
  budgetRemainingBytes: 4000000 - bytes, subpackages: packages}, null, 2));
