import {getPageTheme} from '../data/PageTheme';
import {getIngredient, INGREDIENTS, IngredientType} from '../data/GameData';
import {achievementEntries, INGREDIENT_STORIES} from '../data/CollectionData';
import {RegionNode} from '../data/PlayerData';
import {hex, TOOL_NAMES, ToolType} from './HotPotUi';
import {HotPotDesignMenus} from './HotPotDesignMenus';
import {
  designButton,
  designFooter,
  designHit,
  designIcon,
  designNode,
  designOnBackground,
  designScroll,
  designSurface,
  designText
} from './HotPotDesignUi';

export abstract class HotPotDesignCollection extends HotPotDesignMenus {
  private designOffsets = {ingredients: 0, achievements: 0};
  private designCollectionTab: 'ingredients' | 'achievements' = 'ingredients';

  protected showCollection(tab: 'ingredients' | 'achievements' = 'ingredients', entry?: any): void {
    let saveOffset = () => {
    };
    const back = () => {
      saveOffset();
      this.dismissPlayerMenu('CollectionOverlay');
      this.showPlayerProfile()
    };
    const p = this.designPage('CollectionOverlay', tab === 'ingredients' ? '食材图鉴' : '我的成就', back);
    if (!p) return;
    this.designCollectionTab = tab;
    const state = this.playerService!.state, t = getPageTheme();
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
      const label = p.children.find(n => n.name === 'Text_食材图鉴');
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
      designText(p, '已发现 ' + state.progress.discovered.length + ' / 50', [330, 290, 350, 44], 28, designOnBackground(), true);
      const height = Math.ceil(INGREDIENTS.length / 3) * 230 + 6;
      const {
        content,
        view
      } = designScroll(p, 'CollectionViewport', [40, 354, 640, 722], height, this.designOffsets.ingredients);
      saveOffset = () => {
        this.designOffsets.ingredients = Math.max(0, view.getScrollOffset().y)
      };
      INGREDIENTS.forEach((food, i) => {
        const known = state.progress.discovered.includes(food.id),
          card = designNode(content, 'IngredientCard_' + food.id, [i % 3 * 218, Math.floor(i / 3) * 230, 204, 212]);
        designSurface(card, known ? t.card : t.panel);
        if (known) {
          const icon = designNode(card, 'CollectionIngredient', [31, 12, 142, 142]);
          this.addIngredientImage(icon, food.id, false, 142, 142)
        } else designText(card, '?', [18, 6, 168, 150], 82, t.muted, true);
        designText(card, known ? food.name : '未发现', [8, 164, 188, 38], 27, t.ink, true);
        designHit(card, () => {
          saveOffset();
          this.dismissPlayerMenu('CollectionOverlay');
          this.showIngredientDetail(food.id)
        });
      });
      designText(p, '向上滑动，看看更多食材', [80, 1080, 560, 28], 20, designOnBackground());
    } else {
      const entries = achievementEntries(state),
        unlocked = entries.filter(a => a.unlocked).length;
      designText(p, '已达成 ' + unlocked + ' 项 · 每一步都值得记下', [50, 290, 620, 44], 24, designOnBackground());
      const {
        content,
        view
      } = designScroll(p, 'CollectionViewport', [40, 354, 640, 746], entries.length * 220, this.designOffsets.achievements);
      saveOffset = () => {
        this.designOffsets.achievements = Math.max(0, view.getScrollOffset().y)
      };
      entries.forEach((item, i) => {
        const card = designNode(content, 'Achievement_' + item.id, [0, i * 220, 640, 202]);
        designSurface(card);
        const medal = designNode(card, 'Medal', [24, 26, 84, 84]);
        designSurface(medal, t.panel, 42);
        designIcon(medal, 'trophy', [21, 21, 42, 42], item.unlocked ? t.accent : t.muted);
        designText(card, item.title, [130, 22, 478, 50], 30, t.ink, true, true);
        designText(card, item.description, [130, 78, 478, 70], 23, t.muted, false, true);
        const bar = designNode(card, 'AchievementProgress', [26, 164, 390, 10]);
        const g = designSurface(bar, t.line, 5, '', false);
        const width = Math.min(1, item.current / item.target) * 390;
        if (width > 0) {
          g.fillColor = hex(t.success);
          g.roundRect(-195, -5, Math.max(1, width), 10, 5);
          g.fill()
        }
        designText(card, item.current + ' / ' + item.target, [426, 145, 110, 38], 21, t.muted);
        designText(card, item.unlocked ? '已达成' : '进行中', [540, 145, 80, 38], 21, t.accent, true);
      });
    }
    designFooter(p, '返回我的', back);
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
    designText(tag, known ? INGREDIENT_STORIES[type].tag : '尚未发现', [12, 4, 276, 44], 25, t.accent);
    const portrait = designNode(body, 'IngredientPortrait', [140, 142, 360, 330]);
    if (known) this.addIngredientImage(portrait, type, false, 270, 270); else designText(portrait, '?', [0, 0, 360, 330], 170, t.muted);
    designText(body, known ? item.name : '神秘食材', [40, 490, 560, 74], 48, t.ink, true);
    designText(body, known ? INGREDIENT_STORIES[type].story : '在游戏中拿取这份食材，\n就能点亮它的小馆故事。', [50, 590, 540, 150], 28, t.ink);
    designText(body, known ? '三张相同食材，凑成一口好滋味。' : '每次相遇，都有新的惊喜。', [50, 752, 540, 38], 23, t.muted);
    designFooter(p, '返回图鉴', back, 'Button_返回图鉴', true);
  }

  protected showRegionPicker(codes: string[], leaderboard = false, _query = ''): void {
    if (leaderboard) {
      this.showDesignRanking();
      return
    }
    const back = () => {
      this.dismissPlayerMenu('RegionOverlay');
      this.showPlayerProfile()
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
    designButton(p, 'Button_取消', '取消', [52, 1124, 298, 80], back, true);
    designButton(p, 'Button_保存地区', '✓  保存地区', [370, 1124, 298, 80], () => {
      service.setRegion(selected);
      back();
      this.showToast('地区已保存', t.success)
    }, false, !complete);
  }

  protected showBackdoor(): void {
    const back = () => this.dismissPlayerMenu('BackdoorOverlay'),
      p = this.designPage('BackdoorOverlay', '调试面板', back);
    if (!p) return;
    const t = getPageTheme(),
      notice = designNode(p, 'DebugNotice', [40, 290, 640, 112]);
    designSurface(notice);
    designText(notice, '仅本机即时生效\n选关会开始新的一局', [24, 12, 592, 88], 24, t.muted, false, true);
    for (let i = 0; i < 3; i++) designButton(p, 'Button_进入第' + (i + 1) + '关', '第 ' + (i + 1) + ' 关', [40 + i * 220, 430, 200, 80], () => {
      back();
      this.loadLevel(i);
      this.showBackdoor()
    }, i !== this.levelIndex);
    designText(p, '当前第 ' + (this.levelIndex + 1) + ' 关 · 无限道具', [50, 534, 620, 46], 24, designOnBackground());
    (['undo', 'bomb', 'shuffle'] as ToolType[]).forEach((type, i) => {
      const allowed = this.levelIndex > 0;
      const button = designButton(p, 'Unlimited_' + type, TOOL_NAMES[type] + ' · ' + (allowed ? (this.unlimitedTools[type] ? '无限使用' : '正常次数') : '第一关无道具'), [40, 606 + i * 110, 640, 82], () => {
        this.unlimitedTools[type] = !this.unlimitedTools[type];
        this.updateToolButtons();
        back();
        this.showBackdoor();
      }, !this.unlimitedTools[type], !allowed);
    });
    designButton(p, 'Button_只留三张', '本关只留 3 个相同食材', [40, 956, 640, 80], () => {
      back();
      this.leaveThreeMatchingTiles()
    }, true);
    designText(p, '无限开关仅本局有效，重开或切关后重置', [40, 1056, 640, 42], 23, designOnBackground());
    designFooter(p, '返回游戏', back, 'Button_返回游戏', true);
  }
}
