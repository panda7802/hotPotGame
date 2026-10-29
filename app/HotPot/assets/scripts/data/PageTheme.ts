export type PageStyle = 1 | 4 | 8 | 9;

export interface PageTheme {
  id: PageStyle;
  name: string;
  caption: string;
  dark: string;
  accent: string;
  light: string;
  edge: string;
  panel: string;
  ink: string;
  onAccent: string;
  progress: string;
  progressInk: string;
  radius: number;
  tray: string;
  slot: string;
  card: string;
  muted: string;
  line: string;
  disabled: string;
  success: string;
  tileFace: string;
  tileSide: string;
  tileEdge: string;
  titleFill: string;
  titleInk: string;
  background: string;
  thumbnail: string;
}

/** Shared food art; four independent materials and accessible palettes. */
export const PAGE_THEMES: PageTheme[] = [
  {
    id: 1,
    name: '市井朱红',
    titleFill: '#A83222', titleInk: '#FFE0A0',
    caption: '朱红招牌 · 墨绿古铜',
    dark: '#183C32',
    accent: '#A83222',
    light: '#E7B85B',
    edge: '#C59950',
    panel: '#F6E6C8',
    ink: '#4D2B1C',
    onAccent: '#FFF4D8',
    progress: '#183C32ED',
    progressInk: '#FFF4D8',
    radius: 20,
    tray: '#6B4527',
    slot: '#463620',
    card: '#FFF3DB',
    muted: '#76583F',
    line: '#B28A52',
    disabled: '#D5C6AE',
    success: '#426D43',
    tileFace: '#FFF2D9',
    tileSide: '#AC7943',
    tileEdge: '#DFC393',
    background: 'themes/style-01', thumbnail: 'themes/thumb-01',
  },
  {
    id: 4,
    name: '奶油黏土',
    titleFill: '#E98A4E', titleInk: '#FFF8DE',
    caption: '奶油软陶 · 橙绿暖光',
    dark: '#8C5A30',
    accent: '#518B43',
    light: '#A8CF7C',
    edge: '#E4B57C',
    panel: '#FFF0CF',
    ink: '#653C22',
    onAccent: '#FFF8E7',
    progress: '#FFF1D9EE',
    progressInk: '#49743D',
    radius: 38,
    tray: '#E69C53',
    slot: '#E4BE86',
    card: '#FFF5DF',
    muted: '#826445',
    line: '#D7B98B',
    disabled: '#E3D4BA',
    success: '#4C7D3F',
    tileFace: '#FFF1CF',
    tileSide: '#D6A675',
    tileEdge: '#EBC99A',
    background: 'themes/style-04', thumbnail: 'themes/thumb-04',
  },
  {
    id: 8,
    name: '青瓷雅韵',
    titleFill: '#F3F3E2', titleInk: '#224D40',
    caption: '青瓷釉色 · 象牙雅室',
    dark: '#224D40',
    accent: '#497F68',
    light: '#B5D3B8',
    edge: '#A5B994',
    panel: '#F3F3E2',
    ink: '#264E40',
    onAccent: '#FFFBE8',
    progress: '#F3F3E2EE',
    progressInk: '#264E40',
    radius: 26,
    tray: '#98BAA3',
    slot: '#6A927B',
    card: '#FFFBEA',
    muted: '#58725E',
    line: '#A4B49A',
    disabled: '#D4DDCE',
    success: '#477345',
    tileFace: '#F4F7E7',
    tileSide: '#8AAE97',
    tileEdge: '#C4D9BE',
    background: 'themes/style-08', thumbnail: 'themes/thumb-08',
  },
  {
    id: 9,
    name: '宣纸朱印',
    titleFill: '#FAF0DB', titleInk: '#362A21',
    caption: '宣纸留白 · 朱印墨韵',
    dark: '#5A3023',
    accent: '#A72E23',
    light: '#D89065',
    edge: '#BD925B',
    panel: '#FAF0DB',
    ink: '#362A21',
    onAccent: '#FFF3D8',
    progress: '#FBF0DCEE',
    progressInk: '#6E3023',
    radius: 14,
    tray: '#B88957',
    slot: '#D2B286',
    card: '#FFF5E1',
    muted: '#7D6550',
    line: '#C6A879',
    disabled: '#DED1BA',
    success: '#526E45',
    tileFace: '#FFF4DE',
    tileSide: '#B79870',
    tileEdge: '#E0C9A5',
    background: 'themes/style-09', thumbnail: 'themes/thumb-09',
  },
];

// New numbering must not reinterpret an old 1/2/7/9 preference.
export const PAGE_STYLE_KEY = 'hotpot.page-style.v2';
let currentStyle: PageStyle = 1;

export function normalizePageStyle(value: unknown): PageStyle {
  const id = Number(value);
  return PAGE_THEMES.some((theme) => theme.id === id)
    ? id as PageStyle : 1;
}

export function getPageTheme(): PageTheme {
  return PAGE_THEMES.find((theme) => theme.id === currentStyle)!;
}

export function setPageTheme(style: PageStyle): void {
  currentStyle = normalizePageStyle(style);
}

export function readPageStyle(storage: {
  getItem(key: string): string | null;
}): PageStyle {
  try {
    const saved = storage.getItem(PAGE_STYLE_KEY);
    if (saved !== null) return normalizePageStyle(saved);
    const old = Number(storage.getItem('hotpot.page-style.v1'));
    const migrated: Record<number, PageStyle> = {1: 8, 2: 1, 7: 8, 9: 9, 10: 4};
    return migrated[old] || 1;
  } catch {
    return 1;
  }
}

export function savePageStyle(storage: {
  setItem(key: string, value: string): void;
}, style: PageStyle): boolean {
  try {
    storage.setItem(PAGE_STYLE_KEY, String(normalizePageStyle(style)));
    return true;
  } catch {
    return false;
  }
}
