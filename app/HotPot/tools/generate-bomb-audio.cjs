'use strict';

// Original procedural effect: low thump, broadband burst and crackling tail.
// Reproduce with Node.js and ffmpeg; no external samples or network required.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const rate = 22050;
const duration = 0.72;
const count = Math.ceil(rate * duration);
const samples = new Float64Array(count);
let seed = 72149;
let lowNoise = 0;
let phase = 0;
for (let i = 0; i < count; i++) {
  const t = i / rate;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const noise = seed / 2147483648 - 1;
  lowNoise += 0.16 * (noise - lowNoise);
  phase += 2 * Math.PI * (42 + 100 * Math.exp(-t * 28)) / rate;
  const attack = Math.min(1, t / 0.002);
  const thump = Math.sin(phase) * Math.exp(-t * 11) * 0.8;
  const blast = lowNoise * Math.exp(-t * 7.5) * 2.4;
  const crack = noise * Math.exp(-t * 45) * 0.3;
  const tail = noise * Math.pow(Math.max(0, Math.sin(t * 170)), 12)
    * Math.exp(-t * 8) * 0.22;
  samples[i] = attack * (thump + blast + crack + tail)
    * Math.min(1, (duration - t) / 0.07);
}
const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
samples.forEach((sample, i) => {
  wav.writeInt16LE(Math.round(sample / peak * 0.88 * 32767), 44 + i * 2);
});
const temp = path.join(root, 'temp/bomb-audio');
fs.mkdirSync(temp, {recursive: true});
const input = path.join(temp, 'bomb.wav');
const output = path.join(root, 'assets/resources/audio/bomb.mp3');
fs.writeFileSync(input, wav);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-i', input, '-codec:a', 'libmp3lame', '-b:a', '40k', '-ac', '1', output]);
console.log(`Bomb audio: ${duration}s, ${fs.statSync(output).size} bytes`);
