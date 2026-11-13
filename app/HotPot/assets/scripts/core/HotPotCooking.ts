import {EventTouch, game, Game, Label, Mask, Node, sys, UITransform, Vec3} from 'cc';
import {
  COOKING_UNLOCK, CookingRound, cookingDrops, cookingFallTime, findRecipe,
  practiceRecipe, Recipe, recipeBatches, recipeKey, recipeMax, RECIPES, scoreCooking,
} from '../data/CookingData';
import {
  cookingCooldown, cookingPerfectCount, distinctCookingClears, emptyCooking,
  settleCooking, skipCookingCooldown,
} from '../data/CookingProgress';
import {getIngredient, IngredientType} from '../data/GameData';
import {getPageTheme} from '../data/PageTheme';
import {GameSave, regionPath} from '../data/PlayerData';
import {drawCookingBreakdown} from './CookingResultView';
import {
  designButton, designFooter, designHit, designNode, designOnBackground,
  designOverlay, designScroll, designSurface, designText, paintCookingPlate,
} from './HotPotDesignUi';
import {HotPotNativeAds} from './HotPotNativeAds';

const PAGE = 'CookingOverlay';
const UNLOCK = 'CookingUnlockOverlay';
const LANE_WIDTH = 148;
const LANES = 4;
const LANE_LEFT = 12;
const DROP_TOP = 32;
const CATCH_Y = 435;
const DROP_SIZE = 70;
const PLATE_FOOD_SIZE = 38;
const PLATE_FOOD_OFFSETS = [-24, 24, 0];
const SOURCE_KEY = 'hotpot.cooking.device.v1';

interface RoundView {
  field: Node;
  falling: Node;
  plate: Node;
  plateContents: Node;
  renderedCatches: number;
  counts: Label[];
  status: Label;
  action: Node;
  drops: Map<number, Node>;
}

export abstract class HotPotCooking extends HotPotNativeAds {
  private round?: CookingRound;
  private roundView?: RoundView;
  private cooling?: () => void;
  private adPanel?: Node;
  private unlockPending = false;
  private sharedRecipe?: Recipe;
  private paused = false;
  private plateTouch?: number;
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
      this.round = undefined;
      this.roundView = undefined;
      this.plateTouch = undefined;
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
    const round = this.round;
    if (!round || this.paused || !this.roundView) return;
    if (round.finished && !this.roundView.drops.size && round.plateLane === round.lane) return;
    round.advance(Math.min(delta, 0.1));
    this.renderCookingRound();
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
      const subtitle = dish.practice ? '接料练习 · 可反复游玩' : record?.firstClear
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
      designButton(panel, 'Button_广告重做', '看广告立即重做', box, () => { void this.skipCooldown(panel, dish); });
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
    if (result === 'completed') {
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
    const discovered = this.discovered, batches = recipeBatches(dish);
    const duration = dish.practice ? 17 : 25 / batches.length;
    this.cooling = undefined;
    this.round = new CookingRound(dish, batches.map(batch => cookingDrops(dish, batch, discovered, duration)));
    this.paused = false;
    this.drawCookingRound();
  }

  private drawCookingRound(): void {
    const round = this.round;
    if (!round) return;
    const theme = getPageTheme();
    const back = () => { this.dismissPlayerMenu(PAGE); this.showRecipe(round.dish); };
    const panel = this.page(round.dish.name, back);
    if (!panel) return;
    this.plateTouch = undefined;
    const w = Math.floor(640 / round.batch.length);
    const counts = round.batch.map(([id], i) => {
      const card = designNode(panel, 'Portion_' + id, [40 + i * w, 334, w - 8, 78]);
      designSurface(card);
      this.foodIcon(card, id, 12, 10, 58);
      return designText(card, '', [73, 0, w - 85, 78], 28, theme.ink, true);
    });
    designText(panel, `第 ${round.batchIndex + 1}/${round.batches.length} 批`,
      [40, 284, 215, 46], 25, designOnBackground(), true, true);
    designText(panel, '点一列或左右滑动移盘', [266, 284, 414, 46], 25, designOnBackground());

    const field = designNode(panel, 'CookingField', [48, 420, 624, 484]);
    designSurface(field, theme.panel);
    this.bindPlateTouch(field, round);
    for (let lane = 0; lane < LANES; lane++) {
      const track = designNode(field, 'CookingLane_' + lane, [LANE_LEFT + 4 + lane * LANE_WIDTH, 12, LANE_WIDTH - 8, 450]);
      designSurface(track, theme.card, 16, theme.line, false);
    }
    const falling = designNode(field, 'CookingFallingFood', [0, 0, 624, 484]);
    falling.addComponent(Mask);
    const plateWidth = LANE_WIDTH * .75;
    const plate = designNode(field, 'CookingPlate', [0, 0, plateWidth, 48]);
    paintCookingPlate(plate);
    const plateContents = designNode(plate, 'CookingPlateContents', [0, 0, plateWidth, 48]);
    const status = designText(panel, '', [40, 904, 640, 48], 25, designOnBackground(), true);
    designButton(panel, 'Button_左移', '← 左移', [40, 958, 304, 63], () => this.movePlate(-1), true);
    designButton(panel, 'Button_右移', '右移 →', [376, 958, 304, 63], () => this.movePlate(1), true);
    const action = designButton(panel, 'Button_烹饪操作', '', [40, 1034, 640, 66], () => this.cookingAction());
    designFooter(panel, '退出烹饪', back, 'Button_退出烹饪', false);
    this.roundView = {field, falling, plate, plateContents, renderedCatches: 0,
      counts, status, action, drops: new Map()};
    this.renderCookingRound();
  }

  private movePlate(direction: -1 | 1): void {
    if (!this.paused && this.plateTouch === undefined && !this.round?.finished) this.round?.move(direction);
  }

  private bindPlateTouch(field: Node, round: CookingRound): void {
    const transform = field.getComponent(UITransform)!;
    const point = new Vec3();
    const move = (event: EventTouch) => {
      if (this.round !== round || this.paused || round.finished || event.getID() !== this.plateTouch) return;
      const {x, y} = event.getUILocation();
      const local = transform.convertToNodeSpaceAR(point.set(x, y, 0));
      const lane = Math.floor((local.x + transform.width / 2 - LANE_LEFT) / LANE_WIDTH);
      round.moveTo(Math.max(0, Math.min(LANES - 1, lane)));
    };
    const release = (event: EventTouch) => {
      if (event.getID() === this.plateTouch) this.plateTouch = undefined;
    };
    field.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      const id = event.getID();
      if (id === null || this.round !== round || this.paused || round.finished || this.plateTouch !== undefined) return;
      this.plateTouch = id;
      move(event);
    });
    field.on(Node.EventType.TOUCH_MOVE, move);
    field.on(Node.EventType.TOUCH_END, release);
    field.on(Node.EventType.TOUCH_CANCEL, release);
  }

  private renderCookingRound(): void {
    const round = this.round!, ui = this.roundView!, theme = getPageTheme();
    const {height, width} = ui.field.getComponent(UITransform)!;
    const laneX = (lane: number) => LANE_LEFT + (lane + .5) * LANE_WIDTH - width / 2;
    ui.plate.setPosition(laneX(round.plateLane), height / 2 - CATCH_Y, 0);
    const time = cookingFallTime(round.dish);
    const dropY = (arrival: number) => DROP_TOP + (CATCH_Y - DROP_TOP)
      * (1 - (arrival - round.elapsed) / time);
    for (const [index, node] of ui.drops) {
      if (index >= round.arrived) continue;
      const drop = round.drops[index];
      const y = dropY(drop.arrival);
      if (round.caught.has(drop) || y >= height + DROP_SIZE / 2) {
        node.removeFromParent();
        node.destroy();
        ui.drops.delete(index);
      } else {
        node.setPosition(laneX(drop.lane), height / 2 - y, 0);
      }
    }
    for (let i = round.arrived; i < round.drops.length; i++) {
      const drop = round.drops[i], remaining = drop.arrival - round.elapsed;
      if (remaining > time) break;
      let node = ui.drops.get(i);
      if (!node) {
        node = this.foodIcon(ui.falling, drop.id, 0, 0, DROP_SIZE);
        ui.drops.set(i, node);
      }
      const y = Math.min(CATCH_Y, dropY(drop.arrival));
      node.setPosition(laneX(drop.lane), height / 2 - y, 0);
    }
    this.renderPlateContents(round, ui);
    round.batch.forEach(([id, target], i) => {
      const count = round.portions[id] ?? 0;
      this.setCookingText(ui.counts[i], `${count}/${target}${count === target ? ' ✓' : ''}`);
    });
    const excess = Object.entries(round.portions).reduce((sum, [id, count]) => {
      const target = round.dish.ingredients.find(([food]) => food === id)?.[1] ?? 0;
      return sum + Math.max(0, count - target);
    }, 0);
    const status = this.paused ? '已暂停'
      : round.finished ? '本批出料结束' : excess ? `本盘多出 ${excess} 份` : '按配方接料，已够量可让食材落空';
    this.setCookingText(ui.status, status);
    const next = !round.lastBatch;
    const caption = this.paused ? '继续接料' : next ? '下一批'
      : round.finished && !round.hasFood ? '再试一次' : '出锅';
    const disabled = !this.paused && (next
      ? !(round.exact || round.finished) : !round.hasFood && !round.finished);
    const actionLabel = ui.action.getChildByName('Label')!.getComponent(Label)!;
    this.setCookingText(actionLabel, caption);
    const action = ui.action as Node & {referenceDisabled?: boolean};
    if (action.referenceDisabled !== disabled) {
      action.referenceDisabled = disabled;
      designSurface(action, disabled ? theme.disabled : theme.accent);
    }
  }

  private renderPlateContents(round: CookingRound, ui: RoundView): void {
    if (ui.renderedCatches === round.caught.size) return;
    ui.renderedCatches = round.caught.size;
    for (const node of ui.plateContents.children.slice()) {
      node.removeFromParent();
      node.destroy();
    }
    const drops = Array.from(round.caught).slice(-PLATE_FOOD_OFFSETS.length);
    drops.forEach((drop, index) => {
      const item = this.foodIcon(ui.plateContents, drop.id, 0, 0, PLATE_FOOD_SIZE);
      const offset = drops.length === 1 ? 0 : PLATE_FOOD_OFFSETS[index];
      item.setPosition(offset, offset === 0 ? 9 : 5, 0);
    });
  }

  private setCookingText(label: Label, value: string): void {
    if (label.string !== value) label.string = value;
  }

  private cookingAction(): void {
    const round = this.round;
    if (!round) return;
    if (this.paused) {
      this.paused = false;
      this.renderCookingRound();
    } else if (!round.lastBatch) {
      if (round.nextBatch()) {
        this.drawCookingRound();
      }
    } else if (round.hasFood) {
      this.finishCooking(round);
    } else if (round.finished) {
      this.beginCooking(round.dish);
    }
  }

  private pauseCooking(): void {
    if (!this.round) return;
    this.paused = true;
    this.plateTouch = undefined;
    if (this.roundView) this.renderCookingRound();
  }

  private finishCooking(round: CookingRound): void {
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

  private showCookingResult(round: CookingRound): void {
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
    drawCookingBreakdown(panel, round, result, this.foodIcon.bind(this));
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
