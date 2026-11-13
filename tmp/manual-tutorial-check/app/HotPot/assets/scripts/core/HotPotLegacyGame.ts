import {_decorator, EditBox, Graphics, Label, Mask, Node, ScrollView, Vec3} from 'cc';

import {LEVELS} from '../data/GameData';

import {GameSave, RegionNode} from '../data/PlayerData';
import {getPageTheme} from '../data/PageTheme';

import {
  drawCloseButton,
  drawLacquerPanel,
  drawRoundRect,
  hex,
  makeButton,
  makeBodyLabel,
  makeLabel,
  makePanelHeading,
  setButtonEnabled,
  transform,
} from './HotPotUi';

import {HotPotDialogs} from './HotPotDialogs';

const {ccclass} = _decorator;

/**
 * 火锅游戏场景组件：调试入口、地区选择与结算弹窗。
 */

export abstract class HotPotLegacyGame extends HotPotDialogs {
  /**
   * 逐级显示可选择的地区。
   */
  protected showRegionPicker(codes: string[], leaderboard = false, query = ''): void {
    if (!this.scrollComponentsReady()) return;
    const panel = this.makePlayerMenu('RegionOverlay', 1120);
    if (!panel) return;
    const service = this.playerService!;
    const theme = getPageTheme();
    // Review this simplified layout in style 7 before extending other themes.
    const compact = theme.id === 8;
    let options = service.regions;
    const names: string[] = [];
    for (const code of codes) {
      const selected = options.find((item) => item.code === code);
      if (!selected) {
        this.dismissPlayerMenu('RegionOverlay');
        this.showRegionPicker([], leaderboard);
        return;
      }
      names.push(selected.name);
      options = selected.children || [];
    }
    const title = compact && names.length
      ? names[names.length - 1] + (leaderboard ? '排行' : '')
      : leaderboard ? '地域排行榜' : '选择地区';
    makePanelHeading(panel, title, 460, 450);
    let input: {string: string} = {string: compact ? '' : query};
    let inputRoot: Node | null = null;
    if (!compact) {
      makeLabel(panel, leaderboard ? '完成第三关，为家乡添一席' : '把家乡的烟火气带进小馆',
        27, '#94735D', new Vec3(0, 385), 540, 42);
      inputRoot = new Node('RegionSearch');
      panel.addChild(inputRoot);
      inputRoot.setPosition(0, 316);
      drawRoundRect(inputRoot, 548, 68, 16, theme.card, theme.line, 3);
      transform(inputRoot, 508, 68);
      const inputText = makeLabel(inputRoot, '', 26, theme.ink, new Vec3(-8, 0), 480, 48);
      inputText.horizontalAlign = Label.HorizontalAlign.LEFT;
      transform(inputText.node, 480, 48).setAnchorPoint(0, 1);
      const placeholder = makeLabel(inputRoot, '搜索省、市、区县', 25, theme.muted,
        new Vec3(-8, 0), 480, 48);
      placeholder.horizontalAlign = Label.HorizontalAlign.LEFT;
      transform(placeholder.node, 480, 48).setAnchorPoint(0, 1);
      inputRoot.active = false;
      const search = inputRoot.addComponent(EditBox);
      search.textLabel = inputText;
      search.placeholderLabel = placeholder;
      search.maxLength = 24;
      search.inputMode = EditBox.InputMode.SINGLE_LINE;
      search.returnType = EditBox.KeyboardReturnType.SEARCH;
      search.placeholder = '搜索省、市、区县';
      search.string = query;
      input = search;
      inputRoot.active = true;
      const crumbs = ['全部地区', ...names];
      crumbs.forEach((name, index) => {
        const width = Math.min(174, 548 / crumbs.length);
        const start = -(crumbs.length - 1) * width / 2;
        const crumb = makeButton(panel, name + (index < crumbs.length - 1 ? ' ›' : ''),
          new Vec3(start + index * width, 245), width - 6, 54,
          '#B88261', () => {
            this.dismissPlayerMenu('RegionOverlay');
            this.showRegionPicker(codes.slice(0, index), leaderboard);
          });
        transform(crumb, width - 6, 54);
      });
    }
    const listHeight = compact ? (leaderboard ? 676 : 768) : 496;
    const listTop = listHeight / 2;
    const viewport = new Node('RegionViewport');
    panel.addChild(viewport);
    viewport.setPosition(0, compact ? (leaderboard ? 70 : 24) : -36);
    transform(viewport, 584, listHeight);
    viewport.addComponent(Mask);
    const content = new Node('RegionContent');
    viewport.addChild(content);
    transform(content, 584, listHeight).setAnchorPoint(.5, 1);
    content.setPosition(0, listTop);
    const scroll = viewport.addComponent(ScrollView);
    scroll.content = content;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = false;
    scroll.cancelInnerEvents = true;
    const rankingStatus = compact && !leaderboard ? null : makeBodyLabel(panel,
      leaderboard ? service.leaderboardText : '逐级选择或搜索，确认后保存',
      25, '#94735D', new Vec3(0, -337), compact ? 500 : 560, compact ? 72 : 52, true);
    type Row = {region: RegionNode; path: string[]; names: string[]};
    const searchRows = (keyword: string): Row[] => {
      const rows: Row[] = [];
      const visit = (nodes: RegionNode[], path: string[], parents: string[]): void => {
        for (const region of nodes) {
          const next = [...path, region.code], labels = [...parents, region.name];
          if (labels.join('').includes(keyword)) rows.push({region, path: next, names: labels});
          if (region.children) visit(region.children, next, labels);
        }
      };
      visit(service.regions, [], []);
      return rows.slice(0, 60);
    };
    const render = (): void => {
      if (!panel.isValid) return;
      content.children.slice().forEach((node) => {node.removeFromParent(); node.destroy();});
      const keyword = input.string.trim();
      const rows: Row[] = keyword ? searchRows(keyword)
        : service.sortedRegions(options).map((region) => ({region,
          path: [...codes, region.code], names: [...names, region.name]}));
      transform(content, 584, Math.max(listHeight, rows.length * 92 + 10)).setAnchorPoint(.5, 1);
      content.setPosition(0, listTop);
      const current = service.state.profile.regionCodes;
      if (!rows.length) {
        makeLabel(content, '没有找到相关地区', 32, theme.ink,
          new Vec3(0, -145), 520, 60);
        makeLabel(content, '换个关键词，或按省、市逐级选择', 24, theme.muted,
          new Vec3(0, -212), 520, 52, true);
        makeButton(content, '清空搜索', new Vec3(0, -312), 440, 76, '#A3613B', () => {
          input.string = ''; render();
        });
      }
      rows.forEach((row, index) => {
        const selected = current.join('/') === row.path.join('/');
        const count = leaderboard ? ` · ${service.regionCount(row.region.code)}次` : '';
        const caption = row.region.name;
        const button = makeButton(content, caption,
          new Vec3(0, -48 - index * 92), 548, 76, '#F3E2CA', () => {
            const currentQuery = input.string;
            this.dismissPlayerMenu('RegionOverlay');
            if (row.region.children?.length) {
              this.showRegionPicker(row.path, leaderboard);
            } else if (leaderboard) {
              this.showToast('完成第三关，为所在地域增加一次通关', '#8A4B34');
              this.showRegionPicker(codes, true, currentQuery);
            } else {
              this.showRegionConfirmation(row.path, row.names, codes, currentQuery);
            }
          });
        if (selected) drawRoundRect(button, 548, 76, 16, theme.card, theme.edge, 3);
        const label = button.getChildByName('Label')!.getComponent(Label)!;
        transform(label.node, 370, 42);
        label.node.setPosition(-65, keyword ? 13 : 1);
        label.fontSize = keyword ? 24 : 29;
        label.color = hex(theme.ink);
        if (compact) label.horizontalAlign = Label.HorizontalAlign.LEFT;
        if (leaderboard) {
          const total = makeBodyLabel(button, count.slice(3), 23, theme.ink,
            new Vec3(172, 0), 136, 40);
          total.node.name = 'RankCount';
        }
        if (keyword) makeLabel(button, row.names.slice(0, -1).join(' / ') || '全部地区',
          22, theme.muted, new Vec3(-45, -23), 400, 30);
        const mark = selected ? '✓' : row.region.children?.length ? '›' : '';
        if (mark) makeLabel(button, mark, 26, theme.ink, new Vec3(248, 0), 30, 38);
      });
      if (keyword && rows.length === 60 && rankingStatus) rankingStatus.string = '最多显示60项，请输入更精确的名称';
    };
    inputRoot?.on(EditBox.EventType.TEXT_CHANGED, render);
    render();
    void service.refreshLeaderboard().then(() => {
      if (!panel.isValid) return;
      if (leaderboard && rankingStatus) rankingStatus.string = service.leaderboardText;
      render();
    });
    makeButton(panel, codes.length ? '上一级' : '返回我的', new Vec3(-142, -452),
      258, 72, '#B88261', () => {
        this.dismissPlayerMenu('RegionOverlay');
        if (codes.length) this.showRegionPicker(codes.slice(0, -1), leaderboard);
        else this.showPlayerProfile();
      });
    makeButton(panel, '取消', new Vec3(142, -452), 258, 72, '#B88261', () => {
      this.dismissPlayerMenu('RegionOverlay'); this.showPlayerProfile();
    });
  }

  private showRegionConfirmation(path: string[], names: string[], previous: string[], query: string): void {
    const panel = this.makePlayerMenu('RegionConfirmOverlay', 650);
    if (!panel) return;
    const back = (): void => this.showRegionPicker(previous, false, query);
    this.menuReturnActions.set('RegionConfirmOverlay', back);
    makePanelHeading(panel, '确认小馆所在地', 225, 460);
    makeBodyLabel(panel, names.join(' / '), 30, '#775145', new Vec3(0, 78), 530, 100, true);
    makeBodyLabel(panel, '保存后用于地区归属和排行榜展示', 24, '#94735D',
      new Vec3(0, -15), 530, 48, true);
    makeButton(panel, '确认保存', new Vec3(0, -118), 530, 78, '#A3613B', () => {
      this.playerService!.setRegion(path);
      this.dismissPlayerMenu('RegionConfirmOverlay');
      this.showPlayerProfile();
      this.showToast('地区已保存', '#477345');
    });
    makeButton(panel, '再选一下', new Vec3(0, -221), 530, 74, '#B88261', () => {
      this.dismissPlayerMenu('RegionConfirmOverlay'); back();
    });
  }

  /**
   * 显示本机与云端存档的冲突选项。
   */
  protected showSaveConflict(): void {
    const service = this.playerService!;
    if (!service?.remote) {
      return;
    }
    const panel = this.makePlayerMenu('CloudConflictOverlay', 650);
    if (!panel) {
      return;
    }
    const reviewLayout = getPageTheme().id === 8;
    const describe =
      /**
       * 处理 describe 对应的游戏逻辑。
       */ (save: GameSave | null): string =>
        save
          ? '第' +
            String(save.levelIndex + 1) +
            '关 · ' +
            String(save.removedIds.length) +
            '张已拿取 · ' +
            String(
              save.status === 'playing'
                ? '进行中'
                : save.status === 'won'
                  ? '已通关'
                  : '托盘已满',
            ) +
            ''
          : '没有进行中的对局';
    if (reviewLayout) makePanelHeading(panel, '发现两份不同进度', 227, 420);
    else makeLabel(panel, '发现两份不同进度', 40, '#8D3426',
      new Vec3(0, 253), 580, 60);
    makeBodyLabel(
      panel,
      reviewLayout ? '另一台设备已有进度，请选择要保留的一份'
        : '另一台设备已保存新进度，请选择要保留的一份',
      24,
      '#94735D',
      new Vec3(0, reviewLayout ? 145 : 177),
      reviewLayout ? 522 : 590,
      64,
      true,
    );
    makeBodyLabel(
      panel,
      '本机：' +
        String(describe(service.state.save)) +
        '\n云端：' +
        String(describe(service.remote.state.save)) +
        '',
      26,
      '#775145',
      new Vec3(0, reviewLayout ? 53 : 73),
      reviewLayout ? 522 : 580,
      reviewLayout ? 96 : 114,
      true,
    );
    makeBodyLabel(
      panel,
      '所选版本会同时保留该版本的地区资料',
      22,
      '#AE5A3E',
      new Vec3(0, reviewLayout ? -30 : -24),
      reviewLayout ? 522 : 590,
      reviewLayout ? 38 : 40,
    );
    makeButton(
      panel,
      '使用云端进度',
      new Vec3(0, -104),
      400,
      66,
      '#D75542',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        const state = service.resolveConflict(true);
        this.dismissPlayerMenu('CloudConflictOverlay');
        if (state.save) {
          this.restoreGame(state.save);
        } else {
          this.loadLevel(0);
        }
      },
    );
    makeButton(
      panel,
      '保留本机进度',
      new Vec3(0, -188),
      400,
      66,
      '#A3613B',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        const state = service.resolveConflict(false);
        this.dismissPlayerMenu('CloudConflictOverlay');
        if (state.save) {
          this.restoreGame(state.save);
        } else {
          this.loadLevel(0);
        }
        void service.flush();
      },
    );
    makeButton(
      panel,
      '稍后决定',
      new Vec3(0, -272),
      290,
      54,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.dismissPlayerMenu('CloudConflictOverlay'),
    );
  }

  /**
   * 绘制失败弹窗中的操作区域。
   */
  protected drawFailurePanel(panel: Node): void {
    drawLacquerPanel(panel, 600, 860);
    makePanelHeading(panel, '托盘满啦', 330);
    const failureClose = makeButton(panel, '×', new Vec3(250, 352), 48, 48, '#B88261',
      () => this.dismissOverlay());
    drawCloseButton(failureClose);
    makeLabel(panel, this.reviveUsed ? '本局免费复活已使用' : '别急，这锅还有机会',
      27, '#94735D', new Vec3(0, 249), 500, 44);
    const types = this.tray.slice(0, 3);
    types.forEach((type, index) => {
      const card = new Node('RevivePreview_' + index);
      panel.addChild(card);
      card.setPosition((index - 1) * 142, 104);
      drawRoundRect(card, 124, 136, 18, getPageTheme().card,
        getPageTheme().line, 1);
      this.addIngredientImage(card, type, false, 104, 102);
    });
    makeLabel(panel, this.reviveUsed
      ? '本局无法再次复活\n重开后，图鉴和成就会保留'
      : '将托盘前三张移入暂存区\n腾出三格，继续把这一锅捞完',
      25, '#775145', new Vec3(0, -62), 510, 100, true);
    const revive = makeButton(panel,
      this.reviveUsed ? '免费复活已用完' : '免费复活，继续捞',
      new Vec3(0, -200), 510, 80, '#A3613B', () => this.revive());
    setButtonEnabled(revive, !this.reviveUsed);
    makeButton(panel, '重新开始', new Vec3(0, -308), 510, 78,
      this.reviveUsed ? '#A3613B' : '#B88261', () => this.showRestartConfirmation());
    makeLabel(panel, '寄存食材可点击取回，重开后恢复一次免费复活',
      20, '#94735D', new Vec3(0, -382), 530, 35);
  }

  /**
   * 重新开始当前关卡。
   */
  protected restartLevel(): void {
    this.loadLevel(this.levelIndex);
  }

  /**
   * 进入下一关。
   */
  protected nextLevel(): void {
    this.loadLevel((this.levelIndex + 1) % LEVELS.length);
  }
}
