import {Graphics, Node, tween, Vec3} from 'cc';

import {getIngredient, IngredientType} from '../data/GameData';

import {
  drawFoodTile,
  drawTavernPanel,
  hex,
  makeLabel,
  opacity,
  transform,
  TRAY_IMAGE_HEIGHT,
  TRAY_IMAGE_WIDTH,
  TRAY_SPACING,
  TRAY_START_X,
} from './HotPotUi';

import {HotPotBoardActions} from './HotPotBoardActions';

/**
 * HotPotBoard：棋盘、托盘与消除。
 */
export abstract class HotPotBoard extends HotPotBoardActions {
  /**
   * 播放三消和后续托盘收拢动画。
   */
  protected animateMatch(matchStart: number): void {
    this.playEffect('match', 0.82);
    const trayItems = this.trayNode.children.filter(
      /**
       * 按条件筛选或判断条目：child.name.startsWith('TrayItem_')。
       */ (child) => child.name.startsWith('TrayItem_'),
    );
    const matching = trayItems.slice(matchStart, matchStart + 3);
    const effects = new Node('MatchEffects');
    this.trayNode.addChild(effects);
    // Commit the match before allowing another click. Animation nodes no
    // longer occupy slots and cannot modify a later tray or restarted game.
    this.tray.splice(matchStart, 3);
    matching.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (item) => {
        item.setParent(effects);
        const start = item.position.clone();
        tween(item)
          .to(0.08, {scale: new Vec3(1.12, 0.78, 1)})
          .to(
            0.18,
            {
              scale: new Vec3(1.2, 1.2, 1),
            },
            {easing: 'backOut'},
          )
          .delay(0.08)
          .to(
            0.22,
            {
              scale: new Vec3(0.02, 0.02, 1),
            },
            {easing: 'cubicIn'},
          )
          .start();
        tween(opacity(item)).delay(0.34).to(0.22, {opacity: 0}).start();
        this.createTrayMatchBurst(start.x, effects);
      },
    );

    // 与消除同时开始：直接移动右侧的真实食材节点，不创建副本、不保留原图。
    trayItems.slice(matchStart + 3).forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (item, followerOffset) => {
        const trayIndex = matchStart + 3 + followerOffset;
        const targetX = TRAY_START_X + (trayIndex - 3) * TRAY_SPACING;
        tween(item)
          .to(
            0.78,
            {
              position: new Vec3(targetX, 0),
              scale: Vec3.ONE,
            },
            {easing: 'sineInOut'},
          )
          .start();
      },
    );
    const reward = this.grantBoilRewards();
    this.updateProgress();
    this.showToast(
      reward || `${this.combo > 1 ? `连消 x${this.combo}  ` : ''}+30`,
      '#D64A36',
    );
    tween(effects)
      .delay(0.82)
      .call(
        /**
         * 在动画到达指定阶段后更新游戏状态。
         */ () => effects.destroy(),
      )
      .start();
    if (this.isBoardCleared()) {
      this.endGame(true);
    } else {
      this.locked = false;
      this.checkpointGame();
    }
  }

  /**
   * 移除上一轮的匹配特效。
   */
  protected clearMatchEffects(): void {
    this.trayNode.children
      .slice()
      .filter(
        /**
         * 按条件筛选或判断条目：child.name === 'MatchEffects'。
         */ (child) => child.name === 'MatchEffects',
      )
      .forEach(
        /**
         * 依次处理集合中的每个条目。
         */ (child) => {
          child.removeFromParent();
          child.destroy();
        },
      );
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
        const angle = (Math.PI * point) / 4;
        const length = point % 2 === 0 ? radius : radius * 0.3;
        const x = Math.cos(angle) * length;
        const y = Math.sin(angle) * length;
        if (point === 0) {
          graphics.moveTo(x, y);
        } else {
          graphics.lineTo(x, y);
        }
      }
      graphics.close();
      graphics.fill();

      const angle = (Math.PI * 2 * i) / 16;
      const distance = 80 + (i % 4) * 18;
      particle.setScale(0, 0, 1);
      tween(particle)
        .delay(0.26)
        .set({scale: Vec3.ONE})
        .to(
          0.5,
          {
            position: new Vec3(
              Math.max(
                -340,
                Math.min(340, centerX + Math.cos(angle) * distance),
              ),
              Math.sin(angle) * distance,
            ),
            scale: new Vec3(0.12, 0.12, 1),
            angle: i % 2 === 0 ? 150 : -150,
          },
          {easing: 'quadOut'},
        )
        .call(
          /**
           * 在动画到达指定阶段后更新游戏状态。
           */ () => particle.destroy(),
        )
        .start();
      tween(opacity(particle)).delay(0.4).to(0.36, {opacity: 0}).start();
    }
  }

  /**
   * 依据托盘数据重新绘制食材节点。
   */
  protected renderTray(): void {
    this.updateProgress();
    // destroy 在帧末才生效，先移出托盘，确保消除动画只选中本次创建的三个节点。
    this.trayNode.children.slice().forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (child) => {
        if (child.name === 'MatchEffects') {
          return;
        }
        child.removeFromParent();
        child.destroy();
      },
    );

    // 第一层只绘制固定槽位，补位时边框保持不动。
    for (let i = 0; i < this.levelData.config.traySize; i += 1) {
      const slot = new Node(`TraySlot_${i}`);
      this.trayNode.addChild(slot);
      slot.setPosition(TRAY_START_X + i * TRAY_SPACING, 0);
      drawTavernPanel(slot, 86, 94, 'slot');
    }

    // 第二层放真实食材节点；全部位于固定槽位之上，并可直接执行左移动画。
    for (let i = 0; i < this.tray.length; i += 1) {
      const type = this.tray[i];
      const item = new Node(`TrayItem_${i}`);
      this.trayNode.addChild(item);
      item.setPosition(TRAY_START_X + i * TRAY_SPACING, 0);
      transform(item, 82 * 1.2, 84 * 1.2);
      drawFoodTile(item, 80, 78);
      (
        item as Node & {
          /**
           * trayType 对应的状态或配置。
           */ trayType?: IngredientType;
        }
      ).trayType = type;
      const ingredient = getIngredient(type);
      if (this.ingredientFrames.has(type)) {
        this.addIngredientImage(
          item,
          type,
          false,
          TRAY_IMAGE_WIDTH,
          TRAY_IMAGE_HEIGHT,
        );
      } else {
        makeLabel(item, '?', 32, ingredient.dark, Vec3.ZERO, 56, 48);
      }
    }
  }

  /**
   * 统计棋盘上尚未移除的牌。
   */
  protected remainingTiles(): number {
    return this.levelData.tiles.filter(
      /**
       * 按条件筛选或判断条目：!tile.removed。
       */ (tile) => !tile.removed,
    ).length;
  }

  /**
   * 判断棋盘是否已经清空。
   */
  protected isBoardCleared(): boolean {
    return (
      this.remainingTiles() === 0 &&
      this.tray.length === 0 &&
      this.reserve.length === 0
    );
  }

  /**
   * 执行复活并恢复可继续操作的状态。
   */
  protected revive(): void {
    if (!this.gameEnded
      || this.reviveUsed ||
      this.tray.length < this.levelData.config.traySize) {
      return;
    }
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
    if (this.locked
      || this.gameEnded ||
      this.hasPlayerMenu() ||
      index < 0 ||
      index >= this.reserve.length) {
      return;
    }
    this.lastMoveSnapshot = {
      tray: this.tray.slice(),
      reserve: this.reserve.slice(),
      removedIds: this.levelData.tiles
        .filter(
          /**
           * 按条件筛选或判断条目：tile.removed。
           */ (tile) => tile.removed,
        )
        .map(
          /**
           * 将当前条目转换为后续处理所需的值。
           */ (tile) => tile.id,
        ),
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
    this.reserveNode.children.slice().forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (child) => {
        child.removeFromParent();
        child.destroy();
      },
    );
    this.reserveNode.active = this.reserve.length > 0;
    // Make room above the tray instead of covering playable board tiles.
    const scale = this.reserve.length > 0 ? 0.86 : 1;
    this.board.setScale(scale, scale, 1);
    if (!this.reserve.length) {
      return;
    }
    drawTavernPanel(this.reserveNode, 560, 90, 'wood');
    makeLabel(
      this.reserveNode,
      '寄存食材\n点击取回',
      22,
      '#FFF8E7',
      new Vec3(-174, 0),
      170,
      66,
      true,
    );
    this.reserve.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (type, index) => {
        const item = new Node(`Reserved_${index}`);
        this.reserveNode.addChild(item);
        item.setPosition(-20 + index * 96, 0);
        item.setScale(0.75, 0.75, 1);
        this.drawTile(item, type, false);
        item.on(
          Node.EventType.TOUCH_END,
          /**
           * 响应节点触摸或游戏事件。
           */ () => this.takeReservedTile(index),
        );
      },
    );
  }
}
