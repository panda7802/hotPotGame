import {createLevel, IngredientType, INGREDIENTS, LevelData, LEVELS} from './GameData';

export const SAVE_VERSION = 1;
export const BOARD_VERSION = 'hotpot-20260929';
export const PROGRESS_VERSION = 1;
export type SaveStatus = 'playing' | 'lost' | 'won';
export interface SavedMove {
    tray: IngredientType[];
    reserve: IngredientType[];
    removedIds: string[];
}
export interface GameSave extends SavedMove {
    version: 1;
    boardVersion: string;
    levelIndex: number;
    types: IngredientType[];
    reviveUsed: boolean;
    rewardedMilestones: number;
    toolUses: {undo: number; bomb: number; shuffle: number};
    lastMove: SavedMove | null;
    status: SaveStatus;
}
export interface RegionNode {code: string; name: string; children?: RegionNode[];}
export interface CollectionProgress {
    version: 1;
    discovered: IngredientType[];
    bestCleared: number[];
    completedLevels: number[];
    cleanWins: number[];
    regionChosen: boolean;
}
export interface PlayerState {
    profile: {regionCodes: string[]};
    save: GameSave | null;
    progress: CollectionProgress;
}
export interface CloudPlayer {
    playerId: string;
    revision: number;
    state: PlayerState;
    updatedAt: number;
    lastMutationId: string;
}

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
function integer(value: unknown, min: number, max: number): value is number {
    return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
export function emptyProgress(): CollectionProgress {
    return {version: 1, discovered: [], bestCleared: LEVELS.map(() => 0), completedLevels: [], cleanWins: [], regionChosen: false};
}
export function emptyPlayerState(): PlayerState { return {profile: {regionCodes: []}, save: null, progress: emptyProgress()}; }

/** 永久记录使用集合和关卡最高值；重开、撤回、重复同步均不重复累计。 */
export function validateProgress(value: any): CollectionProgress {
    if (value === undefined) return emptyProgress(); // 兼容旧存档。
    check(value && value.version === PROGRESS_VERSION, '图鉴成就版本不兼容');
    check(typeof value.regionChosen === 'boolean', '地区成就记录错误');
    const ingredientIds = INGREDIENTS.map(item => item.id);
    check(Array.isArray(value.discovered) && value.discovered.length <= ingredientIds.length &&
        value.discovered.every(id => ingredientIds.indexOf(id) >= 0) && new Set(value.discovered).size === value.discovered.length,
    '图鉴记录错误');
    check(Array.isArray(value.bestCleared) && value.bestCleared.length === LEVELS.length &&
        value.bestCleared.every((count, index) => integer(count, 0, LEVELS[index].layers.reduce((sum, size) => sum + size, 0)) && count % 3 === 0),
    '消除里程碑错误');
    const levels = (items: any): number[] => {
        check(Array.isArray(items) && items.length <= LEVELS.length && new Set(items).size === items.length &&
            items.every(index => integer(index, 0, LEVELS.length - 1)), '通关记录错误');
        return items.slice().sort((a, b) => a - b);
    };
    const completedLevels = levels(value.completedLevels);
    const cleanWins = levels(value.cleanWins);
    check(cleanWins.every(index => completedLevels.indexOf(index) >= 0) && completedLevels.every(index =>
        value.bestCleared[index] === LEVELS[index].layers.reduce((sum, size) => sum + size, 0)), '通关里程碑不一致');
    return {version: 1, discovered: ingredientIds.filter(id => value.discovered.indexOf(id) >= 0),
        bestCleared: value.bestCleared.slice(), completedLevels, cleanWins, regionChosen: value.regionChosen};
}

export function mergeProgress(a: CollectionProgress, b: CollectionProgress): CollectionProgress {
    return {version: 1, discovered: INGREDIENTS.map(item => item.id).filter(id => a.discovered.indexOf(id) >= 0 || b.discovered.indexOf(id) >= 0),
        bestCleared: LEVELS.map((_, i) => Math.max(a.bestCleared[i], b.bestCleared[i])),
        completedLevels: LEVELS.map((_, i) => i).filter(i => a.completedLevels.indexOf(i) >= 0 || b.completedLevels.indexOf(i) >= 0),
        cleanWins: LEVELS.map((_, i) => i).filter(i => a.cleanWins.indexOf(i) >= 0 || b.cleanWins.indexOf(i) >= 0),
        regionChosen: a.regionChosen || b.regionChosen};
}

function recordProgress(progress: CollectionProgress, save: GameSave | null): CollectionProgress {
    const next = clone(progress);
    if (!save) return next;
    const removed = new Set(save.removedIds);
    const seen = new Set<IngredientType>([...next.discovered, ...save.tray, ...save.reserve]);
    template(save.levelIndex).tiles.forEach((tile, index) => { if (removed.has(tile.id)) seen.add(save.types[index]); });
    next.discovered = INGREDIENTS.map(item => item.id).filter(id => seen.has(id));
    const cleared = save.removedIds.length - save.tray.length - save.reserve.length;
    next.bestCleared[save.levelIndex] = Math.max(next.bestCleared[save.levelIndex], cleared);
    if (save.status === 'won') {
        if (next.completedLevels.indexOf(save.levelIndex) < 0) next.completedLevels.push(save.levelIndex);
        if (!save.reviveUsed && next.cleanWins.indexOf(save.levelIndex) < 0) next.cleanWins.push(save.levelIndex);
    }
    return validateProgress(next);
}

export function validateRegions(value: unknown): RegionNode[] {
    const seen = new Set<string>();
    const walk = (items: any, depth: number): RegionNode[] => {
        check(Array.isArray(items) && items.length > 0 && items.length <= 200 && depth <= 3, '地区数据格式错误');
        return items.map(item => {
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

export function regionPath(regions: RegionNode[], codes: unknown, allowEmpty = true): RegionNode[] {
    check(Array.isArray(codes) && codes.length <= 3 && (allowEmpty || codes.length > 0), '请选择完整地区');
    const result: RegionNode[] = [];
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

const templates = new Map<number, LevelData>();
function template(index: number): LevelData {
    if (!templates.has(index)) templates.set(index, createLevel(index));
    return templates.get(index)!;
}

/** 检查稳定结算后的存档；不接受飞牌中或三消未结算的半成品。 */
export function validateGameSave(value: any): GameSave {
    check(value && value.version === SAVE_VERSION && value.boardVersion === BOARD_VERSION, '存档版本不兼容');
    check(integer(value.levelIndex, 0, LEVELS.length - 1), '关卡编号错误');
    const level = template(value.levelIndex);
    check(Array.isArray(value.types) && value.types.length === level.total, '食材牌数错误');
    const expected = new Map<string, number>();
    level.tiles.forEach(tile => expected.set(tile.type, (expected.get(tile.type) || 0) + 1));
    value.types.forEach((type: string) => {
        check(expected.has(type), '食材种类错误');
        expected.set(type, expected.get(type)! - 1);
    });
    check(Array.from(expected.values()).every(count => count === 0), '食材总数不守恒');
    const ids = new Set(level.tiles.map(tile => tile.id));
    const allowed = new Set(Array.from(expected.keys()) as IngredientType[]);
    const validateMove = (move: any, full: boolean): SavedMove => {
        check(move && Array.isArray(move.removedIds) && move.removedIds.length <= level.total &&
            new Set(move.removedIds).size === move.removedIds.length && move.removedIds.every((id: string) => ids.has(id)), '移除牌记录错误');
        check(Array.isArray(move.tray) && move.tray.length <= 7 && Array.isArray(move.reserve) && move.reserve.length <= 3 &&
            [...move.tray, ...move.reserve].every(type => allowed.has(type)), '托盘或寄存区错误');
        const counts = new Map<IngredientType, number>();
        const removed = new Set(move.removedIds);
        level.tiles.forEach((tile, i) => {
            if (!removed.has(tile.id)) counts.set(value.types[i], (counts.get(value.types[i]) || 0) + 1);
        });
        [...move.tray, ...move.reserve].forEach(type => counts.set(type, (counts.get(type) || 0) + 1));
        check(Array.from(counts.values()).every(count => count % 3 === 0), '剩余食材不守恒');
        for (const type of allowed) check(move.tray.filter((item: string) => item === type).length < 3, '托盘包含未结算三消');
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
    check(toolUses && ['undo', 'bomb', 'shuffle'].every(type => integer(toolUses[type], 0, value.levelIndex === 0 ? 0 : 9)), '道具次数错误');
    check(toolUses.undo + toolUses.bomb + toolUses.shuffle <= (value.levelIndex === 0 ? 0 : 3) + value.rewardedMilestones, '道具次数超过已获奖励');
    const empty = cleared === level.total;
    check(['playing', 'lost', 'won'].indexOf(value.status) >= 0, '对局状态错误');
    check(value.status === 'won' ? empty : value.status === 'lost' ? move.tray.length === 7 :
        !empty && move.tray.length < 7, '对局状态与棋盘不一致');
    let lastMove: SavedMove | null = null;
    if (value.lastMove !== null) {
        lastMove = validateMove(value.lastMove, false);
        const removed = new Set(move.removedIds);
        check(lastMove.removedIds.every(id => removed.has(id)), '撤回记录包含未来拿牌');
        check(value.reviveUsed || lastMove.reserve.length === 0, '撤回寄存区错误');
    }
    return {...move, version: 1, boardVersion: BOARD_VERSION, levelIndex: value.levelIndex, types: value.types.slice(),
        reviveUsed: value.reviveUsed, rewardedMilestones: value.rewardedMilestones,
        toolUses: {undo: toolUses.undo, bomb: toolUses.bomb, shuffle: toolUses.shuffle}, lastMove, status: value.status};
}

export function restoreLevel(save: GameSave): LevelData {
    const valid = validateGameSave(save);
    const level = clone(template(valid.levelIndex));
    const removed = new Set(valid.removedIds);
    level.tiles.forEach((tile, i) => { tile.type = valid.types[i]; tile.removed = removed.has(tile.id); });
    return level;
}

export function validatePlayerState(value: any, regions: RegionNode[]): PlayerState {
    check(value && value.profile, '玩家档案格式错误');
    const path = regionPath(regions, value.profile.regionCodes);
    const save = value.save === null ? null : validateGameSave(value.save);
    const progress = validateProgress(value.progress);
    if (path.length) progress.regionChosen = true;
    return {profile: {regionCodes: path.map(item => item.code)}, save,
        progress: recordProgress(progress, save)};
}
