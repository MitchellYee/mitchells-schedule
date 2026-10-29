import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { nowCN, todayCN } from '../time';
import { useStore } from '../store/useStore';
import { periodTitle } from '../domain/time';
import type { ViewKind } from '../types';
import { Kbd } from './Sidebar';
import { LogoMark } from './Logo';
import ToolIcon from './ToolIcon';

const VIEWS: { key: ViewKind; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'agenda', label: '议程' },
];

export default function TopBar() {
  const s = useStore();
  return <header className="app-header shrink-0 border-b border-line bg-base">
    <div className="workspace-header">
      <button className="workspace-brand" onClick={()=>s.setActiveTool('home')} aria-label="返回工作台"><LogoMark size={36}/><span><strong>{s.settings.appName}</strong><small>PERSONAL TOOLBOX</small></span></button>
      <nav className="workspace-nav" aria-label="工具导航">{[['home','工作台'],['schedule','日程'],['translate','翻译']].map(([id,label])=><button key={id} aria-current={s.activeTool===id?'page':undefined} onClick={()=>s.setActiveTool(id)}><ToolIcon id={id} size={17}/><span>{label}</span></button>)}</nav>
      <div className="workspace-actions">
        <button className="workspace-search" aria-label="搜索日程、任务和命令" onClick={()=>s.setPaletteOpen(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><Kbd>Ctrl K</Kbd></button>
        <ThemeBtn/><SettingsBtn/>
      </div>
    </div>
    {s.activeTool === 'schedule' && <div className="calendar-toolbar flex h-[48px] items-center gap-3 whitespace-nowrap border-t border-line px-5">
      <button aria-label="切换日历侧栏" onClick={s.toggleSidebar} title="日历侧栏 (S)" className="h-7 w-7 rounded text-ts hover:bg-subtle">☰</button>
      <div className="flex items-center gap-1">
        <button className="rounded-lg border border-line px-3 py-1 text-[12px] font-medium text-tp hover:bg-subtle" onClick={s.goToday}>今天</button>
        <IconBtn label="上一周期 (P)" onClick={() => s.shiftPeriod(-1)} dir="left" />
        <IconBtn label="下一周期 (N)" onClick={() => s.shiftPeriod(1)} dir="right" />
      </div>
      <div className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-0.3px] text-tp">{periodTitle(s.view, dayjs(s.anchor), s.settings.weekStartsOn)}</div>
      {(s.view==='week' || s.view==='day') && <button onClick={() => window.dispatchEvent(new Event('working-tool:reset-hours'))} title="恢复约十小时视野，定位 08:00；Ctrl + 滚轮可缩放" className="rounded-lg px-2 py-1 text-[11px] text-ts hover:bg-subtle">08:00–18:00 ↺</button>}
      <div className="flex rounded-lg bg-subtle p-0.5" role="group" aria-label="日历视图">
        {VIEWS.map((v) => <button key={v.key} aria-pressed={s.view===v.key} onClick={() => s.setView(v.key)} className={'rounded-md px-3 py-1 text-[12px] font-medium transition-colors '+(s.view===v.key?'bg-base text-accent shadow-sm':'text-ts hover:text-tp')}>{v.label}</button>)}
      </div>
      <button aria-label="切换任务面板" onClick={s.toggleTaskPanel} title="任务面板 (R)" className="rounded-lg px-2 py-1 text-[12px] text-ts hover:bg-subtle">任务栏</button>
      <CreateMenu />
    </div>}
  </header>;
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
    const startMin = Math.min(23 * 60 + 45, Math.max(Math.round((now.hour() * 60 + now.minute() + 15) / 15) * 15, 8 * 60));
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

  function createMission() {
    setOpen(false);
    const today = todayCN();
    useStore.getState().openTaskQuick({ mode: 'task', startDate: today, dueDate: today, x: window.innerWidth / 2, y: 160 });
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
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-tp hover:bg-[var(--hover-overlay)]" onClick={createMission}>
            <span>▤</span>
            <span className="flex-1">新建任务 / 跨天任务</span>
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
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  return (
    <button
      className="rounded-lg border border-line p-1.5 text-ts hover:border-accent hover:text-tp"
      onClick={() => setSettingsOpen(true)}
      title="设置"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

