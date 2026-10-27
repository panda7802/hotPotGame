import {CLOUD_CONFIG, validateDevelopmentConfig} from '../data/CloudConfig';
import {
  clone,
  CloudPlayer,
  emptyPlayerState,
  enterPlayDay,
  GameSave,
  localPlayDate,
  mergeProgress,
  PLAY_SESSION_VERSION,
  PlayerState,
  PROGRESS_VERSION,
  RegionNode,
  validatePlayerState,
  validateRegions,
} from '../data/PlayerData';
/**
 * PlayerStorage 的数据结构；字段说明见各成员。
 */
export interface PlayerStorage {
    /**
     * 读取或查找 getItem 对应的数据，供游戏使用。
     */ getItem(key: string): string | null;
    /**
     * 更新 setItem 对应的状态。
     */ setItem(key: string, value: string): void;
}
/**
 * LocalPlayer 的数据结构；字段说明见各成员。
 */
interface LocalPlayer {
  /**
   * 数据格式版本。
   */
  version: 1;
    /**
     * 本机缓存所属的玩家编号。
     */ owner: string | null;
    /**
     * 上次同步时的云端版本号。
     */ baseRevision: number;
    /**
     * 是否存在未同步的本机修改。
     */ dirty: boolean;
  /**
   * 一次修改的幂等标识。
   */
  mutationId: string;
    /**
     * 玩家档案或对局状态。
     */ state: PlayerState;
}
export type SyncStatus = 'local' | 'connecting' | 'synced' | 'pending' | 'syncing' | 'conflict' | 'error';
/**
 * 不依赖 Cocos，便于使用真实存档、模拟网络和独立用户做回归检查。
 */
export class PlayerService {
  /**
   * 可供选择的地区树。
   */
  regions: RegionNode[];
  /**
   * 本机与云端同步的当前状态。
   */
  status: SyncStatus = 'local';
  /**
   * 云端返回的玩家匿名编号。
   */
  playerId: string | null = null;
  /**
   * 冲突时保留的云端档案。
   */
  remote: CloudPlayer | null = null;
  /**
   * 本机存储是否可用。
   */
  storageAvailable = true;
  /**
   * 用户可见的云端失败说明。
   */
  private failureText = '云端连接失败';
  /**
   * 当前玩家的本机档案。
   */
  private local: LocalPlayer;
  /**
   * 微信云开发客户端对象。
   */
  private cloud: any = null;
  /**
   * 正在执行的同步任务。
   */
  private flushPromise: Promise<void> | null = null;
  /**
   * 延迟同步的计时器。
   */
  private timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 本会话中本机修改的递增序号。
   */
  private mutationSequence = 0;
  /**
   * 正在执行的连接任务。
   */
  private startupPromise: Promise<void> | null = null;
  /**
   * 本次游戏使用的本地自然日。
   */
  private activePlayDate: string | null = null;
  /**
   * 初始化实例的内部状态和依赖。
   */
  constructor(regions: RegionNode[], /**
   * 玩家档案使用的本机缓存接口。
   */ private storage: PlayerStorage,
                /**
                 * 微信小游戏运行时对象。
                 */ private wxHost: any = (globalThis as any).wx,
                /**
                 * 当前云开发环境和函数配置。
                 */ private config = CLOUD_CONFIG) {
    this.regions = validateRegions(regions);
    this.local = this.readLocal(null) || this.blank(null, 0, emptyPlayerState());
  }
  /**
   * 返回当前状态的副本，避免调用方直接修改内部存档。
   */
  get state(): PlayerState {
    return clone(this.local.state);
  }
  /**
   * 返回本机档案对应的云端版本号。
   */
  get revision(): number {
    return this.local.baseRevision;
  }

  /**
   * 指示本机存档是否与云端版本冲突。
   */
  get isConflict(): boolean {
    return this.status === 'conflict';
  }

  /**
   * 将同步状态转换为玩家可读的提示文字。
   */
  get statusText(): string {
    if (!this.storageAvailable) return '本机存储不可用，请勿关闭游戏';
    if (this.status === 'error') return `本机已保存 · ${this.failureText}`;
    return {
      local: '本机保存 · 云端未连接', connecting: '正在连接云端', synced: '已同步到云端',
      pending: '本机已保存 · 等待同步', syncing: '本机已保存 · 正在同步',
      conflict: '存在另一份进度，请选择存档', error: '本机已保存 · 云端连接失败',
    }[this.status];
  }

  /**
   * 存档或同步状态变化时调用的界面回调。
   */
  onChange: () => void = /**
   * 在当前操作完成后更新相关游戏状态。
   */() => {
  };

  /**
   * 建立云连接；并发初始化复用同一个 Promise。
   */
  initialize(): Promise<void> {
    if (this.startupPromise) return this.startupPromise;
    this.startupPromise = this.connect().then(/**
     * 处理异步任务完成或失败后的状态。
     */() => {
      this.startupPromise = null;
    }, /**
     * 处理异步任务完成或失败后的状态。
     */error => {
      this.startupPromise = null;
      throw error;
    });
    return this.startupPromise;
  }

  /**
   * 更新当前对局并安排同步。
   */
  setSave(save: GameSave): void {
    this.setState({...this.local.state, save});
  }

  /**
   * 更新玩家地区并安排同步。
   */
  setRegion(codes: string[]): void {
    this.setState({...this.local.state, profile: {regionCodes: codes}});
  }

  /**
   * 入口和从后台返回时调用；只清当前对局，地区和永久记录保留。
   */
  beginDailySession(now = new Date()): boolean {
    this.activePlayDate = localPlayDate(now);
    const reset = this.applyActiveDay();
    if (reset) {
      this.persist();
      this.changed();
      this.schedule();
    }
    return reset;
  }

  /**
   * 立即执行待处理的同步。
   */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.drain().then(/**
     * 处理异步任务完成或失败后的状态。
     */() => {
      this.flushPromise = null;
    }, /**
     * 处理异步任务完成或失败后的状态。
     */error => {
      this.flushPromise = null;
      throw error;
    });
    return this.flushPromise;
  }

  /**
   * 用户选择云端版本后，当前本机内容被明确替换；选择本机则基于最新云版本重新提交。
   */
  resolveConflict(useCloud: boolean): PlayerState {
    if (!this.remote || !this.playerId || this.status !== 'conflict') throw new Error('当前没有存档冲突');
    const remote = this.remote;
    const progress = mergeProgress(this.local.state.progress, remote.state.progress);
    this.remote = null;
    if (useCloud) {
      this.local = this.blank(this.playerId, remote.revision, remote.state);
      this.local.state.progress = progress;
      this.local.dirty = JSON.stringify(progress) !== JSON.stringify(remote.state.progress);
      if (this.local.dirty) this.local.mutationId = this.newMutationId();
      this.status = this.local.dirty ? 'pending' : 'synced';
    } else {
      this.local.state.progress = progress;
      this.local.baseRevision = remote.revision;
      this.local.dirty = true;
      this.local.mutationId = this.newMutationId();
      this.status = 'pending';
    }
    this.applyActiveDay();
    this.persist();
    this.changed();
    this.schedule();
    return this.state;
  }

  /**
   * 验证环境、加载云档案并合并本机待同步记录。
   */
  private async connect(): Promise<void> {
    if (this.playerId) {
      await this.flush();
      return;
    }
    if (!this.config.enabled || !this.wxHost?.cloud) {
      this.status = 'local';
      this.changed();
      return;
    }
    this.status = 'connecting';
    this.changed();
    try {
      validateDevelopmentConfig(this.config);
      this.cloud = this.wxHost.cloud;
      this.cloud.init({env: this.config.environmentId});
      void this.loadRegions();
      const remote = this.parseRemote(await this.request({action: 'load'}));
      // 确认服务器身份之后才读取该账号的本地缓存，不展示上一账号的私有进度。
      this.playerId = remote.playerId;
      const cached = this.readLocal(remote.playerId);
      this.local = cached || this.blank(remote.playerId, remote.revision, remote.state);
      if (cached?.dirty) {
        if (cached.mutationId === remote.lastMutationId) {
          this.local = this.blank(remote.playerId, remote.revision, remote.state);
          this.status = 'synced';
        } else if (cached.baseRevision !== remote.revision) {
          this.remote = remote;
          this.status = 'conflict';
        } else this.status = 'pending';
      } else {
        this.local = this.blank(remote.playerId, remote.revision, remote.state);
        this.status = 'synced';
      }
      this.applyActiveDay();
      this.persist();
      this.changed();
      if (this.status === 'pending') this.schedule();
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
  private applyActiveDay(): boolean {
    if (!this.activePlayDate || this.local.state.playDate === this.activePlayDate) return false;
    this.local.state = enterPlayDay(this.local.state, this.activePlayDate);
    this.local.dirty = true;
    this.local.mutationId = this.newMutationId();
    if (this.status !== 'conflict') this.status = this.playerId ? 'pending' : this.status === 'error' ? 'error' : 'local';
    return true;
  }

  /**
   * 校验并持久化玩家状态，再安排云端同步。
   */
  private setState(state: PlayerState): void {
    const valid = validatePlayerState(state, this.regions);
    if (JSON.stringify(valid) === JSON.stringify(this.local.state)) return;
    this.local.state = valid;
    this.local.dirty = true;
    this.local.mutationId = this.newMutationId();
    if (this.status !== 'conflict') this.status = this.playerId ? 'pending' : this.status === 'error' ? 'error' : 'local';
    this.persist();
    this.changed();
    this.schedule();
  }

  /**
   * 按版本号提交本机修改并处理云端冲突。
   */
  private async drain(): Promise<void> {
    if (!this.cloud || !this.playerId || this.status === 'conflict' || !this.local.dirty) return;
    while (this.local.dirty && !this.isConflict) {
      const sent = clone(this.local);
      this.status = 'syncing';
      this.changed();
      try {
        const response = await this.request({
          action: 'save', expectedRevision: sent.baseRevision,
          mutationId: sent.mutationId, state: sent.state
        });
        const remote = this.parseRemote(response);
        if (remote.playerId !== this.playerId) throw new Error('云端身份不一致');
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
          this.local.state.progress = mergeProgress(this.local.state.progress, remote.state.progress);
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
  private schedule(): void {
    if (!this.cloud || !this.playerId || this.timer || this.status === 'conflict') return;
    this.timer = setTimeout(/**
     * 到期后继续同步或完成动画。
     */() => {
      this.timer = null;
      void this.flush();
    }, 1500);
  }

  /**
   * 从缓存、云存储或云函数加载地区树。
   */
  private async loadRegions(): Promise<void> {
    const key = `hotpot.regions.dev.v1:${this.config.environmentId}:${this.config.regionsFileId || 'bundled'}`;
    try {
      const cached = this.storage.getItem(key);
      if (cached) this.regions = validateRegions(JSON.parse(cached));
    } catch { /*
     * 损坏缓存使用随包数据。
     */
    }
    if (!this.config.regionsFileId) return;
    try {
      const downloaded: any = await this.callbackRequest(/**
       * 在当前操作完成后更新相关游戏状态。
       */(success, fail) =>
        this.cloud.downloadFile({fileID: this.config.regionsFileId, success, fail}));
      const file: any = await this.callbackRequest(/**
       * 在当前操作完成后更新相关游戏状态。
       */(success, fail) => this.wxHost.getFileSystemManager().readFile({
        filePath: downloaded.tempFilePath, encoding: 'utf8', success, fail,
      }));
      this.regions = validateRegions(JSON.parse(file.data));
      try {
        this.storage.setItem(key, JSON.stringify(this.regions));
      } catch { /*
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
        } catch { /*
         * 缓存失败不阻塞游戏。
         */
        }
      } catch { /*
       * 首次离线仍可选择随包地区。
       */
      }
    }
  }

  /**
   * 调用玩家云函数并检查返回值与协议版本。
   */
  private async request(data: any): Promise<any> {
    const response: any = await this.callbackRequest(/**
     * 在当前操作完成后更新相关游戏状态。
     */(success, fail) => this.cloud.callFunction({
      name: this.config.functionName, config: {env: this.config.environmentId}, data, success, fail,
    }));
    if (!response.result?.ok) throw new Error(response.result?.code || '云端请求失败');
    if (data.action !== 'regions' && response.result.progressVersion !== PROGRESS_VERSION) {
      throw new Error('CLOUD_UPGRADE_REQUIRED');
    }
    if (data.action !== 'regions' && response.result.playSessionVersion !== PLAY_SESSION_VERSION) {
      throw new Error('DAILY_UPGRADE_REQUIRED');
    }
    return response.result;
  }

  /**
   * 把云端异常归类为安全的用户提示。
   */
  private describeFailure(error: any): void {
    const messages = [error?.message, error?.errMsg].filter(/**
     * 按条件筛选或判断条目：typeof value === 'string'。
     */value => typeof value === 'string');
    const message = messages.join(' ');
    const descriptions: Record<string, string> = {
      IDENTITY_REQUIRED: '微信身份未确认，请检查云环境关联',
      DEVELOPMENT_ENV_REQUIRED: '云环境配置不匹配',
      DATABASE_UNAVAILABLE: '云存档服务暂不可用',
      INVALID_STATE: '当前存档校验失败',
      CLOUD_UPGRADE_REQUIRED: '请先更新云函数再同步图鉴与成就',
      DAILY_UPGRADE_REQUIRED: '请先更新云函数再同步每日关卡、随机牌阵与食材组合',
    };
    // 微信有时只在外层给出 -1，具体平台错误码包含在 errMsg 中。
    const embeddedCodes = (message.match(/(?:errCode|errorCode)\s*[:=]\s*-?\d+/gi) || [])
      .map(/**
       * 将当前条目转换为后续处理所需的值。
       */value => value.replace(/^[\s\S]*[:=]\s*/, ''));
    const platformCode = embeddedCodes.find(/**
     * 按条件筛选或判断条目：Math.abs(Number(value)) > 1。
     */value => Math.abs(Number(value)) > 1);
    const code = Object.keys(descriptions).find(/**
     * 按条件筛选或判断条目：messages.indexOf(item) >= 0。
     */item => messages.indexOf(item) >= 0) ||
      (message.includes('超时') ? 'TIMEOUT' : platformCode || String(error?.errCode || error?.code || 'NETWORK_ERROR'));
    this.failureText = descriptions[code] || (code === 'TIMEOUT' ? '云端请求超时，请重试' : '云端连接失败，请重试');
    // 只记录已知业务代码或平台数字错误码，不输出响应、OpenID 或原始异常。
    const reason = ['INVALID_ENV', 'FUNCTIONS_EXECUTE_FAIL', 'FUNCTIONS_NOT_FOUND',
      'DATABASE_PERMISSION_DENIED', 'FUNCTIONS_TIME_LIMIT_EXCEEDED', 'RESOURCE_INSUFFICIENT']
      .find(/**
       * 按条件筛选或判断条目：message.includes(value)。
       */value => message.includes(value));
    console.warn('[HotPot Cloud Dev]', Object.hasOwnProperty.call(descriptions, code) || /^-?\d+$/.test(code) || code === 'TIMEOUT' ? code : 'NETWORK_ERROR', reason || '');
  }

  /**
   * 将微信回调接口包装为带超时的 Promise。
   */
  private callbackRequest(start: (success: (value: any) => void, fail: (error: any) => void) => void): Promise<any> {
    return new Promise(/**
     * 在当前操作完成后更新相关游戏状态。
     */(resolve, reject) => {
      const timer = setTimeout(/**
       * 到期后继续同步或完成动画。
       */() => reject(new Error('云端连接超时')), 8000);
      try {
        start(/**
         * 在当前操作完成后更新相关游戏状态。
         */value => {
          clearTimeout(timer);
          resolve(value);
        }, /**
         * 在当前操作完成后更新相关游戏状态。
         */error => {
          clearTimeout(timer);
          reject(error);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * 校验云端玩家档案的结构和状态。
   */
  private parseRemote(response: any): CloudPlayer {
    const record = response.player;
    if (!record || !/^[a-f0-9]{32}$/.test(record.playerId) || !Number.isSafeInteger(record.revision) || record.revision < 0 ||
      !Number.isSafeInteger(record.updatedAt) || typeof record.lastMutationId !== 'string') throw new Error('云端档案格式错误');
    return {...record, state: validatePlayerState(record.state, this.regions)};
  }

  /**
   * 生成按云环境和玩家身份隔离的本机缓存键。
   */
  private key(owner: string | null): string {
    return `hotpot.player.dev.v1:${this.config.environmentId || 'unconfigured'}:${owner || 'guest'}`;
  }

  /**
   * 创建指定玩家和云端版本的本机存档。
   */
  private blank(owner: string | null, revision: number, state: PlayerState): LocalPlayer {
    return {
      version: 1,
      owner,
      baseRevision: revision,
      dirty: false,
      mutationId: '',
      state: clone(state)
    };
  }

  /**
   * 读取并验证当前玩家的本机缓存。
   */
  private readLocal(owner: string | null): LocalPlayer | null {
    try {
      const value = JSON.parse(this.storage.getItem(this.key(owner)) || 'null');
      if (!value || value.version !== 1 || value.owner !== owner || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0 ||
        typeof value.dirty !== 'boolean' || typeof value.mutationId !== 'string') return null;
      return {...value, state: validatePlayerState(value.state, this.regions)};
    } catch {
      return null;
    }
  }

  /**
   * 将当前玩家状态写入本机缓存。
   */
  private persist(): void {
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
  private newMutationId(): string {
    return `${Date.now().toString(36)}-${(++this.mutationSequence).toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }

  /**
   * 通知界面刷新玩家状态。
   */
  private changed(): void {
    this.onChange();
  }
}
