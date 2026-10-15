'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const creatorRoot = process.env.COCOS_CREATOR_388 || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8';
const ts = require(path.join(creatorRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'typescript'));
const output = path.join(root, 'cloudfunctions', 'hotpotPlayerDev');
const compile = name => {
    const source = path.join(root, 'assets', 'scripts', 'data', `${name}.ts`);
    const result = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
        fileName: source, reportDiagnostics: true,
    });
    if (result.diagnostics.length) throw new Error(`${name} compilation failed`);
    return result.outputText;
};
const configModule = {exports: {}};
vm.runInNewContext(compile('CloudConfig'), {exports: configModule.exports});
const config = configModule.exports.CLOUD_CONFIG;
if (config.enabled) configModule.exports.validateDevelopmentConfig(config);
fs.mkdirSync(output, {recursive: true});
// Keep runtime modules at the function root: the live WeChat upload omitted the nested modules.
for (const name of ['GameData', 'PlayerData']) fs.writeFileSync(path.join(output, `${name}.js`), compile(name));
fs.writeFileSync(path.join(output, 'settings.json'), JSON.stringify({
    enabled: config.enabled, environmentId: config.environmentId,
    allowSharedEnvironment: config.allowSharedEnvironment,
    regionsFileId: config.regionsFileId,
    collectionName: config.collectionName, appId: config.appId,
}, null, 2) + '\n');
const regions = fs.readFileSync(path.join(root, '..', '..', 'doc', 'res', 'regions.json'));
fs.writeFileSync(path.join(output, 'regions.json'), regions);
const regionFolder = path.join(root, 'assets', 'resources', 'data');
fs.mkdirSync(regionFolder, {recursive: true});
fs.writeFileSync(path.join(regionFolder, 'regions.json'), regions);
console.log(`Cloud function prepared: ${output}`);
console.log(config.enabled ? `Development resources: ${config.environmentId} / ${config.collectionName}` : 'Cloud disabled: isolated local development only.');
