import {EventTouch, game, Game, Label, Mask, Node, sys, Tween, tween, UITransform, Vec3} from 'cc';
import {
  COOKING_UNLOCK, findRecipe,
  practiceRecipe, Recipe, recipeBatches, recipeKey, recipeMax, RECIPES, scoreCooking,
} from '../data/CookingData';
import {
  cookingCooldown, cookingPerfectCount, distinctCookingClears, emptyCooking,
  settleCooking, skipCookingCooldown,
} from '../data/CookingProgress';
import {COOKING_RING_SECONDS, COOKING_TIME_SECONDS, cookingRingCount, CookingRingRound, RingPortion} from '../data/CookingRingRound';
import {getIngredient, IngredientType} from '../data/GameData';
import {getPageTheme} from '../data/PageTheme';
import {GameSave, regionPath} from '../data/PlayerData';
import {drawCookingBreakdown} from './CookingResultView';
import {
  drawCookingDish, drawCookingLessons, paintCookingClip, paintCookingCrossPin, paintCookingHourglass, paintCookingPot, paintCookingRing,
  paintCookingServingPeg, paintCookingSharedPin, paintCookingSlider,
} from './CookingRingView';
import {hex} from './HotPotUi';
import {
  designButton, designFooter, designHeader, designHit, designNode, designOnBackground,
  designOverlay, designScroll, designSurface, designText, DesignPageLayout, fitDesignPage,
} from './HotPotDesignUi';
import {HotPotNativeAds} from './HotPotNativeAds';

const PAGE = 'CookingOverlay';
const HELP = 'CookingHelpOverlay';
const UNLOCK = 'CookingUnlockOverlay';
const BOARD_WIDTH = 624;
const OVERLAY_DIFFICULTIES = ['简单', '一般', '困难'];
const SOURCE_KEY = 'hotpot.cooking.device.v1';
const COOKING_TIME_AD_UNIT = 'adunit-4bfa2babdf8bbd0e';
const PULL_PIN_DISTANCE = {straight: 42, elbow: 49, u: 54};

type CookingDrag = {id: number; scrollY: number}
  | {id: number; pin: number; x: number; y: number; cross?: boolean}
  | {id: number; index: number; angle?: number};

interface RoundView {
  field: Node;
  viewport: Node;
  content: Node;
  rail: Node;
  thumb: Node;
  touchArea: Node;
  rings: {node: Node; shape: Node; marker: Node; peg?: Node}[];
  clips: {node: Node; slider?: Node; span: number; highlighted: boolean}[];
  sharedPins: Map<number, {node: Node; y: number; length: number; cross?: Node; x: number}>;
  counts: Label[];
  clock: Label;
  status: Label;
  action: Node;
  bonus: Label;
  pending: number;
  served: Node[];
  servedIds: IngredientType[];
  dropSerial: number;
  scroll: number;
  fieldHeight: number;
  viewHeight: number;
  focused?: number;
  notice?: string;
}


export abstract class HotPotCooking extends HotPotNativeAds {
  private round?: CookingRingRound;
  private roundView?: RoundView;
  private cooling?: () => void;
  private adPanel?: Node;
  private unlockPending = false;
  private sharedRecipe?: Recipe;
  private inBackground = false;
  private recipeDifficulty: Recipe['difficulty'] = 1;
  private hiddenRound?: {scroll: number; served: IngredientType[]};
  private roundPlayer?: string;
  private ringDrag?: CookingDrag;
  private cookingHelp?: Node;
  private cookingModal?: Node;
  private deviceSource?: string;

  private get cooking() { return this.playerService?.cooking ?? emptyCooking(); }
  private get discovered() { return this.playerService?.discoveredIngredients ?? []; }

  onLoad(): void {
    super.onLoad();
    this.wechatSharing.listenForRecipes(key => { this.sharedRecipe = findRecipe(key); });
  }

  onEnable(): void {
    super.onEnable();
    game.on(Game.EVENT_HIDE, this.pauseCooking, this);
    game.on(Game.EVENT_SHOW, this.resumeCooking, this);
  }

  onDisable(): void {
    game.off(Game.EVENT_HIDE, this.pauseCooking, this);
    game.off(Game.EVENT_SHOW, this.resumeCooking, this);
    this.resetCookingDrag();
    super.onDisable();
  }

  onDestroy(): void {
    game.off(Game.EVENT_HIDE, this.pauseCooking, this);
    game.off(Game.EVENT_SHOW, this.resumeCooking, this);
    super.onDestroy();
  }

  protected hasPlayerMenu(): boolean {
    return !!this.node.getChildByName(PAGE) || !!this.node.getChildByName(UNLOCK) || !!this.cookingHelp
      || super.hasPlayerMenu();
  }

  protected dismissPlayerMenu(name: string): void {
    if (name === HELP) this.cookingHelp = undefined;
    if (name === PAGE) {
      if (this.cookingHelp) this.dismissPlayerMenu(HELP);
      this.resetCookingDrag();
      if (this.roundView) this.hiddenRound = {scroll: this.roundView.scroll, served: this.roundView.servedIds.slice()};
      this.closeCookingModal();
      this.roundView = undefined;
      this.cooling = undefined;
      this.adPanel = undefined;
      this.rewardedVideo.cancel();
    }
    super.dismissPlayerMenu(name);
  }

  protected saveGameCheckpoint(save: GameSave): void {
    const before = this.discovered.length;
    super.saveGameCheckpoint(save);
    if (before < COOKING_UNLOCK && this.discovered.length >= COOKING_UNLOCK) this.unlockPending = true;
  }

  protected showHomeCollection(): void {
    this.showCollection('ingredients', {back: () => {}});
  }

  protected openCooking(): void {
    if (this.discovered.length < COOKING_UNLOCK) this.showHomeCollection();
    else this.showRecipeBook();
  }

  update(delta: number): void {
    if ((this.sharedRecipe || this.unlockPending) && this.levelData && this.playerService
      && !this.locked && !this.hasPlayerMenu()
      && !this.node.getChildByName('ResultOverlay') && !this.node.getChildByName('RestartConfirmOverlay')) {
      if (this.sharedRecipe) {
        const dish = this.sharedRecipe;
        this.sharedRecipe = undefined;
        this.showRecipe(dish);
      } else if (this.unlockPending) this.showCookingUnlock();
    }
    if (!this.cookingHelp) this.cooling?.();
    const round = this.round, ui = this.roundView;
    if (!round || !ui || !this.cookingVisible(ui) || round.ruined || round.expired) return;
    round.tick(delta);
    this.renderCookingClock(round, ui);
    if (round.expired) {
      this.resetCookingDrag();
      this.renderCookingRound();
    }
  }

  private showCookingUnlock(): void {
    this.unlockPending = false;
    const {panel} = designOverlay(this.node, UNLOCK, this.viewportHeight, true);
    const card = designNode(panel, 'CookingUnlocked', [52, 406, 616, 426]);
    designSurface(card);
    this.foodIcon(card, 'toufu', 250, 20, 116);
    designText(card, '烹饪已解锁', [20, 130, 576, 66], 42, getPageTheme().ink, true);
    designText(card, '已收录 10 种食材，去小馆试做第一道菜吧。', [36, 200, 544, 68], 26);
    const close = () => this.dismissPlayerMenu(UNLOCK);
    designButton(card, 'Button_继续捞锅', '继续捞锅', [30, 312, 264, 76], close, true);
    designButton(card, 'Button_去餐谱', '去餐谱', [322, 312, 264, 76], () => { close(); this.showRecipeBook(); });
  }

  private foodIcon(parent: Node, id: IngredientType, x: number, y: number, size: number): Node {
    const icon = designNode(parent, 'CookingFood_' + id, [x, y, size, size]);
    this.addIngredientImage(icon, id, false, size, size);
    return icon;
  }

  private dishArt(parent: Node, dish: Recipe, x: number, y: number, width: number): void {
    const size = width / 280;
    const frame = designNode(parent, 'CookingDishArt', [x, y, width, 144 * size]);
    const art = designNode(frame, 'CookingDish', [0, 0, 280, 144]);
    art.setPosition(0, 0);
    art.setScale(size, size, 1);
    drawCookingDish(art, dish.ingredients, this.foodIcon.bind(this));
  }

  private showCookingHelp(): void {
    if (this.cookingHelp || this.cookingModal) return;
    this.resetCookingDrag();
    const {overlay, panel} = designOverlay(this.node, HELP, this.viewportHeight, false,
      'game-ui/bg-0' + getPageTheme().id);
    this.cookingHelp = overlay;
    const close = () => this.dismissPlayerMenu(HELP);
    designHeader(panel, '玩法说明');
    designHit(designNode(panel, 'HeaderBack', [22, 204, 132, 88]), close);
    const theme = getPageTheme();
    const intro = designNode(panel, 'CookingHelpIntro', [40, 288, 640, 112]);
    designSurface(intro, theme.card, theme.radius, theme.edge);
    designText(intro, '转动圆环，让缺口对准锁扣', [16, 8, 608, 47], 31, theme.ink, true);
    designText(intro, `每拆一环 +${COOKING_RING_SECONDS} 秒 · 金扣对准后下料`, [16, 56, 608, 44], 24, theme.accent, true);
    const {content} = designScroll(panel, 'CookingLessons', [40, 419, 640, 672], 605);
    drawCookingLessons(content);
    designFooter(panel, this.roundView ? '返回关卡' : '返回菜谱', close, 'Button_关闭烹饪说明');
    fitDesignPage(panel);
  }

  private page(title: string, back: () => void): Node | null {
    this.cooling = undefined;
    super.dismissPlayerMenu(PAGE);
    return this.designPage(PAGE, title, back, 'game-ui/bg-0' + getPageTheme().id);
  }

  private showRecipeBook(): void {
    const close = () => this.dismissPlayerMenu(PAGE);
    const panel = this.page('选择菜谱', close);
    if (!panel) return;
    const discovered = this.discovered, progress = this.cooking, theme = getPageTheme();
    const advanced = distinctCookingClears(progress);
    const rows = RECIPES.filter(dish => dish.difficulty === this.recipeDifficulty);
    if (this.recipeDifficulty === 1) rows.push(practiceRecipe(discovered));
    OVERLAY_DIFFICULTIES.forEach((label, index) => {
      const difficulty = (index + 1) as Recipe['difficulty'];
      designButton(panel, 'CookingDifficulty_' + difficulty, label, [40 + index * 215, 287, 210, 65], () => {
        if (this.recipeDifficulty === difficulty) return;
        this.recipeDifficulty = difficulty;
        this.showRecipeBook();
      }, difficulty !== this.recipeDifficulty);
    });
    const locked = this.recipeDifficulty !== 1 && advanced < 2;
    if (locked) designText(panel, `两道不同的菜达到 3 星后解锁 · ${advanced}/2`,
      [40, 358, 640, 42], 23, designOnBackground(), true);
    const listTop = locked ? 411 : 370;
    const {content} = designScroll(panel, 'RecipeList', [40, listTop, 640, 1090 - listTop], rows.length * 172);
    rows.forEach((dish, index) => {
      const card = designNode(content, 'Recipe_' + dish.id, [0, index * 172, 640, 158]);
      const key = recipeKey(dish), record = progress.dishes[key];
      designSurface(card, theme.card, undefined, record?.firstPerfect ? '#C09845' : theme.edge);
      this.dishArt(card, dish, 8, 24, 209);
      designText(card, dish.name, [224, 14, 340, 46], 32, theme.ink, true, true);
      designText(card, `${cookingRingCount(dish.difficulty)} 环 · ${recipeBatches(dish).length} 批`,
        [224, 59, 330, 36], 23, theme.muted, false, true);
      const status = dish.practice ? '拆环练习' : locked ? '进阶未解锁' : !this.canCook(dish) ? '缺少食材'
        : record?.firstClear ? `${scoreCooking(dish, record.best).stars} 星 · 已出品` : '';
      if (status) designText(card, status, [224, 102, 242, 43], 22, theme.muted, false, true);
      designText(card, '选择 ›', [475, 96, 140, 48], 25, theme.accent, true);
      designHit(card, () => this.showRecipe(dish));
    });
    designFooter(panel, '玩法说明', () => this.showCookingHelp(), 'Button_菜谱玩法说明', false);
  }

  private canCook(dish: Recipe): boolean {
    const discovered = this.discovered;
    return discovered.length >= COOKING_UNLOCK && (!dish.advanced || distinctCookingClears(this.cooking) >= 2)
      && dish.ingredients.every(([id]) => discovered.includes(id));
  }

  private showRecipe(dish: Recipe): void {
    const back = () => this.discovered.length >= COOKING_UNLOCK ? this.showRecipeBook() : this.dismissPlayerMenu(PAGE);
    const panel = this.page(dish.name, back);
    if (!panel) return;
    const theme = getPageTheme(), key = recipeKey(dish);
    const progress = this.cooking, record = progress.dishes[key], known = this.discovered;
    this.dishArt(panel, dish, 99, 282, 522);
    designText(panel, '食材目标', [40, 540, 640, 42], 27, designOnBackground(), true);
    dish.ingredients.forEach(([id, count], index) => {
      const row = designNode(panel, 'RecipeIngredient_' + id,
        [40 + 326 * (index % 2), 591 + Math.floor(index / 2) * 79, 314, 72]);
      const found = known.includes(id);
      designSurface(row, theme.card, theme.radius, found ? theme.edge : theme.line, false);
      this.foodIcon(row, id, 12, 4, 64);
      designText(row, getIngredient(id).name, [88, 0, 158, 72], 27, theme.ink, true, true);
      designText(row, found ? String(count) : `${count} ›`, [241, 0, 65, 72], 27, theme.accent, true);
      if (!found) designHit(row, () => {
        this.dismissPlayerMenu(PAGE);
        this.showIngredientDetail(id, () => this.showRecipe(dish));
      });
    });
    const rulesTop = 604 + Math.ceil(dish.ingredients.length / 2) * 79;
    const rules = designNode(panel, 'RecipeRules', [40, rulesTop, 640, 126]);
    designSurface(rules, theme.card, theme.radius, theme.edge);
    const difficulty = OVERLAY_DIFFICULTIES[dish.difficulty - 1];
    designText(rules, `${difficulty} · ${cookingRingCount(dish.difficulty)} 环 · ${recipeBatches(dish).length} 批`,
      [10, 8, 620, 53], 29, theme.ink, true);
    designText(rules, `开局 ${COOKING_TIME_SECONDS} 秒  ·  每拆一环 +${COOKING_RING_SECONDS} 秒`,
      [10, 61, 620, 52], 25, theme.accent, true);
    if (record) {
      const best = scoreCooking(dish, record.best);
      designText(panel, `个人最佳 ${best.score} 分 · ${best.stars} 星`,
        [40, rulesTop + 131, 640, 37], 24, designOnBackground(), true);
    }
    this.drawRecipeAction(panel, dish, () => this.showRecipe(dish));
    designButton(panel, 'Button_准备玩法说明', '玩法说明', [40, 1124, 202, 80], () => this.showCookingHelp(), true);
  }

  private drawRecipeAction(panel: Node, dish: Recipe, refresh: () => void, besideShare = false): void {
    const key = recipeKey(dish), theme = getPageTheme();
    const discovered = this.discovered;
    const box: [number, number, number, number] = [258, 1124, 422, 80];
    if (this.suspendedDish(dish)) {
      designButton(panel, 'Button_继续烹饪', '继续烹饪', box, () => this.beginCooking(dish));
    } else if (discovered.length < COOKING_UNLOCK || dish.ingredients.some(([id]) => !discovered.includes(id))) {
      designButton(panel, 'Button_去图鉴', '去图鉴', box, () => {
        this.dismissPlayerMenu(PAGE);
        this.showCollection('ingredients', {back: refresh, backLabel: '返回餐谱详情'});
      });
    } else if (!this.canCook(dish)) {
      designButton(panel, 'Button_进阶未解锁', '两道不同的菜达到 3 星后解锁', box, () => {}, true, true);
    } else if (!dish.practice && cookingCooldown(this.cooking, key)) {
      const label = designText(panel, '', besideShare ? [280, 1038, 400, 60] : [40, 1038, 640, 60],
        26, designOnBackground(), true);
      let lastSecond = -1;
      let lastTick = 0;
      this.cooling = () => {
        const now = Date.now();
        if (now - lastTick < 250) return;
        lastTick = now;
        const remaining = Math.ceil(cookingCooldown(this.cooking, key, now) / 1000);
        if (remaining <= 0 && this.adPanel !== panel) { refresh(); return; }
        if (remaining === lastSecond) return;
        lastSecond = remaining;
        label.string = `重做剩余 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      };
      this.cooling();
      designButton(panel, 'Button_广告重做', this.adsDisabled ? '立即重做' : '看广告立即重做',
        box, () => { void this.skipCooldown(panel, dish); });
    } else {
      designButton(panel, 'Button_开始烹饪', this.cooking.dishes[key] ? '再做一锅' : '开始烹饪', box,
        () => this.beginCooking(dish));
    }
  }

  private async skipCooldown(panel: Node, dish: Recipe): Promise<void> {
    if (this.adPanel) return;
    const key = recipeKey(dish), initial = this.cooking;
    const attempt = initial.dishes[key]?.latest.id;
    if (!attempt || !cookingCooldown(initial, key)) { this.beginCooking(dish); return; }
    const owner = this.playerService?.playerId;
    this.adPanel = panel;
    const result = await this.rewardedVideo.show();
    if (this.adPanel === panel) this.adPanel = undefined;
    const currentPage = this.node.getChildByName(PAGE)?.getChildByName('PlayerPanel');
    if (currentPage !== panel || this.playerService?.playerId !== owner) return;
    if (!cookingCooldown(this.cooking, key)) { this.beginCooking(dish); return; }
    if (result === 'completed' || result === 'skipped') {
      const progress = this.cooking;
      const next = skipCookingCooldown(progress, key, attempt);
      if (next === progress && cookingCooldown(progress, key)) return;
      if (next !== progress && !this.playerService?.setCooking(next)) {
        this.showToast('重做状态未能保存，请重试', '#A24A3C');
        return;
      }
      this.beginCooking(dish);
    } else if (result !== 'busy') {
      this.showToast(result === 'cancelled' ? '看完整段视频后才能立即重做'
        : result === 'unsupported' ? '请在微信小游戏中观看广告' : '广告暂不可用，冷却继续计时', '#A24A3C');
    }
  }

  private beginCooking(dish: Recipe): void {
    if (this.suspendedDish(dish)) {
      const saved = this.hiddenRound!;
      this.hiddenRound = undefined;
      this.drawCookingRound(saved.scroll, saved.served);
      return;
    }
    if (!this.canCook(dish) || (!dish.practice && cookingCooldown(this.cooking, recipeKey(dish)))) return;
    this.closeCookingModal();
    this.cooling = undefined;
    this.round = new CookingRingRound(dish, this.discovered);
    this.roundPlayer = this.playerService?.playerId;
    this.hiddenRound = undefined;
    this.recipeDifficulty = dish.difficulty;
    this.drawCookingRound();
  }

  private suspendedDish(dish: Recipe): boolean {
    return !!this.hiddenRound && !!this.round && recipeKey(this.round.dish) === recipeKey(dish)
      && this.roundPlayer === this.playerService?.playerId;
  }

  private drawCookingRound(scroll = 0, restored: IngredientType[] = []): void {
    const round = this.round;
    if (!round) return;
    const theme = getPageTheme();
    const back = () => { this.dismissPlayerMenu(PAGE); this.showRecipe(round.dish); };
    this.ringDrag = undefined;
    this.roundView = undefined;
    const panel = this.page(round.dish.name, back);
    if (!panel) return;
    const body = panel.getChildByName('DesignBody')!;
    const w = Math.floor(640 / round.batch.length);
    const countCards = round.batch.map(([id], i) => {
      const card = designNode(body, 'Portion_' + id, [40 + i * w, 44, w - 8, 68]);
      designSurface(card);
      this.foodIcon(card, id, 12, 6, 55);
      return designText(card, '', [73, 0, w - 85, 68], 28, theme.ink, true);
    });
    const header = OVERLAY_DIFFICULTIES[round.dish.difficulty - 1] + ' · ' + round.rings.length + ' 环';
    const batch = round.batches.length > 1 ? ` · 第 ${round.batchIndex + 1}/${round.batches.length} 批` : '';
    const stageLabel = designText(body, header + batch, [40, 0, 275, 42], 23, designOnBackground(), true, true);
    const guide = designText(body, '', [320, 0, 216, 42], 22, designOnBackground());
    const clockCard = designNode(body, 'CookingClock', [546, 0, 134, 39]);
    designSurface(clockCard, theme.light, 15, theme.edge, false);
    const clock = designText(clockCard, '', [4, 0, 126, 39], 27, theme.ink, true);
    const field = designNode(body, 'CookingRingBoard', [48, 126, BOARD_WIDTH, 510]);
    const viewport = designNode(field, 'CookingRingViewport', [6, 7, BOARD_WIDTH - 20, 410]);
    viewport.addComponent(Mask);
    const content = designNode(viewport, 'CookingRingContent', [0, 0, BOARD_WIDTH, round.height]);
    const rings = round.rings.map((ring, index) => {
      const node = designNode(content, 'CookingRing_' + index, [ring.x - 89, ring.y - 89, 178, 178]);
      const shape = designNode(node, 'RingShape', [0, 0, 178, 178]);
      const marker = designNode(node, 'RingPortion', [47, 47, 84, 84]);
      let peg: Node | undefined;
      if (ring.food) {
        const size = Math.round(ring.radius * 1.12);
        this.foodIcon(marker, ring.food.id, (84 - size) / 2, (84 - size) / 2, size);
        peg = designNode(node, 'CookingServingPeg', [0, 0, 178, 178]);
        paintCookingServingPeg(peg, ring);
      }
      paintCookingRing(shape, ring, index);
      return {node, shape, marker, peg};
    });
    const clips = round.clips.map((clip, index) => {
      const from = round.rings[clip.holder], to = round.rings[clip.owner];
      const span = Math.hypot(from.x - to.x, from.y - to.y);
      const node = designNode(content, 'CookingClip_' + index,
        [(from.x + to.x - span) / 2, (from.y + to.y) / 2 - 20, span, 40]);
      node.angle = -clip.angle;
      paintCookingClip(node, span, from.radius, to.radius, false, clip.paired, clip.turnDirection);
      const slider = clip.pinned && clip.sharedPin === undefined
        ? designNode(node, 'CookingSlider', [span / 2 - 34, -23, 68, 86]) : undefined;
      if (slider) paintCookingSlider(slider, clip.pinShape);
      return {node, span, slider, highlighted: false};
    });
    const sharedPins: RoundView['sharedPins'] = new Map();
    round.clips.forEach((clip, index) => {
      if (clip.sharedPin === undefined || clip.sharedPin < index) return;
      const a = clips[index].node.position, b = clips[clip.sharedPin].node.position;
      const length = Math.abs(a.y - b.y);
      const node = designNode(content, 'CookingSharedPin_' + index,
        [a.x + BOARD_WIDTH / 2 - 18, (round.height - a.y - b.y - length) / 2 - 12, 36, length + 24]);
      node.setSiblingIndex(clips[index].node.getSiblingIndex());
      const x = node.position.x, y = node.position.y;
      let cross: Node | undefined;
      if (clip.crossPinned !== undefined) {
        cross = designNode(content, 'CookingCrossPin_' + index, [0, 0, 100, 36]);
        cross.setPosition(x, y);
        paintCookingCrossPin(cross);
      }
      sharedPins.set(index, {node, y, x, length, cross});
      paintCookingSharedPin(node, length + 16);
    });
    const rail = designNode(field, 'CookingScrollRail', [611, 16, 6, 390]);
    const thumb = designNode(rail, 'CookingScrollThumb', [0, 0, 6, 64]);
    const touchArea = designNode(body, 'CookingBoardTouch', [54, 128, BOARD_WIDTH + 28, 410]);
    const pot = designNode(field, 'CookingPot', [172, 420, 280, 84]);
    paintCookingPot(pot);
    const bonusCard = designNode(field, 'CookingTimeBonus', [450, 420, 144, 45]);
    designSurface(bonusCard, theme.light, 21, theme.edge, false);
    const bonus = designText(bonusCard, '', [4, 0, 136, 45], 27, theme.dark, true);
    bonusCard.active = false;
    const status = designText(body, '', [40, 650, 640, 44], 24, designOnBackground(), true);
    const help = designButton(body, 'Button_烹饪玩法说明', '玩法说明', [40, 704, 216, 68],
      () => this.showCookingHelp(), true);
    const action = designButton(body, 'Button_烹饪操作', '', [272, 704, 408, 68], () => this.cookingAction());
    const ui: RoundView = {field, viewport, content, rail, thumb, touchArea, rings, clips, sharedPins, counts: countCards,
      clock, status, action, bonus, pending: 0, served: [], servedIds: restored.slice(), dropSerial: 0,
      scroll, fieldHeight: 510, viewHeight: 410};
    this.roundView = ui;

    const place = (node: Node, host: Node, x: number, y: number, width: number, height: number) => {
      const frame = host.getComponent(UITransform)!;
      node.getComponent(UITransform)!.setContentSize(width, height);
      node.setPosition(x + width / 2 - frame.width / 2, frame.height / 2 - y - height / 2);
    };
    (panel as Node & {layoutDesignContent?: (layout: DesignPageLayout) => void}).layoutDesignContent = layout => {
      const top = layout.bodyTop - 6;
      const height = Math.max(440, layout.footerTop + 112 - top);
      const scale = Math.min(1, (layout.footerTop + 112 - top) / height);
      body.getComponent(UITransform)!.setContentSize(720, height);
      body.setScale(1, scale, 1);
      body.setPosition(0, layout.height / 2 - top - height * scale / 2);
      place(stageLabel.node, body, 40, 0, 275, 39);
      place(guide.node, body, 320, 0, 216, 39);
      place(clockCard, body, 546, 0, 134, 39);
      countCards.forEach((card, index) => place(card.node.parent!, body, 40 + index * w, 44, w - 8, 68));
      ui.fieldHeight = height - 242;
      ui.viewHeight = ui.fieldHeight - 93;
      place(field, body, 48, 121, BOARD_WIDTH, ui.fieldHeight);
      designSurface(field, theme.panel, theme.radius, theme.edge);
      place(viewport, field, 6, 7, BOARD_WIDTH - 20, ui.viewHeight);
      place(rail, field, 611, 15, 6, Math.max(20, ui.viewHeight - 16));
      place(touchArea, body, 54, 128, BOARD_WIDTH + 28, ui.viewHeight);
      designSurface(rail, theme.disabled, 2, '', false);
      place(pot, field, 172, ui.fieldHeight - 87, 280, 84);
      place(bonusCard, field, 450, ui.fieldHeight - 80, 144, 45);
      place(status.node, body, 40, height - 114, 640, 41);
      place(help, body, 40, height - 68, 216, 68);
      place(action, body, 272, height - 68, 408, 68);
      this.scrollCooking(ui, round, ui.scroll);
      this.setCookingText(guide, ui.viewHeight < round.height ? '拖空白处滚动' : '缺口对准银扣');
      ui.served.forEach((item, i) => item.setPosition(this.potTarget(ui, i)));
    };
    fitDesignPage(panel);
    for (const id of restored) {
      const item = this.foodIcon(field, id, 0, 0, 56);
      item.setScale(.68, .68, 1);
      item.setPosition(this.potTarget(ui, ui.dropSerial++));
      ui.served.push(item);
    }
    this.bindRingTouch(ui, round);
    this.renderCookingRound();
  }

  private scrollCooking(ui: RoundView, round: CookingRingRound, offset: number): void {
    const limit = Math.max(0, round.height - ui.viewHeight);
    ui.scroll = Math.min(limit, Math.max(0, offset));
    const contentY = (ui.viewHeight - round.height) / 2 + ui.scroll + (limit ? 0 : (round.height - ui.viewHeight) / 2 * .45);
    ui.content.setPosition(4, contentY, 0);
    ui.rail.active = limit > 0;
    if (!limit) return;
    const railHeight = ui.rail.getComponent(UITransform)!.height;
    const height = Math.max(35, railHeight * ui.viewHeight / round.height);
    ui.thumb.getComponent(UITransform)!.setContentSize(6, height);
    ui.thumb.setPosition(0, (railHeight - height) * (.5 - ui.scroll / limit));
    designSurface(ui.thumb, getPageTheme().edge, 2, '', false);
  }

  private bindRingTouch(ui: RoundView, round: CookingRingRound): void {
    const {viewport} = ui;
    const transform = viewport.getComponent(UITransform)!;
    const point = new Vec3();
    const position = (event: EventTouch) => {
      const {x, y} = event.getUILocation();
      return transform.convertToNodeSpaceAR(point.set(x, y, 0));
    };
    const ringCenter = (i: number) => ({
      x: round.rings[i].x - BOARD_WIDTH / 2 + ui.content.position.x,
      y: round.height / 2 - round.rings[i].y + ui.content.position.y,
    });
    const canTouch = () => this.round === round && this.cookingVisible(ui)
      && !this.ringDrag && !round.ruined && !round.expired;
    ui.touchArea.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      const id = event.getID();
      if (id === null || !canTouch()) return;
      const {x, y} = position(event);
      if (x >= transform.width / 2) {
        this.ringDrag = {id, scrollY: y};
        return;
      }
      const nearby = Array.from(ui.sharedPins.entries());
      const crossed = nearby.find(([, pin]) => pin.cross?.active && Math.abs(x - pin.x - ui.content.position.x) <= 49
        && Math.abs(y - pin.y - ui.content.position.y) <= 18);
      const shared = crossed ?? nearby.find(([, pin]) => pin.node.active
        && Math.abs(x - pin.x - ui.content.position.x) <= 18
        && Math.abs(y - pin.y - ui.content.position.y) <= pin.length / 2 + 12);
      const pin = shared?.[0] ?? round.clips.findIndex((clip, i) => {
        if (!clip.attached || !clip.pinned) return false;
        if (clip.sharedPin !== undefined) return false;
        const node = ui.clips[i].node;
        const dx = x - node.position.x - ui.content.position.x;
        const dy = y - node.position.y - ui.content.position.y;
        const angle = clip.angle * Math.PI / 180;
        return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= (clip.pinShape === 'straight' ? 21 : 36)
          && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= 44;
      });
      if (pin >= 0) {
        if (crossed || !round.clips[pin].crossPinned) this.ringDrag = {id, pin, x, y, cross: !!crossed};
        ui.focused = undefined;
        ui.notice = crossed || round.clips[pin].crossPinned ? '先横向抽出上层短管'
          : shared ? '上下抽出长管，可松开两处锁扣' : '沿绿色管子的直段抽出';
        this.renderCookingRound();
        return;
      }
      let index = -1, closest = Infinity;
      round.rings.forEach((ring, i) => {
        if (!round.present(i)) return;
        const center = ringCenter(i);
        const dx = x - center.x, dy = center.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance <= ring.radius + 16 && distance < closest) {
          index = i;
          closest = distance;
        }
      });
      if (index >= 0 && ui.pending) return;
      ui.focused = index < 0 ? undefined : index;
      ui.notice = undefined;
      if (index < 0) this.ringDrag = {id, scrollY: y};
      else {
        const center = ringCenter(index);
        const angle = Math.hypot(x - center.x, y - center.y) >= 17
          ? Math.atan2(center.y - y, x - center.x) * 180 / Math.PI : undefined;
        this.ringDrag = {id, index, angle};
        const directional = round.clips.find(clip => clip.attached && clip.turnDirection
          && (clip.holder === index || clip.owner === index));
        if (directional) {
          ui.notice = directional.holder === index ? `按箭头${directional.turnDirection === 1 ? '顺' : '逆'}时针转动`
            : '从箭头标记的一侧转动';
        } else if (round.clips.some(clip => clip.attached && clip.paired && (clip.holder === index || clip.owner === index))) {
          ui.notice = '紫色双扣需要两端缺口同时对准';
        }
      }
      this.renderCookingRound();
    });
    const gestureMove = (event: EventTouch) => {
      const drag = this.ringDrag;
      if (!drag || this.round !== round || !this.cookingVisible(ui) || round.expired || event.getID() !== drag.id) return;
      const {x, y} = position(event);
      if ('scrollY' in drag) {
        this.scrollCooking(ui, round, ui.scroll + y - drag.scrollY);
        drag.scrollY = y;
        return;
      }
      if ('pin' in drag) {
        const clip = round.clips[drag.pin], angle = clip.angle * Math.PI / 180;
        const shared = ui.sharedPins.get(drag.pin);
        const travel = drag.cross ? x - drag.x : shared ? y - drag.y
          : (x - drag.x) * Math.sin(angle) + (y - drag.y) * Math.cos(angle);
        if (Math.abs(travel) < (drag.cross ? 43 : shared ? 54 : PULL_PIN_DISTANCE[clip.pinShape])) {
          if (drag.cross && shared) shared.cross?.setPosition(shared.x + travel, shared.y, 0);
          else if (shared) shared.node.setPosition(shared.x, shared.y + travel, 0);
          else ui.clips[drag.pin].slider?.setPosition(0, travel, 0);
          return;
        }
        if (drag.cross ? round.pullCrossPin(drag.pin) : round.pullPin(drag.pin)) {
          ui.notice = drag.cross ? '上层已抽出，再上下拖出长管' : '管子已抽出，可以转环解扣';
        }
        this.resetCookingDrag();
        this.renderCookingRound();
        return;
      }

      const center = ringCenter(drag.index);
      if (Math.hypot(x - center.x, y - center.y) < 17) { drag.angle = undefined; return; }
      const angle = Math.atan2(center.y - y, x - center.x) * 180 / Math.PI;
      const previous = drag.angle;
      drag.angle = angle;
      if (previous === undefined) return;
      const delta = ((angle - previous + 540) % 360) - 180;
      const before = round.timeLeft;
      const drop = round.rotate(drag.index, delta);
      if (drop) {
        this.dropCookingFood(ui, round, drop.ring, drop.food);
        this.playEffect('match', .58);
        ui.notice = `${getIngredient(drop.food.id).name} 下锅`;
      }
      const bonus = Math.round(round.timeLeft - before);
      if (bonus) {
        if (!drop) ui.notice = '解环成功';
        this.showCookingBonus(ui, bonus);
      }
      if (!round.present(drag.index)) ui.focused = undefined;
      if (round.ruined) this.ringDrag = undefined;
      this.renderCookingRound();
    };
    const release = (event: EventTouch) => {
      if (event.getID() !== this.ringDrag?.id) return;
      this.resetCookingDrag();
      this.renderCookingRound();
    };
    ui.touchArea.on(Node.EventType.TOUCH_MOVE, gestureMove);
    ui.touchArea.on(Node.EventType.TOUCH_END, release);
    ui.touchArea.on(Node.EventType.TOUCH_CANCEL, release);
  }

  private resetCookingDrag(): void {
    const drag = this.ringDrag;
    if (drag && 'pin' in drag && this.roundView) {
      const shared = this.roundView.sharedPins.get(drag.pin);
      if (shared) {
        shared.node.setPosition(shared.x, shared.y, 0);
        shared.cross?.setPosition(shared.x, shared.y, 0);
      }
      else this.roundView.clips[drag.pin].slider?.setPosition(0, 0, 0);
    }
    this.ringDrag = undefined;
  }

  private showCookingBonus(ui: RoundView, seconds: number): void {
    const card = ui.bonus.node.parent!;
    Tween.stopAllByTarget(card);
    card.active = true;
    this.setCookingText(ui.bonus, `+${seconds} 秒`);
    tween(card).delay(1.1).call(() => { if (card.isValid) card.active = false; }).start();
  }

  private potTarget(ui: RoundView, serial: number): Vec3 {
    return new Vec3([-42, 0, 42][serial % 3], 64 - ui.fieldHeight / 2, 0);
  }

  private dropCookingFood(ui: RoundView, round: CookingRingRound, index: number, food: RingPortion): void {
    const ring = round.rings[index];
    const y = ui.fieldHeight / 2 - ui.viewport.position.y - ui.content.position.y - round.height / 2 + ring.y;
    const item = this.foodIcon(ui.field, food.id, ring.x - 31, Math.max(6, Math.min(ui.viewHeight, y)) - 28, 56);
    const serial = ui.dropSerial++;
    ui.servedIds = [...ui.servedIds, food.id].slice(-3);
    ui.pending++;
    tween(item).to(.38, {position: this.potTarget(ui, serial),
      scale: new Vec3(.68, .68, 1)}, {easing: 'quadIn'}).call(() => {
      if (this.roundView !== ui || this.round !== round) return;
      ui.pending--;
      item.setPosition(this.potTarget(ui, serial));
      ui.served.push(item);
      if (ui.served.length > 3) {
        const old = ui.served.shift()!;
        old.removeFromParent();
        old.destroy();
      }
      this.renderCookingRound();
    }).start();
  }

  private renderCookingRound(): void {
    const round = this.round!, ui = this.roundView!, theme = getPageTheme();
    round.rings.forEach((ring, index) => {
      const view = ui.rings[index];
      view.node.active = round.present(index);
      if (!view.node.active) return;
      const locked = round.locked(index);
      if (view.shape.angle !== -ring.angle) view.shape.angle = -ring.angle;
      view.marker.active = !ring.released;
      if (view.peg) view.peg.active = !locked && !ring.released;
    });
    round.clips.forEach((clip, index) => {
      const view = ui.clips[index];
      view.node.active = clip.attached;
      if (view.slider) view.slider.active = clip.pinned;
      if (!clip.attached) return;
      const highlighted = ui.focused !== undefined
        && (clip.owner === ui.focused || clip.holder === ui.focused);
      if (view.highlighted !== highlighted) {
        paintCookingClip(view.node, view.span, round.rings[clip.holder].radius,
          round.rings[clip.owner].radius, highlighted, clip.paired, clip.turnDirection);
        view.highlighted = highlighted;
      }
    });
    ui.sharedPins.forEach(({node, cross}, index) => {
      node.active = round.clips[index].pinned;
      if (cross) cross.active = node.active && !!round.clips[index].crossPinned;
    });
    round.batch.forEach(([id, target], i) => {
      const count = round.portions[id] ?? 0;
      this.setCookingText(ui.counts[i], `${count}/${target}${count === target ? ' ✓' : ''}`);
    });
    this.renderCookingClock(round, ui);
    const status = round.expired ? '烹饪时间用完'
      : ui.notice ?? (round.batchReady && !ui.pending ? '本批食材已齐' : '任意转环，解扣后对准金扣下料');
    this.setCookingText(ui.status, status);
    const caption = round.lastBatch ? '出锅' : '下一批';
    this.setCookingButton(ui.action, caption, round.ruined || round.expired || ui.pending > 0
      || (round.lastBatch ? !round.hasFood : !round.batchReady && !round.finished));
    if (!ui.pending && this.cookingVisible(ui)) {
      if (round.expired) {
        ui.bonus.node.parent!.active = false;
        this.showCookingTimeout(round);
      } else if (round.ruined) this.showCookingFailure(round);
    }
  }

  private renderCookingClock(round: CookingRingRound, ui: RoundView): void {
    const seconds = Math.ceil(round.timeLeft);
    const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (ui.clock.string === text) return;
    ui.clock.string = text;
    ui.clock.color = hex(seconds < 30 ? '#AA3327' : getPageTheme().ink);
  }

  private setCookingButton(button: Node, caption: string, disabled: boolean, secondary = false): void {
    const theme = getPageTheme(), action = button as Node & {referenceDisabled?: boolean};
    const label = button.getChildByName('Label')!.getComponent(Label)!;
    this.setCookingText(label, caption);
    if (action.referenceDisabled === disabled) return;
    action.referenceDisabled = disabled;
    label.color = hex(disabled ? theme.muted : secondary ? theme.ink : theme.onAccent);
    designSurface(button, disabled ? theme.disabled : secondary ? theme.card : theme.accent);
  }

  private closeCookingModal(): void {
    const overlay = this.cookingModal;
    this.cookingModal = undefined;
    overlay?.removeFromParent();
    overlay?.destroy();
  }

  private showCookingTimeout(round: CookingRingRound): void {
    if (this.cookingModal) return;
    const {overlay, panel} = designOverlay(this.node, 'CookingTimeoutOverlay', this.viewportHeight, true);
    this.cookingModal = overlay;
    const theme = getPageTheme();
    const card = designNode(panel, 'CookingTimeoutCard', [54, 415, 612, 426]);
    designSurface(card, theme.card, theme.radius, theme.edge);
    const badge = designNode(card, 'CookingHourglass', [268, -37, 76, 76]);
    designSurface(badge, theme.light, 38, theme.edge, false);
    paintCookingHourglass(designNode(badge, 'HourglassArtwork', [6, 6, 64, 64]));
    designText(card, '烹饪时间用完', [24, 34, 564, 62], 37, theme.ink, true);
    const detail = designText(card, `看完视频，恢复 ${COOKING_TIME_SECONDS} 秒`, [28, 104, 556, 64], 29, theme.ink, true);
    designText(card, '保留当前盘面', [28, 170, 556, 42], 24, theme.accent, true);
    const caption = this.adsDisabled ? '继续烹饪' : '看视频续时';
    const button = designButton(card, 'Button_烹饪视频续时', caption, [34, 226, 544, 70], () => {
      void this.resumeCookingTimer(round, overlay, detail, button, caption);
    });
    designButton(card, 'Button_结束烹饪', '结束烹饪', [34, 316, 544, 64], () => {
      if (!this.adPanel) this.endCooking();
    }, true);
  }

  private async resumeCookingTimer(round: CookingRingRound, overlay: Node, detail: Label,
    button: Node, caption: string): Promise<void> {
    if (this.adPanel || this.round !== round || this.cookingModal !== overlay || !round.expired) return;
    const player = this.playerService?.playerId;
    this.adPanel = overlay;
    this.setCookingButton(button, '正在打开视频…', true);
    const result = await this.rewardedVideo.show(COOKING_TIME_AD_UNIT);
    if (this.adPanel === overlay) this.adPanel = undefined;
    if (this.round !== round || this.cookingModal !== overlay || this.playerService?.playerId !== player) return;
    if ((result === 'completed' || result === 'skipped') && round.resumeAfterVideo()) {
      this.closeCookingModal();
      if (this.roundView) {
        this.roundView.notice = '时间已恢复，继续解环';
        this.renderCookingRound();
      }
      return;
    }
    this.setCookingButton(button, caption, false);
    detail.string = result === 'cancelled' ? '视频未看完，可以再试。' : '视频暂不可用，可以稍后重试。';
  }

  private showCookingFailure(round: CookingRingRound): void {
    if (this.cookingModal) return;
    const {overlay, panel} = designOverlay(this.node, 'CookingFailureOverlay', this.viewportHeight, true);
    this.cookingModal = overlay;
    this.playEffect('lose', .65);
    const theme = getPageTheme();
    const card = designNode(panel, 'CookingFailureCard', [54, 415, 612, 426]);
    designSurface(card, theme.card, theme.radius, theme.edge);
    designText(card, '这锅配方不符', [24, 34, 564, 62], 37, theme.ink, true);
    designText(card, '这锅食材已经超量，可以重新开始。', [28, 104, 556, 72], 26, theme.ink, true);
    designButton(card, 'Button_重开本锅', '重开本锅', [34, 226, 544, 70], () => this.beginCooking(round.dish));
    designButton(card, 'Button_补救返回餐谱', '返回菜谱', [34, 316, 544, 64], () => this.endCooking(), true);
  }

  private confirmCookingResult(round: CookingRingRound): void {
    if (this.cookingModal) return;
    const {overlay, panel} = designOverlay(this.node, 'CookingConfirmOverlay', this.viewportHeight, true);
    this.cookingModal = overlay;
    const theme = getPageTheme();
    const card = designNode(panel, 'CookingConfirmCard', [54, 471, 612, 301]);
    designSurface(card, theme.card, theme.radius, theme.edge);
    designText(card, '食材还没齐', [22, 28, 568, 61], 38, theme.ink, true);
    designText(card, `现在出锅预计 ${round.result.stars} 星。`, [22, 102, 568, 55], 27, theme.ink);
    designButton(card, 'Button_继续解环', '继续解环', [30, 191, 264, 70], () => this.closeCookingModal());
    designButton(card, 'Button_确认出锅', '确认出锅', [318, 191, 264, 70], () => {
      this.closeCookingModal();
      this.finishCooking(round);
    }, true);
  }


  private setCookingText(label: Label, value: string): void {
    if (label.string !== value) label.string = value;
  }

  private cookingAction(): void {
    const round = this.round;
    if (!round || !this.roundView || !this.cookingVisible(this.roundView)
      || this.roundView.pending || round.ruined || round.expired) return;
    if (!round.lastBatch) {
      if (round.nextBatch()) this.drawCookingRound();
    } else if (round.hasFood) {
      if (round.batchReady) this.finishCooking(round);
      else this.confirmCookingResult(round);
    }
  }

  private cookingVisible(ui: RoundView): boolean {
    return this.enabledInHierarchy && ui.field.activeInHierarchy && !this.inBackground && !this.cookingHelp && !this.cookingModal;
  }

  private pauseCooking(): void {
    this.inBackground = true;
    this.resetCookingDrag();
    if (this.roundView) this.roundView.focused = undefined;
  }

  private resumeCooking(): void {
    this.inBackground = false;
    if (this.round && this.roundView) this.renderCookingRound();
  }

  private endCooking(): void {
    this.dismissPlayerMenu(PAGE);
    this.round = undefined;
    this.hiddenRound = undefined;
    this.showRecipeBook();
  }

  private finishCooking(round: CookingRingRound): void {
    if (!round.dish.practice) {
      const progress = this.cooking, source = this.getCookingSource();
      const next = settleCooking(progress, round.dish, round.portions, source,
        (progress.sources[source]?.sequence ?? 0) + 1, Date.now());
      if (!this.playerService?.setCooking(next)) {
        this.renderCookingRound();
        this.showToast('出品未能保存，请重试', '#A24A3C');
        return;
      }
    }
    this.round = undefined;
    this.roundView = undefined;
    this.hiddenRound = undefined;
    this.showCookingResult(round);
  }

  private getCookingSource(): string {
    if (this.deviceSource) return this.deviceSource;
    const generated = Date.now().toString(36) + Math.random().toString(36).slice(2).padEnd(11, '0');
    try {
      const saved = sys.localStorage.getItem(SOURCE_KEY);
      this.deviceSource = saved && /^[a-z0-9]{12,36}$/.test(saved) ? saved : generated;
      sys.localStorage.setItem(SOURCE_KEY, this.deviceSource);
    } catch { this.deviceSource ||= generated; }
    return this.deviceSource;
  }

  private showCookingResult(round: CookingRingRound): void {
    const dish = round.dish, theme = getPageTheme();
    const back = () => this.showRecipeBook();
    const panel = this.page('出锅啦', back);
    if (!panel) return;
    const result = scoreCooking(dish, round.portions);
    this.dishArt(panel, dish, 100, 281, 520);
    const summary = designNode(panel, 'CookingResultSummary', [40, 541, 640, 141]);
    designSurface(summary, theme.card, undefined, result.stars === 5 ? '#C09845' : theme.edge);
    designText(summary, dish.name, [20, 6, 600, 43], 36, theme.ink, true);
    designText(summary, `${'★'.repeat(result.stars)}${'☆'.repeat(5 - result.stars)}`, [20, 47, 600, 53], 47, '#B47D20', true);
    designText(summary, `${result.score} / ${recipeMax(dish)} 出品分`, [20, 102, 600, 33], 24, theme.muted, true);
    drawCookingBreakdown(panel, result, this.foodIcon.bind(this));
    if (!dish.practice) {
      designButton(panel, 'Button_好友点单', '请好友也做一盘', [40, 1038, 234, 58],
        () => this.shareGame(`锅里捞啥｜我做了${result.stars}星${dish.name}，你也来试一盘！`, recipeKey(dish)), true);
    }
    this.drawRecipeAction(panel, dish, () => this.showCookingResult(round), !dish.practice);
    designButton(panel, 'Button_返回菜谱', '返回菜谱', [40, 1124, 202, 80], back, true);
  }

  protected showCookingRanking(scope: number): void {
    const service = this.playerService;
    if (!service) return;
    const close = () => { this.dismissPlayerMenu(PAGE); this.showDesignRanking(scope); };
    const panel = this.page('餐谱五星榜', close);
    if (!panel) return;
    const t = getPageTheme(), codes = service.state.profile.regionCodes;
    const region = regionPath(service.regions, codes)[scope - 1];
    designButton(panel, 'Button_通关榜', '通关', [40, 292, 312, 60], close, true);
    designButton(panel, 'Button_五星榜', '餐谱五星', [368, 292, 312, 60], () => {});
    ['全国', '省内', '市内'].forEach((name, index) =>
      designButton(panel, 'CookingRankScope_' + index, name, [40 + index * 215, 365, 210, 60],
        () => this.showCookingRanking(index), index !== scope));
    designText(panel, `${scope === 0 ? '全国' : region?.name ?? '未选地区'} · ${RECIPES.length} 道餐谱全五星入榜`,
      [40, 435, 640, 46], 25, designOnBackground(), true);
    const current = cookingPerfectCount(this.cooking);
    designText(panel, `我的进度 ${current}/${RECIPES.length}${current < RECIPES.length ? ` · 还差 ${RECIPES.length - current} 道` : ' · 已全五星'}`,
      [40, 967, 640, 50], 27, designOnBackground(), true);
    designButton(panel, 'Button_去餐谱', '去餐谱', [40, 1032, 640, 68], () => { this.dismissPlayerMenu(PAGE); this.openCooking(); });
    designFooter(panel, '返回', close);
    const status = designText(panel, '正在加载榜单…', [40, 540, 640, 112], 28, designOnBackground());
    if (scope && !region) {
      status.string = '请先选择对应地区';
      designButton(panel, 'Button_选择地区', '选择地区', [175, 668, 370, 66], () => {
        this.dismissPlayerMenu(PAGE);
        this.showRegionPicker([]);
      }, true);
      return;
    }
    void service.cookingLeaderboard(scope).then(rows => {
      if (!panel.isValid || panel.parent !== this.node.getChildByName(PAGE)) return;
      if (!rows.length) { status.string = '本地区暂无全五星玩家'; return; }
      status.node.destroy();
      const {content} = designScroll(panel, 'CookingRankingRows', [40, 500, 640, 445], rows.length * 68);
      rows.forEach((row, i) => {
        const card = designNode(content, 'CookingRank_' + i, [0, i * 68, 640, 62]);
        designSurface(card, t.card, 12, t.line, false);
        const name = row.nickname || (row.playerId === service.playerId ? '我' : '玩家 ' + row.playerId.slice(0, 8));
        designText(card, `${i + 1}    ${name}`, [20, 0, 350, 62], 28, t.ink, true, true);
        designText(card, new Date(row.at).toLocaleDateString(), [385, 0, 230, 62], 24, t.muted);
      });
    }).catch(() => { if (status.isValid) status.string = '餐谱五星榜暂不可用，请稍后重试'; });
  }
}
