"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEVELS = exports.INGREDIENTS = void 0;
exports.INGREDIENTS = [
    { id: 'beef', name: '牛肉', color: '#D9574F', dark: '#9E302F' },
    { id: 'shrimp', name: '鲜虾', color: '#FF8B62', dark: '#D85A45' },
    { id: 'vegetable', name: '青菜', color: '#65B85A', dark: '#368744' },
    { id: 'mushroom', name: '蘑菇', color: '#C69A72', dark: '#8B654E' },
    { id: 'corn', name: '玉米', color: '#F2C94C', dark: '#D49A28' },
    { id: 'fish', name: '鱼片', color: '#79B8D1', dark: '#427F9E' },
    { id: 'egg', name: '鹌鹑蛋', color: '#F0E3BF', dark: '#A7854E' },
    { id: 'jzg', name: '茶树菇', color: '#A4602B', dark: '#63321C' },
    { id: 'meetball', name: '肉丸', color: '#C98C62', dark: '#8A543A' },
    { id: 'ou', name: '莲藕', color: '#E3C69C', dark: '#9A7857' },
    { id: 'tomato', name: '番茄', color: '#E7543E', dark: '#A52F28' },
    { id: 'toufu', name: '豆腐', color: '#F0E5C8', dark: '#9A825D' },
    { id: 'ydf', name: '油豆腐', color: '#E8A543', dark: '#A96825' },
    { id: 'tripe', name: '毛肚', color: '#766054', dark: '#47372E' },
    { id: 'duckblood', name: '鸭血', color: '#A83B35', dark: '#6C2528' },
    { id: 'potato', name: '土豆', color: '#F1D48A', dark: '#A98A46' },
    { id: 'crabstick', name: '蟹棒', color: '#ED6550', dark: '#A93629' },
    { id: 'noodle', name: '宽粉', color: '#EADAC1', dark: '#AA9274' },
    { id: 'luncheon', name: '午餐肉', color: '#EAA1A1', dark: '#AD6468' },
    { id: 'kelp', name: '海带结', color: '#65753A', dark: '#354623' },
    { id: 'lamb', name: '羊肉', color: '#EFA3A5', dark: '#B66A76' },
    { id: 'blackchicken', name: '乌鸡卷', color: '#8E8987', dark: '#48454A' },
    { id: 'yam', name: '山药', color: '#F5EEDA', dark: '#A99B82' },
];
// Each layer is made from complete triples. A top-to-bottom solution always
// exists, while imperfect choices can still fill the seven-slot tray.
exports.LEVELS = [
    { level: 1, title: '开锅尝鲜', typeCount: 3, layers: [9, 9], traySize: 7 },
    { level: 2, title: '热锅练手', typeCount: 4, layers: [15, 15], traySize: 7 },
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
