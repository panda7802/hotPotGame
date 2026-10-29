'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const creatorRoot =
  process.env.COCOS_CREATOR_388 ||
  'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8';
const ts = require(
  path.join(
    creatorRoot,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'typescript',
  ),
);
const root = path.resolve(__dirname, '..');
const modules = {};
const browserRuntime = {};
/**
 * 载入测试模块并创建隔离的运行环境。
 */
function load(filename) {
  filename = path.resolve(filename);
  if (modules[filename]) {
    return modules[filename];
  }
  const compiled = ts.transpileModule(
    fs.readFileSync(filename + '.ts', 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        experimentalDecorators: true,
      },
      reportDiagnostics: true,
      fileName: filename + '.ts',
    },
  );
  assert.strictEqual(compiled.diagnostics.length, 0);
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    globalThis: browserRuntime,
    exports,
    setTimeout,
    clearTimeout,
    console,
    /**
     * 为测试场景提供 require 所需的模拟行为。
     */
    require: (name) => load(path.resolve(path.dirname(filename), name)),
  });
  modules[filename] = exports;
  return exports;
}
const data = load(path.join(root, 'assets/scripts/data/GameData'));
const domain = load(path.join(root, 'assets/scripts/data/PlayerData'));
const collection = load(path.join(root, 'assets/scripts/data/CollectionData'));
const configDomain = load(path.join(root, 'assets/scripts/data/CloudConfig'));
const {PlayerService} = load(
  path.join(root, 'assets/scripts/core/PlayerService'),
);
const regions = domain.validateRegions(
  JSON.parse(
    fs.readFileSync(
      path.join(root, 'assets/resources/data/regions.json'),
      'utf8',
    ),
  ),
);
const {createHandler} = require(
  path.join(root, 'cloudfunctions/hotpotPlayerDev/handler'),
);
assert.strictEqual(
  typeof require(path.join(root, 'cloudfunctions/hotpotPlayerDev/index')).main,
  'function',
  'the deployed function entry must load every runtime module',
);
/**
 * 为测试场景提供 plain 所需的模拟行为。
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * 创建指定关卡的有效测试存档。
 */
function freshSave(index, layoutSeed = 0, ingredientSeed = 0) {
  const level = data.createLevel(index, layoutSeed, undefined, ingredientSeed);
  return {
    version: 1,
    boardVersion: domain.BOARD_VERSION,
    levelIndex: index,
    ...(level.layoutSeed === undefined ? {} : {layoutSeed: level.layoutSeed}),
    ...(level.ingredientSeed === undefined
      ? {}
      : {ingredientSeed: level.ingredientSeed}),
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    ...(level.ingredientPoolVersion === undefined
      ? {} : {ingredientPoolVersion: level.ingredientPoolVersion}),
    types: level.tiles.map((tile) => tile.type),
    removedIds: [],
    tray: [],
    reserve: [],
    reviveUsed: false,
    rewardedMilestones: 0,
    toolUses: index
      ? {undo: 1, bomb: 1, shuffle: 1}
      : {undo: 0, bomb: 0, shuffle: 0},
    lastMove: null,
    status: 'playing',
  };
}
/**
 * 模拟选择一张可取的棋盘牌。
 */
function pick(save, id) {
  const level = domain.restoreLevel(save);
  /**
   * 按条件筛选或判断条目：item.id === id。
   */
  const tile = level.tiles.find((item) => item.id === id);
  /**
   * 按条件筛选或判断条目：level.tiles.find(item => item.id === blocker).removed。
   */
  /**
   * 按条件筛选或判断条目：item.id === blocker。
   */
  assert(
    !tile.removed &&
      tile.blockedBy.every(
        (blocker) => level.tiles.find((item) => item.id === blocker).removed,
      ),
  );
  save.lastMove = {
    removedIds: save.removedIds.slice(),
    tray: save.tray.slice(),
    reserve: save.reserve.slice(),
  };
  save.removedIds.push(id);
  const at = save.tray.lastIndexOf(tile.type);
  save.tray.splice(at >= 0 ? at + 1 : save.tray.length, 0, tile.type);
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  const start = save.tray.findIndex(
    (type, i) => type === save.tray[i + 1] && type === save.tray[i + 2],
  );
  if (start >= 0) {
    save.tray.splice(start, 3);
  }
  const cleared =
    save.removedIds.length - save.tray.length - save.reserve.length;
  if (save.levelIndex === 2
    && Math.floor(cleared / 100) > save.rewardedMilestones) {
    save.toolUses.undo += Math.floor(cleared / 100) - save.rewardedMilestones;
    save.rewardedMilestones = Math.floor(cleared / 100);
  }
  if (cleared === level.total) {
    save.status = 'won';
  } else if (save.tray.length === 7) {
    save.status = 'lost';
  }
  return save;
}

let collected = domain.emptyPlayerState();
for (let index = 0; index < 3; index += 1) {
  const save = freshSave(index);
  assert.deepStrictEqual(plain(domain.validateGameSave(save)), plain(save));
  const level = data.createLevel(index, 0);
  for (let layer = level.config.layers.length - 1; layer >= 0; layer -= 1) {
    /**
     * 按条件筛选或判断条目：tile.layer === layer。
     */
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const types = [
      ...new Set(
        level.tiles
          .filter((tile) => tile.layer === layer)
          .map((tile) => tile.type),
      ),
    ];
    for (const type of types) {
      /**
       * 按条件筛选或判断条目：tile.layer === layer && tile.type === type。
       */
      for (const tile of level.tiles.filter(
        (tile) => tile.layer === layer && tile.type === type,
      )) {
        pick(save, tile.id);
        assert.deepStrictEqual(
          plain(domain.validateGameSave(JSON.parse(JSON.stringify(save)))),
          plain(save),
        );
        collected = domain.validatePlayerState({...collected, save}, regions);
      }
    }
  }
  assert.strictEqual(save.status, 'won');
  /**
   * 按条件筛选或判断条目：tile.removed。
   */
  assert(domain.restoreLevel(save).tiles.every((tile) => tile.removed));
  assert(Buffer.byteLength(JSON.stringify(save), 'utf8') < 100000);
}
// Layout metadata survives serialization, taking tiles, undo snapshots and
// shuffle.
for (const seed of [
  1,
  20261023,
  2147483646,
  data.RANDOM_LAYOUT_SEED_START,
  data.RANDOM_LAYOUT_SEED_START + 1,
  data.RANDOM_LAYOUT_SEED_START + 2,
  data.RANDOM_LAYOUT_SEED_END,
]) {
  const save = freshSave(2, seed);
  const expected = data.createLevel(2, seed);
  /**
   * 提取棋盘几何信息用于一致性检查。
   */
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  const geometry = (level) =>
    plain(level.tiles.map(({id, x, y, blockedBy}) => ({id, x, y, blockedBy})));
  assert.deepStrictEqual(
    geometry(domain.restoreLevel(save)),
    geometry(expected),
  );
  /**
   * 按条件筛选或判断条目：tile.blockedBy.length === 0。
   */
  pick(save, expected.tiles.find((tile) => tile.blockedBy.length === 0).id);
  const restored = domain.restoreLevel(JSON.parse(JSON.stringify(save)));
  assert.strictEqual(restored.layoutSeed, seed);
  assert.deepStrictEqual(geometry(restored), geometry(expected));
  assert.deepStrictEqual(plain(domain.validateGameSave(save)), plain(save));
  [save.types[0], save.types[5]] = [save.types[5], save.types[0]];
  assert.deepStrictEqual(
    geometry(domain.restoreLevel(save)),
    geometry(expected),
    'shuffle must preserve shape',
  );
}
for (const layoutSeed of [
  null,
  -1,
  0,
  1.5,
  '123',
  data.RANDOM_LAYOUT_SEED_END + 1,
  Number.MAX_SAFE_INTEGER,
]) {
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() => domain.validateGameSave({...freshSave(2), layoutSeed}));
}
/**
 * 验证非法输入会被正确拒绝。
 */
assert.throws(() =>
  domain.validateGameSave({...freshSave(1), layoutSeed: 123}),
);
assert.deepStrictEqual(
  plain(domain.restoreLevel(freshSave(2)).tiles),
  plain(data.createLevel(2, 0).tiles),
  'legacy third-level saves must retain their original geometry',
);
console.log(
  'Random layout saves: exact geometry/co' +
    'verage, pick, shuffle, seed validation' +
    ' and legacy restoration: OK',
);
for (const index of [0, 1, 2]) {
  for (const ingredientSeed of [1, 76543, 10000019, data.INGREDIENT_SEED_MAX]) {
    const save = freshSave(
      index,
      index === 2 ? data.RANDOM_LAYOUT_SEED_START + 2 : 0,
      ingredientSeed,
    );
    assert.deepStrictEqual(plain(domain.validateGameSave(save)), plain(save));
    const restored = domain.restoreLevel(save);
    assert.strictEqual(restored.ingredientSeed, ingredientSeed);
    const kinds = new Set(save.types);
    assert.strictEqual(kinds.size, data.LEVELS[index].typeCount);
    assert(!(kinds.has('beef') && kinds.has('lamb')));
    [save.types[0], save.types[save.types.length - 1]] = [
      save.types[save.types.length - 1],
      save.types[0],
    ];
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    assert.deepStrictEqual(
      plain(domain.restoreLevel(save).tiles.map((tile) => tile.type)),
      plain(save.types),
    );
    assert.strictEqual(
      domain.validatePlayerState(
        {
          profile: {regionCodes: []},
          save,
          progress: domain.emptyProgress(),
        },
        regions,
      ).save.ingredientSeed,
      ingredientSeed,
    );
    const badType = kinds.has('beef')
      ? 'lamb'
      : kinds.has('lamb')
        ? 'beef'
        : 'beef';
    const invalid = plain(save);
    invalid.types[0] = badType;
    /**
     * 验证非法输入会被正确拒绝。
     */
    assert.throws(
      () => domain.validateGameSave(invalid),
      'foreign ingredient or beef/lamb coexistence must be rejected',
    );
  }
}
for (const ingredientSeed of [
  null,
  0,
  -1,
  1.5,
  '123',
  data.INGREDIENT_SEED_MAX + 1,
]) {
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() =>
    domain.validateGameSave({...freshSave(0), ingredientSeed}),
  );
}
console.log(
  'Random ingredients: all levels, determ' +
    'inistic seed restore, shuffle preserva' +
    'tion, 50-kind progress, invalid seeds ' +
    'and beef/lamb rejection: OK',
);
assert.strictEqual(collected.progress.discovered.length, 13);
assert.deepStrictEqual(plain(collected.progress.completedLevels), [0, 1, 2]);
assert.deepStrictEqual(plain(collected.progress.cleanWins), [0, 1, 2]);
assert.deepStrictEqual(plain(collected.progress.bestCleared), [18, 30, 888]);
/**
 * 按条件筛选或判断条目：item.unlocked || ['hometown', 'full-menu'].includes(item.id)。
 */
assert(
  collection
    .achievementEntries(collected)
    .every(
      (item) => item.unlocked || ['hometown', 'full-menu'].includes(item.id),
    ),
);
const withRegion = domain.validatePlayerState(
  {...collected, profile: {regionCodes: ['OVERSEAS']}},
  regions,
);
assert.strictEqual(
  domain.localPlayDate(new Date(2026, 9, 23, 0, 1)),
  '2026-10-23',
);
const yesterday = domain.validatePlayerState(
  {...withRegion, save: freshSave(2), playDate: '2026-10-22'},
  regions,
);
const today = domain.enterPlayDay(yesterday, '2026-10-23');
assert.strictEqual(today.save, null);
assert.deepStrictEqual(plain(today.progress), plain(yesterday.progress));
assert.deepStrictEqual(plain(today.profile), plain(yesterday.profile));
const todayPlaying = {...today, save: freshSave(2)};
assert.strictEqual(
  domain.enterPlayDay(todayPlaying, '2026-10-23'),
  todayPlaying,
  'same-day entry retains the current game',
);
assert.strictEqual(
  domain.enterPlayDay(
    domain.validatePlayerState({...withRegion, save: freshSave(2)}, regions),
    '2026-10-23',
  ).save,
  null,
  'legacy undated saves start at level one',
);
for (const playDate of ['2026-02-30', '2026-13-01', 'yesterday', 123]) {
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() =>
    domain.validatePlayerState({...withRegion, playDate}, regions),
  );
}
assert.strictEqual(collection.unlockedAchievementIds(withRegion).length, 13);
const fullMenu = domain.validatePlayerState(
  {
    ...withRegion,
    progress: {
      ...withRegion.progress,
      /**
       * 将当前条目转换为后续处理所需的值。
       */
      discovered: data.INGREDIENTS.map((item) => item.id),
    },
  },
  regions,
);
assert.strictEqual(collection.unlockedAchievementIds(fullMenu).length, 14);
const replay = domain.validatePlayerState(
  {...withRegion, save: freshSave(0), profile: {regionCodes: []}},
  regions,
);
assert.deepStrictEqual(
  plain(replay.progress),
  plain(withRegion.progress),
  'restart and clearing region must retain permanent achievements',
);
assert.deepStrictEqual(
  plain(domain.validatePlayerState(replay, regions)),
  plain(replay),
  'restoring repeatedly must be idempotent',
);
const legacy = freshSave(0);
/**
 * 按条件筛选或判断条目：tile.blockedBy.length === 0。
 */
const firstTile = domain
  .restoreLevel(legacy)
  .tiles.find((tile) => tile.blockedBy.length === 0);
pick(legacy, firstTile.id);
const migrated = domain.validatePlayerState(
  {profile: {regionCodes: []}, save: legacy},
  regions,
);
assert.deepStrictEqual(plain(migrated.progress.discovered), [firstTile.type]);
const undone = domain.validatePlayerState(
  {...migrated, save: freshSave(0)},
  regions,
);
assert.deepStrictEqual(
  plain(undone.progress),
  plain(migrated.progress),
  'undo must not revoke a discovery or add clears',
);
for (const patch of [
  {discovered: ['unknown']},
  {discovered: ['beef', 'beef']},
  {bestCleared: [999, 0, 0]},
  {bestCleared: [1, 0, 0]},
  {cleanWins: [0]},
  {completedLevels: [0]},
  {version: 99},
  {regionChosen: 'yes'},
]) {
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() =>
    domain.validateProgress({...domain.emptyProgress(), ...patch}),
  );
}
assert.deepStrictEqual(
  plain(domain.mergeProgress(replay.progress, migrated.progress)),
  plain(replay.progress),
);
console.log(
  'Collection/achievements: all 13 ingred' +
    'ients and 14 goals, legacy migration, ' +
    'invalid progress, restore/restart/undo' +
    ' idempotency: OK',
);
const flipped = freshSave(1);
[flipped.types[0], flipped.types[5]] = [flipped.types[5], flipped.types[0]];
/**
 * 将当前条目转换为后续处理所需的值。
 */
assert.deepStrictEqual(
  plain(domain.restoreLevel(flipped).tiles.map((tile) => tile.type)),
  plain(flipped.types),
);
const invalid = freshSave(0);
invalid.tray = ['beef', 'beef', 'beef'];
/**
 * 验证非法输入会被正确拒绝。
 */
assert.throws(() => domain.validateGameSave(invalid));
for (const patch of [
  {boardVersion: 'unknown'},
  {levelIndex: 99},
  {removedIds: ['L9T999']},
  {rewardedMilestones: 1},
  {toolUses: {undo: 999, bomb: 1, shuffle: 1}},
  {status: 'won'},
  {types: ['beef']},
]) {
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() => domain.validateGameSave({...freshSave(0), ...patch}));
}
/**
 * 将当前条目转换为后续处理所需的值。
 */
assert.strictEqual(
  domain
    .regionPath(regions, ['320000', '320100', '320106'])
    .map((item) => item.name)
    .join('/'),
  '江苏省/南京市/鼓楼区',
);
assert.strictEqual(domain.regionPath(regions, ['OVERSEAS'])[0].name, '海外');
assert.strictEqual(domain.regionPath(regions, ['110000'])[0].name, '北京市');
/**
 * 验证非法输入会被正确拒绝。
 */
assert.throws(() => domain.regionPath(regions, ['320000']));
/**
 * 验证非法输入会被正确拒绝。
 */
assert.throws(() => domain.regionPath(regions, ['320000', '320100', '320205']));
/**
 * 验证非法输入会被正确拒绝。
 */
assert.throws(() => domain.validateRegions([{code: 'x', name: 'unknown'}]));
/**
 * 验证非法输入会被正确拒绝。
 */
assert.throws(() =>
  domain.validateRegions([
    {code: '110000', name: 'a'},
    {code: '110000', name: 'b'},
  ]),
);
console.log(
  'Every stable move across 936 tiles: sa' +
    've validation and complete round-trip;' +
    ' regions and bad input: OK',
);

const settings = {
  enabled: true,
  environmentId: 'hotpot-dev-test',
  regionsFileId: 'cloud://hotpot-dev-test.bucket/res/regions.json',
  allowSharedEnvironment: false,
  functionName: 'hotpotPlayerDev',
  collectionName: 'hotpot_players_dev',
  appId: 'wx943cc2d81ec6f820',
};

/**
 * 构造隔离的云函数和数据库测试替身。
 */
function backend() {
  const documents = new Map();
  let transactionQueue = Promise.resolve();
  let dbCalls = 0;
  let downloadReads = 0;
  let context = {
    OPENID: 'alice',
    APPID: settings.appId,
    ENV: settings.environmentId,
  };
  const cloud = {
    /**
     * 读取或查找 getWXContext 对应的数据，供测试使用。
     */
    getWXContext: () => ({...context}),
    /**
     * 为测试场景提供 downloadFile 所需的模拟行为。
     */
    async downloadFile({fileID}) {
      assert.strictEqual(fileID, settings.regionsFileId);
      downloadReads += 1;
      return {fileContent: Buffer.from(JSON.stringify(regions), 'utf8')};
    },
    /**
     * 为测试场景提供 database 所需的模拟行为。
     */
    database: () => {
      dbCalls += 1;
      /**
       * 为测试场景提供 runTransaction 所需的模拟行为。
       */
      return {
        runTransaction(callback) {
          /**
           * 处理异步任务完成或失败后的状态。
           */
          const run = transactionQueue.then(async () => {
            const updates = new Map();
            /**
             * 为测试场景提供 collection 所需的模拟行为。
             */
            const transaction = {
              collection(name) {
                assert([
                  settings.collectionName, 'hotpot_region_ranking_dev',
                ].includes(name));
                /**
                 * 为测试场景提供 doc 所需的模拟行为。
                 */
                return {
                  doc(id) {
                    if (name !== settings.collectionName) {
                      id = `${name}:${id}`;
                    }
                    return {
                      /**
                       * 读取或查找 get 对应的数据，供测试使用。
                       */
                      async get() {
                        if (!documents.has(id)) {
                          throw new Error(
                            'document with _id id does not exist',
                          );
                        }
                        return {data: plain(documents.get(id))};
                      },
                      /**
                       * 更新 set 对应的状态。
                       */
                      async set({data}) {
                        updates.set(id, plain(data));
                      },
                    };
                  },
                };
              },
            };
            const result = await callback(transaction);
            for (const [key, value] of updates) documents.set(key, value);
            return {result, errMsg: 'runTransaction:ok'};
          });
          /**
           * 记录异步失败并设置任务退出状态。
           */
          transactionQueue = run.catch(() => {});
          return run;
        },
      };
    },
  };
  return {
    cloud,
    documents,
    handler: createHandler(cloud, settings, domain, regions),
    /**
     * 更新 setUser 对应的状态。
     */
    /**
     * 更新 setEnvironment 对应的状态。
     */
    setUser(name) {
      context.OPENID = name;
    },
    setWebUser(uid, appId) {
      context.OPENID = undefined;
      context.APPID = appId;
      context.UID = uid;
    },
    setWechatUser(name) {
      context.OPENID = name;
      context.APPID = settings.appId;
      context.UID = undefined;
    },
    setEnvironment(env) {
      context.ENV = env;
    },
    /**
     * 更新 setApp 对应的状态。
     */
    /**
     * 为测试场景提供 dbCalls 所需的模拟行为。
     */
    /**
     * 为测试场景提供 downloadReads 所需的模拟行为。
     */
    setApp(id) {
      context.APPID = id;
    },
    get dbCalls() {
      return dbCalls;
    },
    get downloadReads() {
      return downloadReads;
    },
  };
}

/**
 * 构造内存版本机缓存。
 */
function storage() {
  const items = new Map();
  /**
   * 读取或查找 getItem 对应的数据，供测试使用。
   */
  /**
   * 更新 setItem 对应的状态。
   */
  return {
    items,
    getItem: (key) => items.get(key) || null,
    setItem: (key, value) => items.set(key, value),
  };
}
/**
 * 构造微信云接口的测试替身。
 */
function wxClient(server, options = {}) {
  return {
    cloud: {
      /**
       * 为测试场景提供 init 所需的模拟行为。
       */
      init({env}) {
        assert.strictEqual(env, settings.environmentId);
        options.initCount = (options.initCount || 0) + 1;
      },
      /**
       * 为测试场景提供 downloadFile 所需的模拟行为。
       */
      downloadFile({success, fail}) {
        options.regionDownloads = (options.regionDownloads || 0) + 1;
        if (options.failRegion) {
          fail(new Error('Permission denied'));
        } else {
          success({tempFilePath: '/regions.json'});
        }
      },
      /**
       * 为测试场景提供 callFunction 所需的模拟行为。
       */
      callFunction({data, success, fail}) {
        if (options.offline) {
          fail(new Error('Offline'));
          return;
        }
        /**
         * 处理异步任务完成或失败后的状态。
         */
        /**
         * 处理异步任务完成或失败后的状态。
         */
        Promise.resolve()
          .then(() => server.handler(data))
          .then(async (result) => {
            if (data.action === 'save' && options.saveGate) {
              await options.saveGate;
            }
            if ((data.action === 'save' && options.loseResponse)
              || (data.action === 'regionWin' && options.loseWinResponse)) {
              options.loseResponse = false;
              options.loseWinResponse = false;
              fail(new Error('Response lost after commit'));
            } else {
              success({result});
            }
          })
          .catch(fail);
      },
      /**
       * 读取或查找 getFileSystemManager 对应的数据，供测试使用。
       */
      /**
       * 读取测试所需的本地文件。
       */
    },
    getFileSystemManager() {
      return {
        readFile({success}) {
          success({data: JSON.stringify(regions)});
        },
      };
    },
  };
}
/**
 * 创建连接测试替身的玩家服务。
 */
function service(
  server,
  localStorage = storage(),
  options = {},
  config = settings,) {
  const instance = new PlayerService(
    regions,
    localStorage,
    wxClient(server, options),
    config,
  );
  /**
   * 延迟提交玩家状态，合并短时间内的连续操作。
   */
  // Tests explicitly drain queues; no background timers.
  instance.schedule = () => {};
  return instance;
}

/**
 * 为测试提供当前调用所需的回调行为。
 */
(async () => {
  const rankingServer = backend();
  const rankingCache = storage();
  const rankingOptions = {};
  const rankingClient = service(rankingServer, rankingCache, rankingOptions);
  await rankingClient.initialize();
  rankingClient.setRegion(['OVERSEAS']);
  const completed = {...collected.save, runId: 'ranking-test-run-1'};
  assert.strictEqual(completed.status, 'won');
  rankingOptions.offline = true;
  rankingClient.setSave(freshSave(2));
  rankingClient.setSave(completed);
  rankingClient.setSave(completed);
  // 重开和跨日不丢失尚未补传的通关记录。
  rankingClient.setSave(freshSave(0));
  rankingClient.beginDailySession(new Date(2026, 9, 28));
  await rankingClient.flush();
  rankingOptions.offline = false;
  const reopenedRanking = service(rankingServer, rankingCache, {
    loseWinResponse: true,
  });
  await reopenedRanking.initialize();
  await reopenedRanking.refreshLeaderboard();
  assert.strictEqual(reopenedRanking.regionCount('OVERSEAS'), 1);
  assert.strictEqual(reopenedRanking.pendingWins().length, 1);
  await reopenedRanking.refreshLeaderboard();
  assert.strictEqual(reopenedRanking.pendingWins().length, 0);
  assert.strictEqual(reopenedRanking.regionCount('OVERSEAS'), 1);
  const retryWin = {
    action: 'regionWin',
    win: {save: completed, regionCodes: ['OVERSEAS'], playDate: ''},
  };
  const duplicateResults = await Promise.all([
    rankingServer.handler(retryWin), rankingServer.handler(retryWin),
  ]);
  assert(duplicateResults.every((result) => result.counts.OVERSEAS === 1));
  const province = regions.find((item) => item.children?.length);
  const path = [province.code];
  let leaf = province;
  while (leaf.children?.length) {
    leaf = leaf.children[0];
    path.push(leaf.code);
  }
  const nextWin = {
    ...retryWin,
    win: {...retryWin.win, regionCodes: path,
      save: {...completed, runId: 'ranking-test-run-2'}},
  };
  let result = await rankingServer.handler(nextWin);
  assert(path.every((code) => result.counts[code] === 1));
  // 同一局切换地区不搬分、不重复累计。
  result = await rankingServer.handler({
    ...nextWin, win: {...nextWin.win, regionCodes: ['OVERSEAS']},
  });
  assert.strictEqual(result.counts.OVERSEAS, 1);
  rankingServer.setUser('bob');
  result = await rankingServer.handler(retryWin);
  assert.strictEqual(result.counts.OVERSEAS, 2);
  result = await rankingServer.handler({
    ...retryWin, win: {...retryWin.win, save: freshSave(2)},
  });
  assert.strictEqual(result.code, 'INVALID_WIN');
  rankingCache.setItem(
    `hotpot.region-ranking:${settings.environmentId}`, '{broken',
  );
  await reopenedRanking.refreshLeaderboard();
  assert(reopenedRanking.leaderboardText.startsWith('云端排行'));
  const originalFirstCode = regions[0].code;
  const sorted = reopenedRanking.sortedRegions(regions);
  assert.strictEqual(sorted[0].code, 'OVERSEAS');
  assert.strictEqual(regions[0].code, originalFirstCode);
  assert(!JSON.stringify(result).includes('alice'));
  console.log(
    'Region ranking: offline/reopen queue, repeated and concurrent retry, '
      + 'parent totals, region changes, identity isolation and sorting: OK',
  );

  const guestServer = backend();
  const guestCache = storage();
  const guestOptions = {offline: true};
  const guest = service(guestServer, guestCache, guestOptions);
  const qinhuai = ['320000', '320100', '320104'];
  assert.deepStrictEqual(plain(domain.regionPath(regions, qinhuai))
    .map((item) => item.name), ['江苏省', '南京市', '秦淮区']);
  await guest.initialize();
  guest.setRegion(qinhuai);
  guest.setSave(freshSave(2));
  guest.setSave({...completed, runId: 'guest-qinhuai-test-1'});
  guestOptions.offline = false;
  await guest.initialize();
  await guest.refreshLeaderboard();
  assert.strictEqual(guest.regionCount('320104'), 0);
  guest.claimGuestWins();
  await guest.flush();
  await guest.refreshLeaderboard();
  assert(qinhuai.every((code) => guest.regionCount(code) === 1));
  guest.claimGuestWins();
  await guest.flush();
  await guest.refreshLeaderboard();
  assert(qinhuai.every((code) => guest.regionCount(code) === 1));
  assert(guestServer.documents.has('region_ranking_summary_v1'));
  assert(guestServer.documents.get(guest.playerId).playerId);
  console.log('Qinhuai guest win: explicit account sync, all parents, '
    + 'repeat sync and player document isolation: OK');

  const webServer = backend();
  webServer.setWebUser('browser-user-one');
  const webCache = storage();
  const webPlayer = new PlayerService(regions, webCache, undefined, settings);
  webPlayer.schedule = () => {};
  webPlayer.setRegion(qinhuai);
  webPlayer.setSave(freshSave(2));
  webPlayer.setSave({...completed, runId: 'web-qinhuai-test-1'});
  let signedIn = false;
  let webSignIns = 0;
  let webSessionError = 'INVALID_CREDENTIALS';
  const session = () => ({
    data: {session: signedIn ? {user: {}} : null},
    error: signedIn ? null : {category: webSessionError},
  });
  browserRuntime.document = {createElement() { throw new Error('No CDN'); }};
  browserRuntime.cloudbase = {
    init({env}) {
      assert.strictEqual(env, settings.environmentId);
      return {
        auth: () => ({
          getSession: async () => session(),
          signInAnonymously: async () => {
            signedIn = true;
            webSignIns++;
            return session();
          },
        }),
        callFunction: async ({data}) => ({
          result: await webServer.handler(data),
        }),
      };
    },
  };
  try {
    webSessionError = 'SERVICE_ERROR';
    const {createWebCloud} = load(require('path').join(
      root, 'assets/scripts/core/WebCloudBridge',
    ));
    await assert.rejects(createWebCloud(settings),
      (error) => error.category === 'SERVICE_ERROR');
    assert.strictEqual(webSignIns, 0);
    webSessionError = 'INVALID_CREDENTIALS';
    await webPlayer.initialize();
    await webPlayer.refreshLeaderboard();
    await webPlayer.flush();
    assert(webPlayer.playerId);
    assert.strictEqual(webSignIns, 1);
    assert.deepStrictEqual(plain(webPlayer.state.profile.regionCodes), qinhuai);
    assert(qinhuai.every((code) => webPlayer.regionCount(code) === 1));
    webServer.setWechatUser('wechat-user');
    const fromWechat = await webServer.handler({action: 'leaderboard'});
    assert(qinhuai.every((code) => fromWechat.counts[code] === 1));
    await webServer.handler({action: 'regionWin', win: {
      save: {...completed, runId: 'wechat-qinhuai-test-1'},
      regionCodes: qinhuai, playDate: '',
    }});
    webServer.setWebUser('browser-user-one');
    await webPlayer.refreshLeaderboard();
    assert(qinhuai.every((code) => webPlayer.regionCount(code) === 2));
    const webReopened = new PlayerService(
      regions, webCache, undefined, settings,
    );
    webReopened.schedule = () => {};
    await webReopened.initialize();
    await webReopened.refreshLeaderboard();
    assert.strictEqual(webSignIns, 1);
    assert.strictEqual(webReopened.playerId, webPlayer.playerId);
    assert(qinhuai.every((code) => webReopened.regionCount(code) === 2));
    assert.strictEqual(webReopened.sortedRegions(regions)[0].code, '320000');
    webServer.setWebUser('browser-user-two');
    const another = await webServer.handler({
      action: 'load', playerId: webPlayer.playerId, UID: 'browser-user-one',
    });
    assert.notStrictEqual(another.player.playerId, webPlayer.playerId);
    webServer.setWebUser('browser-user-two', settings.appId);
    const associated = await webServer.handler({action: 'load'});
    assert.strictEqual(associated.ok, true);
    assert.strictEqual(associated.player.playerId, another.player.playerId);
    webServer.setWebUser('browser-user-two', 'another-application');
    assert.strictEqual(
      (await webServer.handler({action: 'leaderboard'})).code,
      'IDENTITY_REQUIRED',
    );
    webServer.setWebUser(undefined);
    const spoofed = await webServer.handler({
      action: 'leaderboard', UID: 'browser-user-one',
    });
    assert.strictEqual(spoofed.code, 'IDENTITY_REQUIRED');
  } finally {
    delete browserRuntime.document;
    delete browserRuntime.cloudbase;
  }
  console.log('Unified web/WeChat ranking: web login, pending Qinhuai upload, '
    + 'both platforms share counts, reload and trusted identity isolation: OK');

  const dayServer = backend();
  const dayCache = storage();
  const dayClient = service(dayServer, dayCache);
  await dayClient.initialize();
  dayClient.beginDailySession(new Date(2026, 9, 22, 23, 59));
  dayClient.setRegion(['OVERSEAS']);
  dayClient.setSave(legacy);
  const beforeMidnightProgress = plain(dayClient.state.progress);
  dayClient.setSave(freshSave(2));
  await dayClient.flush();
  const dayDevice = service(dayServer, storage());
  await dayDevice.initialize();
  assert.strictEqual(
    dayDevice.beginDailySession(new Date(2026, 9, 22, 23, 59)),
    false,
  );
  assert.strictEqual(
    dayDevice.state.save.levelIndex,
    2,
    'same-day cloud restoration retains level three',
  );
  assert(dayClient.beginDailySession(new Date(2026, 9, 23, 0, 1)));
  assert.strictEqual(dayClient.state.save, null);
  assert.deepStrictEqual(
    plain(dayClient.state.progress),
    beforeMidnightProgress,
  );
  assert.deepStrictEqual(plain(dayClient.state.profile.regionCodes), [
    'OVERSEAS',
  ]);
  dayClient.setSave(freshSave(0));
  await dayClient.flush();
  // Yesterday's device uploads after the daily reset: either conflict choice
  // must stay in the new day.
  dayDevice.setRegion(['110000']);
  dayDevice.setSave(freshSave(2));
  await dayDevice.flush();
  assert(dayDevice.isConflict);
  dayDevice.beginDailySession(new Date(2026, 9, 23, 0, 2));
  assert.strictEqual(dayDevice.resolveConflict(false).save, null);
  await dayDevice.flush();
  const dayReopen = service(dayServer, dayCache);
  await dayReopen.initialize();
  assert.strictEqual(
    dayReopen.beginDailySession(new Date(2026, 9, 23, 10)),
    false,
  );
  dayReopen.setSave(freshSave(1));
  await dayReopen.flush();
  dayDevice.setSave(freshSave(2));
  await dayDevice.flush();
  assert(dayDevice.isConflict);
  dayDevice.beginDailySession(new Date(2026, 9, 24, 0, 1));
  assert.strictEqual(
    dayDevice.resolveConflict(true).save,
    null,
    "cloud conflict choice cannot restore yesterday's board",
  );
  await dayDevice.flush();
  const offlineDay = new PlayerService(regions, storage(), undefined, {
    ...settings,
    enabled: false,
  });
  offlineDay.beginDailySession(new Date(2026, 11, 31, 23, 59));
  offlineDay.setSave(freshSave(2));
  assert(offlineDay.beginDailySession(new Date(2027, 0, 1, 0, 1)));
  assert.strictEqual(offlineDay.state.save, null);
  console.log(
    'Daily entry: midnight/year rollover, l' +
      'egacy migration, same-day cloud restor' +
      'e, conflict choices and permanent prog' +
      'ress retention: OK',
  );

  const midnightServer = backend();
  const midnightOptions = {};
  const midnightClient = service(midnightServer, storage(), midnightOptions);
  await midnightClient.initialize();
  midnightClient.beginDailySession(new Date(2026, 9, 22));
  midnightClient.setSave(freshSave(1));
  await midnightClient.flush();
  let releaseMidnight;
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  midnightOptions.saveGate = new Promise((resolve) => {
    releaseMidnight = resolve;
  });
  midnightClient.setSave(freshSave(2));
  const pendingMidnight = midnightClient.flush();
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  await new Promise((resolve) => setImmediate(resolve));
  midnightClient.beginDailySession(new Date(2026, 9, 23));
  midnightClient.setSave(freshSave(0));
  releaseMidnight();
  await pendingMidnight;
  assert.strictEqual(midnightClient.state.playDate, '2026-10-23');
  assert.strictEqual(
    midnightServer.documents.get(midnightClient.playerId).state.save.levelIndex,
    0,
    'a delayed yesterday response must not overwrite the first-level reset',
  );

  const sdk = require(
    '../cloudfunctions/hotpotPlayerDev/node_modules/' + '@cloudbase/node-sdk',
  );
  const {
    requestIdentity,
  } = require('../cloudfunctions/hotpotPlayerDev/request-context');
  const aliceContext = {
    environment: JSON.stringify({
      TCB_ENV: settings.environmentId,
      WX_OPENID: 'alice',
      WX_APPID: settings.appId,
    }),
  };
  assert.strictEqual(
    requestIdentity(sdk, aliceContext, settings.environmentId).OPENID,
    'alice',
  );
  const webIdentity = requestIdentity(sdk, {environment: JSON.stringify({
    TCB_ENV: settings.environmentId, TCB_UUID: 'trusted-browser',
  })}, settings.environmentId);
  assert.strictEqual(webIdentity.UID, 'trusted-browser');
  assert.strictEqual(webIdentity.OPENID, undefined);
  assert.strictEqual(
    requestIdentity(sdk, {environment: '{}'}, settings.environmentId).UID,
    undefined,
  );
  assert.strictEqual(
    requestIdentity(sdk, {environment: '{}'}, settings.environmentId).OPENID,
    undefined,
    'a non-WeChat invocation after a player' +
      ' call must not inherit the previous id' +
      'entity',
  );
  assert.strictEqual(
    requestIdentity(
      sdk,
      {
        environ:
          'TCB_ENV=' +
          String(settings.environmentId) +
          ';WX_OPENID=bob;WX_APPID=' +
          String(settings.appId) +
          '',
      },
      settings.environmentId,
    ).OPENID,
    'bob',
  );
  assert.strictEqual(
    requestIdentity(sdk, {environment: 'invalid'}, settings.environmentId)
      .OPENID,
    undefined,
  );
  assert.strictEqual(
    requestIdentity(sdk, undefined, settings.environmentId).OPENID,
    undefined,
  );
  // wx-server-sdk returns {} outside a WeChat call. Runtime environment is
  // still trusted,
  // but neither a console request nor event-supplied identity may access player
  // records.
  /**
   * 读取或查找 getWXContext 对应的数据，供测试使用。
   */
  /**
   * 为测试场景提供 database 所需的模拟行为。
   */
  const consoleCloud = {
    getWXContext: () => ({}),
    database: () => {
      throw new Error('Must not access database');
    },
  };
  const consoleHandler = createHandler(
    consoleCloud,
    settings,
    domain,
    regions,
    settings.environmentId,
  );
  assert.strictEqual(
    (
      await consoleHandler({
        action: 'load',
        OPENID: 'fake',
        APPID: settings.appId,
        ENV: settings.environmentId,
      })
    ).code,
    'IDENTITY_REQUIRED',
  );
  assert.strictEqual(
    (
      await createHandler(
        consoleCloud,
        settings,
        domain,
        regions,
        'wrong-env',
      )({action: 'load'})
    ).code,
    'DEVELOPMENT_ENV_REQUIRED',
  );
  /**
   * 读取或查找 getWXContext 对应的数据，供测试使用。
   */
  assert.strictEqual(
    (
      await createHandler(
        {
          getWXContext: () => ({
            ENV: settings.environmentId,
            OPENID: 'fake',
            APPID: settings.appId,
          }),
        },
        settings,
        domain,
        regions,
        'wrong-env',
      )({action: 'load'})
    ).code,
    'DEVELOPMENT_ENV_REQUIRED',
  );
  const server = backend();
  const original = await server.handler({
    action: 'load',
    openid: 'bob',
    playerId: 'fake',
  });
  assert(original.ok && original.player.playerId.length === 32);
  assert.strictEqual(original.playSessionVersion, domain.PLAY_SESSION_VERSION);
  const alice = original.player.playerId;
  let state = {
    profile: {regionCodes: ['320000', '320100', '320106']},
    save: freshSave(1),
  };
  let response = await server.handler({
    action: 'save',
    expectedRevision: 0,
    mutationId: 'mutation-0000001',
    state,
    openid: 'bob',
  });
  assert(response.ok);
  assert.strictEqual(response.player.revision, 1);
  response = await server.handler({
    action: 'save',
    expectedRevision: 0,
    mutationId: 'mutation-0000001',
    state,
  });
  assert.strictEqual(
    response.player.revision,
    1,
    'lost response retry must not advance revision twice',
  );
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  const concurrent = await Promise.all(
    ['mutation-0000002', 'mutation-0000003'].map((mutationId) =>
      server.handler({action: 'save', expectedRevision: 1, mutationId, state}),
    ),
  );
  /**
   * 按条件筛选或判断条目：item.conflict。
   */
  assert.strictEqual(concurrent.filter((item) => item.conflict).length, 1);
  assert.strictEqual(server.documents.get(alice).revision, 2);
  assert.strictEqual(
    (
      await server.handler({
        action: 'save',
        expectedRevision: 2,
        mutationId: 'mutation-0000004',
        state: {...state, profile: {regionCodes: ['320000']}},
      })
    ).code,
    'INVALID_STATE',
  );
  server.setUser('bob');
  response = await server.handler({
    action: 'load',
    openid: 'alice',
    playerId: alice,
  });
  assert.notStrictEqual(response.player.playerId, alice);
  assert.strictEqual(response.player.state.save, null);
  assert(!JSON.stringify(response).includes('alice'));
  assert(!JSON.stringify(response).includes('_openid'));
  server.setEnvironment(configDomain.RELEASE_ENVIRONMENT_ID);
  const callsBefore = server.dbCalls;
  assert.strictEqual(
    (await server.handler({action: 'load'})).code,
    'DEVELOPMENT_ENV_REQUIRED',
  );
  assert.strictEqual(server.dbCalls, callsBefore);
  server.setEnvironment(settings.environmentId);
  server.setApp('wrong-app');
  assert.strictEqual(
    (await server.handler({action: 'load'})).code,
    'IDENTITY_REQUIRED',
  );
  console.log(
    'Server identity isolation, atomic CAS,' +
      ' idempotency, sanitization and release' +
      '-environment guard: OK',
  );

  const progressServer = backend();
  const progressLocal = storage();
  const progressClient = service(progressServer, progressLocal);
  await progressClient.initialize();
  progressClient.setSave(legacy);
  await progressClient.flush();
  assert.strictEqual(progressClient.state.progress.discovered.length, 1);
  const progressDevice = service(progressServer, storage());
  await progressDevice.initialize();
  assert.deepStrictEqual(
    plain(progressDevice.state.progress),
    plain(progressClient.state.progress),
  );
  // A legacy client omits progress: server must retain previously earned
  // records.
  const legacyWrite = await progressServer.handler({
    action: 'save',
    expectedRevision: progressClient.revision,
    mutationId: 'legacy-write-0001',
    state: {profile: {regionCodes: []}, save: null},
  });
  assert.strictEqual(legacyWrite.progressVersion, 1);
  assert.deepStrictEqual(
    plain(legacyWrite.player.state.progress),
    plain(progressClient.state.progress),
  );
  progressClient.setRegion(['OVERSEAS']);
  await progressClient.flush();
  assert.strictEqual(progressClient.status, 'conflict');
  progressClient.resolveConflict(true);
  await progressClient.flush();
  assert.strictEqual(
    progressClient.state.progress.regionChosen,
    true,
    'cloud checkpoint choice retains permanent local achievements',
  );
  const oldHandler = progressServer.handler;
  /**
   * 为测试场景提供 handler 所需的模拟行为。
   */
  progressServer.handler = async (event) => {
    const response = await oldHandler(event);
    delete response.progressVersion;
    return response;
  };
  /**
   * 按条件筛选或判断条目：key.endsWith(progressClient.playerId)。
   */
  const progressCacheKey = [...progressLocal.items.keys()].find((key) =>
    key.endsWith(progressClient.playerId),
  );
  const preservedCache = progressLocal.items.get(progressCacheKey);
  const oldEndpoint = service(progressServer, progressLocal);
  await oldEndpoint.initialize();
  assert.strictEqual(oldEndpoint.playerId, null);
  assert.strictEqual(oldEndpoint.status, 'error');
  assert(oldEndpoint.statusText.includes('更新云函数'));
  assert.strictEqual(
    progressLocal.items.get(progressCacheKey),
    preservedCache,
    'an old function must not erase the private local cache',
  );
  /**
   * 为测试场景提供 handler 所需的模拟行为。
   */
  progressServer.handler = async (event) => {
    const response = await oldHandler(event);
    delete response.playSessionVersion;
    return response;
  };
  const oldDailyEndpoint = service(progressServer, progressLocal);
  await oldDailyEndpoint.initialize();
  assert.strictEqual(oldDailyEndpoint.status, 'error');
  assert(oldDailyEndpoint.statusText.includes('每日关卡'));
  assert.strictEqual(progressLocal.items.get(progressCacheKey), preservedCache);
  /**
   * 为测试场景提供 handler 所需的模拟行为。
   */
  progressServer.handler = async (event) => {
    const response = await oldHandler(event);
    response.playSessionVersion = 1;
    return response;
  };
  const oldLayoutEndpoint = service(progressServer, progressLocal);
  await oldLayoutEndpoint.initialize();
  assert.strictEqual(oldLayoutEndpoint.status, 'error');
  assert(oldLayoutEndpoint.statusText.includes('随机牌阵'));
  assert.strictEqual(progressLocal.items.get(progressCacheKey), preservedCache);
  progressServer.handler = oldHandler;
  console.log(
    'Collection cloud flow: cross-device re' +
      'store, legacy-client retention, confli' +
      'ct union and old-function capability g' +
      'uard: OK',
  );

  const layoutServer = backend();
  const layoutStorage = storage();
  const layoutClient = service(layoutServer, layoutStorage);
  await layoutClient.initialize();
  const layoutSave = freshSave(2, data.RANDOM_LAYOUT_SEED_START + 2, 1230001);
  const layoutBoard = domain.restoreLevel(layoutSave);
  /**
   * 按条件筛选或判断条目：tile.blockedBy.length === 0。
   */
  pick(
    layoutSave,
    layoutBoard.tiles.find((tile) => tile.blockedBy.length === 0).id,
  );
  layoutClient.setSave(layoutSave);
  await layoutClient.flush();
  assert.strictEqual(layoutClient.status, 'synced');
  for (const cache of [layoutStorage, storage()]) {
    const device = service(layoutServer, cache);
    await device.initialize();
    assert.deepStrictEqual(plain(device.state.save), plain(layoutSave));
    assert.strictEqual(device.state.save.ingredientSeed, 1230001);
    assert.deepStrictEqual(
      plain(domain.restoreLevel(device.state.save)),
      plain(domain.restoreLevel(layoutSave)),
    );
  }
  const deployedDomain = require(
    '../cloudfunctions/hotpotPlayerDev/' + 'PlayerData',
  );
  assert.deepStrictEqual(
    plain(deployedDomain.restoreLevel(layoutSave)),
    plain(domain.restoreLevel(layoutSave)),
    'prepared cloud modules must reproduce the client geometry',
  );
  console.log(
    'Random layout cloud flow: local reopen' +
      ', cross-device seed/shape/coverage res' +
      'toration and prepared cloud modules: O' +
      'K',
  );

  const privateFileServer = backend();
  const privateFileClient = service(privateFileServer, storage(), {
    failRegion: true,
  });
  await privateFileClient.initialize();
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    privateFileServer.downloadReads,
    1,
    'a private original file is read throug' +
      'h the Dev function without permission ' +
      'changes',
  );
  assert.strictEqual(privateFileClient.status, 'synced');
  configDomain.validateDevelopmentConfig({
    ...settings,
    environmentId: configDomain.RELEASE_ENVIRONMENT_ID,
    allowSharedEnvironment: true,
    regionsFileId:
      'cloud://' +
      String(configDomain.RELEASE_ENVIRONMENT_ID) +
      '.bucket/res/regions.json',
  });
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() =>
    configDomain.validateDevelopmentConfig({
      ...settings,
      collectionName: 'production_players',
    }),
  );
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() =>
    configDomain.validateDevelopmentConfig({
      ...settings,
      functionName: 'productionPlayer',
    }),
  );
  console.log(
    'Read-only private region-file access a' +
      'nd explicitly authorized shared enviro' +
      'nment with fixed Dev names: OK',
  );

  const bundledConfig = {...settings, regionsFileId: ''};
  configDomain.validateDevelopmentConfig(bundledConfig);
  /**
   * 验证非法输入会被正确拒绝。
   */
  assert.throws(() =>
    configDomain.validateDevelopmentConfig({
      ...bundledConfig,
      regionsFileId: 'cloud://another-account.bucket/res/regions.json',
    }),
  );
  const bundledCloud = {
    /**
     * 读取或查找 getWXContext 对应的数据，供测试使用。
     */
    getWXContext: () => ({
      ENV: settings.environmentId,
      APPID: settings.appId,
      OPENID: 'alice',
    }),
    /**
     * 为测试场景提供 downloadFile 所需的模拟行为。
     */
    downloadFile: () => {
      throw new Error('Bundled regions must not access cloud storage');
    },
  };
  const bundledResponse = await createHandler(
    bundledCloud,
    bundledConfig,
    domain,
    regions,
  )({action: 'regions'});
  assert(bundledResponse.ok);
  assert.deepStrictEqual(plain(bundledResponse.regions), plain(regions));
  const bundledOptions = {};
  const bundledClient = service(
    backend(),
    storage(),
    bundledOptions,
    bundledConfig,
  );
  await bundledClient.initialize();
  assert.strictEqual(bundledClient.status, 'synced');
  assert.strictEqual(
    bundledOptions.regionDownloads || 0,
    0,
    'a new environment must not request the old account storage file',
  );
  assert.deepStrictEqual(plain(bundledClient.regions), plain(regions));
  console.log(
    'Native development environment: bundle' +
      'd regions and no cross-account storage' +
      ' access: OK',
  );

  const syncServer = backend();
  const cache = storage();
  const options = {};
  const first = service(syncServer, cache, options);
  await first.initialize();
  assert.strictEqual(first.status, 'synced');
  first.setRegion(['OVERSEAS']);
  first.setSave(freshSave(2));
  await first.flush();
  assert.strictEqual(first.revision, 1);
  const samePhone = service(syncServer, cache);
  await samePhone.initialize();
  assert.deepStrictEqual(plain(samePhone.state), plain(first.state));
  const newPhone = service(syncServer);
  await newPhone.initialize();
  assert.deepStrictEqual(
    plain(newPhone.state),
    plain(first.state),
    'another device restores region and checkpoint',
  );
  options.offline = true;
  first.setRegion(['110000']);
  await first.flush();
  assert.strictEqual(first.status, 'error');
  assert.deepStrictEqual(plain(first.state.profile.regionCodes), ['110000']);
  options.offline = false;
  options.loseResponse = true;
  await first.flush();
  assert.strictEqual(first.status, 'error');
  assert.strictEqual(first.revision, 1);
  await first.flush();
  assert.strictEqual(first.revision, 2);
  assert.strictEqual(first.status, 'synced');
  assert.strictEqual(syncServer.documents.get(first.playerId).revision, 2);
  newPhone.setRegion(['OVERSEAS']);
  newPhone.setSave(freshSave(0));
  await newPhone.flush();
  assert.strictEqual(newPhone.status, 'conflict');
  assert.strictEqual(newPhone.remote.revision, 2);
  newPhone.resolveConflict(true);
  assert.deepStrictEqual(plain(newPhone.state.profile.regionCodes), ['110000']);
  assert.strictEqual(newPhone.state.save.levelIndex, 2);
  first.setRegion(['OVERSEAS']);
  await first.flush();
  newPhone.setRegion(['310000']);
  await newPhone.flush();
  assert.strictEqual(newPhone.status, 'conflict');
  newPhone.resolveConflict(false);
  await newPhone.flush();
  assert.strictEqual(newPhone.status, 'synced');
  assert.deepStrictEqual(
    plain(syncServer.documents.get(first.playerId).state.profile.regionCodes),
    ['310000'],
  );
  console.log(
    'Full client/server flow: cross-device ' +
      'restore, offline queue, lost response ' +
      'retry and both conflict choices: OK',
  );

  // An edit arriving while the first request is pending must be sent with the
  // new revision.
  let release;
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const inFlightOptions = {saveGate: gate};
  const inFlight = service(syncServer, storage(), inFlightOptions);
  await inFlight.initialize();
  inFlight.setRegion(['OVERSEAS']);
  const flushing = inFlight.flush();
  /**
   * 为测试提供当前调用所需的回调行为。
   */
  await new Promise((resolve) => setImmediate(resolve));
  inFlight.setRegion(['110000']);
  release();
  await flushing;
  assert.strictEqual(inFlight.status, 'synced');
  assert.deepStrictEqual(
    plain(
      syncServer.documents.get(inFlight.playerId).state.profile.regionCodes,
    ),
    ['110000'],
  );
  assert.strictEqual(syncServer.documents.get(inFlight.playerId).revision, 6);
  syncServer.setUser('bob');
  const switched = service(syncServer, cache);
  await switched.initialize();
  assert.notStrictEqual(switched.playerId, first.playerId);
  assert.strictEqual(
    switched.state.save,
    null,
    'account switching must not inherit another user cache',
  );
  const offlineIdentity = service(syncServer, cache, {offline: true});
  await offlineIdentity.initialize();
  assert.strictEqual(offlineIdentity.playerId, null);
  assert.strictEqual(
    offlineIdentity.state.save,
    null,
    'unverified identity must not expose private cached progress',
  );
  const guardedOptions = {};
  const guarded = service(syncServer, storage(), guardedOptions, {
    ...settings,
    environmentId: configDomain.RELEASE_ENVIRONMENT_ID,
  });
  await guarded.initialize();
  assert.strictEqual(guarded.status, 'error');
  assert.strictEqual(
    guardedOptions.initCount,
    undefined,
    'release guard runs before wx.cloud.init',
  );
  const local = new PlayerService(regions, storage(), undefined, {
    ...settings,
    enabled: false,
  });
  local.setRegion(['OVERSEAS']);
  local.setSave(freshSave(2));
  await local.initialize();
  assert.strictEqual(local.status, 'local');
  /**
   * 读取或查找 getItem 对应的数据，供测试使用。
   */
  /**
   * 更新 setItem 对应的状态。
   */
  const brokenStorage = {
    getItem: () => '{broken',
    setItem: () => {
      throw new Error('Storage unavailable');
    },
  };
  const broken = new PlayerService(regions, brokenStorage, undefined, {
    ...settings,
    enabled: false,
  });
  assert.strictEqual(broken.state.save, null);
  broken.setSave(freshSave(0));
  assert(!broken.storageAvailable && broken.statusText.includes('不可用'));
  console.log(
    'Edits during sync, account changes, un' +
      'verified offline identity, disabled cl' +
      'oud and broken storage: OK',
  );

  const diagnostics = [];
  const originalWarn = console.warn;
  try {
    /**
     * 为测试场景提供 warn 所需的模拟行为。
     */
    console.warn = (...values) => diagnostics.push(values);
    local.describeFailure({
      errCode: -1,
      message: 'Generic host error',
      errMsg:
        'cloud.callFunction:fail errCode: -5010' +
        '05 FUNCTIONS_EXECUTE_FAIL openid=priva' +
        'te-player token=private-token',
    });
    assert.deepStrictEqual(plain(diagnostics[0]), [
      '[HotPot Cloud Dev]',
      '-501005',
      'FUNCTIONS_EXECUTE_FAIL',
    ]);
    local.describeFailure({
      errCode: -1,
      errMsg: 'private-player private-token',
    });
    assert.deepStrictEqual(plain(diagnostics[1]), [
      '[HotPot Cloud Dev]',
      '-1',
      '',
    ]);
    assert(
      !JSON.stringify(diagnostics).includes('private-'),
      'diagnostics must not expose raw identity or tokens',
    );
  } finally {
    console.warn = originalWarn;
  }
  console.log(
    'Nested platform error code diagnostics' +
      ' without raw identity or token leakage' +
      ': OK',
  );
  /**
   * 记录异步失败并设置任务退出状态。
   */
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
