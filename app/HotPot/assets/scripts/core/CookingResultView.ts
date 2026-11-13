import type {Node} from 'cc';
import {CookingRound, scoreCooking} from '../data/CookingData';
import {getIngredient, IngredientType} from '../data/GameData';
import {getPageTheme} from '../data/PageTheme';
import {
  designHit, designNode, designOnBackground, designScroll, designSurface,
  designText,
} from './HotPotDesignUi';

type FoodIcon = (parent: Node, id: IngredientType, x: number,
  y: number, size: number) => void;

export function drawCookingBreakdown(panel: Node, round: CookingRound,
  result: ReturnType<typeof scoreCooking>, drawFood: FoodIcon): void {
  const theme = getPageTheme();
  const grouped = round.batches.length > 1;
  const closed = new Set<number>();
  const sections = round.batches.map(batch => result.rows.filter(row =>
    batch.some(([id]) => id === row.id),
  ));
  const extras = result.rows.filter(row => row.target === 0);

  const render = () => {
    const body = panel.getChildByName('DesignBody')!;
    const previous = body.getChildByName('CookingResultPortions');
    previous?.removeFromParent();
    previous?.destroy();
    const visible = sections.reduce((total, rows, index) =>
      total + (closed.has(index) ? 0 : rows.length), extras.length);
    const headings = grouped ? sections.length * 54 : 0;
    const {content} = designScroll(panel, 'CookingResultPortions',
      [40, 482, 640, 464], visible * 66 + headings + 10);
    let y = 0;
    const drawRow = (row: (typeof result.rows)[number]) => {
      const card = designNode(content, 'ResultPortion_' + row.id,
        [0, y, 640, 62]);
      designSurface(card, theme.card, 12, theme.line, false);
      drawFood(card, row.id, 14, 4, 54);
      designText(card, getIngredient(row.id).name, [84, 0, 290, 62],
        26, theme.ink, true, true);
      const difference = row.actual - row.target;
      const count = difference === 0 ? '刚好' : difference < 0
        ? `少 ${-difference} 份` : `多 ${difference} 份`;
      const caption = row.target ? `${row.actual}/${row.target} · ${count}`
        : `混入 ${row.actual} 份`;
      designText(card, caption, [382, 0, 240, 62], 25, theme.accent);
      y += 66;
    };
    sections.forEach((rows, index) => {
      const folded = closed.has(index);
      if (grouped) {
        const heading = designText(content,
          `第 ${index + 1} 批 · ${folded ? '展开' : '收起'}`,
          [8, y, 624, 50], 24, designOnBackground(), true, true);
        designHit(heading.node, () => {
          if (folded) {
            closed.delete(index);
          } else {
            closed.add(index);
          }
          render();
        });
        y += 54;
      }
      if (!folded) {
        rows.forEach(drawRow);
      }
    });
    extras.forEach(drawRow);
  };
  render();
}
