/** Read-only operational settings delivered by the player cloud function. */
export interface RuntimeConfig {
  collectionHeadingTaps: number;
  collectionIngredientTaps: number;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  collectionHeadingTaps: 6,
  collectionIngredientTaps: 3,
};

export function normalizeRuntimeConfig(value: any): RuntimeConfig {
  const count = (key: keyof RuntimeConfig): number =>
    Number.isSafeInteger(value?.[key]) && value[key] >= 1 && value[key] <= 99
      ? value[key] : DEFAULT_RUNTIME_CONFIG[key];
  return {
    collectionHeadingTaps: count('collectionHeadingTaps'),
    collectionIngredientTaps: count('collectionIngredientTaps'),
  };
}
