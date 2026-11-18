import {adsDisabled} from './AdSession';

interface RewardedVideoAd {
  load(): Promise<unknown>;
  show(): Promise<unknown>;
  onClose(listener: (result?: {isEnded: boolean}) => void): void;
  offClose(listener: (result?: {isEnded: boolean}) => void): void;
  onError(listener: (error: unknown) => void): void;
  offError(listener: (error: unknown) => void): void;
  destroy?(): void;
}

interface WechatAdHost {
  createRewardedVideoAd?: (options: {adUnitId: string}) => RewardedVideoAd;
}

type AdResult = 'completed' | 'skipped' | 'cancelled' | 'failed' | 'unsupported' | 'busy';
const REVIVE_AD_UNIT = 'adunit-406d51b037be9f14';
const AD_TIMEOUT_MS = 120_000;

export class WechatRewardedVideoService {
  private ad?: RewardedVideoAd;
  private unit?: string;
  private finish?: (result: AdResult) => void;

  constructor(private readonly host: WechatAdHost | undefined =
    (globalThis as {wx?: WechatAdHost}).wx) {}

  prepare(adUnitId = REVIVE_AD_UNIT): void {
    if (adsDisabled || this.finish || (this.ad && this.unit === adUnitId)) return;
    if (this.ad) this.dispose();
    try {
      this.ad = this.host?.createRewardedVideoAd?.({adUnitId});
      if (this.ad) this.unit = adUnitId;
    } catch (error) {
      console.warn('[HotPot rewarded ad] Initialization failed', error);
    }
  }

  async show(adUnitId = REVIVE_AD_UNIT): Promise<AdResult> {
    if (adsDisabled) return 'skipped';
    if (this.finish) return 'busy';
    if (!this.host?.createRewardedVideoAd) return 'unsupported';
    this.prepare(adUnitId);
    const ad = this.ad;
    if (!ad) return 'failed';
    return new Promise<AdResult>(resolve => {
      let showing = false;
      const onError = (error: unknown) => {
        console.warn('[HotPot rewarded ad] Platform error', error);
        if (showing) finish('failed');
      };
      const onClose = (result?: {isEnded: boolean}) => {
        finish(result?.isEnded === true ? 'completed' : 'cancelled');
      };
      const finish = (result: AdResult) => {
        if (this.finish !== finish) return;
        this.finish = undefined;
        clearTimeout(timeout);
        try { ad.offClose(onClose); } catch (error) {
          console.warn('[HotPot rewarded ad] Listener cleanup failed', error);
        }
        try { ad.offError(onError); } catch (error) {
          console.warn('[HotPot rewarded ad] Error listener cleanup failed', error);
        }
        resolve(result);
      };
      const timeout = setTimeout(() => {
        finish('failed');
        this.dispose();
      }, AD_TIMEOUT_MS);
      this.finish = finish;
      const show = async () => {
        try {
          ad.onClose(onClose);
          ad.onError(onError);
          try {
            await ad.show();
          } catch {
            if (this.finish !== finish) return;
            await ad.load();
            if (this.finish === finish) await ad.show();
          }
          showing = this.finish === finish;
        } catch (error) {
          if (this.finish !== finish) return;
          console.warn('[HotPot rewarded ad] Display failed', error);
          finish('failed');
        }
      };
      void show();
    });
  }

  cancel(): void {
    if (this.finish) this.dispose();
  }

  dispose(): void {
    this.finish?.('cancelled');
    const ad = this.ad;
    this.ad = undefined;
    this.unit = undefined;
    try { ad?.destroy?.(); } catch (error) {
      console.warn('[HotPot rewarded ad] Cleanup failed', error);
    }
  }
}
