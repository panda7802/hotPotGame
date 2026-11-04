'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const crypto = require('crypto'), assert = require('assert');
const sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../../design/victory-dialog-20261104');
const destination = path.join(root, 'assets/victory');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
(async () => {
  fs.mkdirSync(destination, {recursive: true});
  if (!fs.existsSync(destination + '.meta')) fs.writeFileSync(destination + '.meta', JSON.stringify({
    ver: '1.2.0', importer: 'directory', imported: true, uuid: crypto.randomUUID(),
    files: [], subMetas: {}, userData: {},
  }, null, 2));
  const files = [];
  for (const style of [1, 4, 8, 9]) {
    const name = 'win';
    const folder = path.join(destination, 'style-0' + style);
    fs.mkdirSync(folder, {recursive: true});
    if (!fs.existsSync(folder + '.meta')) fs.writeFileSync(folder + '.meta', JSON.stringify({
      ver: '1.2.0', importer: 'directory', imported: true, uuid: crypto.randomUUID(),
      files: [], subMetas: {}, userData: {isBundle: true, bundleName: 'victory-0' + style,
        bundleConfigID: 'default', priority: 8, compressionType: {}, isRemoteBundle: {}},
    }, null, 2));
    const input = path.join(source, 'background-0' + style + '.png');
    const output = path.join(folder, name + '.png');
    const meta = await sharp(input).metadata();
    // Preserve source resolution and all RGBA pixels. No quantization or resize.
    await sharp(input).png({compressionLevel: 9, effort: 10, palette: false}).toFile(output);
    if (fs.statSync(output).size >= fs.statSync(input).size) fs.copyFileSync(input, output);
    const pixels = hash(await sharp(input).ensureAlpha().raw().toBuffer());
    assert.strictEqual(hash(await sharp(output).ensureAlpha().raw().toBuffer()), pixels);
    if (!fs.existsSync(output + '.meta')) {
      const template = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/ingredients/food-c.png.meta')));
      const json = JSON.stringify(template).replaceAll(template.uuid, crypto.randomUUID()).replaceAll('food-c', name);
      const asset = JSON.parse(json);
      asset.userData.width = meta.width;asset.userData.height = meta.height;
      asset.userData.hasAlpha = !!meta.hasAlpha;
      fs.writeFileSync(output + '.meta', JSON.stringify(asset, null, 2) + '\n');
    }
    files.push({style, width: meta.width, height: meta.height,
      bytes: fs.statSync(output).size, rgbaSha256: pixels,
      bundle: 'victory-0' + style, resource: name, source: path.basename(input)});
  }
  fs.writeFileSync(path.join(source, 'production-assets.json'), JSON.stringify({
    source: 'Built-in image_gen', reencoding: 'PNG lossless; original resolution and RGBA retained', files,
  }, null, 2));
  console.log(JSON.stringify(files, null, 2));
})().catch(error => {console.error(error);process.exitCode = 1;});
