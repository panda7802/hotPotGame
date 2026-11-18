'use strict';
const fs = require('fs');
const path = require('path');

// Conservative decimal-byte budgets. The main package and the combined delivery
// have separate limits; subpackages must not count against the main-package cap.
const MAIN_PACKAGE_LIMIT_BYTES = 4000000;
const TOTAL_PACKAGE_LIMIT_BYTES = 30000000;

function inspectWechatPackages(build) {
  build = path.resolve(build);
  const game = JSON.parse(fs.readFileSync(path.join(build, 'game.json'), 'utf8'));
  const declarations = game.subpackages || game.subPackages;
  if (!Array.isArray(declarations) || !declarations.length) {
    throw new Error('微信构建必须启用小游戏分包，并在 game.json 中声明分包。');
  }
  function size(folder) {
    return fs.readdirSync(folder, {withFileTypes: true}).reduce((total, item) => {
      const file = path.join(folder, item.name);
      if (item.isSymbolicLink()) throw new Error('构建产物中不允许目录/文件链接。');
      return total + (item.isDirectory() ? size(file) : fs.statSync(file).size);
    }, 0);
  }
  const roots = [], names = new Set();
  const packages = declarations.map(item => {
    if (typeof item.name !== 'string' || !item.name || names.has(item.name)) {
      throw new Error('分包名称为空或重复。');
    }
    names.add(item.name);
    if (typeof item.root !== 'string' || !item.root || item.root.includes('\\')
      || item.root.split('/').includes('..') || path.isAbsolute(item.root)) {
      throw new Error('分包路径必须是客户端目录内的相对路径。');
    }
    const folder = path.resolve(build, item.root);
    const key = folder.toLowerCase();
    if (!key.startsWith(build.toLowerCase() + path.sep)) {
      throw new Error('分包路径超出构建目录。');
    }
    if (roots.some(root => root === key || root.startsWith(key + path.sep)
      || key.startsWith(root + path.sep))) throw new Error('分包路径重复或相互嵌套。');
    roots.push(key);
    if (!fs.existsSync(path.join(folder, 'game.js'))) {
      throw new Error('分包缺少 game.js 入口：' + item.name);
    }
    return {name: item.name, root: item.root, bytes: size(folder)};
  });
  const bytes = size(build);
  const subpackageBytes = packages.reduce((sum, item) => sum + item.bytes, 0);
  const mainBytes = bytes - subpackageBytes;
  if (mainBytes >= MAIN_PACKAGE_LIMIT_BYTES) {
    throw new Error(`微信主包超过 4 MB：${mainBytes} 字节；请将新增资源放入分包。`);
  }
  if (bytes >= TOTAL_PACKAGE_LIMIT_BYTES) {
    throw new Error(`微信主包及分包合计超过项目 30 MB 预算：${bytes} 字节。`);
  }
  return {mode: 'subpackage', bytes, mainBytes, subpackageBytes, packages,
    mainLimitBytes: MAIN_PACKAGE_LIMIT_BYTES, totalLimitBytes: TOTAL_PACKAGE_LIMIT_BYTES,
    mainRemainingBytes: MAIN_PACKAGE_LIMIT_BYTES - mainBytes,
    totalRemainingBytes: TOTAL_PACKAGE_LIMIT_BYTES - bytes};
}

module.exports = {inspectWechatPackages, MAIN_PACKAGE_LIMIT_BYTES, TOTAL_PACKAGE_LIMIT_BYTES};
if (require.main === module) {
  console.log(JSON.stringify(inspectWechatPackages(process.argv[2]
    || path.resolve(__dirname, '../build/wechatgame-cloud-dev')), null, 2));
}
