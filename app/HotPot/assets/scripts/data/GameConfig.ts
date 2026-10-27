export type IngredientType =
  | 'beef'
  | 'shrimp'
  | 'vegetable'
  | 'mushroom'
  | 'corn'
  | 'fish'
  | 'egg'
  | 'jzg'
  | 'meetball'
  | 'ou'
  | 'tomato'
  | 'toufu'
  | 'ydf'
  | 'tripe'
  | 'duckblood'
  | 'potato'
  | 'crabstick'
  | 'noodle'
  | 'luncheon'
  | 'kelp'
  | 'lamb'
  | 'blackchicken'
  | 'yam';

/**
 * IngredientConfig 的数据结构；字段说明见各成员。
 */
export interface IngredientConfig {
  /**
   * 实体的唯一编号。
   */
  id: IngredientType;
  /**
   * 显示名称。
   */
  name: string;
  /**
   * 食材的主色。
   */
  color: string;
  /**
   * 食材的深色。
   */
  dark: string;
}

/**
 * LevelConfig 的数据结构；字段说明见各成员。
 */
export interface LevelConfig {
  /**
   * 关卡序号。
   */
  level: number;
  /**
   * 界面显示的标题。
   */
  title: string;
  /**
   * 本关使用的食材种类数。
   */
  typeCount: number;
  /**
   * 各层的牌数配置。
   */
  layers: number[];
  /**
   * 托盘容量。
   */
  traySize: number;
  /**
   * 棋盘目标行数。
   */
  rows?: number;
  /**
   * 牌面缩放比例。
   */
  tileScale?: number;
  /**
   * 食材池的起始偏移。
   */
  typeOffset?: number;
}

/**
 * TileData 的数据结构；字段说明见各成员。
 */
export interface TileData {
  /**
   * 实体的唯一编号。
   */
  id: string;
  /**
   * 食材的类型编号。
   */
  type: IngredientType;
  /**
   * 棋盘横坐标。
   */
  x: number;
  /**
   * 棋盘纵坐标。
   */
  y: number;
  /**
   * 棋盘所在层级。
   */
  layer: number;
  /**
   * 遮挡此牌的上层牌编号。
   */
  blockedBy: string[];
  /**
   * 此牌是否已经移除。
   */
  removed: boolean;
}

/**
 * LevelData 的数据结构；字段说明见各成员。
 */
export interface LevelData {
  /**
   * 生成棋盘所用的关卡配置。
   */
  config: LevelConfig;
  /**
   * 当前关卡的食材牌列表。
   */
  tiles: TileData[];
  /**
   * 关卡初始总牌数。
   */
  total: number;
  /**
   * 重现棋盘布局的随机种子。
   */
  layoutSeed?: number;
  /**
   * 重现食材分布的随机种子。
   */
  ingredientSeed?: number;
}

export const INGREDIENTS: IngredientConfig[] = [
  {id: 'beef', name: '牛肉', color: '#D9574F', dark: '#9E302F'},
  {id: 'shrimp', name: '鲜虾', color: '#FF8B62', dark: '#D85A45'},
  {id: 'vegetable', name: '青菜', color: '#65B85A', dark: '#368744'},
  {id: 'mushroom', name: '蘑菇', color: '#C69A72', dark: '#8B654E'},
  {id: 'corn', name: '玉米', color: '#F2C94C', dark: '#D49A28'},
  {id: 'fish', name: '鱼片', color: '#79B8D1', dark: '#427F9E'},
  {id: 'egg', name: '鹌鹑蛋', color: '#F0E3BF', dark: '#A7854E'},
  {id: 'jzg', name: '茶树菇', color: '#A4602B', dark: '#63321C'},
  {id: 'meetball', name: '肉丸', color: '#C98C62', dark: '#8A543A'},
  {id: 'ou', name: '莲藕', color: '#E3C69C', dark: '#9A7857'},
  {id: 'tomato', name: '番茄', color: '#E7543E', dark: '#A52F28'},
  {id: 'toufu', name: '豆腐', color: '#F0E5C8', dark: '#9A825D'},
  {id: 'ydf', name: '油豆腐', color: '#E8A543', dark: '#A96825'},
  {id: 'tripe', name: '毛肚', color: '#766054', dark: '#47372E'},
  {id: 'duckblood', name: '鸭血', color: '#A83B35', dark: '#6C2528'},
  {id: 'potato', name: '土豆', color: '#F1D48A', dark: '#A98A46'},
  {id: 'crabstick', name: '蟹棒', color: '#ED6550', dark: '#A93629'},
  {id: 'noodle', name: '宽粉', color: '#EADAC1', dark: '#AA9274'},
  {id: 'luncheon', name: '午餐肉', color: '#EAA1A1', dark: '#AD6468'},
  {id: 'kelp', name: '海带结', color: '#65753A', dark: '#354623'},
  {id: 'lamb', name: '羊肉', color: '#EFA3A5', dark: '#B66A76'},
  {id: 'blackchicken', name: '乌鸡卷', color: '#8E8987', dark: '#48454A'},
  {id: 'yam', name: '山药', color: '#F5EEDA', dark: '#A99B82'},
];

// Each layer is made from complete triples. A top-to-bottom solution always
// exists, while imperfect choices can still fill the seven-slot tray.
export const LEVELS: LevelConfig[] = [
  {level: 1, title: '开锅尝鲜', typeCount: 3, layers: [9, 9], traySize: 7},
  {level: 2, title: '热锅练手', typeCount: 4, layers: [15, 15], traySize: 7},
  {
    level: 3,
    title: '千层盛宴',
    typeCount: 10,
    typeOffset: 3,
    layers: Array(37).fill(24),
    traySize: 7,
    tileScale: 0.82,
  },
];
