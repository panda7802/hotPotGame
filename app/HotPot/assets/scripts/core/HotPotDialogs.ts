import {Label, Node, Vec3} from 'cc';

import {
  getIngredient,
  INGREDIENTS,
  IngredientType,
  LEVELS,
} from '../data/GameData';

import {INGREDIENT_STORIES} from '../data/CollectionData';

import {
  drawRoundRect,
  makeButton,
  makeLabel,
  TOOL_NAMES,
  ToolType,
} from './HotPotUi';

import {HotPotPlayerMenus} from './HotPotPlayerMenus';

/**
 * HotPotDialogs：拆分后的前段场景行为。
 */
export abstract class HotPotDialogs extends HotPotPlayerMenus {
  /**
   * 显示本地调试菜单。
   */
  protected showBackdoor(): void {
    const panel = this.makePlayerMenu('BackdoorOverlay', 1020);
    if (!panel) {
      return;
    }
    makeLabel(
      panel,
      '后门设置',
      42,
      '#8D3426',
      new Vec3(0, 438),
      570,
      62,
    ).isBold = true;
    makeLabel(
      panel,
      '选关 · 点击后开始新的一局',
      25,
      '#94735D',
      new Vec3(0, 372),
      570,
      44,
    );
    LEVELS.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (level, index) => {
        const current = index === this.levelIndex;
        makeButton(
          panel,
          `${current ? '重开' : '进入'}第${index + 1}关 · ${level.title}`,
          new Vec3(0, 286 - index * 90),
          540,
          70,
          current ? '#D75542' : '#B88261',
          /**
           * 在当前操作完成后更新相关游戏状态。
           */ () => {
            this.dismissPlayerMenu('BackdoorOverlay');
            this.loadLevel(index);
            this.showBackdoor();
          },
        );
      },
    );
    makeLabel(
      panel,
      `当前第${this.levelIndex + 1}关 · 无限道具`,
      28,
      '#744329',
      new Vec3(0, 16),
      570,
      44,
    );
    if (this.levelIndex >= 1) {
      (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach(
        /**
         * 依次处理集合中的每个条目。
         */ (type, index) => {
          const text =
            /**
             * 处理 text 对应的游戏逻辑。
             */ (): string =>
              '' +
              String(TOOL_NAMES[type]) +
              '：' +
              String(this.unlimitedTools[type] ? '无限使用' : '正常次数') +
              '';
          const button = makeButton(
            panel,
            text(),
            new Vec3(0, -62 - index * 84),
            480,
            64,
            this.unlimitedTools[type] ? '#477345' : '#B88261',
            /**
             * 在当前操作完成后更新相关游戏状态。
             */ () => {
              this.unlimitedTools[type] = !this.unlimitedTools[type];
              button.getChildByName('Label')!.getComponent(Label)!.string =
                text();
              drawRoundRect(
                button,
                480,
                64,
                20,
                this.unlimitedTools[type] ? '#477345' : '#B88261',
              );
              this.updateToolButtons();
            },
          );
          button.name = `Unlimited_${type}`;
        },
      );
    } else {
      makeLabel(
        panel,
        '第一关不使用道具',
        28,
        '#94735D',
        new Vec3(0, -140),
        540,
        60,
      );
    }
    makeButton(
      panel,
      '本关只留3个相同食材',
      new Vec3(0, -316),
      540,
      64,
      '#D75542',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissPlayerMenu('BackdoorOverlay');
        this.leaveThreeMatchingTiles();
      },
    );
    makeLabel(
      panel,
      '无限开关仅本局有效，重开或切关后重置',
      21,
      '#94735D',
      new Vec3(0, -377),
      570,
      32,
    );
    makeButton(
      panel,
      '返回游戏',
      new Vec3(0, -444),
      330,
      66,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.dismissPlayerMenu('BackdoorOverlay'),
    );
  }

  /**
   * 将调试棋盘缩减为可直接消除的三张牌。
   */
  protected leaveThreeMatchingTiles(): void {
    if (!this.levelData
      || this.hasPlayerMenu() ||
      (this.locked && !this.gameEnded)) {
      return;
    }
    // 从原有牌中保留同类三张，必要时取回已移除的牌，维持存档的种类总数。
    const ordered = this.levelData.tiles.slice().sort(
      /**
       * 按指定顺序比较并排列条目。
       */ (a, b) => b.layer - a.layer,
    );
    const type =
      ordered.find(
        /**
         * 按条件筛选或判断条目：!tile.removed。
         */ (tile) => !tile.removed,
      )?.type || ordered[0]?.type;
    const kept = ordered
      .filter(
        /**
         * 按条件筛选或判断条目：tile.type === type。
         */ (tile) => tile.type === type,
      )
      .slice(0, 3);
    if (kept.length !== 3) {
      return;
    }
    const keptIds = new Set(
      kept.map(
        /**
         * 将当前条目转换为后续处理所需的值。
         */ (tile) => tile.id,
      ),
    );
    this.clearMatchEffects();
    this.effectSource?.stop();
    this.dismissOverlay();
    this.dismissRestartConfirmation();
    this.levelData.tiles.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (tile) => {
        tile.removed = !keptIds.has(tile.id);
      },
    );
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

  /**
   * 显示单个食材的图鉴故事。
   */
  protected showIngredientDetail(type: IngredientType): void {
    const panel = this.makePlayerMenu('CollectionDetailOverlay', 780);
    if (!panel) {
      return;
    }
    const ingredient = getIngredient(type);
    const known =
      this.playerService!.state.progress.discovered.indexOf(type) >= 0;
    const title = makeLabel(
      panel,
      known ? ingredient.name : '尚未发现',
      44,
      '#8D3426',
      new Vec3(0, 285),
      560,
      66,
    );
    title.isBold = true;
    const icon = new Node('IngredientPortrait');
    panel.addChild(icon);
    icon.setPosition(0, 135);
    if (known && this.ingredientFrames.has(type)) {
      this.addIngredientImage(icon, type, false, 182, 174);
    } else {
      makeLabel(icon, '?', 100, '#B59C83', Vec3.ZERO, 190, 180);
    }
    makeLabel(
      panel,
      known ? INGREDIENT_STORIES[type].tag : '食材还藏在锅里',
      27,
      '#A3613B',
      new Vec3(0, 9),
      560,
      45,
    );
    makeLabel(
      panel,
      known
        ? INGREDIENT_STORIES[type].story
        : `在游戏中拿取这份食材即可点亮。继续挑战不同关卡，寻找藏在层层食材间的伙伴，收齐${INGREDIENTS.length}份小档案。`,
      27,
      '#775145',
      new Vec3(0, -94),
      550,
      148,
      true,
    );
    makeLabel(
      panel,
      known ? '已收录 · 重开和撤回不会熄灭图鉴' : '发现方式：在棋盘上拿取一次',
      22,
      '#94735D',
      new Vec3(0, -216),
      570,
      40,
    );
    makeButton(
      panel,
      '返回图鉴',
      new Vec3(0, -307),
      330,
      66,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissPlayerMenu('CollectionDetailOverlay');
        this.showCollection();
      },
    );
  }
}
