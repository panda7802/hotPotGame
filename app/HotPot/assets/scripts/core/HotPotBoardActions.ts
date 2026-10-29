import {Color, Node, Sprite, tween, UITransform, Vec3} from 'cc';

import {
  createLevel,
  getIngredient,
  IngredientType,
  LevelData,
  LEVELS,
  TileData,
} from '../data/GameData';

import {
  drawFoodTile,
  EIGHT_ROW_TILE_SCALE,
  hex,
  makeLabel,
  opacity,
  TILE_HEIGHT,
  TILE_IMAGE_HEIGHT,
  TILE_IMAGE_WIDTH,
  TILE_WIDTH,
  transform,
  TRAY_SPACING,
  TRAY_START_X,
} from './HotPotUi';

import {HotPotView} from './HotPotView';
import {CLIENT_BUILD} from './HotPotTileSkin';

/**
 * HotPotBoardActions：拆分后的前段场景行为。
 */
export abstract class HotPotBoardActions extends HotPotView {
  /**
   * 生成并显示指定关卡，按需保存。
   */
  protected loadLevel(
    index: number,
    persist = true,
    restored?: LevelData,
  ): void {
    const loadStartedAt = Date.now();
    this.runId = `${Date.now().toString(36)}-`
      + Math.random().toString(36).slice(2, 14);
    this.clearMatchEffects();
    const previousLevel = this.levelData;
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.levelData = restored || createLevel(
      this.levelIndex,
      undefined,
      previousLevel?.config.level === 3 ? previousLevel.layoutSeed : undefined,
    );
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
    this.toolUses = toolsEnabled
      ? {undo: 1, bomb: 1, shuffle: 1}
      : {undo: 0, bomb: 0, shuffle: 0};
    this.toolBar.active = toolsEnabled;
    this.updateToolButtons();
    this.effectSource?.stop();
    this.dismissOverlay();
    this.dismissRestartConfirmation();
    this.board.children.slice().forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (child) => {
        if (child.name.startsWith('Tile_')) {
          child.removeFromParent();
          child.destroy();
        }
      },
    );
    this.foodTransitionLayer.children.slice().forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (child) => child.destroy(),
    );
    this.levelLabel.string =
      '第 ' +
      String(this.levelData.config.level) +
      ' / ' +
      String(LEVELS.length) +
      ' 关  ·  ' +
      String(this.levelData.config.title) +
      '';
    this.refreshTileStates();
    this.renderTray();
    this.updateProgress();
    if (persist) {
      this.checkpointGame();
    }
    console.info(`[HotPot ${CLIENT_BUILD}] level=${this.levelIndex + 1}`
      + ` nodes=${this.tileNodes.size} loadMs=${Date.now() - loadStartedAt}`);
    // this.showToast('看清叠层，别让托盘塞满！', '#8A4B34');
  }

  /**
   * 为一张食材牌创建可点击的显示节点。
   */
  protected createTileNode(tile: TileData): void {
    const node = new Node(`Tile_${tile.id}`);
    this.board.addChild(node);
    node.setPosition(tile.x, tile.y, tile.layer);
    const tileScale =
      this.levelData.config.tileScale ||
      (this.levelData.config.rows === 8 ? EIGHT_ROW_TILE_SCALE : 1);
    node.setScale(tileScale, tileScale, 1);
    transform(node, TILE_WIDTH, TILE_HEIGHT);
    node.on(
      Node.EventType.TOUCH_END,
      /**
       * 响应节点触摸或游戏事件。
       */ () => this.onTileClicked(tile),
    );
    this.tileNodes.set(tile.id, node);
  }

  /**
   * 根据食材类型和遮挡状态绘制牌面。
   */
  protected drawTile(node: Node, type: IngredientType, blocked: boolean): void {
    node.children.slice().forEach(
      /**
       依次处理集合中的每个条目。
       */
      (child) => {
        child.removeFromParent();
        child.destroy();
      },
    );
    const ingredient = getIngredient(type);
    drawFoodTile(node, TILE_WIDTH, TILE_HEIGHT, blocked);
    if (this.ingredientFrames.has(type)) {
      this.addIngredientImage(
        node,
        type,
        blocked,
        TILE_IMAGE_WIDTH,
        TILE_IMAGE_HEIGHT,
      );
    } else {
      makeLabel(
        node,
        ingredient.name,
        26,
        blocked ? '#6F6255' : ingredient.dark,
        Vec3.ZERO,
        96,
        54,
      );
    }
    opacity(node, 255);
  }

  /**
   * 把食材图片裁切并放进牌面。
   */
  protected addIngredientImage(
    parent: Node,
    type: IngredientType,
    blocked: boolean,
    width: number,
    height: number,
  ): void {
    const frame = this.ingredientFrames.get(type);
    if (!frame) {
      return;
    }
    const image = new Node('IngredientImage');
    parent.addChild(image);
    // 按裁切后的资源比例等比适配，避免方形手绘图标被压扁。
    const scale = Math.min(
      width / frame.rect.width,
      height / frame.rect.height,
    );
    transform(image, frame.rect.width * scale, frame.rect.height * scale);
    const sprite = image.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    // 中性明暗保留食材本身的色相，避免全部染成黄褐色后难以辨认。
    sprite.color = blocked ? hex('#737373') : Color.WHITE;
  }

  /**
   * 按编号查找棋盘食材牌。
   */
  protected findTile(id: string): TileData | undefined {
    return this.levelData.tiles.find(
      /**
       * 按条件筛选或判断条目：tile.id === id。
       */ (tile) => tile.id === id,
    );
  }

  /**
   * 判断牌是否未移除且未被上层牌遮挡。
   */
  protected isTileSelectable(
    tile: TileData,
    tilesById?: ReadonlyMap<string, TileData>,
  ): boolean {
    if (tile.removed) {
      return false;
    }
    return !tile.blockedBy.some(
      /**
       * 按条件筛选或判断条目：{ const blocker = tilesById ? tilesById.get(id) :
       * this.findT。
       */ (id) => {
        const blocker = tilesById ? tilesById.get(id) : this.findTile(id);
        return blocker && !blocker.removed;
      },
    );
  }

  /**
   * 刷新全部牌的可选状态和外观。
   */
  protected refreshTileStates(): void {
    const tilesById = new Map(
      this.levelData.tiles.map(
        /**
         * 将当前条目转换为后续处理所需的值。
         */ (tile) => [tile.id, tile] as const,
      ),
    );
    // Repeated layers share exact positions. Only the highest remaining tile
    // at each position needs a node and sprites. Keep all
    // logical tiles, including those affected by bombs and shuffling.
    const frontTiles = new Map<string, TileData>();
    for (const tile of this.levelData.tiles) {
      if (tile.removed) {
        continue;
      }
      const key = `${tile.x}:${tile.y}`;
      const front = frontTiles.get(key);
      if (!front || tile.layer > front.layer) {
        frontTiles.set(key, tile);
      }
    }
    let sibling = 0;
    this.levelData.tiles.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (tile) => {
        if (tile.removed) {
          return;
        }
        const visible = frontTiles.get(`${tile.x}:${tile.y}`) === tile;
        if (visible && !this.tileNodes.has(tile.id)) {
          this.createTileNode(tile);
        }
        const node = this.tileNodes.get(tile.id);
        if (!node) {
          return;
        }
        node.active = visible;
        if (!node.active) {
          return;
        }
        // A newly exposed lower tile must remain behind higher layers.
        node.setSiblingIndex(sibling++);
        const selectable = this.isTileSelectable(tile, tilesById);
        if ((
            node as Node & {
              /**
               * selectableState 对应的状态或配置。
               */ selectableState?: boolean;
            }
          ).selectableState !== selectable) {
          (
            node as Node & {
              /**
               * selectableState 对应的状态或配置。
               */ selectableState?: boolean;
            }
          ).selectableState = selectable;
          this.drawTile(node, tile.type, !selectable);
        }
      },
    );
  }

  /**
   * 处理取牌、移动动画与后续消除。
   */
  protected onTileClicked(tile: TileData): void {
    if (this.locked || this.gameEnded || this.hasPlayerMenu() || tile.removed) {
      return;
    }
    const node = this.tileNodes.get(tile.id);
    if (!node) {
      return;
    }
    if (!this.isTileSelectable(tile)) {
      const start = node.position.clone();
      tween(node)
        .to(0.04, {position: new Vec3(start.x + 5, start.y, start.z)})
        .to(0.04, {position: new Vec3(start.x - 5, start.y, start.z)})
        .to(0.04, {position: start})
        .start();
      this.showToast('这张牌还被上层压着', '#A24A3C');
      return;
    }

    this.lastMoveSnapshot = {
      tray: this.tray.slice(),
      reserve: this.reserve.slice(),
      removedIds: this.levelData.tiles
        .filter(
          /**
           * 按条件筛选或判断条目：item.removed。
           */ (item) => item.removed,
        )
        .map(
          /**
           * 将当前条目转换为后续处理所需的值。
           */ (item) => item.id,
        ),
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
    tween(node)
      .to(0.08, {
        scale: new Vec3(startScale.x * 0.9, startScale.y * 0.9, 1),
      })
      .to(
        0.2,
        {
          position: targetLocal,
          scale: new Vec3(startScale.x * 0.72, startScale.y * 0.72, 1),
        },
        {easing: 'cubicOut'},
      )
      .call(
        /**
         * 在动画到达指定阶段后更新游戏状态。
         */ () => {
          node.destroy();
          if (this.levelData !== movingLevel) {
            return;
          }
          this.tileNodes.delete(tile.id);
          this.refreshTileStates();
          this.resolveTray();
        },
      )
      .start();
    this.updateProgress();
  }

  /**
   * 将食材插入托盘中相同种类旁边。
   */
  protected insertIntoTray(type: IngredientType): number {
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

  /**
   * 检查托盘中的连续三张并触发消除或失败。
   */
  protected resolveTray(): void {
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

  /**
   * 返回第一组三个连续同类食材的起始下标；没有则返回 -1。
   */
  protected findAdjacentMatch(): number {
    for (let i = 0; i <= this.tray.length - 3; i += 1) {
      if (this.tray[i] === this.tray[i + 1]
        && this.tray[i] === this.tray[i + 2]) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 播放匹配动画并整理托盘。
   */
  protected abstract animateMatch(matchStart: number): void;

  /**
   * 清除仍在运行的匹配特效。
   */
  protected abstract clearMatchEffects(): void;

  /**
   * 判断棋盘是否已经清空。
   */
  protected abstract isBoardCleared(): boolean;
}
