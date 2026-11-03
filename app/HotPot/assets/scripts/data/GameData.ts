import {
  IngredientType,
  IngredientConfig,
  LevelConfig,
  TileData,
  LevelData,
  INGREDIENTS,
  NORMAL_INGREDIENTS,
  HIDDEN_INGREDIENTS,
  HIDDEN_ENCOUNTER_CHANCE,
  HIDDEN_INGREDIENT_WEIGHT,
  LEVELS,
} from './GameConfig';
export {INGREDIENTS, LEVELS} from './GameConfig';
export type {
  IngredientType,
  IngredientConfig,
  LevelConfig,
  TileData,
  LevelData,
} from './GameConfig';

/**
 * 由整数种子生成可重现的伪随机数。
 */
function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }
  /**
   * 在当前操作完成后更新相关游戏状态。
   */
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/**
 * 使用传入随机源打乱数组。
 */
function shuffle<T>(list: T[], random: () => number): T[] {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * 按食材池生成可成组三张的牌型序列。
 */
function buildTypes(
  count: number,
  typeCount: number,
  typeOffset: number,
  layerIndex: number,
  random: () => number,
  pool?: IngredientType[],
): IngredientType[] {
  const availableTypeCount = Math.max(
    1,
    Math.min(10, typeCount, INGREDIENTS.length),
  );
  const groupTypes: number[] = [];
  for (let i = 0; i < count / 3; i += 1)
    groupTypes.push((i + layerIndex) % availableTypeCount);
  shuffle(groupTypes, random);
  const result: IngredientType[] = [];
  /**
   * 依次处理集合中的每个条目。
   */
  groupTypes.forEach((typeIndex) => {
    const ingredient = pool
      ? pool[typeIndex]
      : INGREDIENTS[(typeIndex + typeOffset) % 13].id;
    result.push(ingredient, ingredient, ingredient);
  });
  return shuffle(result, random);
}

export const EIGHT_ROW_IMAGE_HEIGHT = 68 * 1.2 * 1.2 * 1.15 * 0.82;
const EIGHT_ROW_SPACING = Math.ceil(EIGHT_ROW_IMAGE_HEIGHT * 1.1);

/**
 * 计算一层棋盘的牌位坐标。
 */
function buildPositions(
  count: number,
  layerIndex: number,
  targetRows?: number,
): Array<{
  /**
   * 棋盘横坐标。
   */
  x: number;
  /**
   * 棋盘纵坐标。
   */
  y: number;
}> {
  const columns = targetRows
    ? Math.ceil(count / targetRows)
    : count <= 9
      ? 3
      : count <= 15
        ? 5
        : 6;
  const rows = Math.ceil(count / columns);
  const spacingX = targetRows
    ? columns <= 3
      ? 176
      : 156
    : columns === 6
      ? 112
      : 120;
  const spacingY = targetRows ? EIGHT_ROW_SPACING : 108;
  const offsets = [
    {x: -27, y: -18},
    {x: 24, y: 17},
    {x: -11, y: 39},
    {x: 38, y: -2},
    {x: 0, y: 0},
  ];
  const baseOffset = offsets[layerIndex % offsets.length];
  // 八行牌阵每层沿不同方向错开，让下层露出牌角与侧边。
  // 纵向偏移限制在 16px 内，为最上/下排保留棋盘边距。
  const stackedOffsets = [
    {x: -28, y: -16},
    {x: 0, y: 0},
    {x: 28, y: 16},
    {x: -12, y: 8},
  ];
  const offset = targetRows
    ? stackedOffsets[layerIndex % stackedOffsets.length]
    : baseOffset;
  /**
   * 棋盘横坐标。
   */
  /**
   * 棋盘纵坐标。
   */
  const result: Array<{x: number; y: number}> = [];
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
function buildLevelThreePositions(
  config: LevelConfig,
  layoutSeed: number,
): Array<
  Array<{
    /**
     * 棋盘横坐标。
     */
    x: number;
    /**
     * 棋盘纵坐标。
     */
    y: number;
  }>
> {
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
  const rowShifts = [0, 1, 2].map(() =>
    randomized ? Math.floor(random() * 71) - 35 : 0,
  );
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  const columnShifts = [0, 1].map(() =>
    randomized ? Math.floor(random() * 17) - 8 : 0,
  );
  /**
   * 在当前操作完成后更新相关游戏状态。
   */
  const phases = Array.from({length: 6}, () =>
    randomized ? Math.floor(random() * 2) : 0,
  );
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  return config.layers.map((_, layer) => {
    /**
     * 棋盘横坐标。
     */
    /**
     * 棋盘纵坐标。
     */
    const positions: Array<{x: number; y: number}> = [];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const offsets =
          (layer + phases[row * 2 + col]) % 2 === 0
            ? [
                {x: -halfWidth, y: -halfHeight},
                {x: halfWidth, y: -halfHeight},
                {x: -halfWidth, y: halfHeight},
                {x: halfWidth, y: halfHeight},
              ]
            : [
                {x: -halfWidth * 2, y: 0},
                {x: halfWidth * 2, y: 0},
                {x: 0, y: -halfHeight * 2},
                {x: 0, y: halfHeight * 2},
              ];
        /**
         * 依次处理集合中的每个条目。
         */
        offsets.forEach((offset) =>
          positions.push({
            x: (col - 0.5) * spacingX + rowShifts[row] + offset.x,
            y: (1 - row) * spacingY + columnShifts[col] + offset.y,
          }),
        );
      }
    }
    return positions;
  });
}

// Keep the old seed range reproducible for existing saves. New seeds use
// visibly
// different formations and randomized ingredient placement, not small offsets.
export const RANDOM_LAYOUT_SEED_START = 2147483647;
export const RANDOM_LAYOUT_SEED_END = 4294967292;
// A separate seed range keeps every existing saved board reproducible.
export const CONNECTED_LAYOUT_SEED_START = 4294967293;
export const CONNECTED_LAYOUT_SEED_END = 6442450938;
export const VARIED_LAYOUT_SEED_START = 6442450939;
export const VARIED_LAYOUT_SEED_END = 8589934584;
export const INGREDIENT_SEED_MAX = 2147483646;

/**
 * 新局抽取整个食材组合；牛羊肉互斥，翻锅只重排该组合已有的牌。
 */
export function selectLevelIngredients(
  levelIndex: number,
  seed: number,
  poolVersion: 1 | 2 | 3 | 4 = 4,
): IngredientType[] {
  const config = LEVELS[levelIndex];
  /**
   * 在当前操作完成后更新相关游戏状态。
   */
  if (seed === 0) {
    return Array.from(
      {length: config.typeCount},
      (_, i) => INGREDIENTS[(i + (config.typeOffset || 0)) % 13].id,
    );
  }
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  if (poolVersion === 4 && levelIndex === 2) {
    const random = seededRandom(seed);
    const selected: IngredientType[] = [];
    let available = INGREDIENTS.slice();
    while (selected.length < config.typeCount) {
      const weight = (item: IngredientConfig) => item.hidden ? HIDDEN_INGREDIENT_WEIGHT : 1;
      let ticket = random() * available.reduce((sum, item) => sum + weight(item), 0);
      let chosen = available[available.length - 1];
      for (const item of available) {
        ticket -= weight(item);
        if (ticket < 0) {chosen = item; break;}
      }
      selected.push(chosen.id);
      available = available.filter(item => item.id !== chosen.id
        && !(chosen.id === 'beef' && item.id === 'lamb')
        && !(chosen.id === 'lamb' && item.id === 'beef'));
    }
    return selected;
  }
  const shuffled = shuffle(
    (poolVersion === 1 ? INGREDIENTS.slice(0, 23) : NORMAL_INGREDIENTS)
      .map((item) => item.id),
    seededRandom(seed),
  );
  const selected: IngredientType[] = [];
  for (const type of shuffled) {
    if ((type === 'beef' && selected.indexOf('lamb') >= 0)
      || (type === 'lamb' && selected.indexOf('beef') >= 0)) {
      continue;
    }
    selected.push(type);
    if (selected.length === config.typeCount) {
      break;
    }
  }
  // 独立随机源不改变 v1/v2 的历史抽取顺序，翻锅/恢复沿用本局种子。
  if (poolVersion === 3 && levelIndex === 2) {
    const rareRandom = seededRandom((seed + 104729) % INGREDIENT_SEED_MAX);
    if (rareRandom() < HIDDEN_ENCOUNTER_CHANCE) {
      selected[selected.length - 1] = HIDDEN_INGREDIENTS[
        Math.floor(rareRandom() * HIDDEN_INGREDIENTS.length)].id;
    }
  }
  return selected;
}

/**
 * 根据种子选取第三关的布局族。
 */
export function levelThreeLayoutFamily(seed = 0): number {
  if (seed >= VARIED_LAYOUT_SEED_START) {
    return (seed - VARIED_LAYOUT_SEED_START) % 3;
  }
  if (seed >= CONNECTED_LAYOUT_SEED_START) {
    return (seed - CONNECTED_LAYOUT_SEED_START) % 3;
  }
  return seed < RANDOM_LAYOUT_SEED_START
    ? -1
    : (seed - RANDOM_LAYOUT_SEED_START) % 3;
}

/** Compact, connected rows; alternating offsets reveal the lower layer. */
function buildConnectedLevelThreePositions(config: LevelConfig, seed: number)
  : Array<Array<{x: number; y: number}>> {
  const family = levelThreeLayoutFamily(seed);
  const shortRow = [0, 2, 4][family];
  return config.layers.map((_, layer) => {
    const direction = layer % 2 === 0 ? -1 : 1;
    const positions: Array<{x: number; y: number}> = [];
    for (let row = 0; row < 5; row++) {
      const columns = row === shortRow ? 4 : 5;
      for (let col = 0; col < columns; col++) {
        positions.push({
          x: (col - (columns - 1) / 2) * 114 + direction * 26,
          y: (2 - row) * 96 + direction * 22,
        });
      }
    }
    return positions;
  });
}

/** Fewer tiles per layer leave room for distinct, full-size silhouettes. */
function buildVariedLevelThreePositions(config: LevelConfig, seed: number)
  : Array<Array<{x: number; y: number}>> {
  const family = levelThreeLayoutFamily(seed);
  const shapes = [
    // Diamond, flower and butterfly; all contain eighteen positions.
    [[0], [-1, 0, 1], [-2, -1, 0, 1, 2],
      [-2, -1, 0, 1, 2], [-1, 0, 1], [0]],
    [[-.5, .5], [-2, -1, 0, 1, 2], [-2, -1, 1, 2],
      [-2, -1, 0, 1, 2], [-.5, .5]],
    [[-2, -1, 1, 2], [-2, -1, 1, 2], [-.5, .5],
      [-2, -1, 1, 2], [-2, -1, 1, 2]],
  ];
  const rows = shapes[family];
  const mask: Array<{x: number; y: number}> = [];
  rows.forEach((columns, row) => columns.forEach(col => mask.push({
    x: col * 114, y: ((rows.length - 1) / 2 - row) * 96,
  })));
  return config.layers.map((count, layer) => {
    const direction = layer % 2 === 0 ? -1 : 1;
    return Array.from({length: count}, (_, i) => {
      const point = mask[Math.floor(i * mask.length / count)];
      return {x: point.x + direction * 26, y: point.y + direction * 22};
    });
  });
}

/** Legal removal order, favoring newly exposed deeper tiles. */
export function buildLevelThreeRoute(tiles: TileData[], seed: number): number[] {
  const random = seededRandom(seed);
  const indices = new Map(tiles.map((tile, i) => [tile.id, i] as const));
  const blocked = tiles.map(tile => tile.blockedBy.length);
  const dependents: number[][] = tiles.map(() => []);
  tiles.forEach((tile, i) => tile.blockedBy.forEach(id => {
    dependents[indices.get(id)!].push(i);
  }));
  const available = tiles.map((_, i) => i).filter(i => blocked[i] === 0);
  const route: number[] = [];
  while (available.length) {
    const lowest = Math.min(...available.map(i => tiles[i].layer));
    const candidates = available.filter(i => tiles[i].layer === lowest);
    const index = candidates[Math.floor(random() * candidates.length)];
    available.splice(available.indexOf(index), 1);
    route.push(index);
    for (const lower of dependents[index]) {
      if (--blocked[lower] === 0) available.push(lower);
    }
  }
  return route;
}

/** Preserve the exact food totals, with a six-slot legal route across layers. */
function distributeConnectedTypes(tiles: TileData[], seed: number): void {
  const counts = new Map<IngredientType, number>();
  tiles.forEach(tile => counts.set(tile.type, (counts.get(tile.type) || 0) + 1));
  const groups: IngredientType[] = [];
  counts.forEach((count, type) => {
    for (let i = 0; i < count / 3; i++) groups.push(type);
  });
  shuffle(groups, seededRandom(seed + 7919));
  const route = buildLevelThreeRoute(tiles, seed);
  let cursor = 0;
  while (groups.length) {
    const batch = [groups.pop()!];
    while (batch.length < 3 && groups.length) {
      const different = groups.findIndex(type => !batch.includes(type));
      batch.push(groups.splice(different < 0 ? 0 : different, 1)[0]);
    }
    // A B A C B C A B C reaches six occupied slots, then clears.
    const pattern = batch.length === 3 ? [0, 1, 0, 2, 1, 2, 0, 1, 2]
      : batch.length === 2 ? [0, 1, 0, 1, 0, 1] : [0, 0, 0];
    for (const i of pattern) tiles[route[cursor++]].type = batch[i];
  }
}

/**
 * 根据种子生成第三关的随机布局。
 */
function buildNewLevelThreePositions(
  config: LevelConfig,
  seed: number,
): Array<
  Array<{
    /**
     * 棋盘横坐标。
     */
    x: number;
    /**
     * 棋盘纵坐标。
     */
    y: number;
  }>
> {
  const family = levelThreeLayoutFamily(seed);
  const centers =
    family === 0
      ? [
          {x: -172, y: 235},
          {x: 172, y: 235},
          {x: -172, y: -235},
          {
            x: 172,
            y: -235,
          },
        ]
      : family === 1
        ? [
            {x: 0, y: 206},
            {x: 0, y: -206},
          ]
        : [
            {x: 0, y: 280},
            {x: -180, y: 0},
            {x: 180, y: 0},
            {x: 0, y: -280},
          ];
  const count = family === 1 ? 12 : 6;
  const radiusX = family === 1 ? 2.76 : 1.18;
  const radiusY = family === 1 ? 2.24 : 1.18;
  const width = 92 * 1.2 * config.tileScale;
  const height = 76 * 1.2 * config.tileScale;
  const random = seededRandom(seed);
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  const phases = centers.map(() => Math.floor(random() * 2));
  // Alternating half-step rings cover every lower tile with at least two
  // upper tiles. Their tested radii prevent same-layer and incidental overlaps.
  /**
   * 将当前条目转换为后续处理所需的值。
   */
  return config.layers.map((_, layer) => {
    /**
     * 棋盘横坐标。
     */
    /**
     * 棋盘纵坐标。
     */
    const positions: Array<{x: number; y: number}> = [];
    /**
     * 依次处理集合中的每个条目。
     */
    centers.forEach((center, group) => {
      for (let i = 0; i < count; i += 1) {
        const angle =
          ((i + ((layer + phases[group]) % 2) / 2) * Math.PI * 2) / count;
        positions.push({
          x: center.x + Math.cos(angle) * radiusX * width,
          y: center.y + Math.sin(angle) * radiusY * height,
        });
      }
    });
    return positions;
  });
}

// Explicit seeds restore exactly; retries request a different formation family.
/**
 * 根据关卡配置和种子生成完整棋盘。
 */
export function createLevel(
  levelIndex: number,
  layoutSeed?: number,
  previousLayoutSeed?: number,
  ingredientSeed?: number,
  ingredientPoolVersion: 1 | 2 | 3 | 4 = 4,
): LevelData {
  // 显式传入牌阵种子但未传食材种子时，保持旧版本的食材配比与顺序。
  if (ingredientSeed === undefined) {
    ingredientSeed =
      layoutSeed === undefined
        ? 1 + Math.floor(Math.random() * INGREDIENT_SEED_MAX)
        : 0;
  }
  if (layoutSeed === undefined) {
    layoutSeed =
      levelIndex === 2
        ? VARIED_LAYOUT_SEED_START + Math.floor(Math.random() * 2147483646)
        : 0;
    if (levelIndex === 2
      && previousLayoutSeed !== undefined &&
      levelThreeLayoutFamily(layoutSeed) ===
        levelThreeLayoutFamily(previousLayoutSeed)) {
      layoutSeed =
        layoutSeed === VARIED_LAYOUT_SEED_END
          ? VARIED_LAYOUT_SEED_START
          : layoutSeed + 1;
    }
  }
  const varied = levelIndex === 2 && layoutSeed >= VARIED_LAYOUT_SEED_START;
  const connected = levelIndex === 2 && layoutSeed >= CONNECTED_LAYOUT_SEED_START;
  const config = varied ? {...LEVELS[levelIndex], tileScale: 1,
    layers: [12, 12, ...Array(48).fill(18)]}
    : connected ? {...LEVELS[levelIndex], tileScale: 1}
    : LEVELS[levelIndex];
  const newLayout =
    config.level === 3 && layoutSeed >= RANDOM_LAYOUT_SEED_START;
  const random = seededRandom(
    newLayout ? layoutSeed : 20260923 + config.level * 97,
  );
  const pool = ingredientSeed
    ? selectLevelIngredients(levelIndex, ingredientSeed, ingredientPoolVersion)
    : undefined;
  const tiles: TileData[] = [];
  let id = 0;
  const stackedPositions =
    config.level === 3
      ? varied
        ? buildVariedLevelThreePositions(config, layoutSeed)
        : connected
        ? buildConnectedLevelThreePositions(config, layoutSeed)
        : newLayout
        ? buildNewLevelThreePositions(config, layoutSeed)
        : buildLevelThreePositions(config, layoutSeed)
      : undefined;
  /**
   * 依次处理集合中的每个条目。
   */
  // Keep the original food inventory so existing save validation and
  // collection progress do not depend on how 888 tiles are split into layers.
  const inventory = varied ? LEVELS[levelIndex].layers.flatMap((count, layer) =>
    buildTypes(count, config.typeCount, config.typeOffset || 0,
      layer, random, pool)) : undefined;
  let inventoryOffset = 0;
  config.layers.forEach((count, layerIndex) => {
    const positions = stackedPositions
      ? stackedPositions[layerIndex]
      : buildPositions(count, layerIndex, config.rows);
    const types = inventory ? inventory.slice(inventoryOffset,
      inventoryOffset + count) : buildTypes(
      count,
      config.typeCount,
      config.typeOffset || 0,
      layerIndex,
      random,
      pool,
    );
    inventoryOffset += count;
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
  // Only neighbouring spatial cells can overlap. Iterate uppers in original
  // order so saved layouts retain exactly the same ordered blocker lists.
  const cells = new Map<string, TileData[]>();
  for (const tile of tiles) {
    const key = `${Math.floor(tile.x / tileWidth)}:`
      + `${Math.floor(tile.y / tileHeight)}`;
    if (!cells.has(key)) {
      cells.set(key, []);
    }
    cells.get(key)!.push(tile);
  }
  for (const upper of tiles) {
    const cx = Math.floor(upper.x / tileWidth);
    const cy = Math.floor(upper.y / tileHeight);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const lower of cells.get(`${cx + dx}:${cy + dy}`) || []) {
          if (upper.layer > lower.layer
            && Math.abs(lower.x - upper.x) < tileWidth
            && Math.abs(lower.y - upper.y) < tileHeight) {
            lower.blockedBy.push(upper.id);
          }
        }
      }
    }
  }
  if (connected) distributeConnectedTypes(tiles, layoutSeed);
  return {
    config,
    tiles,
    total: tiles.length,
    ...(ingredientSeed ? {ingredientSeed} : {}),
    ...(ingredientSeed && ingredientPoolVersion >= 2
      ? {ingredientPoolVersion} : {}),
    ...(config.level === 3 && layoutSeed !== 0 ? {layoutSeed} : {}),
  };
}

/** 手动重开只重排，保留食材种子、食材池版本及完整食材数量。 */
export function createRestartLevel(current: LevelData): LevelData {
  const index = current.config.level - 1;
  const restarted = createLevel(index, undefined, current.layoutSeed,
    current.ingredientSeed || 0, current.ingredientPoolVersion || 1);
  // 第一、二关沿用既有牌位，在各层内重排食材，维持每层三张成组。
  if (index < 2) {
    const random = seededRandom(1 + Math.floor(Math.random() * INGREDIENT_SEED_MAX));
    for (let layer = 0; layer < restarted.config.layers.length; layer++) {
      const tiles = restarted.tiles.filter(tile => tile.layer === layer);
      const types = shuffle(tiles.map(tile => tile.type), random);
      const previous = current.tiles.filter(tile => tile.layer === layer);
      if (types.every((type, i) => type === previous[i].type)) types.push(types.shift()!);
      tiles.forEach((tile, i) => {tile.type = types[i];});
    }
  }
  return restarted;
}

/**
 * 按食材编号查找显示配置。
 */
export function getIngredient(type: IngredientType): IngredientConfig {
  /**
   * 按条件筛选或判断条目：item.id === type。
   */
  return INGREDIENTS.find((item) => item.id === type) || INGREDIENTS[0];
}

/**
 * 只选择棋盘上未拿取的牌（含被遮挡的牌），不修改棋盘或托盘。
 */
export function selectBombTargets(
  tiles: TileData[],
  random: () => number = Math.random,
  maxCount = 6,
): TileData[] {
  const groups = new Map<IngredientType, TileData[]>();
  /**
   * 按条件筛选或判断条目：!tile.removed。
   */
  /**
   * 依次处理集合中的每个条目。
   */
  tiles
    .filter((tile) => !tile.removed)
    .forEach((tile) => {
      const group = groups.get(tile.type) || [];
      group.push(tile);
      groups.set(tile.type, group);
    });
  /**
   * 按条件筛选或判断条目：group.length >= 3。
   */
  const eligible = Array.from(groups.values()).filter(
    (group) => group.length >= 3,
  );
  if (eligible.length === 0) {
    return [];
  }
  const candidates = eligible[Math.floor(random() * eligible.length)].slice();
  const count = Math.min(Math.floor(candidates.length / 3) * 3, maxCount);
  return shuffle(candidates, random).slice(0, count);
}
