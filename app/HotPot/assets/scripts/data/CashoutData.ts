import {IngredientType} from './GameConfig';
import type {GameSave} from './PlayerData';

export const CASHOUT_TOOLS = ['undo', 'shuffle', 'bomb'] as const;
export type CashoutTool = typeof CASHOUT_TOOLS[number];
export type CashoutStock = Record<CashoutTool, number>;
export const CASHOUT_TOOL_NAMES: Record<CashoutTool, string> = {
  undo: '撤回', shuffle: '翻锅', bomb: '炸弹',
};
const CASHOUT_STAGES = [
  {total: 1, layers: [24, 24, 18], types: 8},
  {total: 2, layers: [24, 24, 24, 24, 18, 18], types: 10},
  {total: 4, layers: Array<number>(11).fill(24), types: 12},
];
const LEGACY_CASHOUT_STAGES = [
  [{total: 1, layers: [12, 12], types: 4}],
  [
    {total: 1, layers: [18, 12], types: 5},
    {total: 3, layers: [24, 15, 9], types: 6},
  ],
  [
    {total: 1, layers: [18, 12, 6], types: 5},
    {total: 2, layers: [24, 18, 12], types: 7},
    {total: 6, layers: [24, 21, 15, 12], types: 8},
  ],
];
export const CASHOUT_COOLDOWN_MS = 60 * 60 * 1000;

const FOODS: IngredientType[] = [
  'beef', 'shrimp', 'vegetable', 'mushroom', 'corn', 'toufu',
  'ou', 'crabstick', 'tomato', 'egg', 'potato', 'yam',
];
export interface CashoutTile {
  id: number;
  food: IngredientType;
  x: number;
  y: number;
  layer: number;
  blockers: number[];
}
export interface CashoutRun {
  /** Present only on runs saved before the single challenge. */
  difficulty?: number;
  stage: number;
  seed: number;
  removed: number[];
  tray: IngredientType[];
  status: 'playing' | 'decision' | 'won' | 'lost';
  reward?: CashoutStock;
}
export interface CashoutSave {
  version: 1;
  stock: CashoutStock;
  run: CashoutRun | null;
  nextStartAt?: number;
  assisted?: {used: number; save: GameSave};
}

export function emptyCashoutStock(): CashoutStock {
  return {undo: 0, shuffle: 0, bomb: 0};
}

export function cashoutStages(run: CashoutRun) {
  return run.difficulty === undefined ? CASHOUT_STAGES : LEGACY_CASHOUT_STAGES[run.difficulty];
}

export function cashoutActive(run: CashoutRun | null): run is CashoutRun & {status: 'playing' | 'decision'} {
  return run?.status === 'playing' || run?.status === 'decision';
}

export function cashoutWait(save: CashoutSave, now: number): number {
  return Math.max(0, (save.nextStartAt ?? 0) - now);
}

export function startCashout(save: CashoutSave, now: number): CashoutSave {
  if (cashoutActive(save.run) || cashoutWait(save, now) > 0) return save;
  return {...save, run: createCashoutRun(0), nextStartAt: now + CASHOUT_COOLDOWN_MS};
}

export function createCashoutRun(stage: number, difficulty?: number): CashoutRun {
  return {
    ...(difficulty === undefined ? {} : {difficulty}),
    stage, seed: Math.floor(Math.random() * 0x100000000),
    removed: [], tray: [], status: 'playing',
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function cashoutTiles(run: CashoutRun): CashoutTile[] {
  const config = cashoutStages(run)[run.stage];
  let seed = run.seed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const foods = shuffle(FOODS.slice(), random).slice(0, config.types);
  const tiles: CashoutTile[] = [];
  // Keep legacy geometry so old saved tile IDs still describe the same play.
  const offsets = run.difficulty === undefined
    ? [[0, 0], [22, -19], [-19, 17], [10, 22]] : [[0, 0], [22, -19]];
  // Every layer contains whole triplets. Clearing top to bottom always works.
  let triplet = 0;
  config.layers.forEach((count, layer) => {
    const types = shuffle(Array.from({length: count / 3}, () =>
      Array<IngredientType>(3).fill(foods[triplet++ % foods.length])).flat(), random);
    const columns = Math.min(count, 6);
    const rows = Math.ceil(count / columns);
    const [dx, dy] = offsets[layer % offsets.length];
    types.forEach((food, index) => {
      const row = Math.floor(index / columns);
      const rowLength = Math.min(columns, count - row * columns);
      tiles.push({
        id: tiles.length, food, layer,
        x: (index % columns - (rowLength - 1) / 2) * 96 + dx,
        y: (row - (rows - 1) / 2) * 96 + dy, blockers: [],
      });
    });
  });
  for (const lower of tiles) {
    lower.blockers = tiles.filter(upper => upper.layer > lower.layer
      && Math.abs(upper.x - lower.x) < 90
      && Math.abs(upper.y - lower.y) < 90).map(upper => upper.id);
  }
  return tiles;
}

export function cashoutTrayInsertion(tray: IngredientType[], food: IngredientType): number {
  const previous = tray.lastIndexOf(food);
  return previous < 0 ? tray.length : previous + 1;
}

export function takeCashoutTile(run: CashoutRun, tiles: CashoutTile[], id: number): CashoutRun {
  const tile = tiles[id];
  if (run.status !== 'playing' || !tile || run.removed.includes(id)
    || tile.blockers.some(blocker => !run.removed.includes(blocker))) return run;
  const removed = [...run.removed, id];
  const tray = run.tray.slice();
  const index = cashoutTrayInsertion(tray, tile.food);
  tray.splice(index, 0, tile.food);
  if (index >= 2 && tray[index - 1] === tile.food && tray[index - 2] === tile.food) tray.splice(index - 2, 3);
  const status = removed.length === tiles.length && !tray.length ? 'decision'
    : tray.length === 7 ? 'lost' : 'playing';
  return {...run, removed, tray, status};
}

export function settleCashout(save: CashoutSave, run: CashoutRun): CashoutSave {
  const current = save.run;
  if (run.status !== 'decision' || !current
    || (current.status !== 'playing' && current.status !== 'decision')
    || current.seed !== run.seed || current.stage !== run.stage
    || current.difficulty !== run.difficulty) return save;
  const total = cashoutStages(run)[run.stage].total;
  const reward = emptyCashoutStock();
  const stock = {...save.stock};
  for (let i = 0; i < total; i++) {
    const tool = CASHOUT_TOOLS[Math.floor(Math.random() * CASHOUT_TOOLS.length)];
    reward[tool]++;
    stock[tool]++;
  }
  return {...save, stock, run: {...run, status: 'won', reward}};
}
