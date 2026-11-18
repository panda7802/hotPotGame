'use strict';

const fs = require('fs');
const path = require('path');
const {loadTypeScript} = require('./prepare-cloud.cjs');

const ts = loadTypeScript();
const project = path.resolve(__dirname, '..');
const sourceRoots = [
  'assets/scripts',
  'tools',
  'cloudfunctions/hotpotPlayerDev',
  'extensions',
  'build-templates',
];
const ignoredDirectories = new Set([
  'node_modules',
  'temp',
  'build',
  'library',
]);
const findings = [];
let checkedFiles = 0;

/**
 * 记录违反源码风格的文件和行号。
 */
function report(file, line, message) {
  findings.push(`${path.relative(project, file)}:${line}: ${message}`);
}

/**
 * 检查单个项目自有源码文件。
 */
function checkFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  checkedFiles++;
  lines.forEach((line, index) => {
    if (line.length > 80) {
      report(file, index + 1, `${line.length} characters; maximum is 80`);
    }
  });
  if (!/\.(ts|js|cjs)$/.test(file)) {
    return;
  }
  if (file.includes(path.join('assets', 'scripts'))
    && lines.length > 600) {
    report(file, 1, `${lines.length} lines; business limit is 600`);
  }
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const parsed = ts.createSourceFile(
    file, source, ts.ScriptTarget.Latest, true, kind,
  );
  for (const diagnostic of parsed.parseDiagnostics) {
    const line = parsed.getLineAndCharacterOfPosition(
      diagnostic.start,
    ).line + 1;
    report(file, line, 'source does not parse');
  }
  /**
   * 递归检查所有 if 和 else 分支。
   */
  function visit(node) {
    if (ts.isIfStatement(node)) {
      const line = parsed.getLineAndCharacterOfPosition(
        node.getStart(parsed),
      ).line + 1;
      if (!ts.isBlock(node.thenStatement)) {
        report(file, line, 'if body must use braces');
      }
      if (node.elseStatement && !ts.isBlock(node.elseStatement)
        && !ts.isIfStatement(node.elseStatement)) {
        report(file, line, 'else body must use braces');
      }
      const start = lines[line - 1];
      if (/\bif\s*\(\s*$/.test(start)) {
        report(file, line, 'if condition must start on the if line');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

/**
 * 遍历自有源码，排除依赖与构建产物。
 */
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(file);
    } else if (/\.(ts|js|cjs|ps1|py)$/.test(entry.name)) {
      checkFile(file);
    }
  }
}

for (const root of sourceRoots) {
  walk(path.join(project, root));
}
if (findings.length) {
  for (const finding of findings) {
    console.error(finding);
  }
  process.exitCode = 1;
} else {
  console.log(`Code style: ${checkedFiles} files, no violations`);
}
