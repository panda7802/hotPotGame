export type PageStyle = 1 | 2 | 7 | 9;

export interface PageTheme {
  id: PageStyle;
  name: string;
  caption: string;
  background: string;
  thumbnail: string;
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
}

export const PAGE_THEMES: PageTheme[] = [
  {
    id: 1, name: '青瓷竹影', caption: '月门庭院 · 青瓷竹纹',
    background: 'themes/style-01', thumbnail: 'themes/thumb-01',
    dark: '#1B3D33', accent: '#356B59', light: '#91B9A2',
    edge: '#C0B37A', panel: '#F1F3E5', ink: '#294C42',
    onAccent: '#FFF8E1', progress: '#F1F3E5EE',
    progressInk: '#294C42', radius: 26,
    tray: '#7FA795', slot: '#567D6A', card: '#FEFCED',
    muted: '#496255', line: '#849C88', disabled: '#D6DFD8',
    success: '#477345',
  },
  {
    id: 2, name: '锦绣朱楼', caption: '朱楼宴厅 · 漆红鎏金',
    background: 'themes/style-02', thumbnail: 'themes/thumb-02',
    dark: '#531D22', accent: '#963C31', light: '#BE704B',
    edge: '#E4BA64', panel: '#FFF1D7', ink: '#773B2B',
    onAccent: '#FFF2CF', progress: '#FFF3DFE8',
    progressInk: '#773B2B', radius: 18,
    tray: '#963C31', slot: '#6F2E2C',
    card: '#FFF8E9', muted: '#77543E', line: '#B89563',
    disabled: '#D7C9BA', success: '#547344',
  },
  {
    id: 7, name: '冰雪铜锅', caption: '雪夜营地 · 霜蓝暖光',
    background: 'themes/style-07', thumbnail: 'themes/thumb-07',
    dark: '#263F57', accent: '#456581', light: '#9DBBCA',
    edge: '#C4D8E0', panel: '#EEF3F3', ink: '#314E65',
    onAccent: '#FFF5DC', progress: '#314C6CE6',
    progressInk: '#FFF5DC', radius: 32,
    tray: '#425E7E', slot: '#354F6A',
    card: '#FBFAEE', muted: '#425F72', line: '#8196A4',
    disabled: '#D5DFE3', success: '#477A70',
  },
  {
    id: 9, name: '霓虹夜市', caption: '蓝紫街市 · 金属霓虹',
    background: 'themes/style-09', thumbnail: 'themes/thumb-09',
    dark: '#121C31', accent: '#6D4786', light: '#B77FAD',
    edge: '#58CBD3', panel: '#202A42', ink: '#F5EDDA',
    onAccent: '#F1F6EF', progress: '#15233FEA',
    progressInk: '#D8F4F7', radius: 20,
    tray: '#253C58', slot: '#242C49',
    card: '#2D3853', muted: '#CCD7E8', line: '#6686A0',
    disabled: '#354057', success: '#69D1C7',
  },
];

export const PAGE_STYLE_KEY = 'hotpot.page-style.v1';
let currentStyle: PageStyle = 2;

export function normalizePageStyle(value: unknown): PageStyle {
  const id = Number(value);
  return PAGE_THEMES.some((theme) => theme.id === id)
    ? id as PageStyle : 2;
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
    return normalizePageStyle(storage.getItem(PAGE_STYLE_KEY));
  } catch {
    return 2;
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
