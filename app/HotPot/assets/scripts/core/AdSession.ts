// The module lives for the lifetime of the app, across scene and level changes.
export let adsDisabled = false;

export function disableAdsForSession(): void {
  adsDisabled = true;
}
