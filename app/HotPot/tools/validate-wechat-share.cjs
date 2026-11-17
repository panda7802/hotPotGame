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
assert.equal(menu.imageUrl, 'share-card.jpg');
const shareCard = fs.readFileSync(path.join(__dirname,
  '../build-templates/wechatgame', menu.imageUrl));
assert.equal(shareCard.readUInt16BE(0), 0xffd8);
assert.equal(service.share(), 'opened');
assert.equal(messages.length, 1);
assert.equal(messages[0].title, menu.title);
assert.equal(messages[0].query, 'source=share&entry=button');
assert.equal(messages[0].imageUrl, menu.imageUrl);
assert.deepEqual(Object.keys(messages[0]).sort(), ['imageUrl', 'query', 'title']);
assert.equal(service.share('试做番茄豆腐汤', 'tomato-tofu@1'), 'opened');
assert.equal(messages[1].query, 'source=share&entry=button&recipe=tomato-tofu%401');
assert.equal(messages[1].imageUrl, menu.imageUrl);
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

let view = {page: 'match', style: 4}, friendMenu, timelineMenu;
const themed = new WechatShareService({
  onShareAppMessage: callback => { friendMenu = callback; },
  onShareTimeline: callback => { timelineMenu = callback; },
  shareAppMessage: message => messages.push(message),
}, () => view);
themed.start();
for (const style of [1, 4, 8, 9]) {
  for (const page of ['match', 'cooking', 'collection', 'recipe', 'achievements', 'general']) {
    view = {page, style};
    const expected = page === 'general' ? 'share-card.jpg' : `share-covers/${page}-${style}.jpg`;
    assert.equal(friendMenu().imageUrl, expected);
    assert.equal(timelineMenu().imageUrl, expected);
    assert.equal(timelineMenu().query, 'source=share&entry=timeline');
    assert.equal(themed.share(), 'opened');
    assert.equal(messages.at(-1).imageUrl, expected);
    const cover = fs.readFileSync(path.join(__dirname, '../build-templates/wechatgame', expected));
    assert.equal(cover.readUInt16BE(0), 0xffd8);
  }
}
view = {page: 'recipe', style: 8};
assert.equal(themed.share('试做番茄豆腐汤', 'tomato-tofu@1'), 'opened');
assert.equal(messages.at(-1).imageUrl, 'share-covers/recipe-8.jpg');
assert.equal(messages.at(-1).query, 'source=share&entry=button&recipe=tomato-tofu%401');
console.log('WeChat share: five themed page covers, a common cover, friend/menu/timeline and recipe links OK');
