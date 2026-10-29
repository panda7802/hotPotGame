import {Graphics, Label, Node, Vec3} from 'cc';

import {getIngredient, selectBombTargets} from '../data/GameData';

import {
  BOIL_STAGES,
  drawLacquerButton,
  drawRoundRect,
  hex,
  makeButton,
  makeLabel,
  opacity,
  setButtonEnabled,
  TOOL_NAMES,
  ToolType,
  transform,
} from './HotPotUi';

import {HotPotBoard} from './HotPotBoard';
import {getPageTheme} from '../data/PageTheme';

/**
 * HotPotToolActions：拆分后的前段场景行为。
 */
export abstract class HotPotToolActions extends HotPotBoard {
  /**
   * 更新关卡进度和热锅奖励提示。
   */
  protected updateProgress(): void {
    if (this.levelData.config.level === 3) {
      const cleared = this.clearedTileCount();
      const next = (this.rewardedMilestones + 1) * 100;
      this.progressLabel.fontSize = 26;
      this.progressLabel.string =
        next <= this.levelData.total
          ? `距离下一次获取道具还有${Math.max(0, next - cleared)}个`
          : '本局开锅道具已全部领取，继续捞！';
    } else {
      const tilesById = new Map(
        this.levelData.tiles.map(
          /**
           * 将当前条目转换为后续处理所需的值。
           */ (tile) => [tile.id, tile] as const,
        ),
      );
      const open = this.levelData.tiles.filter(
        /**
         * 按条件筛选或判断条目：this.isTileSelectable(tile, tilesById)。
         */ (tile) => this.isTileSelectable(tile, tilesById),
      ).length;
      this.progressLabel.fontSize = 26;
      this.progressLabel.string =
        '剩余 ' +
        String(this.remainingTiles()) +
        ' / ' +
        String(this.levelData.total) +
        '    ·    可拿 ' +
        String(open) +
        ' 张';
    }
  }

  /**
   * 计算当前关卡已经消除的牌数。
   */
  protected clearedTileCount(): number {
    return (
      this.levelData.total -
      this.remainingTiles() -
      this.tray.length -
      this.reserve.length
    );
  }

  /**
   * 按进度发放热锅奖励并避免重复领取。
   */
  protected grantBoilRewards(): string {
    if (this.levelData.config.level !== 3) {
      return '';
    }
    const reached = Math.floor(this.clearedTileCount() / 100);
    const rewards: string[] = [];
    // Never roll the milestone back on undo, so replaying a match cannot farm
    // tools.
    while (this.rewardedMilestones < reached) {
      this.rewardedMilestones += 1;
      const types: ToolType[] = ['undo', 'bomb', 'shuffle'];
      const type = types[Math.floor(Math.random() * types.length)];
      this.toolUses[type] += 1;
      rewards.push(`${TOOL_NAMES[type]} +1`);
    }
    if (!rewards.length) {
      return '';
    }
    this.updateToolButtons();
    return `${BOIL_STAGES[this.rewardedMilestones]}！${rewards.join('，')}`;
  }

  /**
   * 创建道具按钮和剩余次数显示。
   */
  protected makeToolButton(
    type: ToolType,
    position: Vec3,
    fill: string,
    callback: () => void,
  ): Node {
    const button = makeButton(
      this.toolBar,
      '',
      position,
      208,
      84,
      fill,
      callback,
    );
    drawLacquerButton(button, 208, 84);
    button.name = `Tool_${type}`;
    const icon = new Node('ToolIcon');
    button.addChild(icon);
    icon.setPosition(-50, 0);
    icon.setScale(0.7, 0.7, 1);
    const toolName = makeLabel(button, TOOL_NAMES[type], 25,
      getPageTheme().onAccent, new Vec3(6, 0), 60, 40);
    toolName.node.name = 'ToolName';
    transform(icon, 64, 44);
    const g = icon.addComponent(Graphics);
    g.strokeColor = hex('#FFF8E7');
    g.lineWidth = 6;
    const arrow =
      /**
       * 处理 arrow 对应的游戏逻辑。
       */ (x: number, y: number, direction: number): void => {
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
        const angle = (ray * Math.PI * 2) / 5;
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
    if (type !== 'bomb') {
      g.stroke();
    }
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
    (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (type) => {
        const button = this.toolButtons.get(type);
        if (!button) {
          return;
        }
        const label = button
          .getChildByName('UsesBadge')
          ?.getChildByName('Label')
          ?.getComponent(Label);
        const unlimited = this.levelIndex >= 1 && this.unlimitedTools[type];
        if (label) {
          label.string = unlimited ? '∞' : String(this.toolUses[type]);
        }
        const available = unlimited || this.toolUses[type] > 0;
        drawLacquerButton(button, 208, 84, available ? 'red' : 'muted');
        setButtonEnabled(button, available);
        opacity(button, available ? 255 : 175);
      },
    );
  }

  /**
   * 检查当前是否允许使用指定道具。
   */
  protected canUseTool(type: ToolType): boolean {
    if (this.levelIndex < 1) {
      return false;
    }
    if (this.hasPlayerMenu()) {
      return false;
    }
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
    if (!this.canUseTool('undo')) {
      return;
    }
    if (!this.lastMoveSnapshot) {
      this.showToast('还没有可以撤回的操作', '#8A4B34');
      return;
    }
    const removed = new Set(this.lastMoveSnapshot.removedIds);
    this.clearMatchEffects();
    this.tray = this.lastMoveSnapshot.tray.slice();
    this.reserve = this.lastMoveSnapshot.reserve.slice();
    this.levelData.tiles.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (tile) => {
        tile.removed = removed.has(tile.id);
      },
    );
    this.lastMoveSnapshot = null;
    if (!this.unlimitedTools.undo) {
      this.toolUses.undo -= 1;
    }
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
    if (!this.canUseTool('bomb')) {
      return;
    }
    const targets = selectBombTargets(this.levelData.tiles);
    if (targets.length === 0) {
      this.showToast('棋盘上没有满 3 张的同类食材', '#8A4B34');
      return;
    }
    targets.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (tile) => {
        tile.removed = true;
        const node = this.tileNodes.get(tile.id);
        node?.removeFromParent();
        node?.destroy();
        this.tileNodes.delete(tile.id);
      },
    );
    // 清空旧撤回快照，防止撤回拿牌时复活已经炸掉的牌。
    this.lastMoveSnapshot = null;
    if (!this.unlimitedTools.bomb) {
      this.toolUses.bomb -= 1;
    }
    // 复用其余牌及图片节点，只重画遮挡状态发生变化的牌。
    this.refreshTileStates();
    const reward = this.grantBoilRewards();
    this.updateProgress();
    this.updateToolButtons();
    this.playEffect('match', 0.82);
    this.showToast(
      reward ||
        `炸掉 ${targets.length} 张${getIngredient(targets[0].type).name}`,
      '#A14425',
    );
    if (this.isBoardCleared()) {
      this.endGame(true);
    } else {
      this.checkpointGame();
    }
  }
}
