import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { nowCN, todayCN } from '../time';
import { useStore } from '../store/useStore';
import { snapMinutes } from '../domain/time';

interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  run: () => void;
}

/** 命令面板（设计方案 §4.2） */
export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const s = useStore.getState();
    return [
      { id:'home',label:'打开工作台',keywords:'home 工作台 首页',run:()=>s.setActiveTool('home') },
      { id:'schedule',label:'打开日程与任务',keywords:'schedule 日程 工具',run:()=>s.setActiveTool('schedule') },
      { id:'translate',label:'打开双向翻译',keywords:'translate translation 翻译 中英',run:()=>s.setActiveTool('translate') },
      { id: 'view-day', label: '切换到日视图', keywords: 'view day 1 d', run: () => s.setView('day') },
      { id: 'view-week', label: '切换到周视图', keywords: 'view week 2 w', run: () => s.setView('week') },
      { id: 'view-month', label: '切换到月视图', keywords: 'view month 3 m', run: () => s.setView('month') },
      { id: 'view-agenda', label: '切换到议程视图', keywords: 'view agenda list 4 a', run: () => s.setView('agenda') },
      { id: 'today', label: '回到今天', keywords: 'today t', run: () => s.goToday() },
      { id: 'next', label: '下一周期', keywords: 'next n', run: () => s.shiftPeriod(1) },
      { id: 'prev', label: '上一周期', keywords: 'prev previous p', run: () => s.shiftPeriod(-1) },
      { id: 'tomorrow', label: '跳到明天', keywords: 'tomorrow 明天', run: () => s.setAnchor(dayjs(todayCN()).add(1, 'day').format('YYYY-MM-DD')) },
      {
        id: 'create', label: '新建事件（今天）', keywords: 'create new event c 事件',
        run: () => {
          const now = nowCN();
          const start = Math.min(23 * 60 + 45, snapMinutes(Math.max(now.hour() * 60 + now.minute() + 15, 8 * 60), 15));
          s.openQuickCreate({ dateKey: now.format('YYYY-MM-DD'), startMin: start, endMin: Math.min(start + 60, 24 * 60), x: window.innerWidth / 2, y: 160 });
        },
      },
      {
        id: 'create-task', label: '新建待办任务', keywords: 'create new task todo 待办 任务 shift+c',
        run: () => {
          const today = todayCN();
          s.openTaskQuick({ mode: 'todo', startDate: today, dueDate: today, x: window.innerWidth / 2, y: 160 });
        },
      },
      {
        id: 'create-mission', label: '新建任务 / 跨天任务', keywords: 'create mission project 跨天任务 长期任务',
        run: () => {
          const today = todayCN();
          s.openTaskQuick({ mode: 'task', startDate: today, dueDate: today, x: window.innerWidth / 2, y: 160 });
        },
      },
      {
        id: 'theme', label: '切换明暗主题', keywords: 'theme dark light 主题',
        run: () => s.updateSettings({ theme: s.settings.theme === 'dark' ? 'light' : 'dark' }),
      },
      { id: 'sidebar', label: '折叠 / 展开左侧栏', keywords: 'sidebar s', run: () => s.toggleSidebar() },
      { id: 'taskpanel', label: '折叠 / 展开任务面板', keywords: 'task panel r', run: () => s.toggleTaskPanel() },
      { id: 'undo', label: '撤销上一步操作', keywords: 'undo z', run: () => void s.undo() },
      { id: 'help', label: '查看快捷键帮助', keywords: 'help shortcuts ?', run: () => s.setHelpOpen(true) },
    ];
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const s = useStore.getState();
    const matches: Command[] = [
      ...events.filter((e) => [e.title, e.description, e.location].join(' ').toLowerCase().includes(q)).slice(0, 8).map((e) => ({
        id: `event-${e.id}`, label: e.title, hint: `日程 · ${dayjs(e.start).format('M月D日 HH:mm')}`, keywords: '',
        run: () => { s.setActiveTool('schedule'); s.setAnchor(dayjs(e.start).format('YYYY-MM-DD')); s.setView('day'); s.openDrawer(e.id); },
      })),
      ...tasks.filter((t) => [t.title, t.description, ...t.subtasks.map((step) => step.title)].join(' ').toLowerCase().includes(q)).slice(0, 8).map((t) => ({
        id: `task-${t.id}`, label: t.title, hint: `${t.startDate ? '任务' : '待办'} · ${t.dueDate || '未设日期'}`, keywords: '',
        run: () => { s.setActiveTool('schedule'); s.openEditTask(t.id); },
      })),
    ];
    return [...commands.filter((c) => (c.label + ' ' + c.keywords).toLowerCase().includes(q)), ...matches];
  }, [query, commands, events, tasks]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  function run(cmd: Command) {
    setOpen(false);
    if (!['home','translate','theme','help'].includes(cmd.id)) useStore.getState().setActiveTool('schedule');
    cmd.run();
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onPointerDown={() => setOpen(false)} />
      <div
        className="fixed left-1/2 top-[15%] z-[61] w-[520px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-raised shadow-panel"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && filtered[index]) { e.preventDefault(); run(filtered[index]); }
          else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <span className="text-ts">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索日程、任务和命令"
            placeholder="搜索日程、任务、步骤或命令…"
            className="w-full bg-transparent py-3.5 text-[14px] text-tp outline-none placeholder:text-tt"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-tt">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-tt">没有找到相关日程、任务或命令</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              data-idx={i}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(c)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px] ${
                i === index ? 'bg-accent-soft text-accent' : 'text-tp hover:bg-[var(--hover-overlay)]'
              }`}
            >
              <span className="font-medium">{c.label}</span>
              {c.hint && <span className="text-[11px] text-tt">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
