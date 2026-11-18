'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const targetBanner = /^\/\/ HotPot cloud target\r?\nconsole\.info\([^\n]+\);\r?\n/;
const fingerprint = (file, bytes) => hash(file === 'game.js'
  ? bytes.toString('utf8').replace(targetBanner, '') : bytes);

function walk(folder) {
  return fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    assert(!entry.isSymbolicLink(), 'Build cannot contain symlinks');
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function compactShader(source) {
  if (/__LINE__|__FILE__/.test(source)) return source;
  const tokenPattern = /0[xX][0-9a-fA-F]+[uU]?|[A-Za-z_]\w*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[uUfF]?|<<=|>>=|\+\+|--|<=|>=|==|!=|&&|\|\||<<|>>|[+*/%&|^=-]=|[^\s]/g;
  const tokenText = text => JSON.stringify(text.match(tokenPattern) || []);
  // Comments retain line boundaries; preprocessor lines are kept verbatim.
  if (!/\/\/|\/\*/.test(source)) {
    const output = [], group = [];
    const flush = () => {
      if (!group.length) return;
      const original = group.join('\n');group.length = 0;
      if (!original.trim()) return;
      const candidate = original.trim().replace(/\s+/g, ' ')
        .replace(/\s*([(){}\[\],;=+*/<>!?&|:%-])\s*/g, '$1');
      output.push(tokenText(original) === tokenText(candidate) ? candidate : original);
    };
    let continued = false;
    for (const line of source.split('\n')) {
      const directive = continued || line.trimStart().startsWith('#');
      continued = /\\\s*$/.test(line);
      if (directive) {flush();output.push(line);} else group.push(line);
    }
    flush();
    const result = output.join('\n');
    assert.strictEqual(tokenText(result), tokenText(source));
    return result;
  }
  let continued = false;
  const result = source.split('\n').map(line => {
    const directive = continued || line.trimStart().startsWith('#');
    continued = /\\\s*$/.test(line);
    if (directive) return line;
    return line.trim().replace(/[ \t]+/g, ' ')
      .replace(/[ \t]*([(){}\[\],;])[ \t]*/g, '$1');
  }).join('\n');
  assert.strictEqual(result.replace(/\s/g, ''), source.replace(/\s/g, ''));
  return result;
}

function loadTerser() {
  const roots = [process.resourcesPath,
    process.env.COCOS_CREATOR_388 && path.join(process.env.COCOS_CREATOR_388, 'resources')]
    .filter(Boolean);
  for (const root of roots) {
    const file = path.join(root, 'resources/3d/engine/node_modules/terser');
    try {return require(file);} catch {}
  }
  throw Error('Creator Terser is required; set COCOS_CREATOR_388.');
}

async function optimizeWechatBuild({root = path.resolve(__dirname, '..'),
  build = path.join(root, 'build/wechatgame-cloud-dev')} = {}) {
  const expected = path.join(root, 'build/wechatgame-cloud-dev');
  assert.strictEqual(path.resolve(build).toLowerCase(), expected.toLowerCase());
  const reportFile = path.join(root, 'temp/wechat-lossless-optimization.json');
  if (fs.existsSync(reportFile)) {
    const previous = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    if (previous.optimizerVersion === 3 && previous.files.length && previous.files.every(item => {
      const file = path.join(build, item.file);
      return fs.existsSync(file) && fingerprint(item.file, fs.readFileSync(file)) === item.afterSha256;
    }) && previous.media.every(item => fs.existsSync(path.join(build, item.file))
      && hash(fs.readFileSync(path.join(build, item.file))) === item.sha256)) return previous;
  }
  const media = walk(build).filter(file => /\.(png|jpe?g|mp3)$/i.test(file));
  const mediaHashes = media.map(file => ({file: path.relative(build, file),
    sha256: hash(fs.readFileSync(file))}));
  const {minify} = loadTerser();
  const files = [];
  function save(file, before, output, method) {
    const after = Buffer.from(output);
    if (after.length >= before.length) return;
    fs.writeFileSync(file, after);
    const relative = path.relative(build, file).replaceAll('\\', '/');
    files.push({file: relative, method,
      beforeBytes: before.length, afterBytes: after.length,
      beforeSha256: fingerprint(relative, before), afterSha256: fingerprint(relative, after)});
  }
  // Preserve public properties, constructor/function names and ES5 syntax.
  for (const name of ['web-adapter.js', 'engine-adapter.js']) {
    const file = path.join(build, name), before = fs.readFileSync(file);
    const result = await minify(before.toString('utf8'), {
      ecma: 5, compress: {passes: 2}, mangle: true,
      keep_fnames: true, keep_classnames: true,
      format: {comments: /^!|@license|@preserve|copyright/i},
    });
    assert(result.code && !result.map);
    save(file, before, result.code + '\n', 'Terser; public properties and names retained');
  }
  // Formatting only for bootstrapping. Keep the build-target banner separate
  // so the normal Cloud Dev verifier can continue to replace it idempotently.
  for (const name of ['game.js', 'src/chunks/bundle.js']) {
    const file = path.join(build, name), before = fs.readFileSync(file);
    const source = before.toString('utf8');
    const banner = name === 'game.js' ? source.match(targetBanner)?.[0] || '' : '';
    const result = await minify(source.slice(banner.length), {ecma: 5,
      compress: false, mangle: false,
      format: {comments: /^!|@license|@preserve|copyright/i}});
    save(file, before, banner + result.code + '\n', 'Boot formatting only; identifiers retained');
  }
  for (const file of walk(path.join(build, 'subpackages/internal/import'))) {
    if (!file.endsWith('.json')) continue;
    const before = fs.readFileSync(file), value = JSON.parse(before);
    let shaders = 0;
    function visit(object) {
      if (!object || typeof object !== 'object') return;
      for (const key of Object.keys(object)) {
        if ((key === 'glsl1' || key === 'glsl3') && object[key]) {
          for (const stage of ['vert', 'frag']) {
            if (typeof object[key][stage] !== 'string') continue;
            object[key][stage] = compactShader(object[key][stage]);shaders++;
          }
        } else visit(object[key]);
      }
    }
    visit(value);
    if (shaders) save(file, before, JSON.stringify(value),
      'GLSL formatting only; preprocessing lines and token text retained');
  }
  for (const item of mediaHashes) {
    assert.strictEqual(hash(fs.readFileSync(path.join(build, item.file))), item.sha256,
      'Lossless packaging must not alter image or audio bytes');
  }
  const report = {optimizerVersion: 3, method: 'Adapter minification and shader whitespace removal',
    savedBytes: files.reduce((sum, item) => sum + item.beforeBytes - item.afterBytes, 0),
    mediaByteIdentical: true, media: mediaHashes, files};
  fs.mkdirSync(path.dirname(reportFile), {recursive: true});
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`[HotPot Lossless] Saved ${report.savedBytes} bytes; ${media.length} media files unchanged`);
  return report;
}
module.exports = {compactShader, optimizeWechatBuild};
if (require.main === module) optimizeWechatBuild().catch(error => {
  console.error(error);process.exitCode = 1;
});
