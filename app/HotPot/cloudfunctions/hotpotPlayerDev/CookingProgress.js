"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cookingPerfectCount = exports.distinctCookingClears = exports.cookingClearCount = void 0;
exports.emptyCooking = emptyCooking;
exports.validateCooking = validateCooking;
exports.mergeCooking = mergeCooking;
exports.settleCooking = settleCooking;
exports.skipCookingCooldown = skipCookingCooldown;
exports.cookingCooldown = cookingCooldown;
exports.stampCookingRecords = stampCookingRecords;
exports.cookingRankTime = cookingRankTime;
const GameConfig_1 = require("./GameConfig");
const CookingData_1 = require("./CookingData");
const knownIngredients = new Set(GameConfig_1.INGREDIENTS.map(food => food.id));
const sourcePattern = /^[a-z0-9]{12,36}$/;
const attemptPattern = /^[a-z0-9]{12,36}-[1-9][0-9]{0,7}$/;
const timestamp = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 9000000000000;
const earliest = (a, b) => a && b ? Math.min(a, b) : a || b;
function emptyCooking() {
    return { version: 1, dishes: {}, sources: {} };
}
/** Validate optional data independently so a bad cooking record cannot erase a match save. */
function validateCooking(value) {
    var _a, _b;
    if ((value === null || value === void 0 ? void 0 : value.version) !== 1)
        return undefined;
    const next = emptyCooking();
    for (const [id, source] of Object.entries((_a = value.sources) !== null && _a !== void 0 ? _a : {}).slice(0, 128)) {
        if (sourcePattern.test(id) && Number.isInteger(source === null || source === void 0 ? void 0 : source.sequence) && source.sequence > 0
            && source.sequence <= 99999999 && Number.isInteger(source.clears)
            && source.clears >= 0 && source.clears <= source.sequence) {
            next.sources[id] = { sequence: source.sequence, clears: source.clears };
        }
    }
    for (const dish of CookingData_1.STORED_RECIPES) {
        const key = (0, CookingData_1.recipeKey)(dish);
        const row = (_b = value.dishes) === null || _b === void 0 ? void 0 : _b[key];
        const latest = row === null || row === void 0 ? void 0 : row.latest;
        if (!(row === null || row === void 0 ? void 0 : row.best) || !timestamp(latest === null || latest === void 0 ? void 0 : latest.at) || typeof latest.id !== 'string' || !attemptPattern.test(latest.id))
            continue;
        const best = {};
        let total = 0;
        for (const id of knownIngredients) {
            const count = row.best[id];
            if (typeof count === 'number' && Number.isInteger(count) && count > 0 && count <= 24) {
                best[id] = count;
                total += count;
            }
        }
        if (!total || total > 48)
            continue;
        const { stars } = (0, CookingData_1.scoreCooking)(dish, best);
        next.dishes[key] = {
            best,
            latest: { id: latest.id, at: latest.at, ...(latest.skipped === true ? { skipped: true } : {}) },
            ...(stars >= 3 && timestamp(row.firstClear) ? { firstClear: row.firstClear } : {}),
            ...(stars === 5 && timestamp(row.firstPerfect) ? { firstPerfect: row.firstPerfect } : {}),
        };
    }
    return next;
}
function mergeDish(dish, a, b) {
    const aScore = (0, CookingData_1.scoreCooking)(dish, a.best), bScore = (0, CookingData_1.scoreCooking)(dish, b.best);
    const rank = bScore.stars - aScore.stars || bScore.score - aScore.score;
    const bWinsTie = rank === 0 && JSON.stringify(b.best) > JSON.stringify(a.best);
    const best = rank > 0 || bWinsTie ? b.best : a.best;
    const same = a.latest.id === b.latest.id;
    const newest = b.latest.at > a.latest.at || (b.latest.at === a.latest.at && b.latest.id > a.latest.id) ? b.latest : a.latest;
    const latest = same && (a.latest.skipped || b.latest.skipped) ? { ...newest, skipped: true } : newest;
    const firstClear = earliest(a.firstClear, b.firstClear), firstPerfect = earliest(a.firstPerfect, b.firstPerfect);
    return { best, latest, ...(firstClear ? { firstClear } : {}), ...(firstPerfect ? { firstPerfect } : {}) };
}
function mergeCooking(a, b) {
    var _a, _b, _c, _d;
    if (!a || !b)
        return a || b;
    const result = emptyCooking();
    for (const dish of CookingData_1.STORED_RECIPES) {
        const key = (0, CookingData_1.recipeKey)(dish), left = a.dishes[key], right = b.dishes[key];
        if (left && right)
            result.dishes[key] = mergeDish(dish, left, right);
        else if (left || right)
            result.dishes[key] = left || right;
    }
    const sources = new Set([...Object.keys(a.sources), ...Object.keys(b.sources)]);
    for (const id of Array.from(sources).sort()) {
        const left = a.sources[id], right = b.sources[id];
        result.sources[id] = {
            sequence: Math.max((_a = left === null || left === void 0 ? void 0 : left.sequence) !== null && _a !== void 0 ? _a : 0, (_b = right === null || right === void 0 ? void 0 : right.sequence) !== null && _b !== void 0 ? _b : 0),
            clears: Math.max((_c = left === null || left === void 0 ? void 0 : left.clears) !== null && _c !== void 0 ? _c : 0, (_d = right === null || right === void 0 ? void 0 : right.clears) !== null && _d !== void 0 ? _d : 0),
        };
    }
    return result;
}
function settleCooking(progress, dish, portions, source, sequence, at) {
    var _a, _b;
    const previous = progress.sources[source];
    if (dish.practice || sequence <= ((_a = previous === null || previous === void 0 ? void 0 : previous.sequence) !== null && _a !== void 0 ? _a : 0))
        return progress;
    const key = (0, CookingData_1.recipeKey)(dish), { stars } = (0, CookingData_1.scoreCooking)(dish, portions);
    const result = {
        best: { ...portions },
        latest: { id: `${source}-${sequence}`, at },
        ...(stars >= 3 ? { firstClear: at } : {}),
        ...(stars === 5 ? { firstPerfect: at } : {}),
    };
    return {
        ...progress,
        dishes: { ...progress.dishes, [key]: progress.dishes[key] ? mergeDish(dish, progress.dishes[key], result) : result },
        sources: { ...progress.sources, [source]: { sequence, clears: ((_b = previous === null || previous === void 0 ? void 0 : previous.clears) !== null && _b !== void 0 ? _b : 0) + (stars >= 3 ? 1 : 0) } },
    };
}
function skipCookingCooldown(progress, key, attempt) {
    const row = progress.dishes[key];
    if (!row || row.latest.id !== attempt || row.latest.skipped)
        return progress;
    return { ...progress, dishes: { ...progress.dishes, [key]: { ...row, latest: { ...row.latest, skipped: true } } } };
}
function cookingCooldown(progress, key, now = Date.now()) {
    var _a;
    const latest = (_a = progress.dishes[key]) === null || _a === void 0 ? void 0 : _a.latest;
    return latest && !latest.skipped ? Math.max(0, latest.at + CookingData_1.COOKING_COOLDOWN - now) : 0;
}
const cookingClearCount = (progress) => { var _a; return Object.values((_a = progress === null || progress === void 0 ? void 0 : progress.sources) !== null && _a !== void 0 ? _a : {}).reduce((sum, source) => sum + source.clears, 0); };
exports.cookingClearCount = cookingClearCount;
const distinctCookingClears = (progress) => new Set(CookingData_1.STORED_RECIPES.filter(dish => { var _a; return (_a = progress === null || progress === void 0 ? void 0 : progress.dishes[(0, CookingData_1.recipeKey)(dish)]) === null || _a === void 0 ? void 0 : _a.firstClear; }).map(dish => dish.id)).size;
exports.distinctCookingClears = distinctCookingClears;
const cookingPerfectCount = (progress) => CookingData_1.RECIPES.filter(dish => { var _a; return (_a = progress === null || progress === void 0 ? void 0 : progress.dishes[(0, CookingData_1.recipeKey)(dish)]) === null || _a === void 0 ? void 0 : _a.firstPerfect; }).length;
exports.cookingPerfectCount = cookingPerfectCount;
function stampCookingRecords(current, next, now) {
    var _a, _b;
    for (const [key, row] of Object.entries(next.dishes)) {
        const previous = current === null || current === void 0 ? void 0 : current.dishes[key];
        if (row.firstClear)
            row.firstClear = (_a = previous === null || previous === void 0 ? void 0 : previous.firstClear) !== null && _a !== void 0 ? _a : now;
        if (row.firstPerfect)
            row.firstPerfect = (_b = previous === null || previous === void 0 ? void 0 : previous.firstPerfect) !== null && _b !== void 0 ? _b : now;
    }
}
function cookingRankTime(progress) {
    if ((0, exports.cookingPerfectCount)(progress) !== CookingData_1.RECIPES.length)
        return 0;
    return Math.max(...CookingData_1.RECIPES.map(dish => progress.dishes[(0, CookingData_1.recipeKey)(dish)].firstPerfect));
}
