'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../../design/style-exploration/assets');

/** Repack approved cells without redrawing; the rejected meat cell is unused. */
(async () => {
  const atlas = path.join(source, 'new-27-ivory.png');
  const {width, height} = await sharp(atlas).metadata();
  const cell = 160;
  const layers = [];
  for (let i = 0; i < 27; i++) {
    const left = Math.round((i % 6) * width / 6);
    // The approved sheet has a few detached pixels from the row above.
    // Keep the food intact and discard only the empty top gutter of rows 2/3.
    const gutter = i >= 6 && i < 12 ? 16 : i >= 12 && i < 18 ? 10 : 0;
    const top = Math.round(Math.floor(i / 6) * height / 5) + gutter;
    const image = i === 0 ? sharp(path.join(source, 'okra-v1.png'))
      : sharp(atlas).extract({left, top,
        width: Math.round((i % 6 + 1) * width / 6) - left,
        height: Math.round((Math.floor(i / 6) + 1) * height / 5) - top});
    layers.push({input: await image.resize(cell, cell, {fit: 'contain',
      background: '#fff5df'}).png().toBuffer(),
    left: i % 6 * cell, top: Math.floor(i / 6) * cell});
  }
  const output = path.join(root, 'assets/resources/ingredients/new-27-atlas.png');
  await sharp({create: {width: cell * 6, height: cell * 5, channels: 3,
    background: '#fff5df'}}).composite(layers).png({palette: true,
    colours: 256, compressionLevel: 9, effort: 10}).toFile(output);
  const metaFile = output + '.meta';
  if (!fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(path.join(path.dirname(output),
      'expanded-atlas.png.meta'), 'utf8'));
    const uuid = crypto.randomUUID();
    const old = meta.uuid;
    fs.writeFileSync(metaFile, JSON.stringify(meta).replaceAll(old, uuid)
      .replaceAll('expanded-atlas', 'new-27-atlas'));
  }
  console.log(`27 approved ingredient sprites: ${fs.statSync(output).size} bytes`);
})().catch((error) => {console.error(error); process.exitCode = 1;});
