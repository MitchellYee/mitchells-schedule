import { DEFAULT_SETTINGS, type Settings, type ColorScheme } from '../types';

type Palette = { accent: string; base: string; subtle: string; raised: string; border: string; strong: string; text: string; secondary: string; muted: string; soft: string };
export const COLOR_SCHEMES: { id: ColorScheme; name: string; description: string; swatches: string[]; light: Palette; dark: Palette }[] = [
  { id: 'forest', name: '松墨', description: '深松绿 · 奶油白', swatches: ['#193d38','#95ada0','#f4f2eb'],
    light: { accent:'#315e53', base:'#fafaf6', subtle:'#f0f2ec', raised:'#ffffff', border:'#e1e6de', strong:'#c4cec2', text:'#213d35', secondary:'#62746a', muted:'#7d8b80', soft:'#e4ece3' },
    dark: { accent:'#a0c6b4', base:'#152723', subtle:'#101e1b', raised:'#1d322c', border:'#30463d', strong:'#52685c', text:'#e8eee5', secondary:'#abbdb0', muted:'#869e8f', soft:'#2d473c' } },
  { id: 'ocean', name: '雾蓝', description: '岩蓝 · 雾灰白', swatches:['#344e6b','#afc4d2','#eff3f5'],
    light: { accent:'#476584', base:'#f8fafb', subtle:'#eef2f5', raised:'#ffffff', border:'#dfe6ec', strong:'#c1cdd8', text:'#293e53', secondary:'#64788b', muted:'#7f91a1', soft:'#e3ebf3' },
    dark: { accent:'#a9c4df', base:'#192431', subtle:'#131d28', raised:'#223141', border:'#354657', strong:'#52697e', text:'#e5edf4', secondary:'#aebfce', muted:'#869cb0', soft:'#30475e' } },
  { id:'sand', name:'暖砂', description:'烟棕 · 燕麦白', swatches:['#73533e','#cbb899','#f5efe5'],
    light: { accent:'#806047', base:'#fcfaf6', subtle:'#f4efe7', raised:'#fffefa', border:'#e9e0d5', strong:'#d3c4b3', text:'#493b31', secondary:'#847160', muted:'#9a8876', soft:'#eee1d2' },
    dark: { accent:'#d4ba99', base:'#29231c', subtle:'#211c17', raised:'#352d24', border:'#4c4034', strong:'#6b5a49', text:'#f0e6d9', secondary:'#c7b69f', muted:'#a18e77', soft:'#4a3b2d' } },
  { id:'plum', name:'暮紫', description:'灰紫 · 月光白', swatches:['#625772','#c4b9cf','#f2eff5'],
    light: { accent:'#736182', base:'#faf8fc', subtle:'#f1edf5', raised:'#ffffff', border:'#e5deeb', strong:'#cdc0d7', text:'#43384e', secondary:'#80718e', muted:'#9788a4', soft:'#ece3f2' },
    dark: { accent:'#cbb5dd', base:'#27212e', subtle:'#1e1925', raised:'#332a3c', border:'#493c54', strong:'#695678', text:'#eee5f4', secondary:'#bfaecb', muted:'#9c87ac', soft:'#483754' } },
];

export function normalizeSettings(raw: Partial<Settings> = {}): Settings {
  const settings = { ...DEFAULT_SETTINGS, ...raw };
  if (!settings.appName || ["Mitchell's Schedule", '时叙 Chrona', 'Chrona'].includes(settings.appName)) settings.appName = DEFAULT_SETTINGS.appName;
  const palette = COLOR_SCHEMES.find(p => p.id === settings.colorScheme) || COLOR_SCHEMES[0];
  settings.colorScheme = palette.id;
  // 旧任意主题色迁移到完整配色，保留兼容字段但不再开放任意值。
  settings.accentColor = palette.light.accent;
  settings.surface = 'neutral';
  if (!['comfortable', 'compact'].includes(settings.density)) settings.density = 'comfortable';
  if (!['light', 'dark', 'system'].includes(settings.theme)) settings.theme = 'light';
  settings.hourHeight = Number.isFinite(settings.hourHeight) ? Math.min(176, Math.max(24, settings.hourHeight)) : 56;
  settings.autoFitHours = raw.autoFitHours !== false;
  return settings;
}

export function appearanceTokens(scheme: ColorScheme, dark: boolean) {
  const p = (COLOR_SCHEMES.find(p => p.id === scheme) || COLOR_SCHEMES[0])[dark ? 'dark' : 'light'];
  return {
    '--accent':p.accent, '--accent-contrast':dark ? p.subtle : '#ffffff', '--accent-soft':p.soft,
    '--today-tint':`color-mix(in srgb, ${p.accent} 5%, transparent)`,
    '--bg-base':p.base, '--bg-subtle':p.subtle, '--bg-raised':p.raised,
    '--border-subtle':p.border, '--border-strong':p.strong,
    '--text-primary':p.text, '--text-secondary':p.secondary, '--text-tertiary':p.muted,
    '--completed-bg':p.subtle, '--completed-fg':p.secondary, '--completed-bar':p.muted,
    '--hero-glow':`color-mix(in srgb, ${p.accent} 9%, transparent)`,
    '--shadow-pop':`0 3px 12px ${dark?'#00000025':'#243d2f0a'}`,
    '--shadow-panel':`0 18px 64px -16px ${dark?'#00000070':'#243d2f26'}`,
  };
}
