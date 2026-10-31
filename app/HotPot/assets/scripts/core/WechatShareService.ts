interface ShareMessage {
  title: string;
  query: string;
}

interface WechatShareHost {
  shareAppMessage?: (message: ShareMessage) => void;
  onShareAppMessage?: (listener: () => ShareMessage) => void;
  offShareAppMessage?: (listener: () => ShareMessage) => void;
  onShareTimeline?: (listener: () => ShareMessage) => void;
  offShareTimeline?: (listener: () => ShareMessage) => void;
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
  private readonly menuMessage = (): ShareMessage => this.message('menu');
  private readonly timelineMessage = (): ShareMessage => this.message('timeline');

  constructor(
    private readonly host: WechatShareHost | undefined =
      (globalThis as {wx?: WechatShareHost}).wx,
  ) {}

  private message(source: 'menu' | 'button' | 'timeline'): ShareMessage {
    return {
      title: '锅里捞啥｜一起来捞一锅，看看谁能通关！',
      query: 'source=share&entry=' + source,
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

  share(): ShareResult {
    if (!this.host?.shareAppMessage) {
      return 'unsupported';
    }
    try {
      this.host.shareAppMessage(this.message('button'));
      return 'opened';
    } catch {
      return 'failed';
    }
  }

  dispose(): void {
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
