"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOARD_VERSION = exports.SAVE_VERSION = void 0;
exports.clone = clone;
exports.emptyPlayerState = emptyPlayerState;
exports.validateRegions = validateRegions;
exports.regionPath = regionPath;
exports.validateGameSave = validateGameSave;
exports.restoreLevel = restoreLevel;
exports.validatePlayerState = validatePlayerState;
const GameData_1 = require("./GameData");
exports.SAVE_VERSION = 1;
exports.BOARD_VERSION = 'hotpot-20260929';
function check(condition, message) {
    if (!condition)
        throw new Error(message);
}
function integer(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function emptyPlayerState() { return { profile: { regionCodes: [] }, save: null }; }
function validateRegions(value) {
    const seen = new Set();
    const walk = (items, depth) => {
        check(Array.isArray(items) && items.length > 0 && items.length <= 200 && depth <= 3, '地区数据格式错误');
        return items.map(item => {
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
function regionPath(regions, codes, allowEmpty = true) {
    check(Array.isArray(codes) && codes.length <= 3 && (allowEmpty || codes.length > 0), '请选择完整地区');
    const result = [];
    let nodes = regions;
    codes.forEach(code => {
        const selected = nodes.find(item => item.code === code);
        check(selected, '地区代码或上下级关系错误');
        result.push(selected);
        nodes = selected.children || [];
    });
    check(codes.length === 0 || nodes.length === 0, '请选择完整地区');
    return result;
}
const templates = new Map();
function template(index) {
    if (!templates.has(index))
        templates.set(index, (0, GameData_1.createLevel)(index));
    return templates.get(index);
}
/** 检查稳定结算后的存档；不接受飞牌中或三消未结算的半成品。 */
function validateGameSave(value) {
    check(value && value.version === exports.SAVE_VERSION && value.boardVersion === exports.BOARD_VERSION, '存档版本不兼容');
    check(integer(value.levelIndex, 0, GameData_1.LEVELS.length - 1), '关卡编号错误');
    const level = template(value.levelIndex);
    check(Array.isArray(value.types) && value.types.length === level.total, '食材牌数错误');
    const expected = new Map();
    level.tiles.forEach(tile => expected.set(tile.type, (expected.get(tile.type) || 0) + 1));
    value.types.forEach((type) => {
        check(expected.has(type), '食材种类错误');
        expected.set(type, expected.get(type) - 1);
    });
    check(Array.from(expected.values()).every(count => count === 0), '食材总数不守恒');
    const ids = new Set(level.tiles.map(tile => tile.id));
    const allowed = new Set(Array.from(expected.keys()));
    const validateMove = (move, full) => {
        check(move && Array.isArray(move.removedIds) && move.removedIds.length <= level.total &&
            new Set(move.removedIds).size === move.removedIds.length && move.removedIds.every((id) => ids.has(id)), '移除牌记录错误');
        check(Array.isArray(move.tray) && move.tray.length <= 7 && Array.isArray(move.reserve) && move.reserve.length <= 3 &&
            [...move.tray, ...move.reserve].every(type => allowed.has(type)), '托盘或寄存区错误');
        const counts = new Map();
        const removed = new Set(move.removedIds);
        level.tiles.forEach((tile, i) => {
            if (!removed.has(tile.id))
                counts.set(value.types[i], (counts.get(value.types[i]) || 0) + 1);
        });
        [...move.tray, ...move.reserve].forEach(type => counts.set(type, (counts.get(type) || 0) + 1));
        check(Array.from(counts.values()).every(count => count % 3 === 0), '剩余食材不守恒');
        for (const type of allowed)
            check(move.tray.filter((item) => item === type).length < 3, '托盘包含未结算三消');
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
    check(toolUses && ['undo', 'bomb', 'shuffle'].every(type => integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)), '道具次数错误');
    check(toolUses.undo + toolUses.bomb + toolUses.shuffle <= (value.levelIndex === 0 ? 0 : 3) + value.rewardedMilestones, '道具次数超过已获奖励');
    const empty = cleared === level.total;
    check(['playing', 'lost', 'won'].indexOf(value.status) >= 0, '对局状态错误');
    check(value.status === 'won' ? empty : value.status === 'lost' ? move.tray.length === 7 :
        !empty && move.tray.length < 7, '对局状态与棋盘不一致');
    let lastMove = null;
    if (value.lastMove !== null) {
        lastMove = validateMove(value.lastMove, false);
        const removed = new Set(move.removedIds);
        check(lastMove.removedIds.every(id => removed.has(id)), '撤回记录包含未来拿牌');
        check(value.reviveUsed || lastMove.reserve.length === 0, '撤回寄存区错误');
    }
    return { ...move, version: 1, boardVersion: exports.BOARD_VERSION, levelIndex: value.levelIndex, types: value.types.slice(),
        reviveUsed: value.reviveUsed, rewardedMilestones: value.rewardedMilestones,
        toolUses: { undo: toolUses.undo, bomb: toolUses.bomb, shuffle: toolUses.shuffle }, lastMove, status: value.status };
}
function restoreLevel(save) {
    const valid = validateGameSave(save);
    const level = clone(template(valid.levelIndex));
    const removed = new Set(valid.removedIds);
    level.tiles.forEach((tile, i) => { tile.type = valid.types[i]; tile.removed = removed.has(tile.id); });
    return level;
}
function validatePlayerState(value, regions) {
    check(value && value.profile, '玩家档案格式错误');
    const path = regionPath(regions, value.profile.regionCodes);
    return { profile: { regionCodes: path.map(item => item.code) }, save: value.save === null ? null : validateGameSave(value.save) };
}
