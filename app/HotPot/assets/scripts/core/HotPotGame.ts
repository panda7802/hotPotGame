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
import {createLevel, getIngredient, IngredientType, LevelData, LEVELS, TileData,} from '../data/GameData';

const {ccclass} = _decorator;
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;
const TILE_WIDTH = 92;
const TILE_HEIGHT = 76;
const TILE_IMAGE_WIDTH = 88;
const TILE_IMAGE_HEIGHT = 68;
const TRAY_IMAGE_WIDTH = 78;
const TRAY_IMAGE_HEIGHT = 62;
const IMAGE_CROP_X = 0.04;
const IMAGE_CROP_Y = 0.06;
type GameAudio = 'bgm' | 'match' | 'win' | 'lose';

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

    private board!: Node;
    private trayNode!: Node;
    private levelLabel!: Label;
    private progressLabel!: Label;
    private toastLabel!: Label;
    private viewportHeight = DESIGN_HEIGHT;
    private verticalSpread = 0;
    private topSpread = 0;
    private boardSpread = 0;
    private bottomSpread = 0;

    onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        const frameSize = view.getFrameSize();
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
            this.topSpread = Math.max(0, this.verticalSpread - safeTop - 18);
            this.boardSpread = Math.max(this.topSpread, this.verticalSpread * 0.75);
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
        if (!this.bgmSource?.clip || this.bgmSource.playing) return;
        this.bgmSource.play();
    }

    private playEffect(key: Exclude<GameAudio, 'bgm'>, volume: number): void {
        const clip = this.audioClips.get(key);
        if (clip) this.effectSource.playOneShot(clip, volume);
    }

    private loadPlaceholderImages(done: () => void): void {
        const imageTypes: IngredientType[] = [
            'beef', 'shrimp', 'vegetable', 'mushroom', 'corn', 'fish',
        ];
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
        this.board.setPosition(0, 112 + this.boardSpread);
        transform(this.board, 680, 570);

        const boardBack = new Node('BoardBack');
        this.board.addChild(boardBack);
        drawRoundRect(boardBack, 688, 580, 40, '#FFF7E7', '#EBA05E', 5);
        const insetFrame = new Node('BoardInsetFrame');
        boardBack.addChild(insetFrame);
        transform(insetFrame, 660, 550);
        const insetGraphics = insetFrame.addComponent(Graphics);
        insetGraphics.strokeColor = hex('#F7CE91');
        insetGraphics.lineWidth = 3;
        insetGraphics.roundRect(-330, -275, 660, 550, 31);
        insetGraphics.stroke();
        this.drawHotpotPattern(boardBack);
        const hotpot = new Node('HotpotDecoration');
        boardBack.addChild(hotpot);
        hotpot.setPosition(0, -22);

        const leftHandle = new Node('LeftHandle');
        hotpot.addChild(leftHandle);
        leftHandle.setPosition(-165, 0);
        drawRoundRect(leftHandle, 64, 104, 25, '#E79661', '#C96A41', 6);
        const rightHandle = new Node('RightHandle');
        hotpot.addChild(rightHandle);
        rightHandle.setPosition(165, 0);
        drawRoundRect(rightHandle, 64, 104, 25, '#E79661', '#C96A41', 6);

        const pot = hotpot.addComponent(Graphics);
        pot.fillColor = hex('#EBA06A');
        pot.circle(0, 0, 176);
        pot.fill();
        pot.fillColor = hex('#C94A31');
        pot.circle(0, 0, 148);
        pot.fill();
        pot.strokeColor = hex('#FFD5A0');
        pot.lineWidth = 9;
        pot.circle(0, 0, 161);
        pot.stroke();
        opacity(hotpot, 76);
        this.loadBoardIllustration(boardBack, hotpot);

        const trayCard = new Node('TrayCard');
        this.node.addChild(trayCard);
        trayCard.setPosition(0, -338);
        drawRoundRect(trayCard, 700, 232, 34, '#FFF8E9', '#F2C88F', 3);

        makeLabel(this.node, '✦  托盘  ·  凑齐 3 个自动消除  ✦', 24, '#9B3D28', new Vec3(0, -249), 630, 40);
        this.trayNode = new Node('Tray');
        this.node.addChild(this.trayNode);
        this.trayNode.setPosition(0, -337);
        drawRoundRect(this.trayNode, 676, 116, 30, '#9D4729', '#71311F', 5);

        makeLabel(this.node, '只有发亮的食材牌可以拿取', 21, '#A35437', new Vec3(0, -421), 630, 36);
        this.toastLabel = makeLabel(this.node, '', 30, '#FFFFFF', new Vec3(0, -480), 570, 48);
        opacity(this.toastLabel.node, 0);
        makeButton(this.node, '重新开始', new Vec3(0, -565 - this.bottomSpread), 280, 76, '#ED4A32', () => this.restartLevel());
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
        this.effectSource?.stop();
        this.dismissOverlay();
        this.board.children.slice().forEach((child) => {
            if (child.name.startsWith('Tile_')) child.destroy();
        });
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
            this.addIngredientImage(node, type, blocked, TILE_IMAGE_WIDTH, TILE_IMAGE_HEIGHT);
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
        transform(image, width, height);
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

        this.locked = true;
        tile.removed = true;
        this.insertIntoTray(tile.type);
        const targetIndex = this.tray.lastIndexOf(tile.type);
        const targetX = -288 + Math.min(targetIndex, 6) * 96;
        const trayUI = this.trayNode.getComponent(UITransform)!;
        const boardUI = this.board.getComponent(UITransform)!;
        const world = trayUI.convertToWorldSpaceAR(new Vec3(targetX, 0));
        const local = boardUI.convertToNodeSpaceAR(world);
        node.setSiblingIndex(this.board.children.length - 1);
        tween(node).to(0.08, {scale: new Vec3(0.9, 0.9, 1)})
            .to(0.2, {position: local, scale: new Vec3(0.72, 0.72, 1)}, {easing: 'cubicOut'})
            .call(() => {
                node.destroy();
                this.refreshTileStates();
                this.resolveTray();
            }).start();
        this.updateProgress();
    }

    private insertIntoTray(type: IngredientType): void {
        let insertAt = this.tray.length;
        for (let i = this.tray.length - 1; i >= 0; i -= 1) {
            if (this.tray[i] === type) {
                insertAt = i + 1;
                break;
            }
        }
        this.tray.splice(insertAt, 0, type);
    }

    private resolveTray(): void {
        this.renderTray();
        const counts = new Map<IngredientType, number>();
        let matchType: IngredientType | null = null;
        this.tray.forEach((type) => {
            const count = (counts.get(type) || 0) + 1;
            counts.set(type, count);
            if (count >= 3) matchType = type;
        });
        if (matchType) {
            this.combo += 1;
            this.animateMatch(matchType);
        } else if (this.remainingTiles() === 0) {
            this.endGame(true);
        } else if (this.tray.length >= this.levelData.config.traySize) {
            this.endGame(false);
        } else {
            this.combo = 0;
            this.locked = false;
        }
    }

    private animateMatch(type: IngredientType): void {
        this.playEffect('match', 0.82);
        const matching = this.trayNode.children.filter((slot) => (slot as Node & {
            trayType?: IngredientType
        }).trayType === type);
        matching.slice(0, 3).forEach((slot) => {
            tween(slot).to(0.12, {scale: new Vec3(1.16, 1.16, 1)}).start();
            tween(opacity(slot)).to(0.25, {opacity: 0}).start();
        });
        this.showToast(`${this.combo > 1 ? `连消 x${this.combo}  ` : ''}+30`, '#D64A36');
        this.scheduleOnce(() => {
            let removed = 0;
            this.tray = this.tray.filter((item) => {
                if (item === type && removed < 3) {
                    removed += 1;
                    return false;
                }
                return true;
            });
            this.renderTray();
            if (this.remainingTiles() === 0) this.endGame(true);
            else this.locked = false;
        }, 0.28);
    }

    private renderTray(): void {
        this.trayNode.children.slice().forEach((child) => child.destroy());
        for (let i = 0; i < this.levelData.config.traySize; i += 1) {
            const slot = new Node(`TraySlot_${i}`);
            this.trayNode.addChild(slot);
            slot.setPosition(-288 + i * 96, 0);
            drawRoundRect(slot, 82, 84, 15, '#FFF4E5', '#7B3927', 2);
            if (this.tray[i]) {
                (slot as Node & { trayType?: IngredientType }).trayType = this.tray[i];
                const ingredient = getIngredient(this.tray[i]);
                if (this.ingredientFrames.has(this.tray[i])) {
                    this.addIngredientImage(slot, this.tray[i], false, TRAY_IMAGE_WIDTH, TRAY_IMAGE_HEIGHT);
                } else {
                    makeLabel(slot, '?', 32, ingredient.dark, Vec3.ZERO, 56, 48);
                }
            } else {
                makeLabel(slot, String(i + 1), 18, '#B78E68', Vec3.ZERO, 40, 24);
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

    private showToast(message: string, textColor: string): void {
        this.toastLabel.string = message;
        this.toastLabel.color = hex(textColor);
        const alpha = opacity(this.toastLabel.node, 255);
        tween(alpha).stop();
        tween(alpha).delay(0.75).to(0.35, {opacity: 0}).start();
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
            '还差一点就成功了\n试试优先凑成托盘里的两张牌', 25, '#775145', new Vec3(0, 55), 480, 100, true);
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
