import {Graphics, Label, Node, tween, Vec3} from 'cc';

import {getIngredient, selectBombTargets, TileData} from '../data/GameData';

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
   * 同类食材按三张一组移除，第二关最多六张，第三关最多十八张。
   */
  protected useBombTool(): void {
    if (!this.canUseTool('bomb')) {
      return;
    }
    const targets = selectBombTargets(this.levelData.tiles, Math.random,
      this.levelData.config.level === 3 ? 18 : 6);
    if (targets.length === 0) {
      this.showToast('棋盘上没有满 3 张的同类食材', '#8A4B34');
      return;
    }
    const bombLevel = this.levelData;
    const bombRun = this.runId;
    const effects = this.animateBomb(targets);
    targets.forEach((tile) => { tile.removed = true; });
    // 清空旧撤回快照，防止撤回拿牌时复活已经炸掉的牌。
    this.lastMoveSnapshot = null;
    if (!this.unlimitedTools.bomb) {
      this.toolUses.bomb -= 1;
    }
    // 复用其余牌及图片节点，只重画遮挡状态发生变化的牌。
    this.refreshTileStates();
    effects.setSiblingIndex(this.board.children.length - 1);
    const reward = this.grantBoilRewards();
    this.updateProgress();
    this.updateToolButtons();
    this.showToast(
      reward ||
        `炸掉 ${targets.length} 张${getIngredient(targets[0].type).name}`,
      '#A14425',
    );
    // 先保存结算结果，退出或重开时不依赖动画回调修改牌数。
    this.checkpointGame();
    this.locked = true;
    tween(effects).delay(1.32).call(() => {
      effects.destroy();
      if (this.levelData !== bombLevel || this.runId !== bombRun) return;
      this.locked = false;
      if (this.isBoardCleared()) this.endGame(true);
    }).start();
  }

  /** 落弹蓄力、双层冲击波和食材弹散，共用矢量绘制，无新增图片。 */
  protected animateBomb(targets: TileData[]): Node {
    const effects = new Node('BombEffects');
    // 目标牌稍后转入特效层，深层牌也能在爆炸时清楚呈现。
    const faces = targets.map((tile) => {
      if (!this.tileNodes.has(tile.id)) this.createTileNode(tile);
      const face = this.tileNodes.get(tile.id)!;
      face.active = true;
      (face as Node & {selectableState?: boolean}).selectableState = true;
      this.drawTile(face, tile.type, false);
      this.tileNodes.delete(tile.id);
      return face;
    });
    this.board.addChild(effects);
    const center = new Vec3(
      targets.reduce((sum, tile) => sum + tile.x, 0) / targets.length,
      targets.reduce((sum, tile) => sum + tile.y, 0) / targets.length,
    );
    this.createBombParticles(effects, center);
    const bomb = new Node('BombDrop');
    effects.addChild(bomb);
    bomb.setPosition(center.x, center.y + 160);
    transform(bomb, 96, 96);
    const g = bomb.addComponent(Graphics);
    g.fillColor = hex('#292D35');
    g.strokeColor = hex('#FFE6AE');
    g.lineWidth = 4;
    g.circle(0, 0, 34); g.fill(); g.stroke();
    g.strokeColor = hex('#FFF5DA');
    g.moveTo(-22, 0); g.bezierCurveTo(-22, 15, -13, 22, -3, 22); g.stroke();
    g.strokeColor = hex('#FFAE4D');
    g.moveTo(12, 31); g.bezierCurveTo(12, 53, 34, 34, 34, 52); g.stroke();
    g.fillColor = hex('#FFE692');
    g.circle(34, 52, 7); g.fill();
    tween(bomb).to(0.24, {position: center}, {easing: 'quadIn'})
      .to(0.08, {scale: new Vec3(1.24, 0.8, 1)})
      .to(0.1, {scale: new Vec3(1.36, 1.36, 1)})
      .call(() => {
        if (effects.parent === this.board) this.playEffect('bomb', 0.9);
      })
      .to(0.08, {scale: new Vec3(0, 0, 1)}).start();
    for (let i = 0; i < 2; i++) {
      const ring = new Node(`BombShockwave_${i}`);
      effects.addChild(ring);
      ring.setPosition(center);
      ring.setScale(0, 0, 1);
      transform(ring, 160, 160);
      const wave = ring.addComponent(Graphics);
      wave.strokeColor = hex(i ? '#FFAA4D' : '#FFE9A6');
      wave.lineWidth = i ? 5 : 9;
      wave.circle(0, 0, 70); wave.stroke();
      tween(ring).delay(0.42 + i * 0.06)
        .to(0.42, {scale: new Vec3(4.5, 4.5, 1)}, {easing: 'quadOut'}).start();
      tween(opacity(ring)).delay(0.42 + i * 0.06).to(0.4, {opacity: 0}).start();
    }
    faces.forEach((face, index) => {
      face.setParent(effects);
      const start = face.position.clone();
      const scale = face.scale.clone();
      const angle = Math.PI * 2 * index / faces.length;
      tween(face).delay(0.42)
        .to(0.12, {scale: new Vec3(scale.x * 1.18, scale.y * 1.18, 1)})
        .to(0.38, {
          position: new Vec3(start.x + Math.cos(angle) * 70,
            start.y + 70 + Math.sin(angle) * 40, start.z),
          scale: new Vec3(0.05, 0.05, 1),
          angle: index % 2 ? 28 : -28,
        }, {easing: 'quadOut'}).start();
      tween(opacity(face)).delay(0.58).to(0.32, {opacity: 0}).start();
    });
    return effects;
  }

  /** 固定数量的烟团、闪光、火星和碎屑，全部随特效根节点回收。 */
  protected createBombParticles(effects: Node, center: Vec3): void {
    // 暖灰烟团先膨胀再上浮，错开大小和位置，保留食材的辨识度。
    for (let i = 0; i < 8; i++) {
      const smoke = new Node(`BombSmoke_${i}`);
      effects.addChild(smoke);
      smoke.setPosition(center);
      smoke.setScale(0, 0, 1);
      transform(smoke, 90, 90);
      const cloud = smoke.addComponent(Graphics);
      cloud.fillColor = hex(i % 2 ? '#766B64' : '#B9A394');
      cloud.circle(0, 0, 24); cloud.fill();
      cloud.circle(-15, 8, 16); cloud.fill();
      cloud.circle(14, 12, 18); cloud.fill();
      const angle = Math.PI * 2 * i / 8;
      const spread = 45 + i % 3 * 24;
      const end = new Vec3(center.x + Math.cos(angle) * spread,
        center.y + 65 + Math.sin(angle) * spread * 0.6);
      const size = 1.4 + i % 3 * 0.25;
      tween(smoke).delay(0.46 + i % 3 * 0.02)
        .to(0.7, {position: end, scale: new Vec3(size, size, 1)},
          {easing: 'quadOut'}).start();
      tween(opacity(smoke, 0)).delay(0.46)
        .to(0.1, {opacity: 110}).to(0.66, {opacity: 0}).start();
    }
    const flash = new Node('BombFlash');
    effects.addChild(flash);
    flash.setPosition(center);
    flash.setScale(0, 0, 1);
    transform(flash, 120, 120);
    const glow = flash.addComponent(Graphics);
    glow.fillColor = hex('#FF9E36');
    glow.circle(0, 0, 55); glow.fill();
    glow.fillColor = hex('#FFF1BA');
    glow.circle(0, 0, 36); glow.fill();
    tween(flash).delay(0.42)
      .to(0.08, {scale: new Vec3(2, 2, 1)})
      .to(0.18, {scale: new Vec3(2.8, 2.8, 1)}).start();
    tween(opacity(flash)).delay(0.47).to(0.21, {opacity: 0}).start();

    // 拉长的炽热火星径向喷射；短碎屑随后向下坠落。
    for (let i = 0; i < 38; i++) {
      const debris = i >= 28;
      const spark = new Node(`BombSpark_${i}`);
      effects.addChild(spark);
      spark.setPosition(center);
      spark.setScale(0, 0, 1);
      transform(spark, 32, 16);
      const fire = spark.addComponent(Graphics);
      fire.fillColor = hex(debris ? '#655044'
        : i % 2 ? '#FF8A30' : '#FFE9A6');
      fire.roundRect(-8, -2.5, debris ? 9 : 20 + i % 3 * 4,
        debris ? 8 : 5, 2); fire.fill();
      const angle = Math.PI * 2 * i / 38 + i % 3 * 0.13;
      const distance = debris ? 80 + i % 4 * 22 : 110 + i % 5 * 30;
      spark.angle = angle * 180 / Math.PI;
      const burst = new Vec3(center.x + Math.cos(angle) * distance,
        center.y + Math.sin(angle) * distance * 0.8);
      tween(spark).delay(0.42 + i % 3 * 0.015)
        .set({scale: Vec3.ONE})
        .to(0.22, {position: burst}, {easing: 'quadOut'})
        .to(debris ? 0.45 : 0.3, {
          position: new Vec3(burst.x + Math.cos(angle) * 25,
            burst.y - (debris ? 100 : 35)),
          scale: new Vec3(0.1, 0.1, 1),
          angle: spark.angle + (debris ? 150 : 0),
        }, {easing: 'quadIn'}).start();
      tween(opacity(spark)).delay(debris ? 0.8 : 0.65)
        .to(0.28, {opacity: 0}).start();
    }
  }
}
