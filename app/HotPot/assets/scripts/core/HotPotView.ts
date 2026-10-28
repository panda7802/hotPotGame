import {
  Graphics,
  Label,
  Node,
  resources,
  Sprite,
  SpriteFrame,
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
  styleTavernButton,
  transform,
} from './HotPotUi';

import {HotPotResources} from './HotPotResources';

/**
 * HotPotView：主界面绘制。
 */
export abstract class HotPotView extends HotPotResources {
  /**
   * 创建主界面、棋盘、托盘和工具栏。
   */
  protected buildShell(): void {
    const background = new Node('WarmBackground');
    this.node.addChild(background);
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
    this.loadTitleArtwork(title);
    const levelBar = new Node('LevelBar');
    this.node.addChild(levelBar);
    levelBar.setPosition(0, 480 + this.topSpread);
    drawRoundRect(levelBar, 664, 72, 18, '#F5DEB2');
    this.levelLabel = makeLabel(
      levelBar,
      '',
      25,
      '#63351F',
      Vec3.ZERO,
      342,
      44,
    );
    makeButton(
      levelBar,
      '图鉴',
      new Vec3(-255, 0),
      124,
      58,
      '#A3613B',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.showCollection(),
    );
    const profile = makeButton(
      levelBar,
      '档案',
      new Vec3(255, 0),
      124,
      58,
      '#A3613B',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.showPlayerProfile(),
    );
    this.profileButtonLabel = profile
      .getChildByName('Label')!
      .getComponent(Label)!;

    const rulePill = new Node('RulePill');
    this.node.addChild(rulePill);
    rulePill.setPosition(0, 422 + this.topSpread);
    transform(rulePill, 640, 64);
    this.progressLabel = makeLabel(
      rulePill,
      '',
      26,
      '#713B2C',
      Vec3.ZERO,
      600,
      44,
    );

    this.board = new Node('Board');
    this.node.addChild(this.board);
    // 棋盘向下扩展，同时保持顶部与关卡信息条约 30px 的视觉间隔。
    this.board.setPosition(0, -36 + this.topSpread);
    transform(this.board, 680, 830);

    // 背景图本身已有纸纹棋盘，不再叠加浅色面板。

    this.trayNode = new Node('Tray');
    this.node.addChild(this.trayNode);
    this.trayNode.setPosition(0, -440);
    drawTavernPanel(this.trayNode, 688, 124, 'wood');

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
  }

  /**
   * D 方案透明字标；资源未就绪时保留可读的文字标题。
   */
  protected loadTitleArtwork(fallback: Label): void {
    resources.load(
      'backgrounds/title-d/texture',
      Texture2D,
      /**
       * 在资源加载完成后更新有效节点或处理失败。
       */ (error, texture) => {
        if (!fallback.node.isValid) {
          return;
        }
        if (error || !texture || texture.width <= 0 || texture.height <= 0) {
          console.warn('[HotPotGame] 标题图加载失败，保留文字标题', error);
          return;
        }
        const frame = new SpriteFrame();
        frame.texture = texture;
        const artwork = new Node('TitleArtwork');
        this.node.addChild(artwork);
        artwork.setSiblingIndex(fallback.node.getSiblingIndex());
        artwork.setPosition(fallback.node.position);
        const scale = Math.min(500 / texture.width, 132 / texture.height);
        transform(artwork, texture.width * scale, texture.height * scale);
        const sprite = artwork.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        fallback.node.active = false;
      },
    );
  }

  /**
   * 烟火小馆整页背景：红布顶棚、纸感棋盘与木桌。
   */
  protected loadIllustratedBackdrop(parent: Node): void {
    resources.load(
      'backgrounds/tavern-bg/texture',
      Texture2D,
      /**
       * 在资源加载完成后更新有效节点或处理失败。
       */ (error, texture) => {
        if (error || !texture || !parent.isValid) {
          console.error('[HotPotGame] 无法加载火锅背景', error);
          return;
        }
        const frame = new SpriteFrame();
        frame.texture = texture;
        const image = new Node('IllustratedBackdrop');
        parent.addChild(image);
        image.setSiblingIndex(0);
        transform(image, DESIGN_WIDTH, this.viewportHeight);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
      },
    );
  }

  /**
   * 加载最终模板对应的棋盘插画，失败时仍保留代码绘制的备用火锅。
   */
  protected loadBoardIllustration(parent: Node, fallbackHotpot: Node): void {
    resources.load(
      'backgrounds/hotpot-board/texture',
      Texture2D,
      /**
       * 在资源加载完成后更新有效节点或处理失败。
       */ (error, texture) => {
        if (error || !texture || !parent.isValid) {
          console.error('[HotPotGame] 无法加载棋盘火锅插画', error);
          return;
        }
        const frame = new SpriteFrame();
        frame.texture = texture;
        const image = new Node('IllustratedBoard');
        parent.addChild(image);
        image.setSiblingIndex(0);
        // 保持插画原始比例，新增的纵向空间由棋盘底色承接，避免火锅被拉成长椭圆。
        transform(image, 660, 550);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;

        fallbackHotpot.active = false;
        const fallbackPattern = parent.getChildByName('HotpotPattern');
        if (fallbackPattern) {
          fallbackPattern.active = false;
        }
      },
    );
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
