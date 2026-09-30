import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { todayCN } from '../time';
import { useStore } from '../store/useStore';
import { calColorVars, PALETTE_KEYS, type PaletteKey } from '../types';
import { expandOccurrences } from '../domain/recurrence';
import { weekDays, WEEKDAY_SHORT } from '../domain/time';

/** 左侧栏：迷你月历（密度点）+ 日历列表（颜色/显隐）（设计方案 §4.1） */
export default function Sidebar() {
  const anchor = useStore((s) => s.anchor);
  const setAnchor = useStore((s) => s.setAnchor);
  const setView = useStore((s) => s.setView);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-line bg-subtle">
      <MiniMonth anchor={anchor} weekStartsOn={weekStartsOn} onPick={(key) => { setAnchor(key); setView('day'); }} />
      <div className="mx-3 mb-2 h-px bg-line" />
      <CalendarList />
      <div className="mt-auto p-3 text-[11px] leading-5 text-tt">
        提示：单击 / 拖拽空白格新建事件<br />
        按住 Alt 拖拽可 1 分钟微调<br />
        按 <Kbd>?</Kbd> 查看全部快捷键
      </div>
    </aside>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-base px-1 py-px font-sans text-[10px] font-semibold text-ts">
      {children}
    </kbd>
  );
}

function MiniMonth({ anchor, weekStartsOn, onPick }: { anchor: string; weekStartsOn: 0 | 1; onPick: (key: string) => void }) {
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const [monthOffset, setMonthOffset] = useState(0);
  const base = dayjs(anchor).add(monthOffset, 'month');

  const days = useMemo(() => {
    const first = base.startOf('month');
    const week = weekDays(first, 7, weekStartsOn);
    return Array.from({ length: 42 }, (_, i) => week[0].add(i, 'day'));
  }, [base.valueOf(), weekStartsOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const dotByDay = useMemo(() => {
    const visible = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
    const rangeStart = base.startOf('month').subtract(7, 'day').valueOf();
    const rangeEnd = base.endOf('month').add(14, 'day').valueOf();
    const map = new Map<string, PaletteKey>();
    for (const ev of events) {
      if (!visible.has(ev.calendarId)) continue;
      for (const o of expandOccurrences(ev, rangeStart, rangeEnd)) {
        const key = dayjs(o.start).format('YYYY-MM-DD');
        if (!map.has(key)) {
          const cal = calendars.find((c) => c.id === ev.calendarId);
          if (cal) map.set(key, cal.color);
        }
      }
    }
    return map;
  }, [events, calendars, base.valueOf()]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayKey = todayCN();
  const anchorMonth = base.month();

  return (
    <div className="px-3 pt-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-tp">{base.format('YYYY年M月')}</span>
        <div className="flex gap-0.5">
          <button className="rounded p-1 text-ts hover:bg-[var(--hover-overlay)]" onClick={() => setMonthOffset((m) => m - 1)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="rounded p-1 text-ts hover:bg-[var(--hover-overlay)]" onClick={() => setMonthOffset((m) => m + 1)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7">
        {weekDays(base.startOf('month'), 7, weekStartsOn).map((d) => (
          <div key={d.day()} className="py-1 text-center text-[10px] font-medium text-tt">{WEEKDAY_SHORT[d.day()]}</div>
        ))}
        {days.map((d) => {
          const key = d.format('YYYY-MM-DD');
          const isToday = key === todayKey;
          const isSelected = key === anchor;
          const dim = d.month() !== anchorMonth;
          const dotColor = dotByDay.get(key);
          return (
            <button
              key={key}
              onClick={() => onPick(key)}
              className={`relative flex h-8 flex-col items-center justify-center rounded-md text-[12px] tabular-nums hover:bg-[var(--hover-overlay)] ${
                isSelected ? 'font-bold text-accent' : dim ? 'text-tt' : 'text-tp'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isToday ? 'bg-accent font-bold text-[var(--accent-contrast)]' : ''}`}>
                {d.date()}
              </span>
              {dotColor && !isToday && (
                <span
                  className="absolute bottom-0.5 h-1 w-1 rounded-full"
                  style={{ background: calColorVars(dotColor).bar }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarList() {
  const calendars = useStore((s) => s.calendars);
  const toggleCalendar = useStore((s) => s.toggleCalendar);
  const setCalendarColor = useStore((s) => s.setCalendarColor);
  const addCalendar = useStore((s) => s.addCalendar);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  return (
    <div className="px-3 pb-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ts">我的日历</span>
        <button
          className="rounded p-0.5 text-ts hover:bg-[var(--hover-overlay)]"
          title="新建日历"
          onClick={() => { setAdding(true); setNewName(''); }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>

      {adding && (
        <input
          autoFocus
          value={newName}
          placeholder="日历名称，回车创建"
          onChange={(e) => setNewName(e.target.value)}
          onBlur={() => setAdding(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) {
              void addCalendar(newName.trim(), PALETTE_KEYS[Math.floor(Math.random() * 10)]);
              setAdding(false);
            } else if (e.key === 'Escape') setAdding(false);
          }}
          className="mb-1 w-full rounded-md border border-line bg-base px-2 py-1 text-[12px] outline-none focus:border-accent"
        />
      )}

      <div className="space-y-0.5">
        {calendars.map((c) => {
          const v = calColorVars(c.color);
          return (
            <div key={c.id}>
              <div className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-[var(--hover-overlay)]">
                <button
                  className="h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-opacity"
                  style={{ background: c.isVisible ? v.bar : 'transparent', borderColor: v.bar }}
                  title="更改颜色"
                  onClick={() => setEditing(editing === c.id ? null : c.id)}
                />
                <button
                  className={`min-w-0 flex-1 truncate text-left text-[13px] ${c.isVisible ? 'text-tp' : 'text-tt line-through'}`}
                  onClick={() => void toggleCalendar(c.id)}
                  title="点击显示 / 隐藏"
                >
                  {c.name}
                </button>
                <span className="text-[10px] text-tt opacity-0 transition-opacity group-hover:opacity-100">
                  {c.isVisible ? '隐藏' : '显示'}
                </span>
              </div>
              {editing === c.id && (
                <div className="mb-1 grid grid-cols-11 gap-1 rounded-md border border-line bg-base p-2 shadow-pop">
                  {PALETTE_KEYS.map((k) => (
                    <button
                      key={k}
                      title={k}
                      onClick={() => { void setCalendarColor(c.id, k); setEditing(null); }}
                      className={`h-4 w-4 rounded-full hover:scale-110 ${c.color === k ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                      style={{ background: `var(--cal-${k}-bar)` }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
