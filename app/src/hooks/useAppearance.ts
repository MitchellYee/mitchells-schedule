import { useEffect } from 'react';
import { useStore, resolveTheme } from '../store/useStore';
import { appearanceTokens } from '../domain/appearance';

/** 主窗口与悬浮窗使用相同外观入口。 */
export function useAppearance() {
  const settings = useStore((s) => s.settings);
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      const dark = resolveTheme(settings.theme) === 'dark';
      root.classList.toggle('dark', dark);
      root.dataset.scheme = settings.colorScheme;
      root.dataset.density = settings.density;
      Object.entries(appearanceTokens(settings.colorScheme, dark)).forEach(([key, value]) => root.style.setProperty(key, value));
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.colorScheme, settings.density]);
}
