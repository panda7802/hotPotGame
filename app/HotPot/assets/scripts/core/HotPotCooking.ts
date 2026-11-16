import {EventTouch, game, Game, Label, Mask, Node, sys, tween, UITransform, Vec3} from 'cc';
import {
  COOKING_UNLOCK, findRecipe,
  practiceRecipe, Recipe, recipeKey, recipeMax, RECIPES, scoreCooking,
} from '../data/CookingData';
import {
  cookingCooldown, cookingPerfectCount, distinctCookingClears, emptyCooking,
  settleCooking, skipCookingCooldown,
} from '../data/CookingProgress';
import {CookingRing, cookingRingRim, COOKING_TIME_SECONDS, CookingRingRound, CookingRingSnapshot, RingPortion} from '../data/CookingRingRound';
import {getIngredient, IngredientType} from '../data/GameData';
import {getPageTheme} from '../data/PageTheme';
import {GameSave, regionPath} from '../data/PlayerData';
import {drawCookingBreakdown} from './CookingResultView';
import {paintCookingClip, paintCookingPot, paintCookingRing, paintCookingServingPeg, paintCookingSlider} from './CookingRingView';
import {hex} from './HotPotUi';
import {
  designButton, designFooter, designHit, designNode, designOnBackground,
  designOverlay, designScroll, designSurface, designText, DesignPageLayout, fitDesignPage,
} from './HotPotDesignUi';
import {HotPotNativeAds} from './HotPotNativeAds';

const PAGE = 'CookingOverlay';
const UNLOCK = 'CookingUnlockOverlay';
const BOARD_WIDTH = 624;
const OVERLAY_DIFFICULTIES = ['简单', '一般', '困难'];
const SOURCE_KEY = 'hotpot.cooking.device.v1';
const COOKING_TIME_AD_UNIT = 'adunit-4bfa2babdf8bbd0e';
const PULL_PIN_DISTANCE = {straight: 42, elbow: 49, u: 54};

function rimAt(ring: CookingRing, worldAngle: number): number {
  return Math.round(cookingRingRim(ring.radius, ring.shape, (worldAngle - ring.angle) * Math.PI / 180));
}

interface CookingUndo {
  state: CookingRingSnapshot;
  scroll: number;
  served: IngredientType[];
}

type CookingDrag = {id: number; scrollY: number}
  | {id: number; pin: number; x: number; y: number}
  | {id: number; index: number; angle?: number; checkpoint: CookingUndo; clips: number};

interface RoundView {
  field: Node;
  viewport: Node;
  content: Node;
  rail: Node;
  thumb: Node;
  scrollHit: Node;
  rings: {node: Node; shape: Node; marker: Node; peg?: Node}[];
  clips: {node: Node; slider?: Node; span: number; from: number; to: number; highlighted: boolean}[];
  counts: Label[];
  clock: Label;
  status: Label;
  action: Node;
  undoButton: Node;
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
  private paused = false;
  private ringDrag?: CookingDrag;
  private undo?: CookingUndo;
  private freeUndoUsed = false;
  private cookingReviveUsed = false;
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
  }

  onDisable(): void {
    game.off(Game.EVENT_HIDE, this.pauseCooking, this);
    this.pauseCooking();
    super.onDisable();
  }

  onDestroy(): void {
    game.off(Game.EVENT_HIDE, this.pauseCooking, this);
    super.onDestroy();
  }

  protected hasPlayerMenu(): boolean {
    return !!this.node.getChildByName(PAGE) || !!this.node.getChildByName(UNLOCK) || super.hasPlayerMenu();
  }

  protected dismissPlayerMenu(name: string): void {
    if (name === PAGE) {
      this.closeCookingModal();
      this.undo = undefined;
      this.round = undefined;
      this.roundView = undefined;
      this.ringDrag = undefined;
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
    this.cooling?.();
    const round = this.round, ui = this.roundView;
    if (!round || !ui || this.paused || this.cookingModal || round.ruined || round.expired) return;
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

  private page(title: string, back: () => void): Node | null {
    this.cooling = undefined;
    super.dismissPlayerMenu(PAGE);
    return this.designPage(PAGE, title, back, 'game-ui/bg-0' + getPageTheme().id);
  }

  private showRecipeBook(): void {
    const close = () => this.dismissPlayerMenu(PAGE);
    const panel = this.page('我的餐谱', close);
    if (!panel) return;
    const discovered = this.discovered, progress = this.cooking, theme = getPageTheme();
    const advanced = distinctCookingClears(progress);
    const ready = RECIPES.filter(dish => !dish.advanced || advanced >= 2);
    const first = ready.find(dish => this.canCook(dish) && !cookingCooldown(progress, recipeKey(dish)));
    const practice = practiceRecipe(discovered);
    const rows = first ? [first, ...ready.filter(dish => dish !== first), practice] : [practice, ...ready];
    designText(panel, advanced < 2 ? `小馆进阶 ${advanced}/2 · 两道正式菜达到 3 星`
      : '小馆进阶已解锁', [40, 288, 640, 56], 26, designOnBackground(), true);
    const {content} = designScroll(panel, 'RecipeList', [40, 360, 640, 734], rows.length * 124);
    rows.forEach((dish, index) => {
      const card = designNode(content, 'Recipe_' + dish.id, [0, index * 124, 640, 110]);
      const key = recipeKey(dish), record = progress.dishes[key];
      designSurface(card, theme.card, undefined, record?.firstPerfect ? '#C09845' : theme.edge);
      this.foodIcon(card, dish.ingredients[0][0], 18, 12, 86);
      const subtitle = dish.practice ? '拆环练习 · 可反复游玩' : record?.firstClear
        ? `${scoreCooking(dish, record.best).stars} 星 · 已出品`
        : this.canCook(dish) ? '可烹饪' : '缺少食材';
      designText(card, dish.name, [124, 9, 420, 46], 32, theme.ink, true, true);
      designText(card, subtitle, [125, 57, 475, 40], 23, theme.muted, false, true);
      designHit(card, () => this.showRecipe(dish));
    });
    designFooter(panel, '返回', close);
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
    const heading = designNode(panel, 'RecipeSummary', [40, 292, 640, 145]);
    designSurface(heading, theme.card, undefined, record?.firstPerfect ? '#C09845' : theme.edge);
    this.foodIcon(heading, dish.ingredients[0][0], 24, 16, 110);
    designText(heading, `难度 ${dish.difficulty}  ·  满分 ${recipeMax(dish)}`, [154, 19, 446, 55], 31, theme.ink, true, true);
    const best = record ? scoreCooking(dish, record.best) : undefined;
    designText(heading, best ? `个人最佳 ${best.score} 分 · ${best.stars} 星` : '暂无出品',
      [154, 76, 446, 47], 24, theme.muted, false, true);

    const {content} = designScroll(panel, 'RecipeIngredients', [40, 456, 640, 488], 116 + dish.ingredients.length * 69);
    let y = 0;
    for (const found of [true, false]) {
      const ingredients = dish.ingredients.filter(([id]) => known.includes(id) === found);
      designText(content, `${found ? '已有食材' : '缺失食材'} · ${ingredients.length} 种`,
        [4, y, 632, 46], 25, designOnBackground(), true, true);
      y += 51;
      for (const [id, count] of ingredients) {
        const row = designNode(content, 'RecipeIngredient_' + id, [0, y, 640, 62]);
        designSurface(row, theme.card, 12, theme.line, false);
        this.foodIcon(row, id, 12, 4, 54);
        designText(row, getIngredient(id).name, [84, 0, 320, 62], 26, theme.ink, true, true);
        designText(row, `${count} 份${found ? '' : '  ›'}`, [432, 0, 180, 62], 25, theme.accent);
        if (!found) designHit(row, () => {
          this.dismissPlayerMenu(PAGE);
          this.showIngredientDetail(id, () => this.showRecipe(dish));
        });
        y += 69;
      }
    }
    this.drawRecipeAction(panel, dish, () => this.showRecipe(dish));
    designFooter(panel, '返回', back);
  }

  private drawRecipeAction(panel: Node, dish: Recipe, refresh: () => void, besideShare = false): void {
    const key = recipeKey(dish), theme = getPageTheme();
    const discovered = this.discovered;
    const box: [number, number, number, number] = [40, 1034, 640, 66];
    if (discovered.length < COOKING_UNLOCK || dish.ingredients.some(([id]) => !discovered.includes(id))) {
      designButton(panel, 'Button_去图鉴', '去图鉴', box, () => {
        this.dismissPlayerMenu(PAGE);
        this.showCollection('ingredients', {back: refresh, backLabel: '返回餐谱详情'});
      });
    } else if (!this.canCook(dish)) {
      designButton(panel, 'Button_进阶未解锁', '两道不同的菜达到 3 星后解锁', box, () => {}, true, true);
    } else if (!dish.practice && cookingCooldown(this.cooking, key)) {
      const label = designText(panel, '', besideShare ? [280, 955, 400, 60] : [40, 955, 640, 60],
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
      designButton(panel, 'Button_开始烹饪', this.cooking.dishes[key] ? '再做一次' : '开始烹饪', box,
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
    if (!this.canCook(dish) || (!dish.practice && cookingCooldown(this.cooking, recipeKey(dish)))) return;
    this.closeCookingModal();
    this.cooling = undefined;
    this.round = new CookingRingRound(dish, this.discovered);
    this.freeUndoUsed = false;
    this.cookingReviveUsed = false;
    this.undo = undefined;
    this.paused = false;
    this.drawCookingRound();
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
    designSurface(clockCard, theme.card, 15, theme.edge, false);
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
        const size = Math.round(ring.radius * (ring.shape === 'oval' ? .94 : 1.12));
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
      const fromReach = rimAt(from, clip.angle), toReach = rimAt(to, clip.angle + 180);
      paintCookingClip(node, span, fromReach, toReach, false, clip.paired);
      const slider = clip.pinned ? designNode(node, 'CookingSlider', [span / 2 - 34, -23, 68, 86]) : undefined;
      if (slider) paintCookingSlider(slider, clip.pinShape);
      return {node, span, slider, from: fromReach, to: toReach, highlighted: false};
    });
    const rail = designNode(field, 'CookingScrollRail', [611, 16, 6, 390]);
    const thumb = designNode(rail, 'CookingScrollThumb', [0, 0, 6, 64]);
    const scrollHit = designNode(body, 'CookingScrollTouch', [658, 128, 48, 410]);
    const pot = designNode(field, 'CookingPot', [172, 420, 280, 84]);
    paintCookingPot(pot);
    const status = designText(body, '', [40, 650, 640, 44], 24, designOnBackground(), true);
    const undoButton = designButton(body, 'Button_烹饪撤回', '撤回', [40, 704, 194, 68],
      () => this.useCookingUndo(), true, true);
    const action = designButton(body, 'Button_烹饪操作', '', [248, 704, 432, 68], () => this.cookingAction());
    const ui: RoundView = {field, viewport, content, rail, thumb, scrollHit, rings, clips, counts: countCards,
      clock, status, action, undoButton, pending: 0, served: [], servedIds: restored.slice(), dropSerial: 0,
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
      place(scrollHit, body, 658, 128, 48, ui.viewHeight);
      designSurface(rail, theme.disabled, 2, '', false);
      place(pot, field, 172, ui.fieldHeight - 87, 280, 84);
      place(status.node, body, 40, height - 114, 640, 41);
      place(undoButton, body, 40, height - 68, 194, 68);
      place(action, body, 248, height - 68, 432, 68);
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
    ui.scrollHit.active = limit > 0;
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
    const canTouch = () => this.round === round && !this.paused && !this.cookingModal
      && !this.ringDrag && !round.ruined && !round.expired;
    ui.scrollHit.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      const id = event.getID();
      if (id !== null && canTouch()) this.ringDrag = {id, scrollY: position(event).y};
    });
    viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      const id = event.getID();
      if (id === null || !canTouch()) return;
      const {x, y} = position(event);
      const pin = round.clips.findIndex((clip, i) => {
        if (!clip.attached || !clip.pinned) return false;
        const node = ui.clips[i].node;
        const dx = x - node.position.x - ui.content.position.x;
        const dy = y - node.position.y - ui.content.position.y;
        const angle = clip.angle * Math.PI / 180;
        return Math.abs(dx * Math.cos(angle) - dy * Math.sin(angle)) <= (clip.pinShape === 'straight' ? 21 : 36)
          && Math.abs(dx * Math.sin(angle) + dy * Math.cos(angle)) <= 44;
      });
      if (pin >= 0) {
        this.ringDrag = {id, pin, x, y};
        ui.focused = undefined;
        ui.notice = '沿绿色管子的直段抽出';
        this.renderCookingRound();
        return;
      }
      let index = -1, closest = Infinity;
      round.rings.forEach((ring, i) => {
        if (!round.present(i)) return;
        const center = ringCenter(i);
        const dx = x - center.x, dy = center.y - y;
        const distance = Math.hypot(dx, dy);
        const reach = cookingRingRim(ring.radius, ring.shape, Math.atan2(dy, dx) - ring.angle * Math.PI / 180);
        if (distance <= reach + 16 && distance < closest) {
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
        this.ringDrag = {id, index, angle, checkpoint: {state: round.snapshot(), scroll: ui.scroll,
          served: ui.servedIds.slice()}, clips: round.clips.filter(clip => clip.attached).length};
        if (round.clips.some(clip => clip.attached && clip.paired && (clip.holder === index || clip.owner === index))) {
          ui.notice = '紫色双扣需要两端缺口同时对准';
        }
      }
      this.renderCookingRound();
    });
    const gestureMove = (event: EventTouch) => {
      const drag = this.ringDrag;
      if (!drag || this.round !== round || this.paused || round.expired || event.getID() !== drag.id) return;
      const {x, y} = position(event);
      if ('scrollY' in drag) {
        this.scrollCooking(ui, round, ui.scroll + y - drag.scrollY);
        drag.scrollY = y;
        return;
      }
      if ('pin' in drag) {
        const clip = round.clips[drag.pin], angle = clip.angle * Math.PI / 180;
        const travel = (x - drag.x) * Math.sin(angle) + (y - drag.y) * Math.cos(angle);
        const slider = ui.clips[drag.pin].slider;
        if (Math.abs(travel) < PULL_PIN_DISTANCE[clip.pinShape]) {
          slider?.setPosition(0, travel, 0);
          return;
        }
        const state = round.snapshot();
        if (round.pullPin(drag.pin)) {
          this.undo = {state, scroll: ui.scroll, served: ui.servedIds.slice()};
          ui.notice = '管子已抽出，可以转环解扣';
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
      if (drop || round.clips.filter(clip => clip.attached).length < drag.clips) this.undo = drag.checkpoint;
      if (drop) {
        this.dropCookingFood(ui, round, drop.ring, drop.food);
        this.playEffect('match', .58);
        ui.notice = `${getIngredient(drop.food.id).name} 下锅`;
      }
      const bonus = Math.round(round.timeLeft - before);
      if (bonus) ui.notice = drop ? `${ui.notice} · +${bonus} 秒` : `解环成功 · +${bonus} 秒`;
      if (!round.present(drag.index)) ui.focused = undefined;
      if (round.ruined) this.ringDrag = undefined;
      this.renderCookingRound();
    };
    const release = (event: EventTouch) => {
      if (event.getID() !== this.ringDrag?.id) return;
      this.resetCookingDrag();
      this.renderCookingRound();
    };
    for (const node of [viewport, ui.scrollHit]) {
      node.on(Node.EventType.TOUCH_MOVE, gestureMove);
      node.on(Node.EventType.TOUCH_END, release);
      node.on(Node.EventType.TOUCH_CANCEL, release);
    }
  }

  private resetCookingDrag(): void {
    const drag = this.ringDrag;
    if (drag && 'pin' in drag) this.roundView?.clips[drag.pin]?.slider?.setPosition(0, 0, 0);
    this.ringDrag = undefined;
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
      const from = rimAt(round.rings[clip.holder], clip.angle), to = rimAt(round.rings[clip.owner], clip.angle + 180);
      if (view.highlighted !== highlighted || view.from !== from || view.to !== to) {
        paintCookingClip(view.node, view.span, from, to, highlighted, clip.paired);
        view.highlighted = highlighted;
        view.from = from;
        view.to = to;
      }
    });
    round.batch.forEach(([id, target], i) => {
      const count = round.portions[id] ?? 0;
      this.setCookingText(ui.counts[i], `${count}/${target}${count === target ? ' ✓' : ''}`);
    });
    this.renderCookingClock(round, ui);
    const status = round.expired ? '烹饪时间用完' : this.paused ? '已暂停'
      : ui.notice ?? (round.batchReady && !ui.pending ? '本批食材已齐' : '任意转环，解扣后对准金扣下料');
    this.setCookingText(ui.status, status);
    const caption = this.paused ? '继续烹饪' : round.lastBatch ? '出锅' : '下一批';
    this.setCookingButton(ui.action, caption, round.ruined || round.expired || (!this.paused && (ui.pending > 0
      || (round.lastBatch ? !round.hasFood : !round.batchReady && !round.finished))));
    this.setCookingButton(ui.undoButton, this.freeUndoUsed ? '已撤回' : '撤回',
      this.freeUndoUsed || !this.undo || !!this.ringDrag || this.paused || round.expired || !!ui.pending, true);
    if (round.expired && !ui.pending) this.showCookingTimeout(round);
    else if (round.ruined && !ui.pending) this.showCookingFailure(round);
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

  private useCookingUndo(): void {
    if (this.freeUndoUsed || !this.restoreCookingUndo()) return;
    this.freeUndoUsed = true;
    this.renderCookingRound();
  }

  private restoreCookingUndo(): boolean {
    const round = this.round, undo = this.undo;
    if (!round || !undo || !round.restore(undo.state)) return false;
    this.closeCookingModal();
    this.undo = undefined;
    this.paused = false;
    this.drawCookingRound(undo.scroll, undo.served);
    return true;
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
    designText(card, '烹饪时间用完', [24, 34, 564, 62], 37, theme.ink, true);
    const minutes = COOKING_TIME_SECONDS / 60;
    const detail = designText(card, `看完视频恢复 ${minutes} 分钟，接着解这锅。`, [28, 104, 556, 72], 26, theme.ink);
    const caption = `看视频续时 ${minutes} 分钟`;
    const button = designButton(card, 'Button_烹饪视频续时', caption, [34, 186, 544, 66], () => {
      void this.resumeCookingTimer(round, overlay, detail, button, caption);
    });
    this.drawCookingStopOptions(card, round, true);
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
    if (result === 'completed' && round.resumeAfterVideo()) {
      this.closeCookingModal();
      this.paused = false;
      if (this.roundView) {
        this.roundView.notice = '时间已恢复，继续解环';
        this.renderCookingRound();
      }
      return;
    }
    this.setCookingButton(button, caption, false);
    detail.string = result === 'cancelled' ? '视频未看完，可以再试或重开。' : '视频暂不可用，可以重开或返回餐谱。';
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
    const free = !!this.undo && !this.freeUndoUsed;
    const video = !!this.undo && !free && !this.cookingReviveUsed;
    const detail = designText(card, free || video ? '撤回刚才那次转动，就能继续做。'
      : '这锅食材已经超量，可以重新开始。', [28, 104, 556, 72], 26, theme.ink);
    if (free) {
      designButton(card, 'Button_免费撤回', '撤回刚才这一步', [34, 186, 544, 66], () => this.useCookingUndo());
    } else if (video) {
      const play = designButton(card, 'Button_视频撤回', '看视频撤回这一步', [34, 186, 544, 66],
        () => { void this.reviveCooking(round, overlay, detail, play); });
    }
    this.drawCookingStopOptions(card, round, free || video);
  }

  private drawCookingStopOptions(card: Node, round: CookingRingRound, secondary: boolean): void {
    designButton(card, 'Button_重开本锅', '重开本锅', [34, 270, 544, 59], () => {
      if (!this.adPanel) this.beginCooking(round.dish);
    }, secondary);
    designButton(card, 'Button_补救返回餐谱', '返回餐谱', [34, 344, 544, 53], () => {
      if (this.adPanel) return;
      this.dismissPlayerMenu(PAGE);
      this.showRecipeBook();
    }, true);
  }

  private async reviveCooking(round: CookingRingRound, overlay: Node, detail: Label, button: Node): Promise<void> {
    if (this.adPanel || this.cookingReviveUsed || !this.undo || !round.ruined) return;
    const player = this.playerService?.playerId, undo = this.undo;
    this.adPanel = overlay;
    this.setCookingButton(button, '正在打开视频…', true);
    const result = await this.rewardedVideo.show();
    if (this.adPanel === overlay) this.adPanel = undefined;
    if (this.round !== round || this.cookingModal !== overlay || this.undo !== undo
      || this.playerService?.playerId !== player) return;
    if (result === 'completed' && this.restoreCookingUndo()) {
      this.cookingReviveUsed = true;
      return;
    }
    this.setCookingButton(button, '看视频撤回这一步', false);
    detail.string = result === 'cancelled' ? '视频未看完，可以再试或重开。' : '视频暂不可用，可以重开本锅。';
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
    if (!round || !this.roundView) return;
    if (this.paused) {
      this.paused = false;
      this.renderCookingRound();
      return;
    }
    if (this.roundView.pending || round.ruined || round.expired || this.cookingModal) return;
    if (!round.lastBatch) {
      if (round.nextBatch()) {
        this.undo = undefined;
        this.drawCookingRound();
      }
    } else if (round.hasFood) {
      this.finishCooking(round);
    }
  }

  private pauseCooking(): void {
    if (!this.round) return;
    this.paused = true;
    this.resetCookingDrag();
    if (this.roundView) {
      this.roundView.focused = undefined;
      this.renderCookingRound();
    }
  }

  private finishCooking(round: CookingRingRound): void {
    if (!round.dish.practice) {
      const progress = this.cooking, source = this.getCookingSource();
      const next = settleCooking(progress, round.dish, round.portions, source,
        (progress.sources[source]?.sequence ?? 0) + 1, Date.now());
      if (!this.playerService?.setCooking(next)) {
        this.paused = true;
        this.renderCookingRound();
        this.showToast('出品未能保存，请重试', '#A24A3C');
        return;
      }
    }
    this.round = undefined;
    this.roundView = undefined;
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
    const panel = this.page('出品结算', back);
    if (!panel) return;
    const result = scoreCooking(dish, round.portions);
    const summary = designNode(panel, 'CookingResultSummary', [40, 290, 640, 176]);
    designSurface(summary, theme.card, undefined, result.stars === 5 ? '#C09845' : theme.edge);
    designText(summary, dish.name, [20, 12, 600, 48], 36, theme.ink, true);
    designText(summary, `${'★'.repeat(result.stars)}${'☆'.repeat(5 - result.stars)}`, [20, 64, 600, 54], 46, theme.accent, true);
    designText(summary, `${result.score} / ${recipeMax(dish)} 出品分`, [20, 125, 600, 38], 28, theme.muted, true);
    drawCookingBreakdown(panel, round.batches, result, this.foodIcon.bind(this));
    if (!dish.practice) {
      designButton(panel, 'Button_好友点单', '请好友也做一盘', [40, 956, 234, 58],
        () => this.shareGame(`锅里捞啥｜我做了${result.stars}星${dish.name}，你也来试一盘！`, recipeKey(dish)), true);
    }
    this.drawRecipeAction(panel, dish, () => this.showCookingResult(round), !dish.practice);
    designFooter(panel, '返回餐谱', back);
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
