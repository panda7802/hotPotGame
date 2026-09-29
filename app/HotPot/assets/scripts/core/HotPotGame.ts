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
    sys,
    Texture2D,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    view,
} from 'cc';
import {
    createLevel,
    getIngredient,
    INGREDIENTS,
    IngredientType,
    LevelData,
    LEVELS,
    selectBombTargets,
    TileData,
} from '../data/GameData';

const {ccclass} = _decorator;
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1520;
const TILE_WIDTH = 92 * 1.2;
const TILE_HEIGHT = 76 * 1.2;
const TILE_IMAGE_WIDTH = 88 * 1.2;
const TILE_IMAGE_HEIGHT = TILE_HEIGHT - 4;
const EIGHT_ROW_TILE_SCALE = 0.82;
const TRAY_IMAGE_WIDTH = 80;
const TRAY_IMAGE_HEIGHT = 72;
const TRAY_SPACING = 94;
const TRAY_START_X = -3 * TRAY_SPACING;
const IMAGE_CROP_X = 0.04;
const IMAGE_CROP_Y = 0.06;
type GameAudio = 'bgm' | 'match' | 'win' | 'lose';
type ToolType = 'undo' | 'bomb' | 'shuffle';
const TOOL_NAMES: Record<ToolType, string> = {undo: '撤回', bomb: '炸', shuffle: '翻锅'};
const BOIL_STAGES = ['小火慢煮', '汤底渐热', '咕嘟冒泡', '香气四溢', '红汤翻滚', '热气腾腾', '满锅沸腾', '旺火盛宴', '收汁见底'];
// 图集按从左到右、从上到下排列；独立于关卡食材顺序。
const HANDPAINTED_TYPES: IngredientType[] = [
    'beef', 'shrimp', 'vegetable', 'mushroom', 'corn', 'fish', 'egg',
    'jzg', 'meetball', 'ou', 'tomato', 'toufu', 'ydf',
];

interface MoveSnapshot {
    tray: IngredientType[];
    reserve: IngredientType[];
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

/** A 方案的奶油色厚牌：阴影、浅棕侧边与干净牌面，保持原点击区域。 */
function drawFoodTile(node: Node, width: number, height: number, blocked = false): void {
    transform(node, width, height);
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    const layer = (offsetY: number, inset: number, fill: string, alpha = 255): void => {
        const color = hex(fill);
        color.a = alpha;
        graphics.fillColor = color;
        graphics.roundRect(-width / 2 + inset, -height / 2 + offsetY + inset,
            width - inset * 2, height - inset * 2, 12);
        graphics.fill();
    };
    layer(-7, 1, '#4B2B17', 28);
    layer(-4, 0, blocked ? '#665746' : '#B99A72');
    layer(0, 0, blocked ? '#756954' : '#D5BE99');
    layer(1, 1.5, blocked ? '#8C877B' : '#FFF5DF');
    // 顶边轻微提亮，不使用粗描边或整张白色背景。
    graphics.strokeColor = hex(blocked ? '#8C8B85' : '#FFFCF2');
    graphics.lineWidth = 1;
    graphics.moveTo(-width / 2 + 13, height / 2 - 2);
    graphics.lineTo(width / 2 - 13, height / 2 - 2);
    graphics.stroke();
}

/** 木框、凹槽和漆面按钮共用的层叠材质；纹理不经过文字区域。 */
function drawTavernPanel(node: Node, width: number, height: number,
                         style: 'wood' | 'slot' | 'red' | 'cream'): void {
    const palettes = {
        wood: ['#63331C', '#A86A35', '#E6B56C', '#B4773B'],
        slot: ['#B17A43', '#4E2918', '#6A3D23', '#784727'],
        red: ['#87321E', '#B43D23', '#F0AC68', '#CC4D2D'],
        cream: ['#9B6F3E', '#D6AF71', '#FFF2CB', '#F2D7A3'],
    };
    const colors = palettes[style];
    const g = drawRoundRect(node, width, height, 18, colors[0]);
    const layer = (inset: number, offsetY: number, fill: string): void => {
        g.fillColor = hex(fill);
        g.roundRect(-width / 2 + inset, -height / 2 + inset + offsetY,
            width - inset * 2, height - inset * 2, Math.max(7, 18 - inset));
        g.fill();
    };
    layer(2, 2, colors[1]);
    layer(5, 3, colors[2]);
    layer(7, 1, colors[3]);
    if (style === 'wood' || style === 'slot') {
        g.strokeColor = hex(style === 'wood' ? '#915927' : '#62351D');
        g.lineWidth = 1;
        for (let i = 0; i < 4; i += 1) {
            const y = -height / 2 + 13 + i * (height - 26) / 3;
            g.moveTo(-width / 2 + 12, y);
            g.bezierCurveTo(-width / 4, y + 2, width / 4, y - 2, width / 2 - 12, y);
        }
        g.stroke();
    } else {
        g.strokeColor = hex(style === 'red' ? '#F08758' : '#FFF6D9');
        g.lineWidth = 2;
        g.moveTo(-width / 2 + 23, height / 2 - 12);
        g.lineTo(width / 2 - 23, height / 2 - 12);
        g.stroke();
    }
}

function drawControlIcon(icon: Node, restart: boolean, enabled = true): void {
    const g = icon.getComponent(Graphics) || icon.addComponent(Graphics);
    g.clear();
    g.strokeColor = hex(restart ? '#FFF2D0' : '#6A3B20');
    g.fillColor = g.strokeColor;
    g.lineWidth = 5;
    if (restart) {
        g.moveTo(13, 9);
        g.bezierCurveTo(-4, 26, -25, 7, -12, -10);
        g.bezierCurveTo(-4, -20, 12, -16, 16, -5);
        g.stroke();
        g.moveTo(13, 9);
        g.lineTo(1, 10);
        g.lineTo(12, 21);
        g.close();
        g.fill();
    } else {
        g.moveTo(-15, -6);
        g.lineTo(-8, -6);
        g.lineTo(2, -15);
        g.lineTo(2, 15);
        g.lineTo(-8, 6);
        g.lineTo(-15, 6);
        g.close();
        g.fill();
        if (enabled) {
            g.moveTo(8, -8);
            g.bezierCurveTo(15, -3, 15, 3, 8, 8);
            g.moveTo(14, -14);
            g.bezierCurveTo(25, -6, 25, 6, 14, 14);
        } else {
            g.moveTo(9, -7);
            g.lineTo(21, 7);
            g.moveTo(9, 7);
            g.lineTo(21, -7);
        }
        g.stroke();
    }
}

function styleTavernButton(button: Node, restart: boolean): void {
    drawTavernPanel(button, 292, 82, restart ? 'red' : 'cream');
    const label = button.getChildByName('Label')!.getComponent(Label)!;
    label.node.setPosition(23, 1);
    transform(label.node, 212, 58);
    label.color = hex(restart ? '#FFF2D0' : '#6A3B20');
    label.isBold = true;
    const icon = new Node('ControlIcon');
    button.addChild(icon);
    icon.setPosition(-110, 1);
    transform(icon, 44, 44);
    drawControlIcon(icon, restart);
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
    drawRoundRect(node, width, height, 20, fill);
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
    private reserve: IngredientType[] = [];
    private reviveUsed = false;
    private rewardedMilestones = 0;
    private reserveNode!: Node;
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
    private toolUses: Record<ToolType, number> = {undo: 0, bomb: 0, shuffle: 0};
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
        this.loadIngredientImages(() => this.loadLevel(0));
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
        const soundIcon = this.soundButtonLabel.node.parent?.getChildByName('ControlIcon');
        if (soundIcon) drawControlIcon(soundIcon, false, this.soundEnabled);
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

    private loadIngredientImages(done: () => void): void {
        resources.load('ingredients/handpainted-atlas/texture', Texture2D, (error, texture) => {
            if (!this.node.isValid) return;
            if (error || !texture || texture.width !== texture.height || texture.width < 4) {
                console.warn('[HotPotGame] 手绘图集不可用，使用原食材图片', error);
                this.loadPlaceholderImages(done);
                return;
            }
            const cell = texture.width / 4;
            HANDPAINTED_TYPES.forEach((type, index) => {
                // 原图集的金针菇格不再使用，茶树菇由独立资源覆盖。
                if (type === 'jzg') return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                const column = index % 4;
                const row = Math.floor(index / 4);
                const left = Math.round(column * cell);
                const top = Math.round(row * cell);
                frame.rect = new Rect(left, top,
                    Math.round((column + 1) * cell) - left,
                    Math.round((row + 1) * cell) - top);
                this.ingredientFrames.set(type, frame);
            });
            resources.load('ingredients/jzg/texture', Texture2D, (mushroomError, mushroomTexture) => {
                if (!this.node.isValid) return;
                if (!mushroomError && mushroomTexture) {
                    const frame = new SpriteFrame();
                    frame.texture = mushroomTexture;
                    this.ingredientFrames.set('jzg', frame);
                } else {
                    console.error('[HotPotGame] 无法加载茶树菇图片', mushroomError);
                }
                done();
            });
        });
    }

    private loadPlaceholderImages(done: () => void): void {
        const imageTypes: IngredientType[] = INGREDIENTS.map((ingredient) => ingredient.id);
        let pending = imageTypes.length;
        imageTypes.forEach((type) => {
            resources.load(`ingredients/${type}/texture`, Texture2D, (error, texture) => {
                if (!error && texture) {
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    if (type !== 'jzg' && texture.width > 0 && texture.height > 0) {
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
        this.loadIllustratedBackdrop(background);

        const title = makeLabel(this.node, '锅里捞啥', 60, '#FFF3CF',
            new Vec3(0, 576 + this.topSpread), 480, 82);
        title.isBold = true;
        this.loadTitleArtwork(title);
        const levelBar = new Node('LevelBar');
        this.node.addChild(levelBar);
        levelBar.setPosition(0, 480 + this.topSpread);
        drawRoundRect(levelBar, 536, 58, 16, '#F5DEB2');
        this.levelLabel = makeLabel(levelBar, '', 27, '#63351F', Vec3.ZERO, 440, 44);

        const rulePill = new Node('RulePill');
        this.node.addChild(rulePill);
        rulePill.setPosition(0, 422 + this.topSpread);
        transform(rulePill, 640, 64);
        this.progressLabel = makeLabel(rulePill, '', 26, '#713B2C', Vec3.ZERO, 600, 44);

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
        this.toolButtons.set('undo', this.makeToolButton('undo', new Vec3(-224, 0),
            '#875139', () => this.useUndoTool()));
        this.toolButtons.set('bomb', this.makeToolButton('bomb', Vec3.ZERO,
            '#875139', () => this.useBombTool()));
        this.toolButtons.set('shuffle', this.makeToolButton('shuffle', new Vec3(224, 0),
            '#875139', () => this.useShuffleTool()));
        this.toolBar.active = false;

        const toastBack = new Node('ToastBackground');
        this.node.addChild(toastBack);
        toastBack.setPosition(0, -619);
        drawRoundRect(toastBack, 650, 38, 12, '#FFF1D4');
        opacity(toastBack, 0);
        this.toastLabel = makeLabel(toastBack, '', 24, '#713B2C', Vec3.ZERO, 630, 36);
        opacity(this.toastLabel.node, 0);
        const restartButton = makeButton(this.node, '重新开始', new Vec3(-158, -676 - this.bottomSpread), 292, 82, '#C84730',
            () => this.showRestartConfirmation());
        styleTavernButton(restartButton, true);
        const soundButton = makeButton(this.node, '声音：开', new Vec3(158, -676 - this.bottomSpread),
            292, 82, '#F2D7A3', () => this.toggleSound());
        styleTavernButton(soundButton, false);
        this.soundButtonLabel = soundButton.getChildByName('Label')!.getComponent(Label)!;

        // 移动中的食物牌统一放在最后创建的顶层容器，避免被棋盘、托盘和按钮边框遮挡。
        this.foodTransitionLayer = new Node('FoodTransitionLayer');
        this.node.addChild(this.foodTransitionLayer);
        transform(this.foodTransitionLayer, DESIGN_WIDTH, this.viewportHeight);
    }

    /** D 方案透明字标；资源未就绪时保留可读的文字标题。 */
    private loadTitleArtwork(fallback: Label): void {
        resources.load('backgrounds/title-d/texture', Texture2D, (error, texture) => {
            if (!fallback.node.isValid) return;
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
        });
    }

    /** 烟火小馆整页背景：红布顶棚、纸感棋盘与木桌。 */
    private loadIllustratedBackdrop(parent: Node): void {
        resources.load('backgrounds/tavern-bg/texture', Texture2D, (error, texture) => {
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
        this.clearMatchEffects();
        this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
        this.levelData = createLevel(this.levelIndex);
        this.tray = [];
        this.reserve = [];
        this.reviveUsed = false;
        this.rewardedMilestones = 0;
        this.renderReserve();
        this.tileNodes.clear();
        this.locked = false;
        this.gameEnded = false;
        this.combo = 0;
        this.lastMoveSnapshot = null;
        const toolsEnabled = this.levelIndex >= 1;
        this.toolUses = toolsEnabled ? {undo: 1, bomb: 1, shuffle: 1} : {undo: 0, bomb: 0, shuffle: 0};
        this.toolBar.active = toolsEnabled;
        this.updateToolButtons();
        this.effectSource?.stop();
        this.dismissOverlay();
        this.dismissRestartConfirmation();
        this.board.children.slice().forEach((child) => {
            if (child.name.startsWith('Tile_')) child.destroy();
        });
        this.foodTransitionLayer.children.slice().forEach((child) => child.destroy());
        this.levelLabel.string = `第 ${this.levelData.config.level} / ${LEVELS.length} 关  ·  ${this.levelData.config.title}`;
        this.levelData.tiles.forEach((tile) => this.createTileNode(tile));
        this.refreshTileStates();
        this.renderTray();
        this.updateProgress();
        // this.showToast('看清叠层，别让托盘塞满！', '#8A4B34');
    }

    private createTileNode(tile: TileData): void {
        const node = new Node(`Tile_${tile.id}`);
        this.board.addChild(node);
        node.setPosition(tile.x, tile.y, tile.layer);
        const tileScale = this.levelData.config.tileScale || (this.levelData.config.rows === 8 ? EIGHT_ROW_TILE_SCALE : 1);
        node.setScale(tileScale, tileScale, 1);
        transform(node, TILE_WIDTH, TILE_HEIGHT);
        node.on(Node.EventType.TOUCH_END, () => this.onTileClicked(tile));
        this.tileNodes.set(tile.id, node);
    }

    private drawTile(node: Node, type: IngredientType, blocked: boolean): void {
        node.children.slice().forEach((child) => child.destroy());
        const ingredient = getIngredient(type);
        drawFoodTile(node, TILE_WIDTH, TILE_HEIGHT, blocked);
        if (this.ingredientFrames.has(type)) {
            this.addIngredientImage(node, type, blocked,
                TILE_IMAGE_WIDTH, TILE_IMAGE_HEIGHT);
        } else {
            makeLabel(node, '?', 34, blocked ? '#6F6255' : ingredient.dark, Vec3.ZERO, 60, 54);
        }
        opacity(node, 255);
    }

    private addIngredientImage(parent: Node, type: IngredientType, blocked: boolean,
                               width: number, height: number): void {
        const frame = this.ingredientFrames.get(type);
        if (!frame) return;
        const image = new Node('IngredientImage');
        parent.addChild(image);
        // 按裁切后的资源比例等比适配，避免方形手绘图标被压扁。
        const scale = Math.min(width / frame.rect.width, height / frame.rect.height);
        transform(image, frame.rect.width * scale, frame.rect.height * scale);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        // 中性明暗保留食材本身的色相，避免全部染成黄褐色后难以辨认。
        sprite.color = blocked ? hex('#737373') : Color.WHITE;
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
            reserve: this.reserve.slice(),
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
        const movingLevel = this.levelData;
        tween(node).to(0.08, {
            scale: new Vec3(startScale.x * 0.9, startScale.y * 0.9, 1),
        }).to(0.2, {
            position: targetLocal,
            scale: new Vec3(startScale.x * 0.72, startScale.y * 0.72, 1),
        }, {easing: 'cubicOut'})
            .call(() => {
                node.destroy();
                if (this.levelData !== movingLevel) return;
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
        } else if (this.isBoardCleared()) {
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
        const effects = new Node('MatchEffects');
        this.trayNode.addChild(effects);
        // Commit the match before allowing another click. Animation nodes no
        // longer occupy slots and cannot modify a later tray or restarted game.
        this.tray.splice(matchStart, 3);
        matching.forEach((item) => {
            item.setParent(effects);
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
            this.createTrayMatchBurst(start.x, effects);
        });

        // 与消除同时开始：直接移动右侧的真实食材节点，不创建副本、不保留原图。
        trayItems.slice(matchStart + 3).forEach((item, followerOffset) => {
            const trayIndex = matchStart + 3 + followerOffset;
            const targetX = TRAY_START_X + (trayIndex - 3) * TRAY_SPACING;
            tween(item)
                .to(0.78, {
                    position: new Vec3(targetX, 0),
                    scale: Vec3.ONE,
                }, {easing: 'sineInOut'})
                .start();
        });
        const reward = this.grantBoilRewards();
        this.updateProgress();
        this.showToast(reward || `${this.combo > 1 ? `连消 x${this.combo}  ` : ''}+30`, '#D64A36');
        tween(effects).delay(0.82).call(() => effects.destroy()).start();
        if (this.isBoardCleared()) this.endGame(true);
        else this.locked = false;
    }

    private clearMatchEffects(): void {
        this.trayNode.children.slice().filter(child => child.name === 'MatchEffects').forEach(child => {
            child.removeFromParent();
            child.destroy();
        });
    }

    /** 星芒从每张牌的原位向四周散开，三个节点沿同一时间轴同步消除。 */
    private createTrayMatchBurst(centerX: number, parent: Node): void {
        const colors = ['#FFD66B', '#FF8A52', '#FFF1B8'];
        for (let i = 0; i < 16; i += 1) {
            const particle = new Node(`MatchParticle_${i}`);
            parent.addChild(particle);
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
        this.updateProgress();
        // destroy 在帧末才生效，先移出托盘，确保消除动画只选中本次创建的三个节点。
        this.trayNode.children.slice().forEach((child) => {
            if (child.name === 'MatchEffects') return;
            child.removeFromParent();
            child.destroy();
        });

        // 第一层只绘制固定槽位，补位时边框保持不动。
        for (let i = 0; i < this.levelData.config.traySize; i += 1) {
            const slot = new Node(`TraySlot_${i}`);
            this.trayNode.addChild(slot);
            slot.setPosition(TRAY_START_X + i * TRAY_SPACING, 0);
            drawTavernPanel(slot, 90, 100, 'slot');
        }

        // 第二层放真实食材节点；全部位于固定槽位之上，并可直接执行左移动画。
        for (let i = 0; i < this.tray.length; i += 1) {
            const type = this.tray[i];
            const item = new Node(`TrayItem_${i}`);
            this.trayNode.addChild(item);
            item.setPosition(TRAY_START_X + i * TRAY_SPACING, 0);
            transform(item, 82 * 1.2, 84 * 1.2);
            drawFoodTile(item, 80, 78);
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

    private isBoardCleared(): boolean {
        return this.remainingTiles() === 0 && this.tray.length === 0 && this.reserve.length === 0;
    }

    private revive(): void {
        if (!this.gameEnded || this.reviveUsed || this.tray.length < this.levelData.config.traySize) return;
        this.reviveUsed = true;
        this.clearMatchEffects();
        this.reserve = this.tray.splice(0, 3);
        this.lastMoveSnapshot = null;
        this.dismissOverlay();
        this.gameEnded = false;
        this.locked = false;
        this.combo = 0;
        this.renderTray();
        this.renderReserve();
        this.showToast('已复活！寄存食材可点击放回托盘', '#D86A3B');
    }

    private takeReservedTile(index: number): void {
        if (this.locked || this.gameEnded || index < 0 || index >= this.reserve.length) return;
        this.lastMoveSnapshot = {
            tray: this.tray.slice(), reserve: this.reserve.slice(),
            removedIds: this.levelData.tiles.filter(tile => tile.removed).map(tile => tile.id),
        };
        this.locked = true;
        const type = this.reserve.splice(index, 1)[0];
        this.insertIntoTray(type);
        this.renderReserve();
        this.resolveTray();
    }

    private renderReserve(): void {
        this.reserveNode.children.slice().forEach(child => {
            child.removeFromParent();
            child.destroy();
        });
        this.reserveNode.active = this.reserve.length > 0;
        // Make room above the tray instead of covering playable board tiles.
        const scale = this.reserve.length > 0 ? 0.86 : 1;
        this.board.setScale(scale, scale, 1);
        if (!this.reserve.length) return;
        drawTavernPanel(this.reserveNode, 560, 90, 'wood');
        makeLabel(this.reserveNode, '寄存食材\n点击取回', 22, '#FFF8E7', new Vec3(-174, 0), 170, 66, true);
        this.reserve.forEach((type, index) => {
            const item = new Node(`Reserved_${index}`);
            this.reserveNode.addChild(item);
            item.setPosition(-20 + index * 96, 0);
            item.setScale(0.75, 0.75, 1);
            this.drawTile(item, type, false);
            item.on(Node.EventType.TOUCH_END, () => this.takeReservedTile(index));
        });
    }

    private updateProgress(): void {
        const open = this.levelData.tiles.filter((tile) => this.isTileSelectable(tile)).length;
        if (this.levelData.config.level === 3) {
            const cleared = this.clearedTileCount();
            const next = (this.rewardedMilestones + 1) * 100;
            this.progressLabel.fontSize = 26;
            this.progressLabel.string = next <= this.levelData.total
                ? `距离下一次获取道具还有${Math.max(0, next - cleared)}个`
                : '本局开锅道具已全部领取，继续捞！';
        } else {
            this.progressLabel.fontSize = 26;
            this.progressLabel.string = `剩余 ${this.remainingTiles()} / ${this.levelData.total}    ·    可拿 ${open} 张`;
        }
    }

    private clearedTileCount(): number {
        return this.levelData.total - this.remainingTiles() - this.tray.length - this.reserve.length;
    }

    private grantBoilRewards(): string {
        if (this.levelData.config.level !== 3) return '';
        const reached = Math.floor(this.clearedTileCount() / 100);
        const rewards: string[] = [];
        // Never roll the milestone back on undo, so replaying a match cannot farm tools.
        while (this.rewardedMilestones < reached) {
            this.rewardedMilestones += 1;
            const types: ToolType[] = ['undo', 'bomb', 'shuffle'];
            const type = types[Math.floor(Math.random() * types.length)];
            this.toolUses[type] += 1;
            rewards.push(`${TOOL_NAMES[type]} +1`);
        }
        if (!rewards.length) return '';
        this.updateToolButtons();
        return `${BOIL_STAGES[this.rewardedMilestones]}！${rewards.join('，')}`;
    }

    private makeToolButton(type: ToolType, position: Vec3, fill: string, callback: () => void): Node {
        const button = makeButton(this.toolBar, '', position, 208, 84, fill, callback);
        button.name = `Tool_${type}`;
        const icon = new Node('ToolIcon');
        button.addChild(icon);
        icon.setPosition(-62, 0);
        icon.setScale(0.7, 0.7, 1);
        makeLabel(button, TOOL_NAMES[type], 27, '#FFF8E7', new Vec3(2, 0), 68, 40);
        transform(icon, 64, 44);
        const g = icon.addComponent(Graphics);
        g.strokeColor = hex('#FFF8E7');
        g.lineWidth = 6;
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
        } else if (type === 'bomb') {
            // 实心铁壳、暖色轮廓和高光，缩小后仍能辨认炸弹。
            g.fillColor = hex('#292D35');
            g.strokeColor = hex('#FFE6AE');
            g.lineWidth = 3;
            g.circle(-5, -7, 21);
            g.fill();
            g.stroke();
            g.fillColor = hex('#444B57');
            g.circle(-9, -3, 14);
            g.fill();
            g.strokeColor = hex('#FFF5DA');
            g.lineWidth = 3.5;
            g.moveTo(-18, -5);
            g.bezierCurveTo(-18, 2, -14, 7, -8, 8);
            g.stroke();
            // 引线座和弯曲引线。
            g.fillColor = hex('#D9AA62');
            g.roundRect(1, 9, 11, 9, 3);
            g.fill();
            g.strokeColor = hex('#FFE0A0');
            g.lineWidth = 4;
            g.moveTo(7, 17);
            g.bezierCurveTo(6, 28, 20, 17, 20, 28);
            g.stroke();
            // 橙色放射火花与亮黄色火芯。
            g.strokeColor = hex('#FFAE4D');
            g.lineWidth = 3;
            for (let ray = 0; ray < 5; ray += 1) {
                const angle = ray * Math.PI * 2 / 5;
                g.moveTo(20 + Math.cos(angle) * 6, 29 + Math.sin(angle) * 6);
                g.lineTo(20 + Math.cos(angle) * 11, 29 + Math.sin(angle) * 11);
            }
            g.stroke();
            g.fillColor = hex('#FFF2AF');
            g.circle(20, 29, 4);
            g.fill();
        } else {
            // 两条交叉箭头。
            g.moveTo(-28, -14);
            g.bezierCurveTo(-4, -14, 2, 14, 27, 14);
            arrow(27, 14, 1);
            g.moveTo(-28, 14);
            g.bezierCurveTo(-4, 14, 2, -14, 27, -14);
            arrow(27, -14, 1);
        }
        if (type !== 'bomb') g.stroke();
        const badge = new Node('UsesBadge');
        button.addChild(badge);
        badge.setPosition(72, 0);
        drawRoundRect(badge, 30, 30, 15, '#653A28');
        makeLabel(badge, '1', 21, '#FFF8E7', Vec3.ZERO, 28, 28);
        return button;
    }

    private updateToolButtons(): void {
        (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach((type) => {
            const button = this.toolButtons.get(type);
            if (!button) return;
            const label = button.getChildByName('UsesBadge')?.getChildByName('Label')?.getComponent(Label);
            if (label) label.string = String(this.toolUses[type]);
            opacity(button, this.toolUses[type] > 0 ? 255 : 105);
        });
    }

    private canUseTool(type: ToolType): boolean {
        if (this.levelIndex < 1) return false;
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
        this.clearMatchEffects();
        this.tray = this.lastMoveSnapshot.tray.slice();
        this.reserve = this.lastMoveSnapshot.reserve.slice();
        this.levelData.tiles.forEach((tile) => {
            tile.removed = removed.has(tile.id);
        });
        this.lastMoveSnapshot = null;
        this.toolUses.undo -= 1;
        this.rebuildBoardTiles();
        this.renderTray();
        this.renderReserve();
        this.updateProgress();
        this.updateToolButtons();
        this.showToast('已撤回上一次拿取', '#D86A3B');
    }

    private useBombTool(): void {
        if (!this.canUseTool('bomb')) return;
        const targets = selectBombTargets(this.levelData.tiles);
        if (targets.length === 0) {
            this.showToast('棋盘上没有满 3 张的同类食材', '#8A4B34');
            return;
        }
        targets.forEach((tile) => {
            tile.removed = true;
        });
        // 清空旧撤回快照，防止撤回拿牌时复活已经炸掉的牌。
        this.lastMoveSnapshot = null;
        this.toolUses.bomb -= 1;
        this.rebuildBoardTiles();
        const reward = this.grantBoilRewards();
        this.updateProgress();
        this.updateToolButtons();
        this.playEffect('match', 0.82);
        this.showToast(reward || `炸掉 ${targets.length} 张${getIngredient(targets[0].type).name}`, '#A14425');
        if (this.isBoardCleared()) this.endGame(true);
    }

    private useShuffleTool(): void {
        if (!this.canUseTool('shuffle')) return;
        const activeTiles = this.levelData.tiles.filter((tile) => !tile.removed);
        if (activeTiles.length < 2) {
            this.showToast('剩余食材不足，无法翻锅', '#8A4B34');
            return;
        }
        const types = activeTiles.map((tile) => tile.type);
        for (let i = types.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }
        const shuffledLevel = this.levelData;
        this.locked = true;
        this.lastMoveSnapshot = null;
        this.toolUses.shuffle -= 1;
        this.updateToolButtons();
        this.showToast('翻锅中，整锅食材重新拌匀！', '#D86A3B');
        // Every remaining board tile joins the pile, including covered layers.
        // Independent paths and rotations imitate mixing mahjong tiles on a table.
        activeTiles.forEach((tile, index) => {
            const node = this.tileNodes.get(tile.id);
            if (!node) return;
            const start = node.position.clone();
            const scale = node.scale.clone();
            const direction = index % 2 === 0 ? 1 : -1;
            const pileX = (Math.random() - 0.5) * 360;
            const pileY = (Math.random() - 0.5) * 260;
            this.drawTile(node, tile.type, false);
            tween(node).to(0.35, {
                position: new Vec3(pileX, pileY, start.z),
                angle: direction * (25 + Math.random() * 45),
                scale: new Vec3(scale.x * 0.8, scale.y * 0.8, 1),
            }, {easing: 'sineInOut'}).to(0.28, {
                position: new Vec3(-pileX * 0.85, pileY + direction * 55, start.z),
                angle: -direction * 65,
            }, {easing: 'sineInOut'}).to(0.28, {
                position: new Vec3(pileX * 0.65, -pileY, start.z),
                angle: direction * 35,
            }, {easing: 'sineInOut'}).to(0.45, {
                position: start, angle: 0, scale,
            }, {easing: 'cubicOut'}).start();
        });
        tween(this.board).delay(0.91).call(() => {
            if (this.levelData !== shuffledLevel) return;
            activeTiles.forEach((tile, index) => {
                tile.type = types[index];
                const node = this.tileNodes.get(tile.id);
                if (!node) return;
                const selectable = this.isTileSelectable(tile);
                (node as Node & { selectableState?: boolean }).selectableState = selectable;
                this.drawTile(node, tile.type, !selectable);
            });
        }).delay(0.47).call(() => {
            if (this.levelData !== shuffledLevel) return;
            this.locked = false;
            this.showToast('翻锅完成，接着捞！', '#D86A3B');
        }).start();
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
        const backgroundAlpha = opacity(this.toastLabel.node.parent!, 245);
        tween(backgroundAlpha).stop();
        tween(backgroundAlpha).delay(0.75).to(0.35, {opacity: 0}).start();
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
        drawRoundRect(panel, 560, 310, 32, '#FFF9EF');
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
        if (!won) {
            this.drawFailurePanel(panel);
            tween(panel).to(0.24, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
            return;
        }
        drawRoundRect(panel, 570, 500, 32, '#FFF9EF');
        makeLabel(panel, '锅底见啦！', 48, '#C94836', new Vec3(0, 150), 500, 70);
        makeLabel(panel, this.levelIndex < LEVELS.length - 1 ? '所有食材都已经下锅\n下一关会有更多叠层' :
            '所有食材都已经下锅\n三关盛宴，圆满收锅！', 25, '#775145', new Vec3(0, 55), 480, 100, true);
        if (this.levelIndex < LEVELS.length - 1) {
            makeButton(panel, '下一关', new Vec3(0, -73), 300, 72, '#D75542', () => this.nextLevel());
        } else {
            makeButton(panel, '再玩一遍', new Vec3(0, -73), 300, 72, '#D75542', () => this.loadLevel(0));
        }
        makeButton(panel, '关闭', new Vec3(0, -165), 220, 50, '#B88261', () => this.dismissOverlay());
        tween(panel).to(0.2, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
    }

    private dismissOverlay(): void {
        this.node.getChildByName('ResultOverlay')?.destroy();
    }

    private drawFailurePanel(panel: Node): void {
        drawRoundRect(panel, 580, 640, 32, '#FFF8E9', '#DAB88A', 3);
        const close = makeButton(panel, '×', new Vec3(239, 265), 52, 52, '#EAD8BD',
            () => this.dismissOverlay());
        close.getChildByName('Label')!.getComponent(Label)!.color = hex('#805B43');

        const emblem = new Node('FullPotEmblem');
        panel.addChild(emblem);
        emblem.setPosition(0, 246);
        const g = emblem.addComponent(Graphics);
        g.fillColor = hex('#F6E4C5');
        g.circle(0, 0, 45);
        g.fill();
        g.fillColor = hex('#B94B36');
        g.roundRect(-30, -22, 60, 35, 12);
        g.fill();
        g.strokeColor = hex('#7C3C29');
        g.lineWidth = 5;
        g.moveTo(-39, 5);
        g.lineTo(39, 5);
        g.stroke();
        g.strokeColor = hex('#D89A57');
        g.lineWidth = 3;
        [-15, 0, 15].forEach(x => {
            g.moveTo(x, 19);
            g.bezierCurveTo(x - 7, 25, x + 7, 29, x, 36);
        });
        g.stroke();

        makeLabel(panel, '托盘满啦', 46, '#803C2B', new Vec3(0, 165), 450, 62);
        makeLabel(panel, this.reviveUsed ? '换个拿取顺序，再开一锅！' : '别急，这锅还有机会！',
            25, '#957158', new Vec3(0, 112), 470, 38);

        const tip = new Node('ReviveExplanation');
        panel.addChild(tip);
        tip.setPosition(0, 24);
        drawRoundRect(tip, 476, 110, 18, '#F3E5CE');
        makeLabel(tip, this.reviveUsed ? '本局免费复活已使用' : '免费复活 · 本局还可用 1 次',
            25, '#8B4B30', new Vec3(0, 23), 444, 36);
        makeLabel(tip, this.reviveUsed ? '优先凑齐三张，给托盘留出空位' : '暂存前三张食材，腾出三格继续捞',
            22, '#927059', new Vec3(0, -23), 444, 34);

        makeButton(panel, this.reviveUsed ? '再开一锅' : '免费复活，继续捞',
            new Vec3(0, -92), 466, 82, '#C94E35',
            () => this.reviveUsed ? this.restartLevel() : this.revive());
        if (!this.reviveUsed) {
            const restart = makeButton(panel, '重新开始', new Vec3(0, -187), 466, 66, '#EAD8BD',
                () => this.restartLevel());
            restart.getChildByName('Label')!.getComponent(Label)!.color = hex('#805B43');
        }
        // makeLabel(panel, this.reviveUsed ? '重新开始后，可再次获得一次免费复活' : '无需广告 · 寄存食材可随时点击取回',
        //     20, '#A1856A', new Vec3(0, this.reviveUsed ? -190 : -263), 490, 34);
    }

    private restartLevel(): void {
        this.loadLevel(this.levelIndex);
    }

    private nextLevel(): void {
        if (this.levelIndex < LEVELS.length - 1) this.loadLevel(this.levelIndex + 1);
        else this.showToast('已经是最后一关', '#8A4B34');
    }
}
