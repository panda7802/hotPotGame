import {
  game as cocosGame,
  Game,
  JsonAsset,
  Node,
  ResolutionPolicy,
  resources,
  sys,
  Vec3,
  view,
} from 'cc';

import {
  BOARD_VERSION,
  clone,
  GameSave,
  RegionNode,
  restoreLevel,
  shouldUpgradeUnstartedLevelThree,
} from '../data/PlayerData';
import {createLevel, LevelData} from '../data/GameData';

import {HotPotFields} from './HotPotFields';
import {PlayerService} from './PlayerService';
import {WechatShareService} from './WechatShareService';
import {WechatGameClubService} from './WechatGameClubService';
import {GAME_CLUB_OPENLINK} from '../data/GameClubConfig';

import {
  achievementEntries,
  unlockedAchievementIds,
} from '../data/CollectionData';

import {DESIGN_HEIGHT, DESIGN_WIDTH, ToolType} from './HotPotUi';
import {readPageStyle, setPageTheme} from '../data/PageTheme';

const PLAYER_UPLOAD_INTERVAL = 30;

/**
 * HotPotState：场景状态、生命周期和资源加载。
 */
export abstract class HotPotState extends HotPotFields {
  protected referenceLayout=false;
  private readonly wechatSharing = new WechatShareService();
  private readonly wechatGameClub = new WechatGameClubService();
  private gameClubOpenlink: string = GAME_CLUB_OPENLINK;
  private manualPlayerSync = false;

  protected unbindGameClubEntry(): void {
    this.wechatGameClub.dispose();
  }

  protected async openGameClub(): Promise<void> {
    const menu = this.node.getChildByName('PlayerOverlay');
    if (!menu || !this.enabledInHierarchy) return;
    const result = await this.wechatGameClub.open(this.gameClubOpenlink);
    if (!this.node.isValid || !menu.isValid || menu.parent !== this.node) return;
    const message = result.status === 'unsupported'
      ? '请在新版微信小游戏中打开游戏圈'
      : result.status === 'unconfigured'
        ? '游戏圈入口尚未配置，请稍后再试'
        : result.status === 'busy' ? '正在打开游戏圈，请稍候'
          : result.status === 'failed' ? result.message : '';
    if (message) this.showToast(message, '#A24A3C');
  }

  onDisable(): void { this.wechatGameClub.dispose(); }

  protected shareGame(): void {
    const result = this.wechatSharing.share();
    if (result === 'unsupported') {
      this.showToast('请在微信小游戏中使用“分享给好友”', '#A24A3C');
    } else if (result === 'failed') {
      this.showToast('暂时无法打开分享，请稍后重试', '#A24A3C');
    }
  }
  /**
   * 初始化画布、游戏界面、资源和玩家档案。
   */
  onLoad(): void {
    this.wechatSharing.start();
    setPageTheme(readPageStyle(sys.localStorage));
    const frameSize = view.getFrameSize();
    // 较短的屏幕完整显示加高后的界面，避免八行图片或底部按钮被裁掉。
    const policy = this.referenceLayout ? ResolutionPolicy.FIXED_WIDTH :
      frameSize.width > 0 &&
      frameSize.height / frameSize.width < DESIGN_HEIGHT / DESIGN_WIDTH
        ? ResolutionPolicy.SHOW_ALL
        : ResolutionPolicy.FIXED_WIDTH;
    const referenceHeight=frameSize.width>0?DESIGN_WIDTH*frameSize.height/frameSize.width:DESIGN_HEIGHT;
    view.setDesignResolutionSize(DESIGN_WIDTH,DESIGN_HEIGHT,policy);
    if (frameSize.width > 0 && frameSize.height > 0) {
      this.viewportHeight = this.referenceLayout ? referenceHeight : Math.max(
        DESIGN_HEIGHT,
        (DESIGN_WIDTH * frameSize.height) / frameSize.width,
      );
      // 顶部和底部各吸收一半的额外高度，过长屏幕上限制位移幅度。
      this.verticalSpread = Math.min(
        200,
        (this.viewportHeight - DESIGN_HEIGHT) / 2,
      );
      const visibleSize = view.getVisibleSize();
      const safeArea = sys.getSafeAreaRect(false);
      const safeTop = Math.max(
        0,
        visibleSize.height - safeArea.y - safeArea.height,
      );
      const safeBottom = Math.max(0, safeArea.y);
      this.topSpread = 120 + Math.max(0, this.verticalSpread - safeTop - 18);
      this.bottomSpread = Math.max(0, this.verticalSpread - safeBottom - 18);
    }
    this.node.children.slice().forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (child) => {
        if (child.name !== 'Camera') {
          child.destroy();
        }
      },
    );
    this.buildShell();
    this.setupAudio();
    this.progressLabel.string = '正在载入食材…';
    this.loadIngredientImages(
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        void this.initializePlayer();
      },
    );
    cocosGame.on(Game.EVENT_SHOW, this.resumePlayerDay, this);
  }

  /**
   * 释放事件监听与音频。
   */
  onDestroy(): void {
    this.wechatSharing.dispose();
    this.unbindGameClubEntry();
    this.releasePageBackdrop();
    this.node.off(Node.EventType.TOUCH_START, this.startBgmIfReady, this);
    this.bgmSource?.stop();
    this.effectSource?.stop();
    cocosGame.off(Game.EVENT_SHOW, this.resumePlayerDay, this);
    this.unschedule(this.flushPlayerSave);
  }

  /**
   * 加载地区数据、连接云档案并恢复当前对局。
   */
  protected async initializePlayer(): Promise<void> {
    const regions = await new Promise<RegionNode[]>(
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ (resolve) => {
        resources.load(
          'data/regions',
          JsonAsset,
          /**
           * 在资源加载完成后更新有效节点或处理失败。
           */ (error, asset) => {
            if (error || !asset) {
              resolve([]);
              return;
            }
            resolve(asset.json as RegionNode[]);
          },
        );
      },
    );
    if (!this.node.isValid) {
      return;
    }
    if (!regions.length) {
      this.loadLevel(0, false);
      this.showToast('地区数据加载失败，请重新打开游戏', '#A24A3C');
      return;
    }
    this.playerService = new PlayerService(regions, sys.localStorage);
    this.playerService.onChange =
      /**
       * 处理 onChange 对应的事件。
       */ () => {
        if (!this.node.isValid) {
          return;
        }
        this.profileButtonLabel.string = '我的';
        if (this.achievementNotificationsReady) {
          const entries = achievementEntries(this.playerService!.state).filter(
            /**
             * 按条件筛选或判断条目：item.unlocked。
             */ (item) => item.unlocked,
          );
          const newlyUnlocked =
            this.achievementOwner === this.playerService!.playerId
              ? entries.filter(
                  /**
                   * 按条件筛选或判断条目：!this.knownAchievements.has(item.id)。
                   */ (item) => !this.knownAchievements.has(item.id),
                )
              : [];
          this.achievementOwner = this.playerService!.playerId;
          this.knownAchievements = new Set(
            entries.map(
              /**
               * 将当前条目转换为后续处理所需的值。
               */ (item) => item.id,
            ),
          );
          if (newlyUnlocked.length) {
            this.showToast(
              '成就达成：' +
                String(newlyUnlocked[0].title) +
                '' +
                String(
                  newlyUnlocked.length > 1
                    ? ` 等${newlyUnlocked.length}项`
                    : '',
                ) +
                '',
              '#B64B31',
            );
          }
        }
      };
    await this.playerService.syncAtStartup();
    if (!this.node.isValid) {
      return;
    }
    this.knownAchievements = new Set(
      unlockedAchievementIds(this.playerService.state),
    );
    this.achievementOwner = this.playerService.playerId;
    this.achievementNotificationsReady = true;
    const newDay = this.playerService.beginDailySession();
    const saved = this.resumeGameSave(this.playerService.state.save);
    if (saved) {
      this.restoreGame(saved);
    } else {
      this.loadLevel(0);
      if (newDay) {
        this.showToast('新的一天，从第一关开始', '#D86A3B');
      }
    }
    this.schedule(this.flushPlayerSave, PLAYER_UPLOAD_INTERVAL);
  }

  /**
   * 立即提交待同步的玩家存档。
   */
  protected flushPlayerSave(): void {
    if (!this.manualPlayerSync) void this.playerService?.flush(true);
  }

  protected async retryPlayerCloud(): Promise<void> {
    const service = this.playerService;
    if (!service || this.manualPlayerSync || (this.locked && !this.gameEnded)) return;
    const owner = service.playerId;
    const before = JSON.stringify([service.state.save, service.cashout.assisted]);
    const wasLocked = this.locked;
    const runId = this.runId;
    this.manualPlayerSync = true;
    this.locked = true;
    try {
      await service.retryCloudSync();
    } catch (error) {
      console.warn('[HotPot] Manual progress sync failed', error);
      return;
    } finally {
      this.manualPlayerSync = false;
      if (this.runId === runId) this.locked = wasLocked;
    }
    if (!this.node.isValid || !service.playerId
      || (owner === service.playerId
        && before === JSON.stringify([service.state.save, service.cashout.assisted]))) return;
    this.dismissPlayerMenu('PlayerOverlay');
    const saved = this.resumeGameSave(service.state.save);
    if (saved) this.restoreGame(saved);
    else this.loadLevel(0);
  }

  protected resumeGameSave(standard: GameSave | null): GameSave | null {
    return standard;
  }

  /**
   * 从后台返回时处理跨日重置和界面恢复。
   */
  protected resumePlayerDay(): void {
    if (!this.playerService || !this.levelData) {
      return;
    }
    if (this.playerService.beginDailySession()) {
      this.discardPageStylePreview();
      for (const name of [
        'PlayerOverlay',
        'RegionOverlay',
        'RegionConfirmOverlay',
        'StyleOverlay',
        'CollectionOverlay',
        'CollectionDetailOverlay',
        'BackdoorOverlay',
      ])
        this.dismissPlayerMenu(name);
      this.loadLevel(0);
      this.showToast('新的一天，从第一关开始', '#D86A3B');
    }
  }

  /**
   * 把当前棋盘和道具状态写入玩家存档。
   */
  protected checkpointGame(): void {
    if (!this.playerService
      || !this.levelData ||
      this.restoringSave ||
      (this.locked && !this.gameEnded)) {
      return;
    }
    const save = this.captureGameSave();
    try {
      this.saveGameCheckpoint(save);
    } catch {
      this.showToast('当前进度未能保存，请重试', '#A24A3C');
    }
  }

  protected captureGameSave(): GameSave {
    return {
      ...(this.runId ? {runId: this.runId} : {}),
      version: 1,
      boardVersion: BOARD_VERSION,
      levelIndex: this.levelIndex,
      ...(this.levelData.layoutSeed === undefined
        ? {}
        : {layoutSeed: this.levelData.layoutSeed}),
      ...(this.levelData.ingredientSeed === undefined
        ? {}
        : {ingredientSeed: this.levelData.ingredientSeed}),
      ...(this.levelData.ingredientPoolVersion === undefined
        ? {} : {ingredientPoolVersion: this.levelData.ingredientPoolVersion}),
      types: this.levelData.tiles.map(
        /**
         * 将当前条目转换为后续处理所需的值。
         */ (tile) => tile.type,
      ),
      removedIds: this.levelData.tiles
        .filter(
          /**
           * 按条件筛选或判断条目：tile.removed。
           */ (tile) => tile.removed,
        )
        .map(
          /**
           * 将当前条目转换为后续处理所需的值。
           */ (tile) => tile.id,
        ),
      tray: this.tray.slice(),
      reserve: this.reserve.slice(),
      reviveUsed: this.reviveUsed,
      rewardedMilestones: this.rewardedMilestones,
      toolUses: {...this.toolUses},
      lastMove: this.lastMoveSnapshot ? clone(this.lastMoveSnapshot) : null,
      status: this.gameEnded ? this.lastResult : 'playing',
    };
  }

  protected saveGameCheckpoint(save: GameSave): void {
    this.playerService?.setSave(save);
  }

  /**
   * 根据存档恢复棋盘、托盘和关卡状态。
   */
  protected restoreGame(save: GameSave): void {
    const restored = restoreLevel(save);
    if (!this.isInventoryAssisted() && shouldUpgradeUnstartedLevelThree(save)) {
      this.loadLevel(2, true, createLevel(2, undefined, save.layoutSeed,
        save.ingredientSeed || 0, save.ingredientPoolVersion || 1));
      return;
    }
    this.restoringSave = true;
    try {
      this.loadLevel(save.levelIndex, false, restored);
      this.runId = save.runId;
      this.levelData = restored;
      this.tray = save.tray.slice();
      this.reserve = save.reserve.slice();
      this.reviveUsed = save.reviveUsed;
      this.rewardedMilestones = save.rewardedMilestones;
      this.toolUses = {...save.toolUses};
      this.lastMoveSnapshot = save.lastMove ? clone(save.lastMove) : null;
      this.renderTray();
      this.renderReserve();
      this.updateProgress();
      this.updateToolButtons();
      if (save.status !== 'playing') {
        this.endGame(save.status === 'won');
      }
    } finally {
      this.restoringSave = false;
    }
  }

  /**
   * 判断是否已有玩家相关弹窗。
   */
  protected hasPlayerMenu(): boolean {
    return [
      'PlayerOverlay',
      'RegionOverlay',
      'CollectionOverlay',
      'CollectionDetailOverlay',
      'BackdoorOverlay',
      'StyleOverlay',
    ].some(
      /**
       * 按条件筛选或判断条目：!!this.node?.getChildByName?.(name)。
       */ (name) => !!this.node?.getChildByName?.(name),
    );
  }
  /** Subclasses release the currently loaded background on teardown. */
  protected discardPageStylePreview(): void {}
  protected releasePageBackdrop(): void {}
  protected isInventoryAssisted(): boolean { return false; }
  /**
   * 配置背景音乐和音效播放源。
   */
  protected abstract setupAudio(): void;

  /**
   * 在资源准备完成后启动背景音乐。
   */
  protected abstract startBgmIfReady(): void;

  /**
   * 加载食材图片并通知调用者。
   */
  protected abstract loadIngredientImages(done: () => void): void;

  /**
   * 构建游戏主界面。
   */
  protected abstract buildShell(): void;

  /**
   * 加载指定关卡并按需记录存档。
   */
  protected abstract loadLevel(
    index: number,
    persist?: boolean,
    restored?: LevelData,
  ): void;

  /**
   * 根据托盘数据绘制食材节点。
   */
  protected abstract renderTray(): void;

  /**
   * 根据寄存数据绘制食材节点。
   */
  protected abstract renderReserve(): void;

  /**
   * 更新进度和奖励提示。
   */
  protected abstract updateProgress(): void;

  /**
   * 发放已达到的热锅奖励。
   */
  protected abstract grantBoilRewards(): string;

  /**
   * 创建对应道具的按钮。
   */
  protected abstract makeToolButton(
    type: ToolType,
    position: Vec3,
    fill: string,
    callback: () => void,
  ): Node;

  /**
   * 更新道具按钮的次数与状态。
   */
  protected abstract updateToolButtons(): void;

  /**
   * 撤销上一步取牌。
   */
  protected abstract useUndoTool(): void;

  /**
   * 移除一组同类牌。
   */
  protected abstract useBombTool(): void;

  /**
   * 重新分布剩余食材。
   */
  protected abstract useShuffleTool(): void;

  /**
   * 依据当前棋盘重建牌节点。
   */
  protected abstract rebuildBoardTiles(): void;

  /**
   * 显示临时文字提示。
   */
  protected abstract showToast(message: string, textColor: string): void;

  /**
   * 显示重新开始确认框。
   */
  protected abstract showRestartConfirmation(): void;

  /**
   * 关闭重新开始确认框。
   */
  protected abstract dismissRestartConfirmation(): void;

  /**
   * 结算胜利或失败。
   */
  protected abstract endGame(won: boolean): void;

  /**
   * 关闭当前结果弹窗。
   */
  protected abstract dismissOverlay(): void;

  /**
   * 关闭指定玩家菜单。
   */
  protected abstract dismissPlayerMenu(name: string): void;

  /**
   * 显示结果弹窗的徽章。
   */
  protected abstract addModalEmblem(
    panel: Node,
    won: boolean,
    position: Vec3,
    size: number,
  ): void;

  /**
   * 打开玩家资料页。
   */
  protected abstract showPlayerProfile(): void;

  /**
   * 打开食材图鉴或成就页。
   */
  protected abstract showCollection(
    tab?: 'ingredients' | 'achievements',
    entry?: {
      headingTaps: number; ingredientTaps: number;
      collectionHeadingTaps: number; collectionIngredientTaps: number;
    },
  ): void;

  /**
   * 绘制失败弹窗。
   */
  protected abstract drawFailurePanel(panel: Node): void;

  /**
   * 重开当前关卡。
   */
  protected abstract restartLevel(): void;

  /**
   * 进入下一关。
   */
  protected abstract nextLevel(): void;
}
