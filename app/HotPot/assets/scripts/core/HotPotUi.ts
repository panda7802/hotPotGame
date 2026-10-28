import {
  Color,
  Graphics,
  Label,
  Node,
  Rect,
  resources,
  Sprite,
  SpriteFrame,
  Texture2D,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
} from 'cc';

import {IngredientType} from '../data/GameData';

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
  graphics.fillColor = hex(fill);
  graphics.roundRect(-width / 2, -height / 2, width, height, radius);
  graphics.fill();
  if (stroke) {
    graphics.strokeColor = hex(stroke);
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
  const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
  graphics.clear();
  const layer =
    /**
     * 处理 layer 对应的游戏逻辑。
     */ (offsetY: number, inset: number, fill: string, alpha = 255): void => {
      const color = hex(fill);
      color.a = alpha;
      graphics.fillColor = color;
      graphics.roundRect(
        -width / 2 + inset,
        -height / 2 + offsetY + inset,
        width - inset * 2,
        height - inset * 2,
        12,
      );
      graphics.fill();
    };
  layer(-7, 1, '#4B2B17', 28);
  layer(-4, 0, blocked ? '#665746' : '#B99A72');
  layer(0, 0, blocked ? '#756954' : '#D5BE99');
  layer(1, 1.5, blocked ? '#8C877B' : '#FFF5DF');
  // 顶边轻微提亮，不使用粗描边或整张白色背景。
  graphics.strokeColor = hex(blocked ? '#8C8B85' : '#FFFCF2');
  graphics.lineWidth = 1;
  graphics.moveTo(-width / 2 + 13, height / 2 - 2);
  graphics.lineTo(width / 2 - 13, height / 2 - 2);
  graphics.stroke();
}

/**
 * 木框、凹槽和漆面按钮共用的层叠材质；纹理不经过文字区域。
 */
export function drawTavernPanel(
  node: Node,
  width: number,
  height: number,
  style: 'wood' | 'slot' | 'red' | 'cream',
): void {
  const palettes = {
    wood: ['#63331C', '#A86A35', '#E6B56C', '#B4773B'],
    slot: ['#B17A43', '#4E2918', '#6A3D23', '#784727'],
    red: ['#87321E', '#B43D23', '#F0AC68', '#CC4D2D'],
    cream: ['#9B6F3E', '#D6AF71', '#FFF2CB', '#F2D7A3'],
  };
  const colors = palettes[style];
  const g = drawRoundRect(node, width, height, 18, colors[0]);
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
        Math.max(7, 18 - inset),
      );
      g.fill();
    };
  layer(2, 2, colors[1]);
  layer(5, 3, colors[2]);
  layer(7, 1, colors[3]);
  if (style === 'wood' || style === 'slot') {
    g.strokeColor = hex(style === 'wood' ? '#915927' : '#62351D');
    g.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const y = -height / 2 + 13 + (i * (height - 26)) / 3;
      g.moveTo(-width / 2 + 12, y);
      g.bezierCurveTo(-width / 4, y + 2, width / 4, y - 2, width / 2 - 12, y);
    }
    g.stroke();
  } else {
    g.strokeColor = hex(style === 'red' ? '#F08758' : '#FFF6D9');
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
  g.strokeColor = hex(restart ? '#FFF2D0' : '#6A3B20');
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
): void {
  const g = drawRoundRect(node, width, height, 28, '#57291F');
  const layer =
    /**
     * 处理 layer 对应的游戏逻辑。
     */ (inset: number, fill: string): void => {
      g.fillColor = hex(fill);
      g.roundRect(
        -width / 2 + inset,
        -height / 2 + inset,
        width - inset * 2,
        height - inset * 2,
        Math.max(12, 28 - inset),
      );
      g.fill();
    };
  layer(3, '#D7AA65');
  layer(6, '#8D3325');
  layer(13, '#ECC788');
  layer(16, '#FFF3DC');
  g.strokeColor = hex('#C49961');
  g.lineWidth = 1.5;
  const x = width / 2 - 24;
  const y = height / 2 - 24;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      g.moveTo(sx * (x - 19), sy * y);
      g.lineTo(sx * x, sy * y);
      g.lineTo(sx * x, sy * (y - 19));
    }
  g.stroke();
  applyLacquerSkin(node, width, height);
}

/**
 * 异步加载按钮皮肤并应用到仍有效的节点。
 */
export function applyLacquerSkin(
  node: Node,
  width: number,
  height: number,
  tone?: 'red' | 'cream' | 'muted',
): void {
  if (!resources?.load) {
    return;
  }
  const key = tone || 'panel';
  (
    node as Node & {
      /**
       * skinKey 对应的状态或配置。
       */ skinKey?: string;
    }
  ).skinKey = key;
  resources.load(
    tone
      ? 'backgrounds/button-skins-c/texture'
      : 'backgrounds/panel-skin-c/texture',
    Texture2D,
    /**
     * 在资源加载完成后更新有效节点或处理失败。
     */ (error, texture) => {
      if (!node.isValid
        || error ||
        !texture ||
        (
          node as Node & {
            /**
             * skinKey 对应的状态或配置。
             */ skinKey?: string;
          }
        ).skinKey !== key) {
        return;
      }
      const image =
        node.getChildByName('LacquerSkin') || new Node('LacquerSkin');
      if (!image.parent) {
        node.addChild(image);
        image.setSiblingIndex(0);
      }
      // 九宫格边角保留源像素尺寸；小按钮必须连同边角一起等比缩小。
      const scale = tone
        ? Math.min(1, height / 128, width / 256) : 0.65;
      transform(image, width / scale, height / scale);
      image.setScale(scale, scale, 1);
      const frame = new SpriteFrame();
      frame.texture = texture;
      if (tone) {
        const index = tone === 'red' ? 0 : tone === 'cream' ? 1 : 2;
        const cell = Math.round(texture.width / 3);
        frame.rect = new Rect(index * cell, 0, cell, texture.height);
      }
      frame.insetLeft = frame.insetRight = tone ? 24 : 96;
      frame.insetTop = frame.insetBottom = tone ? 22 : 96;
      const sprite = image.getComponent(Sprite) || image.addComponent(Sprite);
      sprite.type = Sprite.Type.SLICED;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      node.getComponent(Graphics)?.clear();
    },
  );
}

/**
 * 绘制漆面按钮及其边框。
 */
export function drawLacquerButton(
  node: Node,
  width: number,
  height: number,
  tone: 'red' | 'cream' | 'muted' = 'red',
): void {
  const colors =
    tone === 'red'
      ? ['#652C20', '#D6AC6B', '#A83224', '#C34B32']
      : tone === 'muted'
        ? ['#554337', '#A18B6B', '#766151', '#806B59']
        : ['#926440', '#CEA66B', '#FFF0CE', '#F2DCB5'];
  const g = drawRoundRect(node, width, height, 16, colors[0]);
  for (const [inset, fill] of [
    [2, colors[1]],
    [4, colors[2]],
    [7, colors[3]],
  ] as Array<[number, string]>) {
    g.fillColor = hex(fill);
    g.roundRect(
      -width / 2 + inset,
      -height / 2 + inset,
      width - inset * 2,
      height - inset * 2,
      Math.max(6, 16 - inset),
    );
    g.fill();
  }
  g.strokeColor = hex(tone === 'red' ? '#F0CB85' : '#C49B64');
  g.lineWidth = 1;
  g.moveTo(-width / 2 + 18, height / 2 - 9);
  g.lineTo(width / 2 - 18, height / 2 - 9);
  g.stroke();
  if (width >= 80) {
    applyLacquerSkin(node, width, height, tone);
  }
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
  drawLacquerButton(plaque, width, 66);
  const heading = makeLabel(
    plaque,
    text,
    32,
    '#FFF0CA',
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
  label.color = hex(restart ? '#FFF2D0' : '#6A3B20');
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
  label.color = hex(textColor);
  if (width > 0) {
    label.overflow = Label.Overflow.SHRINK;
  }
  return label;
}

/**
 * 创建带触摸反馈的按钮。
 */
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
    drawRoundRect(node, width, height, 16, fill, '#D5B47D', 1.5);
  }
  makeLabel(
    node,
    text,
    width < 140 ? 24 : 26,
    primary ? '#FFF2D0' : '#633C28',
    new Vec3(0, 1),
    width - (width < 80 ? 16 : width < 140 ? 36 : 56),
    height - (width < 80 ? 14 : height <= 60 ? 20 : 28),
  );
  node.on(
    Node.EventType.TOUCH_START,
    /**
     * 响应节点触摸或游戏事件。
     */ () => {
      tween(node).stop();
      tween(node)
        .to(0.07, {scale: new Vec3(0.94, 0.94, 1)})
        .start();
    },
  );
  node.on(
    Node.EventType.TOUCH_END,
    /**
     * 响应节点触摸或游戏事件。
     */ () => {
      tween(node).stop();
      tween(node).to(0.08, {scale: Vec3.ONE}).start();
      callback();
    },
  );
  node.on(
    Node.EventType.TOUCH_CANCEL,
    /**
     * 响应节点触摸或游戏事件。
     */ () => {
      tween(node).stop();
      tween(node).to(0.08, {scale: Vec3.ONE}).start();
    },
  );
  return node;
}
