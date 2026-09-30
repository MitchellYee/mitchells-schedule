import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { nowCN, todayCN } from '../time';
import { useStore } from '../store/useStore';
import { calColorVars, isDone } from '../types';
import { expandOccurrences } from '../domain/recurrence';
import { LogoMark } from './Logo';

/**
 * 桌面悬浮窗（Electron 专用，?mode=float 加载）：
 * 初始 = 右下角图标球；悬停 = 展开当天行程卡；单击 = 打开完整界面。
 * 透明区域通过 chronaDesktop.setIgnoreMouse 穿透，不挡下面的应用。
 */
export default function FloatWindow() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);

  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void init(); }, [init]);

  // 透明背景（悬浮窗窗口本身 transparent）
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';
  }, []);

  // 鼠标穿透管理：不在 UI 元素上时让窗口整体穿透（forward 保持 mousemove 监听）；
  // 拖动期间锁定不穿透，避免拖动中窗口失去鼠标事件导致 pointerup 丢失
  useEffect(() => {
    if (!window.chronaDesktop) return;
    const onMove = (e: MouseEvent) => {
      if (dragState.current) return; // 拖动中保持接收事件
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const onUI = !!(el && (el as HTMLElement).closest('[data-float-ui]'));
      window.chronaDesktop!.setIgnoreMouse(!onUI);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const todayKey = todayCN();
  const calById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);

  const today = useMemo(() => {
    const dayStart = nowCN().startOf('day').valueOf();
    const dayEnd = dayStart + 86_400_000;
    const visible = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
    const rows: { key: string; title: string; start: number; end: number; color: string; allDay: boolean }[] = [];
    for (const ev of events) {
      if (!visible.has(ev.calendarId)) continue;
      for (const o of expandOccurrences(ev, dayStart, dayEnd)) {
        const cal = calById.get(ev.calendarId);
        rows.push({
          key: `${ev.id}|${o.start}`,
          title: ev.title,
          start: o.start,
          end: o.end,
          color: calColorVars(cal?.color ?? 'graphite').bar,
          allDay: ev.isAllDay,
        });
      }
    }
    rows.sort((a, b) => a.start - b.start);
    // 今日任务/待办：未完成类（todo/deferred）且区间覆盖今天
    const todos = tasks.filter((t) => {
      if (isDone(t.status)) return false;
      const from = t.startDate || t.dueDate;
      return !!from && !!t.dueDate && from <= todayKey && t.dueDate >= todayKey;
    });
    return { rows, todos };
  }, [events, calendars, tasks, todayKey, calById]);

  const openMain = () => {
    if (window.chronaDesktop) {
      void window.chronaDesktop.showMain();
    }
  };

  const quit = () => {
    if (window.chronaDesktop) void window.chronaDesktop.quit();
  };

  /* -------- 悬浮球拖动（pointer 增量移动窗口；位移 <4px 视为点击） --------
   * 拖动中锁定鼠标不穿透；指针脱离（松键/离开球/窗口失焦）立即结束拖动状态 */
  const dragState = useRef<{ moved: boolean } | null>(null);
  const endDrag = (save: boolean) => {
    const st = dragState.current;
    dragState.current = null;
    if (st && save && st.moved && window.chronaDesktop) {
      void window.chronaDesktop.saveFloatPos();
    }
  };
  const onBallPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragState.current = { moved: false };
    window.chronaDesktop?.setIgnoreMouse(false); // 拖动期间必须接收事件
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBallPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st) return;
    if (e.buttons === 0) {
      // 指针已脱离（松开发生在窗口外）：立即停止拖动
      endDrag(true);
      return;
    }
    if (e.movementX || e.movementY) {
      st.moved = true;
      void window.chronaDesktop?.moveFloat(e.movementX, e.movementY);
    }
  };
  const onBallPointerUp = () => {
    const st = dragState.current;
    endDrag(true);
    if (st && !st.moved) openMain();
  };
  // 兜底：窗口级松开/取消/失焦时清拖动状态（指针可能在窗口外松开）
  useEffect(() => {
    const clear = () => endDrag(false);
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
      window.removeEventListener('blur', clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = nowCN();
  const use24h = settings.use24h;
  const appName = settings.appName;

  return (
    <div ref={rootRef} className="relative h-screen w-screen select-none" style={{ pointerEvents: 'none' }}>
      {/* 行程卡片（hover 展开） */}
      <div
        data-float-ui
        className="absolute bottom-4 right-4 w-[336px] origin-bottom-right overflow-hidden rounded-2xl border border-line bg-raised shadow-panel transition-all duration-200 ease-out"
        style={{
          pointerEvents: expanded ? 'auto' : 'none',
          opacity: expanded ? 1 : 0,
          transform: expanded ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(76px)',
        }}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-[13px] font-bold text-tp">
              {now.format('M月D日')} {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.day()]}
            </div>
            <div className="text-[11px] text-tt">今天 · {today.rows.length} 项日程{today.todos.length ? ` · ${today.todos.length} 待办` : ''}</div>
          </div>
          <LogoMark size={26} />
        </div>

        <div className="max-h-[280px] overflow-y-auto px-2 py-2">
          {today.todos.map((t) => (
            <button
              key={t.id}
              onClick={() => void useStore.getState().toggleTask(t.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--hover-overlay)]"
              style={{ color: 'var(--accent)' }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border-2 border-current" />
              <span className="truncate text-[12px] font-semibold">{t.title}</span>
              <span className="ml-auto shrink-0 text-[10px] opacity-70">今日截止 · 点击完成</span>
            </button>
          ))}
          {today.rows.map((r) => (
            <button
              key={r.key}
              onClick={openMain}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--hover-overlay)]"
            >
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: r.color }} />
              <span className="w-24 shrink-0 text-[11px] tabular-nums text-ts">
                {r.allDay ? '全天' : `${dayjs(r.start).format(use24h ? 'HH:mm' : 'h:mm A')}–${dayjs(r.end).format(use24h ? 'HH:mm' : 'h:mm A')}`}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-tp">{r.title}</span>
            </button>
          ))}
          {today.rows.length === 0 && today.todos.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-tt">今天暂无安排 🎵</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
          <button
            onClick={openMain}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-contrast)] hover:opacity-90"
          >
            打开完整界面
          </button>
          <button onClick={quit} className="rounded-lg px-2 py-1.5 text-[11px] text-tt hover:text-danger" title="退出程序">
            退出程序
          </button>
        </div>
      </div>

      {/* 悬浮球（初始状态）：拖动移动位置，单击打开完整界面 */}
      <button
        data-float-ui
        className="absolute bottom-4 right-4 flex h-[64px] w-[64px] cursor-grab items-center justify-center rounded-full border border-white/10 bg-[#17181F] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:scale-105 active:cursor-grabbing"
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
        onMouseEnter={() => setExpanded(true)}
        onPointerDown={onBallPointerDown}
        onPointerMove={onBallPointerMove}
        onPointerUp={onBallPointerUp}
        onPointerCancel={onBallPointerUp}
        onPointerLeave={(e) => {
          // 指针脱离球体即结束拖动（用户的建议方案）
          if (dragState.current && e.buttons === 0) endDrag(true);
        }}
        title={`${appName} —— 拖动移动，悬停看今天，单击打开`}
      >
        <LogoMark size={44} shape="circle" />
      </button>

      {!loaded && (
        <div data-float-ui className="absolute bottom-[88px] right-6 rounded-lg bg-raised px-3 py-1.5 text-[11px] text-ts shadow-pop" style={{ pointerEvents: 'auto' }}>
          加载中…
        </div>
      )}
    </div>
  );
}
