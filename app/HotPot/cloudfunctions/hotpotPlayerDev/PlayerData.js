"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAY_SESSION_VERSION = exports.PROGRESS_VERSION = exports.BOARD_VERSION = exports.SAVE_VERSION = void 0;
exports.clone = clone;
exports.emptyProgress = emptyProgress;
exports.emptyPlayerState = emptyPlayerState;
exports.localPlayDate = localPlayDate;
exports.enterPlayDay = enterPlayDay;
exports.validateProgress = validateProgress;
exports.mergeProgress = mergeProgress;
exports.validateRegions = validateRegions;
exports.regionPath = regionPath;
exports.validateGameSave = validateGameSave;
exports.restoreLevel = restoreLevel;
exports.validatePlayerState = validatePlayerState;
const GameData_1 = require("./GameData");
exports.SAVE_VERSION = 1;
exports.BOARD_VERSION = 'hotpot-20260929';
exports.PROGRESS_VERSION = 1;
exports.PLAY_SESSION_VERSION = 4;
/**
 * 断言数据条件成立，否则抛出校验错误。
 */
function check(condition, message) {
    if (!condition)
        throw new Error(message);
}
/**
 * 检查值是否位于允许范围内的整数。
 */
function integer(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
}
/**
 * 通过 JSON 创建可序列化数据的深拷贝。
 */
function clone(value) { return JSON.parse(JSON.stringify(value)); }
/**
 * 创建未解锁图鉴与成就的初始进度。
 */
function emptyProgress() {
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    return { version: 1, discovered: [], bestCleared: GameData_1.LEVELS.map( () => 0), completedLevels: [], cleanWins: [], regionChosen: false };
}
/**
 * 创建空的玩家档案。
 */
function emptyPlayerState() { return { profile: { regionCodes: [] }, save: null, progress: emptyProgress(), playDate: '' }; }
/**
 * 使用设备本地自然日，不用 UTC 日期，避免本地午夜前后误判。
 */
function localPlayDate(now = new Date()) {
    /**
     * 处理 twoDigits 对应的游戏逻辑。
     */
    const twoDigits =  (value) => value < 10 ? `0${value}` : String(value);
    return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}
/**
 * 验证存档中的自然日格式和日期有效性。
 */
function validatePlayDate(value) {
    if (value === undefined || value === '')
        return ''; // 旧存档首次进入时开启新一天。
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, '对局日期错误');
    return value;
}
/**
 * 跨日时清空当前对局，同时保留地区与永久进度。
 */
function enterPlayDay(state, day) {
    check(validatePlayDate(day) !== '', '对局日期不能为空');
    return state.playDate === day ? state : { ...state, playDate: day, save: null };
}
/**
 * 永久记录使用集合和关卡最高值；重开、撤回、重复同步均不重复累计。
 */
function validateProgress(value) {
    if (value === undefined)
        return emptyProgress(); // 兼容旧存档。
    check(value && value.version === exports.PROGRESS_VERSION, '图鉴成就版本不兼容');
    check(typeof value.regionChosen === 'boolean', '地区成就记录错误');
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const ingredientIds = GameData_1.INGREDIENTS.map( item => item.id);
    check(Array.isArray(value.discovered) && value.discovered.length <= ingredientIds.length &&
        /**
         * 按条件筛选或判断条目：ingredientIds.indexOf(id) >= 0。
         */
        value.discovered.every( id => ingredientIds.indexOf(id) >= 0) && new Set(value.discovered).size === value.discovered.length, '图鉴记录错误');
    check(Array.isArray(value.bestCleared) && value.bestCleared.length === GameData_1.LEVELS.length &&
        /**
         * 按条件筛选或判断条目：integer(count, 0, GameData_1.LEVELS[index].layers.reduce((su。
         */
        /**
         * 把集合条目汇总为一个结果。
         */
        value.bestCleared.every( (count, index) => integer(count, 0, GameData_1.LEVELS[index].layers.reduce( (sum, size) => sum + size, 0)) && count % 3 === 0), '消除里程碑错误');
    /**
     * 处理 levels 对应的游戏逻辑。
     */
    const levels =  (items) => {
        check(Array.isArray(items) && items.length <= GameData_1.LEVELS.length && new Set(items).size === items.length &&
            /**
             * 按条件筛选或判断条目：integer(index, 0, GameData_1.LEVELS.length - 1)。
             */
            items.every( index => integer(index, 0, GameData_1.LEVELS.length - 1)), '通关记录错误');
        /**
         * 按指定顺序比较并排列条目。
         */
        return items.slice().sort( (a, b) => a - b);
    };
    const completedLevels = levels(value.completedLevels);
    const cleanWins = levels(value.cleanWins);
    /**
     * 按条件筛选或判断条目：completedLevels.indexOf(index) >= 0。
     */
    /**
     * 按条件筛选或判断条目：value.bestCleared[index] === GameData_1.LEVELS[index].layers。
     */
    /**
     * 把集合条目汇总为一个结果。
     */
    check(cleanWins.every( index => completedLevels.indexOf(index) >= 0) && completedLevels.every( index => value.bestCleared[index] === GameData_1.LEVELS[index].layers.reduce( (sum, size) => sum + size, 0)), '通关里程碑不一致');
    /**
     * 按条件筛选或判断条目：value.discovered.indexOf(id) >= 0。
     */
    return { version: 1, discovered: ingredientIds.filter( id => value.discovered.indexOf(id) >= 0),
        bestCleared: value.bestCleared.slice(), completedLevels, cleanWins, regionChosen: value.regionChosen };
}
/**
 * 合并两份永久进度中的集合和最大值。
 */
function mergeProgress(a, b) {
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    /**
     * 按条件筛选或判断条目：a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >=。
     */
    return { version: 1, discovered: GameData_1.INGREDIENTS.map( item => item.id).filter( id => a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >= 0),
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        bestCleared: GameData_1.LEVELS.map( (_, i) => Math.max(a.bestCleared[i], b.bestCleared[i])),
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        /**
         * 按条件筛选或判断条目：a.completedLevels.indexOf(i) >= 0 || b.completedLevels.index。
         */
        completedLevels: GameData_1.LEVELS.map( (_, i) => i).filter( i => a.completedLevels.indexOf(i) >= 0 || b.completedLevels.indexOf(i) >= 0),
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        /**
         * 按条件筛选或判断条目：a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0。
         */
        cleanWins: GameData_1.LEVELS.map( (_, i) => i).filter( i => a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0),
        regionChosen: a.regionChosen || b.regionChosen };
}
/**
 * 根据当前对局更新发现食材与关卡成就。
 */
function recordProgress(progress, save) {
    const next = clone(progress);
    if (!save)
        return next;
    const removed = new Set(save.removedIds);
    const seen = new Set([...next.discovered, ...save.tray, ...save.reserve]);
    /**
     * 依次处理集合中的每个条目。
     */
    template(save.levelIndex).tiles.forEach( (tile, index) => { if (removed.has(tile.id))
        seen.add(save.types[index]); });
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    /**
     * 按条件筛选或判断条目：seen.has(id)。
     */
    next.discovered = GameData_1.INGREDIENTS.map( item => item.id).filter( id => seen.has(id));
    const cleared = save.removedIds.length - save.tray.length - save.reserve.length;
    next.bestCleared[save.levelIndex] = Math.max(next.bestCleared[save.levelIndex], cleared);
    if (save.status === 'won') {
        if (next.completedLevels.indexOf(save.levelIndex) < 0)
            next.completedLevels.push(save.levelIndex);
        if (!save.reviveUsed && next.cleanWins.indexOf(save.levelIndex) < 0)
            next.cleanWins.push(save.levelIndex);
    }
    return validateProgress(next);
}
/**
 * 验证地区树的编码、名称和层级。
 */
function validateRegions(value) {
    const seen = new Set();
    /**
     * 处理 walk 对应的游戏逻辑。
     */
    const walk =  (items, depth) => {
        check(Array.isArray(items) && items.length > 0 && items.length <= 200 && depth <= 3, '地区数据格式错误');
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        return items.map( item => {
            check(item && typeof item.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(item.code) &&
                typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 30 &&
                !seen.has(item.code), '地区节点格式错误');
            seen.add(item.code);
            const node = { code: item.code, name: item.name };
            if (item.children !== undefined)
                node.children = walk(item.children, depth + 1);
            return node;
        });
    };
    return walk(value, 1);
}
/**
 * 根据地区编码解析地区树中的路径。
 */
function regionPath(regions, codes, allowEmpty = true) {
    check(Array.isArray(codes) && codes.length <= 3 && (allowEmpty || codes.length > 0), '请选择完整地区');
    const result = [];
    let nodes = regions;
    /**
     * 依次处理集合中的每个条目。
     */
    codes.forEach( code => {
        /**
         * 按条件筛选或判断条目：item.code === code。
         */
        const selected = nodes.find( item => item.code === code);
        check(selected, '地区代码或上下级关系错误');
        result.push(selected);
        nodes = selected.children || [];
    });
    check(codes.length === 0 || nodes.length === 0, '请选择完整地区');
    return result;
}
const templates = new Map();
const randomTemplates = new Map();
/**
 * 使用关卡种子创建可验证的棋盘模板。
 */
function template(index, layoutSeed = 0, ingredientSeed = 0) {
    const cache = layoutSeed === 0 && ingredientSeed === 0 ? templates : randomTemplates;
    if (!cache.has(index) || (cache.get(index).layoutSeed || 0) !== layoutSeed ||
        (cache.get(index).ingredientSeed || 0) !== ingredientSeed) {
        cache.set(index, (0, GameData_1.createLevel)(index, layoutSeed, undefined, ingredientSeed));
    }
    return cache.get(index);
}
/**
 * 检查稳定结算后的存档；不接受飞牌中或三消未结算的半成品。
 */
function validateGameSave(value) {
    check(value && value.version === exports.SAVE_VERSION && value.boardVersion === exports.BOARD_VERSION, '存档版本不兼容');
    check(integer(value.levelIndex, 0, GameData_1.LEVELS.length - 1), '关卡编号错误');
    check(value.layoutSeed === undefined ||
        (value.levelIndex === 2 && integer(value.layoutSeed, 1, GameData_1.RANDOM_LAYOUT_SEED_END)), '牌阵种子错误');
    check(value.ingredientSeed === undefined || integer(value.ingredientSeed, 1, GameData_1.INGREDIENT_SEED_MAX), '食材种子错误');
    const level = template(value.levelIndex, 0, value.ingredientSeed);
    check(Array.isArray(value.types) && value.types.length === level.total, '食材牌数错误');
    const expected = new Map();
    /**
     * 依次处理集合中的每个条目。
     */
    level.tiles.forEach( tile => expected.set(tile.type, (expected.get(tile.type) || 0) + 1));
    /**
     * 依次处理集合中的每个条目。
     */
    value.types.forEach( (type) => {
        check(expected.has(type), '食材种类错误');
        expected.set(type, expected.get(type) - 1);
    });
    /**
     * 按条件筛选或判断条目：count === 0。
     */
    check(Array.from(expected.values()).every( count => count === 0), '食材总数不守恒');
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const ids = new Set(level.tiles.map( tile => tile.id));
    const allowed = new Set(Array.from(expected.keys()));
    /**
     * 检查 validateMove 对应的条件并报告不符合项。
     */
    const validateMove =  (move, full) => {
        check(move && Array.isArray(move.removedIds) && move.removedIds.length <= level.total &&
            /**
             * 按条件筛选或判断条目：ids.has(id)。
             */
            new Set(move.removedIds).size === move.removedIds.length && move.removedIds.every( (id) => ids.has(id)), '移除牌记录错误');
        check(Array.isArray(move.tray) && move.tray.length <= 7 && Array.isArray(move.reserve) && move.reserve.length <= 3 &&
            /**
             * 按条件筛选或判断条目：allowed.has(type)。
             */
            [...move.tray, ...move.reserve].every( type => allowed.has(type)), '托盘或寄存区错误');
        const counts = new Map();
        const removed = new Set(move.removedIds);
        /**
         * 依次处理集合中的每个条目。
         */
        level.tiles.forEach( (tile, i) => {
            if (!removed.has(tile.id))
                counts.set(value.types[i], (counts.get(value.types[i]) || 0) + 1);
        });
        /**
         * 依次处理集合中的每个条目。
         */
        [...move.tray, ...move.reserve].forEach( type => counts.set(type, (counts.get(type) || 0) + 1));
        /**
         * 按条件筛选或判断条目：count % 3 === 0。
         */
        check(Array.from(counts.values()).every( count => count % 3 === 0), '剩余食材不守恒');
        for (const type of allowed)
            /**
             * 按条件筛选或判断条目：item === type。
             */
            check(move.tray.filter( (item) => item === type).length < 3, '托盘包含未结算三消');
        if (!full)
            check(move.tray.length < 7, '撤回快照托盘已满');
        return { tray: move.tray.slice(), reserve: move.reserve.slice(), removedIds: move.removedIds.slice() };
    };
    const move = validateMove(value, true);
    check(typeof value.reviveUsed === 'boolean' && (value.reviveUsed || move.reserve.length === 0), '复活状态错误');
    const maxRewards = value.levelIndex === 2 ? 8 : 0;
    check(integer(value.rewardedMilestones, 0, maxRewards), '阶段奖励错误');
    const cleared = move.removedIds.length - move.tray.length - move.reserve.length;
    check(cleared >= 0 && cleared % 3 === 0 && value.rewardedMilestones * 100 <= cleared + 3, '消除记录错误');
    const toolUses = value.toolUses;
    /**
     * 按条件筛选或判断条目：integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)。
     */
    check(toolUses && ['undo', 'bomb', 'shuffle'].every( type => integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)), '道具次数错误');
    check(toolUses.undo + toolUses.bomb + toolUses.shuffle <= (value.levelIndex === 0 ? 0 : 3) + value.rewardedMilestones, '道具次数超过已获奖励');
    const empty = cleared === level.total;
    check(['playing', 'lost', 'won'].indexOf(value.status) >= 0, '对局状态错误');
    check(value.status === 'won' ? empty : value.status === 'lost' ? move.tray.length === 7 :
        !empty && move.tray.length < 7, '对局状态与棋盘不一致');
    let lastMove = null;
    if (value.lastMove !== null) {
        lastMove = validateMove(value.lastMove, false);
        const removed = new Set(move.removedIds);
        /**
         * 按条件筛选或判断条目：removed.has(id)。
         */
        check(lastMove.removedIds.every( id => removed.has(id)), '撤回记录包含未来拿牌');
        check(value.reviveUsed || lastMove.reserve.length === 0, '撤回寄存区错误');
    }
    return { ...move, version: 1, boardVersion: exports.BOARD_VERSION, levelIndex: value.levelIndex, types: value.types.slice(),
        ...(value.layoutSeed === undefined ? {} : { layoutSeed: value.layoutSeed }),
        ...(value.ingredientSeed === undefined ? {} : { ingredientSeed: value.ingredientSeed }),
        reviveUsed: value.reviveUsed, rewardedMilestones: value.rewardedMilestones,
        toolUses: { undo: toolUses.undo, bomb: toolUses.bomb, shuffle: toolUses.shuffle }, lastMove, status: value.status };
}
/**
 * 从合法存档重建关卡布局与移除状态。
 */
function restoreLevel(save) {
    const valid = validateGameSave(save);
    const level = clone(template(valid.levelIndex, valid.layoutSeed, valid.ingredientSeed));
    const removed = new Set(valid.removedIds);
    /**
     * 依次处理集合中的每个条目。
     */
    level.tiles.forEach( (tile, i) => { tile.type = valid.types[i]; tile.removed = removed.has(tile.id); });
    return level;
}
/**
 * 校验玩家地区、对局与永久记录。
 */
function validatePlayerState(value, regions) {
    check(value && value.profile, '玩家档案格式错误');
    const path = regionPath(regions, value.profile.regionCodes);
    const save = value.save === null ? null : validateGameSave(value.save);
    const progress = validateProgress(value.progress);
    if (path.length)
        progress.regionChosen = true;
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    return { profile: { regionCodes: path.map( item => item.code) }, save,
        progress: recordProgress(progress, save), playDate: validatePlayDate(value.playDate) };
}
