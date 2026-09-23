import {
    _decorator, BlockInputEvents, Color, Component, Graphics, Label, Node,
    ResolutionPolicy, tween, UITransform, UIOpacity, Vec3, view,
} from 'cc';
import {
    createLevel, getIngredient, IngredientType, LevelData, LEVELS, TileData,
} from '../data/GameData';

const { ccclass } = _decorator;
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;
const TILE_WIDTH = 92;
const TILE_HEIGHT = 76;

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
    drawRoundRect(node, width, height, 18, fill, '#7D2D23', 3);
    makeLabel(node, text, 28, '#FFF8E7', new Vec3(0, 1), width - 18, height - 12);
    node.on(Node.EventType.TOUCH_START, () => {
        tween(node).stop();
        tween(node).to(0.07, { scale: new Vec3(0.94, 0.94, 1) }).start();
    });
    node.on(Node.EventType.TOUCH_END, () => {
        tween(node).stop();
        tween(node).to(0.08, { scale: Vec3.ONE }).start();
        callback();
    });
    node.on(Node.EventType.TOUCH_CANCEL, () => {
        tween(node).stop();
        tween(node).to(0.08, { scale: Vec3.ONE }).start();
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

    private board!: Node;
    private trayNode!: Node;
    private levelLabel!: Label;
    private progressLabel!: Label;
    private toastLabel!: Label;

    onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        this.node.children.slice().forEach((child) => {
            if (child.name !== 'Camera') child.destroy();
        });
        this.buildShell();
        this.loadLevel(0);
    }

    private buildShell(): void {
        const background = new Node('WarmBackground');
        this.node.addChild(background);
        drawRoundRect(background, DESIGN_WIDTH + 40, DESIGN_HEIGHT + 40, 0, '#F7E2BF');

        const topGlow = new Node('TopGlow');
        this.node.addChild(topGlow);
        topGlow.setPosition(0, 530);
        drawRoundRect(topGlow, DESIGN_WIDTH + 40, 260, 0, '#C94B3C');

        makeLabel(this.node, '火锅叠叠消', 38, '#FFF4D8', new Vec3(0, 574), 390, 54);
        this.levelLabel = makeLabel(this.node, '', 25, '#7E2D28', new Vec3(0, 496), 430, 42);
        makeButton(this.node, '‹', new Vec3(-285, 500), 66, 58, '#E87551', () => this.previousLevel());
        makeButton(this.node, '›', new Vec3(285, 500), 66, 58, '#E87551', () => this.nextLevel());

        const rulePill = new Node('RulePill');
        this.node.addChild(rulePill);
        rulePill.setPosition(0, 438);
        drawRoundRect(rulePill, 620, 48, 24, '#FFF4D8', '#E3A568', 2);
        this.progressLabel = makeLabel(rulePill, '', 22, '#7E3B2B', Vec3.ZERO, 580, 38);

        this.board = new Node('Board');
        this.node.addChild(this.board);
        this.board.setPosition(0, 125);
        transform(this.board, 680, 570);

        const boardBack = new Node('BoardBack');
        this.board.addChild(boardBack);
        drawRoundRect(boardBack, 680, 570, 36, '#E9B875', '#C77D4F', 3);
        const hotpot = new Node('HotpotDecoration');
        boardBack.addChild(hotpot);
        hotpot.setPosition(0, -20);
        const pot = hotpot.addComponent(Graphics);
        pot.fillColor = hex('#D6673C'); pot.circle(0, 0, 165); pot.fill();
        pot.fillColor = hex('#A8372D'); pot.circle(0, 0, 137); pot.fill();
        pot.strokeColor = hex('#F2C38D'); pot.lineWidth = 10; pot.circle(0, 0, 151); pot.stroke();
        opacity(hotpot, 58);

        makeLabel(this.node, '托盘  ·  凑齐 3 个自动消除', 24, '#77382A', new Vec3(0, -248), 600, 40);
        this.trayNode = new Node('Tray');
        this.node.addChild(this.trayNode);
        this.trayNode.setPosition(0, -335);
        drawRoundRect(this.trayNode, 676, 118, 28, '#8F4F37', '#6D3327', 4);

        makeLabel(this.node, '只有发亮的食材牌可以拿取', 21, '#8F5C43', new Vec3(0, -422), 630, 36);
        this.toastLabel = makeLabel(this.node, '', 30, '#FFFFFF', new Vec3(0, -478), 570, 48);
        opacity(this.toastLabel.node, 0);
        makeButton(this.node, '重新开始', new Vec3(0, -558), 260, 70, '#D75542', () => this.restartLevel());
    }

    private loadLevel(index: number): void {
        this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
        this.levelData = createLevel(this.levelIndex);
        this.tray = [];
        this.tileNodes.clear();
        this.locked = false;
        this.gameEnded = false;
        this.combo = 0;
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
        graphics.fillColor = hex(blocked ? '#9C8B74' : '#EAD5B5');
        graphics.circle(-16, 5, 24); graphics.fill();
        graphics.fillColor = hex(blocked ? '#7E7567' : ingredient.color);
        this.drawFoodShape(graphics, type, -16, 5);
        const name = makeLabel(node, ingredient.name, 20, blocked ? '#6F6255' : ingredient.dark,
            new Vec3(22, 1), 48, 46);
        opacity(node, blocked ? 172 : 255);
        opacity(name.node, blocked ? 150 : 255);
    }

    private drawFoodShape(graphics: Graphics, type: IngredientType, x: number, y: number): void {
        if (type === 'beef') {
            graphics.ellipse(x, y, 34, 22); graphics.fill();
            graphics.strokeColor = hex('#FFE1D1'); graphics.lineWidth = 3;
            graphics.moveTo(x - 10, y + 2); graphics.bezierCurveTo(x - 3, y + 10, x + 5, y - 8, x + 11, y + 3); graphics.stroke();
        } else if (type === 'shrimp') {
            graphics.lineWidth = 9; graphics.strokeColor = hex('#FF8B62');
            graphics.arc(x, y + 2, 14, Math.PI * 0.2, Math.PI * 1.75, false); graphics.stroke();
            graphics.fillColor = hex('#FFF0D8'); graphics.circle(x + 12, y + 7, 3); graphics.fill();
        } else if (type === 'vegetable') {
            graphics.circle(x - 7, y + 5, 11); graphics.circle(x + 6, y + 8, 12); graphics.circle(x, y - 3, 13); graphics.fill();
            graphics.strokeColor = hex('#E9F3C8'); graphics.lineWidth = 3; graphics.moveTo(x, y - 14); graphics.lineTo(x, y + 12); graphics.stroke();
        } else if (type === 'mushroom') {
            graphics.ellipse(x, y + 6, 34, 22); graphics.fill();
            graphics.fillColor = hex('#F4DFC2'); graphics.roundRect(x - 5, y - 14, 10, 17, 4); graphics.fill();
        } else if (type === 'corn') {
            graphics.roundRect(x - 9, y - 17, 18, 34, 8); graphics.fill();
            graphics.strokeColor = hex('#FFF0A2'); graphics.lineWidth = 2;
            graphics.moveTo(x - 8, y - 6); graphics.lineTo(x + 8, y - 6); graphics.moveTo(x - 8, y + 5); graphics.lineTo(x + 8, y + 5); graphics.stroke();
        } else {
            graphics.ellipse(x, y, 35, 18); graphics.fill();
            graphics.moveTo(x + 14, y); graphics.lineTo(x + 25, y + 10); graphics.lineTo(x + 25, y - 10); graphics.close(); graphics.fill();
            graphics.fillColor = hex('#F4FBFF'); graphics.circle(x - 9, y + 3, 3); graphics.fill();
        }
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
            tween(node).to(0.04, { position: new Vec3(start.x + 5, start.y, start.z) })
                .to(0.04, { position: new Vec3(start.x - 5, start.y, start.z) })
                .to(0.04, { position: start }).start();
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
        tween(node).to(0.08, { scale: new Vec3(0.9, 0.9, 1) })
            .to(0.2, { position: local, scale: new Vec3(0.72, 0.72, 1) }, { easing: 'cubicOut' })
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
            if (this.tray[i] === type) { insertAt = i + 1; break; }
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
        const matching = this.trayNode.children.filter((slot) => (slot as Node & { trayType?: IngredientType }).trayType === type);
        matching.slice(0, 3).forEach((slot) => {
            tween(slot).to(0.12, { scale: new Vec3(1.16, 1.16, 1) }).start();
            tween(opacity(slot)).to(0.25, { opacity: 0 }).start();
        });
        this.showToast(`${this.combo > 1 ? `连消 x${this.combo}  ` : ''}+30`, '#D64A36');
        this.scheduleOnce(() => {
            let removed = 0;
            this.tray = this.tray.filter((item) => {
                if (item === type && removed < 3) { removed += 1; return false; }
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
            drawRoundRect(slot, 82, 84, 14, '#F3D8AC', '#6E392C', 2);
            if (this.tray[i]) {
                (slot as Node & { trayType?: IngredientType }).trayType = this.tray[i];
                const ingredient = getIngredient(this.tray[i]);
                const food = new Node('TrayFood');
                slot.addChild(food);
                food.setPosition(0, 8);
                const graphics = food.addComponent(Graphics);
                graphics.fillColor = hex(ingredient.color);
                this.drawFoodShape(graphics, this.tray[i], 0, 0);
                makeLabel(slot, ingredient.name, 17, ingredient.dark, new Vec3(0, -27), 68, 24);
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
        tween(alpha).delay(0.75).to(0.35, { opacity: 0 }).start();
    }

    private endGame(won: boolean): void {
        this.locked = true;
        this.gameEnded = true;
        const overlay = new Node('ResultOverlay');
        this.node.addChild(overlay);
        drawRoundRect(overlay, DESIGN_WIDTH, DESIGN_HEIGHT, 0, '#5A241E');
        overlay.addComponent(BlockInputEvents);
        const overlayAlpha = opacity(overlay, 0);
        tween(overlayAlpha).to(0.18, { opacity: 232 }).start();

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
        tween(panel).to(0.2, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
    }

    private dismissOverlay(): void {
        this.node.getChildByName('ResultOverlay')?.destroy();
    }

    private restartLevel(): void { this.loadLevel(this.levelIndex); }

    private previousLevel(): void {
        if (this.levelIndex > 0) this.loadLevel(this.levelIndex - 1);
        else this.showToast('已经是第一关', '#8A4B34');
    }

    private nextLevel(): void {
        if (this.levelIndex < LEVELS.length - 1) this.loadLevel(this.levelIndex + 1);
        else this.showToast('已经是最后一关', '#8A4B34');
    }
}
