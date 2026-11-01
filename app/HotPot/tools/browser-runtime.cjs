'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve the runtime on this computer, rather than the previous author's home.
const candidates = [
  process.env.HOTPOT_PLAYWRIGHT_PATH,
  'playwright',
  path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),
].filter(Boolean);
let playwright;
for (const candidate of candidates) {
  let resolved;
  try { resolved = require.resolve(candidate); } catch { continue; }
  playwright = require(resolved);
  break;
}
if (!playwright) throw Error('Playwright unavailable. Set HOTPOT_PLAYWRIGHT_PATH to its module directory.');

const browsers = [
  process.env.HOTPOT_BROWSER_PATH,
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
].filter(Boolean);
const executablePath = browsers.find(file => fs.existsSync(file));
exports.chromium = playwright.chromium;
exports.launchOptions = {headless: true, ...(executablePath ? {executablePath} : {})};
