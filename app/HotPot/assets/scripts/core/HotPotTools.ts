import {BlockInputEvents, Node, tween, Vec3} from 'cc';

import {LEVELS} from '../data/GameData';

import {achievementEntries} from '../data/CollectionData';

import {
  DESIGN_WIDTH,
  drawLacquerPanel,
  drawRoundRect,
  hex,
  makeButton,
  makeLabel,
  makePanelHeading,
  opacity,
  transform,
} from './HotPotUi';

import {HotPotToolActions} from './HotPotToolActions';

/**
 * HotPotTools：道具、动画与结算。
 */
export abstract class HotPotTools extends HotPotToolActions {
  /**
   * 重排未移除食材并播放翻锅动画。
   */
  protected useShuffleTool(): void {
    if (!this.canUseTool('shuffle')) {
      return;
    }
    const activeTiles = this.levelData.tiles.filter(
      /**
       * 按条件筛选或判断条目：!tile.removed。
       */ (tile) => !tile.removed,
    );
    if (activeTiles.length < 2) {
      this.showToast('剩余食材不足，无法翻锅', '#8A4B34');
      return;
    }
    const types = activeTiles.map(
      /**
       * 将当前条目转换为后续处理所需的值。
       */ (tile) => tile.type,
    );
    for (let i = types.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const shuffledLevel = this.levelData;
    this.locked = true;
    this.lastMoveSnapshot = null;
    if (!this.unlimitedTools.shuffle) {
      this.toolUses.shuffle -= 1;
    }
    this.updateToolButtons();
    this.showToast('翻锅中，整锅食材重新拌匀！', '#D86A3B');
    // Shuffle all logical tiles; animate only instantiated visible faces.
    // Independent paths and rotations imitate mixing mahjong tiles on a table.
    activeTiles.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (tile, index) => {
        const node = this.tileNodes.get(tile.id);
        if (!node || node.active === false) {
          return;
        }
        const start = node.position.clone();
        const scale = node.scale.clone();
        const direction = index % 2 === 0 ? 1 : -1;
        const pileX = (Math.random() - 0.5) * 360;
        const pileY = (Math.random() - 0.5) * 260;
        this.drawTile(node, tile.type, false);
        tween(node)
          .to(
            0.35,
            {
              position: new Vec3(pileX, pileY, start.z),
              angle: direction * (25 + Math.random() * 45),
              scale: new Vec3(scale.x * 0.8, scale.y * 0.8, 1),
            },
            {easing: 'sineInOut'},
          )
          .to(
            0.28,
            {
              position: new Vec3(
                -pileX * 0.85,
                pileY + direction * 55,
                start.z,
              ),
              angle: -direction * 65,
            },
            {easing: 'sineInOut'},
          )
          .to(
            0.28,
            {
              position: new Vec3(pileX * 0.65, -pileY, start.z),
              angle: direction * 35,
            },
            {easing: 'sineInOut'},
          )
          .to(
            0.45,
            {
              position: start,
              angle: 0,
              scale,
            },
            {easing: 'cubicOut'},
          )
          .start();
      },
    );
    tween(this.board)
      .delay(0.91)
      .call(
        /**
         * 在动画到达指定阶段后更新游戏状态。
         */ () => {
          if (this.levelData !== shuffledLevel) {
            return;
          }
          activeTiles.forEach(
            /**
             * 依次处理集合中的每个条目。
             */ (tile, index) => {
              tile.type = types[index];
              const node = this.tileNodes.get(tile.id);
              if (!node || node.active === false) {
                return;
              }
              const selectable = this.isTileSelectable(tile);
              (
                node as Node & {
                  /**
                   * selectableState 对应的状态或配置。
                   */ selectableState?: boolean;
                }
              ).selectableState = selectable;
              this.drawTile(node, tile.type, !selectable);
            },
          );
        },
      )
      .delay(0.47)
      .call(
        /**
         * 在动画到达指定阶段后更新游戏状态。
         */ () => {
          if (this.levelData !== shuffledLevel) {
            return;
          }
          this.locked = false;
          this.checkpointGame();
          this.showToast('翻锅完成，接着捞！', '#D86A3B');
        },
      )
      .start();
  }

  /**
   * 根据关卡数据重建棋盘牌节点。
   */
  protected rebuildBoardTiles(): void {
    this.board.children.slice().forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (child) => {
        if (!child.name.startsWith('Tile_')) {
          return;
        }
        child.removeFromParent();
        child.destroy();
      },
    );
    this.tileNodes.clear();
    this.refreshTileStates();
  }

  /**
   * 显示短暂的文字提示。
   */
  protected showToast(message: string, textColor: string): void {
    this.toastLabel.string = message;
    this.toastLabel.color = hex(textColor);
    const alpha = opacity(this.toastLabel.node, 255);
    const backgroundAlpha = opacity(this.toastLabel.node.parent!, 245);
    tween(backgroundAlpha).stop();
    tween(backgroundAlpha).delay(0.75).to(0.35, {opacity: 0}).start();
    tween(alpha).stop();
    tween(alpha).delay(0.75).to(0.35, {opacity: 0}).start();
  }

  /**
   * 显示重开关卡确认窗口。
   */
  protected showRestartConfirmation(): void {
    if (!this.levelData
      || this.hasPlayerMenu() ||
      (this.locked && !this.gameEnded)) {
      return;
    }
    if (this.node.getChildByName('RestartConfirmOverlay')) {
      return;
    }
    const overlay = new Node('RestartConfirmOverlay');
    this.node.addChild(overlay);
    drawRoundRect(overlay, DESIGN_WIDTH, this.viewportHeight, 0, '#421B17');
    overlay.addComponent(BlockInputEvents);
    opacity(overlay, 220);

    const panel = new Node('RestartConfirmPanel');
    overlay.addChild(panel);
    drawRoundRect(panel, 560, 310, 32, '#FFF9EF');
    makeLabel(panel, '确认重新开始？', 42, '#8D3426', new Vec3(0, 82), 470, 62);
    makeLabel(
      panel,
      '本关当前进度将会清空',
      24,
      '#8A6557',
      new Vec3(0, 25),
      450,
      42,
    );
    makeButton(
      panel,
      '取消',
      new Vec3(-130, -80),
      210,
      66,
      '#B88A6B',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.dismissRestartConfirmation(),
    );
    makeButton(
      panel,
      '重新开始',
      new Vec3(130, -80),
      230,
      66,
      '#ED4A32',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissRestartConfirmation();
        this.restartLevel();
      },
    );
    panel.setScale(0.82, 0.82, 1);
    tween(panel).to(0.18, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
  }

  /**
   * 关闭重开确认窗口。
   */
  protected dismissRestartConfirmation(): void {
    this.node.getChildByName('RestartConfirmOverlay')?.destroy();
  }

  /**
   * 处理通关或失败，并保存本局结果。
   */
  protected endGame(won: boolean): void {
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
    makeLabel(
      panel,
      `第${this.levelIndex + 1}关 · ${this.levelData.config.title}`,
      25,
      '#947158',
      new Vec3(0, 250),
      500,
      42,
    );
    this.addModalEmblem(panel, true, new Vec3(0, 98), 270);
    makeLabel(
      panel,
      this.levelIndex < LEVELS.length - 1
        ? '所有食材都已经下锅\n下一关会有更多叠层'
        : '所有食材都已经下锅\n三关盛宴，圆满收锅！',
      25,
      '#775145',
      new Vec3(0, -94),
      480,
      84,
      true,
    );
    const earned = this.playerService
      ? achievementEntries(this.playerService.state).filter(
          /**
           * 按条件筛选或判断条目：item.unlocked && !previousAchievements.has(item.id)。
           */ (item) => item.unlocked && !previousAchievements.has(item.id),
        )
      : [];
    if (earned.length) {
      makeLabel(
        panel,
        `新成就：${earned
          .map(
            /**
             * 将当前条目转换为后续处理所需的值。
             */ (item) => item.title,
          )
          .join(' · ')}`,
        21,
        '#A3613B',
        new Vec3(0, -164),
        500,
        36,
      );
    }
    if (this.levelIndex < LEVELS.length - 1) {
      makeButton(
        panel,
        '下一关',
        new Vec3(0, -240),
        460,
        74,
        '#D75542',
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ () => this.nextLevel(),
      );
    } else {
      makeButton(
        panel,
        '再玩一遍',
        new Vec3(0, -240),
        460,
        74,
        '#D75542',
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ () => this.loadLevel(0),
      );
    }
    makeButton(
      panel,
      '返回游戏',
      new Vec3(0, -334),
      460,
      64,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.dismissOverlay(),
    );
    makeButton(
      panel,
      '×',
      new Vec3(250, 376),
      48,
      48,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.dismissOverlay(),
    );
    tween(panel).to(0.2, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
  }

  /**
   * 关闭当前结果弹窗。
   */
  protected dismissOverlay(): void {
    this.node.getChildByName('ResultOverlay')?.destroy();
  }
}
