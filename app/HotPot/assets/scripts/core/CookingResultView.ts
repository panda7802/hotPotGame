import type {Node} from 'cc';
import {scoreCooking} from '../data/CookingData';
import {getIngredient, IngredientType} from '../data/GameData';
import {getPageTheme} from '../data/PageTheme';
import {designNode, designOnBackground, designScroll, designSurface, designText} from './HotPotDesignUi';

type FoodIcon = (parent: Node, id: IngredientType, x: number, y: number, size: number) => void;

export function drawCookingBreakdown(panel: Node, result: ReturnType<typeof scoreCooking>, drawFood: FoodIcon): void {
  const theme = getPageTheme();
  designText(panel, '食材达成', [40, 697, 640, 43], 28, designOnBackground(), true);
  const {content} = designScroll(panel, 'CookingResultPortions',
    [40, 747, 640, 280], Math.ceil(result.rows.length / 2) * 91);
  result.rows.forEach((row, index) => {
    const card = designNode(content, 'ResultPortion_' + row.id,
      [326 * (index % 2), Math.floor(index / 2) * 91, 314, 82]);
    designSurface(card, theme.card, theme.radius, theme.edge, false);
    drawFood(card, row.id, 8, 9, 64);
    designText(card, getIngredient(row.id).name, [78, 7, 216, 33], 23, theme.ink, true, true);
    const correct = row.actual === row.target;
    designText(card, row.target ? `${row.actual}/${row.target}${correct ? '  ✓' : ''}` : `${row.actual} 份`,
      [78, 40, 216, 36], 26, correct ? theme.success : theme.accent, true, true);
  });
}
