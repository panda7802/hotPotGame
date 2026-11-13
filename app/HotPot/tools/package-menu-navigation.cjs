'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const repo = path.resolve(__dirname, '../../..');
const project = path.join(repo, 'app/HotPot');
const built = path.join(project, 'build/wechatgame-cloud-dev');
const delivery = path.resolve(process.argv[2]
  || path.join(repo, 'exports/HotPot-fullscreen-menus-20261101'));
const marker = fs.readFileSync(path.join(project,
  'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
const runtimeRoot = path.join(repo, 'design/latest/runtime');
const runtime = JSON.parse(fs.readFileSync(
  path.join(runtimeRoot, 'verification.json'), 'utf8'));
const mobile = {build:runtime.build,
  checks:runtime.checks.filter(row=>row.width===360),errors:runtime.errors};
assert.strictEqual(runtime.build,marker,'Stale runtime verification');
assert.strictEqual(runtime.resizeOpenPage,true);
assert.strictEqual(runtime.wechatSafeArea,true);
assert.strictEqual(runtime.checks.length,8);
assert.deepStrictEqual(mobile.checks.map(row => row.style), [1, 4, 8, 9]);
assert.deepStrictEqual(runtime.errors, []);
assert.deepStrictEqual(mobile.errors, []);
for (const row of [...runtime.checks, ...mobile.checks]) {
  for (const key of ['illustratedBook','singleBackground','fixedHeaderFooter',
    'returnToParent','noCloseButtons','rankingSixRows','previewRollback']) {
    assert.strictEqual(row[key], true, key);
  }
}
const mainScript = fs.readFileSync(
  path.join(built, 'subpackages/main/game.js'), 'utf8');
for (const token of [marker, 'MenuTitlePlaque', 'MenuBrand',
  'ToolMedallion', 'BombSmoke_', 'audio/bomb','DesignHeader','DesignFooter',
  'DesignBody','CollectionBook','BookCarrot','RankingViewport']) {
  assert(mainScript.includes(token), 'Stale or incomplete build: ' + token);
}
const resourceConfig = JSON.parse(fs.readFileSync(
  path.join(built, 'subpackages/resources/config.json'), 'utf8'));
assert(Object.values(resourceConfig.paths)
  .some(entry => entry[0] === 'audio/bomb'), 'Bomb clip must be packaged');
assert(!fs.existsSync(delivery), 'Use a new delivery directory');

function files(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), 'Links are not delivery files: ' + file);
    return entry.isDirectory() ? files(file) : [file];
  });
}
const client = path.join(delivery, 'wechatgame');
fs.mkdirSync(delivery, {recursive: true});
fs.cpSync(built, client, {recursive: true});
const configFile = path.join(client, 'project.config.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
delete config.cloudfunctionRoot;
config.projectname = '锅里捞啥-全屏菜单与榜单-20261101';
config.compileType = 'game';
config.miniprogramRoot = './';
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
const inventory = files(client).map(file => ({
  file: path.relative(client, file).replaceAll('\\', '/'),
  bytes: fs.statSync(file).size,
  sha256: crypto.createHash('sha256')
    .update(fs.readFileSync(file)).digest('hex'),
}));
const game = JSON.parse(fs.readFileSync(path.join(client, 'game.json')));
const subpackages = (game.subpackages || game.subPackages || []).map(item => ({
  name: item.name,
  root: item.root,
  bytes: inventory.filter(file => file.file.startsWith(
    item.root.replace(/\/$/, '') + '/'))
    .reduce((sum, file) => sum + file.bytes, 0),
}));
const total = inventory.reduce((sum, file) => sum + file.bytes, 0);
const main = total - subpackages.reduce((sum, item) => sum + item.bytes, 0);
assert(total < 4000000, 'Complete extracted client exceeds 4,000,000 bytes');
assert(main < 2097152, 'Launch package exceeds this delivery budget');
for (const item of subpackages) {
  assert(item.bytes < 2097152, 'Subpackage exceeds budget: ' + item.name);
}
const report = {
  build: marker, totalClientBytes: total, limitBytes: 4000000,
  remainingBytes: 4000000 - total, mainPackageBytes: main,
  subpackageLimitBytes: 2097152, subpackages,
  runtime, mobile, files: inventory,
};
fs.writeFileSync(path.join(delivery, 'build-report.json'),
  JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(delivery, '导入说明.md'), [
  '# 锅里捞啥 · 全屏菜单与地域榜单更新', '',
  '微信开发者工具选择「小游戏」，导入本目录的 **wechatgame** 文件夹。',
  '保留项目原 AppID；不要将整个交付目录或源码目录作为小游戏根目录。', '',
  `版本：${marker}。`,
  `解压后完整客户端（包含所有分包）共 **${total.toLocaleString('en-US')} 字节**。`,
  `严格小于 4,000,000 字节，余量 ${4000000 - total} 字节。`,
  `主包 ${main} 字节；各分包大小及逐文件 SHA-256 见 build-report.json。`, '',
  '包含四套全屏背景、固定顶部底部及自适应中间区域、食材书册图鉴入口、',
  '无顶部关闭按钮的子页面、底部返回上一级、地域榜单奖章及我的家乡卡。',
  '图鉴从首页进入，返回回到首页；详情返回图鉴，成就/榜单/地区/换肤返回我的。',
  '保留青瓷道具布局，以及炸弹粒子和专属爆破音效。第二关规则保持不变，',
  '第三关炸弹按三张一组、单次最多十八张。', '',
  '验证：TypeScript、交互回归、四主题网页真实点击及手机尺寸检查、',
  'Cocos 微信构建和解压后包体积检查通过。尚未进行微信真机验收。', '',
  '仅交付客户端；未上传、发布小游戏或部署云函数，沿用项目现有云环境。',
].join('\n') + '\n');
console.log(JSON.stringify({delivery, totalClientBytes: total,
  remainingBytes: 4000000 - total, mainPackageBytes: main,
  subpackages}, null, 2));
