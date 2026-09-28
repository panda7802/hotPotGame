import {
    _decorator,
    AudioClip,
    AudioSource,
    BlockInputEvents,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Rect,
    ResolutionPolicy,
    resources,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    sys,
    UIOpacity,
    UITransform,
    Vec3,
    view,
} from 'cc';
import {createLevel, getIngredient, INGREDIENTS, IngredientType, LevelData, LEVELS, TileData,} from '../data/GameData';

const {ccclass} = _decorator;
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1520;
const TILE_WIDTH = 92 * 1.2;
const TILE_HEIGHT = 76 * 1.2;
const TILE_IMAGE_WIDTH = 88 * 1.2;
const TILE_IMAGE_HEIGHT = 68 * 1.2;
const EIGHT_ROW_TILE_SCALE = 0.82;
const TRAY_IMAGE_WIDTH = 78 * 1.2;
const TRAY_IMAGE_HEIGHT = 62 * 1.2;
const TRAY_SPACING = 99;
const TRAY_START_X = -3 * TRAY_SPACING;
const IMAGE_CROP_X = 0.04;
const IMAGE_CROP_Y = 0.06;
type GameAudio = 'bgm' | 'match' | 'win' | 'lose';
type ToolType = 'undo' | 'remove' | 'shuffle';

interface MoveSnapshot {
    tray: IngredientType[];
    removedIds: string[];
}

function hex(value: string): Color {
    return new Color().fromHEX(value);
}

function transform(node: Node, width = 0, height = 0): UITransform {
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setContentSize(width, height);
    return ui;
}

function opacity(node: Node, value = 255): UIOpacity {
    const component = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    component.opacity = value;
    return component;
}

function drawRoundRect(node: Node, width: number, height: number, radius: number,
                       fill: string, stroke?: string, lineWidth = 2): Graphics {
    transform(node, width, height);
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = hex(fill);
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (stroke) {
        graphics.strokeColor = hex(stroke);
        graphics.lineWidth = lineWidth;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.stroke();
    }
    return graphics;
}

function makeLabel(parent: Node, text: string, fontSize: number, textColor: string,
                   position: Vec3, width = 0, height = 0, wrap = false): Label {
    const node = new Node('Label');
    parent.addChild(node);
    node.setPosition(position);
    if (width > 0) transform(node, width, height || Math.round(fontSize * 1.25));
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.enableWrapText = wrap;
    label.color = hex(textColor);
    if (width > 0) label.overflow = Label.Overflow.SHRINK;
    return label;
}

function makeButton(parent: Node, text: string, position: Vec3, width: number, height: number,
                    fill: string, callback: () => void): Node {
    const node = new Node(`Button_${text}`);
    parent.addChild(node);
    node.setPosition(position);
    drawRoundRect(node, width, height, 20, fill, '#8F2F22', 4);
    makeLabel(node, text, 30, '#FFF8E7', new Vec3(0, 1), width - 18, height - 12);
    node.on(Node.EventType.TOUCH_START, () => {
        tween(node).stop();
        tween(node).to(0.07, {scale: new Vec3(0.94, 0.94, 1)}).start();
    });
    node.on(Node.EventType.TOUCH_END, () => {
        tween(node).stop();
        tween(node).to(0.08, {scale: Vec3.ONE}).start();
        callback();
    });
    node.on(Node.EventType.TOUCH_CANCEL, () => {
        tween(node).stop();
        tween(node).to(0.08, {scale: Vec3.ONE}).start();
    });
    return node;
}

@ccclass('HotPotGame')
export class HotPotGame extends Component {
    private levelIndex = 0;
    private levelData!: LevelData;
    private tray: IngredientType[] = [];
    private tileNodes = new Map<string, Node>();
    private locked = false;
    private gameEnded = false;
    private combo = 0;
    private ingredientFrames = new Map<IngredientType, SpriteFrame>();
    private audioClips = new Map<GameAudio, AudioClip>();
    private bgmSource!: AudioSource;
    private effectSource!: AudioSource;
    private soundEnabled = true;
    private soundButtonLabel!: Label;

    private board!: Node;
    private trayNode!: Node;
    private toolBar!: Node;
    private foodTransitionLayer!: Node;
    private levelLabel!: Label;
    private progressLabel!: Label;
    private toastLabel!: Label;
    private toolButtons = new Map<ToolType, Node>();
    private toolUses: Record<ToolType, number> = {undo: 0, remove: 0, shuffle: 0};
    private lastMoveSnapshot: MoveSnapshot | null = null;
    private viewportHeight = DESIGN_HEIGHT;
    private verticalSpread = 0;
    private topSpread = 120;
    private bottomSpread = 0;

    onLoad(): void {
        const frameSize = view.getFrameSize();
        // 较短的屏幕完整显示加高后的界面，避免八行图片或底部按钮被裁掉。
        const policy = frameSize.width > 0 && frameSize.height / frameSize.width < DESIGN_HEIGHT / DESIGN_WIDTH
            ? ResolutionPolicy.SHOW_ALL : ResolutionPolicy.FIXED_WIDTH;
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, policy);
        if (frameSize.width > 0 && frameSize.height > 0) {
            this.viewportHeight = Math.max(
                DESIGN_HEIGHT,
                DESIGN_WIDTH * frameSize.height / frameSize.width,
            );
            // 顶部和底部各吸收一半的额外高度，过长屏幕上限制位移幅度。
            this.verticalSpread = Math.min(200, (this.viewportHeight - DESIGN_HEIGHT) / 2);
            const visibleSize = view.getVisibleSize();
            const safeArea = sys.getSafeAreaRect(false);
            const safeTop = Math.max(0, visibleSize.height - safeArea.y - safeArea.height);
            const safeBottom = Math.max(0, safeArea.y);
            this.topSpread = 120 + Math.max(0, this.verticalSpread - safeTop - 18);
            this.bottomSpread = Math.max(0, this.verticalSpread - safeBottom - 18);
        }
        this.node.children.slice().forEach((child) => {
            if (child.name !== 'Camera') child.destroy();
        });
        this.buildShell();
        this.setupAudio();
        this.loadPlaceholderImages(() => this.loadLevel(0));
    }

    onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_START, this.startBgmIfReady, this);
        this.bgmSource?.stop();
        this.effectSource?.stop();
    }

    private setupAudio(): void {
        const bgmNode = new Node('BgmAudio');
        this.node.addChild(bgmNode);
        this.bgmSource = bgmNode.addComponent(AudioSource);
        this.bgmSource.loop = true;
        this.bgmSource.volume = 0.3;

        const effectNode = new Node('EffectAudio');
        this.node.addChild(effectNode);
        this.effectSource = effectNode.addComponent(AudioSource);
        this.effectSource.volume = 1;

        this.node.on(Node.EventType.TOUCH_START, this.startBgmIfReady, this);

        const audioAssets: Array<{ key: GameAudio; path: string }> = [
            {key: 'bgm', path: 'audio/bgm'},
            {key: 'match', path: 'audio/match'},
            {key: 'win', path: 'audio/win'},
            {key: 'lose', path: 'audio/lose'},
        ];
        audioAssets.forEach(({key, path}) => {
            resources.load(path, AudioClip, (error, clip) => {
                if (error || !clip) {
                    console.error(`[HotPotGame] 无法加载音频：${path}`, error);
                    return;
                }
                this.audioClips.set(key, clip);
                if (key === 'bgm') this.bgmSource.clip = clip;
            });
        });
    }

    private startBgmIfReady(): void {
        if (!this.soundEnabled || !this.bgmSource?.clip || this.bgmSource.playing) return;
        this.bgmSource.play();
    }

    private toggleSound(): void {
        this.soundEnabled = !this.soundEnabled;
        this.soundButtonLabel.string = this.soundEnabled ? '声音：开' : '声音：关';
        this.effectSource.volume = this.soundEnabled ? 1 : 0;
        if (this.soundEnabled) this.startBgmIfReady();
        else {
            this.bgmSource.pause();
            this.effectSource.stop();
        }
    }

    private playEffect(key: Exclude<GameAudio, 'bgm'>, volume: number): void {
        if (!this.soundEnabled) return;
        const clip = this.audioClips.get(key);
        if (clip) {
            // 使用可停止的音源，关闭声音时也能立即停止当前音效。
            this.effectSource.stop();
            this.effectSource.clip = clip;
            this.effectSource.volume = volume;
            this.effectSource.play();
        }
    }

    private loadPlaceholderImages(done: () => void): void {
        const imageTypes: IngredientType[] = INGREDIENTS.map((ingredient) => ingredient.id);
        let pending = imageTypes.length;
        imageTypes.forEach((type) => {
            resources.load(`ingredients/${type}/texture`, Texture2D, (error, texture) => {
                if (!error && texture) {
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    if (texture.width > 0 && texture.height > 0) {
                        const cropX = Math.round(texture.width * IMAGE_CROP_X);
                        const cropY = Math.round(texture.height * IMAGE_CROP_Y);
                        frame.rect = new Rect(
                            cropX,
                            cropY,
                            texture.width - cropX * 2,
                            texture.height - cropY * 2,
                        );
                    }
                    this.ingredientFrames.set(type, frame);
                } else {
                    console.error(`[HotPotGame] 无法加载食材图片：${type}`, error);
                }
                pending -= 1;
                if (pending === 0) done();
            });
        });
    }

    private buildShell(): void {
        const background = new Node('WarmBackground');
        this.node.addChild(background);
        drawRoundRect(background, DESIGN_WIDTH + 40, this.viewportHeight + 40, 0, '#FFF0D4');
        this.drawPageDecorations(background);
        this.loadIllustratedBackdrop(background);

        const topGlow = new Node('TopGlow');
        this.node.addChild(topGlow);
        topGlow.setPosition(0, 535 + this.topSpread);
        drawRoundRect(topGlow, DESIGN_WIDTH + 40, 270, 0, '#D94A32');
        opacity(topGlow, 138);
        this.drawHeaderDecorations(topGlow);

        makeLabel(this.node, '火锅叠叠消', 52, '#81271D', new Vec3(3, 570 + this.topSpread), 500, 70);
        makeLabel(this.node, '火锅叠叠消', 52, '#FFF3CF', new Vec3(0, 576 + this.topSpread), 500, 70);
        this.levelLabel = makeLabel(this.node, '', 27, '#FFEFC1', new Vec3(0, 505 + this.topSpread), 440, 44);
        makeButton(this.node, '‹', new Vec3(-292, 508 + this.topSpread), 72, 66, '#F47B49', () => this.previousLevel());
        makeButton(this.node, '›', new Vec3(292, 508 + this.topSpread), 72, 66, '#F47B49', () => this.nextLevel());

        const rulePill = new Node('RulePill');
        this.node.addChild(rulePill);
        rulePill.setPosition(0, 432 + this.topSpread);
        drawRoundRect(rulePill, 640, 64, 30, '#FFF9EA', '#E16A43', 3);
        this.progressLabel = makeLabel(rulePill, '', 23, '#963A26', Vec3.ZERO, 600, 44);

        this.board = new Node('Board');
        this.node.addChild(this.board);
        // 棋盘向下扩展，同时保持顶部与关卡信息条约 30px 的视觉间隔。
        this.board.setPosition(0, -48 + this.topSpread);
        transform(this.board, 680, 830);

        const boardBack = new Node('BoardBack');
        this.board.addChild(boardBack);
        drawRoundRect(boardBack, 688, 840, 40, '#FFF7E7', '#EBA05E', 5);
        const insetFrame = new Node('BoardInsetFrame');
        boardBack.addChild(insetFrame);
        transform(insetFrame, 660, 820);
        const insetGraphics = insetFrame.addComponent(Graphics);
        insetGraphics.strokeColor = hex('#F7CE91');
        insetGraphics.lineWidth = 3;
        insetGraphics.roundRect(-330, -410, 660, 820, 31);
        insetGraphics.stroke();

        this.trayNode = new Node('Tray');
        this.node.addChild(this.trayNode);
        this.trayNode.setPosition(0, -415);
        drawRoundRect(this.trayNode, 704, 120, 24, '#9D4729', '#71311F', 5);

        this.toolBar = new Node('ToolBar');
        this.node.addChild(this.toolBar);
        this.toolBar.setPosition(0, -515);
        this.toolButtons.set('undo', this.makeToolButton('undo', new Vec3(-180, 0),
            '#D47745', () => this.useUndoTool()));
        this.toolButtons.set('remove', this.makeToolButton('remove', Vec3.ZERO,
            '#B76645', () => this.useRemoveTool()));
        this.toolButtons.set('shuffle', this.makeToolButton('shuffle', new Vec3(180, 0),
            '#C98A3F', () => this.useShuffleTool()));
        this.toolBar.active = false;

        this.toastLabel = makeLabel(this.node, '', 30, '#FFFFFF', new Vec3(0, -248), 570, 48);
        opacity(this.toastLabel.node, 0);
        makeButton(this.node, '重新开始', new Vec3(-130, -590 - this.bottomSpread), 240, 76, '#ED4A32',
            () => this.showRestartConfirmation());
        const soundButton = makeButton(this.node, '声音：开', new Vec3(150, -590 - this.bottomSpread),
            220, 76, '#B88261', () => this.toggleSound());
        this.soundButtonLabel = soundButton.getChildByName('Label')!.getComponent(Label)!;

        // 移动中的食物牌统一放在最后创建的顶层容器，避免被棋盘、托盘和按钮边框遮挡。
        this.foodTransitionLayer = new Node('FoodTransitionLayer');
        this.node.addChild(this.foodTransitionLayer);
        transform(this.foodTransitionLayer, DESIGN_WIDTH, this.viewportHeight);
    }

    /** 加载经过压缩的静态插画背景和右下角独立火锅。 */
    private loadIllustratedBackdrop(parent: Node): void {
        resources.load('backgrounds/hotpot-bg/texture', Texture2D, (error, texture) => {
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
        });

        resources.load('backgrounds/hotpot-corner/texture', Texture2D, (error, texture) => {
            if (error || !texture || !parent.isValid) {
                console.error('[HotPotGame] 无法加载右下角火锅', error);
                return;
            }
            const frame = new SpriteFrame();
            frame.texture = texture;
            const hotpot = new Node('CornerHotpot');
            parent.addChild(hotpot);
            hotpot.setPosition(235, -505 - this.verticalSpread);
            transform(hotpot, 470, 470);
            const sprite = hotpot.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            opacity(hotpot, 246);
        });
    }

    /** 加载最终模板对应的棋盘插画，失败时仍保留代码绘制的备用火锅。 */
    private loadBoardIllustration(parent: Node, fallbackHotpot: Node): void {
        resources.load('backgrounds/hotpot-board/texture', Texture2D, (error, texture) => {
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
            if (fallbackPattern) fallbackPattern.active = false;
        });
    }

    /** 页面底部的桌面曲线、花椒和闪光，都保持很低的对比度。 */
    private drawPageDecorations(parent: Node): void {
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

    /** 参考图中顶部的流动火焰纹理和金色闪光。 */
    private drawHeaderDecorations(parent: Node): void {
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

        const sparkle = (x: number, y: number, size: number): void => {
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

    /** 在棋盘背景上画低透明度的火锅线稿，保留主题感但不干扰食材图片。 */
    private drawHotpotPattern(parent: Node): void {
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

    private loadLevel(index: number): void {
        this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
        this.levelData = createLevel(this.levelIndex);
        this.tray = [];
        this.tileNodes.clear();
        this.locked = false;
        this.gameEnded = false;
        this.combo = 0;
        this.lastMoveSnapshot = null;
        const toolsEnabled = this.levelIndex >= 2;
        this.toolUses = toolsEnabled ? {undo: 1, remove: 1, shuffle: 1} : {undo: 0, remove: 0, shuffle: 0};
        this.toolBar.active = toolsEnabled;
        this.updateToolButtons();
        this.effectSource?.stop();
        this.dismissOverlay();
        this.dismissRestartConfirmation();
        this.board.children.slice().forEach((child) => {
            if (child.name.startsWith('Tile_')) child.destroy();
        });
        this.foodTransitionLayer.children.slice().forEach((child) => child.destroy());
        this.levelLabel.string = `第 ${this.levelData.config.level} / 10 关  ·  ${this.levelData.config.title}`;
        this.levelData.tiles.forEach((tile) => this.createTileNode(tile));
        this.refreshTileStates();
        this.renderTray();
        this.updateProgress();
        this.showToast('看清叠层，别让托盘塞满！', '#8A4B34');
    }

    private createTileNode(tile: TileData): void {
        const node = new Node(`Tile_${tile.id}`);
        this.board.addChild(node);
        node.setPosition(tile.x, tile.y, tile.layer);
        const tileScale = this.levelData.config.rows === 8 ? EIGHT_ROW_TILE_SCALE : 1;
        node.setScale(tileScale, tileScale, 1);
        transform(node, TILE_WIDTH, TILE_HEIGHT);
        node.on(Node.EventType.TOUCH_END, () => this.onTileClicked(tile));
        this.tileNodes.set(tile.id, node);
    }

    private drawTile(node: Node, type: IngredientType, blocked: boolean): void {
        node.children.slice().forEach((child) => child.destroy());
        const ingredient = getIngredient(type);
        const graphics = drawRoundRect(node, TILE_WIDTH, TILE_HEIGHT, 13,
            blocked ? '#B99A79' : '#FFF9E9', blocked ? '#806D59' : '#D98556', blocked ? 2 : 4);
        if (this.ingredientFrames.has(type)) {
            const imageScale = this.levelIndex >= 2 ? 1.2 : 1;
            this.addIngredientImage(node, type, blocked,
                TILE_IMAGE_WIDTH * imageScale, TILE_IMAGE_HEIGHT * imageScale);
        } else {
            makeLabel(node, '?', 34, blocked ? '#6F6255' : ingredient.dark, Vec3.ZERO, 60, 54);
        }
        opacity(node, blocked ? 172 : 255);
    }

    private addIngredientImage(parent: Node, type: IngredientType, blocked: boolean,
                               width: number, height: number): void {
        const frame = this.ingredientFrames.get(type);
        if (!frame) return;
        const image = new Node('IngredientImage');
        parent.addChild(image);
        transform(image, width * 1.15, height * 1.15);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        sprite.color = blocked ? hex('#B2A28F') : Color.WHITE;
    }

    private findTile(id: string): TileData | undefined {
        return this.levelData.tiles.find((tile) => tile.id === id);
    }

    private isTileSelectable(tile: TileData): boolean {
        if (tile.removed) return false;
        return !tile.blockedBy.some((id) => {
            const blocker = this.findTile(id);
            return blocker && !blocker.removed;
        });
    }

    private refreshTileStates(): void {
        this.levelData.tiles.forEach((tile) => {
            if (tile.removed) return;
            const node = this.tileNodes.get(tile.id);
            if (!node) return;
            const selectable = this.isTileSelectable(tile);
            if ((node as Node & { selectableState?: boolean }).selectableState !== selectable) {
                (node as Node & { selectableState?: boolean }).selectableState = selectable;
                this.drawTile(node, tile.type, !selectable);
            }
        });
    }

    private onTileClicked(tile: TileData): void {
        if (this.locked || this.gameEnded || tile.removed) return;
        const node = this.tileNodes.get(tile.id);
        if (!node) return;
        if (!this.isTileSelectable(tile)) {
            const start = node.position.clone();
            tween(node).to(0.04, {position: new Vec3(start.x + 5, start.y, start.z)})
                .to(0.04, {position: new Vec3(start.x - 5, start.y, start.z)})
                .to(0.04, {position: start}).start();
            this.showToast('这张牌还被上层压着', '#A24A3C');
            return;
        }

        this.lastMoveSnapshot = {
            tray: this.tray.slice(),
            removedIds: this.levelData.tiles.filter((item) => item.removed).map((item) => item.id),
        };
        this.locked = true;
        tile.removed = true;
        const targetIndex = this.insertIntoTray(tile.type);
        const targetX = TRAY_START_X + Math.min(targetIndex, 6) * TRAY_SPACING;
        const trayUI = this.trayNode.getComponent(UITransform)!;
        const boardUI = this.board.getComponent(UITransform)!;
        const transitionUI = this.foodTransitionLayer.getComponent(UITransform)!;
        const startWorld = boardUI.convertToWorldSpaceAR(node.position);
        const targetWorld = trayUI.convertToWorldSpaceAR(new Vec3(targetX, 0));

        // 脱离棋盘并保持屏幕位置不变；此后整段移动轨迹都处于界面最上层。
        node.setParent(this.foodTransitionLayer);
        node.setPosition(transitionUI.convertToNodeSpaceAR(startWorld));
        node.setSiblingIndex(this.foodTransitionLayer.children.length - 1);
        const targetLocal = transitionUI.convertToNodeSpaceAR(targetWorld);
        const startScale = node.scale.clone();
        tween(node).to(0.08, {
            scale: new Vec3(startScale.x * 0.9, startScale.y * 0.9, 1),
        }).to(0.2, {
            position: targetLocal,
            scale: new Vec3(startScale.x * 0.72, startScale.y * 0.72, 1),
        }, {easing: 'cubicOut'})
            .call(() => {
                node.destroy();
                this.refreshTileStates();
                this.resolveTray();
            }).start();
        this.updateProgress();
    }

    private insertIntoTray(type: IngredientType): number {
        let insertAt = this.tray.length;
        for (let i = this.tray.length - 1; i >= 0; i -= 1) {
            if (this.tray[i] === type) {
                insertAt = i + 1;
                break;
            }
        }
        this.tray.splice(insertAt, 0, type);
        return insertAt;
    }

    private resolveTray(): void {
        this.renderTray();
        const matchStart = this.findAdjacentMatch();
        if (matchStart >= 0) {
            this.combo += 1;
            this.animateMatch(matchStart);
        } else if (this.remainingTiles() === 0) {
            this.endGame(true);
        } else if (this.tray.length >= this.levelData.config.traySize) {
            this.endGame(false);
        } else {
            this.combo = 0;
            this.locked = false;
        }
    }

    /** 返回第一组三个连续同类食材的起始下标；没有则返回 -1。 */
    private findAdjacentMatch(): number {
        for (let i = 0; i <= this.tray.length - 3; i += 1) {
            if (this.tray[i] === this.tray[i + 1] && this.tray[i] === this.tray[i + 2]) return i;
        }
        return -1;
    }

    private animateMatch(matchStart: number): void {
        this.playEffect('match', 0.82);
        const trayItems = this.trayNode.children.filter((child) => child.name.startsWith('TrayItem_'));
        const matching = trayItems.slice(matchStart, matchStart + 3);
        matching.forEach((item) => {
            const start = item.position.clone();
            tween(item)
                .to(0.08, {scale: new Vec3(1.12, 0.78, 1)})
                .to(0.18, {
                    scale: new Vec3(1.20, 1.20, 1),
                }, {easing: 'backOut'})
                .delay(0.08)
                .to(0.22, {
                    scale: new Vec3(0.02, 0.02, 1),
                }, {easing: 'cubicIn'})
                .start();
            tween(opacity(item))
                .delay(0.34)
                .to(0.22, {opacity: 0})
                .start();
            this.createTrayMatchBurst(start.x);
        });

        // 与消除同时开始：直接移动右侧的真实食材节点，不创建副本、不保留原图。
        trayItems.slice(matchStart + 3, this.tray.length).forEach((item, followerOffset) => {
            const trayIndex = matchStart + 3 + followerOffset;
            const targetX = TRAY_START_X + (trayIndex - 3) * TRAY_SPACING;
            tween(item)
                .to(0.78, {
                    position: new Vec3(targetX, 0),
                    scale: Vec3.ONE,
                }, {easing: 'sineInOut'})
                .start();
        });
        this.showToast(`${this.combo > 1 ? `连消 x${this.combo}  ` : ''}+30`, '#D64A36');
        this.scheduleOnce(() => {
            this.tray.splice(matchStart, 3);
            this.renderTray();
            if (this.remainingTiles() === 0) this.endGame(true);
            else this.locked = false;
        }, 0.82);
    }

    /** 星芒从每张牌的原位向四周散开，三个节点沿同一时间轴同步消除。 */
    private createTrayMatchBurst(centerX: number): void {
        const colors = ['#FFD66B', '#FF8A52', '#FFF1B8'];
        for (let i = 0; i < 16; i += 1) {
            const particle = new Node(`MatchParticle_${i}`);
            this.trayNode.addChild(particle);
            particle.setPosition(centerX, 0);
            transform(particle, 22, 22);
            const graphics = particle.addComponent(Graphics);
            graphics.fillColor = hex(colors[i % colors.length]);
            const radius = i % 3 === 0 ? 13 : 8;
            for (let point = 0; point < 8; point += 1) {
                const angle = Math.PI * point / 4;
                const length = point % 2 === 0 ? radius : radius * 0.3;
                const x = Math.cos(angle) * length;
                const y = Math.sin(angle) * length;
                if (point === 0) graphics.moveTo(x, y);
                else graphics.lineTo(x, y);
            }
            graphics.close();
            graphics.fill();

            const angle = Math.PI * 2 * i / 16;
            const distance = 80 + (i % 4) * 18;
            particle.setScale(0, 0, 1);
            tween(particle)
                .delay(0.26)
                .set({scale: Vec3.ONE})
                .to(0.5, {
                    position: new Vec3(
                        Math.max(-340, Math.min(340, centerX + Math.cos(angle) * distance)),
                        Math.sin(angle) * distance,
                    ),
                    scale: new Vec3(0.12, 0.12, 1),
                    angle: i % 2 === 0 ? 150 : -150,
                }, {easing: 'quadOut'})
                .call(() => particle.destroy())
                .start();
            tween(opacity(particle))
                .delay(0.4)
                .to(0.36, {opacity: 0})
                .start();
        }
    }

    private renderTray(): void {
        // destroy 在帧末才生效，先移出托盘，确保消除动画只选中本次创建的三个节点。
        this.trayNode.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        // 第一层只绘制固定槽位，补位时边框保持不动。
        for (let i = 0; i < this.levelData.config.traySize; i += 1) {
            const slot = new Node(`TraySlot_${i}`);
            this.trayNode.addChild(slot);
            slot.setPosition(TRAY_START_X + i * TRAY_SPACING, 0);
            drawRoundRect(slot, 82 * 1.2, 84 * 1.2, 15, '#FFF4E5', '#7B3927', 2);
        }

        // 第二层放真实食材节点；全部位于固定槽位之上，并可直接执行左移动画。
        for (let i = 0; i < this.tray.length; i += 1) {
            const type = this.tray[i];
            const item = new Node(`TrayItem_${i}`);
            this.trayNode.addChild(item);
            item.setPosition(TRAY_START_X + i * TRAY_SPACING, 0);
            transform(item, 82 * 1.2, 84 * 1.2);
            (item as Node & { trayType?: IngredientType }).trayType = type;
            const ingredient = getIngredient(type);
            if (this.ingredientFrames.has(type)) {
                this.addIngredientImage(item, type, false, TRAY_IMAGE_WIDTH, TRAY_IMAGE_HEIGHT);
            } else {
                makeLabel(item, '?', 32, ingredient.dark, Vec3.ZERO, 56, 48);
            }
        }
    }

    private remainingTiles(): number {
        return this.levelData.tiles.filter((tile) => !tile.removed).length;
    }

    private updateProgress(): void {
        const open = this.levelData.tiles.filter((tile) => this.isTileSelectable(tile)).length;
        this.progressLabel.string = `剩余食材 ${this.remainingTiles()} / ${this.levelData.total}    当前可拿 ${open} 张`;
    }

    private makeToolButton(type: ToolType, position: Vec3, fill: string, callback: () => void): Node {
        const button = makeButton(this.toolBar, '', position, 150, 58, fill, callback);
        button.name = `Tool_${type}`;
        const icon = new Node('ToolIcon');
        button.addChild(icon);
        icon.setPosition(-8, 0);
        transform(icon, 64, 44);
        const g = icon.addComponent(Graphics);
        g.strokeColor = hex('#FFF8E7');
        g.lineWidth = 4;
        const arrow = (x: number, y: number, direction: number): void => {
            g.moveTo(x - direction * 10, y + 9);
            g.lineTo(x, y);
            g.lineTo(x - direction * 10, y - 9);
        };
        if (type === 'undo') {
            // 回转箭头。
            g.moveTo(-24, 10);
            g.lineTo(5, 10);
            g.bezierCurveTo(29, 10, 29, -16, 5, -16);
            g.lineTo(-3, -16);
            arrow(-24, 10, -1);
        } else if (type === 'remove') {
            // 方块从托盘向外移出的箭头。
            g.roundRect(-27, -5, 20, 22, 4);
            g.moveTo(-29, -10);
            g.lineTo(-29, -19);
            g.lineTo(3, -19);
            g.lineTo(3, -10);
            g.moveTo(1, 8);
            g.lineTo(29, 8);
            arrow(29, 8, 1);
        } else {
            // 两条交叉箭头。
            g.moveTo(-28, -14);
            g.bezierCurveTo(-4, -14, 2, 14, 27, 14);
            arrow(27, 14, 1);
            g.moveTo(-28, 14);
            g.bezierCurveTo(-4, 14, 2, -14, 27, -14);
            arrow(27, -14, 1);
        }
        g.stroke();
        const badge = new Node('UsesBadge');
        button.addChild(badge);
        badge.setPosition(52, 14);
        drawRoundRect(badge, 26, 26, 13, '#71311F');
        makeLabel(badge, '1', 18, '#FFF8E7', Vec3.ZERO, 24, 24);
        return button;
    }

    private updateToolButtons(): void {
        (['undo', 'remove', 'shuffle'] as ToolType[]).forEach((type) => {
            const button = this.toolButtons.get(type);
            if (!button) return;
            const label = button.getChildByName('UsesBadge')?.getChildByName('Label')?.getComponent(Label);
            if (label) label.string = String(this.toolUses[type]);
            opacity(button, this.toolUses[type] > 0 ? 255 : 105);
        });
    }

    private canUseTool(type: ToolType): boolean {
        if (this.levelIndex < 2) return false;
        if (this.locked || this.gameEnded) {
            this.showToast('请等待当前动画结束', '#8A4B34');
            return false;
        }
        if (this.toolUses[type] <= 0) {
            this.showToast('本关道具次数已用完', '#8A4B34');
            return false;
        }
        return true;
    }

    private useUndoTool(): void {
        if (!this.canUseTool('undo')) return;
        if (!this.lastMoveSnapshot) {
            this.showToast('还没有可以撤回的操作', '#8A4B34');
            return;
        }
        const removed = new Set(this.lastMoveSnapshot.removedIds);
        this.tray = this.lastMoveSnapshot.tray.slice();
        this.levelData.tiles.forEach((tile) => {
            tile.removed = removed.has(tile.id);
        });
        this.lastMoveSnapshot = null;
        this.toolUses.undo -= 1;
        this.rebuildBoardTiles();
        this.renderTray();
        this.updateProgress();
        this.updateToolButtons();
        this.showToast('已撤回上一次拿取', '#D86A3B');
    }

    private useRemoveTool(): void {
        if (!this.canUseTool('remove')) return;
        if (this.tray.length === 0) {
            this.showToast('托盘里还没有食材', '#8A4B34');
            return;
        }
        const removeCount = Math.min(3, this.tray.length);
        this.tray.splice(this.tray.length - removeCount, removeCount);
        this.lastMoveSnapshot = null;
        this.toolUses.remove -= 1;
        this.renderTray();
        this.updateToolButtons();
        this.showToast(`已移出 ${removeCount} 张食材`, '#D86A3B');
        if (this.remainingTiles() === 0 && this.tray.length === 0) this.endGame(true);
    }

    private useShuffleTool(): void {
        if (!this.canUseTool('shuffle')) return;
        const activeTiles = this.levelData.tiles.filter((tile) => !tile.removed);
        if (activeTiles.length < 2) {
            this.showToast('剩余食材不足，无法洗牌', '#8A4B34');
            return;
        }
        const types = activeTiles.map((tile) => tile.type);
        for (let i = types.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }
        activeTiles.forEach((tile, index) => {
            tile.type = types[index];
            const node = this.tileNodes.get(tile.id);
            if (!node) return;
            const selectable = this.isTileSelectable(tile);
            (node as Node & { selectableState?: boolean }).selectableState = selectable;
            this.drawTile(node, tile.type, !selectable);
        });
        this.lastMoveSnapshot = null;
        this.toolUses.shuffle -= 1;
        this.updateToolButtons();
        this.showToast('剩余食材已重新洗牌', '#D86A3B');
    }

    private rebuildBoardTiles(): void {
        this.board.children.slice().forEach((child) => {
            if (!child.name.startsWith('Tile_')) return;
            child.removeFromParent();
            child.destroy();
        });
        this.tileNodes.clear();
        this.levelData.tiles.forEach((tile) => {
            if (!tile.removed) this.createTileNode(tile);
        });
        this.refreshTileStates();
    }

    private showToast(message: string, textColor: string): void {
        this.toastLabel.string = message;
        this.toastLabel.color = hex(textColor);
        const alpha = opacity(this.toastLabel.node, 255);
        tween(alpha).stop();
        tween(alpha).delay(0.75).to(0.35, {opacity: 0}).start();
    }

    private showRestartConfirmation(): void {
        if (this.node.getChildByName('RestartConfirmOverlay')) return;
        const overlay = new Node('RestartConfirmOverlay');
        this.node.addChild(overlay);
        drawRoundRect(overlay, DESIGN_WIDTH, this.viewportHeight, 0, '#421B17');
        overlay.addComponent(BlockInputEvents);
        opacity(overlay, 220);

        const panel = new Node('RestartConfirmPanel');
        overlay.addChild(panel);
        drawRoundRect(panel, 560, 310, 38, '#FFF5DD', '#D8784C', 5);
        makeLabel(panel, '确认重新开始？', 42, '#8D3426', new Vec3(0, 82), 470, 62);
        makeLabel(panel, '本关当前进度将会清空', 24, '#8A6557', new Vec3(0, 25), 450, 42);
        makeButton(panel, '取消', new Vec3(-130, -80), 210, 66, '#B88A6B',
            () => this.dismissRestartConfirmation());
        makeButton(panel, '重新开始', new Vec3(130, -80), 230, 66, '#ED4A32', () => {
            this.dismissRestartConfirmation();
            this.restartLevel();
        });
        panel.setScale(0.82, 0.82, 1);
        tween(panel).to(0.18, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
    }

    private dismissRestartConfirmation(): void {
        this.node.getChildByName('RestartConfirmOverlay')?.destroy();
    }

    private endGame(won: boolean): void {
        this.locked = true;
        this.gameEnded = true;
        this.playEffect(won ? 'win' : 'lose', 0.72);
        const overlay = new Node('ResultOverlay');
        this.node.addChild(overlay);
        drawRoundRect(overlay, DESIGN_WIDTH, this.viewportHeight, 0, '#5A241E');
        overlay.addComponent(BlockInputEvents);
        const overlayAlpha = opacity(overlay, 0);
        tween(overlayAlpha).to(0.18, {opacity: 232}).start();

        const panel = new Node('ResultPanel');
        overlay.addChild(panel);
        panel.setPosition(0, 35);
        panel.setScale(0.75, 0.75, 1);
        drawRoundRect(panel, 570, 500, 42, '#FFF1D2', '#D3764E', 5);
        makeLabel(panel, won ? '锅底见啦！' : '托盘满啦！', 48,
            won ? '#C94836' : '#8B3D32', new Vec3(0, 150), 500, 70);
        makeLabel(panel, won ? '所有食材都已经下锅\n下一关会有更多叠层' :
            '还差一点就成功了\n试试连续拿取三个同类食材', 25, '#775145', new Vec3(0, 55), 480, 100, true);
        if (won && this.levelIndex < LEVELS.length - 1) {
            makeButton(panel, '下一关', new Vec3(0, -73), 300, 72, '#D75542', () => this.nextLevel());
        } else if (won) {
            makeButton(panel, '再玩一遍', new Vec3(0, -73), 300, 72, '#D75542', () => this.loadLevel(0));
        } else {
            makeButton(panel, '再试一次', new Vec3(0, -73), 300, 72, '#D75542', () => this.restartLevel());
        }
        makeButton(panel, '关闭', new Vec3(0, -165), 220, 60, '#B88261', () => this.dismissOverlay());
        tween(panel).to(0.2, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
    }

    private dismissOverlay(): void {
        this.node.getChildByName('ResultOverlay')?.destroy();
    }

    private restartLevel(): void {
        this.loadLevel(this.levelIndex);
    }

    private previousLevel(): void {
        if (this.levelIndex > 0) this.loadLevel(this.levelIndex - 1);
        else this.showToast('已经是第一关', '#8A4B34');
    }

    private nextLevel(): void {
        if (this.levelIndex < LEVELS.length - 1) this.loadLevel(this.levelIndex + 1);
        else this.showToast('已经是最后一关', '#8A4B34');
    }
}
