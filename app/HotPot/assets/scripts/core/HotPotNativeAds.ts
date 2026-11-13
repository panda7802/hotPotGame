import {game, Game, Node, ScrollView, UITransform, view} from 'cc';
import {HotPotCashout} from './HotPotCashout';
import {
  DesignPageLayout, designSurface, fitDesignPage,
} from './HotPotDesignUi';
import {referenceArea} from './HotPotReferenceLayout';
import {transform} from './HotPotUi';
import {
  NativeAdBounds, WechatNativeAdService,
} from './WechatNativeAdService';

type AdPageKind = 'settings' | 'ranking' | 'collection';
type AdPanel = Node & {
  layoutNativeAd?: (layout: DesignPageLayout) => void;
};

/** Keeps native overlays aligned with the themed secondary-page footer. */
export abstract class HotPotNativeAds extends HotPotCashout {
  private readonly nativeAd = new WechatNativeAdService();
  private adPage?: {panel: AdPanel; kind: AdPageKind};
  private adBounds?: NativeAdBounds;
  private adInBackground = false;

  onEnable(): void {
    super.onEnable();
    if (this.nativeAd.supported) {
      this.nativeAd.prepare(this.nativeAdWindow().adWidth);
    }
    game.on(Game.EVENT_HIDE, this.suspendNativeAd, this);
    game.on(Game.EVENT_SHOW, this.resumeNativeAd, this);
    this.resumeNativeAd();
  }

  onDisable(): void {
    this.suspendNativeAd();
    game.off(Game.EVENT_HIDE, this.suspendNativeAd, this);
    game.off(Game.EVENT_SHOW, this.resumeNativeAd, this);
    super.onDisable();
  }

  onDestroy(): void {
    this.clearNativeAd();
    this.nativeAd.dispose();
    game.off(Game.EVENT_HIDE, this.suspendNativeAd, this);
    game.off(Game.EVENT_SHOW, this.resumeNativeAd, this);
    super.onDestroy();
  }

  protected showPlayerProfile(): void {
    const alreadyOpen = this.node.getChildByName('PlayerOverlay');
    super.showPlayerProfile();
    if (!alreadyOpen) {
      this.attachNativeAd('PlayerOverlay', 'settings');
    }
  }

  protected showDesignRanking(scope = 0): void {
    const alreadyOpen = this.node.getChildByName('RegionOverlay');
    super.showDesignRanking(scope);
    if (!alreadyOpen) {
      this.attachNativeAd('RegionOverlay', 'ranking');
    }
  }

  protected showCollection(
    ...args: Parameters<HotPotCashout['showCollection']>
  ): void {
    const alreadyOpen = this.node.getChildByName('CollectionOverlay');
    super.showCollection(...args);
    if (!alreadyOpen && (!args[0] || args[0] === 'ingredients')) {
      this.attachNativeAd('CollectionOverlay', 'collection');
    }
  }

  protected dismissPlayerMenu(name: string): void {
    if (this.adPage?.panel.parent?.name === name) {
      this.clearNativeAd();
    }
    super.dismissPlayerMenu(name);
  }

  private attachNativeAd(name: string, kind: AdPageKind): void {
    const overlay = this.node.getChildByName(name);
    const panel = overlay?.getChildByName('PlayerPanel') as AdPanel;
    if (!panel || this.adPage?.panel === panel || !this.nativeAd.supported) {
      return;
    }
    this.clearNativeAd();
    this.adPage = {panel, kind};
    const slot = new Node('NativeAdSlot');
    panel.addChild(slot);
    transform(slot, 1, 1);
    panel.layoutNativeAd = layout => this.layoutNativeAd(panel, kind, layout);
    overlay!.on(Node.EventType.PARENT_CHANGED, () => {
      if (!overlay!.parent && this.adPage?.panel === panel) {
        this.clearNativeAd();
      }
    });
    fitDesignPage(panel);
    this.showNativeAd();
  }

  private layoutNativeAd(
    panel: AdPanel, kind: AdPageKind, layout: DesignPageLayout,
  ): void {
    const {area, window, safeWidth, adWidth: width} = this.nativeAdWindow();
    const units = 720 / window.width;
    const size = this.nativeAd.size(width);
    const gap = 12 * units;
    const height = size.height * units;
    const slotTop = layout.footerTop - gap - height;
    const bodyHeight = slotTop - gap - layout.bodyTop;
    const minimumBodyHeight = kind === 'ranking' ? 462 : 350;
    if (!(width > 0) || size.width > safeWidth
      || bodyHeight < minimumBodyHeight) {
      this.clearNativeAd(true);
      return;
    }
    const body = panel.getChildByName('DesignBody')!;
    body.setScale(1, 1, 1);
    body.setPosition(0, layout.height / 2 - layout.bodyTop - 416);
    if (kind === 'settings') {
      const scale = Math.min(1, bodyHeight / 506);
      body.setScale(scale, scale, 1);
      body.setPosition(0,
        layout.height / 2 - layout.bodyTop - bodyHeight / 2 - 13 * scale);
    } else if (kind === 'ranking') {
      this.layoutAdRanking(body, bodyHeight);
    } else {
      this.layoutAdCollection(body, bodyHeight);
    }
    const slot = panel.getChildByName('NativeAdSlot')!;
    const left = (area.left - area.right) / area.width * 360
      + (720 - size.width * units) / 2;
    this.placeAdNode(slot, left, slotTop, size.width * units, height);
    const box = slot.getComponent(UITransform)!.getBoundingBoxToWorld();
    const visible = view.getVisibleSize();
    const origin = view.getVisibleOrigin();
    this.adBounds = {
      left: (box.x - origin.x) / visible.width * window.width,
      top: (1 - (box.y + box.height - origin.y) / visible.height)
        * window.height,
      width,
    };
    if (!this.adInBackground) {
      this.nativeAd.position(this.adBounds);
    }
  }

  private nativeAdWindow() {
    const area = referenceArea();
    const window = this.nativeAd.windowSize(view.getFrameSize());
    const safeWidth = window.width
      * (area.width - area.left - area.right) / area.width;
    return {area, window, safeWidth,
      adWidth: Math.floor(Math.min(350, safeWidth - 40))};
  }

  private layoutAdRanking(body: Node, available: number): void {
    const table = body.getChildByName('RankingRows')!;
    const height = available - 328;
    const headerShift = (height - table.getComponent(UITransform)!.height) / 2;
    for (const label of table.children) {
      if (label.name.startsWith('Text_')) {
        label.setPosition(label.position.x, label.position.y + headerShift);
      }
    }
    this.placeAdNode(table, 40, 170, 640, height);
    designSurface(table);
    const viewport = table.getChildByName('RankingViewport');
    if (viewport) {
      this.resizeAdScroll(viewport, 8, 62, 624, height - 70);
      this.layoutEmptyRanking(viewport, height - 70);
    }
    this.placeAdNode(body.getChildByName('MyRegionRank')!,
      40, 190 + height, 640, 138);
  }

  private layoutEmptyRanking(viewport: Node, height: number): void {
    const content = viewport.getComponent(ScrollView)!.content!;
    const empty = content.getChildByName('EmptyRanking');
    if (!empty) {
      return;
    }
    transform(content, 624, height);
    content.setPosition(0, height / 2);
    this.placeAdNode(empty, 0, 0, 624, height);
    const [icon, title, description] = empty.children;
    icon.active = height >= 330;
    description.active = height >= 120;
    const titleTop = icon.active ? 190
      : (height - (description.active ? 106 : 60)) / 2;
    this.placeAdNode(title, 50, titleTop, 524, 60);
    this.placeAdNode(description, 40, icon.active ? 266 : titleTop + 52,
      544, icon.active ? 64 : 54);
    this.placeAdNode(icon, 268, 100, 88, 88);
  }

  private layoutAdCollection(body: Node, available: number): void {
    const viewport = body.getChildByName('CollectionViewport')!;
    const height = Math.max(72, available - 234);
    this.resizeAdScroll(viewport, 40, 194, 640, height);
    const hint = body.children.find(node =>
      node.name.startsWith('Text_向上滑动'));
    if (hint) {
      this.placeAdNode(hint, 80, 198 + height, 560, 28);
    }
  }

  private resizeAdScroll(
    viewport: Node, x: number, y: number, width: number, height: number,
  ): void {
    const scroll = viewport.getComponent(ScrollView)!;
    const content = scroll.content!;
    const offset = scroll.getScrollOffset().y;
    this.placeAdNode(viewport, x, y, width, height);
    const contentHeight = content.getComponent(UITransform)!.height;
    const clamped = Math.max(0, Math.min(offset, contentHeight - height));
    content.setPosition(0, height / 2 + clamped);
  }

  private placeAdNode(
    node: Node, x: number, y: number, width: number, height: number,
  ): void {
    const parent = node.parent!.getComponent(UITransform)!;
    transform(node, width, height);
    node.setPosition(x + width / 2 - parent.width * parent.anchorX,
      parent.height * (1 - parent.anchorY) - y - height / 2);
  }

  private showNativeAd(): void {
    const page = this.adPage;
    if (!page || !this.adBounds || this.adInBackground) {
      return;
    }
    this.nativeAd.show(this.adBounds, reason => {
      if (this.adPage !== page || !page.panel.isValid) {
        return;
      }
      if (reason === 'resize') {
        fitDesignPage(page.panel);
      } else {
        this.clearNativeAd(true);
      }
    });
  }

  private suspendNativeAd(): void {
    this.adInBackground = true;
    this.nativeAd.dispose();
  }

  private resumeNativeAd(): void {
    this.adInBackground = false;
    if (this.adPage?.panel.isValid && this.enabledInHierarchy) {
      fitDesignPage(this.adPage.panel);
      this.showNativeAd();
    }
  }

  private clearNativeAd(restoreLayout = false): void {
    const page = this.adPage;
    this.adPage = undefined;
    this.adBounds = undefined;
    if (page) {
      this.nativeAd.dispose();
    }
    if (page?.panel.isValid) {
      const {panel, kind} = page;
      panel.layoutNativeAd = undefined;
      const slot = panel.getChildByName('NativeAdSlot');
      slot?.removeFromParent();
      slot?.destroy();
      if (restoreLayout) {
        const body = panel.getChildByName('DesignBody')!;
        if (kind === 'ranking') {
          this.layoutAdRanking(body, 820);
        } else if (kind === 'collection') {
          this.layoutAdCollection(body, 836);
        }
        fitDesignPage(panel);
      }
    }
  }
}
