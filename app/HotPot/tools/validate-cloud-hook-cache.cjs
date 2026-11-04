'use strict';
// Reproduce Creator's persistent require cache with the genuine >4 MB build.
const assert = require('assert'), path = require('path');
const root = path.resolve(__dirname, '..');
const hooks = require('../extensions/hotpot-cloud-build/hooks');
const cachedHandler = hooks.onAfterBuild;
const config = require('./wechat-cloud-dev.build.json');
const pipelineFile = require.resolve('./cloud-build-pipeline.cjs');
const budgetFile = require.resolve('./wechat-package-budget.cjs');
let staleCalls = 0;
function installOldRule() {
  require(pipelineFile);require(budgetFile);
  require.cache[pipelineFile].exports.finalizeCloudBuild = () => {
    staleCalls++;throw Error('完整开发包超过 4 MB（模拟旧构建缓存）');
  };
  require.cache[budgetFile].exports.inspectWechatPackages = () => {
    staleCalls++;throw Error('旧包体工具不应继续执行');
  };
}
(async () => {
  for (let i=0;i<2;i++) {
    installOldRule();
    const result = await cachedHandler(config, {dest:path.join(root, 'build/wechatgame-cloud-dev')});
    assert(result.bytes > 4000000, 'Use a real subpackage build larger than 4 MB');
    assert(result.mainBytes < 4000000);
    assert.strictEqual(result.totalLimitBytes, 30000000);
    assert.strictEqual(staleCalls, 0);
    assert.strictEqual(hooks.onAfterBuild, cachedHandler, 'The handler itself must stay cached');
  }
  console.log('Cached Creator handler: stale pipeline and transitive budget modules replaced on both builds; >4 MB subpackages pass: OK');
})().catch(error => {console.error(error);process.exitCode=1;});
