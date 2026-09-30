import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { nowCN, todayCN } from '../time';
import { useStore } from '../store/useStore';
import { periodTitle } from '../domain/time';
import type { ViewKind } from '../types';
import { Kbd } from './Sidebar';
import { LogoMark } from './Logo';

const VIEWS: { key: ViewKind; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'agenda', label: '议程' },
];

export default function TopBar() {
  const view = useStore((s) => s.view);
  const anchor = useStore((s) => s.anchor);
  const setView = useStore((s) => s.setView);
  const shiftPeriod = useStore((s) => s.shiftPeriod);
  const goToday = useStore((s) => s.goToday);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const appName = useStore((s) => s.settings.appName);
  const updateSettings = useStore((s) => s.updateSettings);
  const [editingName, setEditingName] = useState(false);

  function commitName(e: React.FocusEvent<HTMLInputElement>) {
    const v = e.currentTarget.value.trim();
    if (v && v !== appName) updateSettings({ appName: v.slice(0, 30) });
    setEditingName(false);
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-base px-4">
      <div className="flex items-center gap-2">
        <LogoMark size={28} />
        {editingName ? (
          <input
            autoFocus
            defaultValue={appName}
            maxLength={30}
            aria-label="软件名称"
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="w-44 rounded-md border border-accent bg-base px-1.5 py-0.5 text-[14px] font-bold text-tp outline-none"
          />
        ) : (
          <span
            onDoubleClick={() => setEditingName(true)}
            title="双击修改软件名称"
            className="hidden select-none text-[14px] font-bold tracking-wide text-tp lg:inline"
          >
            {appName}
          </span>
        )}
      </div>

      <div className="ml-2 flex items-center rounded-lg bg-subtle p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
              view === v.key ? 'bg-base text-tp shadow-pop' : 'text-ts hover:text-tp'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="ml-1 flex items-center gap-1">
        <IconBtn label="上一周期 (P)" onClick={() => shiftPeriod(-1)} dir="left" />
        <button
          className="rounded-md px-2.5 py-1 text-[12px] font-medium text-ts hover:bg-[var(--hover-overlay)] hover:text-tp"
          onClick={goToday}
          title="回到今天 (T)"
        >
          今天
        </button>
        <IconBtn label="下一周期 (N)" onClick={() => shiftPeriod(1)} dir="right" />
      </div>

      <div className="ml-2 hidden min-w-0 flex-1 truncate text-center text-[14px] font-semibold text-tp md:block">
        {periodTitle(view, dayjs(anchor), weekStartsOn)}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <CreateMenu />
        <button
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ts hover:border-accent hover:text-tp"
          onClick={() => setPaletteOpen(true)}
          title="命令面板"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <Kbd>Ctrl K</Kbd>
        </button>
        <ThemeBtn />
        <SettingsBtn />
        <button
          className="rounded-lg border border-line px-2 py-1.5 text-[12px] font-semibold text-ts hover:border-accent hover:text-tp"
          onClick={() => setHelpOpen(true)}
          title="快捷键帮助 (?)"
        >
          ?
        </button>
      </div>
    </header>
  );
}

function IconBtn({ onClick, dir, label }: { onClick: () => void; dir: 'left' | 'right'; label: string }) {
  return (
    <button className="rounded-md p-1.5 text-ts hover:bg-[var(--hover-overlay)] hover:text-tp" onClick={onClick} title={label}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d={dir === 'left' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** 「+」创建菜单：新建事件（C）/ 新建任务（Shift+C）——明确的新增入口 */
function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  function createEventToday() {
    setOpen(false);
    const now = nowCN();
    const startMin = Math.max(Math.round((now.hour() * 60 + now.minute() + 15) / 15) * 15, 8 * 60);
    useStore.getState().openQuickCreate({
      dateKey: now.format('YYYY-MM-DD'),
      startMin,
      endMin: Math.min(startMin + 60, 24 * 60),
      x: window.innerWidth / 2,
      y: 160,
    });
  }

  function createTask() {
    setOpen(false);
    const today = todayCN();
    useStore.getState().openTaskQuick({ mode: 'todo', startDate: today, dueDate: today, x: window.innerWidth / 2, y: 160 });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-contrast)] hover:opacity-90"
        onClick={() => setOpen((v) => !v)}
        title="新建（事件 C / 任务 Shift+C）"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        新建
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 overflow-hidden rounded-xl border border-line bg-raised p-1.5 shadow-panel">
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-tp hover:bg-[var(--hover-overlay)]" onClick={createEventToday}>
            <span>📅</span>
            <span className="flex-1">新建事件</span>
            <Kbd>C</Kbd>
          </button>
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-tp hover:bg-[var(--hover-overlay)]" onClick={createTask}>
            <span>✓</span>
            <span className="flex-1">新建待办任务</span>
            <Kbd>Shift C</Kbd>
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeBtn() {
  const theme = useStore((s) => s.settings.theme);
  const updateSettings = useStore((s) => s.updateSettings);
  const order = ['light', 'dark', 'system'] as const;
  const next = () => updateSettings({ theme: order[(order.indexOf(theme) + 1) % 3] });
  const icon = theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '🖥';
  const label = theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统';
  return (
    <button
      className="rounded-lg border border-line px-2 py-1.5 text-[13px] leading-none text-ts hover:border-accent hover:text-tp"
      onClick={next}
      title={`主题：${label}（点击切换）`}
    >
      {icon}
    </button>
  );
}

function SettingsBtn() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="rounded-lg border border-line p-1.5 text-ts hover:border-accent hover:text-tp"
        onClick={() => setOpen((v) => !v)}
        title="设置"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-line bg-raised p-3 shadow-panel">
          <SettingRow label="密度">
            {[
              { v: 48, l: '紧凑' },
              { v: 56, l: '默认' },
              { v: 64, l: '宽松' },
            ].map((o) => (
              <ChoiceBtn key={o.v} active={settings.hourHeight === o.v} onClick={() => updateSettings({ hourHeight: o.v })}>{o.l}</ChoiceBtn>
            ))}
          </SettingRow>
          <SettingRow label="时间格式">
            <ChoiceBtn active={settings.use24h} onClick={() => updateSettings({ use24h: true })}>24 小时</ChoiceBtn>
            <ChoiceBtn active={!settings.use24h} onClick={() => updateSettings({ use24h: false })}>12 小时</ChoiceBtn>
          </SettingRow>
          <SettingRow label="每周始于">
            <ChoiceBtn active={settings.weekStartsOn === 1} onClick={() => updateSettings({ weekStartsOn: 1 })}>周一</ChoiceBtn>
            <ChoiceBtn active={settings.weekStartsOn === 0} onClick={() => updateSettings({ weekStartsOn: 0 })}>周日</ChoiceBtn>
          </SettingRow>
          <div className="mt-1 border-t border-line pt-2 text-[11px] text-tt">数据保存在本地浏览器（IndexedDB）</div>
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[12px] text-ts">{label}</span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function ChoiceBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] font-medium ${active ? 'bg-accent text-[var(--accent-contrast)]' : 'bg-subtle text-ts hover:text-tp'}`}
    >
      {children}
    </button>
  );
}
