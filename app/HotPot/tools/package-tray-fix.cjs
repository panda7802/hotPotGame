'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const repo = path.resolve(__dirname, '../../..');
const project = path.join(repo, 'app/HotPot');
const built = path.resolve(process.argv[2] || path.join(repo,
  'tmp/tray-build-20261102/app/HotPot/build/wechatgame-cloud-dev'));
const delivery = path.join(repo, 'exports/HotPot-tray-fix-20261102');
const marker = fs.readFileSync(path.join(project,
  'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
const runtime = JSON.parse(fs.readFileSync(path.join(repo,
  'tmp/tray-fix-20261102/verification.json'), 'utf8'));
assert.strictEqual(runtime.build, marker);
assert.strictEqual(runtime.checks.length, 8);
assert.deepStrictEqual(runtime.errors, []);
assert.deepStrictEqual(runtime.missing, []);
for (const row of runtime.checks) {
  for (const key of ['adopted', 'imagePreserved', 'matchedOriginals',
    'slotReuse', 'bReuse', 'secondAdopted', 'renderReuse',
    'secondImageReuse', 'effectsGone']) {
    assert.strictEqual(row[key], true, key);
  }
  assert(row.samples.some(s => s.flying && !s.matched
    && Math.abs(s.x) < .01), 'B must move before A lands');
}
const main = fs.readFileSync(path.join(built,
  'subpackages/main/game.js'), 'utf8');
assert(main.includes(marker) && main.includes('FoodVisual'), 'Stale build');
assert(!fs.existsSync(delivery), 'Use a new delivery directory');
const client = path.join(delivery, 'wechatgame');
fs.mkdirSync(delivery, {recursive:true});
fs.cpSync(built, client, {recursive:true});
const configFile = path.join(client, 'project.config.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
delete config.cloudfunctionRoot;
config.projectname = '锅里捞啥-托盘动画修复-20261102';
config.compileType = 'game';
config.miniprogramRoot = './';
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
function files(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink());
    return entry.isDirectory() ? files(file) : [file];
  });
}
const inventory = files(client).map(file => ({
  file:path.relative(client, file).replaceAll('\\', '/'),
  bytes:fs.statSync(file).size,
  sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
}));
const game = JSON.parse(fs.readFileSync(path.join(client, 'game.json')));
const subpackages = (game.subpackages || game.subPackages || []).map(item => ({
  name:item.name, root:item.root,
  bytes:inventory.filter(file => file.file.startsWith(
    item.root.replace(/\/$/, '') + '/')).reduce((n, file) => n + file.bytes, 0),
}));
const total = inventory.reduce((n, file) => n + file.bytes, 0);
const launch = total - subpackages.reduce((n, item) => n + item.bytes, 0);
assert(total < 4000000, 'Complete client exceeds 4 MB');
assert(launch < 2097152);
for (const item of subpackages) assert(item.bytes < 2097152);
const report = {build:marker, totalClientBytes:total,
  remainingBytes:4000000-total, mainPackageBytes:launch,
  subpackages, runtime, files:inventory};
fs.writeFileSync(path.join(delivery, 'build-report.json'),
  JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(delivery, '导入说明.md'), [
  '# 托盘动画修复 · 2026-11-02', '',
  '微信开发者工具选择小游戏，导入本目录下的 **wechatgame** 文件夹。',
  '使用项目现有 AppID。', '',
  `版本：${marker}。完整客户端 ${total} 字节，小于 4,000,000 字节。`, '',
  '- 食材飞入后继续使用原牌面与图片，托盘槽位和其他食材不再整排重建。',
  '- AAB 加入 A：B 先右移到第 4 格，A 落入第 3 格后，三个 A 再消除。',
  '- 保留消除后的左移补位和动画期间继续点击。',
  '- 四主题 × 两种手机尺寸的真实引擎检查及现有玩法回归通过。', '',
  '本次仅构建本地客户端，未发布小游戏或部署云函数。尚未微信真机验收。',
  '逐文件校验值、包大小和运行检查见 build-report.json。',
].join('\n') + '\n');
console.log(JSON.stringify({delivery,totalClientBytes:total,
  remainingBytes:4000000-total,mainPackageBytes:launch,subpackages}, null, 2));
