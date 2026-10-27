import {
    createLevel,
    INGREDIENT_SEED_MAX,
    INGREDIENTS,
    IngredientType,
    LevelData,
    LEVELS,
    RANDOM_LAYOUT_SEED_END
} from './GameData';

export const SAVE_VERSION = 1;
export const BOARD_VERSION = 'hotpot-20260929';
export const PROGRESS_VERSION = 1;
export const PLAY_SESSION_VERSION = 4;
export type SaveStatus = 'playing' | 'lost' | 'won';

/** SavedMove 的数据结构；字段说明见各成员。 */
export interface SavedMove {
    /** 托盘中按顺序排列的食材。 */
    tray: IngredientType[];
    /** 暂存区中的食材。 */
    reserve: IngredientType[];
    /** removedIds 对应的状态或配置。 */
    removedIds: string[];
}

/** GameSave 的数据结构；字段说明见各成员。 */
export interface GameSave extends SavedMove {
    /** 数据格式版本。 */
    version: 1;
    /** 棋盘生成算法的兼容版本。 */
    boardVersion: string;
    /** 当前关卡的零基索引。 */
    levelIndex: number;
    /** 重现棋盘布局的随机种子。 */
    layoutSeed?: number;
    /** 重现食材分布的随机种子。 */
    ingredientSeed?: number;
    /** types 对应的状态或配置。 */
    types: IngredientType[];
    /** 当前对局是否已经复活。 */
    reviveUsed: boolean;
    /** 本局已发放的奖励里程碑。 */
    rewardedMilestones: number;
    /** 各道具在本局的使用次数。 */
    toolUses: {
        /** undo 对应的状态或配置。 */ undo: number;
        /** bomb 对应的状态或配置。 */ bomb: number;
        /** shuffle 对应的状态或配置。 */ shuffle: number
    };
    /** 撤销所需的前一步状态。 */
    lastMove: SavedMove | null;
    /** 本机与云端同步的当前状态。 */
    status: SaveStatus;
}

/** RegionNode 的数据结构；字段说明见各成员。 */
export interface RegionNode {
    /** 地区行政编码。 */ code: string;
    /** 显示名称。 */ name: string;
    /** 下一级地区节点。 */ children?: RegionNode[];
}

/** CollectionProgress 的数据结构；字段说明见各成员。 */
export interface CollectionProgress {
    /** 数据格式版本。 */
    version: 1;
    /** 已经发现的食材种类。 */
    discovered: IngredientType[];
    /** 各关单局最佳消除数。 */
    bestCleared: number[];
    /** 已经通关的关卡编号。 */
    completedLevels: number[];
    /** 未使用复活通关的关卡。 */
    cleanWins: number[];
    /** 是否已经选择过地区。 */
    regionChosen: boolean;
}

/** PlayerState 的数据结构；字段说明见各成员。 */
export interface PlayerState {
    /** 玩家资料与地区选择。 */
    profile: { /** regionCodes 对应的状态或配置。 */ regionCodes: string[] };
    /** 当前对局存档。 */
    save: GameSave | null;
    /** 永久图鉴和成就记录。 */
    progress: CollectionProgress;
    /** 当前对局对应的本地自然日。 */
    playDate: string;
}

/** CloudPlayer 的数据结构；字段说明见各成员。 */
export interface CloudPlayer {
    /** 云端返回的玩家匿名编号。 */
    playerId: string;
    /** 云端档案的递增版本号。 */
    revision: number;
    /** 玩家档案或对局状态。 */
    state: PlayerState;
    /** 云端档案最后更新时间。 */
    updatedAt: number;
    /** 云端已接受的最后一次修改编号。 */
    lastMutationId: string;
}

/** 断言数据条件成立，否则抛出校验错误。 */
function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

/** 检查值是否位于允许范围内的整数。 */
function integer(value: unknown, min: number, max: number): value is number {
    return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/** 通过 JSON 创建可序列化数据的深拷贝。 */
export function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

/** 创建未解锁图鉴与成就的初始进度。 */
export function emptyProgress(): CollectionProgress {
    return {
        version: 1,
        discovered: [],
        bestCleared: LEVELS.map(/** 将当前条目转换为后续处理所需的值。 */() => 0),
        completedLevels: [],
        cleanWins: [],
        regionChosen: false
    };
}

/** 创建空的玩家档案。 */
export function emptyPlayerState(): PlayerState {
    return {profile: {regionCodes: []}, save: null, progress: emptyProgress(), playDate: ''};
}

/** 使用设备本地自然日，不用 UTC 日期，避免本地午夜前后误判。 */
export function localPlayDate(now = new Date()): string {
    const twoDigits = /** 处理 twoDigits 对应的游戏逻辑。 */(value: number): string => value < 10 ? `0${value}` : String(value);
    return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}

/** 验证存档中的自然日格式和日期有效性。 */
function validatePlayDate(value: any): string {
    if (value === undefined || value === '') return ''; // 旧存档首次进入时开启新一天。
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, '对局日期错误');
    return value;
}

/** 跨日时清空当前对局，同时保留地区与永久进度。 */
export function enterPlayDay(state: PlayerState, day: string): PlayerState {
    check(validatePlayDate(day) !== '', '对局日期不能为空');
    return state.playDate === day ? state : {...state, playDate: day, save: null};
}

/** 永久记录使用集合和关卡最高值；重开、撤回、重复同步均不重复累计。 */
export function validateProgress(value: any): CollectionProgress {
    if (value === undefined) return emptyProgress(); // 兼容旧存档。
    check(value && value.version === PROGRESS_VERSION, '图鉴成就版本不兼容');
    check(typeof value.regionChosen === 'boolean', '地区成就记录错误');
    const ingredientIds = INGREDIENTS.map(/** 将当前条目转换为后续处理所需的值。 */item => item.id);
    check(Array.isArray(value.discovered) && value.discovered.length <= ingredientIds.length &&
        value.discovered.every(/** 按条件筛选或判断条目：ingredientIds.indexOf(id) >= 0。 */id => ingredientIds.indexOf(id) >= 0) && new Set(value.discovered).size === value.discovered.length,
        '图鉴记录错误');
    check(Array.isArray(value.bestCleared) && value.bestCleared.length === LEVELS.length &&
        value.bestCleared.every(/** 按条件筛选或判断条目：integer(count, 0, LEVELS[index].layers.reduce((sum, size) =>。 */(count, index) => integer(count, 0, LEVELS[index].layers.reduce(/** 把集合条目汇总为一个结果。 */(sum, size) => sum + size, 0)) && count % 3 === 0),
        '消除里程碑错误');
    const levels = /** 处理 levels 对应的游戏逻辑。 */(items: any): number[] => {
        check(Array.isArray(items) && items.length <= LEVELS.length && new Set(items).size === items.length &&
            items.every(/** 按条件筛选或判断条目：integer(index, 0, LEVELS.length - 1)。 */index => integer(index, 0, LEVELS.length - 1)), '通关记录错误');
        return items.slice().sort(/** 按指定顺序比较并排列条目。 */(a, b) => a - b);
    };
    const completedLevels = levels(value.completedLevels);
    const cleanWins = levels(value.cleanWins);
    check(cleanWins.every(/** 按条件筛选或判断条目：completedLevels.indexOf(index) >= 0。 */index => completedLevels.indexOf(index) >= 0) && completedLevels.every(/** 按条件筛选或判断条目：value.bestCleared[index] === LEVELS[index].layers.reduce((su。 */index =>
        value.bestCleared[index] === LEVELS[index].layers.reduce(/** 把集合条目汇总为一个结果。 */(sum, size) => sum + size, 0)), '通关里程碑不一致');
    return {
        version: 1,
        discovered: ingredientIds.filter(/** 按条件筛选或判断条目：value.discovered.indexOf(id) >= 0。 */id => value.discovered.indexOf(id) >= 0),
        bestCleared: value.bestCleared.slice(),
        completedLevels,
        cleanWins,
        regionChosen: value.regionChosen
    };
}

/** 合并两份永久进度中的集合和最大值。 */
export function mergeProgress(a: CollectionProgress, b: CollectionProgress): CollectionProgress {
    return {
        version: 1,
        discovered: INGREDIENTS.map(/** 将当前条目转换为后续处理所需的值。 */item => item.id).filter(/** 按条件筛选或判断条目：a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >=。 */id => a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >= 0),
        bestCleared: LEVELS.map(/** 将当前条目转换为后续处理所需的值。 */(_, i) => Math.max(a.bestCleared[i], b.bestCleared[i])),
        completedLevels: LEVELS.map(/** 将当前条目转换为后续处理所需的值。 */(_, i) => i).filter(/** 按条件筛选或判断条目：a.completedLevels.indexOf(i) >= 0 || b.completedLevels.index。 */i => a.completedLevels.indexOf(i) >= 0 || b.completedLevels.indexOf(i) >= 0),
        cleanWins: LEVELS.map(/** 将当前条目转换为后续处理所需的值。 */(_, i) => i).filter(/** 按条件筛选或判断条目：a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0。 */i => a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0),
        regionChosen: a.regionChosen || b.regionChosen
    };
}

/** 根据当前对局更新发现食材与关卡成就。 */
function recordProgress(progress: CollectionProgress, save: GameSave | null): CollectionProgress {
    const next = clone(progress);
    if (!save) return next;
    const removed = new Set(save.removedIds);
    const seen = new Set<IngredientType>([...next.discovered, ...save.tray, ...save.reserve]);
    template(save.levelIndex).tiles.forEach(/** 依次处理集合中的每个条目。 */(tile, index) => {
        if (removed.has(tile.id)) seen.add(save.types[index]);
    });
    next.discovered = INGREDIENTS.map(/** 将当前条目转换为后续处理所需的值。 */item => item.id).filter(/** 按条件筛选或判断条目：seen.has(id)。 */id => seen.has(id));
    const cleared = save.removedIds.length - save.tray.length - save.reserve.length;
    next.bestCleared[save.levelIndex] = Math.max(next.bestCleared[save.levelIndex], cleared);
    if (save.status === 'won') {
        if (next.completedLevels.indexOf(save.levelIndex) < 0) next.completedLevels.push(save.levelIndex);
        if (!save.reviveUsed && next.cleanWins.indexOf(save.levelIndex) < 0) next.cleanWins.push(save.levelIndex);
    }
    return validateProgress(next);
}

/** 验证地区树的编码、名称和层级。 */
export function validateRegions(value: unknown): RegionNode[] {
    const seen = new Set<string>();
    const walk = /** 处理 walk 对应的游戏逻辑。 */(items: any, depth: number): RegionNode[] => {
        check(Array.isArray(items) && items.length > 0 && items.length <= 200 && depth <= 3, '地区数据格式错误');
        return items.map(/** 将当前条目转换为后续处理所需的值。 */item => {
            check(item && typeof item.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(item.code) &&
                typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 30 &&
                !seen.has(item.code), '地区节点格式错误');
            seen.add(item.code);
            const node: RegionNode = {code: item.code, name: item.name};
            if (item.children !== undefined) node.children = walk(item.children, depth + 1);
            return node;
        });
    };
    return walk(value, 1);
}

/** 根据地区编码解析地区树中的路径。 */
export function regionPath(regions: RegionNode[], codes: unknown, allowEmpty = true): RegionNode[] {
    check(Array.isArray(codes) && codes.length <= 3 && (allowEmpty || codes.length > 0), '请选择完整地区');
    const result: RegionNode[] = [];
    let nodes = regions;
    codes.forEach(/** 依次处理集合中的每个条目。 */code => {
        const selected = nodes.find(/** 按条件筛选或判断条目：item.code === code。 */item => item.code === code);
        check(selected, '地区代码或上下级关系错误');
        result.push(selected);
        nodes = selected.children || [];
    });
    check(codes.length === 0 || nodes.length === 0, '请选择完整地区');
    return result;
}

const templates = new Map<number, LevelData>();
const randomTemplates = new Map<number, LevelData>();

/** 使用关卡种子创建可验证的棋盘模板。 */
function template(index: number, layoutSeed = 0, ingredientSeed = 0): LevelData {
    const cache = layoutSeed === 0 && ingredientSeed === 0 ? templates : randomTemplates;
    if (!cache.has(index) || (cache.get(index)!.layoutSeed || 0) !== layoutSeed ||
        (cache.get(index)!.ingredientSeed || 0) !== ingredientSeed) {
        cache.set(index, createLevel(index, layoutSeed, undefined, ingredientSeed));
    }
    return cache.get(index)!;
}

/** 检查稳定结算后的存档；不接受飞牌中或三消未结算的半成品。 */
export function validateGameSave(value: any): GameSave {
    check(value && value.version === SAVE_VERSION && value.boardVersion === BOARD_VERSION, '存档版本不兼容');
    check(integer(value.levelIndex, 0, LEVELS.length - 1), '关卡编号错误');
    check(value.layoutSeed === undefined ||
        (value.levelIndex === 2 && integer(value.layoutSeed, 1, RANDOM_LAYOUT_SEED_END)), '牌阵种子错误');
    check(value.ingredientSeed === undefined || integer(value.ingredientSeed, 1, INGREDIENT_SEED_MAX), '食材种子错误');
    const level = template(value.levelIndex, 0, value.ingredientSeed);
    check(Array.isArray(value.types) && value.types.length === level.total, '食材牌数错误');
    const expected = new Map<string, number>();
    level.tiles.forEach(/** 依次处理集合中的每个条目。 */tile => expected.set(tile.type, (expected.get(tile.type) || 0) + 1));
    value.types.forEach(/** 依次处理集合中的每个条目。 */(type: string) => {
        check(expected.has(type), '食材种类错误');
        expected.set(type, expected.get(type)! - 1);
    });
    check(Array.from(expected.values()).every(/** 按条件筛选或判断条目：count === 0。 */count => count === 0), '食材总数不守恒');
    const ids = new Set(level.tiles.map(/** 将当前条目转换为后续处理所需的值。 */tile => tile.id));
    const allowed = new Set(Array.from(expected.keys()) as IngredientType[]);
    const validateMove = /** 检查 validateMove 对应的条件并报告不符合项。 */(move: any, full: boolean): SavedMove => {
        check(move && Array.isArray(move.removedIds) && move.removedIds.length <= level.total &&
            new Set(move.removedIds).size === move.removedIds.length && move.removedIds.every(/** 按条件筛选或判断条目：ids.has(id)。 */(id: string) => ids.has(id)), '移除牌记录错误');
        check(Array.isArray(move.tray) && move.tray.length <= 7 && Array.isArray(move.reserve) && move.reserve.length <= 3 &&
            [...move.tray, ...move.reserve].every(/** 按条件筛选或判断条目：allowed.has(type)。 */type => allowed.has(type)), '托盘或寄存区错误');
        const counts = new Map<IngredientType, number>();
        const removed = new Set(move.removedIds);
        level.tiles.forEach(/** 依次处理集合中的每个条目。 */(tile, i) => {
            if (!removed.has(tile.id)) counts.set(value.types[i], (counts.get(value.types[i]) || 0) + 1);
        });
        [...move.tray, ...move.reserve].forEach(/** 依次处理集合中的每个条目。 */type => counts.set(type, (counts.get(type) || 0) + 1));
        check(Array.from(counts.values()).every(/** 按条件筛选或判断条目：count % 3 === 0。 */count => count % 3 === 0), '剩余食材不守恒');
        for (const type of allowed) check(move.tray.filter(/** 按条件筛选或判断条目：item === type。 */(item: string) => item === type).length < 3, '托盘包含未结算三消');
        if (!full) check(move.tray.length < 7, '撤回快照托盘已满');
        return {tray: move.tray.slice(), reserve: move.reserve.slice(), removedIds: move.removedIds.slice()};
    };
    const move = validateMove(value, true);
    check(typeof value.reviveUsed === 'boolean' && (value.reviveUsed || move.reserve.length === 0), '复活状态错误');
    const maxRewards = value.levelIndex === 2 ? 8 : 0;
    check(integer(value.rewardedMilestones, 0, maxRewards), '阶段奖励错误');
    const cleared = move.removedIds.length - move.tray.length - move.reserve.length;
    check(cleared >= 0 && cleared % 3 === 0 && value.rewardedMilestones * 100 <= cleared + 3, '消除记录错误');
    const toolUses = value.toolUses;
    check(toolUses && ['undo', 'bomb', 'shuffle'].every(/** 按条件筛选或判断条目：integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)。 */type => integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)), '道具次数错误');
    check(toolUses.undo + toolUses.bomb + toolUses.shuffle <= (value.levelIndex === 0 ? 0 : 3) + value.rewardedMilestones, '道具次数超过已获奖励');
    const empty = cleared === level.total;
    check(['playing', 'lost', 'won'].indexOf(value.status) >= 0, '对局状态错误');
    check(value.status === 'won' ? empty : value.status === 'lost' ? move.tray.length === 7 :
        !empty && move.tray.length < 7, '对局状态与棋盘不一致');
    let lastMove: SavedMove | null = null;
    if (value.lastMove !== null) {
        lastMove = validateMove(value.lastMove, false);
        const removed = new Set(move.removedIds);
        check(lastMove.removedIds.every(/** 按条件筛选或判断条目：removed.has(id)。 */id => removed.has(id)), '撤回记录包含未来拿牌');
        check(value.reviveUsed || lastMove.reserve.length === 0, '撤回寄存区错误');
    }
    return {
        ...move, version: 1, boardVersion: BOARD_VERSION, levelIndex: value.levelIndex, types: value.types.slice(),
        ...(value.layoutSeed === undefined ? {} : {layoutSeed: value.layoutSeed}),
        ...(value.ingredientSeed === undefined ? {} : {ingredientSeed: value.ingredientSeed}),
        reviveUsed: value.reviveUsed, rewardedMilestones: value.rewardedMilestones,
        toolUses: {undo: toolUses.undo, bomb: toolUses.bomb, shuffle: toolUses.shuffle}, lastMove, status: value.status
    };
}

/** 从合法存档重建关卡布局与移除状态。 */
export function restoreLevel(save: GameSave): LevelData {
    const valid = validateGameSave(save);
    const level = clone(template(valid.levelIndex, valid.layoutSeed, valid.ingredientSeed));
    const removed = new Set(valid.removedIds);
    level.tiles.forEach(/** 依次处理集合中的每个条目。 */(tile, i) => {
        tile.type = valid.types[i];
        tile.removed = removed.has(tile.id);
    });
    return level;
}

/** 校验玩家地区、对局与永久记录。 */
export function validatePlayerState(value: any, regions: RegionNode[]): PlayerState {
    check(value && value.profile, '玩家档案格式错误');
    const path = regionPath(regions, value.profile.regionCodes);
    const save = value.save === null ? null : validateGameSave(value.save);
    const progress = validateProgress(value.progress);
    if (path.length) progress.regionChosen = true;
    return {
        profile: {regionCodes: path.map(/** 将当前条目转换为后续处理所需的值。 */item => item.code)}, save,
        progress: recordProgress(progress, save), playDate: validatePlayDate(value.playDate)
    };
}
