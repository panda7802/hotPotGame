export type IngredientType =
    'beef' | 'shrimp' | 'vegetable' | 'mushroom' | 'corn' | 'fish' |
    'egg' | 'jzg' | 'meetball' | 'ou' | 'tomato' | 'toufu' | 'ydf';

export interface IngredientConfig {
    id: IngredientType;
    name: string;
    color: string;
    dark: string;
}

export interface LevelConfig {
    level: number;
    title: string;
    typeCount: number;
    layers: number[];
    traySize: number;
    rows?: number;
    typeOffset?: number;
}

export interface TileData {
    id: string;
    type: IngredientType;
    x: number;
    y: number;
    layer: number;
    blockedBy: string[];
    removed: boolean;
}

export interface LevelData {
    config: LevelConfig;
    tiles: TileData[];
    total: number;
}

export const INGREDIENTS: IngredientConfig[] = [
    {id: 'beef', name: '牛肉', color: '#D9574F', dark: '#9E302F'},
    {id: 'shrimp', name: '鲜虾', color: '#FF8B62', dark: '#D85A45'},
    {id: 'vegetable', name: '青菜', color: '#65B85A', dark: '#368744'},
    {id: 'mushroom', name: '蘑菇', color: '#C69A72', dark: '#8B654E'},
    {id: 'corn', name: '玉米', color: '#F2C94C', dark: '#D49A28'},
    {id: 'fish', name: '鱼片', color: '#79B8D1', dark: '#427F9E'},
    {id: 'egg', name: '鹌鹑蛋', color: '#F0E3BF', dark: '#A7854E'},
    {id: 'jzg', name: '茶树菇', color: '#A4602B', dark: '#63321C'},
    {id: 'meetball', name: '肉丸', color: '#C98C62', dark: '#8A543A'},
    {id: 'ou', name: '莲藕', color: '#E3C69C', dark: '#9A7857'},
    {id: 'tomato', name: '番茄', color: '#E7543E', dark: '#A52F28'},
    {id: 'toufu', name: '豆腐', color: '#F0E5C8', dark: '#9A825D'},
    {id: 'ydf', name: '油豆腐', color: '#E8A543', dark: '#A96825'},
];

// Each layer is made from complete triples. A top-to-bottom solution always
// exists, while imperfect choices can still fill the seven-slot tray.
export const LEVELS: LevelConfig[] = [
    {level: 1, title: '初识火锅', typeCount: 3, layers: [9, 9], traySize: 7},
    {level: 2, title: '三鲜开胃', typeCount: 4, layers: [15, 15], traySize: 7},
    {level: 3, title: '小菜叠盘', typeCount: 5, typeOffset: 3, layers: [24, 24, 24], traySize: 7, rows: 8},
    {level: 4, title: '红汤沸腾', typeCount: 6, typeOffset: 4, layers: [24, 24, 30], traySize: 7, rows: 8},
    {level: 5, title: '筷下生风', typeCount: 7, typeOffset: 5, layers: [30, 30, 24], traySize: 7, rows: 8},
    {level: 6, title: '五味争鲜', typeCount: 8, typeOffset: 6, layers: [30, 30, 30], traySize: 7, rows: 8},
    {level: 7, title: '叠叠红锅', typeCount: 9, typeOffset: 0, layers: [24, 24, 24, 24], traySize: 7, rows: 8},
    {level: 8, title: '逼仄一格', typeCount: 10, typeOffset: 3, layers: [24, 24, 24, 30], traySize: 7, rows: 8},
    {level: 9, title: '十味齐聚', typeCount: 10, typeOffset: 0, layers: [24, 30, 30, 24], traySize: 7, rows: 8},
    {level: 10, title: '火锅大满贯', typeCount: 10, typeOffset: 3, layers: [30, 30, 30, 30], traySize: 7, rows: 8},
];

function seededRandom(seed: number): () => number {
    let value = seed % 2147483647;
    if (value <= 0) value += 2147483646;
    return () => {
        value = value * 16807 % 2147483647;
        return (value - 1) / 2147483646;
    };
}

function shuffle<T>(list: T[], random: () => number): T[] {
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

function buildTypes(count: number, typeCount: number, typeOffset: number,
                    layerIndex: number, random: () => number): IngredientType[] {
    const availableTypeCount = Math.max(1, Math.min(10, typeCount, INGREDIENTS.length));
    const groupTypes: number[] = [];
    for (let i = 0; i < count / 3; i += 1) groupTypes.push((i + layerIndex) % availableTypeCount);
    shuffle(groupTypes, random);
    const result: IngredientType[] = [];
    groupTypes.forEach((typeIndex) => {
        const ingredient = INGREDIENTS[(typeIndex + typeOffset) % INGREDIENTS.length].id;
        result.push(ingredient, ingredient, ingredient);
    });
    return shuffle(result, random);
}

export const EIGHT_ROW_IMAGE_HEIGHT = 68 * 1.2 * 1.2 * 1.15 * 0.82;
const EIGHT_ROW_SPACING = Math.ceil(EIGHT_ROW_IMAGE_HEIGHT * 1.1);

function buildPositions(count: number, layerIndex: number, targetRows?: number): Array<{ x: number; y: number }> {
    const columns = targetRows ? Math.ceil(count / targetRows) : (count <= 9 ? 3 : (count <= 15 ? 5 : 6));
    const rows = Math.ceil(count / columns);
    const spacingX = targetRows ? (columns <= 3 ? 176 : 156) : (columns === 6 ? 112 : 120);
    const spacingY = targetRows ? EIGHT_ROW_SPACING : 108;
    const offsets = [
        {x: -27, y: -18}, {x: 24, y: 17}, {x: -11, y: 39},
        {x: 38, y: -2}, {x: 0, y: 0},
    ];
    const baseOffset = offsets[layerIndex % offsets.length];
    // 八行牌阵每层沿不同方向错开，让下层露出牌角与侧边。
    // 纵向偏移限制在 16px 内，为最上/下排保留棋盘边距。
    const stackedOffsets = [
        {x: -28, y: -16}, {x: 0, y: 0},
        {x: 28, y: 16}, {x: -12, y: 8},
    ];
    const offset = targetRows ? stackedOffsets[layerIndex % stackedOffsets.length] : baseOffset;
    const result: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i += 1) {
        const row = Math.floor(i / columns);
        const itemsInRow = Math.min(columns, count - row * columns);
        const col = i - row * columns;
        // 相邻行左右交错，不改变同层行距，也不依赖随机数。
        const rowStagger = targetRows ? (row % 2 === 0 ? -10 : 10) : 0;
        result.push({
            x: (col - (itemsInRow - 1) / 2) * spacingX + offset.x + rowStagger,
            y: ((rows - 1) / 2 - row) * spacingY + offset.y,
        });
    }
    return result;
}

export function createLevel(levelIndex: number): LevelData {
    const config = LEVELS[levelIndex];
    const random = seededRandom(20260923 + config.level * 97);
    const tiles: TileData[] = [];
    let id = 0;
    config.layers.forEach((count, layerIndex) => {
        const positions = buildPositions(count, layerIndex, config.rows);
        const types = buildTypes(count, config.typeCount, config.typeOffset || 0, layerIndex, random);
        for (let i = 0; i < count; i += 1) {
            tiles.push({
                id: `L${layerIndex}T${id++}`,
                type: types[i],
                x: positions[i].x,
                y: positions[i].y,
                layer: layerIndex,
                blockedBy: [],
                removed: false,
            });
        }
    });

    const tileScale = config.rows === 8 ? 0.82 : 1;
    const tileWidth = 92 * 1.2 * tileScale;
    const tileHeight = 76 * 1.2 * tileScale;
    for (const lower of tiles) {
        for (const upper of tiles) {
            if (upper.layer <= lower.layer) continue;
            if (Math.abs(lower.x - upper.x) < tileWidth && Math.abs(lower.y - upper.y) < tileHeight) {
                lower.blockedBy.push(upper.id);
            }
        }
    }
    return {config, tiles, total: tiles.length};
}

export function getIngredient(type: IngredientType): IngredientConfig {
    return INGREDIENTS.find((item) => item.id === type) || INGREDIENTS[0];
}

/** 只选择棋盘上未拿取的牌（含被遮挡的牌），不修改棋盘或托盘。 */
export function selectBombTargets(tiles: TileData[], random: () => number = Math.random): TileData[] {
    const groups = new Map<IngredientType, TileData[]>();
    tiles.filter((tile) => !tile.removed).forEach((tile) => {
        const group = groups.get(tile.type) || [];
        group.push(tile);
        groups.set(tile.type, group);
    });
    const eligible = Array.from(groups.values()).filter((group) => group.length >= 3);
    if (eligible.length === 0) return [];
    const candidates = eligible[Math.floor(random() * eligible.length)].slice();
    const count = candidates.length >= 6 ? 6 : 3;
    return shuffle(candidates, random).slice(0, count);
}
