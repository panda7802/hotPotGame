import {BlockInputEvents, Graphics, Label, Node, tween, Vec3,} from 'cc';

import {getIngredient, LEVELS, selectBombTargets,} from '../data/GameData';

import {achievementEntries} from '../data/CollectionData';

import {
  BOIL_STAGES,
  DESIGN_WIDTH,
  drawLacquerButton,
  drawLacquerPanel,
  drawRoundRect,
  hex,
  makeButton,
  makeLabel,
  makePanelHeading,
  opacity,
  TOOL_NAMES,
  ToolType,
  transform,
} from './HotPotUi';

import {HotPotBoard} from './HotPotBoard';

/**
 * HotPotTools：道具、动画与结算。
 */
export abstract class HotPotTools extends HotPotBoard {

  /**
   * 更新关卡进度和热锅奖励提示。
   */
  protected updateProgress(): void {
    if (this.levelData.config.level === 3) {
      const cleared = this.clearedTileCount();
      const next = (this.rewardedMilestones + 1) * 100;
      this.progressLabel.fontSize = 26;
      this.progressLabel.string = next <= this.levelData.total
        ? `距离下一次获取道具还有${Math.max(0, next - cleared)}个`
        : '本局开锅道具已全部领取，继续捞！';
    } else {
      const tilesById = new Map(this.levelData.tiles.map(/**
       * 将当前条目转换为后续处理所需的值。
       */tile => [tile.id, tile] as const));
      const open = this.levelData.tiles.filter(/**
       * 按条件筛选或判断条目：this.isTileSelectable(tile, tilesById)。
       */tile => this.isTileSelectable(tile, tilesById)).length;
      this.progressLabel.fontSize = 26;
      this.progressLabel.string = `剩余 ${this.remainingTiles()} / ${this.levelData.total}    ·    可拿 ${open} 张`;
    }
  }

  /**
   * 计算当前关卡已经消除的牌数。
   */
  protected clearedTileCount(): number {
    return this.levelData.total - this.remainingTiles() - this.tray.length - this.reserve.length;
  }

  /**
   * 按进度发放热锅奖励并避免重复领取。
   */
  protected grantBoilRewards(): string {
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

  /**
   * 创建道具按钮和剩余次数显示。
   */
  protected makeToolButton(type: ToolType, position: Vec3, fill: string, callback: () => void): Node {
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
    const arrow = /**
     * 处理 arrow 对应的游戏逻辑。
     */(x: number, y: number, direction: number): void => {
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

  /**
   * 刷新道具可用状态与次数。
   */
  protected updateToolButtons(): void {
    (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach(/**
     * 依次处理集合中的每个条目。
     */(type) => {
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

  /**
   * 检查当前是否允许使用指定道具。
   */
  protected canUseTool(type: ToolType): boolean {
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

  /**
   * 撤销上一手取牌并恢复棋盘。
   */
  protected useUndoTool(): void {
    if (!this.canUseTool('undo')) return;
    if (!this.lastMoveSnapshot) {
      this.showToast('还没有可以撤回的操作', '#8A4B34');
      return;
    }
    const removed = new Set(this.lastMoveSnapshot.removedIds);
    this.clearMatchEffects();
    this.tray = this.lastMoveSnapshot.tray.slice();
    this.reserve = this.lastMoveSnapshot.reserve.slice();
    this.levelData.tiles.forEach(/**
     * 依次处理集合中的每个条目。
     */(tile) => {
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

  /**
   * 移除符合规则的一组三张或六张牌。
   */
  protected useBombTool(): void {
    if (!this.canUseTool('bomb')) return;
    const targets = selectBombTargets(this.levelData.tiles);
    if (targets.length === 0) {
      this.showToast('棋盘上没有满 3 张的同类食材', '#8A4B34');
      return;
    }
    targets.forEach(/**
     * 依次处理集合中的每个条目。
     */(tile) => {
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

  /**
   * 重排未移除食材并播放翻锅动画。
   */
  protected useShuffleTool(): void {
    if (!this.canUseTool('shuffle')) return;
    const activeTiles = this.levelData.tiles.filter(/**
     * 按条件筛选或判断条目：!tile.removed。
     */(tile) => !tile.removed);
    if (activeTiles.length < 2) {
      this.showToast('剩余食材不足，无法翻锅', '#8A4B34');
      return;
    }
    const types = activeTiles.map(/**
     * 将当前条目转换为后续处理所需的值。
     */(tile) => tile.type);
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
    activeTiles.forEach(/**
     * 依次处理集合中的每个条目。
     */(tile, index) => {
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
    tween(this.board).delay(0.91).call(/**
     * 在动画到达指定阶段后更新游戏状态。
     */() => {
      if (this.levelData !== shuffledLevel) return;
      activeTiles.forEach(/**
       * 依次处理集合中的每个条目。
       */(tile, index) => {
        tile.type = types[index];
        const node = this.tileNodes.get(tile.id);
        if (!node) return;
        const selectable = this.isTileSelectable(tile);
        (node as Node & {
          /**
           * selectableState 对应的状态或配置。
           */ selectableState?: boolean
        }).selectableState = selectable;
        this.drawTile(node, tile.type, !selectable);
      });
    }).delay(0.47).call(/**
     * 在动画到达指定阶段后更新游戏状态。
     */() => {
      if (this.levelData !== shuffledLevel) return;
      this.locked = false;
      this.checkpointGame();
      this.showToast('翻锅完成，接着捞！', '#D86A3B');
    }).start();
  }

  /**
   * 根据关卡数据重建棋盘牌节点。
   */
  protected rebuildBoardTiles(): void {
    this.board.children.slice().forEach(/**
     * 依次处理集合中的每个条目。
     */(child) => {
      if (!child.name.startsWith('Tile_')) return;
      child.removeFromParent();
      child.destroy();
    });
    this.tileNodes.clear();
    this.levelData.tiles.forEach(/**
     * 依次处理集合中的每个条目。
     */(tile) => {
      if (!tile.removed) this.createTileNode(tile);
    });
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
      /**
       * 在当前操作完成后更新相关游戏状态。
       */() => this.dismissRestartConfirmation());
    makeButton(panel, '重新开始', new Vec3(130, -80), 230, 66, '#ED4A32', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => {
      this.dismissRestartConfirmation();
      this.restartLevel();
    });
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
    makeLabel(panel, `第${this.levelIndex + 1}关 · ${this.levelData.config.title}`,
      25, '#947158', new Vec3(0, 250), 500, 42);
    this.addModalEmblem(panel, true, new Vec3(0, 98), 270);
    makeLabel(panel, this.levelIndex < LEVELS.length - 1 ? '所有食材都已经下锅\n下一关会有更多叠层' :
      '所有食材都已经下锅\n三关盛宴，圆满收锅！', 25, '#775145', new Vec3(0, -94), 480, 84, true);
    const earned = this.playerService ? achievementEntries(this.playerService.state)
      .filter(/**
       * 按条件筛选或判断条目：item.unlocked && !previousAchievements.has(item.id)。
       */item => item.unlocked && !previousAchievements.has(item.id)) : [];
    if (earned.length) makeLabel(panel, `新成就：${earned.map(/**
     * 将当前条目转换为后续处理所需的值。
     */item => item.title).join(' · ')}`,
      21, '#A3613B', new Vec3(0, -164), 500, 36);
    if (this.levelIndex < LEVELS.length - 1) {
      makeButton(panel, '下一关', new Vec3(0, -240), 460, 74, '#D75542', /**
       * 在当前操作完成后更新相关游戏状态。
       */() => this.nextLevel());
    } else {
      makeButton(panel, '再玩一遍', new Vec3(0, -240), 460, 74, '#D75542', /**
       * 在当前操作完成后更新相关游戏状态。
       */() => this.loadLevel(0));
    }
    makeButton(panel, '返回游戏', new Vec3(0, -334), 460, 64, '#B88261', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => this.dismissOverlay());
    makeButton(panel, '×', new Vec3(250, 376), 48, 48, '#B88261', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => this.dismissOverlay());
    tween(panel).to(0.2, {scale: Vec3.ONE}, {easing: 'backOut'}).start();
  }

  /**
   * 关闭当前结果弹窗。
   */
  protected dismissOverlay(): void {
    this.node.getChildByName('ResultOverlay')?.destroy();
  }
}
