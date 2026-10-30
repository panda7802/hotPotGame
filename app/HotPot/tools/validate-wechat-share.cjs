'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const source = path.join(__dirname,
  '../assets/scripts/core/WechatShareService.ts');
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019,
  },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, {exports: exportsObject, console});
const {WechatShareService} = exportsObject;
const browser = new WechatShareService();
browser.start();
assert.equal(browser.share(), 'unsupported');
browser.dispose();
const callbacks = new Set(), messages = [], menus = [];
const host = {
  onShareAppMessage: listener => callbacks.add(listener),
  offShareAppMessage: listener => assert(callbacks.delete(listener)),
  showShareMenu: options => menus.push(options),
  shareAppMessage: message => messages.push(message),
};
const service = new WechatShareService(host);
service.start();
service.start();
assert.equal(callbacks.size, 1);
assert.equal(menus.length, 1);
assert.equal(menus[0].menus.join(','), 'shareAppMessage');
const menu = [...callbacks][0]();
assert(menu.title.includes('锅里捞啥'));
assert.equal(menu.query, 'source=share&entry=menu');
assert.equal(service.share(), 'opened');
assert.equal(messages.length, 1);
assert.equal(messages[0].title, menu.title);
assert.equal(messages[0].query, 'source=share&entry=button');
assert.deepEqual(Object.keys(messages[0]).sort(), ['query', 'title']);
host.shareAppMessage = () => { throw Error('unavailable'); };
assert.equal(service.share(), 'failed');
service.dispose();
service.dispose();
assert.equal(callbacks.size, 0);
service.start();
assert.equal(callbacks.size, 1);
service.dispose();
const oldClient = new WechatShareService({
  shareAppMessage: () => {},
});
oldClient.start();
assert.equal(oldClient.share(), 'opened');
oldClient.dispose();
const brokenMenu = new WechatShareService({
  onShareAppMessage: () => { throw Error('unavailable'); },
  shareAppMessage: () => {},
});
brokenMenu.start();
assert.equal(brokenMenu.share(), 'opened');
console.log('WeChat share: menu/button, lifecycle, old client, errors and ' +
  'browser fallback passed; no success callback or player data sent.');
