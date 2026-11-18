import {INGREDIENTS, IngredientType} from './GameData';
import {PlayerState} from './PlayerData';

/**
 * 图鉴复用游戏中的食材 SpriteFrame，不增加图片资源。
 */
export const INGREDIENT_STORIES: Record<
  IngredientType,
  {
    /**
     * 食材故事的短标签。
     */ tag: string;
    /**
     * 食材图鉴中的故事文案。
     */ story: string;
  }
> = {
  beef: {
    tag: '鲜香担当',
    story: '卷起一圈鲜香的老朋友。找齐三位牛肉伙伴，让红汤里的热闹再添一分。',
  },
  shrimp: {
    tag: '海味来客',
    story: '弯弯身子，带着海风来赴宴。鲜虾伙伴排排坐，一起跳进热气腾腾的锅里。',
  },
  vegetable: {
    tag: '清新绿意',
    story: '满锅红汤里的一抹绿。别看它安静，凑齐伙伴也能带来漂亮的一次消除。',
  },
  mushroom: {
    tag: '山野小伞',
    story: '撑着小伞来串门，把山野的想象装进锅里。先看叠层，再邀它下锅。',
  },
  corn: {
    tag: '金色小太阳',
    story:
      '金灿灿的小太阳，让小馆的餐桌亮起来。给同伴留个空位，甜甜的相遇就在下一张。',
  },
  fish: {
    tag: '浪花薄片',
    story: '像一朵轻轻落下的浪花。鱼片伙伴藏在层层食材间，等你把它们找齐。',
  },
  egg: {
    tag: '圆滚滚伙伴',
    story:
      '小小一颗，也有自己的出场时刻。圆滚滚的伙伴结伴出发，锅里的热闹不能少。',
  },
  jzg: {
    tag: '山林常客',
    story:
      '细细长长的茶树菇，带着山林气息来赴约。伙伴就在附近，慢慢找，不着急。',
  },
  meetball: {
    tag: '弹跳小队',
    story: '圆滚滚的肉丸组成小队，在托盘里等一次整整齐齐的集合。',
  },
  ou: {
    tag: '洞洞花片',
    story:
      '一片片像小花，藏着好认的洞洞。仔细看看上层，也许下一位莲藕伙伴就在那里。',
  },
  tomato: {
    tag: '红润来宾',
    story: '穿着红衣来赴宴，为小馆添一笔亮色。找到三个相同伙伴，就能一同下锅。',
  },
  toufu: {
    tag: '方方小将',
    story: '方方正正地站好队，安安静静地等同伴。小小豆腐，也能帮你收好这一锅。',
  },
  ydf: {
    tag: '金黄福袋',
    story: '像一个个金黄的小福袋，把好心情装进热汤。凑齐伙伴，打开下一层惊喜。',
  },
  tripe: {
    tag: '褶皱小山',
    story: '层层褶皱藏着鲜香，认准深色的波浪边，找齐三位毛肚伙伴。',
  },
  duckblood: {
    tag: '红玉方块',
    story: '酒红色的小方块，稳稳地等着同伴一起下锅。',
  },
  potato: {
    tag: '金黄薄片',
    story: '圆圆的土豆片不带小孔，和莲藕伙伴各有自己的模样。',
  },
  crabstick: {
    tag: '红白长条',
    story: '红衣白心的蟹棒排成队，给托盘留好下一位伙伴的位置。',
  },
  noodle: {
    tag: '柔软宽带',
    story: '晶莹的宽粉轻轻折叠，像一条等待展开的丝带。',
  },
  luncheon: {
    tag: '粉红方片',
    story: '粉红色午餐肉切成整齐薄片，凑齐三张就一起赴宴。',
  },
  kelp: {tag: '绿结来客', story: '海带打了一个小结，把海风和鲜味都带进小馆。'},
  lamb: {
    tag: '粉白薄片',
    story:
      '浅粉羊肉展开扇形薄片，白色脂肪边很好认。本锅有羊肉时，牛肉便留到下一锅。',
  },
  blackchicken: {
    tag: '墨边小卷',
    story: '灰黑外缘包着灰白肉芯，小小乌鸡卷有着独特的旋纹。',
  },
  yam: {
    tag: '雪白长段',
    story: '山药切成雪白长段，实心斜切面和一点棕皮是它的小记号。',
  },
  okra: {tag: '五角绿星', story: '绿色五角切面和浅色小籽，是秋葵的记号。'},
  tendon: {tag: '琥珀小弯', story: '半透明的琥珀色牛蹄筋，弯弯地等伙伴一起下锅。'},
  kidney: {tag: '花纹小扇', story: '交错花刀让腰花展开独特的纹路。'},
  aorta: {tag: '金边脆片', story: '浅金色黄喉带着细密纹理，认准它的波浪边。'},
  duckintestine: {tag: '柔软小环', story: '鸭肠卷起浅色的小环，和宽粉各有各的模样。'},
  chickenfeet: {tag: '掌心小队', story: '一只只鸡爪并排赴宴，凑齐三个伙伴就能一起出发。'},
  mussel: {tag: '青壳海客', story: '深青色贝壳裹着橙色贝肉，把海风带进锅里。'},
  scallop: {tag: '海边小扇', story: '放射状的扇形贝壳，托着一颗圆圆的贝肉。'},
  abalone: {tag: '金边海珍', story: '金黄鲍肉与深色壳边，是鲍鱼伙伴的标记。'},
  squid: {tag: '卷卷海客', story: '浅色鱿鱼圈搭着紫红触须，在叠层间等你发现。'},
  fishball: {tag: '雪白圆子', story: '雪白鱼丸圆滚滚，和棕色肉丸很好区分。'},
  roebag: {tag: '金心福包', story: '金黄外衣里藏着橙红鱼籽，切面最有辨识度。'},
  fishtofu: {tag: '金黄方丁', story: '鱼豆腐有金黄外皮，别和雪白豆腐认错伙伴。'},
  tofuskin: {tag: '层层豆香', story: '浅黄豆皮叠成薄薄的小方片。'},
  bellroll: {tag: '酥卷来客', story: '响铃卷卷起金黄的层次，把豆香收进小卷。'},
  woodear: {tag: '山野小耳', story: '深褐色木耳展开起伏的边缘，像一朵小云。'},
  oystermushroom: {tag: '山野小扇', story: '扇形平菇层层舒展，是蘑菇家族的新伙伴。'},
  kingoyster: {tag: '厚片小将', story: '杏鲍菇切成厚片，浅色切面连着棕色边。'},
  radish: {tag: '雪白圆片', story: '白萝卜圆片带着淡淡放射纹，清清爽爽来赴约。'},
  carrot: {tag: '橙色小太阳', story: '橙红胡萝卜片在棋盘里很显眼。'},
  pumpkin: {tag: '金黄月牙', story: '深绿外皮包着橙黄瓜肉，切成一弯弯小月牙。'},
  bambooshoot: {tag: '山间新芽', story: '嫩笋尖尖，浅色笋肉连着绿色的外衣。'},
  celtuce: {tag: '青绿斜片', story: '淡绿莴笋斜切成片，留着清晰的浅色纹理。'},
  broccoli: {tag: '绿树小队', story: '西兰花像一棵棵小树，绿色花球很容易认。'},
  cauliflower: {tag: '奶白小树', story: '奶白花菜和绿色西兰花，是各有颜色的伙伴。'},
  taro: {tag: '紫点方块', story: '芋头切面里藏着紫色细点，方方正正地等你发现。'},
  vermicelli: {tag: '细丝小团', story: '红薯粉盘成细丝团，和扁平的宽粉各有模样。'},
};

/**
 * AchievementEntry 的数据结构；字段说明见各成员。
 */
export interface AchievementEntry {
  /**
   * 实体的唯一编号。
   */
  id: string;
  /**
   * 界面显示的标题。
   */ title: string;
  /**
   * 成就的说明文字。
   */ description: string;
  /**
   * 当前完成数值。
   */ current: number;
  /**
   * 解锁所需的目标数值。
   */ target: number;
  /**
   * 成就是否已经解锁。
   */ unlocked: boolean;
}

/**
 * 根据永久进度计算各成就的目标和解锁状态。
 */
export function achievementEntries(state: PlayerState): AchievementEntry[] {
  const p = state.progress;
  const best = Math.max(...p.bestCleared);
  const result: AchievementEntry[] = [];
  const add =
    /**
     * 处理 add 对应的游戏逻辑。
     */ (
      id: string,
      title: string,
      description: string,
      current: number,
      target: number,
    ): void => {
      result.push({
        id,
        title,
        description,
        current: Math.min(current, target),
        target,
        unlocked: current >= target,
      });
    };
  add(
    'first-taste',
    '开锅尝鲜',
    '拿取食材，点亮第一份图鉴',
    p.discovered.length,
    1,
  );
  add('first-clear', '初次开席', '在一局中消除至少3份食材', best, 3);
  add(
    'hometown',
    '家乡有味',
    '为小馆选择自己的地区',
    p.regionChosen ? 1 : 0,
    1,
  );
  add('five-flavors', '五味俱全', '发现5种不同食材', p.discovered.length, 5);
  add('ten-flavors', '十全食客', '发现10种不同食材', p.discovered.length, 10);
  add(
    'full-menu',
    '满汉小馆',
    `点亮全部${INGREDIENTS.length}种食材图鉴`,
    p.discovered.length,
    INGREDIENTS.length,
  );
  add('clear-30', '热锅熟手', '在一局中消除至少30份食材', best, 30);
  add('clear-100', '百味入锅', '在一局中消除至少100份食材', best, 100);
  add('clear-300', '火候大师', '在一局中消除至少300份食材', best, 300);
  add(
    'win-1',
    '第一锅香',
    '通关第1关',
    p.completedLevels.indexOf(0) >= 0 ? 1 : 0,
    1,
  );
  add(
    'win-2',
    '热锅行家',
    '通关第2关',
    p.completedLevels.indexOf(1) >= 0 ? 1 : 0,
    1,
  );
  add(
    'win-3',
    '千层掌勺',
    '通关第3关',
    p.completedLevels.indexOf(2) >= 0 ? 1 : 0,
    1,
  );
  add(
    'clean-win',
    '一气呵成',
    '不使用复活通关任意一关',
    p.cleanWins.length ? 1 : 0,
    1,
  );
  add('all-wins', '三锅圆满', '完成全部3关', p.completedLevels.length, 3);
  return result;
}

/**
 * 返回已经解锁的成就编号。
 */
export function unlockedAchievementIds(state: PlayerState): string[] {
  return achievementEntries(state)
    .filter(
      /**
       * 按条件筛选或判断条目：item.unlocked。
       */ (item) => item.unlocked,
    )
    .map(
      /**
       * 将当前条目转换为后续处理所需的值。
       */ (item) => item.id,
    );
}
