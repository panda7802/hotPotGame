interface ShareMessage {
  title: string;
  query: string;
  imageUrl?: string;
}

const SHARE_CARD_IMAGE = 'share-card.jpg';

interface WechatShareHost {
  shareAppMessage?: (message: ShareMessage) => void;
  onShareAppMessage?: (listener: () => ShareMessage) => void;
  offShareAppMessage?: (listener: () => ShareMessage) => void;
  onShareTimeline?: (listener: () => ShareMessage) => void;
  offShareTimeline?: (listener: () => ShareMessage) => void;
  getLaunchOptionsSync?: () => {query?: Record<string, string>};
  onShow?: (listener: (options: {query?: Record<string, string>}) => void) => void;
  offShow?: (listener: (options: {query?: Record<string, string>}) => void) => void;
  showShareMenu?: (options: {
    menus: string[];
    fail: () => void;
  }) => void;
}

export type ShareResult = 'opened' | 'unsupported' | 'failed';

/** WeChat owns the picker; opening it does not confirm a completed share. */
export class WechatShareService {
  private listening = false;
  private timelineListening = false;
  private recipeListener?: (options: {query?: Record<string, string>}) => void;
  private readonly menuMessage = (): ShareMessage => this.message('menu');
  private readonly timelineMessage = (): ShareMessage => this.message('timeline');

  constructor(
    private readonly host: WechatShareHost | undefined =
      (globalThis as {wx?: WechatShareHost}).wx,
  ) {}

  private message(
    source: 'menu' | 'button' | 'timeline',
    title = '锅里捞啥｜一起来捞一锅，看看谁能通关！',
  ): ShareMessage {
    return {
      title,
      query: 'source=share&entry=' + source,
      ...(source === 'timeline' ? {} : {imageUrl: SHARE_CARD_IMAGE}),
    };
  }

  start(): void {
    if (!this.host || this.listening || this.timelineListening) {
      return;
    }
    try {
      if (this.host.onShareAppMessage) {
        this.host.onShareAppMessage(this.menuMessage);
        this.listening = true;
      }
      if (this.host.onShareTimeline) {
        this.host.onShareTimeline(this.timelineMessage);
        this.timelineListening = true;
      }
      this.host.showShareMenu?.({
        menus: this.timelineListening ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'],
        fail: () => this.host?.showShareMenu?.({menus: ['shareAppMessage'],
          fail: () => console.warn('[HotPot share] Menu unavailable')}),
      });
    } catch {
      console.warn('[HotPot share] Menu unavailable');
    }
  }

  share(title?: string, recipe?: string): ShareResult {
    if (!this.host?.shareAppMessage) {
      return 'unsupported';
    }
    try {
      const message = this.message('button', title);
      if (recipe) message.query += '&recipe=' + encodeURIComponent(recipe);
      this.host.shareAppMessage(message);
      return 'opened';
    } catch {
      return 'failed';
    }
  }

  listenForRecipes(receive: (key: string) => void): void {
    if (!this.host || this.recipeListener) return;
    this.recipeListener = ({query}) => {
      if (typeof query?.recipe === 'string' && /^[a-z-]{1,40}(@|%40)[1-9][0-9]*$/.test(query.recipe)) {
        receive(query.recipe.replace('%40', '@'));
      }
    };
    try {
      this.host.onShow?.(this.recipeListener);
      const launch = this.host.getLaunchOptionsSync?.();
      if (launch) this.recipeListener(launch);
    } catch {
      console.warn('[HotPot share] Recipe links unavailable');
    }
  }

  dispose(): void {
    try {
      if (this.recipeListener) this.host?.offShow?.(this.recipeListener);
    } catch {
      console.warn('[HotPot share] Recipe link cleanup unavailable');
    }
    this.recipeListener = undefined;
    if (!this.listening && !this.timelineListening) {
      return;
    }
    try {
      if (this.listening) this.host?.offShareAppMessage?.(this.menuMessage);
    } catch {
      console.warn('[HotPot share] Listener cleanup unavailable');
    }
    this.listening = false;
    try {
      if (this.timelineListening) this.host?.offShareTimeline?.(this.timelineMessage);
    } catch {
      console.warn('[HotPot share] Timeline listener cleanup unavailable');
    }
    this.timelineListening = false;
  }
}
