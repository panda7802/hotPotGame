import {
  _decorator,
  BlockInputEvents,
  Mask,
  Node,
  Rect,
  resources,
  ScrollView,
  Sprite,
  SpriteFrame,
  Texture2D,
  Vec3,
} from 'cc';

import {GameSave, regionPath} from '../data/PlayerData';

import {
  DESIGN_WIDTH,
  drawLacquerPanel,
  drawRoundRect,
  makeButton,
  makeLabel,
  makePanelHeading,
  transform,
} from './HotPotUi';

import {HotPotTools} from './HotPotTools';

/**
 * HotPotProfileMenus：拆分后的前段场景行为。
 */
export abstract class HotPotProfileMenus extends HotPotTools {
  /**
   * 关闭指定的玩家菜单。
   */
  protected dismissPlayerMenu(name: string): void {
    const overlay = this.node.getChildByName(name);
    overlay?.removeFromParent();
    overlay?.destroy();
    this.playerStatusLabel = null;
    this.playerSaveLabel = null;
  }

  /**
   * 创建通用玩家菜单面板。
   */
  protected makePlayerMenu(name: string, height: number): Node | null {
    if (!this.playerService
      || !this.levelData ||
      this.hasPlayerMenu() ||
      (this.locked && !this.gameEnded)) {
      return null;
    }
    const overlay = new Node(name);
    this.node.addChild(overlay);
    transform(overlay, DESIGN_WIDTH, this.viewportHeight);
    const scrim = new Node('ModalScrim');
    overlay.addChild(scrim);
    drawRoundRect(scrim, DESIGN_WIDTH, this.viewportHeight, 0, '#29150FAA');
    overlay.addComponent(BlockInputEvents);
    const panel = new Node('PlayerPanel');
    overlay.addChild(panel);
    drawLacquerPanel(panel, 650, height);
    const close = makeButton(
      panel,
      '×',
      new Vec3(272, height / 2 - 98),
      44,
      44,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        if (name === 'PlayerOverlay'
          && this.playerService?.status === 'connecting') {
          return;
        }
        this.dismissPlayerMenu(name);
      },
    );
    close.name = 'MenuClose';
    return panel;
  }

  /**
   * 为弹窗加载胜利或失败徽章。
   */
  protected addModalEmblem(
    panel: Node,
    won: boolean,
    position: Vec3,
    size: number,
  ): void {
    const emblem = new Node(won ? 'SuccessEmblem' : 'FailureEmblem');
    panel.addChild(emblem);
    emblem.setPosition(position);
    transform(emblem, size, size);
    const fallback = makeLabel(
      emblem,
      won ? '开席' : '满锅',
      46,
      '#A3613B',
      Vec3.ZERO,
      size,
      80,
    );
    if (!resources?.load) {
      return;
    }
    resources.load(
      'backgrounds/modal-emblems-c/texture',
      Texture2D,
      /**
       * 在资源加载完成后更新有效节点或处理失败。
       */ (error, texture) => {
        if (!emblem.isValid || error || !texture) {
          return;
        }
        const cell = Math.round(texture.width / 2);
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = new Rect(
          won ? 0 : cell,
          0,
          won ? cell : texture.width - cell,
          texture.height,
        );
        const sprite = emblem.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        fallback.node.active = false;
      },
    );
  }

  /**
   * 生成当前玩家存档的摘要文字。
   */
  protected playerSaveText(): string {
    const service = this.playerService!;
    const save = service.state.save;
    return save
      ? '第' +
          String(save.levelIndex + 1) +
          '关 · ' +
          String(save.removedIds.length) +
          '张已拿取' +
          ` · 云版本${service.revision}` +
          ''
      : '还没有存档';
  }

  /**
   * 展示玩家档案、地区和同步状态。
   */
  protected showPlayerProfile(): void {
    const panel = this.makePlayerMenu('PlayerOverlay', 1040);
    if (!panel) {
      return;
    }
    const service = this.playerService!;
    makePanelHeading(panel, '我的小馆档案', 420, 450);
    makeLabel(
      panel, '记录小馆身份，也为家乡添一份战绩', 22,
      '#94735D', new Vec3(0, 355), 510, 36,
    );
    const card =
      /**
       * 处理 card 对应的游戏逻辑。
       */ (name: string, y: number, height: number): void => {
        const node = new Node(name);
        panel.addChild(node);
        node.setPosition(0, y);
        drawRoundRect(node, 548, height, 16, '#FFF5E3', '#DEC498', 1);
      };
    card('IdentityCard', 270, 110);
    card('RegionCard', 123, 150);
    card('SaveCard', -55, 162);
    for (const [text, y] of [
      ['玩家身份', 298], ['小馆所在地', 174],
      ['云端存档', -6],
    ] as Array<[string, number]>) {
      makeLabel(panel, text, 20, '#A3613B', new Vec3(-157, y), 180, 30);
    }
    makeLabel(
      panel,
      service.playerId
        ? `玩家编号 ${service.playerId.slice(0, 8)} · 开发版`
        : '本机玩家 · 开发版',
      26,
      '#775145',
      new Vec3(0, 255),
      520,
      42,
    );
    const path = regionPath(service.regions, service.state.profile.regionCodes);
    makeLabel(
      panel,
      path.length
        ? path
            .map(
              /**
               * 将当前条目转换为后续处理所需的值。
               */ (item) => item.name,
            )
            .join(' / ')
        : '地区尚未选择',
      25,
      '#775145',
      new Vec3(-78, 113),
      320,
      76,
      true,
    );
    this.playerStatusLabel = makeLabel(
      panel,
      service.statusText,
      24,
      '#547344',
      new Vec3(0, -48),
      520,
      42,
    );
    this.playerSaveLabel = makeLabel(
      panel,
      this.playerSaveText(),
      23,
      '#94735D',
      new Vec3(0, -100),
      510,
      48,
      true,
    );
    makeButton(
      panel,
      '选择地区',
      new Vec3(185, 110),
      148,
      62,
      '#A3613B',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        if (service.status === 'connecting') {
          return;
        }
        this.dismissPlayerMenu('PlayerOverlay');
        this.showRegionPicker([]);
      },
    );
    makeButton(
      panel,
      service.isConflict
        ? '选择保留哪份存档'
        : service.playerId
          ? '同步存档'
          : '连接云端',
      new Vec3(0, -190),
      510,
      70,
      '#D75542',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        if (service.isConflict) {
          this.dismissPlayerMenu('PlayerOverlay');
          this.showSaveConflict();
          return;
        }
        if (service.playerId) {
          service.claimGuestWins();
          void service.flush();
          return;
        }
        // 重新连接期间阻止重复点击。身份确认后再让玩家决定当前局与账号存档。
        if (service.status === 'connecting') {
          return;
        }
        void service.initialize().then(
          /**
           * 处理异步任务完成或失败后的状态。
           */ () => {
            if (!this.node.isValid || !service.playerId) {
              return;
            }
            service.claimGuestWins();
            this.dismissPlayerMenu('PlayerOverlay');
            if (service.beginDailySession()) {
              this.loadLevel(0);
              this.showPlayerProfile();
              return;
            }
            const saved = service.state.save;
            if (saved) {
              this.showConnectedSaveChoice(saved);
            } else {
              this.loadLevel(0);
              this.showPlayerProfile();
            }
          },
        );
      },
    );
    makeLabel(
      panel,
      '每次操作后自动保存\n断网时先保留在本机',
      22,
      '#94735D',
      new Vec3(0, -350),
      550,
      56,
      true,
    );
    makeButton(
      panel, '云端地域排行榜',
      new Vec3(0, -274),
      510, 66, '#A3613B', () => {
        this.dismissPlayerMenu('PlayerOverlay');
        this.showRegionPicker([], true);
      },
    );
    makeButton(
      panel,
      '继续游戏',
      new Vec3(0, -427),
      510,
      66,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        if (service.status === 'connecting') {
          return;
        }
        this.dismissPlayerMenu('PlayerOverlay');
      },
    );
  }

  /**
   * 让玩家选择已连接云端时保留哪份对局。
   */
  protected showConnectedSaveChoice(saved: GameSave): void {
    const panel = this.makePlayerMenu('ConnectedSaveOverlay', 520);
    if (!panel) {
      return;
    }
    const service = this.playerService!;
    makeLabel(panel, '账号已连接', 42, '#8D3426', new Vec3(0, 181), 570, 60);
    const savedSummary =
      `账号存档：第${saved.levelIndex + 1}关 · ` +
      `${saved.removedIds.length}张已拿取`;
    const currentCount = this.levelData.tiles.filter(
      /**
       * 按条件筛选或判断条目：tile.removed。
       */ (tile) => tile.removed,
    ).length;
    const currentSummary =
      `当前这锅：第${this.levelIndex + 1}关 · ` + `${currentCount}张已拿取`;
    makeLabel(
      panel,
      `${savedSummary}\n${currentSummary}`,
      26,
      '#775145',
      new Vec3(0, 81),
      590,
      110,
      true,
    );
    makeLabel(
      panel,
      '选择要继续的进度，当前本机记录仍单独保留',
      22,
      '#94735D',
      new Vec3(0, -13),
      590,
      48,
      true,
    );
    const finish =
      /**
       * 处理 finish 对应的游戏逻辑。
       */ (): void => {
        if (service.isConflict) {
          this.showSaveConflict();
        } else {
          this.showPlayerProfile();
        }
      };
    makeButton(
      panel,
      '继续账号存档',
      new Vec3(0, -99),
      400,
      66,
      '#D75542',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissPlayerMenu('ConnectedSaveOverlay');
        this.restoreGame(saved);
        finish();
      },
    );
    makeButton(
      panel,
      '将当前这锅保存到账号',
      new Vec3(0, -186),
      450,
      66,
      '#A3613B',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissPlayerMenu('ConnectedSaveOverlay');
        this.checkpointGame();
        finish();
      },
    );
  }

  /**
   * 为图鉴创建可裁剪的滚动区域。
   */
  protected makeCollectionScroll(panel: Node, height: number): Node {
    const viewport = new Node('CollectionViewport');
    panel.addChild(viewport);
    viewport.setPosition(0, -28);
    transform(viewport, 568, 576);
    viewport.addComponent(Mask);
    const content = new Node('CollectionContent');
    viewport.addChild(content);
    transform(content, 568, Math.max(576, height)).setAnchorPoint(0.5, 1);
    content.setPosition(0, 288);
    const scroll = viewport.addComponent(ScrollView);
    scroll.content = content;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.elastic = false;
    scroll.inertia = true;
    scroll.cancelInnerEvents = true;
    return content;
  }

  /**
   * 确认图鉴所需的滚动组件可用。
   */
  protected scrollComponentsReady(): boolean {
    if (Mask && ScrollView) {
      return true;
    }
    console.warn(
      '[HotPot UI] Missing scroll components:' +
        ' enable Mask/UI and restart the editor' +
        ' preview.',
    );
    this.showToast('列表暂未就绪，请重新进入游戏', '#A24A3C');
    return false;
  }

  /**
   * 打开地区选择界面。
   */
  protected abstract showRegionPicker(
    codes: string[], leaderboard?: boolean,
  ): void;
}
