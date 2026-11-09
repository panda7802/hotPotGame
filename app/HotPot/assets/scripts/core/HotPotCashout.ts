import {Label, Node, Vec3} from 'cc';
import {
  CASHOUT_TOOLS, CASHOUT_TOOL_NAMES,
  CashoutRun, CashoutSave, CashoutStock, CashoutTool,
  cashoutActive, cashoutStages, cashoutTiles, cashoutTrayInsertion, cashoutWait, createCashoutRun,
  emptyCashoutStock, settleCashout, startCashout, takeCashoutTile,
} from '../data/CashoutData';
import {INGREDIENTS, selectBombTargets} from '../data/GameData';
import type {LevelData} from '../data/GameData';
import {GameSave, regionPath, validateGameSave} from '../data/PlayerData';
import {achievementEntries} from '../data/CollectionData';
import {getPageTheme} from '../data/PageTheme';
import {HotPotDesignResults} from './HotPotDesignResults';
import {
  DesignRect, designButton, designFooter, designHeader, designHit, designIcon,
  designNode, designOnBackground, designOverlay, designSurface, designText, fitDesignPage, paintBackpackIcon,
  designPersonalSurface, paintToolIcon, TOOL_ICON_SIZE,
} from './HotPotDesignUi';
import {GameArtRole, paintCollectionArt, paintGameArt} from './HotPotGameArt';
import {TRAY_SPACING} from './HotPotUi';

const MODE_OVERLAY = 'CashoutOverlay';
const DIALOG_OVERLAY = 'CashoutDialogOverlay';
const BAG_LIMIT = 2;
const INVENTORY_TOOL_HINTS: Record<CashoutTool, string> = {
  undo: '撤回上一步',
  shuffle: '重排剩余食材',
  bomb: '炸掉同类食材',
};

type SettingsEntry = {
  name: string;
  icon: string;
  detail: string;
  action: () => void;
};

const MENU_APPEARANCE = {
  1: {
    ingredients: ['mushroom', 'beef'] as const,
    features: [
      {fill: '#782A22', trim: '#C79A50', badge: '#5A231A', ink: '#FFF0BC'},
      {fill: '#225447', trim: '#C79A50', badge: '#163D34', ink: '#FFF0BC'},
    ],
    radius: 18, highlight: '#E9C986',
    row: {fill: '#214C3E', edge: '#BC955B', badge: '#D8AB60', ink: '#FFF2D0', muted: '#E7CE9B'},
    footer: {fill: '#9A3024', base: '#57291D', edge: '#E3B86F', ink: '#FFF3CF'},
  },
  4: {
    ingredients: ['corn', 'toufu'] as const,
    features: [
      {fill: '#F3F7DF', trim: '#ACC080', badge: '#E3EDBD', ink: '#41653B'},
      {fill: '#FFF0D3', trim: '#E9AE6C', badge: '#FFDBA4', ink: '#8C4E25'},
    ],
    radius: 31, highlight: '#FFFFFFC8',
    row: {fill: '#FFF9EB', edge: '#E6C38C', badge: '#E8EFCF', ink: '#653C22', muted: '#826445'},
    footer: {fill: '#48733C', base: '#304F2B', edge: '#B8CB81', ink: '#FFF8E7'},
  },
  8: {
    ingredients: ['ou', 'vegetable'] as const,
    features: [
      {fill: '#DDE9D9', trim: '#93AF9E', badge: '#C6DCC9', ink: '#285344'},
      {fill: '#FBF5DD', trim: '#C6B580', badge: '#EBDEB0', ink: '#66522D'},
    ],
    radius: 32, highlight: '#FFFCED',
    row: {fill: '#FBFAEC', edge: '#BAC9AC', badge: '#DCE9D8', ink: '#264E40', muted: '#58725E'},
    footer: {fill: '#396553', base: '#224638', edge: '#D5C08A', ink: '#FFFBE8'},
  },
  9: {
    ingredients: ['bambooshoot', 'mushroom'] as const,
    features: [
      {fill: '#F8EBD0', trim: '#BD925B', badge: '#EBD9AF', ink: '#522E24'},
      {fill: '#F7E1CC', trim: '#BD925B', badge: '#EDD0B2', ink: '#942F26'},
    ],
    radius: 8, highlight: '#FFFAE8',
    row: {fill: '#FFF6E3', edge: '#C6A879', badge: '#F0D8BD', ink: '#362A21', muted: '#7D6550'},
    footer: {fill: '#98352A', base: '#672B22', edge: '#D8AA77', ink: '#FFF3D8'},
  },
};

export abstract class HotPotCashout extends HotPotDesignResults {
  private assistedRun: {key: string; used: number; runId: string} | null = null;

  private cashoutKey(): string {
    return 'hotpot.cashout.v1:' + (this.playerService?.playerId || 'guest');
  }

  private readCashout(): CashoutSave {
    return this.playerService?.cashout || {version: 1, stock: emptyCashoutStock(), run: null};
  }

  private writeCashout(key: string, save: CashoutSave): boolean {
    if (key !== this.cashoutKey()) {
      this.closeCashout();
      this.showToast('玩家已切换，请重新打开背包', '#A24A3C');
      return false;
    }
    try {
      if (this.playerService?.setCashout(save)) return true;
    } catch {
      // Keep the current challenge when its checkpoint is rejected.
    }
    this.showToast('进度保存失败，请重试', '#A24A3C');
    return false;
  }

  private closeCashout(): void {
    this.dismissPlayerMenu(DIALOG_OVERLAY);
    this.dismissPlayerMenu(MODE_OVERLAY);
  }

  protected hasPlayerMenu(): boolean {
    return !!this.node.getChildByName(MODE_OVERLAY)
      || !!this.node.getChildByName(DIALOG_OVERLAY) || super.hasPlayerMenu();
  }

  protected showPlayerProfile(): void {
    const style = getPageTheme().id;
    const close = () => this.dismissPlayerMenu('PlayerOverlay');
    const panel = this.designPage('PlayerOverlay', '系统设置', close, 'game-ui/bg-0' + style);
    if (!panel) return;
    const open = (action: () => void) => () => { close(); action(); };
    const entries: SettingsEntry[] = [
      {name: '地域榜单', icon: 'rank', detail: '查看家乡排名', action: open(() => this.showRegionPicker([], true))},
      {name: '页面换肤', icon: 'palette', detail: '挑选小馆风格', action: open(() => this.showPageStyles())},
      {name: '分享', icon: 'share', detail: '邀请好友来捞锅', action: () => this.shareGame()},
      {name: '游戏圈', icon: 'community', detail: '去圈里逛逛', action: () => { void this.openGameClub(); }},
    ];
    this.drawSettingsMenu(panel, entries, close);
  }

  private drawSettingsMenu(
    panel: Node, entries: SettingsEntry[], close: () => void,
  ): void {
    const t = getPageTheme();
    const {radius, row: rowColors, footer} = MENU_APPEARANCE[t.id];
    const paper = t.id === 9;
    const cream = t.id === 4;
    const menu = this.cashoutArt(panel, 'panel', [30, 445, 660, 476], true);
    entries.forEach(({name, icon, detail, action}, i) => {
      const row = designHit(designNode(menu, 'Button_' + name, [40, 46 + i * 100, 580, 84]), action);
      designSurface(row, rowColors.fill, radius - 3, rowColors.edge, !paper);
      const badge = designNode(row, 'IconBadge', [14, 16, 52, 52]);
      const warmClay = cream && i % 2 === 1;
      const ink = warmClay ? '#99532B' : t.dark;
      designSurface(badge, warmClay ? '#FFE5BF' : rowColors.badge, paper ? 6 : 24, '', false);
      designIcon(badge, icon, [9, 9, 33, 33], ink);
      designText(row, name, [81, 8, 240, 68], 31, rowColors.ink, true, true);
      designText(row, detail, [313, 8, 199, 68], 22, rowColors.muted);
      designIcon(row, 'arrow', [535, 29, 27, 27], rowColors.muted);
    });

    const sync = designHit(designNode(panel, 'Button_同步', [52, 1124, 218, 80]),
      () => { void this.retryPlayerCloud(); });
    designSurface(sync, rowColors.fill, radius + 4, rowColors.edge, !paper);
    designIcon(sync, 'refresh', [44, 22, 36, 36], rowColors.ink);
    designText(sync, '同步', [82, 4, 100, 72], 32, rowColors.ink, true);
    const back = designHit(designNode(panel, 'Button_返回', [286, 1124, 382, 80]), close);
    designSurface(back, footer.base, radius + 4, footer.edge, !paper);
    const face = designNode(back, 'ButtonFace', [2, cream ? 0 : 2, 378, 72]);
    designSurface(face, footer.fill, radius + 2, footer.edge, false);
    designIcon(face, 'back', [96, 19, 34, 34], footer.ink);
    designText(face, '返回游戏', [136, 5, 146, 62], 32, footer.ink, true);
  }

  protected showMyMenu(): void {
    const close = () => this.dismissPlayerMenu('MyOverlay');
    const t = getPageTheme();
    const panel = this.designPage('MyOverlay', '我的', close, 'game-ui/bg-0' + t.id);
    if (!panel) return;
    const service = this.playerService!, state = service.state;
    void service.refreshRuntimeConfig();
    const {ingredients, features, row, radius, highlight, footer} = MENU_APPEARANCE[t.id];
    const menu = this.cashoutArt(panel, 'panel', [30, 302, 660, 772], true);
    const profile = designNode(menu, 'MyProfile', [36, 36, 588, 170]);
    designPersonalSurface(profile, row.fill, radius, row.edge);
    const avatar = designNode(profile, 'MyAvatar', [23, 25, 124, 124]);
    designPersonalSurface(avatar, row.badge, t.id === 9 ? 14 : 62, highlight, false);
    this.addIngredientImage(designNode(avatar, 'RearIngredient', [11, 17, 68, 68]),
      ingredients[0], false, 68, 68);
    this.addIngredientImage(designNode(avatar, 'FrontIngredient', [41, 40, 76, 76]),
      ingredients[1], false, 76, 76);
    designText(profile, service.playerId ? '玩家 ' + service.playerId.slice(0, 8) : '本机玩家',
      [170, 33, 383, 57], 39, row.ink, true, true);
    designText(profile, '累计通关 ' + this.designStats().total + ' 次',
      [171, 98, 370, 41], 26, row.muted, false, true);

    const open = (action: () => void) => () => { close(); action(); };
    const achievements = achievementEntries(state);
    const unlocked = achievements.filter(entry => entry.unlocked).length;
    const stock = Object.values(this.readCashout().stock).reduce((sum, count) => sum + count, 0);
    const cards = [
      {name: '图鉴', detail: '已收录 ' + state.progress.discovered.length + ' / ' + INGREDIENTS.length,
        action: () => this.showCollection()},
      {name: '成就', detail: '已达成 ' + unlocked + ' / ' + achievements.length,
        action: () => this.showCollection('achievements')},
    ];
    cards.forEach(({name, detail, action}, i) => {
      const color = features[i];
      const card = designHit(designNode(menu, 'Button_' + name, [36 + i * 304, 230, 284, 217]), open(action));
      designSurface(card, color.trim, radius, color.trim);
      const face = designNode(card, 'CardFace', [2, 0, 280, 211]);
      designPersonalSurface(face, color.fill, radius - 1, highlight, false);
      const art = designNode(face, 'EntryIllustration', [160, 15, 103, 103]);
      designPersonalSurface(art, color.badge, t.id === 9 ? 12 : 51, '', false);
      if (i === 0) {
        const fallback = designIcon(art, 'book', [22, 22, 59, 59], color.ink);
        paintCollectionArt(designNode(art, 'CollectionBook', [0, 0, 103, 103]), t.id, fallback);
      } else {
        designIcon(art, 'trophy', [16, 16, 71, 71], color.ink);
      }
      designText(face, name, [20, 110, 160, 49], 40, color.ink, true, true);
      designText(face, detail, [21, 162, 188, 33], 24, color.ink, false, true);
      designIcon(face, 'arrow', [227, 166, 27, 27], color.ink);
    });

    const next = achievements.find(item => !item.unlocked && item.category === 'cashout')
      ?? achievements.find(item => !item.unlocked);
    const nextCard = designHit(designNode(menu, 'Button_下一枚成就', [36, 466, 588, 65]),
      open(() => this.showCollection('achievements', {achievementId: next?.id})));
    const warm = features[1];
    designPersonalSurface(nextCard, warm.fill, radius, warm.trim, false);
    designIcon(nextCard, 'trophy', [22, 15, 35, 35], warm.ink);
    designText(nextCard, next ? '下一枚 · ' + next.title : '全部成就已达成',
      [74, 4, 442, 57], 27, warm.ink, true, true);
    designIcon(nextCard, 'arrow', [539, 19, 27, 27], warm.ink);

    const inventory = designHit(designNode(menu, 'Button_背包', [36, 550, 588, 101]),
      open(() => this.showCashoutHome()));
    designPersonalSurface(inventory, row.fill, radius, row.edge);
    const bagBadge = designNode(inventory, 'EntryIllustration', [14, 10, 80, 80]);
    designSurface(bagBadge, row.badge, t.id === 9 ? 10 : 40, '', false);
    const bag = designNode(bagBadge, 'BackpackIllustration', [16, 16, 48, 48]);
    bag.setScale(1.35, 1.35, 1);
    paintBackpackIcon(bag, t.id);
    designText(inventory, '背包', [111, 8, 165, 45], 35, row.ink, true, true);
    designText(inventory, '库存道具 · 捞到就收', [112, 55, 253, 36], 23, row.muted, false, true);
    const countTag = designNode(inventory, 'EntryCount', [410, 28, 114, 46]);
    designSurface(countTag, row.badge, radius, '', false);
    designText(countTag, stock + ' 件', [4, 0, 106, 46], 26, t.dark, true);
    designIcon(inventory, 'arrow', [540, 37, 27, 27], row.ink);

    const address = regionPath(service.regions, state.profile.regionCodes).map(region => region.name).join(' · ');
    const place = designHit(designNode(menu, 'Button_我的位置', [36, 670, 588, 65]),
      open(() => this.showRegionPicker([])));
    designPersonalSurface(place, row.fill, radius, row.edge, false);
    designIcon(place, 'pin', [21, 13, 40, 40], row.ink);
    designText(place, '我的位置', [73, 5, 162, 55], 28, row.ink, true, true);
    designText(place, address || '尚未选择地区', [244, 5, 280, 55], 24, row.muted);
    designIcon(place, 'arrow', [539, 19, 28, 28], row.muted);
    designPersonalSurface(designFooter(panel, '返回游戏', close), footer.fill, radius + 4, footer.edge);
  }

  private cashoutPage(title: string, back?: () => void): {overlay: Node; panel: Node} {
    this.closeCashout();
    const page = designOverlay(this.node, MODE_OVERLAY, this.viewportHeight, false, 'game-ui/bg-0' + getPageTheme().id);
    designHeader(page.panel, title);
    if (back) designHit(designNode(page.panel, 'HeaderBack', [22, 204, 132, 88]), back);
    fitDesignPage(page.panel);
    return page;
  }

  private cashoutArt(parent: Node, role: GameArtRole, box: DesignRect, sliced = false): Node {
    const node = designNode(parent, 'CashoutArt_' + role, box);
    // A sliced frame creates a renderer asynchronously. Keep it on a separate
    // child behind the tiles or tray slots even when the sprite loads later.
    const artwork = sliced ? designNode(node, 'FrameArtwork', [0, 0, box[2], box[3]]) : node;
    paintGameArt(artwork, role, getPageTheme().id, sliced);
    return node;
  }

  private showStock(parent: Node, stock: CashoutStock, y: number, reward = false): void {
    const tools = CASHOUT_TOOLS.filter(tool => !reward || stock[tool] > 0);
    tools.forEach((tool, i) => {
      const card = designNode(parent, 'CashoutStock_' + tool, [360 - tools.length * 102 + i * 204, y, 188, 169]);
      designSurface(card);
      const icon = designNode(card, 'ToolIcon', [66, 14, TOOL_ICON_SIZE, TOOL_ICON_SIZE]);
      paintToolIcon(icon, tool, getPageTheme().id);
      designText(card, CASHOUT_TOOL_NAMES[tool], [4, 74, 180, 41], 26, undefined, true);
      designText(card, '×' + stock[tool], [4, 115, 180, 43], 32, getPageTheme().accent, true);
    });
  }

  private showCashoutHome(): void {
    const key = this.cashoutKey(), save = this.readCashout(), run = save.run;
    const back = () => { this.closeCashout(); this.showMyMenu(); };
    const {overlay, panel} = this.cashoutPage('背包', back);
    const ongoing = cashoutActive(run);
    const wait = cashoutWait(save, Date.now());
    designText(panel, '道具库存', [42, 307, 636, 58], 35, designOnBackground(), true);
    this.showStock(panel, save.stock, 376);
    designText(panel, '赚到的道具可在主线第三关使用', [45, 561, 630, 46], 25, designOnBackground());
    const card = designNode(panel, 'CashoutEntry', [40, 630, 640, 360]);
    designSurface(card);
    this.cashoutArt(card, 'gift', [269, 15, 102, 94]);
    designText(card, '捞到就收', [25, 115, 590, 58], 38, undefined, true);
    designText(card, ongoing
      ? this.cashoutStageTitle(run) + (run.status === 'decision' ? ' · 待收锅' : ' · 已暂停')
      : '清盘可收 1 / 2 / 4 个道具', [24, 181, 592, 41], 27);
    designText(card, '每小时限开一锅 · 从开锅时计时', [24, 228, 592, 33], 22, getPageTheme().muted);
    const start = designButton(card, 'Button_赚道具',
      ongoing ? '继续捞锅' : wait ? this.cashoutCooldownLabel(wait) : '开捞',
      [36, 271, 568, 68], () => {
        const current = this.readCashout();
        if (cashoutActive(current.run)) return this.showCashoutRun();
        const next = startCashout(current, Date.now());
        if (next === current) return this.showCashoutHome();
        if (this.writeCashout(key, next)) this.showCashoutRun();
      }, false, !ongoing && wait > 0);
    if (!ongoing && wait > 0) {
      const label = start.getChildByName('Label')!.getComponent(Label)!;
      const refresh = () => {
        const left = cashoutWait(save, Date.now());
        if (!left) this.showCashoutHome();
        else label.string = this.cashoutCooldownLabel(left);
      };
      this.schedule(refresh, 1);
      overlay.once(Node.EventType.NODE_DESTROYED, () => this.unschedule(refresh));
    }
    if (ongoing) {
      designButton(panel, 'Button_放弃副本', '放弃这锅', [157, 1006, 406, 64], () =>
        this.cashoutConfirm('放弃这锅？', '本轮进度与未结算奖励将清空。冷却时间照常计算。', '确认放弃', () => {
          if (this.writeCashout(key, {...this.readCashout(), run: null})) this.showCashoutHome();
        }), true);
    } else if (run) {
      designButton(panel, 'Button_查看结算', '查看上次结算', [174, 1006, 372, 64], () => this.showCashoutRun(), true);
    }
    designFooter(panel, '返回我的', back);
  }

  private cashoutCooldownLabel(wait: number): string {
    const seconds = Math.ceil(wait / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' 后可开捞';
  }

  private cashoutStageTitle(run: CashoutRun): string {
    return '第 ' + (run.stage + 1) + ' / ' + cashoutStages(run).length + ' 段';
  }

  private showCashoutRun(): void {
    const key = this.cashoutKey(), save = this.readCashout(), run = save.run;
    if (!run) return this.showCashoutHome();
    const {overlay, panel} = this.cashoutPage(this.cashoutStageTitle(run));
    const tiles = cashoutTiles(run);
    const stages = cashoutStages(run);
    const {total} = stages[run.stage];
    const finished = run.status === 'won' || run.status === 'lost';
    const t = getPageTheme();
    const firstStep = 360 - (stages.length - 1) * 48 - 25;
    stages.forEach((_, i) => {
      const x = firstStep + 96 * i;
      const done = i < run.stage || (i === run.stage && (run.status === 'decision' || run.status === 'won'));
      const active = !done && i === run.stage;
      if (i > 0) {
        const line = designNode(panel, 'StageLink_' + i, [x - 44, 306, 42, 3]);
        designSurface(line, t.edge, 1, '', false);
      }
      const badge = designNode(panel, 'StageStep_' + i, [x, 282, 50, 50]);
      designSurface(badge, done ? t.success : active ? t.accent : t.card, 25, t.edge, false);
      designText(badge, done ? '✓' : String(i + 1), [0, 0, 50, 50], 26, done || active ? t.onAccent : t.ink, true);
    });
    const status = designNode(panel, 'CashoutStatus', [28, 338, 664, 56]);
    designSurface(status, t.card, 19, t.edge, false);
    designText(status, finished ? '本轮已结算' : run.status === 'decision' ? '待收锅' : '清空本段可收 ' + total + ' 个道具',
      [16, 0, 632, 56], 26, t.accent, true);
    const board = this.cashoutArt(panel, 'panel', [21, 411, 678, 551], true);
    const tray = this.cashoutArt(panel, 'tray', [18, 983, 684, 102], true);
    for (let i = 0; i < 7; i++) {
      this.cashoutArt(tray, 'slot', [16 + i * TRAY_SPACING, 10, 88, 82]);
    }
    const landingScale = new Vec3(80 / 90, 78 / 90, 1);
    run.tray.forEach((type, i) => {
      const visual = this.cashoutArt(tray, 'tile', [0, 0, 90, 90]);
      this.addIngredientImage(visual, type, false, 78, 78);
      this.acceptTrayTile(visual, type, i, tray, landingScale);
    });
    const transition = designNode(panel, 'CashoutFoodTransition', [0, 280, 720, 832]);
    const faces = new Map<number, {face: Node; shade: Node}>();
    let record = save;
    let current = run;
    let moving = false;
    const pendingPicks = new Set<number>();
    const pageOpen = () => this.node.getChildByName(MODE_OVERLAY) === overlay;
    const advance = (next: CashoutSave) => {
      if (pageOpen() && this.writeCashout(key, next)) this.showCashoutRun();
    };
    const pickTile = (id: number) => {
      if (!pageOpen() || current.status !== 'playing'
        || this.node.getChildByName(DIALOG_OVERLAY)) return;
      const artwork = faces.get(id);
      if (!artwork || artwork.shade.active) return;
      if (moving) {
        pendingPicks.add(id);
        return;
      }
      const next = takeCashoutTile(current, tiles, id);
      if (next === current) return;
      const food = tiles[id].food;
      const index = cashoutTrayInsertion(current.tray, food);
      const matched = next.tray.length < current.tray.length;
      const last = current.stage === stages.length - 1;
      const saved = last && next.status === 'decision' ? settleCashout(record, next) : {...record, run: next};
      // Save the settled state before animation so interruption cannot
      // strand a seventh tile or replay a reward.
      if (!this.writeCashout(key, saved)) return;
      record = saved;
      current = saved.run!;
      moving = true;
      faces.delete(id);
      this.animateTrayInsertion(index, tray);
      this.flyTrayTile(artwork.face, tray, transition, index, landingScale, () => {
        if (!pageOpen()) return;
        this.acceptTrayTile(artwork.face, food, index, tray, landingScale);
        const finish = () => {
          if (!pageOpen()) return;
          moving = false;
          if (current.status === 'playing') {
            for (const pending of pendingPicks) {
              if (moving) break;
              pendingPicks.delete(pending);
              pickTile(pending);
            }
            return;
          }
          if (current.status === 'won') this.playEffect('win', 0.72);
          else if (current.status === 'lost') this.playEffect('lose', 0.72);
          this.showCashoutRun();
        };
        const ending = current.status !== 'playing';
        if (matched) this.playTrayMatch(tray, index - 2, ending ? finish : undefined);
        if (!matched || !ending) finish();
      });
      refreshBoard();
    };
    const refreshBoard = () => {
      const removed = new Set(current.removed);
      // Repeated positions can stack dozens of layers. Draw only their top
      // face and reveal the next face after taking it.
      const topAt = new Map<string, typeof tiles[number]>();
      for (const tile of tiles) {
        if (!removed.has(tile.id)) topAt.set(tile.x + ':' + tile.y, tile);
      }
      const visible = Array.from(topAt.values()).sort((a, b) => a.id - b.id);
      const ids = new Set(visible.map(tile => tile.id));
      faces.forEach(({face}, id) => {
        if (ids.has(id)) return;
        face.removeFromParent();
        face.destroy();
        faces.delete(id);
      });
      visible.forEach((tile, i) => {
        let artwork = faces.get(tile.id);
        if (!artwork) {
          const face = this.cashoutArt(board, 'tile', [290 + tile.x, 228 + tile.y, 90, 90]);
          face.name = 'CashoutTile_' + tile.id;
          this.addIngredientImage(face, tile.food, false, 78, 78);
          const shade = designNode(face, 'BlockedShade', [2, 2, 86, 86]);
          designSurface(shade, '#37261666', 18, '', false);
          artwork = {face, shade};
          faces.set(tile.id, artwork);
          designHit(face, () => pickTile(tile.id));
        }
        artwork.face.setSiblingIndex(i + 1);
        artwork.shade.active = tile.blockers.some(id => !removed.has(id));
      });
    };
    refreshBoard();
    const modeTag = designNode(panel, 'CashoutModeTag', [44, 1147, 335, 58]);
    designSurface(modeTag, t.card, 26, t.edge, false);
    designText(modeTag, '捞到就收 · 道具挑战', [10, 0, 315, 58], 25, t.ink, true);
    designButton(panel, 'Button_暂停', '暂停', [484, 1137, 188, 80], () => {
      if (moving) return;
      this.cashoutConfirm('副本已暂停', '返回后可以继续这锅。', '返回背包',
        () => this.showCashoutHome(), '继续捞');
    }, true);
    if (run.status === 'decision') this.showCashoutDecision(run, () => advance(settleCashout(save, run)),
      () => advance({...save, run: createCashoutRun(run.stage + 1, run.difficulty)}));
    else if (finished) this.showCashoutResult(run);
  }

  private cashoutDialog(title: string, height: number, framed = false): Node {
    this.dismissPlayerMenu(DIALOG_OVERLAY);
    const {panel} = designOverlay(this.node, DIALOG_OVERLAY, this.viewportHeight, true);
    const body = designNode(panel, 'CashoutDialog', [34, (1280 - height) / 2, 652, height]);
    if (framed) this.cashoutArt(body, 'panel', [0, 0, 652, height], true);
    else designSurface(body);
    designText(body, title, [25, 28, 602, 76], 42, framed ? designOnBackground() : undefined, true);
    return body;
  }

  private cashoutConfirm(title: string, detail: string, caption: string, confirm: () => void,
    cancel = '取消', afterCancel?: () => void): void {
    const body = this.cashoutDialog(title, 387);
    designText(body, detail, [44, 120, 564, 118], 30);
    designButton(body, 'Button_取消', cancel, [36, 268, 280, 82], () => {
      this.dismissPlayerMenu(DIALOG_OVERLAY);
      afterCancel?.();
    }, true);
    designButton(body, 'Button_确认', caption, [336, 268, 280, 82], () => {
      if (body.isValid && body.parent?.parent === this.node.getChildByName(DIALOG_OVERLAY)) confirm();
    });
  }

  private showCashoutDecision(run: CashoutRun, collect: () => void, push: () => void): void {
    const stages = cashoutStages(run);
    const now = stages[run.stage].total, next = stages[run.stage + 1].total;
    const colors = {1: ['#245342', '#952E21'], 4: ['#4D803D', '#9C4E25'],
      8: ['#34614F', '#865227'], 9: ['#942E23', '#694936']}[getPageTheme().id];
    const body = this.cashoutDialog('现在收，还是继续捞？', 659);
    this.cashoutArt(body, 'gift', [273, 110, 106, 100]);
    designText(body, '第 ' + (run.stage + 1) + ' 段已清空', [25, 221, 602, 46], 29, getPageTheme().accent, true);
    const choices = [
      {label: '现在收可得', amount: now, note: '立即入包', caption: '收下 ' + now + ' 个', action: collect, color: colors[0]},
      {label: '下一段成功共得', amount: next, note: '失败本轮得 0 个', caption: '继续捞', action: push, color: colors[1]},
    ];
    choices.forEach((choice, i) => {
      const card = designNode(body, 'CashoutChoice_' + i, [24 + i * 312, 280, 292, 242]);
      designSurface(card);
      designText(card, choice.label, [8, 8, 276, 44], 23);
      designText(card, choice.amount + ' 个道具', [8, 52, 276, 64], 38, choice.color, true);
      designText(card, choice.note, [8, 115, 276, 41], 23, choice.color, true);
      const button = designButton(card, 'Button_' + choice.caption, choice.caption, [15, 159, 262, 68], choice.action);
      designSurface(button, choice.color);
    });
    designText(body, '继续后，清空下一段才能收。', [32, 534, 588, 39], 25);
    designButton(body, 'Button_稍后决定', '稍后决定', [156, 577, 340, 63], () => this.showCashoutHome(), true);
  }

  private showCashoutResult(run: CashoutRun): void {
    const won = run.status === 'won';
    const body = this.cashoutDialog(won ? '道具已入包' : '这一锅没捞成', won ? 570 : 391);
    if (won && run.reward) {
      const count = CASHOUT_TOOLS.reduce((sum, tool) => sum + run.reward![tool], 0);
      this.cashoutArt(body, 'gift', [274, 107, 104, 96]);
      designText(body, '本轮共获得 ' + count + ' 个随机道具', [30, 206, 592, 52], 28);
      const rewards = designNode(body, 'CashoutRewards', [-26, 277, 720, 172]);
      this.showStock(rewards, run.reward, 0, true);
    } else {
      designText(body, '托盘已满，本轮没获得道具。\n背包原有道具仍保留。', [35, 116, 582, 143], 30);
    }
    const y = won ? 471 : 273;
    designButton(body, 'Button_返回背包', '返回背包', [48, y, 556, 68], () => this.showCashoutHome());
  }

  protected isInventoryAssisted(): boolean {
    return this.assistedRun !== null;
  }

  protected resumeGameSave(standard: GameSave | null): GameSave | null {
    const key = this.cashoutKey(), record = this.readCashout().assisted;
    this.assistedRun = null;
    if (record?.save.runId) {
      this.assistedRun = {key, used: record.used, runId: record.save.runId};
      return record.save;
    }
    return super.resumeGameSave(standard);
  }

  protected saveGameCheckpoint(save: GameSave): void {
    const assisted = this.assistedRun;
    if (!assisted) return super.saveGameCheckpoint(save);
    if (save.runId === assisted.runId && assisted.key === this.cashoutKey()) {
      const record = this.readCashout();
      this.writeCashout(assisted.key, {...record, assisted: {used: assisted.used, save}});
    }
  }

  protected resumePlayerDay(): void {
    if (this.assistedRun?.key !== this.cashoutKey()) super.resumePlayerDay();
  }

  protected loadLevel(index: number, persist = true, restored?: LevelData): void {
    if (persist && this.assistedRun) {
      const {key} = this.assistedRun;
      if (key === this.cashoutKey()) {
        const record = this.readCashout();
        delete record.assisted;
        if (!this.writeCashout(key, record)) return;
      }
      this.assistedRun = null;
    }
    super.loadLevel(index, persist, restored);
  }

  private inventoryAvailable(): boolean {
    return this.levelIndex === 2 && !!this.playerService
      && !this.locked && !this.gameEnded;
  }

  private canApplyInventory(tool: CashoutTool): boolean {
    if (tool === 'undo') return !!this.lastMoveSnapshot;
    if (tool === 'bomb') return selectBombTargets(this.levelData.tiles, () => 0, 18).length > 0;
    return new Set(this.levelData.tiles.filter(tile => !tile.removed).map(tile => tile.type)).size > 1;
  }

  protected showInventoryTools(): void {
    if (!this.inventoryAvailable() || this.hasPlayerMenu()) return;
    const key = this.cashoutKey(), record = this.readCashout();
    const used = this.assistedRun?.key === key ? this.assistedRun.used : 0;
    const t = getPageTheme();
    const {row: colors, footer, radius} = MENU_APPEARANCE[t.id];
    const body = this.cashoutDialog('背包', 700, true);
    const bag = designNode(body, 'InventoryIcon', [228, 42, 48, 48]);
    paintBackpackIcon(bag, t.id);
    const summary = designNode(body, 'InventorySummary', [42, 111, 568, 58]);
    designSurface(summary, colors.fill, radius, colors.edge, false);
    designText(summary, '库存道具', [19, 2, 217, 54], 29, colors.ink, true, true);
    designText(summary, '本局已用 ' + used + ' / ' + BAG_LIMIT, [270, 2, 278, 54], 25, colors.muted);
    CASHOUT_TOOLS.forEach((tool, i) => {
      const row = designNode(body, 'Inventory_' + tool, [42, 188 + i * 114, 568, 103]);
      designSurface(row, colors.fill, radius, colors.edge, t.id !== 9);
      const medallion = designNode(row, 'IconMedallion', [14, 14, 75, 75]);
      designSurface(medallion, colors.badge, radius, '', false);
      const icon = designNode(medallion, 'ToolIcon', [9.5, 9.5, TOOL_ICON_SIZE, TOOL_ICON_SIZE]);
      paintToolIcon(icon, tool, t.id);
      designText(row, CASHOUT_TOOL_NAMES[tool], [106, 10, 173, 45], 32, colors.ink, true, true);
      designText(row, INVENTORY_TOOL_HINTS[tool], [107, 55, 200, 34], 22, colors.muted, false, true);
      const stock = designNode(row, 'StockCount', [294, 27, 86, 49]);
      designSurface(stock, colors.badge, radius, '', false);
      designText(stock, '×' + record.stock[tool], [4, 0, 78, 49], 29, t.dark, true);
      const unavailable = used >= BAG_LIMIT ? '已达上限'
        : record.stock[tool] === 0 ? '无库存'
        : !this.canApplyInventory(tool) ? '暂不可用' : '';
      const use = designButton(row, 'Button_使用_' + tool, unavailable || '使用', [397, 16, 155, 71], () => {
        if (used) {
          this.useInventoryTool(key, tool);
          return;
        }
        this.cashoutConfirm('使用库存' + CASHOUT_TOOL_NAMES[tool] + '？',
          '消耗 1 个库存道具。本局成绩不计入地域榜单。',
          '确认使用', () => this.useInventoryTool(key, tool), '取消', () => this.showInventoryTools());
      }, false, !!unavailable);
      designSurface(use, unavailable ? t.disabled : footer.fill, radius, colors.edge, false);
    });
    const back = designButton(body, 'Button_返回棋局', '返回棋局', [48, 572, 556, 76],
      () => this.dismissPlayerMenu(DIALOG_OVERLAY));
    designSurface(back, footer.fill, radius, footer.edge);
  }

  private useInventoryTool(key: string, tool: CashoutTool): void {
    if (key !== this.cashoutKey() || !this.inventoryAvailable() || !this.canApplyInventory(tool)) return;
    const record = this.readCashout();
    const used = this.assistedRun?.key === key ? this.assistedRun.used : 0;
    if (used >= BAG_LIMIT || record.stock[tool] < 1) return;
    // Stage the same logical effects on a snapshot. The stock and affected board
    // share a single write, so a failed save never consumes a tool.
    const save = this.captureGameSave();
    save.runId ||= 'assisted-' + Date.now().toString(36);
    if (tool === 'undo') {
      const move = save.lastMove!;
      save.removedIds = move.removedIds;
      save.tray = move.tray;
      save.reserve = move.reserve;
    } else if (tool === 'bomb') {
      const targets = selectBombTargets(this.levelData.tiles, Math.random, 18);
      save.removedIds.push(...targets.map(tile => tile.id));
      const reached = Math.floor((save.removedIds.length - save.tray.length - save.reserve.length) / 100);
      while (save.rewardedMilestones < reached) {
        save.rewardedMilestones++;
        save.toolUses[CASHOUT_TOOLS[Math.floor(Math.random() * CASHOUT_TOOLS.length)]]++;
      }
      if (save.removedIds.length === save.types.length && !save.tray.length && !save.reserve.length) save.status = 'won';
    } else {
      const active = this.levelData.tiles.flatMap((tile, index) => tile.removed ? [] : [index]);
      for (let i = active.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [save.types[active[i]], save.types[active[j]]] = [save.types[active[j]], save.types[active[i]]];
      }
      if (active.every(index => save.types[index] === this.levelData.tiles[index].type)) {
        const first = active[0], other = active.find(index => save.types[index] !== save.types[first])!;
        [save.types[first], save.types[other]] = [save.types[other], save.types[first]];
      }
    }
    save.lastMove = null;
    let validated: GameSave;
    try {
      validated = validateGameSave(save);
    } catch {
      this.showToast('这张道具暂时无法使用', '#A24A3C');
      return;
    }
    const stock = {...record.stock, [tool]: record.stock[tool] - 1};
    if (!this.writeCashout(key, {...record, stock, assisted: {used: used + 1, save: validated}})) return;
    this.assistedRun = {key, used: used + 1, runId: validated.runId!};
    this.dismissPlayerMenu(DIALOG_OVERLAY);
    this.restoreGame(validated);
    this.showToast('已使用库存' + CASHOUT_TOOL_NAMES[tool], '#4D803D');
  }
}
