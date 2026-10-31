'use strict';
const fs = require('fs');
const path = require('path');
const {verifyCloudBuild} = require('./verify-cloud-build.cjs');

const OUTPUT = 'wechatgame-cloud-dev';
const BRANCH = 'codex/cloudbase-player-save';
const START_SCENE = '7c3e7fab-7b1e-4865-ba84-3cf81b48b9fb';
/**
 * 读取并解析 JSON 文件，兼容 UTF-8 BOM。
 */
const readJson = (file) =>
  JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
/**
 * 比较两个路径是否指向同一目录。
 */
const samePath = (a, b) =>
  process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b);

/**
 * 读取工作区当前 Git 分支。
 */
function readCurrentBranch(repository) {
  // Isolated build copies may live below the actual checkout, like any other
  // untracked subdirectory. Find its real Git ancestor; keep the branch guard.
  while (!fs.existsSync(path.join(repository, '.git'))) {
    const parent = path.dirname(repository);
    if (parent === repository) throw new Error('Cannot find the build repository.');
    repository = parent;
  }
  let gitDirectory = path.join(repository, '.git');
  if (fs.statSync(gitDirectory).isFile()) {
    const pointer = fs.readFileSync(gitDirectory, 'utf8').trim();
    if (!pointer.startsWith('gitdir: ')) {
      throw new Error('无法识别 Git 工作目录。');
    }
    gitDirectory = path.resolve(repository, pointer.slice('gitdir: '.length));
  }
  const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
  return head.startsWith('ref: refs/heads/')
    ? head.slice('ref: refs/heads/'.length)
    : '';
}

/**
 * 确认构建仅在指定开发分支进行。
 */
function assertBranch(root, readBranch = readCurrentBranch) {
  if (readBranch(path.resolve(root, '../..')) !== BRANCH) {
    throw new Error(`云开发构建仅允许在 ${BRANCH} 分支执行。`);
  }
}

/**
 * 校验微信小游戏的构建参数和输出名称。
 */
function assertBuildOptions(root, options) {
  const expected = path.join(root, 'build');
  const buildPath = options.buildPath?.startsWith('project://')
    ? path.resolve(root, options.buildPath.slice('project://'.length))
    : options.buildPath;
  if (options.platform !== 'wechatgame') {
    throw new Error('云开发构建的平台必须是微信小游戏。');
  }
  if (options.outputName !== OUTPUT) {
    throw new Error(
      '当前发布包名称为“' +
        String(options.outputName || '未设置') +
        '”，必须改为“' +
        String(OUTPUT) +
        '”。请修改输出目录名称，不要只改任务名；若 Cocos 自动追加了 -001' +
        '，请去掉后再构建。旧发布目录仍受保护。',
    );
  }
  if (!buildPath || !samePath(buildPath, expected)) {
    throw new Error(
      '发布路径必须为 project://build（' +
        String(expected) +
        '），当前为“' +
        String(options.buildPath || '未设置') +
        '”。',
    );
  }
  if (options.buildMode !== 'normal'
    || options.debug !== false ||
    options.md5Cache !== false ||
    options.mainBundleCompressionType !== 'subpackage' ||
    options.startScene !== START_SCENE ||
    options.mainBundleIsRemote !== false) {
    throw new Error(
      '请使用导入配置中的正常构建、main 场景、本地小游戏分包及关闭 MD5 设置。',
    );
  }
  if (!options.includeModules?.includes('mask')
    && options.overwriteProjectSettings?.includeModules?.mask !== 'on') {
    throw new Error('地区滚动需要 Mask 模块，请重新导入云开发构建配置。');
  }
  const wechat = options.packages?.wechatgame;
  if (!wechat
    || wechat.appid !== 'wx943cc2d81ec6f820' ||
    wechat.orientation !== 'portrait' ||
    wechat.separateEngine !== false ||
    wechat.highPerformanceMode !== false ||
    wechat.buildOpenDataContextTemplate !== '') {
    throw new Error('微信平台参数不匹配，请重新导入云开发配置并核对 AppID。');
  }
}

/**
 * 确认构建目录未越界或被链接重定向。
 */
function assertDestination(root, destination) {
  const expected = path.join(root, 'build', OUTPUT);
  if (!destination || !samePath(destination, expected)) {
    throw new Error(`拒绝写入其他构建目录；目标必须是 ${expected}`);
  }
  // A directory link must not redirect this development build into a release
  // checkout.
  if (fs.existsSync(destination)
    && !samePath(fs.realpathSync(destination), destination)) {
    throw new Error('开发输出目录不能是指向其他位置的目录链接。');
  }
}

/**
 * 写入云开发构建配置并检查最终包大小。
 */
function finalizeCloudBuild({
  root = path.resolve(__dirname, '..'),
  build = path.join(root, 'build', OUTPUT),
} = {}) {
  assertDestination(root, build);
  const settings = readJson(
    path.join(root, 'cloudfunctions/hotpotPlayerDev/settings.json'),
  );
  if (!settings.enabled
    || settings.collectionName !== 'hotpot_players_dev' ||
    settings.appId !== 'wx943cc2d81ec6f820' ||
    !settings.environmentId ||
    settings.environmentId === 'hotpot-d9g7g17ifb99bdd1b') {
    throw new Error('独立开发云配置不匹配，停止处理构建产物。');
  }
  const projectFile = path.join(build, 'project.config.json');
  const gameFile = path.join(build, 'game.json');
  const project = readJson(projectFile);
  const game = readJson(gameFile);
  project.appid = settings.appId;
  project.projectname = 'HotPot-Cloud-Dev';
  project.cloudfunctionRoot = '../../cloudfunctions/';
  game.cloud = true;
  fs.writeFileSync(projectFile, JSON.stringify(project));
  fs.writeFileSync(gameFile, JSON.stringify(game));
  // Also enforce the project startup template for existing GUI build tasks.
  fs.copyFileSync(
    path.join(root, 'build-templates/wechatgame/first-screen.js'),
    path.join(build, 'first-screen.js'),
  );
  const runtimeSettingsFile = path.join(build, 'src/settings.json');
  const runtimeSettings = readJson(runtimeSettingsFile);
  runtimeSettings.splashScreen = {
    ...runtimeSettings.splashScreen,
    totalTime: 0,
    logo: {type: 'none'},
  };
  fs.writeFileSync(runtimeSettingsFile, JSON.stringify(runtimeSettings));
  const target = verifyCloudBuild({root, build});
  /**
   * 为测试场景提供 size 所需的模拟行为。
   */
  function size(folder) {
    /**
     * 把集合条目汇总为一个结果。
     */
    return fs
      .readdirSync(folder, {withFileTypes: true})
      .reduce((total, item) => {
        const file = path.join(folder, item.name);
        if (item.isSymbolicLink()) {
          throw new Error('构建产物中不允许目录/文件链接。');
        }
        return (
          total + (item.isDirectory() ? size(file) : fs.statSync(file).size)
        );
      }, 0);
  }
  const bytes = size(build);
  // Delivery budget covers every client file, including all resource subpackages.
  const subpackageBytes = (game.subpackages || game.subPackages || []).reduce((total, item) => {
    const folder = path.resolve(build, item.root);
    if (!folder.startsWith(path.resolve(build) + path.sep)) {
      throw new Error('分包路径超出构建目录');
    }
    return total + size(folder);
  }, 0);
  const mainBytes = bytes - subpackageBytes;
  if (mainBytes >= 4000000) throw new Error(`微信主包超过 4 MB：${mainBytes} 字节。`);
  if (bytes >= 4000000) throw new Error(`完整开发包超过 4 MB：${bytes} 字节。`);
  console.log(`[HotPot Cloud Build] 主包 ${mainBytes} bytes，分包 ${subpackageBytes} bytes`);
  console.log(`[HotPot Cloud Build] 完成：${build} (${bytes} bytes)`);
  return {...target, bytes};
}

module.exports = {
  OUTPUT,
  BRANCH,
  assertBranch,
  assertBuildOptions,
  assertDestination,
  finalizeCloudBuild,
};
if (require.main === module) {
  assertBranch(path.resolve(__dirname, '..'));
  finalizeCloudBuild();
}
