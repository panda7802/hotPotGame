"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INGREDIENT_SEED_MAX = exports.RANDOM_LAYOUT_SEED_END = exports.RANDOM_LAYOUT_SEED_START = exports.EIGHT_ROW_IMAGE_HEIGHT = exports.LEVELS = exports.INGREDIENTS = void 0;
exports.selectLevelIngredients = selectLevelIngredients;
exports.levelThreeLayoutFamily = levelThreeLayoutFamily;
exports.createLevel = createLevel;
exports.getIngredient = getIngredient;
exports.selectBombTargets = selectBombTargets;
exports.INGREDIENTS = [
    { id: 'beef', name: '牛肉', color: '#D9574F', dark: '#9E302F' },
    { id: 'shrimp', name: '鲜虾', color: '#FF8B62', dark: '#D85A45' },
    { id: 'vegetable', name: '青菜', color: '#65B85A', dark: '#368744' },
    { id: 'mushroom', name: '蘑菇', color: '#C69A72', dark: '#8B654E' },
    { id: 'corn', name: '玉米', color: '#F2C94C', dark: '#D49A28' },
    { id: 'fish', name: '鱼片', color: '#79B8D1', dark: '#427F9E' },
    { id: 'egg', name: '鹌鹑蛋', color: '#F0E3BF', dark: '#A7854E' },
    { id: 'jzg', name: '茶树菇', color: '#A4602B', dark: '#63321C' },
    { id: 'meetball', name: '肉丸', color: '#C98C62', dark: '#8A543A' },
    { id: 'ou', name: '莲藕', color: '#E3C69C', dark: '#9A7857' },
    { id: 'tomato', name: '番茄', color: '#E7543E', dark: '#A52F28' },
    { id: 'toufu', name: '豆腐', color: '#F0E5C8', dark: '#9A825D' },
    { id: 'ydf', name: '油豆腐', color: '#E8A543', dark: '#A96825' },
    { id: 'tripe', name: '毛肚', color: '#766054', dark: '#47372E' },
    { id: 'duckblood', name: '鸭血', color: '#A83B35', dark: '#6C2528' },
    { id: 'potato', name: '土豆', color: '#F1D48A', dark: '#A98A46' },
    { id: 'crabstick', name: '蟹棒', color: '#ED6550', dark: '#A93629' },
    { id: 'noodle', name: '宽粉', color: '#EADAC1', dark: '#AA9274' },
    { id: 'luncheon', name: '午餐肉', color: '#EAA1A1', dark: '#AD6468' },
    { id: 'kelp', name: '海带结', color: '#65753A', dark: '#354623' },
    { id: 'lamb', name: '羊肉', color: '#EFA3A5', dark: '#B66A76' },
    { id: 'blackchicken', name: '乌鸡卷', color: '#8E8987', dark: '#48454A' },
    { id: 'yam', name: '山药', color: '#F5EEDA', dark: '#A99B82' },
];
// Each layer is made from complete triples. A top-to-bottom solution always
// exists, while imperfect choices can still fill the seven-slot tray.
exports.LEVELS = [
    { level: 1, title: '开锅尝鲜', typeCount: 3, layers: [9, 9], traySize: 7 },
    { level: 2, title: '热锅练手', typeCount: 4, layers: [15, 15], traySize: 7 },
    {
        level: 3,
        title: '千层盛宴',
        typeCount: 10,
        typeOffset: 3,
        layers: Array(37).fill(24),
        traySize: 7,
        tileScale: 0.82
    },
];
/**
 * 由整数种子生成可重现的伪随机数。
 */
function seededRandom(seed) {
    let value = seed % 2147483647;
    if (value <= 0)
        value += 2147483646;
    /**
     * 在当前操作完成后更新相关游戏状态。
     */
    return  () => {
        value = value * 16807 % 2147483647;
        return (value - 1) / 2147483646;
    };
}
/**
 * 使用传入随机源打乱数组。
 */
function shuffle(list, random) {
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}
/**
 * 按食材池生成可成组三张的牌型序列。
 */
function buildTypes(count, typeCount, typeOffset, layerIndex, random, pool) {
    const availableTypeCount = Math.max(1, Math.min(10, typeCount, exports.INGREDIENTS.length));
    const groupTypes = [];
    for (let i = 0; i < count / 3; i += 1)
        groupTypes.push((i + layerIndex) % availableTypeCount);
    shuffle(groupTypes, random);
    const result = [];
    /**
     * 依次处理集合中的每个条目。
     */
    groupTypes.forEach( (typeIndex) => {
        const ingredient = pool ? pool[typeIndex] : exports.INGREDIENTS[(typeIndex + typeOffset) % 13].id;
        result.push(ingredient, ingredient, ingredient);
    });
    return shuffle(result, random);
}
exports.EIGHT_ROW_IMAGE_HEIGHT = 68 * 1.2 * 1.2 * 1.15 * 0.82;
const EIGHT_ROW_SPACING = Math.ceil(exports.EIGHT_ROW_IMAGE_HEIGHT * 1.1);
/**
 * 计算一层棋盘的牌位坐标。
 */
function buildPositions(count, layerIndex, targetRows) {
    const columns = targetRows ? Math.ceil(count / targetRows) : (count <= 9 ? 3 : (count <= 15 ? 5 : 6));
    const rows = Math.ceil(count / columns);
    const spacingX = targetRows ? (columns <= 3 ? 176 : 156) : (columns === 6 ? 112 : 120);
    const spacingY = targetRows ? EIGHT_ROW_SPACING : 108;
    const offsets = [
        { x: -27, y: -18 }, { x: 24, y: 17 }, { x: -11, y: 39 },
        { x: 38, y: -2 }, { x: 0, y: 0 },
    ];
    const baseOffset = offsets[layerIndex % offsets.length];
    // 八行牌阵每层沿不同方向错开，让下层露出牌角与侧边。
    // 纵向偏移限制在 16px 内，为最上/下排保留棋盘边距。
    const stackedOffsets = [
        { x: -28, y: -16 }, { x: 0, y: 0 },
        { x: 28, y: 16 }, { x: -12, y: 8 },
    ];
    const offset = targetRows ? stackedOffsets[layerIndex % stackedOffsets.length] : baseOffset;
    const result = [];
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
// Six separate groups alternate square/diamond arrangements. Every tile
// overlaps two tiles in the adjacent layer by at least 20% of its area,
// without overlaps within a layer or cumulative drift across 37 layers.
/**
 * 生成第三关的原有分层布局。
 */
function buildLevelThreePositions(config, layoutSeed) {
    const random = seededRandom(layoutSeed);
    // Seed zero keeps the original geometry for saves made before random layouts.
    // Group centers stay fixed through all layers, so randomization cannot create
    // drifting stacks or small accidental overlaps between neighboring groups.
    const randomized = layoutSeed !== 0;
    const spacingX = randomized ? 276 + Math.floor(random() * 35) : 288;
    const spacingY = randomized ? 260 + Math.floor(random() * 19) : 252;
    const halfWidth = randomized ? 46 : 48;
    const halfHeight = randomized ? 38 : 42;
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const rowShifts = [0, 1, 2].map( () => randomized ? Math.floor(random() * 71) - 35 : 0);
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const columnShifts = [0, 1].map( () => randomized ? Math.floor(random() * 17) - 8 : 0);
    /**
     * 在当前操作完成后更新相关游戏状态。
     */
    const phases = Array.from({ length: 6 },  () => randomized ? Math.floor(random() * 2) : 0);
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    return config.layers.map( (_, layer) => {
        const positions = [];
        for (let row = 0; row < 3; row += 1) {
            for (let col = 0; col < 2; col += 1) {
                const offsets = (layer + phases[row * 2 + col]) % 2 === 0
                    ? [{ x: -halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight },
                        { x: -halfWidth, y: halfHeight }, { x: halfWidth, y: halfHeight }]
                    : [{ x: -halfWidth * 2, y: 0 }, { x: halfWidth * 2, y: 0 },
                        { x: 0, y: -halfHeight * 2 }, { x: 0, y: halfHeight * 2 }];
                /**
                 * 依次处理集合中的每个条目。
                 */
                offsets.forEach( offset => positions.push({
                    x: (col - 0.5) * spacingX + rowShifts[row] + offset.x,
                    y: (1 - row) * spacingY + columnShifts[col] + offset.y,
                }));
            }
        }
        return positions;
    });
}
// Keep the old seed range reproducible for existing saves. New seeds use visibly
// different formations and randomized ingredient placement, not small offsets.
exports.RANDOM_LAYOUT_SEED_START = 2147483647;
exports.RANDOM_LAYOUT_SEED_END = 4294967292;
exports.INGREDIENT_SEED_MAX = 2147483646;
/**
 * 新局抽取整个食材组合；牛羊肉互斥，翻锅只重排该组合已有的牌。
 */
function selectLevelIngredients(levelIndex, seed) {
    const config = exports.LEVELS[levelIndex];
    if (seed === 0)
        /**
         * 在当前操作完成后更新相关游戏状态。
         */
        return Array.from({ length: config.typeCount },  (_, i) => exports.INGREDIENTS[(i + (config.typeOffset || 0)) % 13].id);
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const shuffled = shuffle(exports.INGREDIENTS.map( item => item.id), seededRandom(seed));
    const selected = [];
    for (const type of shuffled) {
        if ((type === 'beef' && selected.indexOf('lamb') >= 0) ||
            (type === 'lamb' && selected.indexOf('beef') >= 0))
            continue;
        selected.push(type);
        if (selected.length === config.typeCount)
            break;
    }
    return selected;
}
/**
 * 根据种子选取第三关的布局族。
 */
function levelThreeLayoutFamily(seed = 0) {
    return seed < exports.RANDOM_LAYOUT_SEED_START ? -1 : (seed - exports.RANDOM_LAYOUT_SEED_START) % 3;
}
/**
 * 根据种子生成第三关的随机布局。
 */
function buildNewLevelThreePositions(config, seed) {
    const family = levelThreeLayoutFamily(seed);
    const centers = family === 0 ? [{ x: -172, y: 235 }, { x: 172, y: 235 }, { x: -172, y: -235 }, { x: 172, y: -235 }]
        : family === 1 ? [{ x: 0, y: 206 }, { x: 0, y: -206 }]
            : [{ x: 0, y: 280 }, { x: -180, y: 0 }, { x: 180, y: 0 }, { x: 0, y: -280 }];
    const count = family === 1 ? 12 : 6;
    const radiusX = family === 1 ? 2.76 : 1.18;
    const radiusY = family === 1 ? 2.24 : 1.18;
    const width = 92 * 1.2 * config.tileScale;
    const height = 76 * 1.2 * config.tileScale;
    const random = seededRandom(seed);
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    const phases = centers.map( () => Math.floor(random() * 2));
    // Alternating half-step rings cover every lower tile with at least two
    // upper tiles. Their tested radii prevent same-layer and incidental overlaps.
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    return config.layers.map( (_, layer) => {
        const positions = [];
        /**
         * 依次处理集合中的每个条目。
         */
        centers.forEach( (center, group) => {
            for (let i = 0; i < count; i += 1) {
                const angle = (i + ((layer + phases[group]) % 2) / 2) * Math.PI * 2 / count;
                positions.push({ x: center.x + Math.cos(angle) * radiusX * width,
                    y: center.y + Math.sin(angle) * radiusY * height });
            }
        });
        return positions;
    });
}
// Explicit seeds restore exactly; retries request a different formation family.
/**
 * 根据关卡配置和种子生成完整棋盘。
 */
function createLevel(levelIndex, layoutSeed, previousLayoutSeed, ingredientSeed) {
    // 显式传入牌阵种子但未传食材种子时，保持旧版本的食材配比与顺序。
    if (ingredientSeed === undefined)
        ingredientSeed = layoutSeed === undefined
            ? 1 + Math.floor(Math.random() * exports.INGREDIENT_SEED_MAX) : 0;
    if (layoutSeed === undefined) {
        layoutSeed = levelIndex === 2 ? exports.RANDOM_LAYOUT_SEED_START + Math.floor(Math.random() * 2147483646) : 0;
        if (levelIndex === 2 && previousLayoutSeed !== undefined &&
            levelThreeLayoutFamily(layoutSeed) === levelThreeLayoutFamily(previousLayoutSeed)) {
            layoutSeed = layoutSeed === exports.RANDOM_LAYOUT_SEED_END ? exports.RANDOM_LAYOUT_SEED_START : layoutSeed + 1;
        }
    }
    const config = exports.LEVELS[levelIndex];
    const newLayout = config.level === 3 && layoutSeed >= exports.RANDOM_LAYOUT_SEED_START;
    const random = seededRandom(newLayout ? layoutSeed : 20260923 + config.level * 97);
    const pool = ingredientSeed ? selectLevelIngredients(levelIndex, ingredientSeed) : undefined;
    const tiles = [];
    let id = 0;
    const stackedPositions = config.level === 3
        ? newLayout ? buildNewLevelThreePositions(config, layoutSeed) : buildLevelThreePositions(config, layoutSeed)
        : undefined;
    /**
     * 依次处理集合中的每个条目。
     */
    config.layers.forEach( (count, layerIndex) => {
        const positions = stackedPositions ? stackedPositions[layerIndex] : buildPositions(count, layerIndex, config.rows);
        const types = buildTypes(count, config.typeCount, config.typeOffset || 0, layerIndex, random, pool);
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
    const tileScale = config.tileScale || (config.rows === 8 ? 0.82 : 1);
    const tileWidth = 92 * 1.2 * tileScale;
    const tileHeight = 76 * 1.2 * tileScale;
    for (const lower of tiles) {
        for (const upper of tiles) {
            if (upper.layer <= lower.layer)
                continue;
            if (Math.abs(lower.x - upper.x) < tileWidth && Math.abs(lower.y - upper.y) < tileHeight) {
                lower.blockedBy.push(upper.id);
            }
        }
    }
    return { config, tiles, total: tiles.length,
        ...(ingredientSeed ? { ingredientSeed } : {}),
        ...(config.level === 3 && layoutSeed !== 0 ? { layoutSeed } : {}) };
}
/**
 * 按食材编号查找显示配置。
 */
function getIngredient(type) {
    /**
     * 按条件筛选或判断条目：item.id === type。
     */
    return exports.INGREDIENTS.find( (item) => item.id === type) || exports.INGREDIENTS[0];
}
/**
 * 只选择棋盘上未拿取的牌（含被遮挡的牌），不修改棋盘或托盘。
 */
function selectBombTargets(tiles, random = Math.random) {
    const groups = new Map();
    /**
     * 按条件筛选或判断条目：!tile.removed。
     */
    /**
     * 依次处理集合中的每个条目。
     */
    tiles.filter( (tile) => !tile.removed).forEach( (tile) => {
        const group = groups.get(tile.type) || [];
        group.push(tile);
        groups.set(tile.type, group);
    });
    /**
     * 按条件筛选或判断条目：group.length >= 3。
     */
    const eligible = Array.from(groups.values()).filter( (group) => group.length >= 3);
    if (eligible.length === 0)
        return [];
    const candidates = eligible[Math.floor(random() * eligible.length)].slice();
    const count = candidates.length >= 6 ? 6 : 3;
    return shuffle(candidates, random).slice(0, count);
}
