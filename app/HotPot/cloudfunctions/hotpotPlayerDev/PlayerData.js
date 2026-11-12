"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePlayerNickname = exports.emptyPlayerState = exports.emptyProgress = exports.clone = exports.ACHIEVEMENT_SYNC_VERSION = exports.CASHOUT_SYNC_VERSION = exports.PLAY_SESSION_VERSION = exports.PROGRESS_VERSION = exports.BOARD_VERSION = exports.SAVE_VERSION = exports.validateRegions = exports.regionPath = void 0;
exports.localPlayDate = localPlayDate;
exports.enterPlayDay = enterPlayDay;
exports.validateProgress = validateProgress;
exports.mergeProgress = mergeProgress;
exports.recordCashoutProgress = recordCashoutProgress;
exports.validateGameSave = validateGameSave;
exports.restoreLevel = restoreLevel;
exports.shouldUpgradeUnstartedLevelThree = shouldUpgradeUnstartedLevelThree;
exports.validateCashoutSave = validateCashoutSave;
exports.validatePlayerState = validatePlayerState;
const RegionData_1 = require("./RegionData");
const CookingProgress_1 = require("./CookingProgress");
const CashoutData_1 = require("./CashoutData");
var RegionData_2 = require("./RegionData");
Object.defineProperty(exports, "regionPath", { enumerable: true, get: function () { return RegionData_2.regionPath; } });
Object.defineProperty(exports, "validateRegions", { enumerable: true, get: function () { return RegionData_2.validateRegions; } });
const GameData_1 = require("./GameData");
const PlayerTypes_1 = require("./PlayerTypes");
var PlayerTypes_2 = require("./PlayerTypes");
Object.defineProperty(exports, "SAVE_VERSION", { enumerable: true, get: function () { return PlayerTypes_2.SAVE_VERSION; } });
Object.defineProperty(exports, "BOARD_VERSION", { enumerable: true, get: function () { return PlayerTypes_2.BOARD_VERSION; } });
Object.defineProperty(exports, "PROGRESS_VERSION", { enumerable: true, get: function () { return PlayerTypes_2.PROGRESS_VERSION; } });
Object.defineProperty(exports, "PLAY_SESSION_VERSION", { enumerable: true, get: function () { return PlayerTypes_2.PLAY_SESSION_VERSION; } });
Object.defineProperty(exports, "CASHOUT_SYNC_VERSION", { enumerable: true, get: function () { return PlayerTypes_2.CASHOUT_SYNC_VERSION; } });
Object.defineProperty(exports, "ACHIEVEMENT_SYNC_VERSION", { enumerable: true, get: function () { return PlayerTypes_2.ACHIEVEMENT_SYNC_VERSION; } });
Object.defineProperty(exports, "clone", { enumerable: true, get: function () { return PlayerTypes_2.clone; } });
Object.defineProperty(exports, "emptyProgress", { enumerable: true, get: function () { return PlayerTypes_2.emptyProgress; } });
Object.defineProperty(exports, "emptyPlayerState", { enumerable: true, get: function () { return PlayerTypes_2.emptyPlayerState; } });
Object.defineProperty(exports, "normalizePlayerNickname", { enumerable: true, get: function () { return PlayerTypes_2.normalizePlayerNickname; } });
/**
 * 使用设备本地自然日，不用 UTC 日期，避免本地午夜前后误判。
 */
function localPlayDate(now = new Date()) {
    /**
     * 处理 twoDigits 对应的游戏逻辑。
     */
    const twoDigits = (value) => value < 10 ? `0${value}` : String(value);
    return ('' +
        String(now.getFullYear()) +
        '-' +
        String(twoDigits(now.getMonth() + 1)) +
        '-' +
        String(twoDigits(now.getDate())) +
        '');
}
/**
 * 验证存档中的自然日格式和日期有效性。
 */
function validatePlayDate(value) {
    if (value === undefined || value === '') {
        return '';
    } // 旧存档首次进入时开启新一天。
    (0, PlayerTypes_1.check)(typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, '对局日期错误');
    return value;
}
/**
 * 跨日时清空当前对局，同时保留地区与永久进度。
 */
function enterPlayDay(state, day) {
    (0, PlayerTypes_1.check)(validatePlayDate(day) !== '', '对局日期不能为空');
    return state.playDate === day ? state : { ...state, playDate: day, save: null };
}
/**
 * 永久记录使用集合和关卡最高值；重开、撤回、重复同步均不重复累计。
 */
function validateProgress(value) {
    if (value === undefined) {
        return (0, PlayerTypes_1.emptyProgress)();
    } // 兼容旧存档。
    (0, PlayerTypes_1.check)(value && value.version === PlayerTypes_1.PROGRESS_VERSION, '图鉴成就版本不兼容');
    (0, PlayerTypes_1.check)(typeof value.regionChosen === 'boolean', '地区成就记录错误');
    (0, PlayerTypes_1.check)(value.thirdLevelEntered === undefined || typeof value.thirdLevelEntered === 'boolean', '第三关首次记录错误');
    (0, PlayerTypes_1.check)(value.bestCashoutStage === undefined || (0, PlayerTypes_1.integer)(value.bestCashoutStage, 0, 3), '副本成就记录错误');
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const ingredientIds = GameData_1.INGREDIENTS.map((item) => item.id);
    (0, PlayerTypes_1.check)(Array.isArray(value.discovered) &&
        value.discovered.length <= ingredientIds.length &&
        /**
         * 按条件筛选或判断条目：ingredientIds.indexOf(id) >= 0。
         */
        value.discovered.every((id) => ingredientIds.indexOf(id) >= 0) &&
        new Set(value.discovered).size === value.discovered.length, '图鉴记录错误');
    (0, PlayerTypes_1.check)(Array.isArray(value.bestCleared) &&
        value.bestCleared.length === GameData_1.LEVELS.length &&
        /**
         * 按条件筛选或判断条目：integer(count, 0, LEVELS[index].layers.reduce((sum, size)
         * =>。
         */
        /**
         * 把集合条目汇总为一个结果。
         */
        value.bestCleared.every((count, index) => (0, PlayerTypes_1.integer)(count, 0, GameData_1.LEVELS[index].layers.reduce((sum, size) => sum + size, 0)) && count % 3 === 0), '消除里程碑错误');
    /**
     * 处理 levels 对应的游戏逻辑。
     */
    const levels = (items) => {
        (0, PlayerTypes_1.check)(Array.isArray(items) &&
            items.length <= GameData_1.LEVELS.length &&
            new Set(items).size === items.length &&
            /**
             * 按条件筛选或判断条目：integer(index, 0, LEVELS.length - 1)。
             */
            items.every((index) => (0, PlayerTypes_1.integer)(index, 0, GameData_1.LEVELS.length - 1)), '通关记录错误');
        /**
         * 按指定顺序比较并排列条目。
         */
        return items.slice().sort((a, b) => a - b);
    };
    const completedLevels = levels(value.completedLevels);
    const cleanWins = levels(value.cleanWins);
    const cooking = (0, CookingProgress_1.validateCooking)(value.cooking);
    /**
     * 按条件筛选或判断条目：completedLevels.indexOf(index) >= 0。
     */
    /**
     * 按条件筛选或判断条目：value.bestCleared[index] === LEVELS[index].layers.reduce((su。
     */
    (0, PlayerTypes_1.check)(cleanWins.every((index) => completedLevels.indexOf(index) >= 0) &&
        completedLevels.every((index) => 
        /**
         * 把集合条目汇总为一个结果。
         */
        value.bestCleared[index] ===
            GameData_1.LEVELS[index].layers.reduce((sum, size) => sum + size, 0)), '通关里程碑不一致');
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
        ...(value.bestCashoutStage ? { bestCashoutStage: value.bestCashoutStage } : {}),
        ...(cooking ? { cooking } : {}),
    };
}
/**
 * 合并两份永久进度中的集合和最大值。
 */
function mergeProgress(a, b) {
    const bestCashoutStage = Math.max(a.bestCashoutStage || 0, b.bestCashoutStage || 0);
    const cooking = (0, CookingProgress_1.mergeCooking)(a.cooking, b.cooking);
    return {
        version: 1,
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        /**
         * 按条件筛选或判断条目：a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >=。
         */
        discovered: GameData_1.INGREDIENTS.map((item) => item.id).filter((id) => a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >= 0),
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        bestCleared: GameData_1.LEVELS.map((_, i) => Math.max(a.bestCleared[i], b.bestCleared[i])),
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        /**
         * 按条件筛选或判断条目：a.completedLevels.indexOf(i) >= 0 || b.completedLevels.index。
         */
        completedLevels: GameData_1.LEVELS.map((_, i) => i).filter((i) => a.completedLevels.indexOf(i) >= 0 || b.completedLevels.indexOf(i) >= 0),
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        /**
         * 按条件筛选或判断条目：a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0。
         */
        cleanWins: GameData_1.LEVELS.map((_, i) => i).filter((i) => a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0),
        regionChosen: a.regionChosen || b.regionChosen,
        thirdLevelEntered: !!(a.thirdLevelEntered || b.thirdLevelEntered),
        ...(bestCashoutStage ? { bestCashoutStage } : {}),
        ...(cooking ? { cooking } : {}),
    };
}
function recordCashoutProgress(progress, cashout) {
    const run = cashout === null || cashout === void 0 ? void 0 : cashout.run;
    if ((run === null || run === void 0 ? void 0 : run.status) !== 'won' || run.stage + 1 <= (progress.bestCashoutStage || 0)) {
        return progress;
    }
    return { ...progress, bestCashoutStage: run.stage + 1 };
}
/**
 * 根据当前对局更新发现食材与关卡成就。
 */
function recordProgress(progress, save) {
    const next = (0, PlayerTypes_1.clone)(progress);
    if (!save) {
        return next;
    }
    if (save.levelIndex === 2)
        next.thirdLevelEntered = true;
    const removed = new Set(save.removedIds);
    const seen = new Set([
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
    next.discovered = GameData_1.INGREDIENTS.map((item) => item.id).filter((id) => seen.has(id));
    const cleared = save.removedIds.length - save.tray.length - save.reserve.length;
    next.bestCleared[save.levelIndex] = Math.max(next.bestCleared[save.levelIndex], cleared);
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
const templates = new Map();
const randomTemplates = new Map();
/**
 * 使用关卡种子创建可验证的棋盘模板。
 */
function template(index, layoutSeed = 0, ingredientSeed = 0, ingredientPoolVersion = 1) {
    if (layoutSeed === 0 && ingredientSeed === 0) {
        if (!templates.has(index)) {
            templates.set(index, (0, GameData_1.createLevel)(index, 0, undefined, 0));
        }
        return templates.get(index);
    }
    // Inventory validation and geometry restoration use different seeds. They
    // must not evict each other and regenerate a full board on every restore.
    const key = `${index}:${layoutSeed}:${ingredientSeed}:${ingredientPoolVersion}`;
    if (!randomTemplates.has(key)) {
        randomTemplates.set(key, (0, GameData_1.createLevel)(index, layoutSeed, undefined, ingredientSeed, ingredientPoolVersion));
        if (randomTemplates.size > 4) {
            randomTemplates.delete(randomTemplates.keys().next().value);
        }
    }
    return randomTemplates.get(key);
}
/**
 * 检查稳定结算后的存档；不接受飞牌中或三消未结算的半成品。
 */
function validateGameSave(value) {
    (0, PlayerTypes_1.check)(value &&
        value.version === PlayerTypes_1.SAVE_VERSION &&
        value.boardVersion === PlayerTypes_1.BOARD_VERSION, '存档版本不兼容');
    (0, PlayerTypes_1.check)((0, PlayerTypes_1.integer)(value.levelIndex, 0, GameData_1.LEVELS.length - 1), '关卡编号错误');
    (0, PlayerTypes_1.check)(value.runId === undefined || (typeof value.runId === 'string'
        && /^[a-z0-9-]{8,80}$/.test(value.runId)), '牌局标识错误');
    (0, PlayerTypes_1.check)(value.layoutSeed === undefined ||
        (value.levelIndex === 2 &&
            (0, PlayerTypes_1.integer)(value.layoutSeed, 1, GameData_1.VARIED_LAYOUT_SEED_END)), '牌阵种子错误');
    (0, PlayerTypes_1.check)(value.ingredientSeed === undefined ||
        (0, PlayerTypes_1.integer)(value.ingredientSeed, 1, GameData_1.INGREDIENT_SEED_MAX), '食材种子错误');
    (0, PlayerTypes_1.check)(value.ingredientPoolVersion === undefined
        || value.ingredientPoolVersion === 1 || value.ingredientPoolVersion === 2
        || value.ingredientPoolVersion === 3 || value.ingredientPoolVersion === 4, '食材池版本错误');
    const validationSeed = value.layoutSeed >= GameData_1.VARIED_LAYOUT_SEED_START
        ? value.layoutSeed : 0;
    const level = template(value.levelIndex, validationSeed, value.ingredientSeed, value.ingredientPoolVersion);
    (0, PlayerTypes_1.check)(Array.isArray(value.types) && value.types.length === level.total, '食材牌数错误');
    const expected = new Map();
    /**
     * 依次处理集合中的每个条目。
     */
    level.tiles.forEach((tile) => expected.set(tile.type, (expected.get(tile.type) || 0) + 1));
    /**
     * 依次处理集合中的每个条目。
     */
    value.types.forEach((type) => {
        (0, PlayerTypes_1.check)(expected.has(type), '食材种类错误');
        expected.set(type, expected.get(type) - 1);
    });
    /**
     * 按条件筛选或判断条目：count === 0。
     */
    (0, PlayerTypes_1.check)(Array.from(expected.values()).every((count) => count === 0), '食材总数不守恒');
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const ids = new Set(level.tiles.map((tile) => tile.id));
    const allowed = new Set(Array.from(expected.keys()));
    /**
     * 检查 validateMove 对应的条件并报告不符合项。
     */
    const validateMove = (move, full) => {
        (0, PlayerTypes_1.check)(move &&
            Array.isArray(move.removedIds) &&
            move.removedIds.length <= level.total &&
            /**
             * 按条件筛选或判断条目：ids.has(id)。
             */
            new Set(move.removedIds).size === move.removedIds.length &&
            move.removedIds.every((id) => ids.has(id)), '移除牌记录错误');
        (0, PlayerTypes_1.check)(Array.isArray(move.tray) &&
            move.tray.length <= 7 &&
            Array.isArray(move.reserve) &&
            move.reserve.length <= (value.levelIndex === 2 ? level.total : 3) &&
            /**
             * 按条件筛选或判断条目：allowed.has(type)。
             */
            [...move.tray, ...move.reserve].every((type) => allowed.has(type)), '托盘或寄存区错误');
        const counts = new Map();
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
        [...move.tray, ...move.reserve].forEach((type) => counts.set(type, (counts.get(type) || 0) + 1));
        /**
         * 按条件筛选或判断条目：count % 3 === 0。
         */
        (0, PlayerTypes_1.check)(Array.from(counts.values()).every((count) => count % 3 === 0), '剩余食材不守恒');
        /**
         * 按条件筛选或判断条目：item === type。
         */
        for (const type of allowed)
            (0, PlayerTypes_1.check)(move.tray.filter((item) => item === type).length < 3, '托盘包含未结算三消');
        if (!full) {
            (0, PlayerTypes_1.check)(move.tray.length < 7, '撤回快照托盘已满');
        }
        return {
            tray: move.tray.slice(),
            reserve: move.reserve.slice(),
            removedIds: move.removedIds.slice(),
        };
    };
    const move = validateMove(value, true);
    (0, PlayerTypes_1.check)(typeof value.reviveUsed === 'boolean' &&
        (value.reviveUsed || move.reserve.length === 0), '复活状态错误');
    const maxRewards = value.levelIndex === 2 ? 8 : 0;
    (0, PlayerTypes_1.check)((0, PlayerTypes_1.integer)(value.rewardedMilestones, 0, maxRewards), '阶段奖励错误');
    const cleared = move.removedIds.length - move.tray.length - move.reserve.length;
    (0, PlayerTypes_1.check)(cleared >= 0 &&
        cleared % 3 === 0 &&
        value.rewardedMilestones * 100 <= cleared + 3, '消除记录错误');
    const toolUses = value.toolUses;
    /**
     * 按条件筛选或判断条目：integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)。
     */
    (0, PlayerTypes_1.check)(toolUses &&
        ['undo', 'bomb', 'shuffle'].every((type) => (0, PlayerTypes_1.integer)(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)), '道具次数错误');
    (0, PlayerTypes_1.check)(toolUses.undo + toolUses.bomb + toolUses.shuffle <=
        (value.levelIndex === 0 ? 0 : 3) + value.rewardedMilestones, '道具次数超过已获奖励');
    const empty = cleared === level.total;
    (0, PlayerTypes_1.check)(['playing', 'lost', 'won'].indexOf(value.status) >= 0, '对局状态错误');
    (0, PlayerTypes_1.check)(value.status === 'won'
        ? empty
        : value.status === 'lost'
            ? move.tray.length === 7
            : !empty && move.tray.length < 7, '对局状态与棋盘不一致');
    let lastMove = null;
    if (value.lastMove !== null) {
        lastMove = validateMove(value.lastMove, false);
        const removed = new Set(move.removedIds);
        /**
         * 按条件筛选或判断条目：removed.has(id)。
         */
        (0, PlayerTypes_1.check)(lastMove.removedIds.every((id) => removed.has(id)), '撤回记录包含未来拿牌');
        (0, PlayerTypes_1.check)(value.reviveUsed || lastMove.reserve.length === 0, '撤回寄存区错误');
    }
    return {
        ...move,
        ...(value.runId === undefined ? {} : { runId: value.runId }),
        version: 1,
        boardVersion: PlayerTypes_1.BOARD_VERSION,
        levelIndex: value.levelIndex,
        types: value.types.slice(),
        ...(value.layoutSeed === undefined ? {} : { layoutSeed: value.layoutSeed }),
        ...(value.ingredientSeed === undefined
            ? {}
            : { ingredientSeed: value.ingredientSeed }),
        ...(value.ingredientPoolVersion === undefined
            ? {} : { ingredientPoolVersion: value.ingredientPoolVersion }),
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
function restoreLevel(save) {
    const valid = validateGameSave(save);
    const level = (0, PlayerTypes_1.clone)(template(valid.levelIndex, valid.layoutSeed, valid.ingredientSeed, valid.ingredientPoolVersion));
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
function shouldUpgradeUnstartedLevelThree(save) {
    return save.levelIndex === 2 && save.status === 'playing'
        && (save.layoutSeed || 0) < GameData_1.VARIED_LAYOUT_SEED_START
        && save.removedIds.length === 0 && save.tray.length === 0
        && save.reserve.length === 0 && !save.reviveUsed
        && save.rewardedMilestones === 0 && save.lastMove === null
        && save.toolUses.undo === 1 && save.toolUses.bomb === 1
        && save.toolUses.shuffle === 1;
}
function validateStock(value) {
    (0, PlayerTypes_1.check)(value && CashoutData_1.CASHOUT_TOOLS.every(tool => (0, PlayerTypes_1.integer)(value[tool], 0, Number.MAX_SAFE_INTEGER)), '道具库存错误');
    return { undo: value.undo, shuffle: value.shuffle, bomb: value.bomb };
}
function validateCashoutSave(value) {
    var _a;
    (0, PlayerTypes_1.check)((value === null || value === void 0 ? void 0 : value.version) === 1, '副本存档版本错误');
    const stock = validateStock(value.stock);
    const saved = { version: 1, stock, run: null };
    if (value.run !== null) {
        const run = value.run;
        (0, PlayerTypes_1.check)(run && (run.difficulty === undefined || (0, PlayerTypes_1.integer)(run.difficulty, 0, 2)), '副本难度错误');
        const stages = (0, CashoutData_1.cashoutStages)(run);
        (0, PlayerTypes_1.check)((0, PlayerTypes_1.integer)(run.stage, 0, stages.length - 1) && (0, PlayerTypes_1.integer)(run.seed, 0, 0xffffffff), '副本牌阵错误');
        const stage = stages[run.stage];
        const total = stage.layers.reduce((sum, count) => sum + count, 0);
        (0, PlayerTypes_1.check)(Array.isArray(run.removed) && run.removed.length <= total
            && new Set(run.removed).size === run.removed.length
            && run.removed.every(id => (0, PlayerTypes_1.integer)(id, 0, total - 1)), '副本移除牌错误');
        (0, PlayerTypes_1.check)(Array.isArray(run.tray) && run.tray.length <= 7
            && run.tray.every(type => GameData_1.INGREDIENTS.some(item => item.id === type)
                && run.tray.filter(item => item === type).length < 3)
            && run.removed.length >= run.tray.length
            && (run.removed.length - run.tray.length) % 3 === 0, '副本托盘错误');
        const cleared = run.removed.length === total && !run.tray.length;
        (0, PlayerTypes_1.check)(run.status === 'playing' ? !cleared && run.tray.length < 7
            : run.status === 'lost' ? run.tray.length === 7
                : (run.status === 'decision' || run.status === 'won') && cleared, '副本结算状态错误');
        saved.run = {
            ...(run.difficulty === undefined ? {} : { difficulty: run.difficulty }),
            stage: run.stage, seed: run.seed, removed: run.removed.slice(),
            tray: run.tray.slice(), status: run.status,
        };
        if (run.status === 'won') {
            const reward = validateStock(run.reward);
            (0, PlayerTypes_1.check)(CashoutData_1.CASHOUT_TOOLS.reduce((sum, tool) => sum + reward[tool], 0) === stage.total, '副本奖励数量错误');
            saved.run.reward = reward;
        }
    }
    if (value.nextStartAt !== undefined) {
        (0, PlayerTypes_1.check)((0, PlayerTypes_1.integer)(value.nextStartAt, 0, Number.MAX_SAFE_INTEGER), '副本冷却时间错误');
        saved.nextStartAt = value.nextStartAt;
    }
    if (value.assisted !== undefined) {
        (0, PlayerTypes_1.check)((0, PlayerTypes_1.integer)((_a = value.assisted) === null || _a === void 0 ? void 0 : _a.used, 1, 2), '背包使用次数错误');
        const save = validateGameSave(value.assisted.save);
        (0, PlayerTypes_1.check)(save.levelIndex === 2 && save.runId, '背包对局错误');
        saved.assisted = { used: value.assisted.used, save };
    }
    return saved;
}
/**
 * 校验玩家地区、对局与永久记录。
 */
function validatePlayerState(value, regions) {
    (0, PlayerTypes_1.check)(value && value.profile, '玩家档案格式错误');
    const path = (0, RegionData_1.regionPath)(regions, value.profile.regionCodes);
    const nickname = (0, PlayerTypes_1.normalizePlayerNickname)(value.profile.nickname);
    const nicknameRevision = value.profile.nicknameRevision;
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
        profile: {
            regionCodes: path.map(item => item.code),
            ...(nickname && (0, PlayerTypes_1.integer)(nicknameRevision, 1, Number.MAX_SAFE_INTEGER)
                ? { nickname, nicknameRevision } : {}),
        },
        save,
        progress: recordCashoutProgress(recordProgress(progress, save), cashout),
        playDate: validatePlayDate(value.playDate),
        ...(cashout === undefined ? {} : { cashout }),
    };
}
