import {Node, Rect, resources, Sprite, SpriteFrame, Texture2D, UITransform} from 'cc';
import type {Recipe, RecipeIngredient} from '../data/CookingData';
import {getIngredient, IngredientType} from '../data/GameData';
import {getPageTheme} from '../data/PageTheme';
import {drawCookingDish} from './CookingRingView';
import {designHit, designNode, designSurface, designText} from './HotPotDesignUi';

type DrawFood = (parent: Node, id: IngredientType, x: number, y: number, size: number) => void;

const GALLERY = {
  easy: [
    ['tomato-tofu', '番茄酸甜，豆腐软嫩。'],
    ['shrimp-corn', '鲜虾提鲜，玉米清甜。'],
    ['beef-mushroom', '牛肉浓香，茶树菇带出菌香。'],
    ['radish-beef', '白萝卜吸饱牛肉汤，汤清味甜。'],
    ['meatball-lotus', '肉丸饱满，莲藕脆爽，青菜清口。'],
    ['pumpkin-tofu', '南瓜汤浓滑，豆腐与玉米带出甜香。'],
  ],
  medium: [
    ['yam-chicken', '山药粉糯，乌鸡汤鲜，鹌鹑蛋软嫩。'],
    ['mushroom-noodle', '三种菌菇熬出鲜味，宽粉吸汤滑口。'],
    ['red-tripe', '红汤带辣，毛肚爽脆，宽粉吸足汤味。'],
    ['matsutake-bamboo', '松茸清香，竹笋鲜脆，鱼片细嫩。'],
  ],
  hard: [
    ['truffle-mushroom', '黑松露香浓，羊肚菌和杏鲍菇各有口感。'],
    ['mixed-seafood', '帝王蟹、鲜虾、鱼片和扇贝同锅，鲜味足。'],
    ['abalone-fishmaw', '鲍鱼紧实，海参软滑，花胶让汤更醇厚。'],
  ],
} as const;

type Sheet = keyof typeof GALLERY;
const ART_WIDTH = 400;
const ART_HEIGHT = 324;
const photoByDish = new Map<string, {sheet: Sheet; index: number; flavor: string}>();
(Object.keys(GALLERY) as Sheet[]).forEach(sheet => {
  GALLERY[sheet].forEach(([id, flavor], index) => photoByDish.set(id, {sheet, index, flavor}));
});
const textures = new Map<Sheet, Promise<Texture2D>>();
const frames = new Map<string, SpriteFrame>();

const APPEARANCE = {
  1: {card: '#173C32', group: '#214A3E', edge: '#C6954F', ink: '#FFE3A1',
    muted: '#E5D6AC', accent: '#FFD883', badge: '#9E382A', badgeInk: '#FFF0C1', photo: '#FFF0D0'},
  4: {card: '#FFF7E5', group: '#FBECD0', edge: '#DFB884', ink: '#583722',
    muted: '#725035', accent: '#4C743E', badge: '#E6EBCD', badgeInk: '#4C743E', photo: '#FFF0D0'},
  8: {card: '#F6F8EC', group: '#E4EDDC', edge: '#9DB8A1', ink: '#22483D',
    muted: '#526E5F', accent: '#30634D', badge: '#D5E5D1', badgeInk: '#274F43', photo: '#FFF0D5'},
  9: {card: '#FBF0D7', group: '#F1E1C1', edge: '#BEA07B', ink: '#532C20',
    muted: '#634A37', accent: '#812C22', badge: '#9E3529', badgeInk: '#FFF2D7', photo: '#FAEACC'},
};

export function cookingRecipeAppearance() {
  return APPEARANCE[getPageTheme().id];
}

export function cookingRecipeFlavor(dish: Recipe): string {
  return dish.practice ? '用最先发现的两种食材练习，每种 2 份。' : photoByDish.get(dish.id)?.flavor ?? '';
}

function loadSheet(sheet: Sheet): Promise<Texture2D> {
  const loaded = textures.get(sheet);
  if (loaded) return loaded;
  const pending = new Promise<Texture2D>((resolve, reject) => {
    resources.load('cooking-dishes/' + sheet + '/texture', Texture2D, (error, texture) => {
      if (error || !texture) reject(error ?? new Error('Cooking art is missing'));
      else resolve(texture);
    });
  });
  textures.set(sheet, pending);
  return pending;
}

export function drawCookingRecipeArt(host: Node, dish: Recipe, drawFood: DrawFood): void {
  const {width, height} = host.getComponent(UITransform)!;
  const palette = cookingRecipeAppearance();
  designSurface(host, palette.photo, Math.min(16, getPageTheme().radius), palette.edge, false);
  const fallback = () => {
    const size = Math.min(width / 280, height / 144);
    const art = designNode(host, 'CookingDishFallback', [0, 0, 280, 144]);
    art.setPosition(0, 0);
    art.setScale(size, size, 1);
    drawCookingDish(art, dish.ingredients, drawFood);
  };
  const photo = photoByDish.get(dish.id);
  if (!photo) { fallback(); return; }

  const display = (frame: SpriteFrame) => {
    if (!host.isValid) return;
    const scale = Math.min((width - 8) / ART_WIDTH, (height - 8) / ART_HEIGHT);
    const w = ART_WIDTH * scale, h = ART_HEIGHT * scale;
    const image = designNode(host, 'CookingDishPhoto_' + dish.id, [(width - w) / 2, (height - h) / 2, w, h]);
    const sprite = image.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
  };
  const saved = frames.get(dish.id);
  if (saved) { display(saved); return; }
  const pending = loadSheet(photo.sheet);
  void pending.then(texture => {
    if (!host.isValid) return;
    let frame = frames.get(dish.id);
    if (!frame) {
      const columns = photo.sheet === 'easy' ? 3 : 2;
      frame = new SpriteFrame();
      frame.texture = texture;
      frame.rect = new Rect(photo.index % columns * ART_WIDTH,
        Math.floor(photo.index / columns) * ART_HEIGHT, ART_WIDTH, ART_HEIGHT);
      frame.packable = false;
      frame.addRef();
      frames.set(dish.id, frame);
    }
    display(frame);
  }, error => {
    if (textures.get(photo.sheet) === pending) textures.delete(photo.sheet);
    if (host.isValid) fallback();
    console.warn('[Cooking recipe] Could not load dish photo', dish.id, error);
  });
}

export function drawCookingRecipeBatches(panel: Node, batches: readonly (readonly RecipeIngredient[])[],
  known: readonly IngredientType[], drawFood: DrawFood, showIngredient: (id: IngredientType) => void): void {
  const theme = getPageTheme();
  const palette = cookingRecipeAppearance();
  const height = 48 + 61 * Math.max(...batches.map(batch => batch.length));
  const width = batches.length === 1 ? 640 : 313;
  batches.forEach((batch, index) => {
    const group = designNode(panel, 'RecipeBatch_' + (index + 1), [40 + index * 327, 741, width, height]);
    designSurface(group, palette.group, theme.radius, palette.edge, false);
    const tag = designNode(group, 'RecipeBatchTag', [12, 9, batches.length === 1 ? 145 : 102, 34]);
    designSurface(tag, palette.badge, theme.id === 9 ? 4 : 12, '', false);
    designText(tag, batches.length === 1 ? '一批下锅' : '第 ' + (index + 1) + ' 批',
      [2, 0, tag.getComponent(UITransform)!.width - 4, 34], 21, palette.badgeInk, true);
    batch.forEach(([id, count], i) => {
      const row = designNode(group, 'RecipeIngredient_' + id, [12, 47 + i * 61, width - 24, 53]);
      const found = known.includes(id);
      designSurface(row, palette.card, Math.min(13, theme.radius), palette.edge, false);
      drawFood(row, id, 6, 4, 44);
      designText(row, getIngredient(id).name, [55, 0, width - 163, 53], 23, palette.ink, true, true);
      designText(row, count + ' 份' + (found ? '' : ' ›'), [width - 100, 0, 69, 53], 21, palette.accent, true);
      if (!found) designHit(row, () => showIngredient(id));
    });
  });
}
