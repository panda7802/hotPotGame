'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
let sharp;
for (const modulePath of ['sharp', path.join(os.homedir(),
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')]) {
  try {sharp = require(modulePath); break;} catch {}
}
if (!sharp) throw Error('Install sharp or use the bundled Codex Node runtime.');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../../design/hidden-ingredients-20261103');
const names = ['kingcrab', 'bluelobster', 'coralgrouper', 'geoduck', 'seacucumber',
  'fishmaw', 'matsutake', 'morel', 'blacktruffle', 'caviar'];
const labels = ['帝王蟹', '蓝龙虾', '东星斑', '象拔蚌', '海参',
  '花胶', '松茸', '羊肚菌', '黑松露', '鱼子酱'];
(async () => {
  const layers = [], previews = [];
  for (const [i, id] of names.entries()) {
    const input = path.join(source, id + '.png');
    const meta = await sharp(input).metadata();
    if (!meta.hasAlpha) throw Error('Transparent source required: ' + id);
    const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    for (const pixel of [0, info.width - 1, (info.height - 1) * info.width,
      info.width * info.height - 1]) {
      if (data[pixel * 4 + 3] > 2) throw Error('Opaque source corner: ' + id);
    }
    const icon = await sharp(input).trim({threshold: 8}).resize(148, 148,
      {fit: 'contain', background: '#00000000'}).extend({top: 6, bottom: 6,
      left: 6, right: 6, background: '#00000000'}).png().toBuffer();
    layers.push({input: icon, left: i % 5 * 160, top: Math.floor(i / 5) * 160});
    previews.push({input: await sharp(icon).resize(200, 200).toBuffer(),
      left: i % 5 * 240 + 20, top: Math.floor(i / 5) * 280 + 20});
  }
  const target = path.join(root, 'assets/resources/ingredients/food-c.png');
  await sharp({create: {width: 800, height: 800, channels: 4, background: '#00000000'}})
    .composite(layers).png({palette: true, colours: 256, compressionLevel: 9,
      effort: 10}).toFile(target);
  if (!fs.existsSync(target + '.meta')) {
    const meta = JSON.parse(fs.readFileSync(path.join(path.dirname(target), 'food-b.png.meta')));
    const json = JSON.stringify(meta, null, 2).replaceAll(meta.uuid, crypto.randomUUID())
      .replaceAll('food-b', 'food-c');
    fs.writeFileSync(target + '.meta', json + '\n');
  }
  const text = labels.map((label, i) => `<text x="${i % 5 * 240 + 120}" ` +
    `y="${Math.floor(i / 5) * 280 + 251}" text-anchor="middle">${label}</text>`).join('');
  const svg = `<svg width="1200" height="560"><g font-family="Microsoft YaHei, sans-serif" ` +
    `font-size="24" fill="#E9D5A7">${text}</g></svg>`;
  previews.push({input: Buffer.from(svg), left: 0, top: 0});
  await sharp({create: {width: 1200, height: 560, channels: 4, background: '#18382F'}})
    .composite(previews).png().toFile(path.join(source, 'preview.png'));
  console.log('10 hidden icons packed: ' + fs.statSync(target).size + ' bytes, 800×800 RGBA.');
})().catch(error => {console.error(error); process.exitCode = 1;});
