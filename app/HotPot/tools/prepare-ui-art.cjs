'use strict';
// Build-sized exports of approved source art; source designs remain untouched.
// Run with sharp available through NODE_PATH (or installed in the tooling runtime).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../../design/ui-c-ingredients');
const exportsToBuild = [
  ['new-ingredients-atlas.png', 'ingredients/expanded-atlas.png', 1024, 512],
  ['extra-meat-yam-atlas-source.png', 'ingredients/extra-meat-yam-atlas.png', 768, 256],
  ['modal-emblems-c-source.png', 'backgrounds/modal-emblems-c.png', 768, 384],
  ['panel-skin-c-source.png', 'backgrounds/panel-skin-c.png', 512, 768],
  ['button-skins-c-source.png', 'backgrounds/button-skins-c.png', 768, 128],
];
/**
 * 为测试提供当前调用所需的回调行为。
 */
( async () => {
  for (const [input, output, width, height] of exportsToBuild) {
    const target = path.join(root, 'assets/resources', output);
    let image = sharp(path.join(source, input));
    if (input === 'button-skins-c-source.png') {
      const metadata = await image.metadata();
      image = image.extract({
        left: 0, top: Math.round(metadata.height * 0.3177),
        width: metadata.width, height: Math.round(metadata.height * 0.333)
      });
    }
    await image.resize(width, height, {fit: 'fill'})
      .png({compressionLevel: 9, palette: true, colours: 256, dither: 0.7, effort: 10}).toFile(target);
    console.log(`${output}: ${width}x${height}, ${fs.statSync(target).size} bytes`);
  }
/**
 * 记录异步失败并设置任务退出状态。
 */
})().catch( error => {console.error(error); process.exitCode = 1;});
