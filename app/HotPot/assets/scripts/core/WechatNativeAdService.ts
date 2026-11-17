import {adsDisabled} from './AdSession';

export interface NativeAdBounds {
  left: number;
  top: number;
  width: number;
}

interface NativeAdSize {
  width: number;
  height: number;
}

interface NativeAd {
  style: Pick<NativeAdBounds, 'left' | 'top'>;
  show(): Promise<unknown>;
  hide(): Promise<unknown>;
  destroy(): void;
  onError(listener: (error: unknown) => void): void;
  onClose(listener: () => void): void;
  onResize?(listener: (size: NativeAdSize) => void): void;
}

interface NativeAdHost {
  createCustomAd?: (options: {
    adUnitId: string;
    style: NativeAdBounds;
  }) => NativeAd;
  getWindowInfo?: () => {windowWidth: number; windowHeight: number};
  getSystemInfoSync?: () => {windowWidth: number; windowHeight: number};
}

type AdChange = 'resize' | 'closed' | 'failed';
const SHARED_AD_UNIT = 'adunit-253cf09b57a1e3d9';
const AD_UNITS = {
  settings: SHARED_AD_UNIT,
  ranking: SHARED_AD_UNIT,
  collection: 'adunit-c71919c100419c22',
  achievements: 'adunit-ed625cbfe9bd497b',
} as const;
export type NativeAdPlacement = keyof typeof AD_UNITS;

/** Preloads the template and owns at most one native view at a time. */
export class WechatNativeAdService {
  private ad?: NativeAd;
  private changed?: (reason: AdChange) => void;
  private measured?: NativeAdSize;
  private adUnitId?: string;
  private requestedWidth = 350;

  constructor(private readonly host: NativeAdHost | undefined =
    (globalThis as {wx?: NativeAdHost}).wx) {}

  get supported(): boolean {
    return !adsDisabled && typeof this.host?.createCustomAd === 'function';
  }

  windowSize(fallback: NativeAdSize): NativeAdSize {
    try {
      const info = this.host?.getWindowInfo?.()
        || this.host?.getSystemInfoSync?.();
      if (info?.windowWidth > 0 && info.windowHeight > 0) {
        return {width: info.windowWidth, height: info.windowHeight};
      }
    } catch {
      // The engine frame remains usable on older clients.
    }
    return fallback;
  }

  size(width: number, placement: NativeAdPlacement): NativeAdSize {
    if (this.measured && this.requestedWidth === width && this.adUnitId === AD_UNITS[placement]) {
      return this.measured;
    }
    // The configured template is a 20:7 horizontal card.
    return {width, height: width * 7 / 20};
  }

  prepare(width: number, placement: NativeAdPlacement): boolean {
    if (!this.supported || !(width > 0)) {
      return false;
    }
    const adUnitId = AD_UNITS[placement];
    if (this.ad && this.requestedWidth === width && this.adUnitId === adUnitId) {
      return true;
    }
    this.dispose();
    this.requestedWidth = width;
    try {
      const ad = this.host!.createCustomAd!({
        adUnitId,
        style: {left: 0, top: 0, width},
      });
      this.ad = ad;
      this.adUnitId = adUnitId;
      ad.onError(error => this.fail(ad, error));
      ad.onClose(() => {
        if (this.ad === ad) {
          const changed = this.changed;
          this.dispose();
          changed?.('closed');
        }
      });
      ad.onResize?.(size => {
        if (this.ad !== ad || !Number.isFinite(size.width)
          || !Number.isFinite(size.height)
          || size.width <= 0 || size.height <= 0) {
          return;
        }
        const previous = this.size(this.requestedWidth, placement);
        this.measured = {width: size.width, height: size.height};
        if (Math.abs(previous.width - size.width) > 0.5
          || Math.abs(previous.height - size.height) > 0.5) {
          this.changed?.('resize');
        }
      });
      return this.ad === ad;
    } catch (error) {
      console.warn('[HotPot native ad] Initialization failed', error);
      this.dispose();
      return false;
    }
  }

  show(bounds: NativeAdBounds, placement: NativeAdPlacement, changed: (reason: AdChange) => void): void {
    const alreadyShowing = this.changed && this.requestedWidth === bounds.width && this.adUnitId === AD_UNITS[placement];
    if (!this.prepare(bounds.width, placement)) {
      changed('failed');
      return;
    }
    this.changed = changed;
    const ad = this.ad!;
    if (!this.move(ad, bounds) || alreadyShowing) {
      return;
    }
    void Promise.resolve().then(() => {
      if (this.ad === ad) {
        return ad.show();
      }
    }).then(() => {
      // A completed show may arrive after the player has left the page.
      if (this.ad !== ad) {
        return this.hideDiscardedAd(ad);
      }
    }).catch(error => this.fail(ad, error));
  }

  position(bounds: NativeAdBounds, placement: NativeAdPlacement): void {
    const ad = this.ad;
    const changed = this.changed;
    if (!ad || !changed) {
      return;
    }
    if (bounds.width !== this.requestedWidth || this.adUnitId !== AD_UNITS[placement]) {
      // Width is part of createCustomAd. The runtime style exposes position.
      this.show(bounds, placement, changed);
    } else {
      this.move(ad, bounds);
    }
  }

  private move(ad: NativeAd, bounds: NativeAdBounds): boolean {
    try {
      ad.style.left = bounds.left;
      ad.style.top = bounds.top;
      return true;
    } catch (error) {
      this.fail(ad, error);
      return false;
    }
  }

  private async hideDiscardedAd(ad: NativeAd): Promise<void> {
    try {
      await ad.hide();
    } catch {
      // A destroyed instance may reject hide().
    }
  }

  private fail(ad: NativeAd, error: unknown): void {
    if (this.ad !== ad) {
      return;
    }
    console.warn('[HotPot native ad] Platform error', error);
    const changed = this.changed;
    this.dispose();
    changed?.('failed');
  }

  dispose(): void {
    const ad = this.ad;
    this.ad = undefined;
    this.adUnitId = undefined;
    this.changed = undefined;
    this.measured = undefined;
    try {
      ad?.destroy();
    } catch (error) {
      console.warn('[HotPot native ad] Cleanup failed', error);
      if (ad) {
        void this.hideDiscardedAd(ad);
      }
    }
  }
}
