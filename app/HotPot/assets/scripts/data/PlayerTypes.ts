import {IngredientType, LEVELS} from './GameData';
export const SAVE_VERSION = 1;
export const BOARD_VERSION = 'hotpot-20260929';
export const PROGRESS_VERSION = 1;
export const PLAY_SESSION_VERSION = 4;
export type SaveStatus = 'playing' | 'lost' | 'won';
/**
 * SavedMove 的数据结构；字段说明见各成员。
 */
export interface SavedMove {
  /**
   * 托盘中按顺序排列的食材。
   */
  tray: IngredientType[];
  /**
   * 暂存区中的食材。
   */
  reserve: IngredientType[];
  /**
   * removedIds 对应的状态或配置。
   */
  removedIds: string[];
}
/**
 * GameSave 的数据结构；字段说明见各成员。
 */
export interface GameSave extends SavedMove {
  /** 每次新开局的标识，恢复存档时保留，用于云榜去重。 */
  runId?: string;
  /**
   * 数据格式版本。
   */
  version: 1;
  /**
   * 棋盘生成算法的兼容版本。
   */
  boardVersion: string;
  /**
   * 当前关卡的零基索引。
   */
  levelIndex: number;
  /**
   * 重现棋盘布局的随机种子。
   */
  layoutSeed?: number;
  /**
   * 重现食材分布的随机种子。
   */
  ingredientSeed?: number;
  /**
   * types 对应的状态或配置。
   */
  types: IngredientType[];
  /**
   * 当前对局是否已经复活。
   */
  reviveUsed: boolean;
  /**
   * 本局已发放的奖励里程碑。
   */
  rewardedMilestones: number;
  /**
   * 各道具在本局的使用次数。
   */
  toolUses: {
    /**
     * undo 对应的状态或配置。
     */
    undo: number;
    /**
     * bomb 对应的状态或配置。
     */
    bomb: number;
    /**
     * shuffle 对应的状态或配置。
     */
    shuffle: number;
  };
  /**
   * 撤销所需的前一步状态。
   */
  lastMove: SavedMove | null;
  /**
   * 本机与云端同步的当前状态。
   */
  status: SaveStatus;
}
/**
 * RegionNode 的数据结构；字段说明见各成员。
 */
export interface RegionNode {
  /**
   * 地区行政编码。
   */
  code: string;
  /**
   * 显示名称。
   */
  name: string;
  /**
   * 下一级地区节点。
   */
  children?: RegionNode[];
}
/**
 * CollectionProgress 的数据结构；字段说明见各成员。
 */
export interface CollectionProgress {
  /**
   * 数据格式版本。
   */
  version: 1;
  /**
   * 已经发现的食材种类。
   */
  discovered: IngredientType[];
  /**
   * 各关单局最佳消除数。
   */
  bestCleared: number[];
  /**
   * 已经通关的关卡编号。
   */
  completedLevels: number[];
  /**
   * 未使用复活通关的关卡。
   */
  cleanWins: number[];
  /**
   * 是否已经选择过地区。
   */
  regionChosen: boolean;
}
/**
 * PlayerState 的数据结构；字段说明见各成员。
 */
export interface PlayerState {
  /**
   * 玩家资料与地区选择。
   */
  /**
   * regionCodes 对应的状态或配置。
   */
  profile: {regionCodes: string[]};
  /**
   * 当前对局存档。
   */
  save: GameSave | null;
  /**
   * 永久图鉴和成就记录。
   */
  progress: CollectionProgress;
  /**
   * 当前对局对应的本地自然日。
   */
  playDate: string;
}
/**
 * CloudPlayer 的数据结构；字段说明见各成员。
 */
export interface CloudPlayer {
  /**
   * 云端返回的玩家匿名编号。
   */
  playerId: string;
  /**
   * 云端档案的递增版本号。
   */
  revision: number;
  /**
   * 玩家档案或对局状态。
   */
  state: PlayerState;
  /**
   * 云端档案最后更新时间。
   */
  updatedAt: number;
  /**
   * 云端已接受的最后一次修改编号。
   */
  lastMutationId: string;
}
/**
 * 断言数据条件成立，否则抛出校验错误。
 */
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
/**
 * 检查值是否位于允许范围内的整数。
 */
export function integer(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= min &&
    (value as number) <= max
  );
}
/**
 * 通过 JSON 创建可序列化数据的深拷贝。
 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
/**
 * 创建未解锁图鉴与成就的初始进度。
 */
export function emptyProgress(): CollectionProgress {
  return {
    version: 1,
    discovered: [],
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    bestCleared: LEVELS.map(() => 0),
    completedLevels: [],
    cleanWins: [],
    regionChosen: false,
  };
}
/**
 * 创建空的玩家档案。
 */
export function emptyPlayerState(): PlayerState {
  return {
    profile: {regionCodes: []},
    save: null,
    progress: emptyProgress(),
    playDate: '',
  };
}
