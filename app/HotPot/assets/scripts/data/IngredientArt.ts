import {IngredientType} from './GameConfig';

/** Stable row-major sprite identity across all themes, board and menus. */
export const INGREDIENT_ART: IngredientType[][] = [
  [
    'beef', 'shrimp', 'vegetable', 'mushroom', 'corn',
    'fish', 'egg', 'jzg', 'meetball', 'ou',
    'tomato', 'toufu', 'ydf', 'tripe', 'duckblood',
    'potato', 'crabstick', 'noodle', 'luncheon', 'kelp',
    'lamb', 'blackchicken', 'yam', 'okra', 'tendon',
  ],
  [
    'kidney', 'aorta', 'duckintestine', 'chickenfeet', 'mussel',
    'scallop', 'abalone', 'squid', 'fishball', 'roebag',
    'fishtofu', 'tofuskin', 'bellroll', 'woodear', 'oystermushroom',
    'kingoyster', 'radish', 'carrot', 'pumpkin', 'bambooshoot',
    'celtuce', 'broccoli', 'cauliflower', 'taro', 'vermicelli',
  ],
  // 第三张图集仍使用 5×5 格，前两行是隐藏珍藏，后三行透明。
  [
    'kingcrab', 'bluelobster', 'coralgrouper', 'geoduck', 'seacucumber',
    'fishmaw', 'matsutake', 'morel', 'blacktruffle', 'caviar',
  ],
];
