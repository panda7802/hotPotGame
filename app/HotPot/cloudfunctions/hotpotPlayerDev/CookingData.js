"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookingRound = exports.cookingFallTime = exports.COOKING_MOVE_TIME = exports.COOKING_CATALOG = exports.STORED_RECIPES = exports.findRecipe = exports.recipeKey = exports.RECIPES = exports.COOKING_COOLDOWN = exports.COOKING_UNLOCK = void 0;
exports.practiceRecipe = practiceRecipe;
exports.recipeBatches = recipeBatches;
exports.recipeMax = recipeMax;
exports.scoreCooking = scoreCooking;
exports.cookingDrops = cookingDrops;
const GameConfig_1 = require("./GameConfig");
exports.COOKING_UNLOCK = 10;
exports.COOKING_COOLDOWN = 10 * 60000;
const recipe = (id, name, difficulty, ingredients, advanced = false) => ({ id, version: 1, name, difficulty, ingredients, advanced });
exports.RECIPES = [
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
const recipeKey = (dish) => `${dish.id}@${dish.version}`;
exports.recipeKey = recipeKey;
const findRecipe = (key) => exports.RECIPES.find(dish => (0, exports.recipeKey)(dish) === key);
exports.findRecipe = findRecipe;
// Keep retired definitions here so versioned results can still be scored.
const RECIPE_HISTORY = [];
exports.STORED_RECIPES = [...RECIPE_HISTORY, ...exports.RECIPES];
exports.COOKING_CATALOG = exports.RECIPES.map(exports.recipeKey).join(',');
function practiceRecipe(discovered) {
    return { ...recipe('practice', '小馆双拼', 1, discovered.slice(0, 2).map(id => [id, 2])), practice: true };
}
function recipeBatches(dish) {
    const { ingredients } = dish;
    if (ingredients.length <= 3)
        return [ingredients];
    const first = ingredients.length === 4 ? 2 : 3;
    return [ingredients.slice(0, first), ingredients.slice(first)];
}
function recipeMax(dish) {
    return [100, 140, 180][dish.difficulty - 1] + 15 * GameConfig_1.HIDDEN_INGREDIENTS.filter(food => dish.ingredients.some(([id]) => id === food.id)).length;
}
function scoreCooking(dish, portions) {
    const differences = dish.ingredients.map(([id, target]) => {
        var _a;
        return ({
            id, target, actual: (_a = portions[id]) !== null && _a !== void 0 ? _a : 0,
        });
    });
    const extras = Object.keys(portions)
        .filter(id => !dish.ingredients.some(([ingredient]) => ingredient === id))
        .map(id => { var _a; return ({ id, target: 0, actual: (_a = portions[id]) !== null && _a !== void 0 ? _a : 0 }); });
    const rows = [...differences, ...extras];
    const target = differences.reduce((sum, row) => sum + row.target, 0);
    const missing = rows.reduce((sum, row) => sum + Math.max(0, row.target - row.actual), 0);
    const excess = rows.reduce((sum, row) => sum + Math.max(0, row.actual - row.target), 0);
    const correct = Math.max(0, target - Math.max(missing, excess));
    const percent = correct * 100;
    const stars = correct === 0 ? 0 : correct === target ? 5 : percent >= 85 * target ? 4
        : percent >= 70 * target ? 3 : percent >= 55 * target ? 2 : 1;
    return { stars, score: target ? Math.round(correct * recipeMax(dish) / target) : 0, rows };
}
exports.COOKING_MOVE_TIME = 0.13;
const cookingFallTime = (dish) => dish.practice ? 2.8 : 2.5 - 0.3 * dish.difficulty;
exports.cookingFallTime = cookingFallTime;
/** A single catch window at a time leaves all three other lanes available. */
function cookingDrops(dish, batch, discovered, duration, random = Math.random) {
    const supply = batch.flatMap(([id, count]) => Array(count + 1 + Math.floor(random() * 2)).fill(id));
    const distractors = discovered.filter(id => !dish.ingredients.some(([ingredient]) => ingredient === id));
    for (let i = 0; i < Math.min(distractors.length, dish.practice ? 1 : dish.difficulty + 1); i++) {
        supply.push(distractors[Math.floor(random() * distractors.length)]);
    }
    for (let i = supply.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [supply[i], supply[j]] = [supply[j], supply[i]];
    }
    const first = (0, exports.cookingFallTime)(dish) + 0.35;
    const interval = Math.max(0.72, (duration - first) / Math.max(1, supply.length - 1));
    return supply.map((id, index) => ({ id, lane: Math.floor(random() * 4), arrival: first + index * interval }));
}
class CookingRound {
    constructor(dish, waves) {
        this.dish = dish;
        this.waves = waves;
        this.portions = {};
        this.caught = new Set();
        this.batchIndex = 0;
        this.elapsed = 0;
        this.lane = 1;
        this.fromLane = 1;
        this.moveStarted = -exports.COOKING_MOVE_TIME;
        this.arrived = 0;
        this.batches = recipeBatches(dish);
    }
    get batch() { return this.batches[this.batchIndex]; }
    get drops() { return this.waves[this.batchIndex]; }
    get lastBatch() { return this.batchIndex === this.batches.length - 1; }
    get exact() { return this.batch.every(([id, count]) => this.portions[id] === count); }
    get finished() { return this.arrived === this.drops.length; }
    get hasFood() { return Object.keys(this.portions).length > 0; }
    get plateLane() {
        const fraction = Math.min(1, (this.elapsed - this.moveStarted) / exports.COOKING_MOVE_TIME);
        return this.fromLane + (this.lane - this.fromLane) * fraction;
    }
    move(direction) {
        if (this.elapsed < this.moveStarted + exports.COOKING_MOVE_TIME)
            return false;
        return this.moveTo(this.lane + direction);
    }
    moveTo(target) {
        if (!Number.isInteger(target) || target < 0 || target > 3 || target === this.lane)
            return false;
        this.fromLane = this.plateLane;
        this.lane = target;
        this.moveStarted = this.elapsed;
        return true;
    }
    advance(delta) {
        var _a;
        this.elapsed += delta;
        while (this.arrived < this.drops.length && this.drops[this.arrived].arrival <= this.elapsed) {
            const drop = this.drops[this.arrived];
            const { id, lane, arrival } = drop;
            const canCatch = lane === this.lane && this.moveStarted + exports.COOKING_MOVE_TIME <= arrival;
            this.arrived++;
            if (canCatch) {
                this.portions[id] = ((_a = this.portions[id]) !== null && _a !== void 0 ? _a : 0) + 1;
                this.caught.add(drop);
            }
        }
    }
    nextBatch() {
        if (this.lastBatch || !(this.finished || this.exact))
            return false;
        this.batchIndex++;
        this.arrived = 0;
        this.elapsed = 0;
        this.fromLane = this.lane;
        this.moveStarted = -exports.COOKING_MOVE_TIME;
        return true;
    }
}
exports.CookingRound = CookingRound;
