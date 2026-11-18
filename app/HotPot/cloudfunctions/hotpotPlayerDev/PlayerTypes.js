"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACHIEVEMENT_SYNC_VERSION = exports.CASHOUT_SYNC_VERSION = exports.PLAY_SESSION_VERSION = exports.PROGRESS_VERSION = exports.BOARD_VERSION = exports.SAVE_VERSION = void 0;
exports.normalizePlayerNickname = normalizePlayerNickname;
exports.mergePlayerNickname = mergePlayerNickname;
exports.check = check;
exports.integer = integer;
exports.clone = clone;
exports.emptyProgress = emptyProgress;
exports.emptyPlayerState = emptyPlayerState;
const GameData_1 = require("./GameData");
exports.SAVE_VERSION = 1;
exports.BOARD_VERSION = 'hotpot-20260929';
exports.PROGRESS_VERSION = 1;
exports.PLAY_SESSION_VERSION = 7;
exports.CASHOUT_SYNC_VERSION = 1;
exports.ACHIEVEMENT_SYNC_VERSION = 1;
function normalizePlayerNickname(value) {
    if (typeof value !== 'string' || value.length > 48)
        return undefined;
    const name = value.normalize('NFKC').trim();
    return /^[\u3400-\u4dbf\u4e00-\u9fffA-Za-z0-9_]{2,12}$/.test(name)
        ? name : undefined;
}
/** Merge server-owned nickname metadata without changing the region selection. */
function mergePlayerNickname(profile, incoming) {
    var _a, _b;
    if (((_a = incoming.nicknameRevision) !== null && _a !== void 0 ? _a : 0) <= ((_b = profile.nicknameRevision) !== null && _b !== void 0 ? _b : 0))
        return profile;
    return { ...profile, nickname: incoming.nickname, nicknameRevision: incoming.nicknameRevision };
}
/**
 * 断言数据条件成立，否则抛出校验错误。
 */
function check(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
/**
 * 检查值是否位于允许范围内的整数。
 */
function integer(value, min, max) {
    return (Number.isInteger(value) &&
        value >= min &&
        value <= max);
}
/**
 * 通过 JSON 创建可序列化数据的深拷贝。
 */
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
/**
 * 创建未解锁图鉴与成就的初始进度。
 */
function emptyProgress() {
    return {
        version: 1,
        discovered: [],
        /**
         * 将当前条目转换为后续处理所需的值。
         */
        bestCleared: GameData_1.LEVELS.map(() => 0),
        completedLevels: [],
        cleanWins: [],
        regionChosen: false,
        thirdLevelEntered: false,
    };
}
/**
 * 创建空的玩家档案。
 */
function emptyPlayerState() {
    return {
        profile: { regionCodes: [] },
        save: null,
        progress: emptyProgress(),
        playDate: '',
    };
}
