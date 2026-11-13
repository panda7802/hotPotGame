import {CLOUD_CONFIG} from '../data/CloudConfig';
import {DEFAULT_RUNTIME_CONFIG, RuntimeConfig} from '../data/RuntimeConfig';
import {
  clone,
  CloudPlayer,
  emptyPlayerState,
  GameSave,
  localPlayDate,
  mergeProgress,
  PlayerState,
  RegionNode,
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
export interface LocalPlayer {
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
export type SyncStatus =
  | 'local'
  | 'connecting'
  | 'synced'
  | 'pending'
  | 'syncing'
  | 'conflict'
  | 'error';
/**
 * 不依赖 Cocos，便于使用真实存档、模拟网络和独立用户做回归检查。
 */
export abstract class PlayerServiceBase {
  runtimeConfig: RuntimeConfig = {...DEFAULT_RUNTIME_CONFIG};
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
  protected failureText = '云端连接失败';
  /**
   * 当前玩家的本机档案。
   */
  protected local: LocalPlayer;
  /**
   * 微信云开发客户端对象。
   */
  protected cloud: any = null;
  /**
   * 正在执行的同步任务。
   */
  protected flushPromise: Promise<void> | null = null;
  /**
   * 延迟同步的计时器。
   */
  protected timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 本会话中本机修改的递增序号。
   */
  protected mutationSequence = 0;
  /**
   * 正在执行的连接任务。
   */
  protected startupPromise: Promise<void> | null = null;
  /**
   * 本次游戏使用的本地自然日。
   */
  protected activePlayDate: string | null = null;
  /**
   * 初始化实例的内部状态和依赖。
   */
  constructor(
    regions: RegionNode[],
    /**
     * 玩家档案使用的本机缓存接口。
     */ protected storage: PlayerStorage,
    /**
     * 微信小游戏运行时对象。
     */ protected wxHost: any = (globalThis as any).wx,
    /**
     * 当前云开发环境和函数配置。
     */ protected config = CLOUD_CONFIG,) {
    this.regions = validateRegions(regions);
    this.local =
      this.readLocal(null) || this.blank(null, 0, emptyPlayerState());
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
    if (!this.storageAvailable) {
      return '本机存储不可用，请勿关闭游戏';
    }
    if (this.status === 'error') {
      return `本机已保存 · ${this.failureText}`;
    }
    return {
      local: '本机保存 · 云端未连接',
      connecting: '正在连接云端',
      synced: '已同步到云端',
      pending: '本机已保存 · 等待同步',
      syncing: '本机已保存 · 正在同步',
      conflict: '存在另一份进度，请选择存档',
      error: '本机已保存 · 云端连接失败',
    }[this.status];
  }

  /**
   * 存档或同步状态变化时调用的界面回调。
   */
  onChange: () => void =
    /**
     * 在当前操作完成后更新相关游戏状态。
     */ () => {};

  /**
   * 建立云连接；并发初始化复用同一个 Promise。
   */
  initialize(): Promise<void> {
    if (this.startupPromise) {
      return this.startupPromise;
    }
    this.startupPromise = this.connect().then(
      /**
       * 处理异步任务完成或失败后的状态。
       */ () => {
        this.startupPromise = null;
      },
      /**
       * 处理异步任务完成或失败后的状态。
       */ (error) => {
        this.startupPromise = null;
        throw error;
      },
    );
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
    if (this.flushPromise) {
      return this.flushPromise;
    }
    this.flushPromise = this.drain().then(
      /**
       * 处理异步任务完成或失败后的状态。
       */ () => {
        this.flushPromise = null;
      },
      /**
       * 处理异步任务完成或失败后的状态。
       */ (error) => {
        this.flushPromise = null;
        throw error;
      },
    );
    return this.flushPromise;
  }

  /**
   * 用户选择云端版本后，当前本机内容被明确替换；选择本机则基于最新云版本重新提交。
   */
  resolveConflict(useCloud: boolean): PlayerState {
    if (!this.remote || !this.playerId || this.status !== 'conflict') {
      throw new Error('当前没有存档冲突');
    }
    const remote = this.remote;
    const progress = mergeProgress(
      this.local.state.progress,
      remote.state.progress,
    );
    this.remote = null;
    if (useCloud) {
      this.local = this.blank(this.playerId, remote.revision, remote.state);
      this.local.state.progress = progress;
      this.local.dirty =
        JSON.stringify(progress) !== JSON.stringify(remote.state.progress);
      if (this.local.dirty) {
        this.local.mutationId = this.newMutationId();
      }
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
   * 连接云端账号。
   */
  protected abstract connect(): Promise<void>;
  /**
   * 根据当前自然日调整存档。
   */
  protected abstract applyActiveDay(): boolean;
  /**
   * 写入新的玩家档案。
   */
  protected abstract setState(state: PlayerState): void;
  /**
   * 发送等待同步的修改。
   */
  protected abstract drain(): Promise<void>;
  /**
   * 安排下一次同步。
   */
  protected abstract schedule(): void;
  /**
   * 获取地区树。
   */
  protected abstract loadRegions(): Promise<void>;
  /**
   * 调用开发云函数。
   */
  protected abstract request(data: any): Promise<any>;
  /**
   * 记录云端失败原因。
   */
  protected abstract describeFailure(error: any): void;
  /**
   * 包装平台回调请求。
   */
  protected abstract callbackRequest(
    start: (success: (value: any) => void, fail: (error: any) => void) => void,
  ): Promise<any>;
  /**
   * 校验云端响应。
   */
  protected abstract parseRemote(response: any): CloudPlayer;
  /**
   * 创建本地存档键名。
   */
  protected abstract key(owner: string | null): string;
  /**
   * 创建本地存档结构。
   */
  protected abstract blank(
    owner: string | null,
    revision: number,
    state: PlayerState,
  ): LocalPlayer;
  /**
   * 从设备读取本地存档。
   */
  protected abstract readLocal(owner: string | null): LocalPlayer | null;
  /**
   * 持久化本地存档。
   */
  protected abstract persist(): void;
  /**
   * 创建本次修改的唯一编号。
   */
  protected abstract newMutationId(): string;
  /**
   * 通知外部状态已经更新。
   */
  protected abstract changed(): void;
}
