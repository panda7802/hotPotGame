import {HIDDEN_INGREDIENTS, IngredientType} from './GameConfig';

export const COOKING_UNLOCK = 10;
export const COOKING_COOLDOWN = 10 * 60_000;
export type Portions = Partial<Record<IngredientType, number>>;
export type RecipeIngredient = readonly [IngredientType, number];

export interface Recipe {
  id: string;
  version: number;
  name: string;
  difficulty: 1 | 2 | 3;
  ingredients: readonly RecipeIngredient[];
  advanced?: boolean;
  practice?: boolean;
}

const recipe = (id: string, name: string, difficulty: Recipe['difficulty'],
  ingredients: readonly RecipeIngredient[], advanced = false): Recipe =>
  ({id, version: 1, name, difficulty, ingredients, advanced});

export const RECIPES: readonly Recipe[] = [
  recipe('tomato-tofu', '番茄豆腐汤', 1, [['tomato', 3], ['toufu', 3]]),
  recipe('shrimp-corn', '鲜虾玉米煲', 1, [['shrimp', 4], ['corn', 3]]),
  recipe('beef-mushroom', '牛肉菌菇煲', 1, [['beef', 5], ['jzg', 3]]),
  recipe('radish-beef', '萝卜牛肉汤', 1, [['beef', 4], ['radish', 3]]),
  recipe('meatball-lotus', '肉丸莲藕煲', 1, [['meetball', 4], ['ou', 3], ['vegetable', 2]]),
  recipe('pumpkin-tofu', '南瓜豆腐汤', 1, [['pumpkin', 4], ['toufu', 3], ['corn', 2]]),
  recipe('yam-chicken', '山药乌鸡煲', 2, [['blackchicken', 4], ['yam', 3], ['egg', 2], ['vegetable', 2]], true),
  recipe('mushroom-noodle', '菌菇宽粉锅', 2, [['oystermushroom', 3], ['kingoyster', 3], ['jzg', 2], ['noodle', 6]], true),
  recipe('red-tripe', '红汤毛肚锅', 2, [['tripe', 4], ['duckblood', 3], ['noodle', 3], ['tofuskin', 2], ['celtuce', 2]], true),
  recipe('matsutake-bamboo', '松茸竹笋汤', 2, [['matsutake', 2], ['bambooshoot', 3], ['fish', 3]], true),
  recipe('truffle-mushroom', '黑松露双菇煲', 3, [['blacktruffle', 2], ['morel', 2], ['kingoyster', 3], ['toufu', 3]], true),
  recipe('mixed-seafood', '海味什锦煲', 3, [['kingcrab', 2], ['shrimp', 4], ['fish', 4], ['scallop', 3], ['toufu', 3], ['vegetable', 2]], true),
  recipe('abalone-fishmaw', '鲍参花胶煲', 3, [['abalone', 3], ['seacucumber', 2], ['fishmaw', 2], ['scallop', 3], ['yam', 3], ['egg', 2]], true),
];

export const recipeKey = (dish: Recipe): string => `${dish.id}@${dish.version}`;
export const findRecipe = (key: string): Recipe | undefined =>
  RECIPES.find(dish => recipeKey(dish) === key);
// Keep retired definitions here so versioned results can still be scored.
const RECIPE_HISTORY: readonly Recipe[] = [];
export const STORED_RECIPES = [...RECIPE_HISTORY, ...RECIPES];
export const COOKING_CATALOG = RECIPES.map(recipeKey).join(',');

export function practiceRecipe(discovered: readonly IngredientType[]): Recipe {
  return {...recipe('practice', '小馆双拼', 1,
    discovered.slice(0, 2).map(id => [id, 2])), practice: true};
}

export function recipeBatches(dish: Recipe): readonly (readonly RecipeIngredient[])[] {
  const {ingredients} = dish;
  if (ingredients.length <= 3) return [ingredients];
  const first = ingredients.length === 4 ? 2 : 3;
  return [ingredients.slice(0, first), ingredients.slice(first)];
}

export function recipeMax(dish: Recipe): number {
  return [100, 140, 180][dish.difficulty - 1] + 15 * HIDDEN_INGREDIENTS.filter(
    food => dish.ingredients.some(([id]) => id === food.id),
  ).length;
}

export function scoreCooking(dish: Recipe, portions: Portions) {
  const differences = dish.ingredients.map(([id, target]) => ({
    id, target, actual: portions[id] ?? 0,
  }));
  const extras = (Object.keys(portions) as IngredientType[])
    .filter(id => !dish.ingredients.some(([ingredient]) => ingredient === id))
    .map(id => ({id, target: 0, actual: portions[id] ?? 0}));
  const rows = [...differences, ...extras];
  const target = differences.reduce((sum, row) => sum + row.target, 0);
  const missing = rows.reduce((sum, row) => sum + Math.max(0, row.target - row.actual), 0);
  const excess = rows.reduce((sum, row) => sum + Math.max(0, row.actual - row.target), 0);
  const correct = Math.max(0, target - Math.max(missing, excess));
  const percent = correct * 100;
  const stars = correct === 0 ? 0 : correct === target ? 5 : percent >= 85 * target ? 4
    : percent >= 70 * target ? 3 : percent >= 55 * target ? 2 : 1;
  return {stars, score: target ? Math.round(correct * recipeMax(dish) / target) : 0, rows};
}

export interface CookingDrop {
  id: IngredientType;
  lane: number;
  arrival: number;
}

export const COOKING_MOVE_TIME = 0.13;
export const cookingFallTime = (dish: Recipe): number => dish.practice ? 2.8 : 2.5 - 0.3 * dish.difficulty;

/** A single catch window at a time leaves all three other lanes available. */
export function cookingDrops(dish: Recipe, batch: readonly RecipeIngredient[],
  discovered: readonly IngredientType[], duration: number, random = Math.random): CookingDrop[] {
  const supply = batch.flatMap(([id, count]) => Array<IngredientType>(count + 1 + Math.floor(random() * 2)).fill(id));
  const distractors = discovered.filter(id => !dish.ingredients.some(([ingredient]) => ingredient === id));
  for (let i = 0; i < Math.min(distractors.length, dish.practice ? 1 : dish.difficulty + 1); i++) {
    supply.push(distractors[Math.floor(random() * distractors.length)]);
  }
  for (let i = supply.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [supply[i], supply[j]] = [supply[j], supply[i]];
  }
  const first = cookingFallTime(dish) + 0.35;
  const interval = Math.max(0.72, (duration - first) / Math.max(1, supply.length - 1));
  return supply.map((id, index) => ({id, lane: Math.floor(random() * 4), arrival: first + index * interval}));
}

export class CookingRound {
  readonly batches: ReturnType<typeof recipeBatches>;
  readonly portions: Portions = {};
  readonly caught = new Set<CookingDrop>();
  batchIndex = 0;
  elapsed = 0;
  lane = 1;
  fromLane = 1;
  moveStarted = -COOKING_MOVE_TIME;
  arrived = 0;

  constructor(readonly dish: Recipe, readonly waves: CookingDrop[][]) {
    this.batches = recipeBatches(dish);
  }

  get batch() { return this.batches[this.batchIndex]; }
  get drops() { return this.waves[this.batchIndex]; }
  get lastBatch() { return this.batchIndex === this.batches.length - 1; }
  get exact() { return this.batch.every(([id, count]) => this.portions[id] === count); }
  get finished() { return this.arrived === this.drops.length; }
  get hasFood() { return Object.keys(this.portions).length > 0; }
  get plateLane() {
    const fraction = Math.min(1, (this.elapsed - this.moveStarted) / COOKING_MOVE_TIME);
    return this.fromLane + (this.lane - this.fromLane) * fraction;
  }

  move(direction: -1 | 1): boolean {
    return this.moveTo(this.lane + direction);
  }

  moveTo(target: number): boolean {
    if (!Number.isInteger(target) || target < 0 || target > 3 || target === this.lane
      || this.elapsed < this.moveStarted + COOKING_MOVE_TIME) return false;
    this.fromLane = this.lane;
    this.lane = target;
    this.moveStarted = this.elapsed;
    return true;
  }

  advance(delta: number): void {
    this.elapsed += delta;
    while (this.arrived < this.drops.length && this.drops[this.arrived].arrival <= this.elapsed) {
      const drop = this.drops[this.arrived++];
      const {id, lane, arrival} = drop;
      if (lane === this.lane && arrival >= this.moveStarted + COOKING_MOVE_TIME) {
        this.portions[id] = (this.portions[id] ?? 0) + 1;
        this.caught.add(drop);
      }
    }
  }

  nextBatch(): boolean {
    if (this.lastBatch || !(this.finished || this.exact)) return false;
    this.batchIndex++;
    this.arrived = 0;
    this.elapsed = 0;
    this.fromLane = this.lane;
    this.moveStarted = -COOKING_MOVE_TIME;
    return true;
  }
}
