import {Graphics, Node, Tween, tween, Vec3} from 'cc';

import {IngredientType} from '../data/GameData';

import {
  drawTavernPanel,
  hex,
  makeButton,
  makeLabel,
  opacity,
  transform,
  TILE_HEIGHT,
  TILE_WIDTH,
  TRAY_SPACING,
  TRAY_START_X,
} from './HotPotUi';

import {HotPotBoardActions} from './HotPotBoardActions';

const RESERVE_PAGE_SIZE = 3;

/**
 * HotPotBoard：棋盘、托盘与消除。
 */
export abstract class HotPotBoard extends HotPotBoardActions {
  private reservePage = 0;

  /** 按逻辑槽位排序；绘制层级不作为食材顺序。 */
  protected trayItems(tray = this.trayNode): Node[] {
    return tray.children
      .filter((child) => child.name.startsWith('TrayItem_'))
      .sort((a, b) => Number(a.name.slice(9)) - Number(b.name.slice(9)));
  }

  protected animateTrayInsertion(index: number, tray = this.trayNode): void {
    for (const item of this.trayItems(tray)) {
      const oldIndex = Number(item.name.slice(9));
      const nextIndex = oldIndex >= index ? oldIndex + 1 : oldIndex;
      item.name = `TrayItem_${nextIndex}`;
      // 也接续上一轮尚未完成的左移，从当前位置平滑移动，不跳回起点。
      Tween.stopAllByTarget(item);
      tween(item).to(0.16, {
        position: new Vec3(TRAY_START_X + nextIndex * TRAY_SPACING, 0),
      }, {easing: 'sineInOut'}).start();
    }
  }

  /** 外层负责槽位与消除动画，内层一直保留原来的牌面和食材图片。 */
  protected acceptTrayTile(
    visual: Node, type: IngredientType, index: number,
    tray = this.trayNode, landingScale = new Vec3(80 / TILE_WIDTH, 78 / TILE_HEIGHT, 1),
  ): void {
    const item = new Node(`TrayItem_${index}`);
    tray.addChild(item);
    item.setPosition(TRAY_START_X + index * TRAY_SPACING, 0);
    transform(item, 82 * 1.2, 84 * 1.2);
    (item as Node & {trayType?: IngredientType}).trayType = type;
    visual.setParent(item);
    visual.name = 'FoodVisual';
    visual.setPosition(Vec3.ZERO);
    visual.setScale(landingScale);
  }

  /**
   * 播放三消和后续托盘收拢动画。
   */
  protected animateMatch(matchStart: number): void {
    this.tray.splice(matchStart, 3);
    this.playTrayMatch(this.trayNode, matchStart);
    const reward = this.grantBoilRewards();
    this.updateProgress();
    if (reward) this.showToast(reward, '#D64A36');
    if (this.isBoardCleared()) {
      this.endGame(true);
    } else {
      this.locked = false;
      this.checkpointGame();
    }
  }

  /** The settled tray data is independent of these transient match effects. */
  protected playTrayMatch(tray: Node, matchStart: number, finish?: () => void): void {
    this.playEffect('match', 0.82);
    const trayItems = this.trayItems(tray);
    const matching = trayItems.slice(matchStart, matchStart + 3);
    const effects = new Node('MatchEffects');
    tray.addChild(effects);
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
        item.name = `TrayItem_${trayIndex - 3}`;
        Tween.stopAllByTarget(item);
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
    tween(effects)
      .delay(0.82)
      .call(() => {
        effects.destroy();
        finish?.();
      })
      .start();
  }

  /**
   * 移除上一轮的匹配特效。
   */
  protected clearMatchEffects(): void {
    for (const item of this.trayItems()) {
      Tween.stopAllByTarget(item);
      item.setPosition(TRAY_START_X
        + Number(item.name.slice(9)) * TRAY_SPACING, 0);
    }
    this.board?.children.slice()
      .filter((child) => child.name === 'BombEffects')
      .forEach((child) => {
        child.removeFromParent();
        child.destroy();
      });
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
    // 固定槽位和未改变的食材都继续使用原节点，避免每次落槽重建整排。
    for (const child of this.trayNode.children.slice()) {
      if (child.name.startsWith('TrayItem_')) {
        const index = Number(child.name.slice(9));
        if (index < this.tray.length
          && (child as Node & {trayType?: IngredientType}).trayType
            === this.tray[index]) {
          continue;
        }
        Tween.stopAllByTarget(child);
      } else if (!child.name.startsWith('TraySlot_')
        || Number(child.name.slice(9)) < this.levelData.config.traySize) {
        continue;
      }
      child.removeFromParent();
      child.destroy();
    }
    for (let i = 0; i < this.levelData.config.traySize; i += 1) {
      if (this.trayNode.getChildByName(`TraySlot_${i}`)) {
        continue;
      }
      const slot = new Node(`TraySlot_${i}`);
      this.trayNode.addChild(slot);
      slot.setSiblingIndex(i);
      slot.setPosition(TRAY_START_X + i * TRAY_SPACING, 0);
      drawTavernPanel(slot, 86, 94, 'slot');
    }
    for (let i = 0; i < this.tray.length; i += 1) {
      if (this.trayNode.getChildByName(`TrayItem_${i}`)) {
        continue;
      }
      const visual = new Node('FoodVisual');
      transform(visual, TILE_WIDTH, TILE_HEIGHT);
      this.drawTile(visual, this.tray[i], false);
      this.acceptTrayTile(visual, this.tray[i], i);
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
  protected async revive(): Promise<void> {
    if (!this.gameEnded
      || (this.reviveUsed && this.levelIndex !== 2) ||
      this.tray.length < this.levelData.config.traySize) {
      return;
    }
    if (this.reviveUsed) {
      const level = this.levelData;
      const overlay = this.node.getChildByName('ResultOverlay');
      if (!overlay || !this.enabledInHierarchy) return;
      const result = await this.rewardedVideo.show();
      if (!this.enabledInHierarchy || this.levelData !== level || !this.gameEnded
        || !overlay.isValid || this.node.getChildByName('ResultOverlay') !== overlay) return;
      if (result !== 'completed') {
        if (result === 'busy') return;
        const hint = result === 'cancelled' ? '看完整段视频后才能复活'
          : result === 'unsupported' ? '请在微信小游戏中观看广告'
            : '广告暂不可用，请稍后重试';
        this.showToast(hint, '#A24A3C');
        return;
      }
    }
    this.reviveUsed = true;
    this.clearMatchEffects();
    this.reserve.push(...this.tray.splice(0, RESERVE_PAGE_SIZE));
    this.reservePage = Math.floor((this.reserve.length - 1) / RESERVE_PAGE_SIZE);
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
    this.trayPickInProgress = true;
    const type = this.reserve.splice(index, 1)[0];
    this.insertIntoTray(type);
    this.renderReserve();
    const movingLevel = this.levelData;
    // Taking the last tile hides reserveNode and pauses its node tweens.
    // Settle on the game component so the click lock can still be released.
    this.scheduleOnce(() => {
      if (this.levelData === movingLevel) {
        this.resolveTray();
      }
    }, 0.18);
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
      this.reservePage = 0;
      return;
    }
    const pages = Math.ceil(this.reserve.length / RESERVE_PAGE_SIZE);
    this.reservePage = Math.min(this.reservePage, pages - 1);
    const offset = this.reservePage * RESERVE_PAGE_SIZE;
    drawTavernPanel(this.reserveNode, 560, 90, 'wood');
    makeLabel(
      this.reserveNode,
      pages > 1 ? `寄存 ${this.reserve.length} 张  ${this.reservePage + 1}/${pages}` : '寄存食材\n点击取回',
      22,
      '#FFF8E7',
      new Vec3(-174, pages > 1 ? 20 : 0),
      170,
      pages > 1 ? 32 : 66,
      true,
    );
    if (pages > 1) {
      const flip = (delta: number) => {
        if (this.locked || this.gameEnded || this.hasPlayerMenu()) return;
        this.reservePage += delta;
        this.renderReserve();
      };
      if (this.reservePage > 0)
        makeButton(this.reserveNode, '‹', new Vec3(-216, -19), 68, 39, '#B88261', () => flip(-1));
      if (this.reservePage + 1 < pages)
        makeButton(this.reserveNode, '›', new Vec3(-132, -19), 68, 39, '#B88261', () => flip(1));
    }
    this.reserve.slice(offset, offset + RESERVE_PAGE_SIZE).forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (type, slot) => {
        const index = offset + slot;
        const item = new Node(`Reserved_${index}`);
        this.reserveNode.addChild(item);
        item.setPosition(-20 + slot * 96, 0);
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
