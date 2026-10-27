'use strict';
const path = require('path');
const {prepareCloud} = require('../../tools/prepare-cloud.cjs');
const {assertBranch, assertBuildOptions, assertDestination, finalizeCloudBuild} = require('../../tools/cloud-build-pipeline.cjs');
const root = path.resolve(__dirname, '../..');

exports.throwError = true;
exports.title = '火锅云开发构建';
/**
 * 处理 onBeforeBuild 对应的事件。
 */
exports.onBeforeBuild =  async function (options) {
  // Check before writing any generated files or allowing Creator to touch old exports.
  assertBuildOptions(root, options);
  assertBranch(root);
  assertDestination(root, path.join(root, 'build', options.outputName));
  prepareCloud({root, requireEnabled: true});
  // Creator keeps an asset database: file changes must be imported before packaging.
  await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/resources/data/regions.json');
  console.log('[HotPot Cloud Build] 已准备地区与云函数本地文件。');
};

/**
 * 处理 onAfterBuild 对应的事件。
 */
exports.onAfterBuild =  async function (options, result) {
  assertBuildOptions(root, options);
  assertBranch(root);
  assertDestination(root, result?.dest);
  finalizeCloudBuild({root, build: result?.dest});
};
