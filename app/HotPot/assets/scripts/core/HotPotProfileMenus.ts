import {
  _decorator,
  BlockInputEvents,
  Label,
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
import {getPageTheme} from '../data/PageTheme';

import {
  DESIGN_WIDTH,
  drawCloseButton,
  drawLacquerPanel,
  drawLacquerButton,
  drawRoundRect,
  makeButton,
  makeBodyLabel,
  makeLabel,
  makePanelHeading,
  transform,
} from './HotPotUi';

import {HotPotAppearanceMenus} from './HotPotAppearanceMenus';

/**
 * HotPotProfileMenus：拆分后的前段场景行为。
 */
export abstract class HotPotProfileMenus extends HotPotAppearanceMenus {
  protected menuReturnActions = new Map<string, () => void>();
  /**
   * 关闭指定的玩家菜单。
   */
  protected dismissPlayerMenu(name: string): void {
    const overlay = this.node.getChildByName(name);
    overlay?.removeFromParent();
    overlay?.destroy();
    this.menuReturnActions.delete(name);
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
    drawLacquerPanel(panel, 650, height, true);
    const close = makeButton(
      panel,
      '×',
      new Vec3(name === 'PlayerOverlay' ? 239 : 244,
        name === 'PlayerOverlay' ? 284 : height / 2 - 98),
      64,
      64,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        if (name === 'PlayerOverlay'
          && this.playerService?.status === 'connecting') {
          return;
        }
        if (name === 'StyleOverlay') {
          this.cancelPageStyle();
          return;
        }
        const returnAction = this.menuReturnActions.get(name);
        this.dismissPlayerMenu(name);
        if (returnAction) { returnAction(); return; }
        if (name === 'CollectionDetailOverlay') {
          this.showCollection();
        } else if (name === 'CollectionOverlay' || name === 'RegionOverlay') {
          this.showPlayerProfile();
        }
      },
    );
    close.name = 'MenuClose';
    drawCloseButton(close);
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
    const panel = this.makePlayerMenu('PlayerOverlay', 760);
    if (!panel) {
      return;
    }
    const service = this.playerService!;
    void service.refreshRuntimeConfig();
    // Shared 522px content width leaves 64px gutters inside the 650px panel.
    // Keep 32px between body rows and separate the primary footer action.
    const contentWidth = 522;
    const theme = getPageTheme();
    const outline = theme.id === 9 ? theme.edge : theme.accent;
    makePanelHeading(panel, '我的小馆', 284, contentWidth - 48);
    const headerDivider = new Node('ProfileHeaderDivider');
    panel.addChild(headerDivider);
    headerDivider.setPosition(0, 242);
    drawRoundRect(headerDivider, contentWidth, theme.id === 7 ? 1.5 : 3, 0, outline);
    const card = new Node('RegionCard');
    panel.addChild(card);
    card.setPosition(0, 140);
    drawRoundRect(card, contentWidth, 152, 16, '#FFF5E3', outline, 3);
    const locationHeading = makeLabel(panel, '小馆所在地', 24, '#A3613B',
      new Vec3(-147, 180), 180, 34);
    const path = regionPath(service.regions, service.state.profile.regionCodes);
    const locationValue = makeLabel(panel, path.length ? path.map((item) => item.name).join(' / ')
      : '地区尚未选择', 24, '#775145',
      new Vec3(-94, 122), 286, 64, true);
    if (theme.id === 7) {
      locationHeading.horizontalAlign = Label.HorizontalAlign.LEFT;
      locationValue.horizontalAlign = Label.HorizontalAlign.LEFT;
    }
    const open = (action: () => void): void => {
      if (service.status === 'connecting') {
        return;
      }
      this.dismissPlayerMenu('PlayerOverlay');
      action();
    };
    const regionButton = makeButton(panel, '选择地区', new Vec3(163, 140),
      148, 72, '#B88261', () => open(() => this.showRegionPicker([])));
    drawLacquerButton(regionButton, 148, 72, 'cream', true);
    makeButton(panel, '食材图鉴', new Vec3(-137, -12),
      248, 88, '#A3613B', () => open(() => this.showCollection()));
    makeButton(panel, '页面风格', new Vec3(137, -12),
      248, 88, '#A3613B', () => open(() => this.showPageStyles()));
    const rankingButton = makeButton(panel, '地域排行榜', new Vec3(0, -132),
      contentWidth, 88, '#B88261', () => open(() => this.showRegionPicker([], true)));
    drawLacquerButton(rankingButton, contentWidth, 88, 'cream', true);
    const divider = new Node('ProfileFooterDivider');
    panel.addChild(divider);
    divider.setPosition(0, -212);
    drawRoundRect(divider, contentWidth, theme.id === 7 ? 1.5 : 3, 0, outline);
    makeButton(panel, '继续游戏', new Vec3(0, -284),
      contentWidth, 88, '#A3613B', () => open(() => {}));
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
    const reviewLayout = getPageTheme().id === 7;
    if (reviewLayout) makePanelHeading(panel, '账号已连接', 181, 420);
    else makeLabel(panel, '账号已连接', 42, '#8D3426', new Vec3(0, 181), 570, 60);
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
    makeBodyLabel(
      panel,
      `${savedSummary}\n${currentSummary}`,
      26,
      '#775145',
      new Vec3(0, 81),
      reviewLayout ? 522 : 590,
      110,
      true,
    );
    makeBodyLabel(
      panel,
      '选择要继续的进度，当前本机记录仍单独保留',
      22,
      '#94735D',
      new Vec3(0, -13),
      reviewLayout ? 522 : 590,
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
  protected makeCollectionScroll(panel: Node, height: number, offset = 0): Node {
    const viewport = new Node('CollectionViewport');
    panel.addChild(viewport);
    viewport.setPosition(0, -10);
    transform(viewport, 568, 648);
    viewport.addComponent(Mask);
    const content = new Node('CollectionContent');
    viewport.addChild(content);
    transform(content, 568, Math.max(648, height)).setAnchorPoint(0.5, 1);
    content.setPosition(0, 324 + Math.min(offset, Math.max(0, height - 648)));
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
