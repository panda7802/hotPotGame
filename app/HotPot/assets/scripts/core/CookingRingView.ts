import {Graphics, Node} from 'cc';
import {CookingPinShape, CookingRing, cookingRingRim, COOKING_RING_GAP, COOKING_SERVE_ANGLE} from '../data/CookingRingRound';
import {getPageTheme} from '../data/PageTheme';
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
      const radius = cookingRingRim(ring.radius, ring.shape, angle) + offset;
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
  highlighted: boolean, paired: boolean): void {
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

export function paintCookingServingPeg(node: Node, ring: CookingRing): void {
  const g = node.addComponent(Graphics);
  const angle = COOKING_SERVE_ANGLE * Math.PI / 180;
  const radius = cookingRingRim(ring.radius, ring.shape, 0);
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
