import {regionPath} from './RegionData';
import {CASHOUT_TOOLS, cashoutStages} from './CashoutData';
import type {CashoutRun, CashoutSave, CashoutStock} from './CashoutData';
export {regionPath, validateRegions} from './RegionData';
import {
  createLevel,
  INGREDIENT_SEED_MAX,
  INGREDIENTS,
  IngredientType,
  LevelData,
  LEVELS,
  VARIED_LAYOUT_SEED_START,
  VARIED_LAYOUT_SEED_END,
} from './GameData';
import {
  SAVE_VERSION,
  BOARD_VERSION,
  PROGRESS_VERSION,
  SavedMove,
  GameSave,
  RegionNode,
  CollectionProgress,
  PlayerState,
  clone,
  emptyProgress,
  check,
  integer,
} from './PlayerTypes';
export {
  SAVE_VERSION,
  BOARD_VERSION,
  PROGRESS_VERSION,
  PLAY_SESSION_VERSION,
  CASHOUT_SYNC_VERSION,
  ACHIEVEMENT_SYNC_VERSION,
  clone,
  emptyProgress,
  emptyPlayerState,
} from './PlayerTypes';
export type {
  SaveStatus,
  SavedMove,
  GameSave,
  RegionNode,
  CollectionProgress,
  PlayerState,
  CloudPlayer,
} from './PlayerTypes';
/**
 * 使用设备本地自然日，不用 UTC 日期，避免本地午夜前后误判。
 */
export function localPlayDate(now = new Date()): string {
  /**
   * 处理 twoDigits 对应的游戏逻辑。
   */
  const twoDigits = (value: number): string =>
    value < 10 ? `0${value}` : String(value);
  return (
    '' +
    String(now.getFullYear()) +
    '-' +
    String(twoDigits(now.getMonth() + 1)) +
    '-' +
    String(twoDigits(now.getDate())) +
    ''
  );
}
/**
 * 验证存档中的自然日格式和日期有效性。
 */
function validatePlayDate(value: any): string {
  if (value === undefined || value === '') {
    return '';
  } // 旧存档首次进入时开启新一天。
  check(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
    '对局日期错误',
  );
  return value;
}
/**
 * 跨日时清空当前对局，同时保留地区与永久进度。
 */
export function enterPlayDay(state: PlayerState, day: string): PlayerState {
  check(validatePlayDate(day) !== '', '对局日期不能为空');
  return state.playDate === day ? state : {...state, playDate: day, save: null};
}
/**
 * 永久记录使用集合和关卡最高值；重开、撤回、重复同步均不重复累计。
 */
export function validateProgress(value: any): CollectionProgress {
  if (value === undefined) {
    return emptyProgress();
  } // 兼容旧存档。
  check(value && value.version === PROGRESS_VERSION, '图鉴成就版本不兼容');
  check(typeof value.regionChosen === 'boolean', '地区成就记录错误');
  check(value.thirdLevelEntered === undefined || typeof value.thirdLevelEntered === 'boolean', '第三关首次记录错误');
  check(value.bestCashoutStage === undefined || integer(value.bestCashoutStage, 0, 3),
    '副本成就记录错误');
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  const ingredientIds = INGREDIENTS.map((item) => item.id);
  check(
    Array.isArray(value.discovered) &&
      value.discovered.length <= ingredientIds.length &&
      /**
       * 按条件筛选或判断条目：ingredientIds.indexOf(id) >= 0。
       */
      value.discovered.every((id) => ingredientIds.indexOf(id) >= 0) &&
      new Set(value.discovered).size === value.discovered.length,
    '图鉴记录错误',
  );
  check(
    Array.isArray(value.bestCleared) &&
      value.bestCleared.length === LEVELS.length &&
      /**
       * 按条件筛选或判断条目：integer(count, 0, LEVELS[index].layers.reduce((sum, size)
       * =>。
       */
      /**
       * 把集合条目汇总为一个结果。
       */
      value.bestCleared.every(
        (count, index) =>
          integer(
            count,
            0,
            LEVELS[index].layers.reduce((sum, size) => sum + size, 0),
          ) && count % 3 === 0,
      ),
    '消除里程碑错误',
  );
  /**
   * 处理 levels 对应的游戏逻辑。
   */
  const levels = (items: any): number[] => {
    check(
      Array.isArray(items) &&
        items.length <= LEVELS.length &&
        new Set(items).size === items.length &&
        /**
         * 按条件筛选或判断条目：integer(index, 0, LEVELS.length - 1)。
         */
        items.every((index) => integer(index, 0, LEVELS.length - 1)),
      '通关记录错误',
    );
    /**
     * 按指定顺序比较并排列条目。
     */
    return items.slice().sort((a, b) => a - b);
  };
  const completedLevels = levels(value.completedLevels);
  const cleanWins = levels(value.cleanWins);
  /**
   * 按条件筛选或判断条目：completedLevels.indexOf(index) >= 0。
   */
  /**
   * 按条件筛选或判断条目：value.bestCleared[index] === LEVELS[index].layers.reduce((su。
   */
  check(
    cleanWins.every((index) => completedLevels.indexOf(index) >= 0) &&
      completedLevels.every(
        (index) =>
          /**
           * 把集合条目汇总为一个结果。
           */
          value.bestCleared[index] ===
          LEVELS[index].layers.reduce((sum, size) => sum + size, 0),
      ),
    '通关里程碑不一致',
  );
  return {
    version: 1,
    /**
     * 按条件筛选或判断条目：value.discovered.indexOf(id) >= 0。
     */
    discovered: ingredientIds.filter((id) => value.discovered.indexOf(id) >= 0),
    bestCleared: value.bestCleared.slice(),
    completedLevels,
    cleanWins,
    regionChosen: value.regionChosen,
    thirdLevelEntered: !!value.thirdLevelEntered || value.bestCleared[2] > 0,
    ...(value.bestCashoutStage ? {bestCashoutStage: value.bestCashoutStage} : {}),
  };
}
/**
 * 合并两份永久进度中的集合和最大值。
 */
export function mergeProgress(
  a: CollectionProgress,
  b: CollectionProgress,
): CollectionProgress {
  const bestCashoutStage = Math.max(a.bestCashoutStage || 0, b.bestCashoutStage || 0);
  return {
    version: 1,
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    /**
     * 按条件筛选或判断条目：a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >=。
     */
    discovered: INGREDIENTS.map((item) => item.id).filter(
      (id) => a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >= 0,
    ),
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    bestCleared: LEVELS.map((_, i) =>
      Math.max(a.bestCleared[i], b.bestCleared[i]),
    ),
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    /**
     * 按条件筛选或判断条目：a.completedLevels.indexOf(i) >= 0 || b.completedLevels.index。
     */
    completedLevels: LEVELS.map((_, i) => i).filter(
      (i) =>
        a.completedLevels.indexOf(i) >= 0 || b.completedLevels.indexOf(i) >= 0,
    ),
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    /**
     * 按条件筛选或判断条目：a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0。
     */
    cleanWins: LEVELS.map((_, i) => i).filter(
      (i) => a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0,
    ),
    regionChosen: a.regionChosen || b.regionChosen,
    thirdLevelEntered: !!(a.thirdLevelEntered || b.thirdLevelEntered),
    ...(bestCashoutStage ? {bestCashoutStage} : {}),
  };
}

export function recordCashoutProgress(
  progress: CollectionProgress,
  cashout?: CashoutSave,
): CollectionProgress {
  const run = cashout?.run;
  if (run?.status !== 'won' || run.stage + 1 <= (progress.bestCashoutStage || 0)) {
    return progress;
  }
  return {...progress, bestCashoutStage: run.stage + 1};
}
/**
 * 根据当前对局更新发现食材与关卡成就。
 */
function recordProgress(
  progress: CollectionProgress,
  save: GameSave | null,
): CollectionProgress {
  const next = clone(progress);
  if (!save) {
    return next;
  }
  if (save.levelIndex === 2) next.thirdLevelEntered = true;
  const removed = new Set(save.removedIds);
  const seen = new Set<IngredientType>([
    ...next.discovered,
    ...save.tray,
    ...save.reserve,
  ]);
  /**
   * 依次处理集合中的每个条目。
   */
  template(save.levelIndex).tiles.forEach((tile, index) => {
    if (removed.has(tile.id)) {
      seen.add(save.types[index]);
    }
  });
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  /**
   * 按条件筛选或判断条目：seen.has(id)。
   */
  next.discovered = INGREDIENTS.map((item) => item.id).filter((id) =>
    seen.has(id),
  );
  const cleared =
    save.removedIds.length - save.tray.length - save.reserve.length;
  next.bestCleared[save.levelIndex] = Math.max(
    next.bestCleared[save.levelIndex],
    cleared,
  );
  if (save.status === 'won') {
    if (next.completedLevels.indexOf(save.levelIndex) < 0) {
      next.completedLevels.push(save.levelIndex);
    }
    if (!save.reviveUsed && next.cleanWins.indexOf(save.levelIndex) < 0) {
      next.cleanWins.push(save.levelIndex);
    }
  }
  return validateProgress(next);
}
const templates = new Map<number, LevelData>();
const randomTemplates = new Map<string, LevelData>();
/**
 * 使用关卡种子创建可验证的棋盘模板。
 */
function template(
  index: number,
  layoutSeed = 0,
  ingredientSeed = 0,
  ingredientPoolVersion: 1 | 2 | 3 | 4 = 1,
): LevelData {
  if (layoutSeed === 0 && ingredientSeed === 0) {
    if (!templates.has(index)) {
      templates.set(index, createLevel(index, 0, undefined, 0));
    }
    return templates.get(index)!;
  }
  // Inventory validation and geometry restoration use different seeds. They
  // must not evict each other and regenerate a full board on every restore.
  const key = `${index}:${layoutSeed}:${ingredientSeed}:${ingredientPoolVersion}`;
  if (!randomTemplates.has(key)) {
    randomTemplates.set(key,
      createLevel(index, layoutSeed, undefined, ingredientSeed,
        ingredientPoolVersion));
    if (randomTemplates.size > 4) {
      randomTemplates.delete(randomTemplates.keys().next().value);
    }
  }
  return randomTemplates.get(key)!;
}
/**
 * 检查稳定结算后的存档；不接受飞牌中或三消未结算的半成品。
 */
export function validateGameSave(value: any): GameSave {
  check(
    value &&
      value.version === SAVE_VERSION &&
      value.boardVersion === BOARD_VERSION,
    '存档版本不兼容',
  );
  check(integer(value.levelIndex, 0, LEVELS.length - 1), '关卡编号错误');
  check(
    value.runId === undefined || (typeof value.runId === 'string'
      && /^[a-z0-9-]{8,80}$/.test(value.runId)),
    '牌局标识错误',
  );
  check(
    value.layoutSeed === undefined ||
      (value.levelIndex === 2 &&
        integer(value.layoutSeed, 1, VARIED_LAYOUT_SEED_END)),
    '牌阵种子错误',
  );
  check(
    value.ingredientSeed === undefined ||
      integer(value.ingredientSeed, 1, INGREDIENT_SEED_MAX),
    '食材种子错误',
  );
  check(value.ingredientPoolVersion === undefined
    || value.ingredientPoolVersion === 1 || value.ingredientPoolVersion === 2
    || value.ingredientPoolVersion === 3 || value.ingredientPoolVersion === 4,
  '食材池版本错误');
  const validationSeed = value.layoutSeed >= VARIED_LAYOUT_SEED_START
    ? value.layoutSeed : 0;
  const level = template(value.levelIndex, validationSeed, value.ingredientSeed,
    value.ingredientPoolVersion);
  check(
    Array.isArray(value.types) && value.types.length === level.total,
    '食材牌数错误',
  );
  const expected = new Map<string, number>();
  /**
   * 依次处理集合中的每个条目。
   */
  level.tiles.forEach((tile) =>
    expected.set(tile.type, (expected.get(tile.type) || 0) + 1),
  );
  /**
   * 依次处理集合中的每个条目。
   */
  value.types.forEach((type: string) => {
    check(expected.has(type), '食材种类错误');
    expected.set(type, expected.get(type)! - 1);
  });
  /**
   * 按条件筛选或判断条目：count === 0。
   */
  check(
    Array.from(expected.values()).every((count) => count === 0),
    '食材总数不守恒',
  );
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  const ids = new Set(level.tiles.map((tile) => tile.id));
  const allowed = new Set(Array.from(expected.keys()) as IngredientType[]);
  /**
   * 检查 validateMove 对应的条件并报告不符合项。
   */
  const validateMove = (move: any, full: boolean): SavedMove => {
    check(
      move &&
        Array.isArray(move.removedIds) &&
        move.removedIds.length <= level.total &&
        /**
         * 按条件筛选或判断条目：ids.has(id)。
         */
        new Set(move.removedIds).size === move.removedIds.length &&
        move.removedIds.every((id: string) => ids.has(id)),
      '移除牌记录错误',
    );
    check(
      Array.isArray(move.tray) &&
        move.tray.length <= 7 &&
        Array.isArray(move.reserve) &&
        move.reserve.length <= (value.levelIndex === 2 ? level.total : 3) &&
        /**
         * 按条件筛选或判断条目：allowed.has(type)。
         */
        [...move.tray, ...move.reserve].every((type) => allowed.has(type)),
      '托盘或寄存区错误',
    );
    const counts = new Map<IngredientType, number>();
    const removed = new Set(move.removedIds);
    /**
     * 依次处理集合中的每个条目。
     */
    level.tiles.forEach((tile, i) => {
      if (!removed.has(tile.id)) {
        counts.set(value.types[i], (counts.get(value.types[i]) || 0) + 1);
      }
    });
    /**
     * 依次处理集合中的每个条目。
     */
    [...move.tray, ...move.reserve].forEach((type) =>
      counts.set(type, (counts.get(type) || 0) + 1),
    );
    /**
     * 按条件筛选或判断条目：count % 3 === 0。
     */
    check(
      Array.from(counts.values()).every((count) => count % 3 === 0),
      '剩余食材不守恒',
    );
    /**
     * 按条件筛选或判断条目：item === type。
     */
    for (const type of allowed)
      check(
        move.tray.filter((item: string) => item === type).length < 3,
        '托盘包含未结算三消',
      );
    if (!full) {
      check(move.tray.length < 7, '撤回快照托盘已满');
    }
    return {
      tray: move.tray.slice(),
      reserve: move.reserve.slice(),
      removedIds: move.removedIds.slice(),
    };
  };
  const move = validateMove(value, true);
  check(
    typeof value.reviveUsed === 'boolean' &&
      (value.reviveUsed || move.reserve.length === 0),
    '复活状态错误',
  );
  const maxRewards = value.levelIndex === 2 ? 8 : 0;
  check(integer(value.rewardedMilestones, 0, maxRewards), '阶段奖励错误');
  const cleared =
    move.removedIds.length - move.tray.length - move.reserve.length;
  check(
    cleared >= 0 &&
      cleared % 3 === 0 &&
      value.rewardedMilestones * 100 <= cleared + 3,
    '消除记录错误',
  );
  const toolUses = value.toolUses;
  /**
   * 按条件筛选或判断条目：integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)。
   */
  check(
    toolUses &&
      ['undo', 'bomb', 'shuffle'].every((type) =>
        integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9),
      ),
    '道具次数错误',
  );
  check(
    toolUses.undo + toolUses.bomb + toolUses.shuffle <=
      (value.levelIndex === 0 ? 0 : 3) + value.rewardedMilestones,
    '道具次数超过已获奖励',
  );
  const empty = cleared === level.total;
  check(['playing', 'lost', 'won'].indexOf(value.status) >= 0, '对局状态错误');
  check(
    value.status === 'won'
      ? empty
      : value.status === 'lost'
        ? move.tray.length === 7
        : !empty && move.tray.length < 7,
    '对局状态与棋盘不一致',
  );
  let lastMove: SavedMove | null = null;
  if (value.lastMove !== null) {
    lastMove = validateMove(value.lastMove, false);
    const removed = new Set(move.removedIds);
    /**
     * 按条件筛选或判断条目：removed.has(id)。
     */
    check(
      lastMove.removedIds.every((id) => removed.has(id)),
      '撤回记录包含未来拿牌',
    );
    check(value.reviveUsed || lastMove.reserve.length === 0, '撤回寄存区错误');
  }
  return {
    ...move,
    ...(value.runId === undefined ? {} : {runId: value.runId}),
    version: 1,
    boardVersion: BOARD_VERSION,
    levelIndex: value.levelIndex,
    types: value.types.slice(),
    ...(value.layoutSeed === undefined ? {} : {layoutSeed: value.layoutSeed}),
    ...(value.ingredientSeed === undefined
      ? {}
      : {ingredientSeed: value.ingredientSeed}),
    ...(value.ingredientPoolVersion === undefined
      ? {} : {ingredientPoolVersion: value.ingredientPoolVersion}),
    reviveUsed: value.reviveUsed,
    rewardedMilestones: value.rewardedMilestones,
    toolUses: {
      undo: toolUses.undo,
      bomb: toolUses.bomb,
      shuffle: toolUses.shuffle,
    },
    lastMove,
    status: value.status,
  };
}
/**
 * 从合法存档重建关卡布局与移除状态。
 */
export function restoreLevel(save: GameSave): LevelData {
  const valid = validateGameSave(save);
  const level = clone(
    template(valid.levelIndex, valid.layoutSeed, valid.ingredientSeed,
      valid.ingredientPoolVersion),
  );
  const removed = new Set(valid.removedIds);
  /**
   * 依次处理集合中的每个条目。
   */
  level.tiles.forEach((tile, i) => {
    tile.type = valid.types[i];
    tile.removed = removed.has(tile.id);
  });
  return level;
}

/** An untouched old third level can adopt the new layout without losing play. */
export function shouldUpgradeUnstartedLevelThree(save: GameSave): boolean {
  return save.levelIndex === 2 && save.status === 'playing'
    && (save.layoutSeed || 0) < VARIED_LAYOUT_SEED_START
    && save.removedIds.length === 0 && save.tray.length === 0
    && save.reserve.length === 0 && !save.reviveUsed
    && save.rewardedMilestones === 0 && save.lastMove === null
    && save.toolUses.undo === 1 && save.toolUses.bomb === 1
    && save.toolUses.shuffle === 1;
}

function validateStock(value: any): CashoutStock {
  check(value && CASHOUT_TOOLS.every(tool =>
    integer(value[tool], 0, Number.MAX_SAFE_INTEGER)), '道具库存错误');
  return {undo: value.undo, shuffle: value.shuffle, bomb: value.bomb};
}

export function validateCashoutSave(value: any): CashoutSave {
  check(value?.version === 1, '副本存档版本错误');
  const stock = validateStock(value.stock);
  const saved: CashoutSave = {version: 1, stock, run: null};
  if (value.run !== null) {
    const run = value.run as CashoutRun;
    check(run && (run.difficulty === undefined || integer(run.difficulty, 0, 2)),
      '副本难度错误');
    const stages = cashoutStages(run);
    check(integer(run.stage, 0, stages.length - 1) && integer(run.seed, 0, 0xffffffff),
      '副本牌阵错误');
    const stage = stages[run.stage];
    const total = stage.layers.reduce((sum, count) => sum + count, 0);
    check(Array.isArray(run.removed) && run.removed.length <= total
      && new Set(run.removed).size === run.removed.length
      && run.removed.every(id => integer(id, 0, total - 1)), '副本移除牌错误');
    check(Array.isArray(run.tray) && run.tray.length <= 7
      && run.tray.every(type => INGREDIENTS.some(item => item.id === type)
        && run.tray.filter(item => item === type).length < 3)
      && run.removed.length >= run.tray.length
      && (run.removed.length - run.tray.length) % 3 === 0, '副本托盘错误');
    const cleared = run.removed.length === total && !run.tray.length;
    check(run.status === 'playing' ? !cleared && run.tray.length < 7
      : run.status === 'lost' ? run.tray.length === 7
      : (run.status === 'decision' || run.status === 'won') && cleared,
    '副本结算状态错误');
    saved.run = {
      ...(run.difficulty === undefined ? {} : {difficulty: run.difficulty}),
      stage: run.stage, seed: run.seed, removed: run.removed.slice(),
      tray: run.tray.slice(), status: run.status,
    };
    if (run.status === 'won') {
      const reward = validateStock(run.reward);
      check(CASHOUT_TOOLS.reduce((sum, tool) => sum + reward[tool], 0) === stage.total,
        '副本奖励数量错误');
      saved.run.reward = reward;
    }
  }
  if (value.nextStartAt !== undefined) {
    check(integer(value.nextStartAt, 0, Number.MAX_SAFE_INTEGER), '副本冷却时间错误');
    saved.nextStartAt = value.nextStartAt;
  }
  if (value.assisted !== undefined) {
    check(integer(value.assisted?.used, 1, 2), '背包使用次数错误');
    const save = validateGameSave(value.assisted.save);
    check(save.levelIndex === 2 && save.runId, '背包对局错误');
    saved.assisted = {used: value.assisted.used, save};
  }
  return saved;
}

/**
 * 校验玩家地区、对局与永久记录。
 */
export function validatePlayerState(
  value: any,
  regions: RegionNode[],
): PlayerState {
  check(value && value.profile, '玩家档案格式错误');
  const path = regionPath(regions, value.profile.regionCodes);
  const save = value.save === null ? null : validateGameSave(value.save);
  const cashout = value.cashout === undefined ? undefined : validateCashoutSave(value.cashout);
  const progress = validateProgress(value.progress);
  if (path.length) {
    progress.regionChosen = true;
  }
  return {
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    profile: {regionCodes: path.map((item) => item.code)},
    save,
    progress: recordCashoutProgress(recordProgress(progress, save), cashout),
    playDate: validatePlayDate(value.playDate),
    ...(cashout === undefined ? {} : {cashout}),
  };
}
