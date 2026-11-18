interface RecommendationPage {
  load(options: {openlink: string}): Promise<unknown>;
  show(): Promise<unknown>;
  destroy(): void;
}

interface RecommendationHost {
  createPageManager?: () => RecommendationPage;
}

// WeChat's fixed openlink for the official recommendation component.
const RECOMMENDATION_OPENLINK = 'TWFRCqV5WeM2AkMXhKwJ03MhfPOieJfAsvXKUbWvQFQtLyyA5etMPabBehga950uzfZcH3Vi3QeEh41xRGEVFw';

export class WechatGameRecommendationService {
  private request?: {page: RecommendationPage; opening: boolean};

  constructor(private readonly host: RecommendationHost | undefined =
    (globalThis as {wx?: RecommendationHost}).wx) {}

  async open(): Promise<string | undefined> {
    if (typeof this.host?.createPageManager !== 'function') {
      return '请在新版微信小游戏中使用评价与推荐';
    }
    if (this.request?.opening) return;
    this.dispose();
    let request: typeof this.request;
    try {
      request = {page: this.host.createPageManager(), opening: true};
      this.request = request;
      await request.page.load({openlink: RECOMMENDATION_OPENLINK});
      if (this.request !== request) return;
      await request.page.show();
    } catch (error) {
      if (request && this.request !== request) return;
      this.dispose();
      console.warn('[HotPot recommendation] PageManager failed', error);
      const detail = error as {errCode?: number} | undefined;
      if (detail?.errCode === -2) return '请更新微信后使用评价与推荐';
      if (detail?.errCode === -6) return '网络异常，请检查网络后重试';
      return '暂时无法打开评价与推荐，请稍后重试';
    } finally {
      if (request) request.opening = false;
    }
  }

  dispose(): void {
    const request = this.request;
    this.request = undefined;
    try {
      request?.page.destroy();
    } catch (error) {
      console.warn('[HotPot recommendation] PageManager cleanup failed', error);
    }
  }
}
