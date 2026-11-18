'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root,
  '../../design/style-exploration/illustrated/revision-2');
const output = path.join(root, 'assets/resources/themes');

/** Preserve stable UUIDs when regenerating compressed theme images. */
function metadata(file, width, height) {
  if (fs.existsSync(file + '.meta')) {
    return;
  }
  const uuid = crypto.randomUUID();
  const name = path.basename(file, '.jpg');
  const texture = uuid + '@6c48a';
  const meta = {
    ver: '1.0.27', importer: 'image', imported: true, uuid,
    files: ['.json', '.jpg'],
    subMetas: {
      '6c48a': {
        importer: 'texture', uuid: texture, displayName: name,
        id: '6c48a', name: 'texture', ver: '1.0.22',
        imported: true, files: ['.json'], subMetas: {},
        userData: {
          wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge',
          minfilter: 'linear', magfilter: 'linear', mipfilter: 'none',
          anisotropy: 0, isUuid: true,
          imageUuidOrDatabaseUri: uuid, visible: false,
        },
      },
    },
    userData: {
      type: 'texture', fixAlphaTransparencyArtifacts: false,
      hasAlpha: false, redirect: texture, width, height,
    },
  };
  fs.writeFileSync(file + '.meta', JSON.stringify(meta, null, 2));
}

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const report = [];
  for (const id of ['01', '02', '07', '09']) {
    const input = path.join(source, `style-${id}/assets/scene.png`);
    for (const [prefix, width, height, quality] of [
      ['style', 720, 1520, 62], ['thumb', 120, 254, 55],
    ]) {
      const file = path.join(output, `${prefix}-${id}.jpg`);
      await sharp(input).resize(width, height, {fit: 'fill'})
        .jpeg({quality, mozjpeg: true, chromaSubsampling: '4:2:0'})
        .toFile(file);
      metadata(file, width, height);
      report.push({file: path.basename(file), bytes: fs.statSync(file).size});
    }
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
