'use strict';
Object.defineProperty(exports, '__esModule', {value: true});
exports.PLAY_SESSION_VERSION =
  exports.PROGRESS_VERSION =
  exports.BOARD_VERSION =
  exports.SAVE_VERSION =
    void 0;
exports.check = check;
exports.integer = integer;
exports.clone = clone;
exports.emptyProgress = emptyProgress;
exports.emptyPlayerState = emptyPlayerState;
const GameData_1 = require('./GameData');
exports.SAVE_VERSION = 1;
exports.BOARD_VERSION = 'hotpot-20260929';
exports.PROGRESS_VERSION = 1;
exports.PLAY_SESSION_VERSION = 4;
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
  return Number.isInteger(value) && value >= min && value <= max;
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
  };
}
/**
 * 创建空的玩家档案。
 */
function emptyPlayerState() {
  return {
    profile: {regionCodes: []},
    save: null,
    progress: emptyProgress(),
    playDate: '',
  };
}
