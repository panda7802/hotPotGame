'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
/**
 * 从 Cocos Creator 安装目录加载 TypeScript 编译器。
 */
function loadTypeScript(creatorRoot = process.env.COCOS_CREATOR_388) {
  const resourceRoots = [
    creatorRoot && path.join(creatorRoot, 'resources'),
    process.resourcesPath,
    path.join(path.dirname(process.execPath), 'resources'),
  ].filter(Boolean);
  for (const resourceRoot of resourceRoots) {
    const modulePath = path.join(
      resourceRoot,
      'app.asar.unpacked',
      'node_modules',
      'typescript',
    );
    if (fs.existsSync(modulePath)) {
      return require(modulePath);
    }
  }
  throw new Error(
    'Cannot find Creator TypeScript. Run in' +
      'side Creator or set COCOS_CREATOR_388.',
  );
}

/**
 * 生成云函数共享模块、地区数据与开发环境设置。
 */
function prepareCloud({
  root = path.resolve(__dirname, '..'),
  ts = loadTypeScript(),
  requireEnabled = false,
} = {}) {
  const output = path.join(root, 'cloudfunctions', 'hotpotPlayerDev');
  /**
   * 为测试场景提供 compile 所需的模拟行为。
   */
  const compile = (name) => {
    const source = path.join(root, 'assets', 'scripts', 'data', `${name}.ts`);
    const result = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
      },
      fileName: source,
      reportDiagnostics: true,
    });
    if (result.diagnostics.length) {
      throw new Error(`${name} compilation failed`);
    }
    return result.outputText;
  };
  const configModule = {exports: {}};
  vm.runInNewContext(compile('CloudConfig'), {exports: configModule.exports});
  const config = configModule.exports.CLOUD_CONFIG;
  if (config.enabled) {
    configModule.exports.validateDevelopmentConfig(config);
  }
  if (requireEnabled
    && (!config.enabled ||
      config.appId !== 'wx943cc2d81ec6f820' ||
      config.environmentId === 'hotpot-d9g7g17ifb99bdd1b')) {
    throw new Error(
      'GUI build requires the enabled, isolated Cloud Dev configuration.',
    );
  }
  const regions = fs.readFileSync(
    path.join(root, '..', '..', 'doc', 'res', 'regions.json'),
  );
  // Validate before writing either copy; never distribute a half-updated region
  // tree.
  const domainNames = [
    'RuntimeConfig',
    'GameConfig',
    'GameData',
    'PlayerTypes',
    'RegionData',
    'PlayerData',
  ];
  const domainModules = new Map();
  /**
   * 按云函数实际的相对依赖关系载入共享模块。
   */
  const loadDomain = (name) => {
    if (!domainNames.includes(name)) {
      throw new Error(`Unexpected domain dependency: ${name}`);
    }
    if (domainModules.has(name)) {
      return domainModules.get(name);
    }
    const exports = {};
    domainModules.set(name, exports);
    vm.runInNewContext(compile(name), {
      exports,
      /**
       * 解析编译后的模块依赖。
       */
      require: (request) => loadDomain(request.replace(/^\.\//, '')),
    });
    return exports;
  };
  loadDomain('PlayerData').validateRegions(
    JSON.parse(regions.toString('utf8').replace(/^\uFEFF/, '')),
  );
  fs.mkdirSync(output, {recursive: true});
  // Keep runtime modules at the function root: the live WeChat upload omitted
  // the nested modules.
  for (const name of domainNames) {
    fs.writeFileSync(path.join(output, `${name}.js`), compile(name));
  }
  fs.writeFileSync(
    path.join(output, 'settings.json'),
    JSON.stringify(
      {
        enabled: config.enabled,
        environmentId: config.environmentId,
        allowSharedEnvironment: config.allowSharedEnvironment,
        regionsFileId: config.regionsFileId,
        collectionName: config.collectionName,
        appId: config.appId,
      },
      null,
      2,
    ) + '\n',
  );
  fs.writeFileSync(path.join(output, 'regions.json'), regions);
  const regionFolder = path.join(root, 'assets', 'resources', 'data');
  fs.mkdirSync(regionFolder, {recursive: true});
  fs.writeFileSync(path.join(regionFolder, 'regions.json'), regions);
  console.log(`Cloud function prepared: ${output}`);
  console.log(
    config.enabled
      ? 'Development resources: ' +
          String(config.environmentId) +
          ' / ' +
          String(config.collectionName) +
          ''
      : 'Cloud disabled: isolated local development only.',
  );
  return config;
}

module.exports = {prepareCloud, loadTypeScript};
if (require.main === module) {
  prepareCloud();
}
