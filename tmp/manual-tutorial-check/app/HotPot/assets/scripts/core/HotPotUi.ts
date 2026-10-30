import {
  Color,
  Graphics,
  Label,
  Node,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';

import {IngredientType} from '../data/GameData';
import {drawSharedTile} from './HotPotTileSkin';
import {getPageTheme} from '../data/PageTheme';

export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1520;
export const TILE_WIDTH = 92 * 1.2;
export const TILE_HEIGHT = 76 * 1.2;
export const TILE_IMAGE_WIDTH = 88 * 1.2;
export const TILE_IMAGE_HEIGHT = TILE_HEIGHT - 4;
export const EIGHT_ROW_TILE_SCALE = 0.82;
export const TRAY_IMAGE_WIDTH = 80;
export const TRAY_IMAGE_HEIGHT = 72;
export const TRAY_SPACING = 94;
export const TRAY_START_X = -3 * TRAY_SPACING;
export type GameAudio = 'bgm' | 'match' | 'win' | 'lose';
export const BGM_VOLUME = 0.45;
export const EFFECT_VOLUME = 0.5;
export type ToolType = 'undo' | 'bomb' | 'shuffle';
interface PageSkin {
  kind: 'button' | 'panel' | 'tavern' | 'heading' | 'close' | 'tile';
  width: number;
  height: number;
  tone?: 'red' | 'cream' | 'muted';
  style?: 'wood' | 'slot' | 'red' | 'cream' | 'title';
  emphasized?: boolean;
  blocked?: boolean;
}
type PageSkinNode = Node & {pageSkin?: PageSkin; uiTextColor?: string; pageDisabled?: boolean};

function rememberSkin(node: Node, skin: PageSkin): void {
  (node as PageSkinNode).pageSkin = skin;
}

/** Repaint materials in place; board nodes and animations are retained. */
export function refreshPageMaterials(root: Node): void {
  const skin = (root as PageSkinNode).pageSkin;
  const originalText = (root as PageSkinNode).uiTextColor;
  if (originalText) {
    const label = root.getComponent(Label);
    if (label) label.color = hex(themedTextColor(originalText));
  }
  if (skin?.kind === 'tile') {
    drawSharedTile(root, skin.width, skin.height, !!skin.blocked);
  } else if (skin?.kind === 'heading') {
    drawHeadingLine(root, skin.width);
  } else if (skin?.kind === 'close') {
    drawCloseButton(root);
  } else if (skin?.kind === 'button') {
    drawLacquerButton(root, skin.width, skin.height, skin.tone, skin.emphasized);
    const label = root.getChildByName('Label')?.getComponent(Label);
    if (label) {
      label.color = hex(skin.tone === 'red'
        ? getPageTheme().onAccent : getPageTheme().ink);
    }
    const toolName = root.getChildByName('ToolName')?.getComponent(Label);
    if (toolName) {
      toolName.color = hex(getPageTheme().onAccent);
    }
    const icon = root.getChildByName('ControlIcon');
    if (icon) {
      drawControlIcon(icon, skin.tone === 'red',
        label?.string.indexOf('关') === -1);
    }
  } else if (skin?.kind === 'panel') {
    drawLacquerPanel(root, skin.width, skin.height, skin.emphasized);
  } else if (skin?.kind === 'tavern') {
    drawTavernPanel(root, skin.width, skin.height, skin.style!);
  }
  root.children.slice().forEach((child) => refreshPageMaterials(child));
}
export const TOOL_NAMES: Record<ToolType, string> = {
  undo: '撤回',
  bomb: '炸',
  shuffle: '翻锅',
};
export const BOIL_STAGES = [
  '小火慢煮',
  '汤底渐热',
  '咕嘟冒泡',
  '香气四溢',
  '红汤翻滚',
  '热气腾腾',
  '满锅沸腾',
  '旺火盛宴',
  '收汁见底',
];
// 图集按从左到右、从上到下排列；独立于关卡食材顺序。
export const HANDPAINTED_TYPES: IngredientType[] = [
  'beef',
  'shrimp',
  'vegetable',
  'mushroom',
  'corn',
  'fish',
  'egg',
  'jzg',
  'meetball',
  'ou',
  'tomato',
  'toufu',
  'ydf',
];

/**
 * MoveSnapshot 的数据结构；字段说明见各成员。
 */
export interface MoveSnapshot {
  /**
   * 托盘中按顺序排列的食材。
   */
  tray: IngredientType[];
  /**
   * 暂存区中的食材。
   */
  reserve: IngredientType[];
  /**
   * removedIds 对应的状态或配置。
   */
  removedIds: string[];
}

/**
 * 将十六进制颜色转换为 Cocos Color。
 */
export function hex(value: string): Color {
  return new Color().fromHEX(value);
}

/**
 * 获取或添加 UITransform，并设置节点尺寸。
 */
export function transform(node: Node, width = 0, height = 0): UITransform {
  const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
  ui.setContentSize(width, height);
  return ui;
}

/**
 * 获取或添加透明度组件，并设置透明度。
 */
export function opacity(node: Node, value = 255): UIOpacity {
  const component =
    node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
  component.opacity = value;
  return component;
}

/** Legacy screen colors resolve to semantic theme roles, including dark mode. */
export function themedTextColor(color: string): string {
  const t = getPageTheme();
  const c = color.toUpperCase();
  if (['#FFF2CF', '#FFF8E1', '#FFF5DC', '#F1F6EF'].includes(c)) return t.onAccent;
  if (['#775145', '#744329', '#773B2B', '#63351F', '#8D3426', '#A3613B',
    '#713B2C', '#805B43', '#8B4B30', '#294C42', '#314E65', '#F5EDDA'].includes(c)) return t.ink;
  if (['#94735D', '#806C57', '#9D8B77', '#AE5A3E', '#A88A6C', '#947158',
    '#8A6557', '#957158', '#927059', '#B59C83', '#9A7560', '#6D8176', '#6D8394', '#A5B2CC',
    '#496255', '#77543E', '#425F72', '#CCD7E8'].includes(c)) return t.muted;
  if (['#477345', '#547344'].includes(c)) return t.success;
  return color;
}

function themedFill(color: string): string {
  const t = getPageTheme();
  if (color === '#29150FAA') return t.id === 1 ? '#10231DC4' : '#30251EA6';
  if (['#FFF5E3', '#F8E8CD', '#F3E2CA', '#F6DFC0', '#FFF9EF', '#FFF5E3'].includes(color)) return t.card;
  if (['#E9E0D0', '#EEE7DC', '#D8C5AD'].includes(color)) return t.disabled;
  if (['#DEC498', '#D5B47D'].includes(color)) return t.line;
  return color;
}

/**
 * 绘制可选描边的圆角矩形。
 */
export function drawRoundRect(
  node: Node,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
  lineWidth = 2,
): Graphics {
  transform(node, width, height);
  const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
  graphics.clear();
  graphics.fillColor = hex(themedFill(fill));
  graphics.roundRect(-width / 2, -height / 2, width, height, radius);
  graphics.fill();
  if (stroke) {
    graphics.strokeColor = hex(themedFill(stroke));
    graphics.lineWidth = lineWidth;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.stroke();
  }
  return graphics;
}

/**
 * A 方案的奶油色厚牌：阴影、浅棕侧边与干净牌面，保持原点击区域。
 */
export function drawFoodTile(
  node: Node,
  width: number,
  height: number,
  blocked = false,
): void {
  transform(node, width, height);
  rememberSkin(node, {kind: 'tile', width, height, blocked});
  drawSharedTile(node, width, height, blocked);
}

/**
 * 木框、凹槽和漆面按钮共用的层叠材质；纹理不经过文字区域。
 */
export function drawTavernPanel(
  node: Node,
  width: number,
  height: number,
  style: 'wood' | 'slot' | 'red' | 'cream' | 'title',
): void {
  rememberSkin(node, {kind: 'tavern', width, height, style});
  const theme = getPageTheme();
  const palettes = {
    title: [theme.dark, theme.edge, theme.titleFill, theme.titleFill],
    wood: [theme.dark, theme.edge, theme.tray, theme.tray],
    slot: [theme.edge, theme.dark, theme.slot, theme.slot],
    red: [theme.dark, theme.edge, theme.accent, theme.accent],
    cream: [theme.dark, theme.edge, theme.panel, theme.panel],
  };
  const colors = palettes[style];
  const radius = Math.min(theme.radius, height / 2);
  const g = drawRoundRect(node, width, height, radius, colors[0]);
  const layer =
    /**
     * 处理 layer 对应的游戏逻辑。
     */ (inset: number, offsetY: number, fill: string): void => {
      g.fillColor = hex(fill);
      g.roundRect(
        -width / 2 + inset,
        -height / 2 + inset + offsetY,
        width - inset * 2,
        height - inset * 2,
        Math.max(7, radius - inset),
      );
      g.fill();
    };
  layer(2, 2, colors[1]);
  layer(5, 3, colors[2]);
  layer(7, 1, colors[3]);
  if (style === 'wood' || style === 'slot') {
    g.strokeColor = hex(theme.light);
    g.lineWidth = 1;
    const y = -height / 2 + 10;
    g.moveTo(-width / 2 + 16, y);
    g.lineTo(width / 2 - 16, y);
    g.stroke();
  } else {
    g.strokeColor = hex(theme.edge);
    g.lineWidth = 2;
    g.moveTo(-width / 2 + 23, height / 2 - 12);
    g.lineTo(width / 2 - 23, height / 2 - 12);
    g.stroke();
  }
}

/**
 * 绘制控制按钮的图形标识。
 */
export function drawControlIcon(
  icon: Node,
  restart: boolean,
  enabled = true,
): void {
  const g = icon.getComponent(Graphics) || icon.addComponent(Graphics);
  g.clear();
  const theme = getPageTheme();
  g.strokeColor = hex(restart ? theme.onAccent : theme.ink);
  g.fillColor = g.strokeColor;
  g.lineWidth = 5;
  if (restart) {
    g.moveTo(13, 9);
    g.bezierCurveTo(-4, 26, -25, 7, -12, -10);
    g.bezierCurveTo(-4, -20, 12, -16, 16, -5);
    g.stroke();
    g.moveTo(13, 9);
    g.lineTo(1, 10);
    g.lineTo(12, 21);
    g.close();
    g.fill();
  } else {
    g.moveTo(-15, -6);
    g.lineTo(-8, -6);
    g.lineTo(2, -15);
    g.lineTo(2, 15);
    g.lineTo(-8, 6);
    g.lineTo(-15, 6);
    g.close();
    g.fill();
    if (enabled) {
      g.moveTo(8, -8);
      g.bezierCurveTo(15, -3, 15, 3, 8, 8);
      g.moveTo(14, -14);
      g.bezierCurveTo(25, -6, 25, 6, 14, 14);
    } else {
      g.moveTo(9, -7);
      g.lineTo(21, 7);
      g.moveTo(9, 7);
      g.lineTo(21, -7);
    }
    g.stroke();
  }
}

/**
 * C 款食盒：漆木外框、细黄铜边和奶油纸内衬，装饰避开内容区。
 */
export function drawLacquerPanel(
  node: Node,
  width: number,
  height: number,
  emphasized = false,
): void {
  rememberSkin(node, {kind: 'panel', width, height, emphasized});
  const theme = getPageTheme();
  const radius = theme.radius;
  const g = drawRoundRect(node, width, height, radius, theme.dark);
  g.fillColor = hex(theme.panel);
  g.roundRect(-width / 2 + 3, -height / 2 + 7, width - 6, height - 10, radius - 2);
  g.fill();
  g.strokeColor = hex(emphasized
    ? (theme.id === 9 ? theme.edge : theme.accent) : theme.edge);
  g.lineWidth = emphasized ? 6 : 2;
  const frameInset = emphasized ? 4 : 2;
  g.roundRect(-width / 2 + frameInset, -height / 2 + 5,
    width - frameInset * 2, height - (emphasized ? 10 : 8),
    radius - (emphasized ? 2 : 1));
  g.stroke();
  if (emphasized) {
    g.strokeColor = hex(theme.edge);
    g.lineWidth = 2;
    g.roundRect(-width / 2 + 14, -height / 2 + 16,
      width - 28, height - 30, Math.max(6, radius - 10));
    g.stroke();
  }
  // Sparse diagonal texture is confined to the header and never crosses body text.
  g.strokeColor = hex(theme.id === 9 ? '#BFA27A20' : '#99AC8720');
  g.lineWidth = 1;
  for (let x = -width / 2 + 32; x < width / 2 - 32; x += 24) {
    g.moveTo(x, height / 2 - 22);
    g.lineTo(Math.min(x + 32, width / 2 - 24), height / 2 - 54);
  }
  g.stroke();
}

/**
 * 绘制漆面按钮及其边框。
 */
export function drawLacquerButton(
  node: Node,
  width: number,
  height: number,
  tone: 'red' | 'cream' | 'muted' = 'red',
  emphasized = true,
): void {
  rememberSkin(node, {kind: 'button', width, height, tone, emphasized});
  const theme = getPageTheme();
  const body = tone === 'red' ? theme.accent : tone === 'muted' ? theme.disabled : theme.card;
  const radius = Math.min(theme.radius * .6, height / 2);
  const g = drawRoundRect(node, width, height, radius, theme.dark);
  g.fillColor = hex(body);
  g.roundRect(-width / 2, -height / 2 + 5, width, height - 5, radius);
  g.fill();
  if (tone === 'red') {
    const from = hex(theme.light), to = hex(theme.accent);
    const innerHeight = height - 14;
    const round = Math.max(4, radius - 4);
    for (let i = 0; i < 32; i++) {
      const t = i / 31;
      const highlight = (1 - t) * .16;
      g.fillColor = new Color(
        Math.round(from.r * highlight + to.r * (1 - highlight)),
        Math.round(from.g * highlight + to.g * (1 - highlight)),
        Math.round(from.b * highlight + to.b * (1 - highlight)), 255);
      const y = height / 2 - 5 - (i + 1) * innerHeight / 32;
      const distance = Math.max(0, Math.abs((i + .5) * innerHeight / 32
        - innerHeight / 2) - (innerHeight / 2 - round));
      const inset = round - Math.sqrt(Math.max(0, round * round - distance * distance));
      g.rect(-width / 2 + 5 + inset, y, width - 10 - inset * 2,
        innerHeight / 32 + .4);
      g.fill();
    }
  }
  g.strokeColor = hex(emphasized
    ? (theme.id === 9 ? theme.edge : theme.accent) : theme.edge);
  g.lineWidth = emphasized ? 3 : 1.5;
  g.roundRect(-width / 2 + 1, -height / 2 + 5, width - 2, height - 7, radius);
  g.stroke();
  g.strokeColor = hex(tone === 'red' ? theme.light : theme.line);
  g.lineWidth = 1;
  g.roundRect(-width / 2 + 5, -height / 2 + 9, width - 10, height - 15, Math.max(4, radius - 4));
  g.stroke();
  transform(node, Math.max(88, width), Math.max(88, height));
}

/** A solid, high-contrast close control with a font-independent cross. */
export function drawCloseButton(node: Node): void {
  rememberSkin(node, {kind: 'close', width: 64, height: 64});
  const theme = getPageTheme();
  const g = drawRoundRect(node, 64, 64, 14, theme.dark);
  let glyph = node.getChildByName('CloseGlyph');
  if (theme.id === 8) {
    g.clear();
    g.fillColor = hex(theme.dark);
    g.roundRect(-32, -35, 64, 64, 32);
    g.fill();
    g.fillColor = hex(theme.accent);
    g.roundRect(-31, -30, 62, 62, 31);
    g.fill();
    // Keep the cross on its own path: no pale rim or cardinal-point artifacts.
    if (!glyph) {
      glyph = new Node('CloseGlyph');
      node.addChild(glyph);
    }
    glyph.active = true;
    transform(glyph, 64, 64);
    const cross = glyph.getComponent(Graphics) || glyph.addComponent(Graphics);
    cross.clear();
    cross.strokeColor = hex(theme.onAccent);
    cross.lineWidth = 5;
    cross.moveTo(-11, 12);
    cross.lineTo(11, -10);
    cross.moveTo(-11, -10);
    cross.lineTo(11, 12);
    cross.stroke();
  } else {
    if (glyph) glyph.active = false;
    g.fillColor = hex(theme.accent);
    g.roundRect(-32, -27, 64, 59, 14);
    g.fill();
    g.strokeColor = hex(theme.onAccent);
    g.lineWidth = 2;
    g.roundRect(-29, -24, 58, 53, 11);
    g.stroke();
    g.lineWidth = 5;
    g.moveTo(-11, 14);
    g.lineTo(11, -8);
    g.moveTo(-11, -8);
    g.lineTo(11, 14);
    g.stroke();
  }
  const label = node.getChildByName('Label');
  if (label) label.active = false;
  transform(node, 88, 88);
}

function drawHeadingLine(node: Node, width: number): void {
  rememberSkin(node, {kind: 'heading', width, height: 66});
  const g = drawRoundRect(node, width, 66, 0, '#00000000');
  g.strokeColor = hex(getPageTheme().edge);
  g.lineWidth = 1;
  g.moveTo(-width / 2 - 24, -42);
  g.lineTo(width / 2 + 24, -42);
  g.stroke();
}

/**
 * 创建弹窗标题与装饰。
 */
export function makePanelHeading(
  panel: Node,
  text: string,
  y: number,
  width = 420,
): Label {
  const plaque = new Node('HeadingPlaque');
  panel.addChild(plaque);
  plaque.setPosition(0, y);
  drawHeadingLine(plaque, width);
  const heading = makeLabel(
    plaque,
    text,
    38,
    getPageTheme().ink,
    Vec3.ZERO,
    width - 64,
    42,
  );
  heading.isBold = true;
  return heading;
}

/**
 * 设置酒馆风格按钮的外观。
 */
export function styleTavernButton(button: Node, restart: boolean): void {
  drawLacquerButton(button, 292, 82, restart ? 'red' : 'cream');
  const label = button.getChildByName('Label')!.getComponent(Label)!;
  label.node.setPosition(30, 1);
  transform(label.node, 164, 58);
  const theme = getPageTheme();
  label.color = hex(restart ? theme.onAccent : theme.ink);
  label.isBold = true;
  const icon = new Node('ControlIcon');
  button.addChild(icon);
  // 图标实际笔画不对称，按可见轮廓对齐，与文字组成居中的内容组。
  icon.setPosition(restart ? -61 : -71, 1);
  transform(icon, 44, 44);
  drawControlIcon(icon, restart);
}

/**
 * 创建并配置文字节点。
 */
export function makeLabel(
  parent: Node,
  text: string,
  fontSize: number,
  textColor: string,
  position: Vec3,
  width = 0,
  height = 0,
  wrap = false,
): Label {
  const node = new Node('Label');
  parent.addChild(node);
  node.setPosition(position);
  if (width > 0) {
    transform(node, width, height || Math.round(fontSize * 1.25));
  }
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.round(fontSize * 1.25);
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.enableWrapText = wrap;
  (node as PageSkinNode).uiTextColor = textColor;
  label.color = hex(themedTextColor(textColor));
  if (width > 0) {
    label.overflow = Label.Overflow.SHRINK;
  }
  return label;
}

/**
 * 当前审阅风格的正文使用统一左对齐。
 */
export function makeBodyLabel(...args: Parameters<typeof makeLabel>): Label {
  const label = makeLabel(...args);
  if (getPageTheme().id === 8) label.horizontalAlign = Label.HorizontalAlign.LEFT;
  return label;
}

/** 创建带触摸反馈的按钮。 */
export function makeButton(
  parent: Node,
  text: string,
  position: Vec3,
  width: number,
  height: number,
  fill: string,
  callback: () => void,
): Node {
  const node = new Node(`Button_${text}`);
  parent.addChild(node);
  node.setPosition(position);
  const primary =
    ['#D75542', '#C94E35', '#C84730', '#ED4A32', '#875139', '#A3613B'].indexOf(
      fill,
    ) >= 0;
  if (text) {
    drawLacquerButton(node, width, height, primary ? 'red' : 'cream');
  } else {
    drawRoundRect(node, width, height, 16, fill, '#D5B47D', 3);
  }
  const label = makeLabel(
    node,
    text,
    width < 140 ? 24 : 26,
    primary ? getPageTheme().onAccent : getPageTheme().ink,
    new Vec3(0, 1),
    width - (width < 80 ? 16 : width < 140 ? 36 : 56),
    height - (width < 80 ? 14 : height <= 60 ? 20 : 28),
  );
  label.isBold = true;
  const homePosition = new Vec3(position.x, position.y, position.z);
  node.on(
    Node.EventType.TOUCH_START,
    /**
     * 响应节点触摸或游戏事件。
     */ () => {
      if ((node as PageSkinNode).pageDisabled) return;
      tween(node).stop();
      tween(node)
        .to(0.07, {scale: new Vec3(0.99, 0.99, 1),
          position: new Vec3(homePosition.x, homePosition.y - 4, homePosition.z)})
        .start();
    },
  );
  node.on(
    Node.EventType.TOUCH_END,
    /**
     * 响应节点触摸或游戏事件。
     */ () => {
      if ((node as PageSkinNode).pageDisabled) return;
      tween(node).stop();
      tween(node).to(0.08, {scale: Vec3.ONE, position: homePosition}).start();
      callback();
    },
  );
  node.on(
    Node.EventType.TOUCH_CANCEL,
    /**
     * 响应节点触摸或游戏事件。
     */ () => {
      tween(node).stop();
      tween(node).to(0.08, {scale: Vec3.ONE, position: homePosition}).start();
    },
  );
  return node;
}

/** Disabled controls have no press or action handlers. */
export function setButtonEnabled(node: Node, enabled: boolean): void {
  (node as PageSkinNode).pageDisabled = !enabled;
  const skin = (node as PageSkinNode).pageSkin;
  if (skin?.kind === 'button' && !enabled) {
    drawLacquerButton(node, skin.width, skin.height, 'muted');
  }
  opacity(node, enabled ? 255 : 165);
}
