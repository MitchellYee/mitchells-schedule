import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { DEFAULT_SETTINGS, type ThemeMode } from '../types';
import { LogoMark } from './Logo';

/** 设置中心：DIY 软件名与图标 + 全局偏好（顶栏左上角图标菜单进入） */
export default function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [name, setName] = useState(settings.appName);
  const fileRef = useRef<HTMLInputElement>(null);
  const iconInputKey = useRef(0);

  useEffect(() => {
    if (open) setName(settings.appName);
  }, [open, settings.appName]);

  if (!open) return null;

  function saveName() {
    const v = name.trim().slice(0, 30);
    if (v && v !== settings.appName) updateSettings({ appName: v });
  }

  function pickIcon(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/png');
      updateSettings({ appIcon: dataUrl });
      void window.chronaDesktop?.setIcon?.(dataUrl);
    };
    img.src = url;
  }

  function resetIcon() {
    updateSettings({ appIcon: '' });
    void window.chronaDesktop?.setIcon?.('');
  }

  const themeOpts: [ThemeMode, string][] = [
    ['system', '跟随系统'],
    ['light', '浅色'],
    ['dark', '深色'],
  ];

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onPointerDown={() => setOpen(false)} />
      <div className="fixed left-1/2 top-[12%] z-[61] max-h-[80vh] w-[460px] max-w-[92vw] overflow-y-auto rounded-2xl border border-line bg-raised p-6 shadow-panel">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-tp">设置</h2>
          <button className="rounded-md p-1.5 text-ts hover:bg-[var(--hover-overlay)]" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* DIY：名字与图标 */}
        <div className="mb-6">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-accent">个性化</div>
          <div className="flex items-center gap-4">
            <LogoMark size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex gap-2">
                <input
                  value={name}
                  maxLength={30}
                  onChange={(e) => setName(e.currentTarget.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setName(settings.appName);
                  }}
                  aria-label="软件名称"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-base px-3 py-1.5 text-[13px] text-tp outline-none focus:border-accent"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ts hover:text-tp"
                  onClick={() => {
                    iconInputKey.current += 1;
                    fileRef.current?.click();
                  }}
                >
                  上传图标…
                </button>
                {settings.appIcon && (
                  <button className="rounded-lg px-2 py-1 text-[12px] text-ts hover:text-tp" onClick={resetIcon}>
                    恢复默认
                  </button>
                )}
                <input
                  key={iconInputKey.current}
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) pickIcon(f);
                    e.currentTarget.value = '';
                  }}
                />
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-ts">名字与图标即时生效：同步标签页标题；桌面版同步窗口标题、托盘与悬浮球。</div>
        </div>

        {/* 全局设置 */}
        <div className="space-y-4">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-accent">通用</div>

          <SettingRow label="主题">
            <Segmented
              value={settings.theme}
              options={themeOpts}
              onChange={(v) => updateSettings({ theme: v as ThemeMode })}
            />
          </SettingRow>

          <SettingRow label="时间制">
            <Segmented
              value={settings.use24h ? '24' : '12'}
              options={[['24', '24 小时'], ['12', '12 小时']]}
              onChange={(v) => updateSettings({ use24h: v === '24' })}
            />
          </SettingRow>

          <SettingRow label="周起始">
            <Segmented
              value={String(settings.weekStartsOn)}
              options={[['1', '周一'], ['0', '周日']]}
              onChange={(v) => updateSettings({ weekStartsOn: Number(v) as 0 | 1 })}
            />
          </SettingRow>

          <SettingRow label="时间格密度">
            <Segmented
              value={String(settings.hourHeight)}
              options={[['48', '紧凑'], ['56', '标准'], ['64', '宽松']]}
              onChange={(v) => updateSettings({ hourHeight: Number(v) })}
            />
          </SettingRow>
        </div>

        <div className="mt-6 border-t border-line pt-3 text-[11px] text-ts">
          想恢复出厂名字？输入或填回「{DEFAULT_SETTINGS.appName}」即可。改动仅保存在本机。
        </div>
      </div>
    </>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[13px] text-tp">{label}</span>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg bg-subtle p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
            value === v ? 'bg-base text-tp shadow-pop' : 'text-ts hover:text-tp'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
