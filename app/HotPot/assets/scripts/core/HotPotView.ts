import {
  Graphics,
  Label,
  Node,
  resources,
  Sprite,
  SpriteFrame,
  sys,
  Texture2D,
  Vec3,
} from 'cc';

import {
  DESIGN_WIDTH,
  drawRoundRect,
  drawTavernPanel,
  hex,
  makeButton,
  makeLabel,
  opacity,
  refreshPageMaterials,
  styleTavernButton,
  transform,
} from './HotPotUi';

import {HotPotResources} from './HotPotResources';
import {
  getPageTheme, PageStyle, savePageStyle, setPageTheme,
} from '../data/PageTheme';

/**
 * HotPotView：主界面绘制。
 */
export abstract class HotPotView extends HotPotResources {
  private backdropRoot: Node | null = null;
  private backdropFrame: SpriteFrame | null = null;
  private backdropPath = '';
  private backdropSerial = 0;
  /**
   * 创建主界面、棋盘、托盘和工具栏。
   */
  protected buildShell(): void {
    const background = new Node('WarmBackground');
    this.node.addChild(background);
    this.backdropRoot = background;
    drawRoundRect(
      background,
      DESIGN_WIDTH + 40,
      this.viewportHeight + 40,
      0,
      '#FFF0D4',
    );
    this.loadIllustratedBackdrop(background);

    const title = makeLabel(
      this.node,
      '锅里捞啥',
      60,
      '#FFF3CF',
      new Vec3(0, 576 + this.topSpread),
      480,
      82,
    );
    title.isBold = true;
    title.node.name = 'GameTitle';
    this.loadTitleArtwork(title);
    const levelBar = new Node('LevelBar');
    this.node.addChild(levelBar);
    levelBar.setPosition(0, 486 + this.topSpread);
    drawRoundRect(levelBar, 648, 80, 18, '#F5DEB2');
    this.levelLabel = makeLabel(
      levelBar,
      '',
      27,
      '#63351F',
      new Vec3(-76, 0),
      420,
      40,
    );
    const profile = makeButton(
      levelBar,
      '我的',
      new Vec3(238, 0),
      120,
      56,
      '#A3613B',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.showPlayerProfile(),
    );
    this.profileButtonLabel = profile
      .getChildByName('Label')!
      .getComponent(Label)!;
    this.levelLabel.isBold = true;

    const rulePill = new Node('RulePill');
    this.node.addChild(rulePill);
    rulePill.setPosition(0, 400 + this.topSpread);
    transform(rulePill, 560, 60);
    this.progressLabel = makeLabel(
      rulePill,
      '',
      27,
      '#713B2C',
      Vec3.ZERO,
      500,
      36,
    );
    this.progressLabel.isBold = true;

    this.board = new Node('Board');
    this.node.addChild(this.board);
    // Give the padded header room while retaining clearance above the tray.
    this.board.setPosition(0, -62 + this.topSpread);
    transform(this.board, 680, 830);

    // 背景图本身已有纸纹棋盘，不再叠加浅色面板。

    this.trayNode = new Node('Tray');
    this.node.addChild(this.trayNode);
    this.trayNode.setPosition(0, -440);
    drawTavernPanel(this.trayNode, 688, 132, 'wood');

    this.reserveNode = new Node('ReviveReserve');
    this.node.addChild(this.reserveNode);
    this.reserveNode.setPosition(0, -320);
    this.reserveNode.active = false;

    this.toolBar = new Node('ToolBar');
    this.node.addChild(this.toolBar);
    this.toolBar.setPosition(0, -556);
    this.toolButtons.set(
      'undo',
      this.makeToolButton(
        'undo',
        new Vec3(-224, 0),
        '#875139',
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ () => this.useUndoTool(),
      ),
    );
    this.toolButtons.set(
      'bomb',
      this.makeToolButton(
        'bomb',
        Vec3.ZERO,
        '#875139',
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ () => this.useBombTool(),
      ),
    );
    this.toolButtons.set(
      'shuffle',
      this.makeToolButton(
        'shuffle',
        new Vec3(224, 0),
        '#875139',
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ () => this.useShuffleTool(),
      ),
    );
    this.toolBar.active = false;

    const toastBack = new Node('ToastBackground');
    this.node.addChild(toastBack);
    toastBack.setPosition(0, -619);
    drawRoundRect(toastBack, 650, 38, 12, '#FFF1D4');
    opacity(toastBack, 0);
    this.toastLabel = makeLabel(
      toastBack,
      '',
      24,
      '#713B2C',
      Vec3.ZERO,
      630,
      36,
    );
    opacity(this.toastLabel.node, 0);
    const restartButton = makeButton(
      this.node,
      '重新开始',
      new Vec3(-158, -676 - this.bottomSpread),
      292,
      82,
      '#C84730',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.showRestartConfirmation(),
    );
    styleTavernButton(restartButton, true);
    const soundButton = makeButton(
      this.node,
      '声音：开',
      new Vec3(158, -676 - this.bottomSpread),
      292,
      82,
      '#F2D7A3',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.toggleSound(),
    );
    styleTavernButton(soundButton, false);
    this.soundButtonLabel = soundButton
      .getChildByName('Label')!
      .getComponent(Label)!;

    // 移动中的食物牌统一放在最后创建的顶层容器，避免被棋盘、托盘和按钮边框遮挡。
    this.foodTransitionLayer = new Node('FoodTransitionLayer');
    this.node.addChild(this.foodTransitionLayer);
    transform(this.foodTransitionLayer, DESIGN_WIDTH, this.viewportHeight);
    this.repaintPageShell();
  }

  /** Switch appearance without replacing the board or touching a save. */
  protected selectPageStyle(style: PageStyle): void {
    this.previewPageStyle(style);
    const saved = savePageStyle(sys.localStorage, style);
    this.showToast(saved ? `已切换：${getPageTheme().name}`
      : '风格已应用，本机空间不足，暂时无法记住选择', '#477345');
  }

  /** Preview changes appearance only; persistence happens on Apply. */
  protected previewPageStyle(style: PageStyle): void {
    setPageTheme(style);
    refreshPageMaterials(this.node);
    this.repaintPageShell();
    this.updateToolButtons();
    if (this.backdropRoot) this.loadIllustratedBackdrop(this.backdropRoot);
  }

  /** Retain generous padding inside bars on both bright and dark scenery. */
  private repaintPageShell(): void {
    const theme = getPageTheme();
    const bar = this.node.getChildByName('LevelBar');
    const progress = this.node.getChildByName('RulePill');
    if (bar) {
      drawRoundRect(bar, 648, 80, 18, theme.panel, theme.edge, 2);
    }
    if (progress) {
      drawRoundRect(progress, 560, 60, 24,
        theme.progress, theme.edge + '66', 1);
    }
    const title = this.node.getChildByName('GameTitle')?.getComponent(Label);
    if (title) title.color = hex(theme.titleInk);
    this.levelLabel.color = hex(theme.ink);
    this.progressLabel.color = hex(theme.progressInk);
  }

  /**
   * D 方案透明字标；资源未就绪时保留可读的文字标题。
   */
  protected loadTitleArtwork(fallback: Label): void {
    // Render the approved title with exact Chinese and theme materials;
    // avoid a duplicate 380 KB title bitmap and stale colors after switching.
    const plate = new Node('TitlePlate');
    this.node.addChild(plate);
    plate.setSiblingIndex(fallback.node.getSiblingIndex());
    plate.setPosition(fallback.node.position);
    drawTavernPanel(plate, 540, 108, 'title');
    fallback.color = hex(getPageTheme().titleInk);
  }

    /** Load only the chosen background; stale async loads never win. */
  protected loadIllustratedBackdrop(parent: Node): void {
    const resourcePath = getPageTheme().background + '/texture';
    const serial = ++this.backdropSerial;
    resources.load(resourcePath, Texture2D, (error, texture) => {
      if (!parent.isValid) {
        resources.release(resourcePath, Texture2D);
        return;
      }
      if (serial !== this.backdropSerial) {
        if (resourcePath !== getPageTheme().background + '/texture') {
          resources.release(resourcePath, Texture2D);
        }
        return;
      }
      if (error || !texture) {
        console.warn('[HotPot UI] Background unavailable', resourcePath);
        return;
      }
      let image = parent.getChildByName('IllustratedBackdrop');
      if (!image) {
        image = new Node('IllustratedBackdrop');
        parent.addChild(image);
        image.setSiblingIndex(0);
      }
      transform(image, DESIGN_WIDTH, this.viewportHeight);
      const sprite = image.getComponent(Sprite) || image.addComponent(Sprite);
      const frame = new SpriteFrame();
      frame.texture = texture;
      const oldPath = this.backdropPath;
      const oldFrame = this.backdropFrame;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      this.backdropFrame = frame;
      this.backdropPath = resourcePath;
      oldFrame?.destroy();
      if (oldPath && oldPath !== resourcePath) {
        resources.release(oldPath, Texture2D);
      }
    });
  }

  protected releasePageBackdrop(): void {
    this.backdropSerial++;
    this.backdropFrame?.destroy();
    if (this.backdropPath) {
      resources.release(this.backdropPath, Texture2D);
    }
  }

/**
   * 页面底部的桌面曲线、花椒和闪光，都保持很低的对比度。
   */
  protected drawPageDecorations(parent: Node): void {
    const decor = new Node('PageDecorations');
    parent.addChild(decor);
    transform(decor, DESIGN_WIDTH, this.viewportHeight);
    const graphics = decor.addComponent(Graphics);
    graphics.strokeColor = hex('#E7A260');
    graphics.fillColor = hex('#E7A260');
    graphics.lineWidth = 5;

    graphics.moveTo(-360, -475);
    graphics.bezierCurveTo(-220, -535, -80, -500, 55, -555);
    graphics.bezierCurveTo(170, -603, 260, -578, 360, -620);
    graphics.stroke();
    graphics.circle(-292, -525, 7);
    graphics.circle(-266, -552, 5);
    graphics.circle(290, -500, 8);
    graphics.fill();
    opacity(decor, 55);
  }

  /**
   * 参考图中顶部的流动火焰纹理和金色闪光。
   */
  protected drawHeaderDecorations(parent: Node): void {
    const decor = new Node('HeaderDecorations');
    parent.addChild(decor);
    transform(decor, DESIGN_WIDTH, 270);
    const graphics = decor.addComponent(Graphics);
    graphics.strokeColor = hex('#FFB35F');
    graphics.fillColor = hex('#FFD681');
    graphics.lineWidth = 8;

    graphics.moveTo(-360, 82);
    graphics.bezierCurveTo(-285, 70, -260, 15, -202, 2);
    graphics.bezierCurveTo(-252, -12, -279, -52, -326, -62);
    graphics.moveTo(360, 92);
    graphics.bezierCurveTo(286, 72, 272, 24, 214, 4);
    graphics.bezierCurveTo(264, -13, 298, -48, 342, -58);
    graphics.stroke();

    const sparkle =
      /**
       * 处理 sparkle 对应的游戏逻辑。
       */ (x: number, y: number, size: number): void => {
        graphics.moveTo(x, y + size);
        graphics.lineTo(x + size * 0.32, y + size * 0.32);
        graphics.lineTo(x + size, y);
        graphics.lineTo(x + size * 0.32, y - size * 0.32);
        graphics.lineTo(x, y - size);
        graphics.lineTo(x - size * 0.32, y - size * 0.32);
        graphics.lineTo(x - size, y);
        graphics.lineTo(x - size * 0.32, y + size * 0.32);
        graphics.close();
      };
    sparkle(-250, 66, 13);
    sparkle(-218, 34, 9);
    sparkle(248, -12, 11);
    graphics.fill();
    opacity(decor, 116);
  }

  /**
   * 在棋盘背景上画低透明度的火锅线稿，保留主题感但不干扰食材图片。
   */
  protected drawHotpotPattern(parent: Node): void {
    const pattern = new Node('HotpotPattern');
    parent.addChild(pattern);
    transform(pattern, 680, 570);

    const graphics = pattern.addComponent(Graphics);
    graphics.strokeColor = hex('#E49A61');
    graphics.lineWidth = 4;

    // 汤泡。
    graphics.circle(-284, 58, 12);
    graphics.circle(-254, 34, 7);
    graphics.circle(284, 48, 14);
    graphics.circle(252, 22, 6);
    graphics.circle(-280, -84, 8);
    graphics.circle(278, -92, 10);

    // 左下角的辣椒轮廓。
    graphics.moveTo(-296, -174);
    graphics.bezierCurveTo(-265, -214, -218, -208, -202, -172);
    graphics.bezierCurveTo(-232, -184, -266, -174, -296, -174);
    graphics.moveTo(-296, -174);
    graphics.bezierCurveTo(-308, -164, -310, -149, -299, -140);

    // 右下角的筷子与菜叶线稿。
    graphics.moveTo(206, -220);
    graphics.lineTo(294, -144);
    graphics.moveTo(220, -232);
    graphics.lineTo(308, -156);
    graphics.moveTo(228, -120);
    graphics.bezierCurveTo(250, -148, 284, -144, 299, -113);
    graphics.bezierCurveTo(274, -119, 249, -103, 228, -120);
    graphics.moveTo(244, -119);
    graphics.lineTo(284, -127);

    graphics.stroke();
    opacity(pattern, 48);
  }
}
