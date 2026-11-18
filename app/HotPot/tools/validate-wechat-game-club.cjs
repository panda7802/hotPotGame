'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {loadTypeScript} = require('./prepare-cloud.cjs');
const ts = loadTypeScript();
const expectedBuild = fs.readFileSync(path.join(__dirname,
  '../assets/scripts/core/HotPotTileSkin.ts'), 'utf8').match(/CLIENT_BUILD\s*=\s*'([^']+)'/)[1];
const source = fs.readFileSync(path.join(__dirname,
  '../assets/scripts/core/WechatGameClubService.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019,
}}).outputText;
const exported = {};
vm.runInNewContext(compiled, {exports: exported, console});
let {WechatGameClubService} = exported;
const bundle = process.argv[2] && path.resolve(process.argv[2]);
if (bundle) {
  const records = new Map(), loaded = new Map();
  const environment = {System: {register(name, dependencies, declare) {
    if (typeof name === 'string') records.set(name, {dependencies, declare});
    else dependencies(() => {}, {}).execute();
  }}};
  const main = fs.readFileSync(path.join(bundle, 'subpackages/main/game.js'), 'utf8');
  assert(main.includes(expectedBuild), 'Stale WeChat bundle');
  vm.runInNewContext(fs.readFileSync(path.join(bundle, 'src/chunks/bundle.js'),
    'utf8'), environment);
  vm.runInNewContext(main, environment);
  function load(name) {
    if (name === 'cc') return {cclegacy: {_RF: {push() {}, pop() {}}}};
    if (loaded.has(name)) return loaded.get(name);
    const r = records.get(name); assert(r, 'Missing bundled module: ' + name);
    const values = {}; loaded.set(name, values);
    const module = r.declare((key, value) => {
      if (typeof key === 'string') values[key] = value;
      else Object.assign(values, key);
      return value;
    }, {meta: {url: name}});
    r.dependencies.forEach((dependency, i) => module.setters[i]?.(load(
      dependency.startsWith('.') ? new URL(dependency, name).href : dependency)));
    module.execute(); return values;
  }
  WechatGameClubService = load('chunks:///_virtual/WechatGameClubService.ts')
    .WechatGameClubService;
  const configured = load('chunks:///_virtual/GameClubConfig.ts').GAME_CLUB_OPENLINK;
  const expected = fs.readFileSync(path.join(__dirname,
    '../assets/scripts/data/GameClubConfig.ts'), 'utf8')
    .match(/GAME_CLUB_OPENLINK\s*=\s*'([^']+)'/)[1];
  assert.equal(configured, expected, 'Configured home openlink must match source');
  assert(configured.startsWith('-SSEykJv'));
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
(async () => {
  const browser = new WechatGameClubService();
  assert.equal((await browser.open('fixture')).status, 'unsupported');
  browser.dispose();
  const events = [];
  let loads = 0, shown = 0, destroyed = 0;
  const host = {createPageManager() {
    events.push('create');
    return {async load(options) {
      loads++; events.push('load'); assert.equal(options.openlink, 'fixture');
    }, async show() {shown++; events.push('show');},
    destroy() {destroyed++; events.push('destroy');}};
  }};
  const service = new WechatGameClubService(host);
  for (const value of ['', '  ', null, undefined, 123]) {
    assert.equal((await service.open(value)).status, 'unconfigured');
  }
  assert.equal(events.length, 0, 'Missing config must never reach WeChat');
  assert.equal((await service.open(' fixture ')).status, 'opened');
  assert.equal(events.join(','), 'create,load,show');
  assert.equal((await service.open('fixture')).status, 'opened');
  assert.equal(destroyed, 1, 'Reopening releases the previous page');
  service.dispose(); service.dispose(); assert.equal(destroyed, 2);
  for (const code of [-1, -2, -3, -4, -5, -6, -7, -8]) {
    const broken = new WechatGameClubService({createPageManager: () => ({
      async load() {throw {errCode: code, errMsg: 'fixture', errInfo: 'detail'};},
      async show() {assert.fail('load failure must prevent show');},
      destroy() {},
    })});
    const result = await broken.open('fixture');
    assert.equal(result.status, 'failed'); assert.equal(result.code, code);
    assert(result.message.length > 0);
    assert.equal(broken.lastError.errInfo, 'detail');
    assert(!result.message.includes('未开通'), 'Do not infer account status');
  }
  const showFailure = new WechatGameClubService({createPageManager: () => ({
    async load() {}, async show() {throw {code: -6, errInfo: 'offline'};},
    destroy() {destroyed++;},
  })});
  assert.equal((await showFailure.open('fixture')).code, -6);
  assert.equal(destroyed, 3);
  for (const createPageManager of [() => undefined, () => {throw Error('create');}]) {
    const broken = new WechatGameClubService({createPageManager});
    assert.equal((await broken.open('fixture')).status, 'failed');
  }
  const first = deferred(), second = deferred();
  let requests = 0, lateShows = 0, cancellations = 0;
  const racing = new WechatGameClubService({createPageManager() {
    const load = requests++ === 0 ? first : second;
    return {load: () => load.promise, async show() {lateShows++;},
      destroy() {cancellations++;}};
  }});
  const a = racing.open('fixture');
  assert.equal((await racing.open('fixture')).status, 'busy');
  racing.dispose();
  const b = racing.open('fixture');
  first.reject({errCode: -6});
  assert.equal((await a).status, 'cancelled');
  assert.equal((await racing.open('fixture')).status, 'busy',
    'A cancelled request must not clear a newer request lock');
  second.resolve({});
  assert.equal((await b).status, 'opened'); assert.equal(lateShows, 1);
  racing.dispose(); assert.equal(cancellations, 2);
  const late = deferred();
  const closed = new WechatGameClubService({createPageManager: () => ({
    load: () => late.promise, async show() {assert.fail('Late page opened');},
    destroy() {},
  })});
  const pending = closed.open('fixture'); closed.dispose(); late.resolve({});
  assert.equal((await pending).status, 'cancelled');
  console.log('PageManager: load/show order, config, errors -1..-8, duplicate ' +
    'taps, retry, cancellation and stale async results passed.');
  if (bundle) {
    const report = process.env.HOTPOT_WECHAT_CLUB_REPORT || path.resolve(__dirname,
      '../../../tmp/hidden-ingredients-verification-20261103/wechat-game-club.json');
    fs.mkdirSync(path.dirname(report), {recursive: true});
    const mainSha256 = require('crypto').createHash('sha256').update(
      fs.readFileSync(path.join(bundle, 'subpackages/main/game.js'))).digest('hex');
    fs.writeFileSync(report, JSON.stringify({build: expectedBuild,
      mainSha256, bundledService: true, suppliedOpenlinkConfigured: true,
      nativeNavigationVerified: false}, null, 2));
    console.log('Actual WeChat bundled PageManager service passed.');
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
