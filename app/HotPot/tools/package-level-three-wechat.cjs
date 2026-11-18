'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const repo = path.resolve(__dirname, '../../..');
const root = path.join(repo, 'app/HotPot');
const build = path.join(root, 'build/wechatgame-cloud-dev');
const delivery = path.join(repo, 'exports/HotPot-level3-wechat-fix-20261102');
const marker = fs.readFileSync(path.join(root,
  'assets/scripts/core/HotPotTileSkin.ts'), 'utf8')
  .match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
const runtime = JSON.parse(fs.readFileSync(path.join(repo,
  'tmp/level3-wechat-fix-20261102/wechat-domain-verification.json'), 'utf8'));
const main = fs.readFileSync(path.join(build, 'subpackages/main/game.js'));
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
assert.strictEqual(runtime.build, marker);
assert.strictEqual(runtime.mainSha256, hash(main), 'Stale package validation');
assert.strictEqual(runtime.checks.length, 3);
assert(runtime.legacyUntouchedUpgrade && runtime.progressedSavePreserved);
assert(!fs.existsSync(delivery), 'Use a new delivery directory');
const client = path.join(delivery, 'wechatgame');
fs.mkdirSync(delivery, {recursive: true});
fs.cpSync(build, client, {recursive: true});
const projectFile = path.join(client, 'project.config.json');
const config = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
config.projectname = '锅里捞啥-第三关新版-20261102';
config.cloudfunctionRoot = '../cloudfunctions/';
config.compileType = 'game';
config.miniprogramRoot = './';
fs.writeFileSync(projectFile, JSON.stringify(config, null, 2));
const cloudSource = path.join(root, 'cloudfunctions/hotpotPlayerDev');
const cloudOutput = path.join(delivery, 'cloudfunctions/hotpotPlayerDev');
fs.cpSync(cloudSource, cloudOutput, {recursive: true,
  filter: file => !['node_modules', 'generated'].includes(path.basename(file))
    && (!fs.statSync(file).isFile() || /\.(js|json)$/i.test(file))});
function inventory(folder) {
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    assert(!entry.isSymbolicLink());
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? inventory(file) : [{
      file: path.relative(delivery, file).replaceAll('\\', '/'),
      bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file))}];
  });
}
const clientFiles = inventory(client);
const total = clientFiles.reduce((sum, file) => sum + file.bytes, 0);
const game = JSON.parse(fs.readFileSync(path.join(client, 'game.json'), 'utf8'));
const subpackages = (game.subpackages || game.subPackages || []).map(item => ({
  name: item.name, root: item.root,
  bytes: clientFiles.filter(file => file.file.startsWith(
    'wechatgame/' + item.root.replace(/\/$/, '') + '/'))
    .reduce((sum, file) => sum + file.bytes, 0),
}));
const launch = total - subpackages.reduce((sum, item) => sum + item.bytes, 0);
assert(total < 4000000, 'Complete client exceeds 4 MB');
assert(launch < 2097152);
for (const item of subpackages) assert(item.bytes < 2097152);
const report = {build: marker, totalClientBytes: total,
  remainingBytes: 4000000 - total, mainPackageBytes: launch,
  subpackages, runtime, files: [...clientFiles, ...inventory(cloudOutput)]};
fs.writeFileSync(path.join(delivery, 'build-report.json'),
  JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(delivery, '导入说明.md'), [
  '# 第三关微信包修复 · 2026-11-02', '',
  '微信开发者工具导入本目录下的 **wechatgame** 文件夹。',
  '使用项目现有 AppID，不要继续导入旧 HotPot-tray-fix 包。', '',
  `版本：${marker}；完整客户端 ${total} 字节，小于 4,000,000 字节。`, '',
  '- 第三关：菱形、花形、蝶形随机切换，888 张、50 层、放大牌面。',
  '- 未取牌、未用道具的旧第三关自动更新为新版。',
  '- 已玩的旧第三关保留进度，点击“重新开始”并确认后使用新版。',
  '- 控制台核对版本；hotpot-build.json 也记录客户端版本。',
  '- 已从实际微信分包执行三种造型、完整解法、存档恢复和云函数模块兼容检查。', '',
  '## 云存档配套', '',
  '本目录附带 cloudfunctions/hotpotPlayerDev，微信开发者工具已配置该目录。',
  '如果线上云函数尚未更新到第三关新版，右键此函数，选择上传并部署、云端安装依赖。',
  '仅更新项目现有开发环境中的 hotpotPlayerDev，不需要重建数据库。',
  '旧云函数不识别新版种子，因此使用云存档时客户端与函数应配套更新。', '',
  '本次只生成本地交付包，未上传、发布小游戏或部署云函数。尚未真机验收。',
  '逐文件校验、包体积与运行验证见 build-report.json。',
].join('\n') + '\n');
console.log(JSON.stringify({delivery, build: marker, totalClientBytes: total,
  mainPackageBytes: launch, subpackages}, null, 2));
