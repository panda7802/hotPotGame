import {_decorator, Graphics, Label, Mask, Node, ScrollView, Vec3} from 'cc';

import {LEVELS} from '../data/GameData';

import {GameSave} from '../data/PlayerData';

import {
  drawLacquerPanel,
  drawRoundRect,
  hex,
  makeButton,
  makeLabel,
  makePanelHeading,
  transform,
} from './HotPotUi';

import {HotPotDialogs} from './HotPotDialogs';

const {ccclass} = _decorator;

/**
 * 火锅游戏场景组件：调试入口、地区选择与结算弹窗。
 */
@ccclass('HotPotGame')
export class HotPotGame extends HotPotDialogs {
  /**
   * 逐级显示可选择的地区。
   */
  protected showRegionPicker(codes: string[]): void {
    if (!this.scrollComponentsReady()) {
      return;
    }
    const panel = this.makePlayerMenu('RegionOverlay', 1040);
    if (!panel) {
      return;
    }
    const service = this.playerService!;
    let options = service.regions;
    const names: string[] = [];
    for (const code of codes) {
      const selected = options.find(
        /**
         * 按条件筛选或判断条目：item.code === code。
         */ (item) => item.code === code,
      )!;
      names.push(selected.name);
      options = selected.children || [];
    }
    const title = makeLabel(
      panel,
      '选择地区',
      46,
      '#8D3426',
      new Vec3(0, 437),
      580,
      70,
    );
    if (this.regionFont) {
      title.font = this.regionFont;
      title.useSystemFont = false;
    }
    makeLabel(
      panel,
      names.length ? names.join(' / ') : '请选择省份或海外',
      25,
      '#775145',
      new Vec3(0, 367),
      590,
      50,
      true,
    );

    // 独立裁剪窗口：滚动只移动地区卡片，标题和底部操作始终可见。
    const viewport = new Node('RegionViewport');
    panel.addChild(viewport);
    viewport.setPosition(0, -5);
    transform(viewport, 584, 616);
    viewport.addComponent(Mask);
    const content = new Node('RegionContent');
    viewport.addChild(content);
    const contentTransform = transform(
      content,
      584,
      Math.max(616, options.length * 92 + 8),
    );
    contentTransform.setAnchorPoint(0.5, 1);
    content.setPosition(0, 308);
    const scroll = viewport.addComponent(ScrollView);
    scroll.content = content;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.inertia = true;
    scroll.elastic = false;
    // 拖动会取消卡片触摸，松手时不会误选滑过的城市。
    scroll.cancelInnerEvents = true;
    const currentCodes = service.state.profile.regionCodes;
    options.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (region, index) => {
        const selected =
          codes.every(
            /**
             * 按条件筛选或判断条目：currentCodes[i] === code。
             */ (code, i) => currentCodes[i] === code,
          ) && currentCodes[codes.length] === region.code;
        const button = makeButton(
          content,
          region.name,
          new Vec3(0, -48 - index * 92),
          548,
          76,
          selected ? '#F6C887' : '#F3E2CA',
          /**
           * 在当前操作完成后更新相关游戏状态。
           */ () => {
            const next = [...codes, region.code];
            if (region.children?.length) {
              this.dismissPlayerMenu('RegionOverlay');
              this.showRegionPicker(next);
            } else {
              service.setRegion(next);
              this.dismissPlayerMenu('RegionOverlay');
              this.showPlayerProfile();
            }
          },
        );
        const label = button.getChildByName('Label')!.getComponent(Label)!;
        transform(label.node, 438, 62);
        label.fontSize = 35;
        label.lineHeight = 46;
        label.color = hex('#744329');
        if (this.regionFont) {
          label.font = this.regionFont;
          label.useSystemFont = false;
        }
        if (region.children?.length) {
          const arrow = new Node('RegionArrow');
          button.addChild(arrow);
          const g = arrow.addComponent(Graphics);
          g.strokeColor = hex('#AD7950');
          g.lineWidth = 4;
          g.moveTo(234, 8);
          g.lineTo(242, 0);
          g.lineTo(234, -8);
          g.stroke();
        }
      },
    );
    makeLabel(
      panel,
      options.length * 92 + 8 > 616
        ? '上下滑动，找到你的地域'
        : '点选地区，记录小馆所在地',
      23,
      '#94735D',
      new Vec3(0, -359),
      580,
      42,
    );
    makeButton(
      panel,
      codes.length ? '上一级' : '返回档案',
      new Vec3(-150, -445),
      230,
      64,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissPlayerMenu('RegionOverlay');
        if (codes.length) {
          this.showRegionPicker(codes.slice(0, -1));
        } else {
          this.showPlayerProfile();
        }
      },
    );
    makeButton(
      panel,
      '取消',
      new Vec3(150, -445),
      230,
      64,
      '#B88261',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => {
        this.dismissPlayerMenu('RegionOverlay');
        this.showPlayerProfile();
      },
    );
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
    makeLabel(
      panel,
      '发现两份不同进度',
      40,
      '#8D3426',
      new Vec3(0, 253),
      580,
      60,
    );
    makeLabel(
      panel,
      '另一台设备已保存新进度，请选择要保留的一份',
      24,
      '#94735D',
      new Vec3(0, 177),
      590,
      64,
      true,
    );
    makeLabel(
      panel,
      '本机：' +
        String(describe(service.state.save)) +
        '\n云端：' +
        String(describe(service.remote.state.save)) +
        '',
      26,
      '#775145',
      new Vec3(0, 73),
      580,
      114,
      true,
    );
    makeLabel(
      panel,
      '所选版本会同时保留该版本的地区资料',
      22,
      '#AE5A3E',
      new Vec3(0, -24),
      590,
      40,
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
    drawLacquerPanel(panel, 600, 920);
    const close = makeButton(
      panel,
      '×',
      new Vec3(250, 406),
      48,
      48,
      '#EAD8BD',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => this.dismissOverlay(),
    );
    close.getChildByName('Label')!.getComponent(Label)!.color = hex('#805B43');

    makePanelHeading(panel, '托盘满啦', 335);
    makeLabel(
      panel,
      this.levelIndex === 2
        ? '重试第三关会生成新牌阵'
        : this.reviveUsed
          ? '换个拿取顺序，再开一锅！'
          : '别急，这锅还有机会！',
      25,
      '#957158',
      new Vec3(0, 273),
      470,
      38,
    );
    this.addModalEmblem(panel, false, new Vec3(0, 121), 244);

    const tip = new Node('ReviveExplanation');
    panel.addChild(tip);
    tip.setPosition(0, -66);
    drawRoundRect(tip, 476, 110, 18, '#F3E5CE');
    makeLabel(
      tip,
      this.reviveUsed ? '本局免费复活已使用' : '免费复活 · 本局还可用 1 次',
      25,
      '#8B4B30',
      new Vec3(0, 23),
      444,
      36,
    );
    makeLabel(
      tip,
      this.reviveUsed
        ? '优先凑齐三张，给托盘留出空位'
        : '暂存前三张食材，腾出三格继续捞',
      22,
      '#927059',
      new Vec3(0, -23),
      444,
      34,
    );

    makeButton(
      panel,
      this.reviveUsed
        ? this.levelIndex === 2
          ? '重试第三关'
          : '再开一锅'
        : '免费复活，继续捞',
      new Vec3(0, -198),
      466,
      80,
      '#C94E35',
      /**
       * 在当前操作完成后更新相关游戏状态。
       */ () => (this.reviveUsed ? this.restartLevel() : this.revive()),
    );
    if (!this.reviveUsed) {
      const restart = makeButton(
        panel,
        this.levelIndex === 2 ? '重试第三关' : '重新开始',
        new Vec3(0, -295),
        466,
        66,
        '#EAD8BD',
        /**
         * 在当前操作完成后更新相关游戏状态。
         */ () => this.restartLevel(),
      );
      restart.getChildByName('Label')!.getComponent(Label)!.color =
        hex('#805B43');
    }
    makeLabel(
      panel,
      this.reviveUsed
        ? '重新开始后，可再次获得一次免费复活'
        : '寄存食材可随时点击取回',
      21,
      '#94735D',
      new Vec3(0, -381),
      490,
      38,
    );
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
    if (this.levelIndex < LEVELS.length - 1) {
      this.loadLevel(this.levelIndex + 1);
    } else {
      this.showToast('已经是最后一关', '#8A4B34');
    }
  }
}
