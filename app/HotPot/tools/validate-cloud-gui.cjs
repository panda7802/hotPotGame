'use strict';
// Exercises build hooks' shared logic in an isolated fixture; never launches
// Creator or WeChat.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {prepareCloud, loadTypeScript} = require('./prepare-cloud.cjs');
const {
  BRANCH,
  assertBranch,
  assertBuildOptions,
  assertDestination,
  finalizeCloudBuild,
} = require('./cloud-build-pipeline.cjs');
const project = path.resolve(__dirname, '..');
const config = require('./wechat-cloud-dev.build.json');
/**
 * 通过 JSON 创建可序列化数据的深拷贝。
 */
const clone = (value) => JSON.parse(JSON.stringify(value));
const ts = loadTypeScript();
const fixtureParent = path.join(project, 'temp');
const fixture = fs.mkdtempSync(
  path.join(fixtureParent, 'cloud-gui-validation-'),
);
const root = path.join(fixture, 'app', 'HotPot');
const build = path.join(root, 'build', config.outputName);
/**
 * 更新 write 对应的状态。
 */
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, value);
};
/**
 * 为测试场景提供 copy 所需的模拟行为。
 */
const copy = (src, dest) => write(dest, fs.readFileSync(src));
/**
 * 读取并解析 JSON 文件，兼容 UTF-8 BOM。
 */
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
try {
  assertBranch(project);
  assertBuildOptions(root, config);
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  assertBranch(root, () => BRANCH);
  /**
   * 验证非法输入会被正确拒绝。
   */
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  assert.throws(() => assertBranch(root, () => 'main'), /分支/);
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  for (const change of [
    (c) => (c.outputName = 'wechatgame'),
    (c) => (c.outputName = 'wechatgame-001'),
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    (c) => (c.outputName = 'wechatgame-cloud-dev-001'),
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    (c) => (c.buildPath = '../build'),
    (c) => (c.buildMode = 'script'),
    (c) => (c.mainBundleIsRemote = true),
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    /**
     * 为测试提供当前调用所需的回调行为。
     */
    (c) => (c.packages.wechatgame.appid = 'wrong'),
    (c) => (c.overwriteProjectSettings.includeModules.mask = 'off'),
  ]) {
    const invalid = clone(config);
    change(invalid);
    /**
     * 验证非法输入会被正确拒绝。
     */
    assert.throws(() => assertBuildOptions(root, invalid));
  }
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(
    () => assertDestination(root, path.join(root, 'build/wechatgame')),
    /拒绝/,
  );
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() => assertDestination(root, undefined), /拒绝/);
  for (const name of [
    'CloudConfig',
    'GameConfig',
    'GameData',
    'PlayerTypes',
    'RegionData',
    'PlayerData',
  ]) {
    copy(
      path.join(project, 'assets/scripts/data', name + '.ts'),
      path.join(root, 'assets/scripts/data', name + '.ts'),
    );
  }
  const regionSource = path.join(fixture, 'doc/res/regions.json');
  copy(path.resolve(project, '../../doc/res/regions.json'), regionSource);
  const prepared = prepareCloud({root, ts, requireEnabled: true});
  assert.strictEqual(prepared.enabled, true);
  assert(
    fs.existsSync(
      path.join(root, 'cloudfunctions/hotpotPlayerDev/PlayerData.js'),
    ),
  );
  assert.strictEqual(
    typeof require(
      path.join(root, 'cloudfunctions/hotpotPlayerDev/PlayerData.js'),
    ).validatePlayerState,
    'function',
  );
  const clientRegions = path.join(root, 'assets/resources/data/regions.json');
  const before = fs.readFileSync(clientRegions, 'utf8');
  assert.strictEqual(
    before,
    fs.readFileSync(
      path.join(root, 'cloudfunctions/hotpotPlayerDev/regions.json'),
      'utf8',
    ),
  );
  write(regionSource, '[{"code":"X","name":"甲"},{"code":"X","name":"乙"}]');
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() => prepareCloud({root, ts, requireEnabled: true}), /地区/);
  assert.strictEqual(
    fs.readFileSync(clientRegions, 'utf8'),
    before,
    'invalid regions must not overwrite the bundled tree',
  );

  // Use genuine existing compiled JS as a fixture without changing its original
  // directory.
  for (const file of [
    'cocos-js/cc.js',
    'subpackages/main/game.js',
    'game.js',
  ]) {
    copy(
      path.join(project, 'build/wechatgame-cloud-dev', file),
      path.join(build, file),
    );
  }
  write(
    path.join(build, 'project.config.json'),
    JSON.stringify({appid: 'old', compileType: 'game'}),
  );
  write(
    path.join(build, 'game.json'),
    JSON.stringify({deviceOrientation: 'portrait'}),
  );
  copy(
    path.join(project, 'build-templates/wechatgame/first-screen.js'),
    path.join(root, 'build-templates/wechatgame/first-screen.js'),
  );
  write(
    path.join(build, 'src/settings.json'),
    JSON.stringify({
      splashScreen: {
        totalTime: 2000,
        logo: {type: 'default'},
      },
    }),
  );
  const result = finalizeCloudBuild({root, build});
  assert.strictEqual(result.environment, prepared.environmentId);
  assert.strictEqual(readJson(path.join(build, 'game.json')).cloud, true);
  assert.strictEqual(
    readJson(path.join(build, 'project.config.json')).appid,
    prepared.appId,
  );
  assert.strictEqual(
    readJson(path.join(build, 'project.config.json')).cloudfunctionRoot,
    '../../cloudfunctions/',
  );
  assert.strictEqual(
    readJson(path.join(build, 'src/settings.json')).splashScreen.totalTime,
    0,
  );
  assert.strictEqual(
    readJson(path.join(build, 'src/settings.json')).splashScreen.logo.type,
    'none',
  );
  assert.strictEqual(
    fs.readFileSync(path.join(build, 'first-screen.js'), 'utf8'),
    fs.readFileSync(
      path.join(project, 'build-templates/wechatgame/first-screen.js'),
      'utf8',
    ),
  );
  assert.strictEqual(
    finalizeCloudBuild({root, build}).bytes,
    result.bytes,
    'CLI and GUI finalization must be idempotent',
  );
  assert.strictEqual(
    (
      fs
        .readFileSync(path.join(build, 'game.js'), 'utf8')
        .match(/HotPot cloud target/g) || []
    ).length,
    1,
  );
  const mainFile = path.join(build, 'subpackages/main/game.js');
  const main = fs.readFileSync(mainFile, 'utf8');
  write(mainFile, main.replaceAll(prepared.environmentId, 'wrong-environment'));
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() => finalizeCloudBuild({root, build}), /environment/);
  write(mainFile, main);
  const engineFile = path.join(build, 'cocos-js/cc.js');
  const engine = fs.readFileSync(engineFile, 'utf8');
  write(engineFile, engine.replace(/\bMask\s*:/g, 'MissingMask:'));
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() => finalizeCloudBuild({root, build}), /Mask/);
  write(engineFile, engine);
  write(path.join(build, 'oversize.bin'), Buffer.alloc(4000000));
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() => finalizeCloudBuild({root, build}), /4 MB/);
  const hooks = require('../extensions/hotpot-cloud-build/hooks.js');
  assert.strictEqual(hooks.throwError, true);
  assert.strictEqual(typeof hooks.onBeforeBuild, 'function');
  assert.strictEqual(typeof hooks.onAfterBuild, 'function');
  const rule = require('../extensions/hotpot-cloud-build/builder.js').configs
    .wechatgame.verifyRuleMap.cloudDevelopmentTarget;
  assert.strictEqual(rule.func(true, config), true);
  const diagnostics = [];
  const originalError = console.error;
  try {
    /**
     * 为测试场景提供 error 所需的模拟行为。
     */
    console.error = (message) => diagnostics.push(message);
    assert.strictEqual(
      rule.func(true, {...config, outputName: 'wechatgame-001'}),
      false,
    );
    // Creator may retain the task name while appending a suffix to the actual
    // output.
    assert.strictEqual(
      rule.func(true, {...config, outputName: 'wechatgame-cloud-dev-001'}),
      false,
    );
  } finally {
    console.error = originalError;
  }
  /**
   * 按条件筛选或判断条目：message.includes('wechatgame-cloud-dev-001') && message.incl。
   */
  assert(
    diagnostics.some(
      (message) =>
        message.includes('wechatgame-cloud-dev-001') &&
        message.includes('不要只改任务名'),
    ),
    'GUI validation must report the actual output name and how to correct it',
  );
  console.log(
    'GUI build pipeline: output protection,' +
      ' branch/config checks, region validati' +
      'on, CloudBase flags, idempotency, stal' +
      'e environment, missing Mask and size l' +
      'imit: OK',
  );
} finally {
  const resolved = path.resolve(fixture);
  assert.strictEqual(path.dirname(resolved), fixtureParent);
  assert(path.basename(resolved).startsWith('cloud-gui-validation-'));
  fs.rmSync(resolved, {recursive: true, force: true});
}
