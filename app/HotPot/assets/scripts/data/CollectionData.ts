import {INGREDIENTS, IngredientType} from './GameData';
import {PlayerState} from './PlayerData';

/** 图鉴复用游戏中的食材 SpriteFrame，不增加图片资源。 */
export const INGREDIENT_STORIES: Record<IngredientType, {tag: string; story: string}> = {
    beef: {tag: '鲜香担当', story: '卷起一圈鲜香的老朋友。找齐三位牛肉伙伴，让红汤里的热闹再添一分。'},
    shrimp: {tag: '海味来客', story: '弯弯身子，带着海风来赴宴。鲜虾伙伴排排坐，一起跳进热气腾腾的锅里。'},
    vegetable: {tag: '清新绿意', story: '满锅红汤里的一抹绿。别看它安静，凑齐伙伴也能带来漂亮的一次消除。'},
    mushroom: {tag: '山野小伞', story: '撑着小伞来串门，把山野的想象装进锅里。先看叠层，再邀它下锅。'},
    corn: {tag: '金色小太阳', story: '金灿灿的小太阳，让小馆的餐桌亮起来。给同伴留个空位，甜甜的相遇就在下一张。'},
    fish: {tag: '浪花薄片', story: '像一朵轻轻落下的浪花。鱼片伙伴藏在层层食材间，等你把它们找齐。'},
    egg: {tag: '圆滚滚伙伴', story: '小小一颗，也有自己的出场时刻。圆滚滚的伙伴结伴出发，锅里的热闹不能少。'},
    jzg: {tag: '山林常客', story: '细细长长的茶树菇，带着山林气息来赴约。伙伴就在附近，慢慢找，不着急。'},
    meetball: {tag: '弹跳小队', story: '圆滚滚的肉丸组成小队，在托盘里等一次整整齐齐的集合。'},
    ou: {tag: '洞洞花片', story: '一片片像小花，藏着好认的洞洞。仔细看看上层，也许下一位莲藕伙伴就在那里。'},
    tomato: {tag: '红润来宾', story: '穿着红衣来赴宴，为小馆添一笔亮色。找到三个相同伙伴，就能一同下锅。'},
    toufu: {tag: '方方小将', story: '方方正正地站好队，安安静静地等同伴。小小豆腐，也能帮你收好这一锅。'},
    ydf: {tag: '金黄福袋', story: '像一个个金黄的小福袋，把好心情装进热汤。凑齐伙伴，打开下一层惊喜。'},
};

export interface AchievementEntry {
    id: string; title: string; description: string; current: number; target: number; unlocked: boolean;
}
export function achievementEntries(state: PlayerState): AchievementEntry[] {
    const p = state.progress;
    const best = Math.max(...p.bestCleared);
    const result: AchievementEntry[] = [];
    const add = (id: string, title: string, description: string, current: number, target: number): void => {
        result.push({id, title, description, current: Math.min(current, target), target, unlocked: current >= target});
    };
    add('first-taste', '开锅尝鲜', '拿取食材，点亮第一份图鉴', p.discovered.length, 1);
    add('first-clear', '初次开席', '在一局中消除至少3份食材', best, 3);
    add('hometown', '家乡有味', '为小馆选择自己的地区', p.regionChosen ? 1 : 0, 1);
    add('five-flavors', '五味俱全', '发现5种不同食材', p.discovered.length, 5);
    add('ten-flavors', '十全食客', '发现10种不同食材', p.discovered.length, 10);
    add('full-menu', '满汉小馆', '点亮全部13种食材图鉴', p.discovered.length, INGREDIENTS.length);
    add('clear-30', '热锅熟手', '在一局中消除至少30份食材', best, 30);
    add('clear-100', '百味入锅', '在一局中消除至少100份食材', best, 100);
    add('clear-300', '火候大师', '在一局中消除至少300份食材', best, 300);
    add('win-1', '第一锅香', '通关第1关', p.completedLevels.indexOf(0) >= 0 ? 1 : 0, 1);
    add('win-2', '热锅行家', '通关第2关', p.completedLevels.indexOf(1) >= 0 ? 1 : 0, 1);
    add('win-3', '千层掌勺', '通关第3关', p.completedLevels.indexOf(2) >= 0 ? 1 : 0, 1);
    add('clean-win', '一气呵成', '不使用复活通关任意一关', p.cleanWins.length ? 1 : 0, 1);
    add('all-wins', '三锅圆满', '完成全部3关', p.completedLevels.length, 3);
    return result;
}

export function unlockedAchievementIds(state: PlayerState): string[] {
    return achievementEntries(state).filter(item => item.unlocked).map(item => item.id);
}
