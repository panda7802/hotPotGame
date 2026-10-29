import {validateDevelopmentConfig} from '../data/CloudConfig';
import {
  clone,
  CloudPlayer,
  enterPlayDay,
  mergeProgress,
  PLAY_SESSION_VERSION,
  PlayerState,
  PROGRESS_VERSION,
  validatePlayerState,
  validateRegions,
} from '../data/PlayerData';
import {LocalPlayer} from './PlayerServiceBase';
import {RegionLeaderboardService} from './RegionLeaderboardService';
import {createWebCloud, hasWebCloudRuntime} from './WebCloudBridge';
export type {PlayerStorage, SyncStatus} from './PlayerServiceBase';

/**
 * 云端连接、同步队列与本地存储实现。
 */
export class PlayerService extends RegionLeaderboardService {
  /**
   * 验证环境、加载云档案并合并本机待同步记录。
   */
  protected async connect(): Promise<void> {
    if (this.playerId) {
      await this.flush();
      return;
    }
    if (!this.config.enabled
      || (!this.wxHost?.cloud && !hasWebCloudRuntime())) {
      this.status = 'local';
      this.changed();
      return;
    }
    this.status = 'connecting';
    this.changed();
    try {
      validateDevelopmentConfig(this.config);
      this.cloud = this.wxHost?.cloud || await createWebCloud(this.config);
      this.cloud.init({env: this.config.environmentId});
      void this.loadRegions();
      const remote = this.parseRemote(await this.request({action: 'load'}));
      // 确认服务器身份之后才读取该账号的本地缓存，不展示上一账号的私有进度。
      this.playerId = remote.playerId;
      const cached = this.readLocal(remote.playerId);
      const browserGuest = this.cloud.platform === 'web' && !cached
        && remote.revision === 0 ? this.local.state : null;
      this.local =
        cached || this.blank(remote.playerId, remote.revision,
          browserGuest || remote.state);
      if (browserGuest) {
        this.local.dirty = true;
        this.local.mutationId = this.newMutationId();
        this.status = 'pending';
      } else if (cached?.dirty) {
        if (cached.mutationId === remote.lastMutationId) {
          this.local = this.blank(
            remote.playerId,
            remote.revision,
            remote.state,
          );
          this.status = 'synced';
        } else if (cached.baseRevision !== remote.revision) {
          this.remote = remote;
          this.status = 'conflict';
        } else {
          this.status = 'pending';
        }
      } else {
        this.local = this.blank(remote.playerId, remote.revision, remote.state);
        this.status = 'synced';
      }
      this.applyActiveDay();
      this.persist();
      this.changed();
      if (this.cloud.platform === 'web') {
        this.claimGuestWins();
      }
      void this.refreshLeaderboard();
      if (this.status === 'pending') {
        this.schedule();
      }
    } catch (error) {
      this.describeFailure(error);
      this.cloud = null;
      this.status = 'error';
      this.changed();
    }
  }

  /**
   * 跨日时清空当日对局并保留永久进度。
   */
  protected applyActiveDay(): boolean {
    if (!this.activePlayDate
      || this.local.state.playDate === this.activePlayDate) {
      return false;
    }
    this.local.state = enterPlayDay(this.local.state, this.activePlayDate);
    this.local.dirty = true;
    this.local.mutationId = this.newMutationId();
    if (this.status !== 'conflict') {
      this.status = this.playerId
        ? 'pending'
        : this.status === 'error'
          ? 'error'
          : 'local';
    }
    return true;
  }

  /**
   * 校验并持久化玩家状态，再安排云端同步。
   */
  protected setState(state: PlayerState): void {
    const valid = validatePlayerState(state, this.regions);
    if (JSON.stringify(valid) === JSON.stringify(this.local.state)) {
      return;
    }
    this.local.state = valid;
    this.local.dirty = true;
    this.local.mutationId = this.newMutationId();
    if (this.status !== 'conflict') {
      this.status = this.playerId
        ? 'pending'
        : this.status === 'error'
          ? 'error'
          : 'local';
    }
    this.persist();
    this.changed();
    this.schedule();
  }

  /**
   * 按版本号提交本机修改并处理云端冲突。
   */
  protected async drain(): Promise<void> {
    if (!this.cloud
      || !this.playerId ||
      this.status === 'conflict') {
      return;
    }
    await this.flushRegionWins();
    while (this.local.dirty && !this.isConflict) {
      const sent = clone(this.local);
      this.status = 'syncing';
      this.changed();
      try {
        const response = await this.request({
          action: 'save',
          expectedRevision: sent.baseRevision,
          mutationId: sent.mutationId,
          state: sent.state,
        });
        const remote = this.parseRemote(response);
        if (remote.playerId !== this.playerId) {
          throw new Error('云端身份不一致');
        }
        if (response.conflict) {
          this.remote = remote;
          this.status = 'conflict';
          this.changed();
          return;
        }
        this.local.baseRevision = remote.revision;
        if (this.local.mutationId === sent.mutationId) {
          this.local.dirty = false;
          this.local.state = remote.state;
          this.status = 'synced';
        } else {
          // 云端可能合并了另一设备的永久记录，保留同步期间新操作及云端图鉴。
          this.local.state.progress = mergeProgress(
            this.local.state.progress,
            remote.state.progress,
          );
          this.status = 'pending';
        }
        this.applyActiveDay();
        this.persist();
        this.changed();
      } catch (error) {
        this.describeFailure(error);
        this.status = 'error';
        this.changed();
        return;
      }
    }
  }

  /**
   * 延迟提交玩家状态，合并短时间内的连续操作。
   */
  protected schedule(): void {
    if (!this.cloud
      || !this.playerId ||
      this.timer ||
      this.status === 'conflict') {
      return;
    }
    this.timer = setTimeout(
      /**
       * 到期后继续同步或完成动画。
       */ () => {
        this.timer = null;
        void this.flush();
      },
      1500,
    );
  }

  /**
   * 从缓存、云存储或云函数加载地区树。
   */
  protected async loadRegions(): Promise<void> {
    const key =
      'hotpot.regions.dev.v1:' +
      String(this.config.environmentId) +
      ':' +
      String(this.config.regionsFileId || 'bundled') +
      '';
    try {
      const cached = this.storage.getItem(key);
      if (cached) {
        this.regions = validateRegions(JSON.parse(cached));
      }
    } catch {
      /*
       * 损坏缓存使用随包数据。
       */
    }
    if (!this.config.regionsFileId) {
      return;
    }
    try {
      const downloaded: any = await this.callbackRequest(
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ (success, fail) =>
          this.cloud.downloadFile({
            fileID: this.config.regionsFileId,
            success,
            fail,
          }),
      );
      const file: any = await this.callbackRequest(
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ (success, fail) =>
          this.wxHost.getFileSystemManager().readFile({
            filePath: downloaded.tempFilePath,
            encoding: 'utf8',
            success,
            fail,
          }),
      );
      this.regions = validateRegions(JSON.parse(file.data));
      try {
        this.storage.setItem(key, JSON.stringify(this.regions));
      } catch {
        /*
         * 地区缓存失败不阻塞登录。
         */
      }
    } catch {
      // 旧地区文件可以继续保持私有权限；新增云函数只读该文件。
      try {
        const response = await this.request({action: 'regions'});
        this.regions = validateRegions(response.regions);
        try {
          this.storage.setItem(key, JSON.stringify(this.regions));
        } catch {
          /*
           * 缓存失败不阻塞游戏。
           */
        }
      } catch {
        /*
         * 首次离线仍可选择随包地区。
         */
      }
    }
  }

  /**
   * 调用玩家云函数并检查返回值与协议版本。
   */
  protected async request(data: any): Promise<any> {
    const response: any = await this.callbackRequest(
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ (success, fail) =>
        this.cloud.callFunction({
          name: this.config.functionName,
          config: {env: this.config.environmentId},
          data,
          success,
          fail,
        }),
    );
    if (!response.result?.ok) {
      throw new Error(response.result?.code || '云端请求失败');
    }
    if (data.action !== 'regions'
      && response.result.progressVersion !== PROGRESS_VERSION) {
      throw new Error('CLOUD_UPGRADE_REQUIRED');
    }
    if (data.action !== 'regions'
      && response.result.playSessionVersion !== PLAY_SESSION_VERSION) {
      throw new Error('DAILY_UPGRADE_REQUIRED');
    }
    return response.result;
  }

  /**
   * 把云端异常归类为安全的用户提示。
   */
  protected describeFailure(error: any): void {
    const messages = [error?.message, error?.errMsg].filter(
      /**
       * 按条件筛选或判断条目：typeof value === 'string'。
       */ (value) => typeof value === 'string',
    );
    const message = messages.join(' ');
    if (/login_type_disabled|匿名登录/.test(message)) {
      this.failureText = '请在云环境开启网页访客登录';
      return;
    }
    if (/permission_denied|INVALID_ORIGIN|安全域名|安全来源/i.test(message)) {
      this.failureText = '请检查网页登录权限及安全来源配置';
      return;
    }
    const descriptions: Record<string, string> = {
      IDENTITY_REQUIRED: '微信身份未确认，请检查云环境关联',
      WEB_IDENTITY_REQUIRED: '网页登录未完成，请重试',
      WEB_SDK_UNAVAILABLE: '网页云服务加载失败，请检查网络后重试',
      DEVELOPMENT_ENV_REQUIRED: '云环境配置不匹配',
      DATABASE_UNAVAILABLE: '云存档服务暂不可用',
      INVALID_STATE: '当前存档校验失败',
      CLOUD_UPGRADE_REQUIRED: '请先更新云函数再同步图鉴与成就',
      DAILY_UPGRADE_REQUIRED:
        '请先更新云函数再同步每日关卡、随机牌阵与食材组合',
    };
    // 微信有时只在外层给出 -1，具体平台错误码包含在 errMsg 中。
    const embeddedCodes = (
      message.match(/(?:errCode|errorCode)\s*[:=]\s*-?\d+/gi) || []
    ).map(
      /**
       * 将当前条目转换为后续处理所需的值。
       */ (value) => value.replace(/^[\s\S]*[:=]\s*/, ''),
    );
    const platformCode = embeddedCodes.find(
      /**
       * 按条件筛选或判断条目：Math.abs(Number(value)) > 1。
       */ (value) => Math.abs(Number(value)) > 1,
    );
    const code =
      Object.keys(descriptions).find(
        /**
         * 按条件筛选或判断条目：messages.indexOf(item) >= 0。
         */ (item) => messages.indexOf(item) >= 0,
      ) ||
      (message.includes('超时')
        ? 'TIMEOUT'
        : platformCode ||
          String(error?.errCode || error?.code || 'NETWORK_ERROR'));
    this.failureText =
      descriptions[code] ||
      (code === 'TIMEOUT' ? '云端请求超时，请重试' : '云端连接失败，请重试');
    // 只记录已知业务代码或平台数字错误码，不输出响应、OpenID 或原始异常。
    const reason = [
      'INVALID_ENV',
      'FUNCTIONS_EXECUTE_FAIL',
      'FUNCTIONS_NOT_FOUND',
      'DATABASE_PERMISSION_DENIED',
      'FUNCTIONS_TIME_LIMIT_EXCEEDED',
      'RESOURCE_INSUFFICIENT',
    ].find(
      /**
       * 按条件筛选或判断条目：message.includes(value)。
       */ (value) => message.includes(value),
    );
    console.warn(
      '[HotPot Cloud Dev]',
      Object.hasOwnProperty.call(descriptions, code) ||
        /^-?\d+$/.test(code) ||
        code === 'TIMEOUT'
        ? code
        : 'NETWORK_ERROR',
      reason || '',
    );
  }

  /**
   * 将微信回调接口包装为带超时的 Promise。
   */
  protected callbackRequest(
    start: (success: (value: any) => void, fail: (error: any) => void) => void,
  ): Promise<any> {
    return new Promise(
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ (resolve, reject) => {
        const timer = setTimeout(
          /**
           * 到期后继续同步或完成动画。
           */ () => reject(new Error('云端连接超时')),
          8000,
        );
        try {
          start(
            /**
             * 在当前操作完成后更新相关游戏状态。
             */ (value) => {
              clearTimeout(timer);
              resolve(value);
            },
            /**
             * 在当前操作完成后更新相关游戏状态。
             */ (error) => {
              clearTimeout(timer);
              reject(error);
            },
          );
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  }

  /**
   * 校验云端玩家档案的结构和状态。
   */
  protected parseRemote(response: any): CloudPlayer {
    const record = response.player;
    if (!record
      || !/^[a-f0-9]{32}$/.test(record.playerId) ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 0 ||
      !Number.isSafeInteger(record.updatedAt) ||
      typeof record.lastMutationId !== 'string') {
      throw new Error('云端档案格式错误');
    }
    return {...record, state: validatePlayerState(record.state, this.regions)};
  }

  /**
   * 生成按云环境和玩家身份隔离的本机缓存键。
   */
  protected key(owner: string | null): string {
    return (
      'hotpot.player.dev.v1:' +
      String(this.config.environmentId || 'unconfigured') +
      ':' +
      String(owner || 'guest') +
      ''
    );
  }

  /**
   * 创建指定玩家和云端版本的本机存档。
   */
  protected blank(
    owner: string | null,
    revision: number,
    state: PlayerState,
  ): LocalPlayer {
    return {
      version: 1,
      owner,
      baseRevision: revision,
      dirty: false,
      mutationId: '',
      state: clone(state),
    };
  }

  /**
   * 读取并验证当前玩家的本机缓存。
   */
  protected readLocal(owner: string | null): LocalPlayer | null {
    try {
      const value = JSON.parse(this.storage.getItem(this.key(owner)) || 'null');
      if (!value
        || value.version !== 1 ||
        value.owner !== owner ||
        !Number.isSafeInteger(value.baseRevision) ||
        value.baseRevision < 0 ||
        typeof value.dirty !== 'boolean' ||
        typeof value.mutationId !== 'string') {
        return null;
      }
      return {...value, state: validatePlayerState(value.state, this.regions)};
    } catch {
      return null;
    }
  }

  /**
   * 将当前玩家状态写入本机缓存。
   */
  protected persist(): void {
    try {
      this.storage.setItem(this.key(this.playerId), JSON.stringify(this.local));
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
    }
  }

  /**
   * 生成本次本机修改的幂等标识。
   */
  protected newMutationId(): string {
    return (
      '' +
      String(Date.now().toString(36)) +
      '-' +
      String((++this.mutationSequence).toString(36)) +
      '-' +
      String(Math.random().toString(36).slice(2, 14)) +
      ''
    );
  }

  /**
   * 通知界面刷新玩家状态。
   */
  protected changed(): void {
    this.onChange();
  }
}
