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

import {regionPath} from '../data/PlayerData';
import {getPageTheme} from '../data/PageTheme';

import {
  DESIGN_WIDTH,
  drawCloseButton,
  drawLacquerPanel,
  drawLacquerButton,
  drawRoundRect,
  makeButton,
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
    if (name === 'PlayerOverlay') this.unbindGameClubEntry();
    const overlay = this.node.getChildByName(name);
    overlay?.removeFromParent();
    overlay?.destroy();
    this.menuReturnActions.delete(name);
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
    const theme = getPageTheme();
    const rim = new Node('PotRim');
    emblem.addChild(rim);
    rim.setPosition(0, -size * .04);
    drawRoundRect(rim, size * .94, size * .22, size * .11,
      theme.tileFace, theme.edge, 3);
    const types: Array<'shrimp' | 'corn' | 'beef' | 'vegetable' | 'mushroom'> =
      ['shrimp', 'corn', 'beef', 'vegetable', 'mushroom'];
    const count = won ? Math.min(5, this.levelIndex + 3) : 3;
    for (let i = 0; i < count; i++) {
      const food = new Node('CelebrationFood_' + i);
      emblem.addChild(food);
      food.setPosition((i - (count - 1) / 2) * size * .16,
        size * (.12 + (i % 2) * .12));
      this.addIngredientImage(food, types[i], false, size * .44, size * .44);
    }
    const bowl = new Node('PotBowl');
    emblem.addChild(bowl);
    bowl.setPosition(0, -size * .19);
    drawRoundRect(bowl, size * .86, size * .27, size * .1,
      theme.accent, theme.edge, 3);
    makeLabel(bowl, won ? '开席' : '再试一次', 27,
      theme.onAccent, Vec3.ZERO, size * .7, 42);
  }

  /**
   * 展示玩家档案和地区。
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
    drawRoundRect(headerDivider, contentWidth, theme.id === 8 ? 1.5 : 3, 0, outline);
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
    if (theme.id === 8) {
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
    makeButton(panel, '我的成就', new Vec3(-137, -132),
      248, 88, '#A3613B', () => open(() => this.showCollection('achievements')));
    const rankingButton = makeButton(panel, '地域排行榜', new Vec3(137, -132),
      248, 88, '#B88261', () => open(() => this.showRegionPicker([], true)));
    drawLacquerButton(rankingButton, 248, 88, 'cream', true);
    const divider = new Node('ProfileFooterDivider');
    panel.addChild(divider);
    divider.setPosition(0, -212);
    drawRoundRect(divider, contentWidth, theme.id === 8 ? 1.5 : 3, 0, outline);
    makeButton(panel, '继续游戏', new Vec3(0, -284),
      contentWidth, 88, '#A3613B', () => open(() => {}));
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
