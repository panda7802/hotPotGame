'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const crypto = require('crypto'), assert = require('assert');
const sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../../design/collection-icons-20261104');
const destination = path.join(root, 'assets/resources/collection-icons');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  fs.mkdirSync(destination, {recursive: true});
  if (!fs.existsSync(destination + '.meta')) fs.writeFileSync(destination + '.meta', JSON.stringify({
    ver: '1.2.0', importer: 'directory', imported: true,
    uuid: crypto.randomUUID(), files: [], subMetas: {}, userData: {},
  }, null, 2));
  const files = [];
  for (const style of ['01', '04', '08', '09']) {
    const input = path.join(source, `style-${style}-v3.png`);
    const name = `style-${style}`, output = path.join(destination, name + '.png');
    const original = await sharp(input).metadata();
    assert(original.hasAlpha, 'Collection icon requires true transparency');
    // Remove unused transparent margins, preserve aspect ratio and alpha.
    // 224 px covers the balanced ~70 CSS-pixel entry on a 3x display.
    const bytes = await sharp(input).trim({background: '#00000000', threshold: 1})
      .resize({width: 224}).png({compressionLevel: 9, adaptiveFiltering: true}).toBuffer();
    const meta = await sharp(bytes).metadata(), stats = await sharp(bytes).stats();
    assert(meta.hasAlpha && stats.channels[3].min === 0);
    assert(bytes.length < 110000, 'Oversized runtime collection icon');
    let asset;
    if (fs.existsSync(output + '.meta')) asset = JSON.parse(fs.readFileSync(output + '.meta'));
    else {
      const template = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/ingredients/food-c.png.meta')));
      asset = JSON.parse(JSON.stringify(template).replaceAll(template.uuid, crypto.randomUUID()).replaceAll('food-c', name));
    }
    asset.userData.width = meta.width;asset.userData.height = meta.height;
    fs.writeFileSync(output, bytes);
    fs.writeFileSync(output + '.meta', JSON.stringify(asset, null, 2) + '\n');
    files.push({style, source: path.basename(input), resource: 'collection-icons/' + name,
      width: meta.width, height: meta.height, bytes: bytes.length, sha256: hash(bytes)});
  }
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  fs.writeFileSync(path.join(source, 'production-assets.json'), JSON.stringify({
    source: 'Approved large-entry image_gen v3 designs; runtime-size PNG, alpha preserved',
    totalBytes, files,
  }, null, 2));
  console.log(JSON.stringify({totalBytes, files}, null, 2));
})().catch(error => {console.error(error);process.exitCode = 1;});
