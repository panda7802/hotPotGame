import {Graphics, Node, Tween, tween} from 'cc';
import {CookingPinShape, CookingRing, COOKING_RING_GAP, COOKING_SERVE_ANGLE} from '../data/CookingRingRound';
import {IngredientType} from '../data/GameData';
import {getPageTheme} from '../data/PageTheme';
import {designHit, designNode, designSurface, designText} from './HotPotDesignUi';
import {hex} from './HotPotUi';

const MATERIALS = {
  1: {rings: ['#A83222', '#376758', '#AB7642'], pot: '#8B3627', rim: '#E3B467', clasp: '#C7A36B'},
  4: {rings: ['#E99F67', '#8FB66B', '#70AFA9'], pot: '#E68645', rim: '#FFF0C8', clasp: '#E9E6DF'},
  8: {rings: ['#619786', '#799A67', '#6E9DA2'], pot: '#578D78', rim: '#DDEBCE', clasp: '#DFE7DD'},
  9: {rings: ['#A84A38', '#786655', '#697B6C'], pot: '#8B4735', rim: '#F8E5BE', clasp: '#DECBB6'},
};

export function paintCookingRing(node: Node, ring: CookingRing, index: number): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  const theme = getPageTheme(), material = MATERIALS[theme.id];
  g.clear();
  g.lineCap = Graphics.LineCap.ROUND;
  g.lineJoin = Graphics.LineJoin.ROUND;
  const arc = (offset: number, y: number, thickness: number, color: string) => {
    g.lineWidth = thickness;
    g.strokeColor = hex(color);
    for (let i = 0; i <= 42; i++) {
      const angle = (COOKING_RING_GAP + (360 - 2 * COOKING_RING_GAP) * i / 42) * Math.PI / 180;
      const radius = ring.radius + offset;
      const x = Math.cos(angle) * radius, pointY = y - Math.sin(angle) * radius;
      if (i === 0) g.moveTo(x, pointY);
      else g.lineTo(x, pointY);
    }
    g.stroke();
  };
  arc(0, -4, 25, '#54362436');
  arc(0, 0, 24, theme.dark);
  arc(0, 0, 19, material.rings[index % 3]);
  arc(4, 1, theme.id === 9 ? 2 : 4, material.rim);
}

export function paintCookingClip(node: Node, span: number, from: number, to: number,
  highlighted: boolean, paired: boolean, direction?: 1 | -1): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  const sleeve = -span / 2 + from;
  const rivet = span / 2 - to;
  g.clear();
  if (highlighted) {
    g.fillColor = hex('#E99A37AA');
    g.roundRect(sleeve - 13, -19, rivet - sleeve + 26, 38, 10);
    g.fill();
  }
  g.fillColor = hex('#77787D');
  g.roundRect(sleeve - 4, -7, rivet - sleeve + 10, 14, 5);
  g.fill();
  g.fillColor = hex('#ACADB2');
  g.roundRect(sleeve, -4, rivet - sleeve + 3, 8, 4);
  g.fill();
  for (const end of [sleeve, rivet]) {
    g.fillColor = hex('#74777B');
    g.roundRect(end - 8, -13, 16, 26, 4);
    g.fill();
    g.fillColor = hex(MATERIALS[getPageTheme().id].clasp);
    g.roundRect(end - 5, -10, 10, 20, 3);
    g.fill();
  }
  if (paired) {
    g.fillColor = hex('#504560');
    g.roundRect(-14, -15, 28, 30, 6);
    g.fill();
    g.fillColor = hex('#E2CFFA');
    for (const y of [-4, 4]) {
      g.roundRect(-9, y - 2, 18, 4, 2);
      g.fill();
    }
  }
  if (direction) {
    const center = sleeve + Math.min(24, (rivet - sleeve) / 2);
    g.fillColor = hex('#A85C18');
    g.roundRect(center - 16, -16, 32, 32, 7);
    g.fill();
    g.fillColor = hex('#EC983C');
    g.roundRect(center - 13, -13, 26, 26, 5);
    g.fill();
    g.strokeColor = hex('#FFF6DC');
    g.lineWidth = 2.6;
    const start = Math.PI * 1.25;
    const sweep = Math.PI * 1.45;
    for (let i = 0; i <= 16; i++) {
      const angle = direction * (start - sweep * i / 16);
      const x = center + Math.cos(angle) * 7, y = Math.sin(angle) * 7;
      if (!i) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    const end = direction * (start - sweep);
    const x = center + Math.cos(end) * 7, y = Math.sin(end) * 7;
    const dx = Math.sin(end) * direction, dy = -Math.cos(end) * direction;
    g.moveTo(x - 5 * dx + 3 * dy, y - 5 * dy - 3 * dx);
    g.lineTo(x, y);
    g.lineTo(x - 5 * dx - 3 * dy, y - 5 * dy + 3 * dx);
    g.stroke();
  }
}

export function paintCookingSlider(node: Node, shape: CookingPinShape): void {
  const g = node.addComponent(Graphics);
  g.lineJoin = Graphics.LineJoin.ROUND;
  g.lineCap = Graphics.LineCap.ROUND;
  for (const [color, width] of [['#2D6A60', 18], ['#87C5AB', 12], ['#DDF5DF', 3]] as const) {
    g.strokeColor = hex(color);
    g.lineWidth = width;
    if (shape === 'u') { g.moveTo(-25, -33); g.lineTo(0, -33); }
    else g.moveTo(0, -33);
    g.lineTo(0, 33);
    if (shape !== 'straight') g.lineTo(shape === 'u' ? -25 : 24, 33);
    g.stroke();
  }
  g.fillColor = hex('#E4F0D8');
  g.roundRect(-10, -5, 20, 10, 3);
  g.fill();
}

export function paintCookingSharedPin(node: Node, length: number): void {
  const g = node.addComponent(Graphics);
  const end = length / 2;
  g.lineJoin = Graphics.LineJoin.ROUND;
  g.lineCap = Graphics.LineCap.ROUND;
  for (const [color, width] of [['#2D6A60', 18], ['#87C5AB', 12], ['#DDF5DF', 3]] as const) {
    g.strokeColor = hex(color);
    g.lineWidth = width;
    g.moveTo(0, -end);
    g.lineTo(0, end);
    g.stroke();
  }
  g.fillColor = hex('#2D6A60');
  g.roundRect(-16, -19, 32, 38, 7);
  g.fill();
  g.fillColor = hex('#E4F0D8');
  for (const y of [-8, 0, 8]) {
    g.roundRect(-8, y - 2, 16, 4, 2);
    g.fill();
  }
}

export function paintCookingServingPeg(node: Node, ring: CookingRing): void {
  const g = node.addComponent(Graphics);
  const angle = COOKING_SERVE_ANGLE * Math.PI / 180;
  const radius = ring.radius;
  const x = radius * Math.cos(angle), y = -radius * Math.sin(angle);
  g.fillColor = hex('#986128');
  g.circle(x, y, 11);
  g.fill();
  g.fillColor = hex('#F4BF57');
  g.circle(x, y, 8);
  g.fill();
  g.fillColor = hex('#FFF0B3');
  g.circle(x - 2, y + 2, 3);
  g.fill();
}

export function paintCookingPot(node: Node): void {
  const g = node.addComponent(Graphics);
  const theme = getPageTheme();
  const material = MATERIALS[theme.id];
  g.fillColor = hex('#3923162B');
  g.ellipse(0, -29, 125, 12);
  g.fill();
  g.strokeColor = hex(theme.edge);
  g.lineWidth = 8;
  g.ellipse(-118, 7, 19, 12);
  g.ellipse(118, 7, 19, 12);
  g.stroke();
  g.fillColor = hex(material.pot);
  g.moveTo(-113, 13);
  g.bezierCurveTo(-109, -30, -77, -31, 0, -33);
  g.bezierCurveTo(77, -31, 109, -30, 113, 13);
  g.close();
  g.fill();
  g.fillColor = hex(material.rim);
  g.ellipse(0, 14, 113, 27);
  g.fill();
  g.fillColor = hex('#B35227');
  g.ellipse(0, 14, 103, 21);
  g.fill();
  g.fillColor = hex('#E18C47');
  g.ellipse(0, 10, 96, 15);
  g.fill();
  g.strokeColor = hex('#FFD59D');
  g.lineWidth = 2;
  g.ellipse(-70, 12, 6, 3);
  g.ellipse(67, 9, 5, 2.5);
  g.stroke();
}

export function drawCookingDish(host: Node, ingredients: readonly (readonly [IngredientType, number])[],
  drawFood: (parent: Node, id: IngredientType, x: number, y: number, size: number) => void): void {
  const plate = designNode(host, 'DishPlate', [0, 0, 280, 144]);
  const pot = designNode(plate, 'DishBowl', [0, 47, 280, 84]);
  paintCookingPot(pot);
  pot.setScale(1, 1.32, 1);
  const positions = [[54, 40, 66], [161, 37, 67], [91, 13, 65], [132, 55, 60], [81, 60, 58], [126, 18, 57]];
  ingredients.slice(0, positions.length).forEach(([id], i) => drawFood(plate, id, ...positions[i] as [number, number, number]));
}

const LESSONS = [
  ['银扣', '转动一侧，让缺口扫过锁扣'],
  ['双扣', '先对准一边，再对准另一边'],
  ['抽管', '沿管身拖出，再转环解扣'],
  ['单向扣', '从箭头这侧按标记方向转'],
  ['交叉管', '先抽上层短管，再抽下层长管'],
] as const;

export function drawCookingLessons(content: Node): void {
  const theme = getPageTheme();
  LESSONS.forEach(([title, step], index) => {
    const card = designNode(content, 'CookingLesson_' + index, [0, index * 121, 640, 112]);
    designSurface(card);
    const icon = designNode(card, 'LessonDiagram', [20, 8, 180, 96]);
    const moving: {node: Node; angle: number; x: number; y: number}[] = [];
    const ring = (x: number, angle: number, target: number, color: number) => {
      const node = designNode(icon, 'LessonRing', [x, 3, 90, 90]);
      node.angle = angle;
      paintCookingRing(node, {x: 0, y: 0, radius: 34, angle: 0, released: false}, color);
      moving.push({node, angle: target, x: node.position.x, y: node.position.y});
    };
    const clasp = (paired: boolean, direction?: 1) => {
      const node = designNode(icon, 'LessonClasp', [21, 28, 138, 40]);
      paintCookingClip(node, 138, 51, 51, false, paired, direction);
    };
    if (index === 2 || index === 4) {
      const lower = designNode(icon, 'LessonLowerPipe', [46, 8, 88, 80]);
      if (index === 2) paintCookingSlider(lower, 'elbow');
      else {
        paintCookingSharedPin(lower, 60);
        const upper = designNode(icon, 'LessonUpperPipe', [46, 8, 88, 80]);
        paintCookingCrossPin(upper);
        moving.push({node: upper, angle: 0, x: upper.position.x + 52, y: upper.position.y});
      }
      moving.push({node: lower, angle: 0, x: lower.position.x, y: lower.position.y + 37});
    } else {
      ring(index === 1 ? 0 : 5, 76, 0, index);
      if (index === 1) ring(96, 82, 180, 1);
      clasp(index === 1, index === 3 ? 1 : undefined);
    }
    const start = moving.map(({node}) => ({angle: node.angle, position: node.position.clone()}));
    designText(card, title, [222, 12, 342, 44], 32, theme.ink, true, true);
    designText(card, step, [222, 58, 344, 40], 24, theme.muted, false, true);
    designText(card, '▶', [584, 30, 42, 50], 23, theme.accent, true);
    designHit(card, () => moving.forEach(({node, angle, x, y}, i) => {
      Tween.stopAllByTarget(node);
      node.angle = start[i].angle;
      node.setPosition(start[i].position);
      tween(node).delay(i * .48).to(.46, {angle, position: node.position.clone().set(x, y, 0)})
        .delay(.65).call(() => {
          node.angle = start[i].angle;
          node.setPosition(start[i].position);
        }).start();
    }));
  });
}

export function paintCookingCrossPin(node: Node): void {
  const g = node.addComponent(Graphics);
  g.lineCap = Graphics.LineCap.ROUND;
  for (const [color, width, offset] of [['#142E2870', 22, -4], ['#2D6A60', 18, 0],
    ['#91D6B9', 12, 0], ['#E6F8DC', 3, 3]] as const) {
    g.lineWidth = width;
    g.strokeColor = hex(color);
    g.moveTo(-38, offset);
    g.lineTo(38, offset);
    g.stroke();
  }
  g.strokeColor = hex('#285952');
  g.lineWidth = 2;
  for (const direction of [-1, 1]) {
    g.moveTo(direction * 26, 5);
    g.lineTo(direction * 32, 0);
    g.lineTo(direction * 26, -5);
    g.stroke();
  }
}

export function paintCookingHourglass(node: Node): void {
  const g = node.addComponent(Graphics);
  const theme = getPageTheme();
  g.lineJoin = Graphics.LineJoin.ROUND;
  g.strokeColor = hex(theme.dark);
  g.fillColor = hex(theme.card);
  g.lineWidth = 3;
  g.moveTo(-16, 22);
  g.lineTo(16, 22);
  g.quadraticCurveTo(16, 9, 4, 2);
  g.quadraticCurveTo(2, 0, 4, -2);
  g.quadraticCurveTo(16, -9, 16, -22);
  g.lineTo(-16, -22);
  g.quadraticCurveTo(-16, -9, -4, -2);
  g.quadraticCurveTo(-2, 0, -4, 2);
  g.quadraticCurveTo(-16, 9, -16, 22);
  g.close();
  g.fill();
  g.stroke();
  g.fillColor = hex(theme.edge);
  g.moveTo(-12, -18);
  g.lineTo(0, -7);
  g.lineTo(12, -18);
  g.close();
  g.fill();
  g.fillColor = hex(theme.accent);
  g.roundRect(-22, 21, 44, 6, 3);
  g.roundRect(-22, -27, 44, 6, 3);
  g.fill();
}
