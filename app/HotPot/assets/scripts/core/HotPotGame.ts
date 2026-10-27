import {
    _decorator,
    AudioClip,
    AudioSource,
    BlockInputEvents,
    Color,
    Component,
    Font,
    game as cocosGame,
    Game,
    Graphics,
    JsonAsset,
    Label,
    Mask,
    Node,
    Rect,
    ResolutionPolicy,
    resources,
    ScrollView,
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
import {BOARD_VERSION, clone, GameSave, RegionNode, regionPath, restoreLevel, SaveStatus} from '../data/PlayerData';
import {PlayerService} from './PlayerService';
import {achievementEntries, INGREDIENT_STORIES, unlockedAchievementIds} from '../data/CollectionData';

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
type GameAudio = 'bgm' | 'match' | 'win' | 'lose';
const BGM_VOLUME = 0.45;
const EFFECT_VOLUME = 0.5;
type ToolType = 'undo' | 'bomb' | 'shuffle';
const TOOL_NAMES: Record<ToolType, string> = {undo: '撤回', bomb: '炸', shuffle: '翻锅'};
const BOIL_STAGES = ['小火慢煮', '汤底渐热', '咕嘟冒泡', '香气四溢', '红汤翻滚', '热气腾腾', '满锅沸腾', '旺火盛宴', '收汁见底'];
// 图集按从左到右、从上到下排列；独立于关卡食材顺序。
const HANDPAINTED_TYPES: IngredientType[] = [
    'beef', 'shrimp', 'vegetable', 'mushroom', 'corn', 'fish', 'egg',
    'jzg', 'meetball', 'ou', 'tomato', 'toufu', 'ydf',
];

/** MoveSnapshot 的数据结构；字段说明见各成员。 */
interface MoveSnapshot {
    /** 托盘中按顺序排列的食材。 */
    tray: IngredientType[];
    /** 暂存区中的食材。 */
    reserve: IngredientType[];
    /** removedIds 对应的状态或配置。 */
    removedIds: string[];
}

/** 将十六进制颜色转换为 Cocos Color。 */
function hex(value: string): Color {
    return new Color().fromHEX(value);
}

/** 获取或添加 UITransform，并设置节点尺寸。 */
function transform(node: Node, width = 0, height = 0): UITransform {
    const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
    ui.setContentSize(width, height);
    return ui;
}

/** 获取或添加透明度组件，并设置透明度。 */
function opacity(node: Node, value = 255): UIOpacity {
    const component = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    component.opacity = value;
    return component;
}

/** 绘制可选描边的圆角矩形。 */
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
    const layer = /** 处理 layer 对应的游戏逻辑。 */(offsetY: number, inset: number, fill: string, alpha = 255): void => {
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
    const layer = /** 处理 layer 对应的游戏逻辑。 */(inset: number, offsetY: number, fill: string): void => {
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

/** 绘制控制按钮的图形标识。 */
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

/** C 款食盒：漆木外框、细黄铜边和奶油纸内衬，装饰避开内容区。 */
function drawLacquerPanel(node: Node, width: number, height: number): void {
    const g = drawRoundRect(node, width, height, 28, '#57291F');
    const layer = /** 处理 layer 对应的游戏逻辑。 */(inset: number, fill: string): void => {
        g.fillColor = hex(fill);
        g.roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, Math.max(12, 28 - inset));
        g.fill();
    };
    layer(3, '#D7AA65');
    layer(6, '#8D3325');
    layer(13, '#ECC788');
    layer(16, '#FFF3DC');
    g.strokeColor = hex('#C49961');
    g.lineWidth = 1.5;
    const x = width / 2 - 24;
    const y = height / 2 - 24;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        g.moveTo(sx * (x - 19), sy * y);
        g.lineTo(sx * x, sy * y);
        g.lineTo(sx * x, sy * (y - 19));
    }
    g.stroke();
    applyLacquerSkin(node, width, height);
}

/** 异步加载按钮皮肤并应用到仍有效的节点。 */
function applyLacquerSkin(node: Node, width: number, height: number, tone?: 'red' | 'cream' | 'muted'): void {
    if (!resources?.load) return;
    const key = tone || 'panel';
    (node as Node & { /** skinKey 对应的状态或配置。 */ skinKey?: string }).skinKey = key;
    resources.load(tone ? 'backgrounds/button-skins-c/texture' : 'backgrounds/panel-skin-c/texture', Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(error, texture) => {
        if (!node.isValid || error || !texture || (node as Node & {
            /** skinKey 对应的状态或配置。 */ skinKey?: string
        }).skinKey !== key) return;
        const image = node.getChildByName('LacquerSkin') || new Node('LacquerSkin');
        if (!image.parent) {
            node.addChild(image);
            image.setSiblingIndex(0);
        }
        transform(image, width, height);
        const frame = new SpriteFrame();
        frame.texture = texture;
        if (tone) {
            const index = tone === 'red' ? 0 : tone === 'cream' ? 1 : 2;
            const cell = Math.round(texture.width / 3);
            frame.rect = new Rect(index * cell, 0, cell, texture.height);
        }
        frame.insetLeft = frame.insetRight = tone ? 24 : 96;
        frame.insetTop = frame.insetBottom = tone ? 22 : 96;
        const sprite = image.getComponent(Sprite) || image.addComponent(Sprite);
        sprite.type = Sprite.Type.SLICED;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        node.getComponent(Graphics)?.clear();
    });
}

/** 绘制漆面按钮及其边框。 */
function drawLacquerButton(node: Node, width: number, height: number, tone: 'red' | 'cream' | 'muted' = 'red'): void {
    const colors = tone === 'red' ? ['#652C20', '#D6AC6B', '#A83224', '#C34B32']
        : tone === 'muted' ? ['#554337', '#A18B6B', '#766151', '#806B59']
            : ['#926440', '#CEA66B', '#FFF0CE', '#F2DCB5'];
    const g = drawRoundRect(node, width, height, 16, colors[0]);
    for (const [inset, fill] of [[2, colors[1]], [4, colors[2]], [7, colors[3]]] as Array<[number, string]>) {
        g.fillColor = hex(fill);
        g.roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, Math.max(6, 16 - inset));
        g.fill();
    }
    g.strokeColor = hex(tone === 'red' ? '#F0CB85' : '#C49B64');
    g.lineWidth = 1;
    g.moveTo(-width / 2 + 18, height / 2 - 9);
    g.lineTo(width / 2 - 18, height / 2 - 9);
    g.stroke();
    if (width >= 80) applyLacquerSkin(node, width, height, tone);
}

/** 创建弹窗标题与装饰。 */
function makePanelHeading(panel: Node, text: string, y: number, width = 420): Label {
    const plaque = new Node('HeadingPlaque');
    panel.addChild(plaque);
    plaque.setPosition(0, y);
    drawLacquerButton(plaque, width, 66);
    const heading = makeLabel(plaque, text, 32, '#FFF0CA', Vec3.ZERO, width - 40, 48);
    heading.isBold = true;
    return heading;
}

/** 设置酒馆风格按钮的外观。 */
function styleTavernButton(button: Node, restart: boolean): void {
    drawLacquerButton(button, 292, 82, restart ? 'red' : 'cream');
    const label = button.getChildByName('Label')!.getComponent(Label)!;
    label.node.setPosition(30, 1);
    transform(label.node, 164, 58);
    label.color = hex(restart ? '#FFF2D0' : '#6A3B20');
    label.isBold = true;
    const icon = new Node('ControlIcon');
    button.addChild(icon);
    // 图标实际笔画不对称，按可见轮廓对齐，与文字组成居中的内容组。
    icon.setPosition(restart ? -61 : -71, 1);
    transform(icon, 44, 44);
    drawControlIcon(icon, restart);
}

/** 创建并配置文字节点。 */
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

/** 创建带触摸反馈的按钮。 */
function makeButton(parent: Node, text: string, position: Vec3, width: number, height: number,
                    fill: string, callback: () => void): Node {
    const node = new Node(`Button_${text}`);
    parent.addChild(node);
    node.setPosition(position);
    const primary = ['#D75542', '#C94E35', '#C84730', '#ED4A32', '#875139', '#A3613B'].indexOf(fill) >= 0;
    if (text) drawLacquerButton(node, width, height, primary ? 'red' : 'cream');
    else drawRoundRect(node, width, height, 16, fill, '#D5B47D', 1.5);
    makeLabel(node, text, 26, primary ? '#FFF2D0' : '#633C28', new Vec3(0, 1), width - 24, height - 14);
    node.on(Node.EventType.TOUCH_START, /** 响应节点触摸或游戏事件。 */() => {
        tween(node).stop();
        tween(node).to(0.07, {scale: new Vec3(0.94, 0.94, 1)}).start();
    });
    node.on(Node.EventType.TOUCH_END, /** 响应节点触摸或游戏事件。 */() => {
        tween(node).stop();
        tween(node).to(0.08, {scale: Vec3.ONE}).start();
        callback();
    });
    node.on(Node.EventType.TOUCH_CANCEL, /** 响应节点触摸或游戏事件。 */() => {
        tween(node).stop();
        tween(node).to(0.08, {scale: Vec3.ONE}).start();
    });
    return node;
}

/** 火锅游戏场景组件，管理棋盘、界面、输入和动画。 */
@ccclass('HotPotGame')
export class HotPotGame extends Component {
    /** 当前关卡的零基索引。 */
    private levelIndex = 0;
    /** 当前关卡生成的棋盘数据。 */
    private levelData!: LevelData;
    /** 托盘中按顺序排列的食材。 */
    private tray: IngredientType[] = [];
    /** 暂存区中的食材。 */
    private reserve: IngredientType[] = [];
    /** 当前对局是否已经复活。 */
    private reviveUsed = false;
    /** 本局已发放的奖励里程碑。 */
    private rewardedMilestones = 0;
    /** 暂存区的界面节点。 */
    private reserveNode!: Node;
    /** 食材编号到界面节点的映射。 */
    private tileNodes = new Map<string, Node>();
    /** 棋盘是否暂时禁止操作。 */
    private locked = false;
    /** 当前对局是否结束。 */
    private gameEnded = false;
    /** 连续消除次数。 */
    private combo = 0;
    /** 食材类型到图片帧的缓存。 */
    private ingredientFrames = new Map<IngredientType, SpriteFrame>();
    /** 背景音乐与音效资源缓存。 */
    private audioClips = new Map<GameAudio, AudioClip>();
    /** 背景音乐播放组件。 */
    private bgmSource!: AudioSource;
    /** 音效播放组件。 */
    private effectSource!: AudioSource;
    /** 玩家的声音开关状态。 */
    private soundEnabled = true;
    /** 声音按钮的文字节点。 */
    private soundButtonLabel!: Label;
    /** 本地存档与云同步服务。 */
    private playerService: PlayerService | null = null;
    /** 玩家同步状态的文字节点。 */
    private playerStatusLabel: Label | null = null;
    /** 玩家存档摘要的文字节点。 */
    private playerSaveLabel: Label | null = null;
    /** 地区名称使用的字体。 */
    private regionFont: Font | null = null;
    /** 玩家档案入口的文字节点。 */
    private profileButtonLabel!: Label;
    /** 上次刷新时已知的成就编号。 */
    private knownAchievements = new Set<string>();
    /** 当前成就提示所属的玩家编号。 */
    private achievementOwner: string | null = null;
    /** 成就提示是否可以开始显示。 */
    private achievementNotificationsReady = false;
    /** 上一局的进行、胜利或失败状态。 */
    private lastResult: SaveStatus = 'playing';
    /** 是否正在从存档恢复对局。 */
    private restoringSave = false;

    /** 棋盘根节点。 */
    private board!: Node;
    /** 托盘根节点。 */
    private trayNode!: Node;
    /** 道具栏根节点。 */
    private toolBar!: Node;
    /** 食材移动动画的容器。 */
    private foodTransitionLayer!: Node;
    /** 关卡名称文字。 */
    private levelLabel!: Label;
    /** 关卡进度文字。 */
    private progressLabel!: Label;
    /** 短暂提示文字。 */
    private toastLabel!: Label;
    /** 道具类型到按钮节点的映射。 */
    private toolButtons = new Map<ToolType, Node>();
    /** 各道具在本局的使用次数。 */
    private toolUses: Record<ToolType, number> = {undo: 0, bomb: 0, shuffle: 0};
    // 仅当前这局的本地调试开关，不写入玩家或云端存档。
    /** 本局调试模式下各道具是否无限使用。 */
    private unlimitedTools: Record<ToolType, boolean> = {undo: false, bomb: false, shuffle: false};
    /** 撤销操作所需的上一手快照。 */
    private lastMoveSnapshot: MoveSnapshot | null = null;
    /** 按设备屏幕换算的设计高度。 */
    private viewportHeight = DESIGN_HEIGHT;
    /** 长屏幕可分配的纵向空间。 */
    private verticalSpread = 0;
    /** 顶部界面可用的纵向偏移。 */
    private topSpread = 120;
    /** 底部界面可用的纵向偏移。 */
    private bottomSpread = 0;

    /** 初始化画布、游戏界面、资源和玩家档案。 */
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
        this.node.children.slice().forEach(/** 依次处理集合中的每个条目。 */(child) => {
            if (child.name !== 'Camera') child.destroy();
        });
        this.buildShell();
        this.setupAudio();
        this.progressLabel.string = '正在载入食材与玩家档案…';
        this.loadIngredientImages(/** 在当前操作完成后更新相关游戏状态。 */() => {
            void this.initializePlayer();
        });
        cocosGame.on(Game.EVENT_HIDE, this.flushPlayerSave, this);
        cocosGame.on(Game.EVENT_SHOW, this.resumePlayerDay, this);
    }

    /** 释放事件监听与音频，并提交待同步存档。 */
    onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_START, this.startBgmIfReady, this);
        this.bgmSource?.stop();
        this.effectSource?.stop();
        cocosGame.off(Game.EVENT_HIDE, this.flushPlayerSave, this);
        cocosGame.off(Game.EVENT_SHOW, this.resumePlayerDay, this);
        this.playerService?.flush();
    }

    /** 加载地区数据、连接云档案并恢复当前对局。 */
    private async initializePlayer(): Promise<void> {
        await new Promise<void>(/** 在当前操作完成后更新相关游戏状态。 */resolve => {
            resources.load('fonts/HotPotRegion', Font, /** 在资源加载完成后更新有效节点或处理失败。 */(error, font) => {
                if (!error) this.regionFont = font;
                resolve();
            });
        });
        const regions = await new Promise<RegionNode[]>(/** 在当前操作完成后更新相关游戏状态。 */(resolve) => {
            resources.load('data/regions', JsonAsset, /** 在资源加载完成后更新有效节点或处理失败。 */(error, asset) => {
                if (error || !asset) {
                    resolve([]);
                    return;
                }
                resolve(asset.json as RegionNode[]);
            });
        });
        if (!this.node.isValid) return;
        if (!regions.length) {
            this.loadLevel(0, false);
            this.showToast('地区数据加载失败，请重新打开游戏', '#A24A3C');
            return;
        }
        this.playerService = new PlayerService(regions, sys.localStorage);
        this.playerService.onChange = /** 处理 onChange 对应的事件。 */() => {
            if (!this.node.isValid) return;
            this.profileButtonLabel.string = this.playerService!.isConflict ? '存档' : '档案';
            if (this.playerStatusLabel?.node.isValid) this.playerStatusLabel.string = this.playerService!.statusText;
            if (this.playerSaveLabel?.node.isValid) this.playerSaveLabel.string = this.playerSaveText();
            if (this.achievementNotificationsReady) {
                const entries = achievementEntries(this.playerService!.state).filter(/** 按条件筛选或判断条目：item.unlocked。 */item => item.unlocked);
                const newlyUnlocked = this.achievementOwner === this.playerService!.playerId
                    ? entries.filter(/** 按条件筛选或判断条目：!this.knownAchievements.has(item.id)。 */item => !this.knownAchievements.has(item.id)) : [];
                this.achievementOwner = this.playerService!.playerId;
                this.knownAchievements = new Set(entries.map(/** 将当前条目转换为后续处理所需的值。 */item => item.id));
                if (newlyUnlocked.length) this.showToast(`成就达成：${newlyUnlocked[0].title}${newlyUnlocked.length > 1 ? ` 等${newlyUnlocked.length}项` : ''}`, '#B64B31');
            }
        };
        await this.playerService.initialize();
        if (!this.node.isValid) return;
        this.knownAchievements = new Set(unlockedAchievementIds(this.playerService.state));
        this.achievementOwner = this.playerService.playerId;
        this.achievementNotificationsReady = true;
        const newDay = this.playerService.beginDailySession();
        const saved = this.playerService.state.save;
        if (saved) {
            this.restoreGame(saved);
            this.showToast('已恢复上次这锅的进度', '#D86A3B');
        } else {
            this.loadLevel(0);
            if (newDay) this.showToast('新的一天，从第一关开始', '#D86A3B');
        }
        if (this.playerService.isConflict) this.showSaveConflict();
    }

    /** 立即提交待同步的玩家存档。 */
    private flushPlayerSave(): void {
        void this.playerService?.flush();
    }

    /** 从后台返回时处理跨日重置和界面恢复。 */
    private resumePlayerDay(): void {
        if (!this.playerService || !this.levelData) return;
        if (this.playerService.beginDailySession()) {
            for (const name of ['PlayerOverlay', 'RegionOverlay', 'CloudConflictOverlay', 'ConnectedSaveOverlay',
                'CollectionOverlay', 'CollectionDetailOverlay', 'BackdoorOverlay']) this.dismissPlayerMenu(name);
            this.loadLevel(0);
            this.showToast('新的一天，从第一关开始', '#D86A3B');
            if (this.playerService.isConflict) this.showSaveConflict();
        }
        this.flushPlayerSave();
    }

    /** 把当前棋盘和道具状态写入玩家存档。 */
    private checkpointGame(): void {
        if (!this.playerService || !this.levelData || this.restoringSave || (this.locked && !this.gameEnded)) return;
        const save: GameSave = {
            version: 1, boardVersion: BOARD_VERSION, levelIndex: this.levelIndex,
            ...(this.levelData.layoutSeed === undefined ? {} : {layoutSeed: this.levelData.layoutSeed}),
            ...(this.levelData.ingredientSeed === undefined ? {} : {ingredientSeed: this.levelData.ingredientSeed}),
            types: this.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */tile => tile.type),
            removedIds: this.levelData.tiles.filter(/** 按条件筛选或判断条目：tile.removed。 */tile => tile.removed).map(/** 将当前条目转换为后续处理所需的值。 */tile => tile.id),
            tray: this.tray.slice(), reserve: this.reserve.slice(), reviveUsed: this.reviveUsed,
            rewardedMilestones: this.rewardedMilestones, toolUses: {...this.toolUses},
            lastMove: this.lastMoveSnapshot ? clone(this.lastMoveSnapshot) : null,
            status: this.gameEnded ? this.lastResult : 'playing',
        };
        try {
            this.playerService.setSave(save);
        } catch {
            this.showToast('当前进度未能保存，请重试', '#A24A3C');
        }
    }

    /** 根据存档恢复棋盘、托盘和关卡状态。 */
    private restoreGame(save: GameSave): void {
        const restored = restoreLevel(save);
        this.restoringSave = true;
        try {
            this.loadLevel(save.levelIndex, false);
            this.levelData = restored;
            this.tray = save.tray.slice();
            this.reserve = save.reserve.slice();
            this.reviveUsed = save.reviveUsed;
            this.rewardedMilestones = save.rewardedMilestones;
            this.toolUses = {...save.toolUses};
            this.lastMoveSnapshot = save.lastMove ? clone(save.lastMove) : null;
            this.rebuildBoardTiles();
            this.renderTray();
            this.renderReserve();
            this.updateProgress();
            this.updateToolButtons();
            if (save.status !== 'playing') this.endGame(save.status === 'won');
        } finally {
            this.restoringSave = false;
        }
    }

    /** 判断是否已有玩家相关弹窗。 */
    private hasPlayerMenu(): boolean {
        return ['PlayerOverlay', 'RegionOverlay', 'CloudConflictOverlay', 'ConnectedSaveOverlay',
            'CollectionOverlay', 'CollectionDetailOverlay', 'BackdoorOverlay']
            .some(/** 按条件筛选或判断条目：!!this.node?.getChildByName?.(name)。 */name => !!this.node?.getChildByName?.(name));
    }

    /** 加载背景音乐和音效并设置播放源。 */
    private setupAudio(): void {
        const bgmNode = new Node('BgmAudio');
        this.node.addChild(bgmNode);
        this.bgmSource = bgmNode.addComponent(AudioSource);
        this.bgmSource.loop = true;
        this.bgmSource.volume = BGM_VOLUME;

        const effectNode = new Node('EffectAudio');
        this.node.addChild(effectNode);
        this.effectSource = effectNode.addComponent(AudioSource);
        this.effectSource.volume = EFFECT_VOLUME;

        this.node.on(Node.EventType.TOUCH_START, this.startBgmIfReady, this);

        const audioAssets: Array<{
            /** key 对应的状态或配置。 */ key: GameAudio;
            /** path 对应的状态或配置。 */ path: string
        }> = [
            {key: 'bgm', path: 'audio/bgm'},
            {key: 'match', path: 'audio/match'},
            {key: 'win', path: 'audio/win'},
            {key: 'lose', path: 'audio/lose'},
        ];
        audioAssets.forEach(/** 依次处理集合中的每个条目。 */({key, path}) => {
            resources.load(path, AudioClip, /** 在资源加载完成后更新有效节点或处理失败。 */(error, clip) => {
                if (error || !clip) {
                    console.error(`[HotPotGame] 无法加载音频：${path}`, error);
                    return;
                }
                this.audioClips.set(key, clip);
                if (key === 'bgm') this.bgmSource.clip = clip;
            });
        });
    }

    /** 在允许播放时启动背景音乐。 */
    private startBgmIfReady(): void {
        if (!this.soundEnabled || !this.bgmSource?.clip || this.bgmSource.playing) return;
        this.bgmSource.play();
    }

    /** 切换声音状态并更新按钮显示。 */
    private toggleSound(): void {
        this.soundEnabled = !this.soundEnabled;
        this.soundButtonLabel.string = this.soundEnabled ? '声音：开' : '声音：关';
        const soundIcon = this.soundButtonLabel.node.parent?.getChildByName('ControlIcon');
        if (soundIcon) drawControlIcon(soundIcon, false, this.soundEnabled);
        this.effectSource.volume = this.soundEnabled ? EFFECT_VOLUME : 0;
        if (this.soundEnabled) this.startBgmIfReady();
        else {
            this.bgmSource.pause();
            this.effectSource.stop();
        }
    }

    /** 按指定音量播放游戏音效。 */
    private playEffect(key: Exclude<GameAudio, 'bgm'>, volume: number): void {
        if (!this.soundEnabled) return;
        const clip = this.audioClips.get(key);
        if (clip) {
            // 使用可停止的音源，关闭声音时也能立即停止当前音效。
            this.effectSource.stop();
            this.effectSource.clip = clip;
            this.effectSource.volume = volume * EFFECT_VOLUME;
            this.effectSource.play();
        }
    }

    /** 加载基础食材图集和单独的茶树菇图片。 */
    private loadIngredientImages(done: () => void): void {
        resources.load('ingredients/handpainted-atlas/texture', Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(error, texture) => {
            if (!this.node.isValid) return;
            if (error || !texture || texture.width !== texture.height || texture.width < 4) {
                console.warn('[HotPotGame] 手绘图集不可用，保留食材名称备用牌面', error);
                this.loadSupplementalImages(done);
                return;
            }
            const cell = texture.width / 4;
            HANDPAINTED_TYPES.forEach(/** 依次处理集合中的每个条目。 */(type, index) => {
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
            resources.load('ingredients/jzg/texture', Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(mushroomError, mushroomTexture) => {
                if (!this.node.isValid) return;
                if (!mushroomError && mushroomTexture) {
                    const frame = new SpriteFrame();
                    frame.texture = mushroomTexture;
                    this.ingredientFrames.set('jzg', frame);
                } else {
                    console.error('[HotPotGame] 无法加载茶树菇图片', mushroomError);
                }
                this.loadSupplementalImages(done);
            });
        });
    }

    /** 加载扩展食材图集。 */
    private loadSupplementalImages(done: () => void): void {
        const sheets: Array<{
            /** path 对应的状态或配置。 */ path: string;
            /** columns 对应的状态或配置。 */ columns: number;
            /** 棋盘目标行数。 */ rows: number;
            /** types 对应的状态或配置。 */ types: IngredientType[]
        }> = [
            {
                path: 'ingredients/expanded-atlas/texture', columns: 4, rows: 2,
                types: ['tripe', 'duckblood', 'potato', 'crabstick', 'noodle', 'luncheon', 'kelp']
            },
            {
                path: 'ingredients/extra-meat-yam-atlas/texture', columns: 3, rows: 1,
                types: ['lamb', 'blackchicken', 'yam']
            },
        ];
        let pending = sheets.length;
        sheets.forEach(/** 依次处理集合中的每个条目。 */sheet => resources.load(sheet.path, Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(error, texture) => {
            if (!this.node.isValid) return;
            if (!error && texture) sheet.types.forEach(/** 依次处理集合中的每个条目。 */(type, index) => {
                const left = Math.round(index % sheet.columns * texture.width / sheet.columns);
                const top = Math.round(Math.floor(index / sheet.columns) * texture.height / sheet.rows);
                const right = Math.round((index % sheet.columns + 1) * texture.width / sheet.columns);
                const bottom = Math.round((Math.floor(index / sheet.columns) + 1) * texture.height / sheet.rows);
                const frame = new SpriteFrame();
                frame.texture = texture;
                frame.rect = new Rect(left, top, right - left, bottom - top);
                this.ingredientFrames.set(type, frame);
            });
            else console.error(`[HotPotGame] 新食材图集加载失败：${sheet.path}`, error);
            pending -= 1;
            if (pending === 0) done();
        }));
    }

    /** 创建主界面、棋盘、托盘和工具栏。 */
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
        drawRoundRect(levelBar, 650, 58, 16, '#F5DEB2');
        this.levelLabel = makeLabel(levelBar, '', 25, '#63351F', Vec3.ZERO, 398, 44);
        makeButton(levelBar, '图鉴', new Vec3(-265, 0), 102, 48, '#A3613B', /** 在当前操作完成后更新相关游戏状态。 */() => this.showCollection());
        const profile = makeButton(levelBar, '档案', new Vec3(265, 0), 102, 48, '#A3613B', /** 在当前操作完成后更新相关游戏状态。 */() => this.showPlayerProfile());
        this.profileButtonLabel = profile.getChildByName('Label')!.getComponent(Label)!;

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
            '#875139', /** 在当前操作完成后更新相关游戏状态。 */() => this.useUndoTool()));
        this.toolButtons.set('bomb', this.makeToolButton('bomb', Vec3.ZERO,
            '#875139', /** 在当前操作完成后更新相关游戏状态。 */() => this.useBombTool()));
        this.toolButtons.set('shuffle', this.makeToolButton('shuffle', new Vec3(224, 0),
            '#875139', /** 在当前操作完成后更新相关游戏状态。 */() => this.useShuffleTool()));
        this.toolBar.active = false;

        const toastBack = new Node('ToastBackground');
        this.node.addChild(toastBack);
        toastBack.setPosition(0, -619);
        drawRoundRect(toastBack, 650, 38, 12, '#FFF1D4');
        opacity(toastBack, 0);
        this.toastLabel = makeLabel(toastBack, '', 24, '#713B2C', Vec3.ZERO, 630, 36);
        opacity(this.toastLabel.node, 0);
        const restartButton = makeButton(this.node, '重新开始', new Vec3(-158, -676 - this.bottomSpread), 292, 82, '#C84730',
            /** 在当前操作完成后更新相关游戏状态。 */() => this.showRestartConfirmation());
        styleTavernButton(restartButton, true);
        const soundButton = makeButton(this.node, '声音：开', new Vec3(158, -676 - this.bottomSpread),
            292, 82, '#F2D7A3', /** 在当前操作完成后更新相关游戏状态。 */() => this.toggleSound());
        styleTavernButton(soundButton, false);
        this.soundButtonLabel = soundButton.getChildByName('Label')!.getComponent(Label)!;

        // 移动中的食物牌统一放在最后创建的顶层容器，避免被棋盘、托盘和按钮边框遮挡。
        this.foodTransitionLayer = new Node('FoodTransitionLayer');
        this.node.addChild(this.foodTransitionLayer);
        transform(this.foodTransitionLayer, DESIGN_WIDTH, this.viewportHeight);
    }

    /** D 方案透明字标；资源未就绪时保留可读的文字标题。 */
    private loadTitleArtwork(fallback: Label): void {
        resources.load('backgrounds/title-d/texture', Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(error, texture) => {
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
        resources.load('backgrounds/tavern-bg/texture', Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(error, texture) => {
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
        resources.load('backgrounds/hotpot-board/texture', Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(error, texture) => {
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

        const sparkle = /** 处理 sparkle 对应的游戏逻辑。 */(x: number, y: number, size: number): void => {
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

    /** 生成并显示指定关卡，按需保存。 */
    private loadLevel(index: number, persist = true): void {
        this.clearMatchEffects();
        const previousLevel = this.levelData;
        this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
        this.levelData = createLevel(this.levelIndex, undefined,
            previousLevel?.config.level === 3 ? previousLevel.layoutSeed : undefined);
        this.tray = [];
        this.reserve = [];
        this.reviveUsed = false;
        this.rewardedMilestones = 0;
        this.renderReserve();
        this.tileNodes.clear();
        this.locked = false;
        this.gameEnded = false;
        this.lastResult = 'playing';
        this.combo = 0;
        this.lastMoveSnapshot = null;
        const toolsEnabled = this.levelIndex >= 1;
        this.unlimitedTools = {undo: false, bomb: false, shuffle: false};
        this.toolUses = toolsEnabled ? {undo: 1, bomb: 1, shuffle: 1} : {undo: 0, bomb: 0, shuffle: 0};
        this.toolBar.active = toolsEnabled;
        this.updateToolButtons();
        this.effectSource?.stop();
        this.dismissOverlay();
        this.dismissRestartConfirmation();
        this.board.children.slice().forEach(/** 依次处理集合中的每个条目。 */(child) => {
            if (child.name.startsWith('Tile_')) child.destroy();
        });
        this.foodTransitionLayer.children.slice().forEach(/** 依次处理集合中的每个条目。 */(child) => child.destroy());
        this.levelLabel.string = `第 ${this.levelData.config.level} / ${LEVELS.length} 关  ·  ${this.levelData.config.title}`;
        this.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */(tile) => this.createTileNode(tile));
        this.refreshTileStates();
        this.renderTray();
        this.updateProgress();
        if (persist) this.checkpointGame();
        // this.showToast('看清叠层，别让托盘塞满！', '#8A4B34');
    }

    /** 为一张食材牌创建可点击的显示节点。 */
    private createTileNode(tile: TileData): void {
        const node = new Node(`Tile_${tile.id}`);
        this.board.addChild(node);
        node.setPosition(tile.x, tile.y, tile.layer);
        const tileScale = this.levelData.config.tileScale || (this.levelData.config.rows === 8 ? EIGHT_ROW_TILE_SCALE : 1);
        node.setScale(tileScale, tileScale, 1);
        transform(node, TILE_WIDTH, TILE_HEIGHT);
        node.on(Node.EventType.TOUCH_END, /** 响应节点触摸或游戏事件。 */() => this.onTileClicked(tile));
        this.tileNodes.set(tile.id, node);
    }

    /** 根据食材类型和遮挡状态绘制牌面。 */
    private drawTile(node: Node, type: IngredientType, blocked: boolean): void {
        node.children.slice().forEach(/** 依次处理集合中的每个条目。 */(child) => child.destroy());
        const ingredient = getIngredient(type);
        drawFoodTile(node, TILE_WIDTH, TILE_HEIGHT, blocked);
        if (this.ingredientFrames.has(type)) {
            this.addIngredientImage(node, type, blocked,
                TILE_IMAGE_WIDTH, TILE_IMAGE_HEIGHT);
        } else {
            makeLabel(node, ingredient.name, 26, blocked ? '#6F6255' : ingredient.dark, Vec3.ZERO, 96, 54);
        }
        opacity(node, 255);
    }

    /** 把食材图片裁切并放进牌面。 */
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

    /** 按编号查找棋盘食材牌。 */
    private findTile(id: string): TileData | undefined {
        return this.levelData.tiles.find(/** 按条件筛选或判断条目：tile.id === id。 */(tile) => tile.id === id);
    }

    /** 判断牌是否未移除且未被上层牌遮挡。 */
    private isTileSelectable(tile: TileData, tilesById?: ReadonlyMap<string, TileData>): boolean {
        if (tile.removed) return false;
        return !tile.blockedBy.some(/** 按条件筛选或判断条目：{ const blocker = tilesById ? tilesById.get(id) : this.findT。 */(id) => {
            const blocker = tilesById ? tilesById.get(id) : this.findTile(id);
            return blocker && !blocker.removed;
        });
    }

    /** 刷新全部牌的可选状态和外观。 */
    private refreshTileStates(): void {
        const tilesById = new Map(this.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */tile => [tile.id, tile] as const));
        this.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */(tile) => {
            if (tile.removed) return;
            const node = this.tileNodes.get(tile.id);
            if (!node) return;
            const selectable = this.isTileSelectable(tile, tilesById);
            if ((node as Node & {
                /** selectableState 对应的状态或配置。 */ selectableState?: boolean
            }).selectableState !== selectable) {
                (node as Node & {
                    /** selectableState 对应的状态或配置。 */ selectableState?: boolean
                }).selectableState = selectable;
                this.drawTile(node, tile.type, !selectable);
            }
        });
    }

    /** 处理取牌、移动动画与后续消除。 */
    private onTileClicked(tile: TileData): void {
        if (this.locked || this.gameEnded || this.hasPlayerMenu() || tile.removed) return;
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
            removedIds: this.levelData.tiles.filter(/** 按条件筛选或判断条目：item.removed。 */(item) => item.removed).map(/** 将当前条目转换为后续处理所需的值。 */(item) => item.id),
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
            .call(/** 在动画到达指定阶段后更新游戏状态。 */() => {
                node.destroy();
                if (this.levelData !== movingLevel) return;
                this.refreshTileStates();
                this.resolveTray();
            }).start();
        this.updateProgress();
    }

    /** 将食材插入托盘中相同种类旁边。 */
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

    /** 检查托盘中的连续三张并触发消除或失败。 */
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
            this.checkpointGame();
        }
    }

    /** 返回第一组三个连续同类食材的起始下标；没有则返回 -1。 */
    private findAdjacentMatch(): number {
        for (let i = 0; i <= this.tray.length - 3; i += 1) {
            if (this.tray[i] === this.tray[i + 1] && this.tray[i] === this.tray[i + 2]) return i;
        }
        return -1;
    }

    /** 播放三消和后续托盘收拢动画。 */
    private animateMatch(matchStart: number): void {
        this.playEffect('match', 0.82);
        const trayItems = this.trayNode.children.filter(/** 按条件筛选或判断条目：child.name.startsWith('TrayItem_')。 */(child) => child.name.startsWith('TrayItem_'));
        const matching = trayItems.slice(matchStart, matchStart + 3);
        const effects = new Node('MatchEffects');
        this.trayNode.addChild(effects);
        // Commit the match before allowing another click. Animation nodes no
        // longer occupy slots and cannot modify a later tray or restarted game.
        this.tray.splice(matchStart, 3);
        matching.forEach(/** 依次处理集合中的每个条目。 */(item) => {
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
        trayItems.slice(matchStart + 3).forEach(/** 依次处理集合中的每个条目。 */(item, followerOffset) => {
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
        tween(effects).delay(0.82).call(/** 在动画到达指定阶段后更新游戏状态。 */() => effects.destroy()).start();
        if (this.isBoardCleared()) this.endGame(true);
        else {
            this.locked = false;
            this.checkpointGame();
        }
    }

    /** 移除上一轮的匹配特效。 */
    private clearMatchEffects(): void {
        this.trayNode.children.slice().filter(/** 按条件筛选或判断条目：child.name === 'MatchEffects'。 */child => child.name === 'MatchEffects').forEach(/** 依次处理集合中的每个条目。 */child => {
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
                .call(/** 在动画到达指定阶段后更新游戏状态。 */() => particle.destroy())
                .start();
            tween(opacity(particle))
                .delay(0.4)
                .to(0.36, {opacity: 0})
                .start();
        }
    }

    /** 依据托盘数据重新绘制食材节点。 */
    private renderTray(): void {
        this.updateProgress();
        // destroy 在帧末才生效，先移出托盘，确保消除动画只选中本次创建的三个节点。
        this.trayNode.children.slice().forEach(/** 依次处理集合中的每个条目。 */(child) => {
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
            (item as Node & { /** trayType 对应的状态或配置。 */ trayType?: IngredientType }).trayType = type;
            const ingredient = getIngredient(type);
            if (this.ingredientFrames.has(type)) {
                this.addIngredientImage(item, type, false, TRAY_IMAGE_WIDTH, TRAY_IMAGE_HEIGHT);
            } else {
                makeLabel(item, '?', 32, ingredient.dark, Vec3.ZERO, 56, 48);
            }
        }
    }

    /** 统计棋盘上尚未移除的牌。 */
    private remainingTiles(): number {
        return this.levelData.tiles.filter(/** 按条件筛选或判断条目：!tile.removed。 */(tile) => !tile.removed).length;
    }

    /** 判断棋盘是否已经清空。 */
    private isBoardCleared(): boolean {
        return this.remainingTiles() === 0 && this.tray.length === 0 && this.reserve.length === 0;
    }

    /** 执行复活并恢复可继续操作的状态。 */
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
        this.checkpointGame();
        this.showToast('已复活！寄存食材可点击放回托盘', '#D86A3B');
    }

    /** 将暂存区的食材取回托盘。 */
    private takeReservedTile(index: number): void {
        if (this.locked || this.gameEnded || this.hasPlayerMenu() || index < 0 || index >= this.reserve.length) return;
        this.lastMoveSnapshot = {
            tray: this.tray.slice(), reserve: this.reserve.slice(),
            removedIds: this.levelData.tiles.filter(/** 按条件筛选或判断条目：tile.removed。 */tile => tile.removed).map(/** 将当前条目转换为后续处理所需的值。 */tile => tile.id),
        };
        this.locked = true;
        const type = this.reserve.splice(index, 1)[0];
        this.insertIntoTray(type);
        this.renderReserve();
        this.resolveTray();
    }

    /** 重新绘制暂存区的食材。 */
    private renderReserve(): void {
        this.reserveNode.children.slice().forEach(/** 依次处理集合中的每个条目。 */child => {
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
        this.reserve.forEach(/** 依次处理集合中的每个条目。 */(type, index) => {
            const item = new Node(`Reserved_${index}`);
            this.reserveNode.addChild(item);
            item.setPosition(-20 + index * 96, 0);
            item.setScale(0.75, 0.75, 1);
            this.drawTile(item, type, false);
            item.on(Node.EventType.TOUCH_END, /** 响应节点触摸或游戏事件。 */() => this.takeReservedTile(index));
        });
    }

    /** 更新关卡进度和热锅奖励提示。 */
    private updateProgress(): void {
        if (this.levelData.config.level === 3) {
            const cleared = this.clearedTileCount();
            const next = (this.rewardedMilestones + 1) * 100;
            this.progressLabel.fontSize = 26;
            this.progressLabel.string = next <= this.levelData.total
                ? `距离下一次获取道具还有${Math.max(0, next - cleared)}个`
                : '本局开锅道具已全部领取，继续捞！';
        } else {
            const tilesById = new Map(this.levelData.tiles.map(/** 将当前条目转换为后续处理所需的值。 */tile => [tile.id, tile] as const));
            const open = this.levelData.tiles.filter(/** 按条件筛选或判断条目：this.isTileSelectable(tile, tilesById)。 */tile => this.isTileSelectable(tile, tilesById)).length;
            this.progressLabel.fontSize = 26;
            this.progressLabel.string = `剩余 ${this.remainingTiles()} / ${this.levelData.total}    ·    可拿 ${open} 张`;
        }
    }

    /** 计算当前关卡已经消除的牌数。 */
    private clearedTileCount(): number {
        return this.levelData.total - this.remainingTiles() - this.tray.length - this.reserve.length;
    }

    /** 按进度发放热锅奖励并避免重复领取。 */
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

    /** 创建道具按钮和剩余次数显示。 */
    private makeToolButton(type: ToolType, position: Vec3, fill: string, callback: () => void): Node {
        const button = makeButton(this.toolBar, '', position, 208, 84, fill, callback);
        drawLacquerButton(button, 208, 84);
        button.name = `Tool_${type}`;
        const icon = new Node('ToolIcon');
        button.addChild(icon);
        icon.setPosition(-50, 0);
        icon.setScale(0.7, 0.7, 1);
        makeLabel(button, TOOL_NAMES[type], 25, '#FFF8E7', new Vec3(6, 0), 60, 40);
        transform(icon, 64, 44);
        const g = icon.addComponent(Graphics);
        g.strokeColor = hex('#FFF8E7');
        g.lineWidth = 6;
        const arrow = /** 处理 arrow 对应的游戏逻辑。 */(x: number, y: number, direction: number): void => {
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
        badge.setPosition(58, 0);
        drawRoundRect(badge, 34, 34, 17, '#713327', '#D5AE70', 1.5);
        makeLabel(badge, '1', 21, '#FFF8E7', Vec3.ZERO, 28, 28);
        return button;
    }

    /** 刷新道具可用状态与次数。 */
    private updateToolButtons(): void {
        (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach(/** 依次处理集合中的每个条目。 */(type) => {
            const button = this.toolButtons.get(type);
            if (!button) return;
            const label = button.getChildByName('UsesBadge')?.getChildByName('Label')?.getComponent(Label);
            const unlimited = this.levelIndex >= 1 && this.unlimitedTools[type];
            if (label) label.string = unlimited ? '∞' : String(this.toolUses[type]);
            const available = unlimited || this.toolUses[type] > 0;
            drawLacquerButton(button, 208, 84, available ? 'red' : 'muted');
            opacity(button, available ? 255 : 175);
        });
    }

    /** 检查当前是否允许使用指定道具。 */
    private canUseTool(type: ToolType): boolean {
        if (this.levelIndex < 1) return false;
        if (this.hasPlayerMenu()) return false;
        if (this.locked || this.gameEnded) {
            this.showToast('请等待当前动画结束', '#8A4B34');
            return false;
        }
        if (!this.unlimitedTools[type] && this.toolUses[type] <= 0) {
            this.showToast('本关道具次数已用完', '#8A4B34');
            return false;
        }
        return true;
    }

    /** 撤销上一手取牌并恢复棋盘。 */
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
        this.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */(tile) => {
            tile.removed = removed.has(tile.id);
        });
        this.lastMoveSnapshot = null;
        if (!this.unlimitedTools.undo) this.toolUses.undo -= 1;
        this.rebuildBoardTiles();
        this.renderTray();
        this.renderReserve();
        this.updateProgress();
        this.updateToolButtons();
        this.checkpointGame();
        this.showToast('已撤回上一次拿取', '#D86A3B');
    }

    /** 移除符合规则的一组三张或六张牌。 */
    private useBombTool(): void {
        if (!this.canUseTool('bomb')) return;
        const targets = selectBombTargets(this.levelData.tiles);
        if (targets.length === 0) {
            this.showToast('棋盘上没有满 3 张的同类食材', '#8A4B34');
            return;
        }
        targets.forEach(/** 依次处理集合中的每个条目。 */(tile) => {
            tile.removed = true;
            const node = this.tileNodes.get(tile.id);
            node?.removeFromParent();
            node?.destroy();
            this.tileNodes.delete(tile.id);
        });
        // 清空旧撤回快照，防止撤回拿牌时复活已经炸掉的牌。
        this.lastMoveSnapshot = null;
        if (!this.unlimitedTools.bomb) this.toolUses.bomb -= 1;
        // 复用其余牌及图片节点，只重画遮挡状态发生变化的牌。
        this.refreshTileStates();
        const reward = this.grantBoilRewards();
        this.updateProgress();
        this.updateToolButtons();
        this.playEffect('match', 0.82);
        this.showToast(reward || `炸掉 ${targets.length} 张${getIngredient(targets[0].type).name}`, '#A14425');
        if (this.isBoardCleared()) this.endGame(true);
        else this.checkpointGame();
    }

    /** 重排未移除食材并播放翻锅动画。 */
    private useShuffleTool(): void {
        if (!this.canUseTool('shuffle')) return;
        const activeTiles = this.levelData.tiles.filter(/** 按条件筛选或判断条目：!tile.removed。 */(tile) => !tile.removed);
        if (activeTiles.length < 2) {
            this.showToast('剩余食材不足，无法翻锅', '#8A4B34');
            return;
        }
        const types = activeTiles.map(/** 将当前条目转换为后续处理所需的值。 */(tile) => tile.type);
        for (let i = types.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }
        const shuffledLevel = this.levelData;
        this.locked = true;
        this.lastMoveSnapshot = null;
        if (!this.unlimitedTools.shuffle) this.toolUses.shuffle -= 1;
        this.updateToolButtons();
        this.showToast('翻锅中，整锅食材重新拌匀！', '#D86A3B');
        // Every remaining board tile joins the pile, including covered layers.
        // Independent paths and rotations imitate mixing mahjong tiles on a table.
        activeTiles.forEach(/** 依次处理集合中的每个条目。 */(tile, index) => {
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
        tween(this.board).delay(0.91).call(/** 在动画到达指定阶段后更新游戏状态。 */() => {
            if (this.levelData !== shuffledLevel) return;
            activeTiles.forEach(/** 依次处理集合中的每个条目。 */(tile, index) => {
                tile.type = types[index];
                const node = this.tileNodes.get(tile.id);
                if (!node) return;
                const selectable = this.isTileSelectable(tile);
                (node as Node & {
                    /** selectableState 对应的状态或配置。 */ selectableState?: boolean
                }).selectableState = selectable;
                this.drawTile(node, tile.type, !selectable);
            });
        }).delay(0.47).call(/** 在动画到达指定阶段后更新游戏状态。 */() => {
            if (this.levelData !== shuffledLevel) return;
            this.locked = false;
            this.checkpointGame();
            this.showToast('翻锅完成，接着捞！', '#D86A3B');
        }).start();
    }

    /** 根据关卡数据重建棋盘牌节点。 */
    private rebuildBoardTiles(): void {
        this.board.children.slice().forEach(/** 依次处理集合中的每个条目。 */(child) => {
            if (!child.name.startsWith('Tile_')) return;
            child.removeFromParent();
            child.destroy();
        });
        this.tileNodes.clear();
        this.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */(tile) => {
            if (!tile.removed) this.createTileNode(tile);
        });
        this.refreshTileStates();
    }

    /** 显示短暂的文字提示。 */
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

    /** 显示重开关卡确认窗口。 */
    private showRestartConfirmation(): void {
        if (!this.levelData || this.hasPlayerMenu() || (this.locked && !this.gameEnded)) return;
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
            /** 在当前操作完成后更新相关游戏状态。 */() => this.dismissRestartConfirmation());
        makeButton(panel, '重新开始', new Vec3(130, -80), 230, 66, '#ED4A32', /** 在当前操作完成后更新相关游戏状态。 */() => {
            this.dismissRestartConfirmation();
            this.restartLevel();
        });
        panel.setScale(0.82, 0.82, 1);
        tween(panel).to(0.18, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
    }

    /** 关闭重开确认窗口。 */
    private dismissRestartConfirmation(): void {
        this.node.getChildByName('RestartConfirmOverlay')?.destroy();
    }

    /** 处理通关或失败，并保存本局结果。 */
    private endGame(won: boolean): void {
        const previousAchievements = this.knownAchievements;
        this.locked = true;
        this.gameEnded = true;
        this.lastResult = won ? 'won' : 'lost';
        this.checkpointGame();
        this.playEffect(won ? 'win' : 'lose', 0.72);
        const overlay = new Node('ResultOverlay');
        this.node.addChild(overlay);
        transform(overlay, DESIGN_WIDTH, this.viewportHeight);
        const scrim = new Node('ModalScrim');
        overlay.addChild(scrim);
        drawRoundRect(scrim, DESIGN_WIDTH, this.viewportHeight, 0, '#29150FAA');
        overlay.addComponent(BlockInputEvents);
        const overlayAlpha = opacity(scrim, 0);
        tween(overlayAlpha).to(0.18, {opacity: 255}).start();

        const panel = new Node('ResultPanel');
        overlay.addChild(panel);
        panel.setPosition(0, 35);
        panel.setScale(0.75, 0.75, 1);
        if (!won) {
            this.drawFailurePanel(panel);
            tween(panel).to(0.24, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
            return;
        }
        drawLacquerPanel(panel, 600, 860);
        makePanelHeading(panel, '锅底见啦！', 314);
        makeLabel(panel, `第${this.levelIndex + 1}关 · ${this.levelData.config.title}`,
            25, '#947158', new Vec3(0, 250), 500, 42);
        this.addModalEmblem(panel, true, new Vec3(0, 98), 270);
        makeLabel(panel, this.levelIndex < LEVELS.length - 1 ? '所有食材都已经下锅\n下一关会有更多叠层' :
            '所有食材都已经下锅\n三关盛宴，圆满收锅！', 25, '#775145', new Vec3(0, -94), 480, 84, true);
        const earned = this.playerService ? achievementEntries(this.playerService.state)
            .filter(/** 按条件筛选或判断条目：item.unlocked && !previousAchievements.has(item.id)。 */item => item.unlocked && !previousAchievements.has(item.id)) : [];
        if (earned.length) makeLabel(panel, `新成就：${earned.map(/** 将当前条目转换为后续处理所需的值。 */item => item.title).join(' · ')}`,
            21, '#A3613B', new Vec3(0, -164), 500, 36);
        if (this.levelIndex < LEVELS.length - 1) {
            makeButton(panel, '下一关', new Vec3(0, -240), 460, 74, '#D75542', /** 在当前操作完成后更新相关游戏状态。 */() => this.nextLevel());
        } else {
            makeButton(panel, '再玩一遍', new Vec3(0, -240), 460, 74, '#D75542', /** 在当前操作完成后更新相关游戏状态。 */() => this.loadLevel(0));
        }
        makeButton(panel, '返回游戏', new Vec3(0, -334), 460, 64, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => this.dismissOverlay());
        makeButton(panel, '×', new Vec3(250, 376), 48, 48, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => this.dismissOverlay());
        tween(panel).to(0.2, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
    }

    /** 关闭当前结果弹窗。 */
    private dismissOverlay(): void {
        this.node.getChildByName('ResultOverlay')?.destroy();
    }

    /** 关闭指定的玩家菜单。 */
    private dismissPlayerMenu(name: string): void {
        const overlay = this.node.getChildByName(name);
        overlay?.removeFromParent();
        overlay?.destroy();
        this.playerStatusLabel = null;
        this.playerSaveLabel = null;
    }

    /** 创建通用玩家菜单面板。 */
    private makePlayerMenu(name: string, height: number): Node | null {
        if (!this.playerService || !this.levelData || this.hasPlayerMenu() || (this.locked && !this.gameEnded)) return null;
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
        const close = makeButton(panel, '×', new Vec3(280, height / 2 - 43), 44, 44, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => {
            if (name === 'PlayerOverlay' && this.playerService?.status === 'connecting') return;
            this.dismissPlayerMenu(name);
        });
        close.name = 'MenuClose';
        return panel;
    }

    /** 为弹窗加载胜利或失败徽章。 */
    private addModalEmblem(panel: Node, won: boolean, position: Vec3, size: number): void {
        const emblem = new Node(won ? 'SuccessEmblem' : 'FailureEmblem');
        panel.addChild(emblem);
        emblem.setPosition(position);
        transform(emblem, size, size);
        const fallback = makeLabel(emblem, won ? '开席' : '满锅', 46, '#A3613B', Vec3.ZERO, size, 80);
        if (!resources?.load) return;
        resources.load('backgrounds/modal-emblems-c/texture', Texture2D, /** 在资源加载完成后更新有效节点或处理失败。 */(error, texture) => {
            if (!emblem.isValid || error || !texture) return;
            const cell = Math.round(texture.width / 2);
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(won ? 0 : cell, 0, won ? cell : texture.width - cell, texture.height);
            const sprite = emblem.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            fallback.node.active = false;
        });
    }

    /** 生成当前玩家存档的摘要文字。 */
    private playerSaveText(): string {
        const service = this.playerService!;
        const save = service.state.save;
        return save ? `第${save.levelIndex + 1}关 · ${save.removedIds.length}张已拿取 · 云版本${service.revision}` : '还没有存档';
    }

    /** 展示玩家档案、地区和同步状态。 */
    private showPlayerProfile(): void {
        const panel = this.makePlayerMenu('PlayerOverlay', 970);
        if (!panel) return;
        const service = this.playerService!;
        makePanelHeading(panel, '我的小馆档案', 387, 470);
        const card = /** 处理 card 对应的游戏逻辑。 */(name: string, y: number, height: number): void => {
            const node = new Node(name);
            panel.addChild(node);
            node.setPosition(0, y);
            drawRoundRect(node, 556, height, 16, '#F5E4C7', '#DEC498', 1.5);
        };
        card('IdentityCard', 284, 96);
        card('RegionCard', 153, 132);
        card('SaveCard', -12, 158);
        makeLabel(panel, service.playerId ? `玩家编号 ${service.playerId.slice(0, 8)} · 开发版` : '本机玩家 · 开发版',
            26, '#775145', new Vec3(0, 284), 520, 42);
        const path = regionPath(service.regions, service.state.profile.regionCodes);
        makeLabel(panel, path.length ? path.map(/** 将当前条目转换为后续处理所需的值。 */item => item.name).join(' / ') : '地区尚未选择',
            25, '#775145', new Vec3(-65, 153), 350, 90, true);
        this.playerStatusLabel = makeLabel(panel, service.statusText, 24, '#547344', new Vec3(0, 23), 520, 42);
        this.playerSaveLabel = makeLabel(panel, this.playerSaveText(),
            23, '#94735D', new Vec3(0, -38), 510, 64, true);
        makeButton(panel, '选择地区', new Vec3(188, 153), 152, 58, '#A3613B', /** 在当前操作完成后更新相关游戏状态。 */() => {
            if (service.status === 'connecting') return;
            this.dismissPlayerMenu('PlayerOverlay');
            this.showRegionPicker([]);
        });
        makeButton(panel, service.isConflict ? '选择保留哪份存档' : service.playerId ? '同步存档' : '连接云端',
            new Vec3(0, -168), 510, 70, '#D75542', /** 在当前操作完成后更新相关游戏状态。 */() => {
                if (service.isConflict) {
                    this.dismissPlayerMenu('PlayerOverlay');
                    this.showSaveConflict();
                    return;
                }
                if (service.playerId) {
                    void service.flush();
                    return;
                }
                // 重新连接期间阻止重复点击。身份确认后再让玩家决定当前局与账号存档。
                if (service.status === 'connecting') return;
                void service.initialize().then(/** 处理异步任务完成或失败后的状态。 */() => {
                    if (!this.node.isValid || !service.playerId) return;
                    this.dismissPlayerMenu('PlayerOverlay');
                    if (service.beginDailySession()) {
                        this.loadLevel(0);
                        this.showPlayerProfile();
                        return;
                    }
                    const saved = service.state.save;
                    if (saved) this.showConnectedSaveChoice(saved);
                    else {
                        this.loadLevel(0);
                        this.showPlayerProfile();
                    }
                });
            });
        makeLabel(panel, '每次操作后自动保存\n断网时先保留在本机', 22, '#94735D', new Vec3(0, -266), 550, 70, true);
        makeButton(panel, '继续游戏', new Vec3(0, -380), 510, 66, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => {
            if (service.status === 'connecting') return;
            this.dismissPlayerMenu('PlayerOverlay');
        });
    }

    /** 让玩家选择已连接云端时保留哪份对局。 */
    private showConnectedSaveChoice(saved: GameSave): void {
        const panel = this.makePlayerMenu('ConnectedSaveOverlay', 520);
        if (!panel) return;
        const service = this.playerService!;
        makeLabel(panel, '账号已连接', 42, '#8D3426', new Vec3(0, 181), 570, 60);
        makeLabel(panel, `账号存档：第${saved.levelIndex + 1}关 · ${saved.removedIds.length}张已拿取\n当前这锅：第${this.levelIndex + 1}关 · ${this.levelData.tiles.filter(/** 按条件筛选或判断条目：tile.removed。 */tile => tile.removed).length}张已拿取`,
            26, '#775145', new Vec3(0, 81), 590, 110, true);
        makeLabel(panel, '选择要继续的进度，当前本机记录仍单独保留', 22, '#94735D', new Vec3(0, -13), 590, 48, true);
        const finish = /** 处理 finish 对应的游戏逻辑。 */(): void => {
            if (service.isConflict) this.showSaveConflict(); else this.showPlayerProfile();
        };
        makeButton(panel, '继续账号存档', new Vec3(0, -99), 400, 66, '#D75542', /** 在当前操作完成后更新相关游戏状态。 */() => {
            this.dismissPlayerMenu('ConnectedSaveOverlay');
            this.restoreGame(saved);
            finish();
        });
        makeButton(panel, '将当前这锅保存到账号', new Vec3(0, -186), 450, 66, '#A3613B', /** 在当前操作完成后更新相关游戏状态。 */() => {
            this.dismissPlayerMenu('ConnectedSaveOverlay');
            this.checkpointGame();
            finish();
        });
    }

    /** 为图鉴创建可裁剪的滚动区域。 */
    private makeCollectionScroll(panel: Node, height: number): Node {
        const viewport = new Node('CollectionViewport');
        panel.addChild(viewport);
        transform(viewport, 584, 618);
        viewport.addComponent(Mask);
        const content = new Node('CollectionContent');
        viewport.addChild(content);
        transform(content, 584, Math.max(618, height)).setAnchorPoint(0.5, 1);
        content.setPosition(0, 309);
        const scroll = viewport.addComponent(ScrollView);
        scroll.content = content;
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.elastic = false;
        scroll.inertia = true;
        scroll.cancelInnerEvents = true;
        return content;
    }

    /** 确认图鉴所需的滚动组件可用。 */
    private scrollComponentsReady(): boolean {
        if (Mask && ScrollView) return true;
        console.warn('[HotPot UI] Missing scroll components: enable Mask/UI and restart the editor preview.');
        this.showToast('列表暂未就绪，请重新进入游戏', '#A24A3C');
        return false;
    }

    /** 显示食材图鉴或成就列表。 */
    private showCollection(tab: 'ingredients' | 'achievements' = 'ingredients',
                           entry = {headingTaps: 0, ingredientTaps: 0}): void {
        if (!this.scrollComponentsReady()) return;
        const panel = this.makePlayerMenu('CollectionOverlay', 1120);
        if (!panel) return;
        const state = this.playerService!.state;
        const achievements = achievementEntries(state);
        const unlocked = achievements.filter(/** 按条件筛选或判断条目：item.unlocked。 */item => item.unlocked).length;
        const discovered = state.progress.discovered;
        const heading = makePanelHeading(panel, '小馆珍藏', 485, 420);
        heading.isBold = true;
        heading.node.on(Node.EventType.TOUCH_END, /** 响应节点触摸或游戏事件。 */() => {
            entry.headingTaps = Math.min(6, entry.headingTaps + 1);
            entry.ingredientTaps = 0;
        });
        makeLabel(panel, `食材 ${discovered.length} / ${INGREDIENTS.length}  ·  成就 ${unlocked} / ${achievements.length}`,
            25, '#94735D', new Vec3(0, 425), 570, 42);
        const switchTab = /** 处理 switchTab 对应的游戏逻辑。 */(next: 'ingredients' | 'achievements'): void => {
            if (next === 'ingredients' && entry.headingTaps === 6) {
                entry.ingredientTaps += 1;
                if (entry.ingredientTaps === 3) {
                    this.dismissPlayerMenu('CollectionOverlay');
                    this.showBackdoor();
                    return;
                }
            } else {
                entry.headingTaps = 0;
                entry.ingredientTaps = 0;
            }
            if (next === tab) return;
            this.dismissPlayerMenu('CollectionOverlay');
            this.showCollection(next, entry);
        };
        makeButton(panel, '食材图鉴', new Vec3(-148, 360), 270, 60,
            tab === 'ingredients' ? '#D75542' : '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => switchTab('ingredients'));
        makeButton(panel, '我的成就', new Vec3(148, 360), 270, 60,
            tab === 'achievements' ? '#D75542' : '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => switchTab('achievements'));

        if (tab === 'ingredients') {
            const content = this.makeCollectionScroll(panel, Math.ceil(INGREDIENTS.length / 2) * 188 + 8);
            INGREDIENTS.forEach(/** 依次处理集合中的每个条目。 */(ingredient, index) => {
                const known = discovered.indexOf(ingredient.id) >= 0;
                const card = makeButton(content, '', new Vec3(index % 2 ? 145 : -145, -96 - Math.floor(index / 2) * 188),
                    274, 172, known ? '#F8E8CD' : '#E9E0D0', /** 在当前操作完成后更新相关游戏状态。 */() => {
                        this.dismissPlayerMenu('CollectionOverlay');
                        this.showIngredientDetail(ingredient.id);
                    });
                const icon = new Node('CollectionIngredient');
                card.addChild(icon);
                icon.setPosition(0, 27);
                if (known && this.ingredientFrames.has(ingredient.id)) this.addIngredientImage(icon, ingredient.id, false, 92, 88);
                else makeLabel(icon, known ? ingredient.name.slice(0, 1) : '?', 64,
                    known ? ingredient.dark : '#B59C83', Vec3.ZERO, 100, 96);
                const name = makeLabel(card, known ? ingredient.name : '神秘食材', 26,
                    known ? '#744329' : '#9D8B77', new Vec3(0, -35), 250, 34);
                name.isBold = known;
                makeLabel(card, known ? INGREDIENT_STORIES[ingredient.id].tag : '拿取一次即可点亮', 18,
                    '#94735D', new Vec3(0, -67), 252, 26);
            });
        } else {
            const content = this.makeCollectionScroll(panel, achievements.length * 156 + 8);
            achievements.forEach(/** 依次处理集合中的每个条目。 */(item, index) => {
                const card = new Node(`Achievement_${item.id}`);
                content.addChild(card);
                card.setPosition(0, -80 - index * 156);
                drawRoundRect(card, 566, 140, 20, item.unlocked ? '#F6DFC0' : '#EEE7DC');
                const title = makeLabel(card, item.title, 29, item.unlocked ? '#8D3426' : '#806C57',
                    new Vec3(-57, 40), 414, 42);
                title.isBold = true;
                makeLabel(card, item.unlocked ? '已达成' : '进行中', 21, item.unlocked ? '#477345' : '#A88A6C',
                    new Vec3(216, 40), 100, 32);
                makeLabel(card, item.description, 22, '#94735D', new Vec3(0, -4), 520, 45, true);
                const bar = new Node('AchievementProgress');
                card.addChild(bar);
                bar.setPosition(-45, -46);
                drawRoundRect(bar, 390, 10, 5, '#D8C5AD');
                const g = bar.getComponent(Graphics)!;
                const filled = 390 * item.current / item.target;
                if (filled > 0) {
                    g.fillColor = hex(item.unlocked ? '#80A16A' : '#D39457');
                    g.roundRect(-195, -5, filled, 10, Math.min(5, filled / 2));
                    g.fill();
                }
                makeLabel(card, `${item.current} / ${item.target}`, 21, '#806C57', new Vec3(218, -46), 104, 32);
            });
        }
        makeLabel(panel, tab === 'ingredients' ? '上下滑动浏览，点选食材查看小档案' : '上下滑动浏览，达成后永久记录',
            22, '#94735D', new Vec3(0, -356), 580, 40);
        this.playerStatusLabel = makeLabel(panel, this.playerService!.statusText,
            21, '#94735D', new Vec3(0, -407), 580, 42, true);
        makeButton(panel, '返回游戏', new Vec3(0, -485), 330, 66, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => this.dismissPlayerMenu('CollectionOverlay'));
    }

    /** 显示本地调试菜单。 */
    private showBackdoor(): void {
        const panel = this.makePlayerMenu('BackdoorOverlay', 1020);
        if (!panel) return;
        makeLabel(panel, '后门设置', 42, '#8D3426', new Vec3(0, 438), 570, 62).isBold = true;
        makeLabel(panel, '选关 · 点击后开始新的一局', 25, '#94735D', new Vec3(0, 372), 570, 44);
        LEVELS.forEach(/** 依次处理集合中的每个条目。 */(level, index) => {
            const current = index === this.levelIndex;
            makeButton(panel, `${current ? '重开' : '进入'}第${index + 1}关 · ${level.title}`,
                new Vec3(0, 286 - index * 90), 540, 70, current ? '#D75542' : '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => {
                    this.dismissPlayerMenu('BackdoorOverlay');
                    this.loadLevel(index);
                    this.showBackdoor();
                });
        });
        makeLabel(panel, `当前第${this.levelIndex + 1}关 · 无限道具`, 28, '#744329', new Vec3(0, 16), 570, 44);
        if (this.levelIndex >= 1) {
            (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach(/** 依次处理集合中的每个条目。 */(type, index) => {
                const text = /** 处理 text 对应的游戏逻辑。 */(): string => `${TOOL_NAMES[type]}：${this.unlimitedTools[type] ? '无限使用' : '正常次数'}`;
                const button = makeButton(panel, text(), new Vec3(0, -62 - index * 84), 480, 64,
                    this.unlimitedTools[type] ? '#477345' : '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => {
                        this.unlimitedTools[type] = !this.unlimitedTools[type];
                        button.getChildByName('Label')!.getComponent(Label)!.string = text();
                        drawRoundRect(button, 480, 64, 20, this.unlimitedTools[type] ? '#477345' : '#B88261');
                        this.updateToolButtons();
                    });
                button.name = `Unlimited_${type}`;
            });
        } else {
            makeLabel(panel, '第一关不使用道具', 28, '#94735D', new Vec3(0, -140), 540, 60);
        }
        makeButton(panel, '本关只留3个相同食材', new Vec3(0, -316), 540, 64, '#D75542', /** 在当前操作完成后更新相关游戏状态。 */() => {
            this.dismissPlayerMenu('BackdoorOverlay');
            this.leaveThreeMatchingTiles();
        });
        makeLabel(panel, '无限开关仅本局有效，重开或切关后重置', 21, '#94735D', new Vec3(0, -377), 570, 32);
        makeButton(panel, '返回游戏', new Vec3(0, -444), 330, 66, '#B88261',
            /** 在当前操作完成后更新相关游戏状态。 */() => this.dismissPlayerMenu('BackdoorOverlay'));
    }

    /** 将调试棋盘缩减为可直接消除的三张牌。 */
    private leaveThreeMatchingTiles(): void {
        if (!this.levelData || this.hasPlayerMenu() || (this.locked && !this.gameEnded)) return;
        // 从原有牌中保留同类三张，必要时取回已移除的牌，维持存档的种类总数。
        const ordered = this.levelData.tiles.slice().sort(/** 按指定顺序比较并排列条目。 */(a, b) => b.layer - a.layer);
        const type = ordered.find(/** 按条件筛选或判断条目：!tile.removed。 */tile => !tile.removed)?.type || ordered[0]?.type;
        const kept = ordered.filter(/** 按条件筛选或判断条目：tile.type === type。 */tile => tile.type === type).slice(0, 3);
        if (kept.length !== 3) return;
        const keptIds = new Set(kept.map(/** 将当前条目转换为后续处理所需的值。 */tile => tile.id));
        this.clearMatchEffects();
        this.effectSource?.stop();
        this.dismissOverlay();
        this.dismissRestartConfirmation();
        this.levelData.tiles.forEach(/** 依次处理集合中的每个条目。 */tile => {
            tile.removed = !keptIds.has(tile.id);
        });
        this.tray = [];
        this.reserve = [];
        this.lastMoveSnapshot = null;
        this.combo = 0;
        this.locked = false;
        this.gameEnded = false;
        this.lastResult = 'playing';
        this.rebuildBoardTiles();
        this.renderTray();
        this.renderReserve();
        this.grantBoilRewards();
        this.updateProgress();
        this.updateToolButtons();
        this.checkpointGame();
        this.showToast('本关只剩3个相同食材，取完即可通关', '#D86A3B');
    }

    /** 显示单个食材的图鉴故事。 */
    private showIngredientDetail(type: IngredientType): void {
        const panel = this.makePlayerMenu('CollectionDetailOverlay', 780);
        if (!panel) return;
        const ingredient = getIngredient(type);
        const known = this.playerService!.state.progress.discovered.indexOf(type) >= 0;
        const title = makeLabel(panel, known ? ingredient.name : '尚未发现', 44, '#8D3426', new Vec3(0, 285), 560, 66);
        title.isBold = true;
        const icon = new Node('IngredientPortrait');
        panel.addChild(icon);
        icon.setPosition(0, 135);
        if (known && this.ingredientFrames.has(type)) this.addIngredientImage(icon, type, false, 182, 174);
        else makeLabel(icon, '?', 100, '#B59C83', Vec3.ZERO, 190, 180);
        makeLabel(panel, known ? INGREDIENT_STORIES[type].tag : '食材还藏在锅里', 27, '#A3613B', new Vec3(0, 9), 560, 45);
        makeLabel(panel, known ? INGREDIENT_STORIES[type].story :
                `在游戏中拿取这份食材即可点亮。继续挑战不同关卡，寻找藏在层层食材间的伙伴，收齐${INGREDIENTS.length}份小档案。`,
            27, '#775145', new Vec3(0, -94), 550, 148, true);
        makeLabel(panel, known ? '已收录 · 重开和撤回不会熄灭图鉴' : '发现方式：在棋盘上拿取一次',
            22, '#94735D', new Vec3(0, -216), 570, 40);
        makeButton(panel, '返回图鉴', new Vec3(0, -307), 330, 66, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => {
            this.dismissPlayerMenu('CollectionDetailOverlay');
            this.showCollection();
        });
    }

    /** 逐级显示可选择的地区。 */
    private showRegionPicker(codes: string[]): void {
        if (!this.scrollComponentsReady()) return;
        const panel = this.makePlayerMenu('RegionOverlay', 1040);
        if (!panel) return;
        const service = this.playerService!;
        let options = service.regions;
        const names: string[] = [];
        for (const code of codes) {
            const selected = options.find(/** 按条件筛选或判断条目：item.code === code。 */item => item.code === code)!;
            names.push(selected.name);
            options = selected.children || [];
        }
        const title = makeLabel(panel, '选择地区', 46, '#8D3426', new Vec3(0, 437), 580, 70);
        if (this.regionFont) {
            title.font = this.regionFont;
            title.useSystemFont = false;
        }
        makeLabel(panel, names.length ? names.join(' / ') : '请选择省份或海外', 25, '#775145',
            new Vec3(0, 367), 590, 50, true);

        // 独立裁剪窗口：滚动只移动地区卡片，标题和底部操作始终可见。
        const viewport = new Node('RegionViewport');
        panel.addChild(viewport);
        viewport.setPosition(0, -5);
        transform(viewport, 584, 616);
        viewport.addComponent(Mask);
        const content = new Node('RegionContent');
        viewport.addChild(content);
        const contentTransform = transform(content, 584, Math.max(616, options.length * 92 + 8));
        contentTransform.setAnchorPoint(0.5, 1);
        content.setPosition(0, 308);
        const scroll = viewport.addComponent(ScrollView);
        scroll.content = content;
        scroll.horizontal = false;
        scroll.vertical = true;
        scroll.inertia = true;
        scroll.elastic = false;
        // 拖动会取消卡片触摸，松手时不会误选滑过的城市。
        scroll.cancelInnerEvents = true;
        const currentCodes = service.state.profile.regionCodes;
        options.forEach(/** 依次处理集合中的每个条目。 */(region, index) => {
            const selected = codes.every(/** 按条件筛选或判断条目：currentCodes[i] === code。 */(code, i) => currentCodes[i] === code) &&
                currentCodes[codes.length] === region.code;
            const button = makeButton(content, region.name, new Vec3(0, -48 - index * 92), 548, 76,
                selected ? '#F6C887' : '#F3E2CA', /** 在当前操作完成后更新相关游戏状态。 */() => {
                    const next = [...codes, region.code];
                    if (region.children?.length) {
                        this.dismissPlayerMenu('RegionOverlay');
                        this.showRegionPicker(next);
                    } else {
                        service.setRegion(next);
                        this.dismissPlayerMenu('RegionOverlay');
                        this.showPlayerProfile();
                    }
                });
            const label = button.getChildByName('Label')!.getComponent(Label)!;
            transform(label.node, 438, 62);
            label.fontSize = 35;
            label.lineHeight = 46;
            label.color = hex('#744329');
            if (this.regionFont) {
                label.font = this.regionFont;
                label.useSystemFont = false;
            }
            if (region.children?.length) {
                const arrow = new Node('RegionArrow');
                button.addChild(arrow);
                const g = arrow.addComponent(Graphics);
                g.strokeColor = hex('#AD7950');
                g.lineWidth = 4;
                g.moveTo(234, 8);
                g.lineTo(242, 0);
                g.lineTo(234, -8);
                g.stroke();
            }
        });
        makeLabel(panel, options.length * 92 + 8 > 616 ? '上下滑动，找到你的地域' : '点选地区，记录小馆所在地',
            23, '#94735D', new Vec3(0, -359), 580, 42);
        makeButton(panel, codes.length ? '上一级' : '返回档案', new Vec3(-150, -445), 230, 64, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => {
            this.dismissPlayerMenu('RegionOverlay');
            if (codes.length) this.showRegionPicker(codes.slice(0, -1));
            else this.showPlayerProfile();
        });
        makeButton(panel, '取消', new Vec3(150, -445), 230, 64, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => {
            this.dismissPlayerMenu('RegionOverlay');
            this.showPlayerProfile();
        });
    }

    /** 显示本机与云端存档的冲突选项。 */
    private showSaveConflict(): void {
        const service = this.playerService!;
        if (!service?.remote) return;
        const panel = this.makePlayerMenu('CloudConflictOverlay', 650);
        if (!panel) return;
        const describe = /** 处理 describe 对应的游戏逻辑。 */(save: GameSave | null): string => save
            ? `第${save.levelIndex + 1}关 · ${save.removedIds.length}张已拿取 · ${save.status === 'playing' ? '进行中' : save.status === 'won' ? '已通关' : '托盘已满'}`
            : '没有进行中的对局';
        makeLabel(panel, '发现两份不同进度', 40, '#8D3426', new Vec3(0, 253), 580, 60);
        makeLabel(panel, '另一台设备已保存新进度，请选择要保留的一份', 24, '#94735D', new Vec3(0, 177), 590, 64, true);
        makeLabel(panel, `本机：${describe(service.state.save)}\n云端：${describe(service.remote.state.save)}`, 26,
            '#775145', new Vec3(0, 73), 580, 114, true);
        makeLabel(panel, '所选版本会同时保留该版本的地区资料', 22, '#AE5A3E', new Vec3(0, -24), 590, 40);
        makeButton(panel, '使用云端进度', new Vec3(0, -104), 400, 66, '#D75542', /** 在当前操作完成后更新相关游戏状态。 */() => {
            const state = service.resolveConflict(true);
            this.dismissPlayerMenu('CloudConflictOverlay');
            if (state.save) this.restoreGame(state.save); else this.loadLevel(0);
        });
        makeButton(panel, '保留本机进度', new Vec3(0, -188), 400, 66, '#A3613B', /** 在当前操作完成后更新相关游戏状态。 */() => {
            const state = service.resolveConflict(false);
            this.dismissPlayerMenu('CloudConflictOverlay');
            if (state.save) this.restoreGame(state.save); else this.loadLevel(0);
            void service.flush();
        });
        makeButton(panel, '稍后决定', new Vec3(0, -272), 290, 54, '#B88261', /** 在当前操作完成后更新相关游戏状态。 */() => this.dismissPlayerMenu('CloudConflictOverlay'));
    }

    /** 绘制失败弹窗中的操作区域。 */
    private drawFailurePanel(panel: Node): void {
        drawLacquerPanel(panel, 600, 920);
        const close = makeButton(panel, '×', new Vec3(250, 406), 48, 48, '#EAD8BD',
            /** 在当前操作完成后更新相关游戏状态。 */() => this.dismissOverlay());
        close.getChildByName('Label')!.getComponent(Label)!.color = hex('#805B43');

        makePanelHeading(panel, '托盘满啦', 335);
        makeLabel(panel, this.levelIndex === 2 ? '重试第三关会生成新牌阵' :
                this.reviveUsed ? '换个拿取顺序，再开一锅！' : '别急，这锅还有机会！',
            25, '#957158', new Vec3(0, 273), 470, 38);
        this.addModalEmblem(panel, false, new Vec3(0, 121), 244);

        const tip = new Node('ReviveExplanation');
        panel.addChild(tip);
        tip.setPosition(0, -66);
        drawRoundRect(tip, 476, 110, 18, '#F3E5CE');
        makeLabel(tip, this.reviveUsed ? '本局免费复活已使用' : '免费复活 · 本局还可用 1 次',
            25, '#8B4B30', new Vec3(0, 23), 444, 36);
        makeLabel(tip, this.reviveUsed ? '优先凑齐三张，给托盘留出空位' : '暂存前三张食材，腾出三格继续捞',
            22, '#927059', new Vec3(0, -23), 444, 34);

        makeButton(panel, this.reviveUsed ? (this.levelIndex === 2 ? '重试第三关' : '再开一锅') : '免费复活，继续捞',
            new Vec3(0, -198), 466, 80, '#C94E35',
            /** 在当前操作完成后更新相关游戏状态。 */() => this.reviveUsed ? this.restartLevel() : this.revive());
        if (!this.reviveUsed) {
            const restart = makeButton(panel, this.levelIndex === 2 ? '重试第三关' : '重新开始', new Vec3(0, -295), 466, 66, '#EAD8BD',
                /** 在当前操作完成后更新相关游戏状态。 */() => this.restartLevel());
            restart.getChildByName('Label')!.getComponent(Label)!.color = hex('#805B43');
        }
        makeLabel(panel, this.reviveUsed ? '重新开始后，可再次获得一次免费复活' : '寄存食材可随时点击取回',
            21, '#94735D', new Vec3(0, -381), 490, 38);
    }

    /** 重新开始当前关卡。 */
    private restartLevel(): void {
        this.loadLevel(this.levelIndex);
    }

    /** 进入下一关。 */
    private nextLevel(): void {
        if (this.levelIndex < LEVELS.length - 1) this.loadLevel(this.levelIndex + 1);
        else this.showToast('已经是最后一关', '#8A4B34');
    }
}
