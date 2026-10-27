import {Color, Graphics, Node, Sprite, tween, UITransform, Vec3,} from 'cc';

import {createLevel, getIngredient, IngredientType, LEVELS, TileData,} from '../data/GameData';

import {
  drawFoodTile,
  drawTavernPanel,
  EIGHT_ROW_TILE_SCALE,
  hex,
  makeLabel,
  opacity,
  TILE_HEIGHT,
  TILE_IMAGE_HEIGHT,
  TILE_IMAGE_WIDTH,
  TILE_WIDTH,
  transform,
  TRAY_IMAGE_HEIGHT,
  TRAY_IMAGE_WIDTH,
  TRAY_SPACING,
  TRAY_START_X,
} from './HotPotUi';

import {HotPotView} from './HotPotView';

/**
 * HotPotBoard：棋盘、托盘与消除。
 */
export abstract class HotPotBoard extends HotPotView {

  /**
   * 生成并显示指定关卡，按需保存。
   */
  protected loadLevel(index: number, persist = true): void {
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
    this.board.children.slice().forEach(/**
     * 依次处理集合中的每个条目。
     */(child) => {
      if (child.name.startsWith('Tile_')) child.destroy();
    });
    this.foodTransitionLayer.children.slice().forEach(/**
     * 依次处理集合中的每个条目。
     */(child) => child.destroy());
    this.levelLabel.string = `第 ${this.levelData.config.level} / ${LEVELS.length} 关  ·  ${this.levelData.config.title}`;
    this.levelData.tiles.forEach(/**
     * 依次处理集合中的每个条目。
     */(tile) => this.createTileNode(tile));
    this.refreshTileStates();
    this.renderTray();
    this.updateProgress();
    if (persist) this.checkpointGame();
    // this.showToast('看清叠层，别让托盘塞满！', '#8A4B34');
  }

  /**
   * 为一张食材牌创建可点击的显示节点。
   */
  protected createTileNode(tile: TileData): void {
    const node = new Node(`Tile_${tile.id}`);
    this.board.addChild(node);
    node.setPosition(tile.x, tile.y, tile.layer);
    const tileScale = this.levelData.config.tileScale || (this.levelData.config.rows === 8 ? EIGHT_ROW_TILE_SCALE : 1);
    node.setScale(tileScale, tileScale, 1);
    transform(node, TILE_WIDTH, TILE_HEIGHT);
    node.on(Node.EventType.TOUCH_END, /**
     * 响应节点触摸或游戏事件。
     */() => this.onTileClicked(tile));
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
      (child) => child.destroy());
    const ingredient = getIngredient(type);
    drawFoodTile(node, TILE_WIDTH, TILE_HEIGHT, blocked);
    if (this.ingredientFrames.has(type)) {
      this.addIngredientImage(node, type, blocked, TILE_IMAGE_WIDTH, TILE_IMAGE_HEIGHT);
    } else {
      makeLabel(node, ingredient.name, 26, blocked ? '#6F6255' : ingredient.dark, Vec3.ZERO, 96, 54);
    }
    opacity(node, 255);
  }

  /**
   * 把食材图片裁切并放进牌面。
   */
  protected addIngredientImage(parent: Node, type: IngredientType, blocked: boolean,
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

  /**
   * 按编号查找棋盘食材牌。
   */
  protected findTile(id: string): TileData | undefined {
    return this.levelData.tiles.find(/**
     * 按条件筛选或判断条目：tile.id === id。
     */(tile) => tile.id === id);
  }

  /**
   * 判断牌是否未移除且未被上层牌遮挡。
   */
  protected isTileSelectable(tile: TileData, tilesById?: ReadonlyMap<string, TileData>): boolean {
    if (tile.removed) return false;
    return !tile.blockedBy.some(/**
     * 按条件筛选或判断条目：{ const blocker = tilesById ? tilesById.get(id) : this.findT。
     */(id) => {
      const blocker = tilesById ? tilesById.get(id) : this.findTile(id);
      return blocker && !blocker.removed;
    });
  }

  /**
   * 刷新全部牌的可选状态和外观。
   */
  protected refreshTileStates(): void {
    const tilesById = new Map(this.levelData.tiles.map(/**
     * 将当前条目转换为后续处理所需的值。
     */tile => [tile.id, tile] as const));
    this.levelData.tiles.forEach(/**
     * 依次处理集合中的每个条目。
     */(tile) => {
      if (tile.removed) return;
      const node = this.tileNodes.get(tile.id);
      if (!node) return;
      const selectable = this.isTileSelectable(tile, tilesById);
      if ((node as Node & {
        /**
         * selectableState 对应的状态或配置。
         */ selectableState?: boolean
      }).selectableState !== selectable) {
        (node as Node & {
          /**
           * selectableState 对应的状态或配置。
           */ selectableState?: boolean
        }).selectableState = selectable;
        this.drawTile(node, tile.type, !selectable);
      }
    });
  }

  /**
   * 处理取牌、移动动画与后续消除。
   */
  protected onTileClicked(tile: TileData): void {
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
      removedIds: this.levelData.tiles.filter(/**
       * 按条件筛选或判断条目：item.removed。
       */(item) => item.removed).map(/**
       * 将当前条目转换为后续处理所需的值。
       */(item) => item.id),
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
      .call(/**
       * 在动画到达指定阶段后更新游戏状态。
       */() => {
        node.destroy();
        if (this.levelData !== movingLevel) return;
        this.refreshTileStates();
        this.resolveTray();
      }).start();
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
      if (this.tray[i] === this.tray[i + 1] && this.tray[i] === this.tray[i + 2]) return i;
    }
    return -1;
  }

  /**
   * 播放三消和后续托盘收拢动画。
   */
  protected animateMatch(matchStart: number): void {
    this.playEffect('match', 0.82);
    const trayItems = this.trayNode.children.filter(/**
     * 按条件筛选或判断条目：child.name.startsWith('TrayItem_')。
     */(child) => child.name.startsWith('TrayItem_'));
    const matching = trayItems.slice(matchStart, matchStart + 3);
    const effects = new Node('MatchEffects');
    this.trayNode.addChild(effects);
    // Commit the match before allowing another click. Animation nodes no
    // longer occupy slots and cannot modify a later tray or restarted game.
    this.tray.splice(matchStart, 3);
    matching.forEach(/**
     * 依次处理集合中的每个条目。
     */(item) => {
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
    trayItems.slice(matchStart + 3).forEach(/**
     * 依次处理集合中的每个条目。
     */(item, followerOffset) => {
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
    tween(effects).delay(0.82).call(/**
     * 在动画到达指定阶段后更新游戏状态。
     */() => effects.destroy()).start();
    if (this.isBoardCleared()) this.endGame(true);
    else {
      this.locked = false;
      this.checkpointGame();
    }
  }

  /**
   * 移除上一轮的匹配特效。
   */
  protected clearMatchEffects(): void {
    this.trayNode.children.slice().filter(/**
     * 按条件筛选或判断条目：child.name === 'MatchEffects'。
     */child => child.name === 'MatchEffects').forEach(/**
     * 依次处理集合中的每个条目。
     */child => {
      child.removeFromParent();
      child.destroy();
    });
  }

  /**
   * 星芒从每张牌的原位向四周散开，三个节点沿同一时间轴同步消除。
   */
  protected createTrayMatchBurst(centerX: number, parent: Node): void {
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
        .call(/**
         * 在动画到达指定阶段后更新游戏状态。
         */() => particle.destroy())
        .start();
      tween(opacity(particle))
        .delay(0.4)
        .to(0.36, {opacity: 0})
        .start();
    }
  }

  /**
   * 依据托盘数据重新绘制食材节点。
   */
  protected renderTray(): void {
    this.updateProgress();
    // destroy 在帧末才生效，先移出托盘，确保消除动画只选中本次创建的三个节点。
    this.trayNode.children.slice().forEach(/**
     * 依次处理集合中的每个条目。
     */(child) => {
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
      (item as Node & {
        /**
         * trayType 对应的状态或配置。
         */ trayType?: IngredientType
      }).trayType = type;
      const ingredient = getIngredient(type);
      if (this.ingredientFrames.has(type)) {
        this.addIngredientImage(item, type, false, TRAY_IMAGE_WIDTH, TRAY_IMAGE_HEIGHT);
      } else {
        makeLabel(item, '?', 32, ingredient.dark, Vec3.ZERO, 56, 48);
      }
    }
  }

  /**
   * 统计棋盘上尚未移除的牌。
   */
  protected remainingTiles(): number {
    return this.levelData.tiles.filter(/**
     * 按条件筛选或判断条目：!tile.removed。
     */(tile) => !tile.removed).length;
  }

  /**
   * 判断棋盘是否已经清空。
   */
  protected isBoardCleared(): boolean {
    return this.remainingTiles() === 0 && this.tray.length === 0 && this.reserve.length === 0;
  }

  /**
   * 执行复活并恢复可继续操作的状态。
   */
  protected revive(): void {
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

  /**
   * 将暂存区的食材取回托盘。
   */
  protected takeReservedTile(index: number): void {
    if (this.locked || this.gameEnded || this.hasPlayerMenu() || index < 0 || index >= this.reserve.length) return;
    this.lastMoveSnapshot = {
      tray: this.tray.slice(), reserve: this.reserve.slice(),
      removedIds: this.levelData.tiles.filter(/**
       * 按条件筛选或判断条目：tile.removed。
       */tile => tile.removed).map(/**
       * 将当前条目转换为后续处理所需的值。
       */tile => tile.id),
    };
    this.locked = true;
    const type = this.reserve.splice(index, 1)[0];
    this.insertIntoTray(type);
    this.renderReserve();
    this.resolveTray();
  }

  /**
   * 重新绘制暂存区的食材。
   */
  protected renderReserve(): void {
    this.reserveNode.children.slice().forEach(/**
     * 依次处理集合中的每个条目。
     */child => {
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
    this.reserve.forEach(/**
     * 依次处理集合中的每个条目。
     */(type, index) => {
      const item = new Node(`Reserved_${index}`);
      this.reserveNode.addChild(item);
      item.setPosition(-20 + index * 96, 0);
      item.setScale(0.75, 0.75, 1);
      this.drawTile(item, type, false);
      item.on(Node.EventType.TOUCH_END, /**
       * 响应节点触摸或游戏事件。
       */() => this.takeReservedTile(index));
    });
  }
}
