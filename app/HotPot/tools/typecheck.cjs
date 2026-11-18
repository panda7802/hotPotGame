'use strict';
const path = require('path');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const root = path.resolve(__dirname, '..');
const config = ts.parseJsonConfigFileContent({
  extends: './tsconfig.json',
  compilerOptions: {
    lib: ['es2019', 'dom'], skipLibCheck: true, types: [],
  },
  include: ['assets/scripts/**/*.ts'],
  exclude: ['temp', 'build', 'library', 'node_modules'],
}, ts.sys, root);
for (const name of ['cc', 'cc.custom-macro', 'cc.env', 'jsb']) {
  config.fileNames.push(path.join(root, 'temp/declarations', name + '.d.ts'));
}
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = config.errors.concat(ts.getPreEmitDiagnostics(program));
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else {
  console.log(`TypeScript: ${config.fileNames.length} game modules OK`);
}
