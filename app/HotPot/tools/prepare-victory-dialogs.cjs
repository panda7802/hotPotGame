'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const crypto = require('crypto'), assert = require('assert');
const sharp = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../../design/victory-dialog-20261104');
const destination = path.join(root, 'assets/victory');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const width = 720, quality = 84;
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
    const output = path.join(folder, name + '.jpg');
    const oldImage = path.join(folder, name + '.png');
    const meta = await sharp(input).metadata();
    // 720 px covers the actual ~360 CSS-pixel dialog on a 2x phone screen.
    // The approved full-resolution design stays outside the game package.
    const stats = await sharp(input).stats();
    assert(stats.isOpaque, 'JPEG dialog background must be fully opaque');
    const bytes = await sharp(input).resize({width}).removeAlpha()
      .jpeg({quality, chromaSubsampling: '4:4:4', mozjpeg: true}).toBuffer();
    const prepared = await sharp(bytes).metadata();
    let asset;
    if (fs.existsSync(output + '.meta')) asset = JSON.parse(fs.readFileSync(output + '.meta'));
    else if (fs.existsSync(oldImage + '.meta')) asset = JSON.parse(fs.readFileSync(oldImage + '.meta'));
    else {
      const template = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/ingredients/food-c.png.meta')));
      asset = JSON.parse(JSON.stringify(template).replaceAll(template.uuid, crypto.randomUUID()).replaceAll('food-c', name));
    }
    // Remove the retired generated PNG, retaining its UUID for the JPEG.
    for (const file of [oldImage, oldImage + '.meta']) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.writeFileSync(output, bytes);
    asset.files = ['.json', '.jpg'];
    asset.userData.width = prepared.width;asset.userData.height = prepared.height;
    asset.userData.hasAlpha = false;
    fs.writeFileSync(output + '.meta', JSON.stringify(asset, null, 2) + '\n');
    files.push({style, width: prepared.width, height: prepared.height,
      format: 'jpeg', quality, chromaSubsampling: '4:4:4',
      sourceWidth: meta.width, sourceHeight: meta.height,
      bytes: bytes.length, sha256: hash(bytes),
      bundle: 'victory-0' + style, resource: name, source: path.basename(input)});
  }
  fs.writeFileSync(path.join(source, 'production-assets.json'), JSON.stringify({
    source: 'Built-in image_gen originals; user-authorized mobile-size compression',
    reencoding: '720 px wide JPEG quality 84, 4:4:4 chroma; original design files retained', files,
  }, null, 2));
  console.log(JSON.stringify(files, null, 2));
})().catch(error => {console.error(error);process.exitCode = 1;});
