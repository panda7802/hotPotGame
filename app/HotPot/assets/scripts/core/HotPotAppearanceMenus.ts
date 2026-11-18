import {Node, resources, Sprite, SpriteFrame, Texture2D, Vec3} from 'cc';
import {getPageTheme, PAGE_THEMES, PageStyle, PageTheme} from '../data/PageTheme';
import {
  drawRoundRect, makeButton, makeBodyLabel, makePanelHeading, transform,
} from './HotPotUi';
import {HotPotTools} from './HotPotTools';

/** Four approved skins live inside My; no game state is recreated. */
export abstract class HotPotAppearanceMenus extends HotPotTools {
  private styleOriginal: PageStyle | null = null;

  protected cancelPageStyle(): void {
    this.discardPageStylePreview();
    this.dismissPlayerMenu('StyleOverlay');
    this.showPlayerProfile();
  }

  protected discardPageStylePreview(): void {
    if (this.styleOriginal !== null) this.previewPageStyle(this.styleOriginal);
    this.styleOriginal = null;
  }

  protected showPageStyles(): void {
    const panel = this.makePlayerMenu('StyleOverlay', 1040);
    if (!panel) {
      return;
    }
    makePanelHeading(panel, '页面风格', 420, 420);
    if (this.styleOriginal === null) this.styleOriginal = getPageTheme().id;
    makeBodyLabel(panel, '点选预览 · 确认后应用 · 保留当前这锅',
      21, '#94735D', new Vec3(0, 353), getPageTheme().id === 8 ? 526 : 540, 38);
    const current = getPageTheme();
    PAGE_THEMES.forEach((theme, index) => {
      const selected = theme.id === current.id;
      const card = makeButton(panel, '',
        new Vec3(index % 2 ? 138 : -138, index < 2 ? 180 : -106),
        250, 264, current.panel, () => {
          this.previewPageStyle(theme.id);
          this.dismissPlayerMenu('StyleOverlay');
          this.showPageStyles();
        });
      card.name = `PageStyle_${theme.id}`;
      drawRoundRect(card, 250, 264, 18,
        current.card, selected ? current.edge : current.line, selected ? 4 : 1.5);
      const picture = new Node('StyleThumbnail');
      card.addChild(picture);
      picture.setPosition(-66, 16);
      drawRoundRect(picture, 84, 178, 7, theme.accent);
      this.loadStyleThumbnail(picture, theme);
      makeBodyLabel(card, theme.name, 23, current.ink,
        new Vec3(55, 53), 100, 40, true).isBold = true;
      makeBodyLabel(card, theme.caption.replace(' · ', '\n'),
        18, '#806C57', new Vec3(55, -6), 100, 56, true);
      makeBodyLabel(card, selected ? '✓ 已选中' : '点击预览',
        21, current.ink, new Vec3(0, -96), 210, 28);
    });
    makeBodyLabel(panel, `预览：${current.name}`,
      25, current.ink, new Vec3(0, -276), 510, 42);
    makeBodyLabel(panel, '食材共享，牌框与界面随风格切换',
      21, '#94735D', new Vec3(0, -318), current.id === 8 ? 510 : 530, 32, true);
    makeButton(panel, '应用所选风格', new Vec3(0, -382),
      510, 70, '#A3613B', () => {
        this.selectPageStyle(getPageTheme().id);
        this.styleOriginal = null;
        this.dismissPlayerMenu('StyleOverlay');
        this.showPlayerProfile();
      });
    makeButton(panel, '返回我的', new Vec3(0, -464),
      510, 66, '#B88261', () => {
        this.cancelPageStyle();
      });
  }

  private loadStyleThumbnail(node: Node, theme: PageTheme): void {
    if (!resources?.load) {
      return;
    }
    resources.load(theme.thumbnail + '/texture', Texture2D,
      (error, texture) => {
        if (error || !texture || !node.isValid) {
          return;
        }
        const frame = new SpriteFrame();
        frame.texture = texture;
        const image = new Node('Artwork');
        node.addChild(image);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        transform(image, 84, 178);
        sprite.spriteFrame = frame;
        node.on(Node.EventType.NODE_DESTROYED, () => frame.destroy());
      });
  }

  protected abstract makePlayerMenu(
    name: string, height: number,
  ): Node | null;
  protected abstract dismissPlayerMenu(name: string): void;
}
