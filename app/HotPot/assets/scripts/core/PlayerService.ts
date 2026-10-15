import {CLOUD_CONFIG, validateDevelopmentConfig} from '../data/CloudConfig';
import {
    clone, CloudPlayer, emptyPlayerState, GameSave, PlayerState, RegionNode,
    validatePlayerState, validateRegions,
} from '../data/PlayerData';

export interface PlayerStorage {getItem(key: string): string | null; setItem(key: string, value: string): void;}
interface LocalPlayer {
    version: 1; owner: string | null; baseRevision: number; dirty: boolean;
    mutationId: string; state: PlayerState;
}
export type SyncStatus = 'local' | 'connecting' | 'synced' | 'pending' | 'syncing' | 'conflict' | 'error';

/** 不依赖 Cocos，便于使用真实存档、模拟网络和独立用户做回归检查。 */
export class PlayerService {
    regions: RegionNode[];
    status: SyncStatus = 'local';
    playerId: string | null = null;
    remote: CloudPlayer | null = null;
    storageAvailable = true;
    private failureText = '云端连接失败';
    onChange: () => void = () => {};
    private local: LocalPlayer;
    private cloud: any = null;
    private flushPromise: Promise<void> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private mutationSequence = 0;
    private startupPromise: Promise<void> | null = null;

    constructor(regions: RegionNode[], private storage: PlayerStorage,
                private wxHost: any = (globalThis as any).wx, private config = CLOUD_CONFIG) {
        this.regions = validateRegions(regions);
        this.local = this.readLocal(null) || this.blank(null, 0, emptyPlayerState());
    }

    get state(): PlayerState { return clone(this.local.state); }
    get revision(): number { return this.local.baseRevision; }
    get isConflict(): boolean { return this.status === 'conflict'; }
    get statusText(): string {
        if (!this.storageAvailable) return '本机存储不可用，请勿关闭游戏';
        if (this.status === 'error') return `本机已保存 · ${this.failureText}`;
        return {
            local: '本机保存 · 云端未连接', connecting: '正在连接云端', synced: '已同步到云端',
            pending: '本机已保存 · 等待同步', syncing: '本机已保存 · 正在同步',
            conflict: '存在另一份进度，请选择存档', error: '本机已保存 · 云端连接失败',
        }[this.status];
    }

    initialize(): Promise<void> {
        if (this.startupPromise) return this.startupPromise;
        this.startupPromise = this.connect().then(() => { this.startupPromise = null; }, error => {
            this.startupPromise = null; throw error;
        });
        return this.startupPromise;
    }

    private async connect(): Promise<void> {
        if (this.playerId) { await this.flush(); return; }
        if (!this.config.enabled || !this.wxHost?.cloud) { this.status = 'local'; this.changed(); return; }
        this.status = 'connecting'; this.changed();
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
                    this.remote = remote; this.status = 'conflict';
                } else this.status = 'pending';
            } else {
                this.local = this.blank(remote.playerId, remote.revision, remote.state);
                this.status = 'synced';
            }
            this.persist(); this.changed();
            if (this.status === 'pending') this.schedule();
        } catch (error) {
            this.describeFailure(error);
            this.cloud = null; this.status = 'error'; this.changed();
        }
    }

    setSave(save: GameSave): void { this.setState({...this.local.state, save}); }
    setRegion(codes: string[]): void { this.setState({...this.local.state, profile: {regionCodes: codes}}); }

    private setState(state: PlayerState): void {
        const valid = validatePlayerState(state, this.regions);
        if (JSON.stringify(valid) === JSON.stringify(this.local.state)) return;
        this.local.state = valid;
        this.local.dirty = true;
        this.local.mutationId = this.newMutationId();
        if (this.status !== 'conflict') this.status = this.playerId ? 'pending' : this.status === 'error' ? 'error' : 'local';
        this.persist(); this.changed(); this.schedule();
    }

    flush(): Promise<void> {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.flushPromise) return this.flushPromise;
        this.flushPromise = this.drain().then(() => { this.flushPromise = null; }, error => {
            this.flushPromise = null; throw error;
        });
        return this.flushPromise;
    }

    private async drain(): Promise<void> {
        if (!this.cloud || !this.playerId || this.status === 'conflict' || !this.local.dirty) return;
        while (this.local.dirty && !this.isConflict) {
            const sent = clone(this.local);
            this.status = 'syncing'; this.changed();
            try {
                const response = await this.request({action: 'save', expectedRevision: sent.baseRevision,
                    mutationId: sent.mutationId, state: sent.state});
                const remote = this.parseRemote(response);
                if (remote.playerId !== this.playerId) throw new Error('云端身份不一致');
                if (response.conflict) {
                    this.remote = remote; this.status = 'conflict'; this.changed(); return;
                }
                this.local.baseRevision = remote.revision;
                if (this.local.mutationId === sent.mutationId) {
                    this.local.dirty = false;
                    this.local.state = remote.state;
                    this.status = 'synced';
                } else this.status = 'pending';
                this.persist(); this.changed();
            } catch (error) {
                this.describeFailure(error);
                this.status = 'error'; this.changed(); return;
            }
        }
    }

    /** 用户选择云端版本后，当前本机内容被明确替换；选择本机则基于最新云版本重新提交。 */
    resolveConflict(useCloud: boolean): PlayerState {
        if (!this.remote || !this.playerId || this.status !== 'conflict') throw new Error('当前没有存档冲突');
        const remote = this.remote;
        this.remote = null;
        if (useCloud) {
            this.local = this.blank(this.playerId, remote.revision, remote.state);
            this.status = 'synced';
        } else {
            this.local.baseRevision = remote.revision;
            this.local.dirty = true;
            this.local.mutationId = this.newMutationId();
            this.status = 'pending';
        }
        this.persist(); this.changed(); this.schedule();
        return this.state;
    }

    private schedule(): void {
        if (!this.cloud || !this.playerId || this.timer || this.status === 'conflict') return;
        this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 1500);
    }

    private async loadRegions(): Promise<void> {
        const key = `hotpot.regions.dev.v1:${this.config.environmentId}:${this.config.regionsFileId || 'bundled'}`;
        try {
            const cached = this.storage.getItem(key);
            if (cached) this.regions = validateRegions(JSON.parse(cached));
        } catch { /* 损坏缓存使用随包数据。 */ }
        if (!this.config.regionsFileId) return;
        try {
            const downloaded: any = await this.callbackRequest((success, fail) =>
                this.cloud.downloadFile({fileID: this.config.regionsFileId, success, fail}));
            const file: any = await this.callbackRequest((success, fail) => this.wxHost.getFileSystemManager().readFile({
                filePath: downloaded.tempFilePath, encoding: 'utf8', success, fail,
            }));
            this.regions = validateRegions(JSON.parse(file.data));
            try { this.storage.setItem(key, JSON.stringify(this.regions)); } catch { /* 地区缓存失败不阻塞登录。 */ }
        } catch {
            // 旧地区文件可以继续保持私有权限；新增云函数只读该文件。
            try {
                const response = await this.request({action: 'regions'});
                this.regions = validateRegions(response.regions);
                try { this.storage.setItem(key, JSON.stringify(this.regions)); } catch { /* 缓存失败不阻塞游戏。 */ }
            } catch { /* 首次离线仍可选择随包地区。 */ }
        }
    }

    private async request(data: any): Promise<any> {
        const response: any = await this.callbackRequest((success, fail) => this.cloud.callFunction({
            name: this.config.functionName, config: {env: this.config.environmentId}, data, success, fail,
        }));
        if (!response.result?.ok) throw new Error(response.result?.code || '云端请求失败');
        return response.result;
    }

    private describeFailure(error: any): void {
        const messages = [error?.message, error?.errMsg].filter(value => typeof value === 'string');
        const message = messages.join(' ');
        const descriptions: Record<string, string> = {
            IDENTITY_REQUIRED: '微信身份未确认，请检查云环境关联',
            DEVELOPMENT_ENV_REQUIRED: '云环境配置不匹配',
            DATABASE_UNAVAILABLE: '云存档服务暂不可用',
            INVALID_STATE: '当前存档校验失败',
        };
        // 微信有时只在外层给出 -1，具体平台错误码包含在 errMsg 中。
        const embeddedCodes = (message.match(/(?:errCode|errorCode)\s*[:=]\s*-?\d+/gi) || [])
            .map(value => value.replace(/^[\s\S]*[:=]\s*/, ''));
        const platformCode = embeddedCodes.find(value => Math.abs(Number(value)) > 1);
        const code = Object.keys(descriptions).find(item => messages.indexOf(item) >= 0) ||
            (message.includes('超时') ? 'TIMEOUT' : platformCode || String(error?.errCode || error?.code || 'NETWORK_ERROR'));
        this.failureText = descriptions[code] || (code === 'TIMEOUT' ? '云端请求超时，请重试' : '云端连接失败，请重试');
        // 只记录已知业务代码或平台数字错误码，不输出响应、OpenID 或原始异常。
        const reason = ['INVALID_ENV', 'FUNCTIONS_EXECUTE_FAIL', 'FUNCTIONS_NOT_FOUND',
            'DATABASE_PERMISSION_DENIED', 'FUNCTIONS_TIME_LIMIT_EXCEEDED', 'RESOURCE_INSUFFICIENT']
            .find(value => message.includes(value));
        console.warn('[HotPot Cloud Dev]', Object.hasOwnProperty.call(descriptions, code) || /^-?\d+$/.test(code) || code === 'TIMEOUT' ? code : 'NETWORK_ERROR', reason || '');
    }

    private callbackRequest(start: (success: (value: any) => void, fail: (error: any) => void) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('云端连接超时')), 8000);
            try { start(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); }); }
            catch (error) { clearTimeout(timer); reject(error); }
        });
    }

    private parseRemote(response: any): CloudPlayer {
        const record = response.player;
        if (!record || !/^[a-f0-9]{32}$/.test(record.playerId) || !Number.isSafeInteger(record.revision) || record.revision < 0 ||
            !Number.isSafeInteger(record.updatedAt) || typeof record.lastMutationId !== 'string') throw new Error('云端档案格式错误');
        return {...record, state: validatePlayerState(record.state, this.regions)};
    }

    private key(owner: string | null): string { return `hotpot.player.dev.v1:${this.config.environmentId || 'unconfigured'}:${owner || 'guest'}`; }
    private blank(owner: string | null, revision: number, state: PlayerState): LocalPlayer {
        return {version: 1, owner, baseRevision: revision, dirty: false, mutationId: '', state: clone(state)};
    }
    private readLocal(owner: string | null): LocalPlayer | null {
        try {
            const value = JSON.parse(this.storage.getItem(this.key(owner)) || 'null');
            if (!value || value.version !== 1 || value.owner !== owner || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0 ||
                typeof value.dirty !== 'boolean' || typeof value.mutationId !== 'string') return null;
            return {...value, state: validatePlayerState(value.state, this.regions)};
        } catch { return null; }
    }
    private persist(): void {
        try { this.storage.setItem(this.key(this.playerId), JSON.stringify(this.local)); this.storageAvailable = true; }
        catch { this.storageAvailable = false; }
    }
    private newMutationId(): string {
        return `${Date.now().toString(36)}-${(++this.mutationSequence).toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    }
    private changed(): void { this.onChange(); }
}
