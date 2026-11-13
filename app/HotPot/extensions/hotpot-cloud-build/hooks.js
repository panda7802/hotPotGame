'use strict';
const path = require('path');
const {loadBuildTools} = require('./load-tools');
const root = path.resolve(__dirname, '../..');

exports.throwError = true;
exports.title = '火锅云开发构建';
/**
 * 处理 onBeforeBuild 对应的事件。
 */
exports.onBeforeBuild = async function (options) {
  const {assertBuildOptions,assertBranch,assertDestination,prepareCloud} = loadBuildTools(root);
  // Check before writing any generated files or allowing Creator to touch old
  // exports.
  assertBuildOptions(root, options);
  assertBranch(root);
  assertDestination(root, path.join(root, 'build', options.outputName));
  prepareCloud({root, requireEnabled: true});
  // Creator keeps an asset database: file changes must be imported before
  // packaging.
  await Editor.Message.request(
    'asset-db',
    'refresh-asset',
    'db://assets/resources/data/regions.json',
  );
  console.log('[HotPot Cloud Build] 已准备地区与云函数本地文件。');
};

/**
 * 处理 onAfterBuild 对应的事件。
 */
exports.onAfterBuild = async function (options, result) {
  const {assertBuildOptions,assertBranch,assertDestination,optimizeWechatBuild,
    finalizeCloudBuild} = loadBuildTools(root);
  console.log('[HotPot Cloud Build] 分包校验 v2：已刷新构建工具，使用当前磁盘规则。');
  assertBuildOptions(root, options);
  assertBranch(root);
  assertDestination(root, result?.dest);
  await optimizeWechatBuild({root, build: result?.dest});
  return finalizeCloudBuild({root, build: result?.dest});
};
