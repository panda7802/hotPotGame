"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RUNTIME_CONFIG = void 0;
exports.normalizeRuntimeConfig = normalizeRuntimeConfig;
exports.DEFAULT_RUNTIME_CONFIG = {
    collectionHeadingTaps: 6,
    collectionIngredientTaps: 3,
};
function normalizeRuntimeConfig(value) {
    const count = (key) => Number.isSafeInteger(value === null || value === void 0 ? void 0 : value[key]) && value[key] >= 1 && value[key] <= 99
        ? value[key] : exports.DEFAULT_RUNTIME_CONFIG[key];
    return {
        collectionHeadingTaps: count('collectionHeadingTaps'),
        collectionIngredientTaps: count('collectionIngredientTaps'),
    };
}
