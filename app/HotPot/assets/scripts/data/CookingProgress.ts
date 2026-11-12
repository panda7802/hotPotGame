import {INGREDIENTS, IngredientType} from './GameConfig';
import {COOKING_COOLDOWN, Portions, Recipe, RECIPES, recipeKey, scoreCooking, STORED_RECIPES} from './CookingData';

interface Attempt {
  id: string;
  at: number;
  skipped?: boolean;
}

interface RecipeProgress {
  best: Portions;
  firstClear?: number;
  firstPerfect?: number;
  latest: Attempt;
}

export interface CookingProgress {
  version: 1;
  dishes: Record<string, RecipeProgress>;
  sources: Record<string, {sequence: number; clears: number}>;
}

const knownIngredients = new Set(INGREDIENTS.map(food => food.id));
const sourcePattern = /^[a-z0-9]{12,36}$/;
const attemptPattern = /^[a-z0-9]{12,36}-[1-9][0-9]{0,7}$/;
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 9_000_000_000_000;
const earliest = (a?: number, b?: number) => a && b ? Math.min(a, b) : a || b;

export function emptyCooking(): CookingProgress {
  return {version: 1, dishes: {}, sources: {}};
}

/** Validate optional data independently so a bad cooking record cannot erase a match save. */
export function validateCooking(value: any): CookingProgress | undefined {
  if (value?.version !== 1) return undefined;
  const next = emptyCooking();
  for (const [id, source] of Object.entries(value.sources ?? {}).slice(0, 128) as [string, any][]) {
    if (sourcePattern.test(id) && Number.isInteger(source?.sequence) && source.sequence > 0
      && source.sequence <= 99_999_999 && Number.isInteger(source.clears)
      && source.clears >= 0 && source.clears <= source.sequence) {
      next.sources[id] = {sequence: source.sequence, clears: source.clears};
    }
  }
  for (const dish of STORED_RECIPES) {
    const key = recipeKey(dish);
    const row = value.dishes?.[key];
    const latest = row?.latest;
    if (!row?.best || !timestamp(latest?.at) || typeof latest.id !== 'string' || !attemptPattern.test(latest.id)) continue;
    const best: Portions = {};
    let total = 0;
    for (const id of knownIngredients) {
      const count = row.best[id];
      if (typeof count === 'number' && Number.isInteger(count) && count > 0 && count <= 24) {
        best[id] = count;
        total += count;
      }
    }
    if (!total || total > 48) continue;
    const {stars} = scoreCooking(dish, best);
    next.dishes[key] = {
      best,
      latest: {id: latest.id, at: latest.at, ...(latest.skipped === true ? {skipped: true} : {})},
      ...(stars >= 3 && timestamp(row.firstClear) ? {firstClear: row.firstClear} : {}),
      ...(stars === 5 && timestamp(row.firstPerfect) ? {firstPerfect: row.firstPerfect} : {}),
    };
  }
  return next;
}

function mergeDish(dish: Recipe, a: RecipeProgress, b: RecipeProgress): RecipeProgress {
  const aScore = scoreCooking(dish, a.best), bScore = scoreCooking(dish, b.best);
  const rank = bScore.stars - aScore.stars || bScore.score - aScore.score;
  const bWinsTie = rank === 0 && JSON.stringify(b.best) > JSON.stringify(a.best);
  const best = rank > 0 || bWinsTie ? b.best : a.best;
  const same = a.latest.id === b.latest.id;
  const newest = b.latest.at > a.latest.at || (b.latest.at === a.latest.at && b.latest.id > a.latest.id) ? b.latest : a.latest;
  const latest = same && (a.latest.skipped || b.latest.skipped) ? {...newest, skipped: true} : newest;
  const firstClear = earliest(a.firstClear, b.firstClear), firstPerfect = earliest(a.firstPerfect, b.firstPerfect);
  return {best, latest, ...(firstClear ? {firstClear} : {}), ...(firstPerfect ? {firstPerfect} : {})};
}

export function mergeCooking(a?: CookingProgress, b?: CookingProgress): CookingProgress | undefined {
  if (!a || !b) return a || b;
  const result = emptyCooking();
  for (const dish of STORED_RECIPES) {
    const key = recipeKey(dish), left = a.dishes[key], right = b.dishes[key];
    if (left && right) result.dishes[key] = mergeDish(dish, left, right);
    else if (left || right) result.dishes[key] = left || right;
  }
  const sources = new Set([...Object.keys(a.sources), ...Object.keys(b.sources)]);
  for (const id of Array.from(sources).sort()) {
    const left = a.sources[id], right = b.sources[id];
    result.sources[id] = {
      sequence: Math.max(left?.sequence ?? 0, right?.sequence ?? 0),
      clears: Math.max(left?.clears ?? 0, right?.clears ?? 0),
    };
  }
  return result;
}

export function settleCooking(progress: CookingProgress, dish: Recipe, portions: Portions,
  source: string, sequence: number, at: number): CookingProgress {
  const previous = progress.sources[source];
  if (dish.practice || sequence <= (previous?.sequence ?? 0)) return progress;
  const key = recipeKey(dish), {stars} = scoreCooking(dish, portions);
  const result: RecipeProgress = {
    best: {...portions},
    latest: {id: `${source}-${sequence}`, at},
    ...(stars >= 3 ? {firstClear: at} : {}),
    ...(stars === 5 ? {firstPerfect: at} : {}),
  };
  return {
    ...progress,
    dishes: {...progress.dishes, [key]: progress.dishes[key] ? mergeDish(dish, progress.dishes[key], result) : result},
    sources: {...progress.sources, [source]: {sequence, clears: (previous?.clears ?? 0) + (stars >= 3 ? 1 : 0)}},
  };
}

export function skipCookingCooldown(progress: CookingProgress, key: string, attempt: string): CookingProgress {
  const row = progress.dishes[key];
  if (!row || row.latest.id !== attempt || row.latest.skipped) return progress;
  return {...progress, dishes: {...progress.dishes, [key]: {...row, latest: {...row.latest, skipped: true}}}};
}

export function cookingCooldown(progress: CookingProgress, key: string, now = Date.now()): number {
  const latest = progress.dishes[key]?.latest;
  return latest && !latest.skipped ? Math.max(0, latest.at + COOKING_COOLDOWN - now) : 0;
}

export const cookingClearCount = (progress?: CookingProgress): number =>
  Object.values(progress?.sources ?? {}).reduce((sum, source) => sum + source.clears, 0);

export const distinctCookingClears = (progress?: CookingProgress): number =>
  new Set(STORED_RECIPES.filter(dish => progress?.dishes[recipeKey(dish)]?.firstClear).map(dish => dish.id)).size;

export const cookingPerfectCount = (progress?: CookingProgress): number =>
  RECIPES.filter(dish => progress?.dishes[recipeKey(dish)]?.firstPerfect).length;

export function stampCookingRecords(current: CookingProgress | undefined, next: CookingProgress, now: number): void {
  for (const [key, row] of Object.entries(next.dishes)) {
    const previous = current?.dishes[key];
    if (row.firstClear) row.firstClear = previous?.firstClear ?? now;
    if (row.firstPerfect) row.firstPerfect = previous?.firstPerfect ?? now;
  }
}

export function cookingRankTime(progress?: CookingProgress): number {
  if (cookingPerfectCount(progress) !== RECIPES.length) return 0;
  return Math.max(...RECIPES.map(dish => progress!.dishes[recipeKey(dish)].firstPerfect!));
}
