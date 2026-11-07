import {Label, Node, sys, Vec3} from 'cc';
import {
  CASHOUT_TOOLS, CASHOUT_TOOL_NAMES,
  CashoutRun, CashoutSave, CashoutStock, CashoutTool,
  cashoutActive, cashoutStages, cashoutTiles, cashoutTrayInsertion, cashoutWait, createCashoutRun,
  emptyCashoutStock, settleCashout, startCashout, takeCashoutTile,
} from '../data/CashoutData';
import {selectBombTargets} from '../data/GameData';
import type {LevelData} from '../data/GameData';
import {GameSave, regionPath, validateGameSave} from '../data/PlayerData';
import {achievementEntries} from '../data/CollectionData';
import {getPageTheme} from '../data/PageTheme';
import {HotPotDesignResults} from './HotPotDesignResults';
import {
  DesignRect, designButton, designFooter, designHeader, designHit,
  designNode, designOnBackground, designOverlay, designSurface, designText, fitDesignPage, paintBackpackIcon,
} from './HotPotDesignUi';
import {GameArtRole, paintGameArt} from './HotPotGameArt';
import {TRAY_SPACING} from './HotPotUi';

const MODE_OVERLAY = 'CashoutOverlay';
const DIALOG_OVERLAY = 'CashoutDialogOverlay';
const BAG_LIMIT = 2;

export abstract class HotPotCashout extends HotPotDesignResults {
  private cashoutMyPage = false;
  private assistedRun: {key: string; used: number; runId: string} | null = null;

  private cashoutKey(): string {
    return 'hotpot.cashout.v1:' + (this.playerService?.playerId || 'guest');
  }

  private readCashout(key = this.cashoutKey()): CashoutSave {
    try {
      const data = JSON.parse(sys.localStorage.getItem(key) || 'null') as CashoutSave | null;
      if (data?.version === 1 && CASHOUT_TOOLS.every(tool =>
        Number.isSafeInteger(data.stock?.[tool]) && data.stock[tool] >= 0)) {
        const run = data.run;
        if (run && (!cashoutStages(run)?.[run.stage]
          || !Array.isArray(run.removed) || !Array.isArray(run.tray)
          || !['playing', 'decision', 'won', 'lost'].includes(run.status)
          || (run.status === 'won' && !run.reward))) data.run = null;
        if (!Number.isSafeInteger(data.nextStartAt) || data.nextStartAt! < 0) delete data.nextStartAt;
        return data;
      }
    } catch {
      // A malformed local record must not break the game menu.
    }
    return {version: 1, stock: emptyCashoutStock(), run: null};
  }

  private writeCashout(key: string, save: CashoutSave): boolean {
    if (key !== this.cashoutKey()) {
      this.closeCashout();
      this.showToast('玩家已切换，请重新打开道具页', '#A24A3C');
      return false;
    }
    try {
      sys.localStorage.setItem(key, JSON.stringify(save));
      return true;
    } catch {
      this.showToast('本机进度未能保存，请重试', '#A24A3C');
      return false;
    }
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
    if (this.cashoutMyPage) return this.showCashoutMy();
    const close = () => this.dismissPlayerMenu('PlayerOverlay');
    const panel = this.designPage('PlayerOverlay', '我的小馆', close);
    if (!panel) return;
    const open = (action: () => void) => () => { close(); action(); };
    designButton(panel, 'Button_我的', '我的', [40, 347, 310, 150], open(() => this.showCashoutMy()), true);
    designButton(panel, 'Button_道具', '道具', [370, 347, 310, 150], open(() => this.showCashoutHome()), true);
    const entries: [string, () => void][] = [
      ['地域榜单', () => this.showRegionPicker([], true)],
      ['页面换肤', () => this.showPageStyles()],
      ['分享', () => this.shareGame()],
      ['游戏圈', () => { void this.openGameClub(); }],
    ];
    entries.forEach(([name, action], i) => designButton(panel, 'Button_' + name, name,
      [40, 525 + i * 96, 640, 78], name === '分享' || name === '游戏圈' ? action : open(action), true));
    designFooter(panel, '返回游戏', close);
  }

  private showCashoutMy(): void {
    const close = () => {
      this.cashoutMyPage = false;
      this.dismissPlayerMenu('PlayerOverlay');
      this.showPlayerProfile();
    };
    const panel = this.designPage('PlayerOverlay', '我的', close);
    if (!panel) return;
    this.cashoutMyPage = true;
    const service = this.playerService!, t = getPageTheme(), state = service.state;
    void service.refreshRuntimeConfig();
    const profile = designNode(panel, 'CashoutProfile', [52, 326, 616, 170]);
    designSurface(profile);
    const address = regionPath(service.regions, state.profile.regionCodes).map(region => region.name).join(' · ');
    designText(profile, service.playerId ? '玩家 ' + service.playerId.slice(0, 8) : '本机玩家',
      [25, 15, 566, 49], 31, t.ink, true, true);
    designText(profile, address || '尚未选择地区', [25, 62, 566, 41], 25, t.muted, false, true);
    const achievements = achievementEntries(state).filter(entry => entry.unlocked).length;
    designText(profile, '通关 ' + this.designStats().total + '  ·  食材 ' + state.progress.discovered.length
      + '  ·  成就 ' + achievements, [25, 109, 566, 42], 26, t.accent, true, true);
    const open = (action: () => void) => () => {
      this.dismissPlayerMenu('PlayerOverlay');
      action();
    };
    designButton(panel, 'Button_我的位置', '我的位置', [52, 518, 616, 82], open(() => this.showRegionPicker([])), true);
    designButton(panel, 'Button_图鉴', '图鉴', [52, 614, 616, 82], open(() => this.showCollection()), true);
    designButton(panel, 'Button_成就', '成就', [52, 710, 616, 82], open(() => this.showCollection('achievements')), true);
    const status = designNode(panel, 'CashoutCloudStatus', [52, 820, 616, 125]);
    designSurface(status);
    this.playerStatusLabel = designText(status, service.statusText, [18, 8, 375, 109], 22, t.muted, false, true);
    designButton(status, 'Button_重试同步', '重试同步', [405, 28, 190, 69], () => { void this.retryPlayerCloud(); }, true);
    designFooter(panel, '返回菜单', close);
  }

  protected returnFromCollection(tab: 'ingredients' | 'achievements'): void {
    if (this.cashoutMyPage) this.showCashoutMy();
    else super.returnFromCollection(tab);
  }

  private cashoutPage(title: string): {overlay: Node; panel: Node} {
    this.closeCashout();
    const page = designOverlay(this.node, MODE_OVERLAY, this.viewportHeight, false, 'game-ui/bg-0' + getPageTheme().id);
    designHeader(page.panel, title);
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
      this.cashoutArt(card, tool, [41, 11, 106, 61]);
      designText(card, CASHOUT_TOOL_NAMES[tool], [4, 74, 180, 41], 26, undefined, true);
      designText(card, '×' + stock[tool], [4, 115, 180, 43], 32, getPageTheme().accent, true);
    });
  }

  private showCashoutHome(): void {
    const key = this.cashoutKey(), save = this.readCashout(key), run = save.run;
    const {overlay, panel} = this.cashoutPage('道具');
    const ongoing = cashoutActive(run);
    const wait = cashoutWait(save, Date.now());
    designText(panel, '道具库存', [42, 307, 636, 58], 35, designOnBackground(), true);
    this.showStock(panel, save.stock, 376);
    designText(panel, '赚到的道具可在主线第三关使用', [45, 561, 630, 46], 25, designOnBackground());
    const card = designNode(panel, 'CashoutEntry', [40, 630, 640, 340]);
    designSurface(card);
    this.cashoutArt(card, 'gift', [269, 15, 102, 94]);
    designText(card, '捞到就收', [25, 115, 590, 58], 38, undefined, true);
    designText(card, ongoing
      ? this.cashoutStageTitle(run) + (run.status === 'decision' ? ' · 待收锅' : ' · 已暂停')
      : '清盘可收 1 / 2 / 4 个道具', [24, 175, 592, 41], 27);
    designText(card, '每小时限开一锅 · 从开锅时计时', [24, 217, 592, 33], 22, getPageTheme().muted);
    const start = designButton(card, 'Button_赚道具',
      ongoing ? '继续捞锅' : wait ? this.cashoutCooldownLabel(wait) : '开捞',
      [36, 253, 568, 68], () => {
        const current = this.readCashout(key);
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
      designButton(panel, 'Button_放弃副本', '放弃这锅', [157, 981, 406, 64], () =>
        this.cashoutConfirm('放弃这锅？', '本轮进度与未结算奖励将清空。冷却时间照常计算。', '确认放弃', () => {
          if (this.writeCashout(key, {...this.readCashout(key), run: null})) this.showCashoutHome();
        }), true);
    } else if (run) {
      designButton(panel, 'Button_查看结算', '查看上次结算', [174, 981, 372, 64], () => this.showCashoutRun(), true);
    }
    designText(panel, '道具和副本进度仅保存在本机', [40, 1052, 640, 43], 22, designOnBackground());
    designFooter(panel, '返回菜单', () => { this.closeCashout(); this.showPlayerProfile(); });
  }

  private cashoutCooldownLabel(wait: number): string {
    const seconds = Math.ceil(wait / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' 后可开捞';
  }

  private cashoutStageTitle(run: CashoutRun): string {
    return '第 ' + (run.stage + 1) + ' / ' + cashoutStages(run).length + ' 段';
  }

  private showCashoutRun(): void {
    const key = this.cashoutKey(), save = this.readCashout(key), run = save.run;
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
    const pageOpen = () => this.node.getChildByName(MODE_OVERLAY) === overlay;
    const advance = (next: CashoutSave) => {
      if (pageOpen() && this.writeCashout(key, next)) this.showCashoutRun();
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
          designHit(face, () => {
            if (moving || !pageOpen() || this.node.getChildByName(DIALOG_OVERLAY)) return;
            const next = takeCashoutTile(current, tiles, tile.id);
            if (next === current) return;
            const index = cashoutTrayInsertion(current.tray, tile.food);
            const matched = next.tray.length < current.tray.length;
            const last = current.stage === stages.length - 1;
            const saved = last && next.status === 'decision' ? settleCashout(record, next) : {...record, run: next};
            // Save the settled state before animation so interruption cannot
            // strand a seventh tile or replay a reward.
            if (!this.writeCashout(key, saved)) return;
            record = saved;
            current = saved.run!;
            moving = true;
            faces.delete(tile.id);
            this.animateTrayInsertion(index, tray);
            this.flyTrayTile(face, tray, transition, index, landingScale, () => {
              if (!pageOpen()) return;
              this.acceptTrayTile(face, tile.food, index, tray, landingScale);
              refreshBoard();
              const finish = () => {
                if (!pageOpen()) return;
                moving = false;
                if (current.status === 'playing') return;
                if (current.status === 'won') this.playEffect('win', 0.72);
                else if (current.status === 'lost') this.playEffect('lose', 0.72);
                this.showCashoutRun();
              };
              const ending = current.status !== 'playing';
              if (matched) this.playTrayMatch(tray, index - 2, ending ? finish : undefined);
              if (!matched || !ending) finish();
            });
          });
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
      this.cashoutConfirm('副本已暂停', '牌阵和托盘已保存到本机。', '返回道具页',
        () => this.showCashoutHome(), '继续捞');
    }, true);
    if (run.status === 'decision') this.showCashoutDecision(run, () => advance(settleCashout(save, run)),
      () => advance({...save, run: createCashoutRun(run.stage + 1, run.difficulty)}));
    else if (finished) this.showCashoutResult(run);
  }

  private cashoutDialog(title: string, height: number): Node {
    this.dismissPlayerMenu(DIALOG_OVERLAY);
    const {panel} = designOverlay(this.node, DIALOG_OVERLAY, this.viewportHeight, true);
    const body = designNode(panel, 'CashoutDialog', [34, (1280 - height) / 2, 652, height]);
    designSurface(body);
    designText(body, title, [25, 28, 602, 76], 42, undefined, true);
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
    designButton(body, 'Button_返回道具页', '返回道具页', [48, y, 556, 68], () => this.showCashoutHome());
  }

  protected isInventoryAssisted(): boolean {
    return this.assistedRun !== null;
  }

  protected resumeGameSave(standard: GameSave | null): GameSave | null {
    const key = this.cashoutKey(), record = this.readCashout(key).assisted;
    if (record && (record.used === 1 || record.used === 2)) {
      try {
        const save = validateGameSave(record.save);
        if (save.levelIndex === 2 && save.runId) {
          this.assistedRun = {key, used: record.used, runId: save.runId};
          return save;
        }
      } catch {
        // The regular checkpoint can still be resumed.
      }
    }
    return super.resumeGameSave(standard);
  }

  protected saveGameCheckpoint(save: GameSave): void {
    const assisted = this.assistedRun;
    if (!assisted) return super.saveGameCheckpoint(save);
    if (save.runId === assisted.runId && assisted.key === this.cashoutKey()) {
      const record = this.readCashout(assisted.key);
      this.writeCashout(assisted.key, {...record, assisted: {used: assisted.used, save}});
    }
  }

  protected restoreGame(save: GameSave): void {
    if (this.assistedRun) {
      const {key, runId} = this.assistedRun;
      if (key === this.cashoutKey()) {
        const local = this.readCashout(key).assisted?.save;
        if (local?.runId === runId) super.restoreGame(local);
        return;
      }
      this.assistedRun = null;
    }
    super.restoreGame(save);
  }

  protected showSaveConflict(): void {
    if (this.assistedRun?.key !== this.cashoutKey()) super.showSaveConflict();
  }

  protected showConnectedSaveChoice(saved: GameSave): void {
    if (this.assistedRun?.key !== this.cashoutKey()) super.showConnectedSaveChoice(saved);
  }

  protected async retryPlayerCloud(): Promise<void> {
    const assisted = this.assistedRun;
    await super.retryPlayerCloud();
    if (!this.node.isValid || !assisted || assisted.key === this.cashoutKey()) return;
    this.assistedRun = null;
    this.closeCashout();
    this.dismissPlayerMenu('ConnectedSaveOverlay');
    this.dismissPlayerMenu('CloudConflictOverlay');
    const save = this.resumeGameSave(this.playerService?.state.save ?? null);
    if (save) this.restoreGame(save);
    else this.loadLevel(0);
    if (this.playerService?.isConflict) this.showSaveConflict();
  }

  protected resumePlayerDay(): void {
    if (this.assistedRun?.key === this.cashoutKey()) this.flushPlayerSave();
    else super.resumePlayerDay();
  }

  protected loadLevel(index: number, persist = true, restored?: LevelData): void {
    if (persist && this.assistedRun) {
      const {key} = this.assistedRun;
      if (key === this.cashoutKey()) {
        const record = this.readCashout(key);
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
    const key = this.cashoutKey(), record = this.readCashout(key);
    const used = this.assistedRun?.key === key ? this.assistedRun.used : 0;
    const body = this.cashoutDialog('背包', 664);
    const icon = designNode(body, 'InventoryIcon', [230, 42, 48, 48]);
    paintBackpackIcon(icon, getPageTheme().id);
    designText(body, '库存道具 · 本局已用 ' + used + ' / ' + BAG_LIMIT, [30, 112, 592, 56], 28);
    CASHOUT_TOOLS.forEach((tool, i) => {
      const row = designNode(body, 'Inventory_' + tool, [30, 180 + i * 111, 592, 96]);
      designSurface(row, getPageTheme().panel, 22, getPageTheme().edge, false);
      this.cashoutArt(row, tool, [18, 20, 94, 55]);
      designText(row, CASHOUT_TOOL_NAMES[tool] + '   库存 ×' + record.stock[tool],
        [129, 13, 306, 70], 29, undefined, true, true);
      const disabled = used >= BAG_LIMIT || record.stock[tool] === 0 || !this.canApplyInventory(tool);
      designButton(row, 'Button_使用_' + tool, '使用', [442, 12, 134, 72], () => {
        if (used) {
          this.useInventoryTool(key, tool);
          return;
        }
        this.cashoutConfirm('使用库存' + CASHOUT_TOOL_NAMES[tool] + '？',
          '消耗 1 个库存道具。使用后本局成绩仅保存在本机，不计入地域榜单。',
          '确认使用', () => this.useInventoryTool(key, tool), '取消', () => this.showInventoryTools());
      }, false, disabled);
    });
    designButton(body, 'Button_返回棋局', '返回棋局', [48, 556, 556, 78],
      () => this.dismissPlayerMenu(DIALOG_OVERLAY), true);
  }

  private useInventoryTool(key: string, tool: CashoutTool): void {
    if (key !== this.cashoutKey() || !this.inventoryAvailable() || !this.canApplyInventory(tool)) return;
    const record = this.readCashout(key);
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
