'use strict';
const fs = require('fs');
const path = require('path');
const {verifyCloudBuild} = require('./verify-cloud-build.cjs');

const OUTPUT = 'wechatgame-cloud-dev';
const BRANCH = 'codex/cloudbase-player-save';
const START_SCENE = '7c3e7fab-7b1e-4865-ba84-3cf81b48b9fb';
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const samePath = (a, b) => process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

function readCurrentBranch(repository) {
    let gitDirectory = path.join(repository, '.git');
    if (fs.statSync(gitDirectory).isFile()) {
        const pointer = fs.readFileSync(gitDirectory, 'utf8').trim();
        if (!pointer.startsWith('gitdir: ')) throw new Error('无法识别 Git 工作目录。');
        gitDirectory = path.resolve(repository, pointer.slice('gitdir: '.length));
    }
    const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : '';
}

function assertBranch(root, readBranch = readCurrentBranch) {
    if (readBranch(path.resolve(root, '../..')) !== BRANCH) {
        throw new Error(`云开发构建仅允许在 ${BRANCH} 分支执行。`);
    }
}

function assertBuildOptions(root, options) {
    const expected = path.join(root, 'build');
    const buildPath = options.buildPath?.startsWith('project://')
        ? path.resolve(root, options.buildPath.slice('project://'.length)) : options.buildPath;
    if (options.platform !== 'wechatgame' || options.outputName !== OUTPUT || !buildPath || !samePath(buildPath, expected)) {
        throw new Error('旧发布目录受保护。请新建任务并导入 tools/wechat-cloud-dev.build.json，输出 build/wechatgame-cloud-dev。');
    }
    if (options.buildMode !== 'normal' || options.debug !== false || options.md5Cache !== false ||
        options.mainBundleCompressionType !== 'subpackage' || options.startScene !== START_SCENE ||
        options.mainBundleIsRemote !== false) {
        throw new Error('请使用导入配置中的正常构建、main 场景、本地小游戏分包及关闭 MD5 设置。');
    }
    if (!options.includeModules?.includes('mask') && options.overwriteProjectSettings?.includeModules?.mask !== 'on') {
        throw new Error('地区滚动需要 Mask 模块，请重新导入云开发构建配置。');
    }
    const wechat = options.packages?.wechatgame;
    if (!wechat || wechat.appid !== 'wx943cc2d81ec6f820' || wechat.orientation !== 'portrait' ||
        wechat.separateEngine !== false || wechat.highPerformanceMode !== false ||
        wechat.buildOpenDataContextTemplate !== '') {
        throw new Error('微信平台参数不匹配，请重新导入云开发配置并核对 AppID。');
    }
}

function assertDestination(root, destination) {
    const expected = path.join(root, 'build', OUTPUT);
    if (!destination || !samePath(destination, expected)) {
        throw new Error(`拒绝写入其他构建目录；目标必须是 ${expected}`);
    }
    // A directory link must not redirect this development build into a release checkout.
    if (fs.existsSync(destination) && !samePath(fs.realpathSync(destination), destination)) {
        throw new Error('开发输出目录不能是指向其他位置的目录链接。');
    }
}

function finalizeCloudBuild({root = path.resolve(__dirname, '..'), build = path.join(root, 'build', OUTPUT)} = {}) {
    assertDestination(root, build);
    const settings = readJson(path.join(root, 'cloudfunctions/hotpotPlayerDev/settings.json'));
    if (!settings.enabled ||
        settings.collectionName !== 'hotpot_players_dev' || settings.appId !== 'wx943cc2d81ec6f820' ||
        !settings.environmentId || settings.environmentId === 'hotpot-d9g7g17ifb99bdd1b') {
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
    const target = verifyCloudBuild({root, build});
    function size(folder) {
        return fs.readdirSync(folder, {withFileTypes: true}).reduce((total, item) => {
            const file = path.join(folder, item.name);
            if (item.isSymbolicLink()) throw new Error('构建产物中不允许目录/文件链接。');
            return total + (item.isDirectory() ? size(file) : fs.statSync(file).size);
        }, 0);
    }
    const bytes = size(build);
    if (bytes >= 4000000) throw new Error(`开发包超过 4 MB：${bytes} 字节。`);
    console.log(`[HotPot Cloud Build] 完成：${build} (${bytes} bytes)`);
    return {...target, bytes};
}

module.exports = {OUTPUT, BRANCH, assertBranch, assertBuildOptions, assertDestination, finalizeCloudBuild};
if (require.main === module) {
    assertBranch(path.resolve(__dirname, '..'));
    finalizeCloudBuild();
}
