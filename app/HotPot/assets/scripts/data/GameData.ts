export type IngredientType = 'beef' | 'shrimp' | 'vegetable' | 'mushroom' | 'corn' | 'fish';

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
    { id: 'beef', name: '牛肉', color: '#D9574F', dark: '#9E302F' },
    { id: 'shrimp', name: '鲜虾', color: '#FF8B62', dark: '#D85A45' },
    { id: 'vegetable', name: '青菜', color: '#65B85A', dark: '#368744' },
    { id: 'mushroom', name: '蘑菇', color: '#C69A72', dark: '#8B654E' },
    { id: 'corn', name: '玉米', color: '#F2C94C', dark: '#D49A28' },
    { id: 'fish', name: '鱼片', color: '#79B8D1', dark: '#427F9E' },
];

// Each layer is made from complete triples. A top-to-bottom solution always
// exists, while imperfect choices can still fill the seven-slot tray.
export const LEVELS: LevelConfig[] = [
    { level: 1, title: '初识火锅', typeCount: 3, layers: [9, 9], traySize: 7 },
    { level: 2, title: '三鲜开胃', typeCount: 4, layers: [15, 15], traySize: 7 },
    { level: 3, title: '小菜叠盘', typeCount: 4, layers: [15, 15, 15], traySize: 7 },
    { level: 4, title: '红汤沸腾', typeCount: 4, layers: [15, 15, 18], traySize: 7 },
    { level: 5, title: '筷下生风', typeCount: 4, layers: [18, 18, 18], traySize: 7 },
    { level: 6, title: '五味争鲜', typeCount: 5, layers: [21, 21, 18], traySize: 7 },
    { level: 7, title: '叠叠红锅', typeCount: 5, layers: [15, 15, 15, 15], traySize: 7 },
    { level: 8, title: '逼仄一格', typeCount: 5, layers: [15, 15, 18, 18], traySize: 7 },
    { level: 9, title: '六味齐聚', typeCount: 6, layers: [18, 18, 18, 18], traySize: 7 },
    { level: 10, title: '火锅大满贯', typeCount: 6, layers: [18, 18, 21, 21], traySize: 7 },
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

function buildTypes(count: number, typeCount: number, layerIndex: number, random: () => number): IngredientType[] {
    const groupTypes: number[] = [];
    for (let i = 0; i < count / 3; i += 1) groupTypes.push((i + layerIndex) % typeCount);
    shuffle(groupTypes, random);
    const result: IngredientType[] = [];
    groupTypes.forEach((typeIndex) => {
        result.push(INGREDIENTS[typeIndex].id, INGREDIENTS[typeIndex].id, INGREDIENTS[typeIndex].id);
    });
    return shuffle(result, random);
}

function buildPositions(count: number, layerIndex: number): Array<{ x: number; y: number }> {
    const columns = count <= 9 ? 3 : (count <= 15 ? 5 : 6);
    const rows = Math.ceil(count / columns);
    const spacingX = columns === 6 ? 96 : 108;
    const spacingY = 90;
    const offsets = [
        { x: -27, y: -18 }, { x: 24, y: 17 }, { x: -11, y: 39 },
        { x: 38, y: -2 }, { x: 0, y: 0 },
    ];
    const offset = offsets[layerIndex % offsets.length];
    const result: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i += 1) {
        const row = Math.floor(i / columns);
        const itemsInRow = Math.min(columns, count - row * columns);
        const col = i - row * columns;
        result.push({
            x: (col - (itemsInRow - 1) / 2) * spacingX + offset.x,
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
        const positions = buildPositions(count, layerIndex);
        const types = buildTypes(count, config.typeCount, layerIndex, random);
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

    for (const lower of tiles) {
        for (const upper of tiles) {
            if (upper.layer <= lower.layer) continue;
            if (Math.abs(lower.x - upper.x) < 78 && Math.abs(lower.y - upper.y) < 66) {
                lower.blockedBy.push(upper.id);
            }
        }
    }
    return { config, tiles, total: tiles.length };
}

export function getIngredient(type: IngredientType): IngredientConfig {
    return INGREDIENTS.find((item) => item.id === type) || INGREDIENTS[0];
}
