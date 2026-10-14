'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const creatorRoot = process.env.COCOS_CREATOR_388 || 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8';
const ts = require(path.join(creatorRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'typescript'));
const root = path.resolve(__dirname, '..');
const modules = {};
function load(filename) {
    filename = path.resolve(filename);
    if (modules[filename]) return modules[filename];
    const compiled = ts.transpileModule(fs.readFileSync(filename + '.ts', 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, experimentalDecorators: true},
        reportDiagnostics: true, fileName: filename + '.ts',
    });
    assert.strictEqual(compiled.diagnostics.length, 0);
    const exports = {};
    vm.runInNewContext(compiled.outputText, {exports, setTimeout, clearTimeout, console,
        require: name => load(path.resolve(path.dirname(filename), name))});
    modules[filename] = exports;
    return exports;
}
const data = load(path.join(root, 'assets/scripts/data/GameData'));
const domain = load(path.join(root, 'assets/scripts/data/PlayerData'));
const configDomain = load(path.join(root, 'assets/scripts/data/CloudConfig'));
const {PlayerService} = load(path.join(root, 'assets/scripts/core/PlayerService'));
const regions = domain.validateRegions(JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/data/regions.json'), 'utf8')));
const {createHandler} = require(path.join(root, 'cloudfunctions/hotpotPlayerDev/handler'));
const plain = value => JSON.parse(JSON.stringify(value));

function freshSave(index) {
    const level = data.createLevel(index);
    return {version: 1, boardVersion: domain.BOARD_VERSION, levelIndex: index,
        types: level.tiles.map(tile => tile.type), removedIds: [], tray: [], reserve: [], reviveUsed: false,
        rewardedMilestones: 0, toolUses: index ? {undo: 1, bomb: 1, shuffle: 1} : {undo: 0, bomb: 0, shuffle: 0},
        lastMove: null, status: 'playing'};
}
function pick(save, id) {
    const level = domain.restoreLevel(save);
    const tile = level.tiles.find(item => item.id === id);
    assert(!tile.removed && tile.blockedBy.every(blocker => level.tiles.find(item => item.id === blocker).removed));
    save.lastMove = {removedIds: save.removedIds.slice(), tray: save.tray.slice(), reserve: save.reserve.slice()};
    save.removedIds.push(id);
    const at = save.tray.lastIndexOf(tile.type);
    save.tray.splice(at >= 0 ? at + 1 : save.tray.length, 0, tile.type);
    const start = save.tray.findIndex((type, i) => type === save.tray[i + 1] && type === save.tray[i + 2]);
    if (start >= 0) save.tray.splice(start, 3);
    const cleared = save.removedIds.length - save.tray.length - save.reserve.length;
    if (save.levelIndex === 2 && Math.floor(cleared / 100) > save.rewardedMilestones) {
        save.toolUses.undo += Math.floor(cleared / 100) - save.rewardedMilestones;
        save.rewardedMilestones = Math.floor(cleared / 100);
    }
    if (cleared === level.total) save.status = 'won';
    else if (save.tray.length === 7) save.status = 'lost';
    return save;
}

for (let index = 0; index < 3; index += 1) {
    const save = freshSave(index);
    assert.deepStrictEqual(plain(domain.validateGameSave(save)), plain(save));
    const level = data.createLevel(index);
    for (let layer = level.config.layers.length - 1; layer >= 0; layer -= 1) {
        const types = [...new Set(level.tiles.filter(tile => tile.layer === layer).map(tile => tile.type))];
        for (const type of types) {
            for (const tile of level.tiles.filter(tile => tile.layer === layer && tile.type === type)) {
                pick(save, tile.id);
                assert.deepStrictEqual(plain(domain.validateGameSave(JSON.parse(JSON.stringify(save)))), plain(save));
            }
        }
    }
    assert.strictEqual(save.status, 'won');
    assert(domain.restoreLevel(save).tiles.every(tile => tile.removed));
    assert(Buffer.byteLength(JSON.stringify(save), 'utf8') < 100000);
}
const flipped = freshSave(1);
[flipped.types[0], flipped.types[5]] = [flipped.types[5], flipped.types[0]];
assert.deepStrictEqual(plain(domain.restoreLevel(flipped).tiles.map(tile => tile.type)), plain(flipped.types));
const invalid = freshSave(0);
invalid.tray = ['beef', 'beef', 'beef'];
assert.throws(() => domain.validateGameSave(invalid));
for (const patch of [{boardVersion: 'unknown'}, {levelIndex: 99}, {removedIds: ['L9T999']},
    {rewardedMilestones: 1}, {toolUses: {undo: 999, bomb: 1, shuffle: 1}}, {status: 'won'}, {types: ['beef']}]) {
    assert.throws(() => domain.validateGameSave({...freshSave(0), ...patch}));
}
assert.strictEqual(domain.regionPath(regions, ['320000', '320100', '320106']).map(item => item.name).join('/'), '江苏省/南京市/鼓楼区');
assert.strictEqual(domain.regionPath(regions, ['OVERSEAS'])[0].name, '海外');
assert.strictEqual(domain.regionPath(regions, ['110000'])[0].name, '北京市');
assert.throws(() => domain.regionPath(regions, ['320000']));
assert.throws(() => domain.regionPath(regions, ['320000', '320100', '320205']));
assert.throws(() => domain.validateRegions([{code: 'x', name: 'unknown'}]));
assert.throws(() => domain.validateRegions([{code: '110000', name: 'a'}, {code: '110000', name: 'b'}]));
console.log('Every stable move across 936 tiles: save validation and complete round-trip; regions and bad input: OK');

const settings = {enabled: true, environmentId: 'hotpot-dev-test', regionsFileId: 'cloud://hotpot-dev-test.bucket/res/regions.json',
    allowSharedEnvironment: false,
    functionName: 'hotpotPlayerDev', collectionName: 'hotpot_players_dev', appId: 'wx943cc2d81ec6f820'};

function backend() {
    const documents = new Map();
    let transactionQueue = Promise.resolve();
    let dbCalls = 0;
    let downloadReads = 0;
    let context = {OPENID: 'alice', APPID: settings.appId, ENV: settings.environmentId};
    const cloud = {
        getWXContext: () => ({...context}),
        async downloadFile({fileID}) {
            assert.strictEqual(fileID, settings.regionsFileId);
            downloadReads += 1;
            return {fileContent: Buffer.from(JSON.stringify(regions), 'utf8')};
        },
        database: () => {
            dbCalls += 1;
            return {runTransaction(callback) {
                const run = transactionQueue.then(async () => {
                    const updates = new Map();
                    const transaction = {collection(name) {
                        assert.strictEqual(name, settings.collectionName);
                        return {doc(id) {return {
                            async get() {
                                if (!documents.has(id)) throw new Error('document with _id id does not exist');
                                return {data: plain(documents.get(id))};
                            },
                            async set({data}) {updates.set(id, plain(data));},
                        };}};
                    }};
                    const result = await callback(transaction);
                    for (const [key, value] of updates) documents.set(key, value);
                    return {result, errMsg: 'runTransaction:ok'};
                });
                transactionQueue = run.catch(() => {});
                return run;
            }};
        },
    };
    return {cloud, documents, handler: createHandler(cloud, settings, domain, regions),
        setUser(name) {context.OPENID = name;}, setEnvironment(env) {context.ENV = env;},
        setApp(id) {context.APPID = id;}, get dbCalls() {return dbCalls;}, get downloadReads() {return downloadReads;}};
}

function storage() {
    const items = new Map();
    return {items, getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value)};
}
function wxClient(server, options = {}) {
    return {cloud: {
        init({env}) {assert.strictEqual(env, settings.environmentId); options.initCount = (options.initCount || 0) + 1;},
        downloadFile({success, fail}) {
            if (options.failRegion) fail(new Error('Permission denied'));
            else success({tempFilePath: '/regions.json'});
        },
        callFunction({data, success, fail}) {
            if (options.offline) {fail(new Error('Offline')); return;}
            Promise.resolve().then(() => server.handler(data)).then(async result => {
                if (data.action === 'save' && options.saveGate) await options.saveGate;
                if (data.action === 'save' && options.loseResponse) {
                    options.loseResponse = false; fail(new Error('Response lost after commit'));
                } else success({result});
            }).catch(fail);
        },
    }, getFileSystemManager() {return {readFile({success}) {success({data: JSON.stringify(regions)});}};}};
}
function service(server, localStorage = storage(), options = {}, config = settings) {
    const instance = new PlayerService(regions, localStorage, wxClient(server, options), config);
    instance.schedule = () => {}; // Tests explicitly drain queues; no background timers.
    return instance;
}

(async () => {
    const server = backend();
    const original = await server.handler({action: 'load', openid: 'bob', playerId: 'fake'});
    assert(original.ok && original.player.playerId.length === 32);
    const alice = original.player.playerId;
    let state = {profile: {regionCodes: ['320000', '320100', '320106']}, save: freshSave(1)};
    let response = await server.handler({action: 'save', expectedRevision: 0, mutationId: 'mutation-0000001', state, openid: 'bob'});
    assert(response.ok);
    assert.strictEqual(response.player.revision, 1);
    response = await server.handler({action: 'save', expectedRevision: 0, mutationId: 'mutation-0000001', state});
    assert.strictEqual(response.player.revision, 1, 'lost response retry must not advance revision twice');
    const concurrent = await Promise.all(['mutation-0000002', 'mutation-0000003'].map(mutationId =>
        server.handler({action: 'save', expectedRevision: 1, mutationId, state})));
    assert.strictEqual(concurrent.filter(item => item.conflict).length, 1);
    assert.strictEqual(server.documents.get(alice).revision, 2);
    assert.strictEqual((await server.handler({action: 'save', expectedRevision: 2, mutationId: 'mutation-0000004',
        state: {...state, profile: {regionCodes: ['320000']}}})).code, 'INVALID_STATE');
    server.setUser('bob');
    response = await server.handler({action: 'load', openid: 'alice', playerId: alice});
    assert.notStrictEqual(response.player.playerId, alice);
    assert.strictEqual(response.player.state.save, null);
    assert(!JSON.stringify(response).includes('alice'));
    assert(!JSON.stringify(response).includes('_openid'));
    server.setEnvironment(configDomain.RELEASE_ENVIRONMENT_ID);
    const callsBefore = server.dbCalls;
    assert.strictEqual((await server.handler({action: 'load'})).code, 'DEVELOPMENT_ENV_REQUIRED');
    assert.strictEqual(server.dbCalls, callsBefore);
    server.setEnvironment(settings.environmentId); server.setApp('wrong-app');
    assert.strictEqual((await server.handler({action: 'load'})).code, 'IDENTITY_REQUIRED');
    console.log('Server identity isolation, atomic CAS, idempotency, sanitization and release-environment guard: OK');

    const privateFileServer = backend();
    const privateFileClient = service(privateFileServer, storage(), {failRegion: true});
    await privateFileClient.initialize();
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(privateFileServer.downloadReads, 1, 'a private original file is read through the Dev function without permission changes');
    assert.strictEqual(privateFileClient.status, 'synced');
    configDomain.validateDevelopmentConfig({...settings, environmentId: configDomain.RELEASE_ENVIRONMENT_ID,
        allowSharedEnvironment: true, regionsFileId: `cloud://${configDomain.RELEASE_ENVIRONMENT_ID}.bucket/res/regions.json`});
    assert.throws(() => configDomain.validateDevelopmentConfig({...settings, collectionName: 'production_players'}));
    assert.throws(() => configDomain.validateDevelopmentConfig({...settings, functionName: 'productionPlayer'}));
    console.log('Read-only private region-file access and explicitly authorized shared environment with fixed Dev names: OK');

    const syncServer = backend();
    const cache = storage();
    const options = {};
    const first = service(syncServer, cache, options);
    await first.initialize();
    assert.strictEqual(first.status, 'synced');
    first.setRegion(['OVERSEAS']); first.setSave(freshSave(2));
    await first.flush();
    assert.strictEqual(first.revision, 1);
    const samePhone = service(syncServer, cache);
    await samePhone.initialize();
    assert.deepStrictEqual(plain(samePhone.state), plain(first.state));
    const newPhone = service(syncServer);
    await newPhone.initialize();
    assert.deepStrictEqual(plain(newPhone.state), plain(first.state), 'another device restores region and checkpoint');
    options.offline = true;
    first.setRegion(['110000']); await first.flush();
    assert.strictEqual(first.status, 'error');
    assert.deepStrictEqual(plain(first.state.profile.regionCodes), ['110000']);
    options.offline = false; options.loseResponse = true;
    await first.flush();
    assert.strictEqual(first.status, 'error');
    assert.strictEqual(first.revision, 1);
    await first.flush();
    assert.strictEqual(first.revision, 2);
    assert.strictEqual(first.status, 'synced');
    assert.strictEqual(syncServer.documents.get(first.playerId).revision, 2);
    newPhone.setRegion(['OVERSEAS']); newPhone.setSave(freshSave(0));
    await newPhone.flush();
    assert.strictEqual(newPhone.status, 'conflict');
    assert.strictEqual(newPhone.remote.revision, 2);
    newPhone.resolveConflict(true);
    assert.deepStrictEqual(plain(newPhone.state.profile.regionCodes), ['110000']);
    assert.strictEqual(newPhone.state.save.levelIndex, 2);
    first.setRegion(['OVERSEAS']); await first.flush();
    newPhone.setRegion(['310000']); await newPhone.flush();
    assert.strictEqual(newPhone.status, 'conflict');
    newPhone.resolveConflict(false); await newPhone.flush();
    assert.strictEqual(newPhone.status, 'synced');
    assert.deepStrictEqual(plain(syncServer.documents.get(first.playerId).state.profile.regionCodes), ['310000']);
    console.log('Full client/server flow: cross-device restore, offline queue, lost response retry and both conflict choices: OK');

    // An edit arriving while the first request is pending must be sent with the new revision.
    let release;
    const gate = new Promise(resolve => {release = resolve;});
    const inFlightOptions = {saveGate: gate};
    const inFlight = service(syncServer, storage(), inFlightOptions);
    await inFlight.initialize();
    inFlight.setRegion(['OVERSEAS']);
    const flushing = inFlight.flush();
    await new Promise(resolve => setImmediate(resolve));
    inFlight.setRegion(['110000']); release();
    await flushing;
    assert.strictEqual(inFlight.status, 'synced');
    assert.deepStrictEqual(plain(syncServer.documents.get(inFlight.playerId).state.profile.regionCodes), ['110000']);
    assert.strictEqual(syncServer.documents.get(inFlight.playerId).revision, 6);
    syncServer.setUser('bob');
    const switched = service(syncServer, cache);
    await switched.initialize();
    assert.notStrictEqual(switched.playerId, first.playerId);
    assert.strictEqual(switched.state.save, null, 'account switching must not inherit another user cache');
    const offlineIdentity = service(syncServer, cache, {offline: true});
    await offlineIdentity.initialize();
    assert.strictEqual(offlineIdentity.playerId, null);
    assert.strictEqual(offlineIdentity.state.save, null, 'unverified identity must not expose private cached progress');
    const guardedOptions = {};
    const guarded = service(syncServer, storage(), guardedOptions, {...settings, environmentId: configDomain.RELEASE_ENVIRONMENT_ID});
    await guarded.initialize();
    assert.strictEqual(guarded.status, 'error');
    assert.strictEqual(guardedOptions.initCount, undefined, 'release guard runs before wx.cloud.init');
    const local = new PlayerService(regions, storage(), undefined, {...settings, enabled: false});
    local.setRegion(['OVERSEAS']); local.setSave(freshSave(2));
    await local.initialize(); assert.strictEqual(local.status, 'local');
    const brokenStorage = {getItem: () => '{broken', setItem: () => {throw new Error('Storage unavailable');}};
    const broken = new PlayerService(regions, brokenStorage, undefined, {...settings, enabled: false});
    assert.strictEqual(broken.state.save, null);
    broken.setSave(freshSave(0));
    assert(!broken.storageAvailable && broken.statusText.includes('不可用'));
    console.log('Edits during sync, account changes, unverified offline identity, disabled cloud and broken storage: OK');
})().catch(error => {console.error(error); process.exitCode = 1;});
