interface PageManager {
  load(options: {openlink: string}): Promise<unknown>;
  show(): Promise<unknown>;
  destroy(): void;
}

interface GameClubHost {
  createPageManager?: () => PageManager | undefined;
}

export interface GameClubResult {
  status: 'opened' | 'unsupported' | 'unconfigured' | 'busy' | 'cancelled' | 'failed';
  message?: string;
  code?: number;
}

export interface GameClubDiagnostic {
  code?: number;
  errMsg: string;
  errInfo: unknown;
}

const ERROR_HINTS: Record<number, string> = {
  [-1]: '游戏圈链接无效，请联系开发者检查配置',
  [-2]: '当前微信版本暂不支持，请更新微信后重试',
  [-3]: '当前设备暂不支持打开游戏圈',
  [-4]: '游戏圈服务暂不可用，请稍后重试',
  [-5]: '游戏圈打开失败，请稍后重试',
  [-6]: '网络异常，请检查网络后重试',
  [-7]: '操作太频繁，请稍后重试',
  [-8]: '游戏圈链接与当前游戏版本不匹配，请联系开发者',
};

/** Loads the MP-issued openlink before showing the official community page. */
export class WechatGameClubService {
  private manager: PageManager | undefined;
  private pending = false;
  lastError: GameClubDiagnostic | null = null;

  constructor(private readonly host: GameClubHost | undefined =
    (globalThis as {wx?: GameClubHost}).wx) {}

  async open(value: unknown): Promise<GameClubResult> {
    if (!this.host?.createPageManager) return {status: 'unsupported'};
    const openlink = typeof value === 'string' ? value.trim() : '';
    if (!openlink) return {status: 'unconfigured'};
    if (this.pending) return {status: 'busy'};
    this.dispose();
    this.pending = true;
    this.lastError = null;
    let current: PageManager | undefined;
    try {
      current = this.host.createPageManager();
      if (!current) throw new Error('createPageManager returned no instance');
      this.manager = current;
      await current.load({openlink});
      if (this.manager !== current) return {status: 'cancelled'};
      await current.show();
      if (this.manager !== current) return {status: 'cancelled'};
      return {status: 'opened'};
    } catch (error) {
      if (current && this.manager !== current) return {status: 'cancelled'};
      const detail = error as {errCode?: unknown; code?: unknown;
        errMsg?: unknown; message?: unknown; errInfo?: unknown} | null;
      const value = detail?.errCode ?? detail?.code;
      const code = typeof value === 'number' ? value : undefined;
      this.lastError = {code,
        errMsg: String(detail?.errMsg ?? detail?.message ?? error),
        errInfo: detail?.errInfo};
      console.warn('[HotPot game club] PageManager failed', this.lastError);
      this.dispose();
      return {status: 'failed', code,
        message: (code !== undefined && ERROR_HINTS[code])
          || '游戏圈暂不可用，请稍后重试'};
    } finally {
      if (!current || this.manager === current) this.pending = false;
    }
  }

  /** Invalidates in-flight loads so a closed menu cannot open a late page. */
  dispose(): void {
    const previous = this.manager;
    this.manager = undefined;
    this.pending = false;
    try { previous?.destroy(); } catch {
      console.warn('[HotPot game club] PageManager cleanup unavailable');
    }
  }
}
