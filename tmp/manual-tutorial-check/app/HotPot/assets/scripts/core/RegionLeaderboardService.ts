import {GameSave, RegionNode, clone} from '../data/PlayerData';
import {PlayerServiceBase} from './PlayerServiceBase';

interface PendingWin {
  save: GameSave;
  regionCodes: string[];
  playDate: string;
}

/** 云榜缓存和离线通关队列独立于存档冲突选择。 */
export abstract class RegionLeaderboardService extends PlayerServiceBase {
  regionWins: Record<string, number> = {};
  leaderboardText = '尚未获取云端排行榜';
  private leaderboardRequest: Promise<void> | null = null;
  private winRequest: Promise<void> | null = null;

  /** 玩家主动同步时，将未登录期间的本机通关归到已确认的当前账号。 */
  claimGuestWins(): void {
    if (!this.playerId) {
      return;
    }
    const guestKey = `${this.key(null)}:pending-region-wins`;
    try {
      const guest = JSON.parse(this.storage.getItem(guestKey) || '[]');
      if (!Array.isArray(guest) || !guest.length) {
        return;
      }
      // 先写账号队列，后清访客队列；中途失败也不会丢记录，云端负责去重。
      this.storage.setItem(this.winKey(),
        JSON.stringify([...this.pendingWins(), ...guest]));
      this.storage.setItem(guestKey, '[]');
      this.schedule();
    } catch {
      this.leaderboardText = '本机通关待同步，请重试';
    }
  }

  regionCount(code: string): number {
    return this.regionWins[code] || 0;
  }

  sortedRegions(regions: RegionNode[]): RegionNode[] {
    return regions.map((region, index) => ({region, index}))
      .sort((a, b) => this.regionCount(b.region.code)
        - this.regionCount(a.region.code) || a.index - b.index)
      .map((item) => item.region);
  }

  setSave(save: GameSave): void {
    const previous = this.local.state.save;
    super.setSave(save);
    if (save.levelIndex !== 2 || save.status !== 'won'
      || previous?.status === 'won'
      || !this.local.state.profile.regionCodes.length) {
      return;
    }
    const pending = this.pendingWins();
    pending.push({
      save: clone(this.local.state.save!),
      regionCodes: this.local.state.profile.regionCodes.slice(),
      playDate: this.local.state.playDate,
    });
    this.writePendingWins(pending);
    this.schedule();
  }

  /** 失败保留队列；服务器按玩家和牌局去重。 */
  protected flushRegionWins(): Promise<void> {
    if (!this.winRequest) {
      this.winRequest = this.sendRegionWins().finally(() => {
        this.winRequest = null;
      });
    }
    return this.winRequest;
  }

  private async sendRegionWins(): Promise<void> {
    const owner = this.playerId;
    const pending = this.pendingWins();
    while (pending.length && this.cloud && owner === this.playerId) {
      try {
        await this.request({action: 'regionWin', win: pending[0]});
        pending.shift();
        // 合并请求期间产生的新通关，避免被旧队列覆盖。
        const current = this.pendingWins();
        current.shift();
        this.writePendingWins(current);
      } catch (error) {
        this.leaderboardText = this.rankingFailure(error);
        return;
      }
    }
  }

  refreshLeaderboard(): Promise<void> {
    if (this.leaderboardRequest) {
      return this.leaderboardRequest;
    }
    this.leaderboardRequest = this.fetchLeaderboard().finally(() => {
      this.leaderboardRequest = null;
    });
    return this.leaderboardRequest;
  }

  private async fetchLeaderboard(): Promise<void> {
    const key = `hotpot.region-ranking:${this.config.environmentId}`;
    try {
      const cached = JSON.parse(this.storage.getItem(key) || 'null');
      if (cached) {
        this.regionWins = this.validateCounts(cached);
        this.leaderboardText = '上次云端排行 · 当前离线';
      }
    } catch {
      // 损坏的展示缓存不阻止获取最新云榜。
    }
    if (!this.cloud || !this.playerId) {
      this.leaderboardText = '云端未连接 · 通关保留在本机等待上传';
      return;
    }
    try {
      await this.flushRegionWins();
      const response = await this.request({action: 'leaderboard'});
      this.regionWins = this.validateCounts(response.counts);
      this.leaderboardText = this.pendingWins().length
        ? '云端排行 · 本机仍有通关待同步'
        : '云端排行 · 完成第三关计 1 次';
      try {
        this.storage.setItem(key, JSON.stringify(this.regionWins));
      } catch {
        // 云榜缓存失败不影响这次展示或玩家存档。
      }
    } catch (error) {
      this.leaderboardText = this.rankingFailure(error);
    }
  }

  private rankingFailure(error: any): string {
    const message = String(error?.message || '');
    if (/INVALID_ACTION|UPGRADE_REQUIRED/.test(message)) {
      return '云榜服务尚未更新 · 本机通关已保留';
    }
    if (message === 'DATABASE_UNAVAILABLE') {
      return '云榜数据库暂不可用 · 本机通关已保留';
    }
    return '云榜连接失败 · 通关记录待联网补传';
  }

  private validateCounts(value: any): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('排行榜格式错误');
    }
    const result: Record<string, number> = {};
    const visit = (nodes: RegionNode[]): void => {
      for (const node of nodes) {
        const count = value[node.code];
        if (Number.isSafeInteger(count) && count >= 0) {
          result[node.code] = count;
        }
        visit(node.children || []);
      }
    };
    visit(this.regions);
    return result;
  }

  private pendingWins(): PendingWin[] {
    try {
      const value = JSON.parse(this.storage.getItem(this.winKey()) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  private writePendingWins(wins: PendingWin[]): void {
    try {
      this.storage.setItem(this.winKey(), JSON.stringify(wins));
    } catch {
      this.storageAvailable = false;
    }
  }

  private winKey(): string {
    return `${this.key(this.playerId)}:pending-region-wins`;
  }
}
