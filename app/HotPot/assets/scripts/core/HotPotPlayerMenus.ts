import {_decorator, Graphics, Label, Node, Vec3} from 'cc';

import {INGREDIENTS, IngredientType} from '../data/GameData';

import {achievementEntries, INGREDIENT_STORIES} from '../data/CollectionData';

import {
  drawRoundRect,
  hex,
  makeButton,
  makeLabel,
  makePanelHeading,
} from './HotPotUi';

import {HotPotProfileMenus} from './HotPotProfileMenus';
import {normalizeRuntimeConfig} from '../data/RuntimeConfig';
import {getPageTheme} from '../data/PageTheme';

/**
 * 玩家档案、云存档选择和图鉴菜单。
 */
export abstract class HotPotPlayerMenus extends HotPotProfileMenus {
  private collectionOffsets = {ingredients: 0, achievements: 0};
  /**
   * 显示食材图鉴或成就列表。
   */
  protected showCollection(
    tab: 'ingredients' | 'achievements' = 'ingredients',
    entry = {
      headingTaps: 0, ingredientTaps: 0,
      ...normalizeRuntimeConfig(this.playerService?.runtimeConfig),
    },
  ): void {
    if (!this.scrollComponentsReady()) {
      return;
    }
    const panel = this.makePlayerMenu('CollectionOverlay', 1240);
    if (!panel) {
      return;
    }
    const state = this.playerService!.state;
    const reviewAligned = getPageTheme().id === 7;
    const achievements = achievementEntries(state);
    const unlocked = achievements.filter(
      /**
       * 按条件筛选或判断条目：item.unlocked。
       */ (item) => item.unlocked,
    ).length;
    const discovered = state.progress.discovered;
    const heading = makePanelHeading(panel, '小馆珍藏', 515, 420);
    heading.isBold = true;
    heading.node.on(
      Node.EventType.TOUCH_END,
      /**
       * 响应节点触摸或游戏事件。
       */ () => {
        entry.headingTaps = Math.min(
          entry.collectionHeadingTaps, entry.headingTaps + 1,
        );
        entry.ingredientTaps = 0;
      },
    );
    makeLabel(
      panel,
      '食材 ' +
        String(discovered.length) +
        ' / ' +
        String(INGREDIENTS.length) +
        '  ·  成就 ' +
        String(unlocked) +
        ' / ' +
        String(achievements.length) +
        '',
      27,
      '#775145',
      new Vec3(0, 455),
      570,
      42,
    );
    const captureScroll = (): void => {
      const content = panel.getChildByName('CollectionViewport')
        ?.getChildByName('CollectionContent');
      if (content) this.collectionOffsets[tab] = Math.max(0, content.position.y - 324);
    };
    const switchTab =
      /**
       * 处理 switchTab 对应的游戏逻辑。
       */ (next: 'ingredients' | 'achievements'): void => {
        if (next === 'ingredients'
          && entry.headingTaps === entry.collectionHeadingTaps) {
          entry.ingredientTaps += 1;
          if (entry.ingredientTaps === entry.collectionIngredientTaps) {
            this.dismissPlayerMenu('CollectionOverlay');
            this.showBackdoor();
            return;
          }
        } else {
          entry.headingTaps = 0;
          entry.ingredientTaps = 0;
        }
        if (next === tab) {
          return;
        }
        captureScroll();
        this.dismissPlayerMenu('CollectionOverlay');
        this.showCollection(next, entry);
      };
    makeButton(
      panel,
      '食材图鉴',
      new Vec3(-144, 386),
      264,
      64,
      tab === 'ingredients' ? '#D75542' : '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => switchTab('ingredients'),
    );
    makeButton(
      panel,
      '我的成就',
      new Vec3(144, 386),
      264,
      64,
      tab === 'achievements' ? '#D75542' : '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => switchTab('achievements'),
    );

    if (tab === 'ingredients') {
      const content = this.makeCollectionScroll(
        panel,
        Math.ceil(INGREDIENTS.length / 3) * 216 + 12,
        this.collectionOffsets.ingredients,
      );
      INGREDIENTS.forEach(
        /**
         * 依次处理集合中的每个条目。
         */ (ingredient, index) => {
          const known = discovered.indexOf(ingredient.id) >= 0;
          const card = makeButton(
            content,
            '',
            new Vec3(
              (index % 3 - 1) * 184, -108 - Math.floor(index / 3) * 216,
            ),
            172,
            204,
            known ? '#F8E8CD' : '#E9E0D0',
            /**
             * 在当前操作完成后更新相关游戏状态。
             */ () => {
              captureScroll();
              this.dismissPlayerMenu('CollectionOverlay');
              this.showIngredientDetail(ingredient.id);
            },
          );
          const icon = new Node('CollectionIngredient');
          card.addChild(icon);
          icon.setPosition(0, 32);
          if (known && this.ingredientFrames.has(ingredient.id)) {
            this.addIngredientImage(icon, ingredient.id, false, 92, 88);
          } else {
            makeLabel(
              icon,
              known ? ingredient.name.slice(0, 1) : '?',
              64,
              known ? ingredient.dark : '#B59C83',
              Vec3.ZERO,
              100,
              96,
            );
          }
          const name = makeLabel(
            card,
            known ? ingredient.name : '神秘食材',
            28,
            known ? '#744329' : '#9D8B77',
            new Vec3(0, -40),
            154,
            38,
          );
          name.isBold = known;
          const tag = makeLabel(
            card,
            known ? INGREDIENT_STORIES[ingredient.id].tag : '拿取点亮',
            22,
            '#94735D',
            new Vec3(0, -79),
            154,
            30,
          );
          if (reviewAligned) {
            name.horizontalAlign = Label.HorizontalAlign.LEFT;
            tag.horizontalAlign = Label.HorizontalAlign.LEFT;
          }
        },
      );
    } else {
      const content = this.makeCollectionScroll(
        panel,
        achievements.length * 156 + 8,
        this.collectionOffsets.achievements,
      );
      achievements.forEach(
        /**
         * 依次处理集合中的每个条目。
         */ (item, index) => {
          const card = new Node(`Achievement_${item.id}`);
          content.addChild(card);
          card.setPosition(0, -80 - index * 156);
          drawRoundRect(
            card,
            548,
            140,
            20,
            item.unlocked ? '#F6DFC0' : '#EEE7DC',
          );
          const title = makeLabel(
            card,
            item.title,
            29,
            item.unlocked ? '#8D3426' : '#806C57',
            new Vec3(-63, 40),
            374,
            42,
          );
          title.isBold = true;
          const achievementStatus = makeLabel(
            card,
            item.unlocked ? '已达成' : '进行中',
            21,
            item.unlocked ? '#477345' : '#A88A6C',
            new Vec3(reviewAligned ? 210 : 211, 40),
            88,
            32,
          );
          const description = makeLabel(
            card,
            item.description,
            22,
            '#94735D',
            new Vec3(0, -4),
            500,
            45,
            true,
          );
          const bar = new Node('AchievementProgress');
          card.addChild(bar);
          bar.setPosition(reviewAligned ? -55 : -45, -46);
          const progressHeight = reviewAligned ? 4 : 10;
          drawRoundRect(bar, 390, progressHeight, progressHeight / 2, '#D8C5AD');
          const g = bar.getComponent(Graphics)!;
          const filled = (390 * item.current) / item.target;
          if (filled > 0) {
            g.fillColor = hex(item.unlocked ? '#80A16A' : '#D39457');
            g.roundRect(-195, -progressHeight / 2, filled, progressHeight,
              Math.min(progressHeight / 2, filled / 2));
            g.fill();
          }
          const count = makeLabel(
            card,
            `${item.current} / ${item.target}`,
            21,
            '#806C57',
            new Vec3(218, -46),
            104,
            32,
          );
          if (reviewAligned) {
            for (const label of [title, achievementStatus, description, count]) {
              label.horizontalAlign = Label.HorizontalAlign.LEFT;
            }
          }
        },
      );
    }
    const alignFooter = reviewAligned;
    const footerHint = makeLabel(
      panel,
      tab === 'ingredients'
        ? '上下滑动浏览，点选食材查看小档案'
        : '上下滑动浏览，达成后永久记录',
      25,
      '#94735D',
      new Vec3(0, -356),
      alignFooter ? 500 : 580,
      40,
    );
    this.playerStatusLabel = makeLabel(
      panel,
      this.playerService!.statusText,
      24,
      '#94735D',
      new Vec3(0, -426),
      alignFooter ? 500 : 580,
      76,
      true,
    );
    if (alignFooter) {
      footerHint.horizontalAlign = Label.HorizontalAlign.LEFT;
      this.playerStatusLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    }
    makeButton(
      panel,
      '返回我的',
      new Vec3(0, -535),
      330,
      66,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissPlayerMenu('CollectionOverlay');
        this.showPlayerProfile();
      },
    );
  }

  /**
   * 打开本地调试菜单。
   */
  protected abstract showBackdoor(): void;
  /**
   * 打开地区选择菜单。
   */
  protected abstract showRegionPicker(codes: string[]): void;
  /**
   * 打开存档冲突选择页。
   */
  protected abstract showSaveConflict(): void;
  /**
   * 显示食材详情。
   */
  protected abstract showIngredientDetail(type: IngredientType): void;
}
