import type {Node} from 'cc';
import {getPageTheme} from '../data/PageTheme';
import {getIngredient, INGREDIENTS, NORMAL_INGREDIENTS, HIDDEN_INGREDIENTS, IngredientType} from '../data/GameData';
import {achievementEntries, INGREDIENT_STORIES} from '../data/CollectionData';
import type {AchievementEntry} from '../data/CollectionData';
import {RegionNode} from '../data/PlayerData';
import {hex, TOOL_NAMES, ToolType} from './HotPotUi';
import {HotPotDesignMenus} from './HotPotDesignMenus';
import {paintPremiumGlow} from './HotPotCeladonGlow';
import {paintGameArt} from './HotPotGameArt';
import {
  designButton,
  designFooter,
  designHit,
  designIcon,
  designNode,
  designOnBackground,
  designPersonalSurface,
  designScroll,
  designSurface,
  designText
} from './HotPotDesignUi';
import type {DesignRect} from './HotPotDesignUi';

type CollectionEntry = {headingTaps?: number; ingredientTaps?: number; achievementId?: string};
const ACHIEVEMENT_MEDALS = {
  main: {icon: 'trophy', fill: '#F9E2B7', ink: '#8A5026'},
  collection: {icon: 'book', fill: '#E3ECC8', ink: '#466740'},
  cashout: {icon: 'gift', fill: '#F9DDC9', ink: '#984F35'},
  tavern: {icon: 'pin', fill: '#EEE4CF', ink: '#755B3F'},
};
const ACHIEVEMENT_APPEARANCE = {
  1: {
    summary: '#792F26', earned: '#285648', pending: '#1C4539', ink: '#FFF1CF', muted: '#E5CD9D',
    medal: '#DCB774', medalInk: '#55341F', medalRadius: 17,
    track: '#123429', summaryTrack: '#55241E', fill: '#E6BC75',
    earnedStatus: '#963B2D', pendingStatus: '#16352C', statusRadius: 10,
  },
  4: {
    summary: '#FFF5DF', earned: '#FFEFCC', pending: '#FFF5DF', ink: '#653C22', muted: '#826445',
    medal: '#FFE1A6', medalInk: '#905522', medalRadius: 41,
    track: '#D7B98B', summaryTrack: '#D7B98B', fill: '#4C7D3F',
    earnedStatus: '#4C7D3F', pendingStatus: '#FFF0CF', statusRadius: 18,
  },
  8: {
    summary: '#E2EFE3', earned: '#EAF2E4', pending: '#FFFAE8', ink: '#264E40', muted: '#527062',
    medal: '#C5DFD0', medalInk: '#2B604C', medalRadius: 41,
    track: '#C6D6BE', summaryTrack: '#B5D0BD', fill: '#4D8068',
    earnedStatus: '#366B53', pendingStatus: '#E8EFE0', statusRadius: 18,
  },
  9: {
    summary: '#F6E7CD', earned: '#F9EBD0', pending: '#FFF6E4', ink: '#392B22', muted: '#725641',
    medal: '#EFD9BA', medalInk: '#953C2D', medalRadius: 7,
    track: '#DCC3A0', summaryTrack: '#DCC3A0', fill: '#A44435',
    earnedStatus: '#A3372B', pendingStatus: '#F2E2C8', statusRadius: 4,
  },
};

export abstract class HotPotDesignCollection extends HotPotDesignMenus {
  private designOffsets = {ingredients: 0, hidden: 0, achievements: 0};
  private designIngredientGroup: 'ingredients' | 'hidden' = 'ingredients';
  private designCollectionTab: 'ingredients' | 'achievements' = 'ingredients';

  protected showCollection(tab: 'ingredients' | 'achievements' = 'ingredients', entry?: CollectionEntry): void {
    let saveOffset = () => {
    };
    const back = () => {
      saveOffset();
      this.dismissPlayerMenu('CollectionOverlay');
      this.showMyMenu();
    };
    const t = getPageTheme();
    const p = this.designPage('CollectionOverlay', tab === 'ingredients' ? '食材图鉴' : '我的成就',
      back, tab === 'achievements' ? 'game-ui/bg-0' + t.id : undefined);
    if (!p) return;
    this.designCollectionTab = tab;
    const service = this.playerService!;
    const state = service.state;
    const taps = {
      heading: entry?.headingTaps || 0,
      food: entry?.ingredientTaps || 0
    };
    if (tab === 'ingredients') {
      const heading = designText(p, '小馆珍藏', [40, 290, 230, 44], 24, designOnBackground(), false, true);
      heading.node.name = 'CollectionHeading';
      designHit(heading.node, () => {
        taps.heading++;
        taps.food = 0
      });
      const label = p.getChildByName('DesignHeader')?.getChildByName('Text_食材图鉴');
      if (label) {
        label.name = 'Button_食材图鉴';
        designHit(label, () => {
          const config = this.playerService!.runtimeConfig;
          if (taps.heading >= config.collectionHeadingTaps && ++taps.food >= config.collectionIngredientTaps) {
            saveOffset();
            this.dismissPlayerMenu('CollectionOverlay');
            this.showBackdoor()
          }
        })
      }
      designText(p, '已发现 ' + state.progress.discovered.length + ' / ' + INGREDIENTS.length, [300, 290, 244, 44], 28, designOnBackground(), true);
      designButton(p, 'Button_分享珍藏', '分享', [564, 280, 116, 64], () => {
        const discovered = service.state.progress.discovered;
        const count = HIDDEN_INGREDIENTS.filter(food =>
          discovered.includes(food.id)).length;
        this.shareGame(
          `锅里捞啥｜我已收集 ${count}/${HIDDEN_INGREDIENTS.length} 种珍藏食材！`,
        );
      }, true);
      const group = this.designIngredientGroup;
      const foods = group === 'hidden' ? HIDDEN_INGREDIENTS : NORMAL_INGREDIENTS;
      const switchGroup = (next: 'ingredients' | 'hidden') => {
        saveOffset();
        this.designIngredientGroup = next;
        this.dismissPlayerMenu('CollectionOverlay');
        this.showCollection('ingredients', {headingTaps: taps.heading, ingredientTaps: taps.food});
      };
      for (const [key, title, pool, x] of [
        ['ingredients', '普通食材', NORMAL_INGREDIENTS, 40],
        ['hidden', '珍藏食材', HIDDEN_INGREDIENTS, 368],
      ] as const) {
        const count = pool.filter(food => state.progress.discovered.includes(food.id)).length;
        designButton(p, 'IngredientGroup_' + key, title + '  ' + count + '/' + pool.length,
          [x, 352, 312, 64], () => switchGroup(key), group !== key);
      }
      designText(p, group === 'hidden' ? '每次相遇，都有新的惊喜。' : '烟火百味，收集每一份好滋味',
        [40, 426, 640, 32], 21, designOnBackground());
      const height = Math.ceil(foods.length / 3) * 230 + 6;
      const {
        content,
        view
      } = designScroll(p, 'CollectionViewport', [40, 474, 640, 602], height, this.designOffsets[group]);
      saveOffset = () => {
        this.designOffsets[group] = Math.max(0, view.getScrollOffset().y)
      };
      foods.forEach((food, i) => {
        const known = state.progress.discovered.includes(food.id),
          card = designNode(content, 'IngredientCard_' + food.id, [i % 3 * 218, Math.floor(i / 3) * 230, 204, 212]);
        designSurface(card, known ? t.card : t.panel, undefined, food.hidden ? '#B58A42' : t.edge);
        if(food.hidden&&known)paintPremiumGlow(card,204,212,'card');
        if (known) {
          const icon = designNode(card, 'CollectionIngredient', [31, 12, 142, 142]);
          this.addIngredientImage(icon, food.id, false, 142, 142)
        } else designText(card, '?', [18, 6, 168, 150], 82, t.muted, true);
        designText(card, known ? food.name : food.hidden ? '隐藏珍藏' : '未发现', [8, 164, 188, 38], 27, t.ink, true);
        if (food.hidden) designText(card, '珍藏', [144, 8, 52, 26], 16, known&&t.id===1?'#FFE7AF':t.id===4?'#925B23':'#A7792D', true);
        designHit(card, () => {
          saveOffset();
          this.dismissPlayerMenu('CollectionOverlay');
          this.showIngredientDetail(food.id)
        });
      });
      designText(p, '向上滑动，看看更多食材', [80, 1080, 560, 28], 20, designOnBackground());
    } else {
      saveOffset = this.drawAchievementShelf(p, achievementEntries(state), entry?.achievementId);
    }
    designFooter(p, '返回', back);
  }

  private drawAchievementShelf(panel: Node, entries: AchievementEntry[], focusId?: string): () => void {
    const t = getPageTheme();
    const cream = t.id === 4;
    const appearance = ACHIEVEMENT_APPEARANCE[t.id];
    const unlocked = entries.filter(item => item.unlocked).length;
    const board = designNode(panel, 'AchievementBoard', [28, 298, 664, 790]);
    paintGameArt(designNode(board, 'AchievementFrame', [0, 0, 664, 790]), 'panel', t.id, true);
    const bar = (parent: Node, box: DesignRect, current: number, target: number, track: string) => {
      const g = designSurface(designNode(parent, 'AchievementProgress', box), track, 6, '', false);
      const w = box[2] * current / target, h = box[3];
      if (w > 0) {
        g.fillColor = hex(appearance.fill);
        g.roundRect(-box[2] / 2, -h / 2, w, h, Math.min(h / 2, w / 2));
        g.fill();
      }
    };
    const summary = designNode(board, 'AchievementSummary', [36, 31, 592, 159]);
    designPersonalSurface(summary, appearance.summary);
    const trophy = designNode(summary, 'AchievementHeroMedal', [21, 22, 114, 114]);
    designPersonalSurface(trophy, appearance.medal, Math.round(appearance.medalRadius * 114 / 82), t.edge, false);
    designIcon(trophy, 'trophy', [23, 23, 68, 68], appearance.medalInk);
    designText(summary, '成就进度', [156, 13, 388, 46], 31, appearance.ink, true, true);
    designText(summary, '已达成 ' + unlocked + ' / ' + entries.length + ' 项',
      [157, 64, 404, 39], 25, appearance.muted, false, true);
    bar(summary, [157, 121, 385, 12], unlocked, entries.length, appearance.summaryTrack);

    const stride = 151;
    const focused = entries.findIndex(item => item.id === focusId);
    const offset = focused < 0 ? this.designOffsets.achievements : focused * stride;
    const {content, view} = designScroll(board, 'CollectionViewport', [36, 208, 592, 541],
      entries.length * stride, offset);
    entries.forEach((item, i) => {
      const card = designNode(content, 'Achievement_' + item.id, [0, i * stride, 592, 139]);
      designPersonalSurface(card, item.unlocked ? appearance.earned : appearance.pending,
        undefined, i === focused ? appearance.fill : t.edge);
      const medal = designNode(card, 'Medal', [17, 28, 82, 82]);
      const colors = ACHIEVEMENT_MEDALS[item.category];
      designPersonalSurface(medal, cream ? colors.fill : appearance.medal, appearance.medalRadius, '', false);
      designIcon(medal, colors.icon, [16, 16, 50, 50], cream ? colors.ink : appearance.medalInk);
      designText(card, item.title, [113, 10, 318, 44], 32, appearance.ink, true, true);
      designText(card, item.description, [114, 54, 450, 40], 23, appearance.muted, false, true);
      const status = designNode(card, 'AchievementStatus', [456, 16, 111, 36]);
      designSurface(status, item.unlocked ? appearance.earnedStatus : appearance.pendingStatus,
        appearance.statusRadius, t.id === 9 && item.unlocked ? '#C68665' : '', false);
      designText(status, item.unlocked ? '已达成' : '进行中', [3, 0, 105, 36], 21,
        item.unlocked ? t.onAccent : appearance.muted, true);
      bar(card, [114, 112, 334, 10], item.current, item.target, appearance.track);
      designText(card, item.current + ' / ' + item.target, [454, 100, 115, 34], 21, appearance.muted);
    });
    return () => { this.designOffsets.achievements = Math.max(0, view.getScrollOffset().y); };
  }

  protected showIngredientDetail(type: IngredientType): void {
    const back = () => {
      this.dismissPlayerMenu('CollectionDetailOverlay');
      this.showCollection(this.designCollectionTab)
    }, p = this.designPage('CollectionDetailOverlay', '食材详情', back);
    if (!p) return;
    const item = getIngredient(type),
      known = this.playerService!.state.progress.discovered.includes(type),
      t = getPageTheme();
    const body = designNode(p, 'IngredientDetail', [40, 290, 640, 820]);
    designSurface(body);
    const tag = designNode(body, 'DiscoveryTag', [170, 54, 300, 52]);
    designSurface(tag, t.panel, 26);
    designText(tag, known ? INGREDIENT_STORIES[type].tag : item.hidden ? '隐藏 · 尚未发现' : '尚未发现', [12, 4, 276, 44], 25, item.hidden ? '#A7792D' : t.accent);
    const portrait = designNode(body, 'IngredientPortrait', [140, 142, 360, 330]);
    if(item.hidden&&known)paintPremiumGlow(portrait,330,310,'portrait');
    if (known) this.addIngredientImage(portrait, type, false, 270, 270); else designText(portrait, '?', [0, 0, 360, 330], 170, t.muted);
    designText(body, known ? item.name : '神秘食材', [40, 490, 560, 74], 48, t.ink, true);
    designText(body, known ? INGREDIENT_STORIES[type].story : item.hidden ? '珍贵滋味，静候与你相遇。\n遇见并拿取，即可点亮珍藏。' : '在游戏中拿取这份食材，\n就能点亮它的小馆故事。', [50, 590, 540, 150], 28, t.ink);
    designText(body, known ? '三张相同食材，凑成一口好滋味。' : '每次相遇，都有新的惊喜。', [50, 752, 540, 38], 23, t.muted);
    designFooter(p, '返回', back);
  }

  protected showRegionPicker(codes: string[], leaderboard = false, _query = ''): void {
    if (leaderboard) {
      this.showDesignRanking();
      return
    }
    const back = () => {
      this.dismissPlayerMenu('RegionOverlay');
      this.showMyMenu()
    }, p = this.designPage('RegionOverlay', '所在地选择', back);
    if (!p) return;
    const service = this.playerService!, t = getPageTheme(),
      all = service.regions;
    // “散装江苏”: only Jiangsu has city/county children. Other province-level
    // leaves can be saved immediately; a partial Jiangsu path stays incomplete.
    const raw = (codes.length ? codes : service.state.profile.regionCodes).slice(),
      path: RegionNode[] = [];
    let options = all;
    for (const code of raw) {
      const found = options.find(r => r.code === code);
      if (!found) break;
      path.push(found);
      options = found.children || []
    }
    const selected = path.map(r => r.code);
    const lists: RegionNode[][] = [all, all.find(r => r.code === selected[0])?.children || [], []];
    lists[2] = lists[1].find(r => r.code === selected[1])?.children || [];
    designText(p, '选择省、市、区县，找到家乡的烟火气', [50, 290, 620, 44], 24, designOnBackground());
    const panel = designNode(p, 'RegionColumns', [40, 346, 640, 764]);
    designSurface(panel);
    ['省份', '城市', '区县'].forEach((caption, col) => {
      designText(panel, caption, [16 + col * 206, 16, 192, 56], 27, t.ink, true);
      const selectedIndex = lists[col].findIndex(r => r.code === selected[col]);
      const {content} = designScroll(panel, 'RegionViewport_' + col, [16 + col * 206, 78, 192, 594], lists[col].length * 86, Math.max(0, selectedIndex * 86 - 8));
      if (!lists[col].length) designText(content, path.length && !(path[path.length - 1].children?.length) ? '' : col === 1 ? '请先选择省份' : '请先选择城市', [4, 42, 184, 100], 24, t.muted);
      lists[col].forEach((region, i) => {
        const active = selected[col] === region.code;
        const row = designNode(content, 'Region_' + region.code, [0, i * 86, 184, 76]);
        designSurface(row, active ? t.accent : t.card, 10, '', false);
        designText(row, region.name, [4, 4, 176, 68], 25, active ? t.onAccent : t.ink);
        designHit(row, () => {
          const next = selected.slice(0, col);
          next[col] = region.code;
          this.dismissPlayerMenu('RegionOverlay');
          this.showRegionPicker(next)
        });
      });
    });
    const complete = path.length > 0 && !(path[path.length - 1].children?.length);
    designText(panel, path.length ? path.map(r => r.name).join(' · ') + (complete ? '' : ' · 请继续选择') : '请选择所在地', [20, 692, 600, 62], 23, t.muted, false, true);
    designButton(p, 'Button_返回', '←  返回', [52, 1124, 298, 80], back, true);
    designButton(p, 'Button_保存地区', '✓  保存地区', [370, 1124, 298, 80], () => {
      service.setRegion(selected);
      back();
      this.showToast('地区已保存', t.success)
    }, false, !complete);
  }

  protected showBackdoor(): void {
    const dismiss = () => this.dismissPlayerMenu('BackdoorOverlay');
    const back = () => {dismiss();this.showCollection('ingredients')},
      p = this.designPage('BackdoorOverlay', '调试面板', back);
    if (!p) return;
    const t = getPageTheme(),
      notice = designNode(p, 'DebugNotice', [40, 290, 640, 112]);
    designSurface(notice);
    designText(notice, '选关可切换关卡，同关重开保留食材\n图鉴全开会保存全部珍藏记录', [24, 12, 592, 88], 24, t.muted, false, true);
    for (let i = 0; i < 3; i++) designButton(p, 'Button_进入第' + (i + 1) + '关', '第 ' + (i + 1) + ' 关', [40 + i * 220, 430, 200, 80], () => {
      dismiss();
      if (i === this.levelIndex) this.restartLevel(); else this.loadLevel(i);
      this.showBackdoor()
    }, i !== this.levelIndex);
    designText(p, '当前第 ' + (this.levelIndex + 1) + ' 关 · 无限道具', [50, 534, 620, 46], 24, designOnBackground());
    (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach((type, i) => {
      const allowed = this.levelIndex > 0;
      const button = designButton(p, 'Unlimited_' + type, TOOL_NAMES[type] + ' · ' + (allowed ? (this.unlimitedTools[type] ? '无限使用' : '正常次数') : '第一关无道具'), [40, 586 + i * 100, 640, 76], () => {
        this.unlimitedTools[type] = !this.unlimitedTools[type];
        this.updateToolButtons();
        dismiss();
        this.showBackdoor();
      }, !this.unlimitedTools[type], !allowed);
    });
    designButton(p, 'Button_只留三张', '本关只留 3 个相同食材', [40, 900, 640, 76], () => {
      dismiss();
      this.leaveThreeMatchingTiles()
    }, true);
    designButton(p, 'Button_图鉴全开', '图鉴全开', [40, 992, 640, 76], () => {
      this.playerService!.unlockAllIngredients();
      this.showToast('60 种食材图鉴已全部点亮', t.success);
    }, true);
    designText(p, '无限开关仅本局有效，重开或切关后重置', [40, 1080, 640, 30], 20, designOnBackground());
    designFooter(p, '返回', back);
  }
}
