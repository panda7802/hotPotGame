'use strict';
const path = require('path');

/** Creator reuses its build worker. Refresh only this project's tool modules. */
exports.loadBuildTools = function (root) {
  const folder = path.resolve(root, 'tools') + path.sep;
  for (const file of Object.keys(require.cache)) {
    const inside = process.platform === 'win32'
      ? file.toLowerCase().startsWith(folder.toLowerCase())
      : file.startsWith(folder);
    if (inside) delete require.cache[file];
  }
  return {
    ...require(path.join(folder, 'cloud-build-pipeline.cjs')),
    ...require(path.join(folder, 'prepare-cloud.cjs')),
    ...require(path.join(folder, 'optimize-wechat-lossless.cjs')),
  };
};
