import {
  _decorator,
  BlockInputEvents,
  Graphics,
  Mask,
  Node,
  Rect,
  resources,
  ScrollView,
  Sprite,
  SpriteFrame,
  Texture2D,
  Vec3,
} from 'cc';

import {INGREDIENTS, IngredientType,} from '../data/GameData';

import {GameSave, regionPath,} from '../data/PlayerData';

import {achievementEntries, INGREDIENT_STORIES,} from '../data/CollectionData';

import {
  DESIGN_WIDTH,
  drawLacquerPanel,
  drawRoundRect,
  hex,
  makeButton,
  makeLabel,
  makePanelHeading,
  transform,
} from './HotPotUi';

import {HotPotTools} from './HotPotTools';

/**
 * 玩家档案、云存档选择和图鉴菜单。
 */
export abstract class HotPotPlayerMenus extends HotPotTools {

  /**
   * 关闭指定的玩家菜单。
   */
  protected dismissPlayerMenu(name: string): void {
    const overlay = this.node.getChildByName(name);
    overlay?.removeFromParent();
    overlay?.destroy();
    this.playerStatusLabel = null;
    this.playerSaveLabel = null;
  }

  /**
   * 创建通用玩家菜单面板。
   */
  protected makePlayerMenu(name: string, height: number): Node | null {
    if (!this.playerService || !this.levelData || this.hasPlayerMenu() || (this.locked && !this.gameEnded)) return null;
    const overlay = new Node(name);
    this.node.addChild(overlay);
    transform(overlay, DESIGN_WIDTH, this.viewportHeight);
    const scrim = new Node('ModalScrim');
    overlay.addChild(scrim);
    drawRoundRect(scrim, DESIGN_WIDTH, this.viewportHeight, 0, '#29150FAA');
    overlay.addComponent(BlockInputEvents);
    const panel = new Node('PlayerPanel');
    overlay.addChild(panel);
    drawLacquerPanel(panel, 650, height);
    const close = makeButton(panel, '×', new Vec3(280, height / 2 - 43), 44, 44, '#B88261', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => {
      if (name === 'PlayerOverlay' && this.playerService?.status === 'connecting') return;
      this.dismissPlayerMenu(name);
    });
    close.name = 'MenuClose';
    return panel;
  }

  /**
   * 为弹窗加载胜利或失败徽章。
   */
  protected addModalEmblem(panel: Node, won: boolean, position: Vec3, size: number): void {
    const emblem = new Node(won ? 'SuccessEmblem' : 'FailureEmblem');
    panel.addChild(emblem);
    emblem.setPosition(position);
    transform(emblem, size, size);
    const fallback = makeLabel(emblem, won ? '开席' : '满锅', 46, '#A3613B', Vec3.ZERO, size, 80);
    if (!resources?.load) return;
    resources.load('backgrounds/modal-emblems-c/texture', Texture2D, /**
     * 在资源加载完成后更新有效节点或处理失败。
     */(error, texture) => {
      if (!emblem.isValid || error || !texture) return;
      const cell = Math.round(texture.width / 2);
      const frame = new SpriteFrame();
      frame.texture = texture;
      frame.rect = new Rect(won ? 0 : cell, 0, won ? cell : texture.width - cell, texture.height);
      const sprite = emblem.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      fallback.node.active = false;
    });
  }

  /**
   * 生成当前玩家存档的摘要文字。
   */
  protected playerSaveText(): string {
    const service = this.playerService!;
    const save = service.state.save;
    return save ? `第${save.levelIndex + 1}关 · ${save.removedIds.length}张已拿取 · 云版本${service.revision}` : '还没有存档';
  }

  /**
   * 展示玩家档案、地区和同步状态。
   */
  protected showPlayerProfile(): void {
    const panel = this.makePlayerMenu('PlayerOverlay', 970);
    if (!panel) return;
    const service = this.playerService!;
    makePanelHeading(panel, '我的小馆档案', 387, 470);
    const card = /**
     * 处理 card 对应的游戏逻辑。
     */(name: string, y: number, height: number): void => {
      const node = new Node(name);
      panel.addChild(node);
      node.setPosition(0, y);
      drawRoundRect(node, 556, height, 16, '#F5E4C7', '#DEC498', 1.5);
    };
    card('IdentityCard', 284, 96);
    card('RegionCard', 153, 132);
    card('SaveCard', -12, 158);
    makeLabel(panel, service.playerId ? `玩家编号 ${service.playerId.slice(0, 8)} · 开发版` : '本机玩家 · 开发版',
      26, '#775145', new Vec3(0, 284), 520, 42);
    const path = regionPath(service.regions, service.state.profile.regionCodes);
    makeLabel(panel, path.length ? path.map(/**
     * 将当前条目转换为后续处理所需的值。
     */item => item.name).join(' / ') : '地区尚未选择',
      25, '#775145', new Vec3(-65, 153), 350, 90, true);
    this.playerStatusLabel = makeLabel(panel, service.statusText, 24, '#547344', new Vec3(0, 23), 520, 42);
    this.playerSaveLabel = makeLabel(panel, this.playerSaveText(),
      23, '#94735D', new Vec3(0, -38), 510, 64, true);
    makeButton(panel, '选择地区', new Vec3(188, 153), 152, 58, '#A3613B', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => {
      if (service.status === 'connecting') return;
      this.dismissPlayerMenu('PlayerOverlay');
      this.showRegionPicker([]);
    });
    makeButton(panel, service.isConflict ? '选择保留哪份存档' : service.playerId ? '同步存档' : '连接云端',
      new Vec3(0, -168), 510, 70, '#D75542', /**
       * 在当前操作完成后更新相关游戏状态。
       */() => {
        if (service.isConflict) {
          this.dismissPlayerMenu('PlayerOverlay');
          this.showSaveConflict();
          return;
        }
        if (service.playerId) {
          void service.flush();
          return;
        }
        // 重新连接期间阻止重复点击。身份确认后再让玩家决定当前局与账号存档。
        if (service.status === 'connecting') return;
        void service.initialize().then(/**
         * 处理异步任务完成或失败后的状态。
         */() => {
          if (!this.node.isValid || !service.playerId) return;
          this.dismissPlayerMenu('PlayerOverlay');
          if (service.beginDailySession()) {
            this.loadLevel(0);
            this.showPlayerProfile();
            return;
          }
          const saved = service.state.save;
          if (saved) this.showConnectedSaveChoice(saved);
          else {
            this.loadLevel(0);
            this.showPlayerProfile();
          }
        });
      });
    makeLabel(panel, '每次操作后自动保存\n断网时先保留在本机', 22, '#94735D', new Vec3(0, -266), 550, 70, true);
    makeButton(panel, '继续游戏', new Vec3(0, -380), 510, 66, '#B88261', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => {
      if (service.status === 'connecting') return;
      this.dismissPlayerMenu('PlayerOverlay');
    });
  }

  /**
   * 让玩家选择已连接云端时保留哪份对局。
   */
  protected showConnectedSaveChoice(saved: GameSave): void {
    const panel = this.makePlayerMenu('ConnectedSaveOverlay', 520);
    if (!panel) return;
    const service = this.playerService!;
    makeLabel(panel, '账号已连接', 42, '#8D3426', new Vec3(0, 181), 570, 60);
    makeLabel(panel, `账号存档：第${saved.levelIndex + 1}关 · ${saved.removedIds.length}张已拿取\n当前这锅：第${this.levelIndex + 1}关 · ${this.levelData.tiles.filter(/**
     * 按条件筛选或判断条目：tile.removed。
     */tile => tile.removed).length}张已拿取`,
      26, '#775145', new Vec3(0, 81), 590, 110, true);
    makeLabel(panel, '选择要继续的进度，当前本机记录仍单独保留', 22, '#94735D', new Vec3(0, -13), 590, 48, true);
    const finish = /**
     * 处理 finish 对应的游戏逻辑。
     */(): void => {
      if (service.isConflict) this.showSaveConflict(); else this.showPlayerProfile();
    };
    makeButton(panel, '继续账号存档', new Vec3(0, -99), 400, 66, '#D75542', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => {
      this.dismissPlayerMenu('ConnectedSaveOverlay');
      this.restoreGame(saved);
      finish();
    });
    makeButton(panel, '将当前这锅保存到账号', new Vec3(0, -186), 450, 66, '#A3613B', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => {
      this.dismissPlayerMenu('ConnectedSaveOverlay');
      this.checkpointGame();
      finish();
    });
  }

  /**
   * 为图鉴创建可裁剪的滚动区域。
   */
  protected makeCollectionScroll(panel: Node, height: number): Node {
    const viewport = new Node('CollectionViewport');
    panel.addChild(viewport);
    transform(viewport, 584, 618);
    viewport.addComponent(Mask);
    const content = new Node('CollectionContent');
    viewport.addChild(content);
    transform(content, 584, Math.max(618, height)).setAnchorPoint(0.5, 1);
    content.setPosition(0, 309);
    const scroll = viewport.addComponent(ScrollView);
    scroll.content = content;
    scroll.horizontal = false;
    scroll.vertical = true;
    scroll.elastic = false;
    scroll.inertia = true;
    scroll.cancelInnerEvents = true;
    return content;
  }

  /**
   * 确认图鉴所需的滚动组件可用。
   */
  protected scrollComponentsReady(): boolean {
    if (Mask && ScrollView) return true;
    console.warn('[HotPot UI] Missing scroll components: enable Mask/UI and restart the editor preview.');
    this.showToast('列表暂未就绪，请重新进入游戏', '#A24A3C');
    return false;
  }

  /**
   * 显示食材图鉴或成就列表。
   */
  protected showCollection(tab: 'ingredients' | 'achievements' = 'ingredients',
                           entry = {headingTaps: 0, ingredientTaps: 0}): void {
    if (!this.scrollComponentsReady()) return;
    const panel = this.makePlayerMenu('CollectionOverlay', 1120);
    if (!panel) return;
    const state = this.playerService!.state;
    const achievements = achievementEntries(state);
    const unlocked = achievements.filter(/**
     * 按条件筛选或判断条目：item.unlocked。
     */item => item.unlocked).length;
    const discovered = state.progress.discovered;
    const heading = makePanelHeading(panel, '小馆珍藏', 485, 420);
    heading.isBold = true;
    heading.node.on(Node.EventType.TOUCH_END, /**
     * 响应节点触摸或游戏事件。
     */() => {
      entry.headingTaps = Math.min(6, entry.headingTaps + 1);
      entry.ingredientTaps = 0;
    });
    makeLabel(panel, `食材 ${discovered.length} / ${INGREDIENTS.length}  ·  成就 ${unlocked} / ${achievements.length}`,
      25, '#94735D', new Vec3(0, 425), 570, 42);
    const switchTab = /**
     * 处理 switchTab 对应的游戏逻辑。
     */(next: 'ingredients' | 'achievements'): void => {
      if (next === 'ingredients' && entry.headingTaps === 6) {
        entry.ingredientTaps += 1;
        if (entry.ingredientTaps === 3) {
          this.dismissPlayerMenu('CollectionOverlay');
          this.showBackdoor();
          return;
        }
      } else {
        entry.headingTaps = 0;
        entry.ingredientTaps = 0;
      }
      if (next === tab) return;
      this.dismissPlayerMenu('CollectionOverlay');
      this.showCollection(next, entry);
    };
    makeButton(panel, '食材图鉴', new Vec3(-148, 360), 270, 60,
      tab === 'ingredients' ? '#D75542' : '#B88261', /**
       * 在当前操作完成后更新相关游戏状态。
       */() => switchTab('ingredients'));
    makeButton(panel, '我的成就', new Vec3(148, 360), 270, 60,
      tab === 'achievements' ? '#D75542' : '#B88261', /**
       * 在当前操作完成后更新相关游戏状态。
       */() => switchTab('achievements'));

    if (tab === 'ingredients') {
      const content = this.makeCollectionScroll(panel, Math.ceil(INGREDIENTS.length / 2) * 188 + 8);
      INGREDIENTS.forEach(/**
       * 依次处理集合中的每个条目。
       */(ingredient, index) => {
        const known = discovered.indexOf(ingredient.id) >= 0;
        const card = makeButton(content, '', new Vec3(index % 2 ? 145 : -145, -96 - Math.floor(index / 2) * 188),
          274, 172, known ? '#F8E8CD' : '#E9E0D0', /**
           * 在当前操作完成后更新相关游戏状态。
           */() => {
            this.dismissPlayerMenu('CollectionOverlay');
            this.showIngredientDetail(ingredient.id);
          });
        const icon = new Node('CollectionIngredient');
        card.addChild(icon);
        icon.setPosition(0, 27);
        if (known && this.ingredientFrames.has(ingredient.id)) this.addIngredientImage(icon, ingredient.id, false, 92, 88);
        else makeLabel(icon, known ? ingredient.name.slice(0, 1) : '?', 64,
          known ? ingredient.dark : '#B59C83', Vec3.ZERO, 100, 96);
        const name = makeLabel(card, known ? ingredient.name : '神秘食材', 26,
          known ? '#744329' : '#9D8B77', new Vec3(0, -35), 250, 34);
        name.isBold = known;
        makeLabel(card, known ? INGREDIENT_STORIES[ingredient.id].tag : '拿取一次即可点亮', 18,
          '#94735D', new Vec3(0, -67), 252, 26);
      });
    } else {
      const content = this.makeCollectionScroll(panel, achievements.length * 156 + 8);
      achievements.forEach(/**
       * 依次处理集合中的每个条目。
       */(item, index) => {
        const card = new Node(`Achievement_${item.id}`);
        content.addChild(card);
        card.setPosition(0, -80 - index * 156);
        drawRoundRect(card, 566, 140, 20, item.unlocked ? '#F6DFC0' : '#EEE7DC');
        const title = makeLabel(card, item.title, 29, item.unlocked ? '#8D3426' : '#806C57',
          new Vec3(-57, 40), 414, 42);
        title.isBold = true;
        makeLabel(card, item.unlocked ? '已达成' : '进行中', 21, item.unlocked ? '#477345' : '#A88A6C',
          new Vec3(216, 40), 100, 32);
        makeLabel(card, item.description, 22, '#94735D', new Vec3(0, -4), 520, 45, true);
        const bar = new Node('AchievementProgress');
        card.addChild(bar);
        bar.setPosition(-45, -46);
        drawRoundRect(bar, 390, 10, 5, '#D8C5AD');
        const g = bar.getComponent(Graphics)!;
        const filled = 390 * item.current / item.target;
        if (filled > 0) {
          g.fillColor = hex(item.unlocked ? '#80A16A' : '#D39457');
          g.roundRect(-195, -5, filled, 10, Math.min(5, filled / 2));
          g.fill();
        }
        makeLabel(card, `${item.current} / ${item.target}`, 21, '#806C57', new Vec3(218, -46), 104, 32);
      });
    }
    makeLabel(panel, tab === 'ingredients' ? '上下滑动浏览，点选食材查看小档案' : '上下滑动浏览，达成后永久记录',
      22, '#94735D', new Vec3(0, -356), 580, 40);
    this.playerStatusLabel = makeLabel(panel, this.playerService!.statusText,
      21, '#94735D', new Vec3(0, -407), 580, 42, true);
    makeButton(panel, '返回游戏', new Vec3(0, -485), 330, 66, '#B88261', /**
     * 在当前操作完成后更新相关游戏状态。
     */() => this.dismissPlayerMenu('CollectionOverlay'));
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
