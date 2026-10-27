'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
/** 验证微信构建包中的云环境、入口和资源配置。 */
function verifyCloudBuild({root = path.resolve(__dirname, '..'),
    build = path.join(root, 'build', 'wechatgame-cloud-dev')} = {}) {
    const settings = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions', 'hotpotPlayerDev', 'settings.json'), 'utf8'));
    const project = JSON.parse(fs.readFileSync(path.join(build, 'project.config.json'), 'utf8'));
    const game = JSON.parse(fs.readFileSync(path.join(build, 'game.json'), 'utf8'));
    const main = fs.readFileSync(path.join(build, 'subpackages', 'main', 'game.js'), 'utf8');
    const engine = fs.readFileSync(path.join(build, 'cocos-js', 'cc.js'), 'utf8');
    for (const component of ['Mask', 'ScrollView']) {
        if (!new RegExp(`\\b${component}\\s*:`).test(engine)) {
            throw new Error(`Region picker needs the ${component} engine export. Use the Cloud Dev build config.`);
        }
    }
    const declarations = main.match(/environmentId\s*:\s*["'][^"']+["']/g) || [];
    const environments = declarations.map(/** 将当前条目转换为后续处理所需的值。 */ value => value.match(/["']([^"']+)["']$/)[1]);
    if (!settings.enabled || !environments.length || environments.some(/** 按条件筛选或判断条目：value !== settings.environmentId。 */ value => value !== settings.environmentId) ||
        project.appid !== settings.appId || game.cloud !== true || project.cloudfunctionRoot !== '../../cloudfunctions/') {
        throw new Error('Cloud Dev build does not match the prepared environment/AppID. Rebuild before importing.');
    }
    const hash = crypto.createHash('sha256').update(main).digest('hex').slice(0, 12);
    const entry = path.join(build, 'game.js');
    const source = fs.readFileSync(entry, 'utf8').replace(/^\/\/ HotPot cloud target\r?\nconsole\.info\([^\n]+\);\r?\n/, '');
    const target = {environment: settings.environmentId, build: hash};
    fs.writeFileSync(entry, `// HotPot cloud target\nconsole.info('[HotPot Cloud Dev] target', ${JSON.stringify(target)});\n${source}`);
    console.log(`Verified Cloud Dev target: ${settings.environmentId} / ${hash}`);
    return target;
}

module.exports = {verifyCloudBuild};
if (require.main === module) verifyCloudBuild();
