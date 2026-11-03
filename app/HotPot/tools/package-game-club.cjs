'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const assert = require('assert');
const repo = path.resolve(__dirname, '../../..');
const project = path.join(repo, 'app/HotPot');
const source = path.join(repo,
  'tmp/game-club-page-manager-build-20261103/app/HotPot/build/wechatgame-cloud-dev');
const output = path.join(repo, 'exports/HotPot-game-club-page-manager-20261103');
const evidence = path.join(repo, 'tmp/game-club-page-manager-verification-20261103');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const wechat = JSON.parse(fs.readFileSync(path.join(evidence, 'wechat.json'), 'utf8'));
const runtime = JSON.parse(fs.readFileSync(path.join(evidence, 'runtime.json'), 'utf8'));
const build = fs.readFileSync(path.join(project,
  'assets/scripts/core/HotPotTileSkin.ts'), 'utf8').match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
assert.equal(wechat.build, build); assert.equal(runtime.build, build);
assert.equal(wechat.mainSha256,
  hash(fs.readFileSync(path.join(source, 'subpackages/main/game.js'))));
assert.equal(runtime.checks.length, 8);
assert(wechat.suppliedOpenlinkConfigured && runtime.suppliedOpenlinkConfigured);
assert.equal(runtime.errors.length, 0); assert.equal(runtime.missing.length, 0);
const client = path.join(output, 'wechatgame');
if (fs.existsSync(output)) {
  assert.equal(hash(fs.readFileSync(path.join(client, 'subpackages/main/game.js'))),
    wechat.mainSha256, 'Existing delivery belongs to another build');
} else {
  fs.cpSync(source, client, {recursive: true});
}
const projectFile = path.join(client, 'project.config.json');
const config = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
config.projectname = '锅里捞啥-游戏圈PageManager-20261103';
config.cloudfunctionRoot = '../cloudfunctions/';
config.compileType = 'game'; config.miniprogramRoot = './';
fs.writeFileSync(projectFile, JSON.stringify(config, null, 2));
fs.cpSync(path.join(project, 'cloudfunctions/hotpotPlayerDev'),
  path.join(output, 'cloudfunctions/hotpotPlayerDev'), {recursive: true,
    filter: file => !['node_modules', 'generated'].includes(path.basename(file))
      && (!fs.statSync(file).isFile() || /\.(js|json)$/i.test(file))});
function inventory(folder) {
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    assert(!entry.isSymbolicLink()); const file = path.join(folder, entry.name);
    return entry.isDirectory() ? inventory(file) : [{
      file: path.relative(client, file).replaceAll('\\', '/'),
      bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file))}];
  });
}
const files = inventory(client), bytes = files.reduce((sum, f) => sum + f.bytes, 0);
const game = JSON.parse(fs.readFileSync(path.join(client, 'game.json'), 'utf8'));
const subpackages = (game.subpackages || game.subPackages || []).map(item => ({
  name: item.name, root: item.root,
  bytes: files.filter(f => f.file.startsWith(item.root.replace(/\/$/, '') + '/'))
    .reduce((sum, f) => sum + f.bytes, 0),
}));
const mainBytes = bytes - subpackages.reduce((sum, p) => sum + p.bytes, 0);
assert(bytes < 4000000); assert(mainBytes < 2000000);
assert(subpackages.every(p => p.bytes < 2097152));
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify({build,
  totalClientBytes: bytes, mainPackageBytes: mainBytes, subpackages,
  wechat, runtime, files}, null, 2));
fs.writeFileSync(path.join(output, '导入说明.md'), [
  '# 游戏圈 PageManager 微信测试包', '', '版本：`' + build + '`。', '',
  '微信开发者工具导入本目录的 `wechatgame` 文件夹，使用现有 AppID `wx943cc2d81ec6f820`。',
  '入口：游戏首页设置 → 我的小馆 → 游戏圈。四套皮肤共用。',
  '完整客户端 ' + bytes + ' 字节，小于 4,000,000 字节。', '',
  '已通过源码类型检查、实际微信包接口模拟及真实 Cocos 网页运行检查。',
  '已配置用户从后台提供的“游戏内打开”openlink，使用 createPageManager → load → show。',
  '真实微信跳转尚未真机验收；本地模拟不作为 AppID 已开通的结论。',
  '管理员在对应 AppID 的微信公众平台 → 游戏能力地图 → 游戏圈查看基础设置与管理状态，并用有预览权限的微信账号真机测试。',
  '最低基础库 3.6.7；开发者工具选择不低于该版本，手机微信更新后测试。',
  '点击后检查能否进入锅里捞啥的游戏圈，返回后菜单、棋盘、托盘和道具保持。',
  '失败查看调试日志 [HotPot game club] PageManager failed 中的 code、errMsg、errInfo；网络、基础库或版本不匹配不等于未开通。', '',
  '本次没有新增云接口；已有云存档配套函数随包附带，游戏圈入口本身不要求重新部署。',
  '保留上一版第三关造型、888 张、50 层和旧存档处理。未上传、审核或发布小游戏。',
  '完整验证范围见仓库 doc/微信游戏圈接入-2026-11-03.md。',
].join('\n') + '\n');
console.log(JSON.stringify({output, build, bytes, mainBytes, subpackages}, null, 2));
