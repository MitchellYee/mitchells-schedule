import { useEffect } from 'react';
import dayjs from 'dayjs';
import { nowCN, todayCN } from './time';
import { useStore, resolveTheme } from './store/useStore';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import TaskPanel from './components/TaskPanel';
import StatusBar from './components/StatusBar';
import TimeGrid from './components/views/TimeGrid';
import MonthView from './components/views/MonthView';
import AgendaView from './components/views/AgendaView';
import EventDrawer from './components/editor/EventDrawer';
import QuickCreatePopover from './components/editor/QuickCreatePopover';
import TaskQuickCreate from './components/editor/TaskQuickCreate';
import CommandPalette from './components/CommandPalette';
import ShortcutsHelp from './components/ShortcutsHelp';
import SettingsDialog from './components/SettingsDialog';
import Toasts from './components/Toasts';
import { LogoMark } from './components/Logo';
import { snapMinutes, weekDays } from './domain/time';

export default function App() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const view = useStore((s) => s.view);
  const anchor = useStore((s) => s.anchor);
  const theme = useStore((s) => s.settings.theme);
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const taskPanelCollapsed = useStore((s) => s.taskPanelCollapsed);
  const appName = useStore((s) => s.settings.appName);

  useEffect(() => { void init(); }, [init]);

  // 软件名（DIY）：同步标签页标题；桌面版同时改窗口标题与托盘提示
  useEffect(() => {
    document.title = appName;
    void window.chronaDesktop?.renameApp?.(appName);
  }, [appName]);

  // 自定义图标（DIY）：桌面版启动/更改时同步窗口图标与托盘
  const appIcon = useStore((s) => s.settings.appIcon);
  useEffect(() => {
    if (appIcon) void window.chronaDesktop?.setIcon?.(appIcon);
  }, [appIcon]);

  // 轮询同步：CLI / LLM / 手改 db.json 的变更自动反映到界面
  useEffect(() => {
    if (!loaded) return;
    const tick = () => void useStore.getState().applyRemote();
    const t = setInterval(tick, 5000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', tick);
    };
  }, [loaded]);

  // 跨天自动刷新：每分钟检查日期，翻日时未完成任务按新日期重算状态（超 DDL 自动转延期）
  useEffect(() => {
    if (!loaded) return;
    let lastDay = todayCN();
    const t = setInterval(() => {
      const today = todayCN();
      if (today !== lastDay) {
        lastDay = today;
        void useStore.getState().refreshTaskStatuses();
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [loaded]);

  // 长条边缘拖拽改期（全局唯一监听）：move = 指针所在日期列定位（翻周/翻月后仍有效）；up = 提交
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const s = useStore.getState();
      const cur = s.bandResize;
      if (!cur || e.buttons !== 1) return;
      window.dispatchEvent(new CustomEvent('chrona-band-resize', { detail: { active: true, clientX: e.clientX } }));
      const task = s.tasks.find((t) => t.id === cur.taskId);
      if (!task) return;
      const anchor = cur.edge === 'end' ? task.dueDate || task.startDate : task.startDate || task.dueDate;
      if (!anchor) return;
      if (s.view === 'month') {
        // 月视图：二维网格（列 x 不能线性映射 42 格）→ 改位移制（水平位移 1 格宽 = 1 天，翻月后仍连续）
        const cells = document.querySelectorAll<HTMLElement>('[data-daykey]');
        if (!cells.length) return;
        const w = cells[0].getBoundingClientRect().width;
        if (w <= 0) return;
        s.updateBandResize(Math.round((e.clientX - cur.startX) / w));
      } else {
        // 周/日视图：日列几何换算指针所在日期
        const cells = document.querySelectorAll<HTMLElement>('[data-daykey]');
        if (cells.length < 1) return;
        const r0 = cells[0].getBoundingClientRect();
        const idx = Math.floor((e.clientX - r0.left) / r0.width);
        if (idx < 0 || idx >= cells.length) return;
        const key = cells[idx].dataset.daykey;
        if (!key) return;
        const d = dayjs(key).diff(dayjs(anchor), 'day');
        s.updateBandResize(d);
      }
    }
    function onUp() {
      const s = useStore.getState();
      if (!s.bandResize) return;
      window.dispatchEvent(new CustomEvent('chrona-band-resize', { detail: { active: false } }));
      void s.endBandResize();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // 主题：跟随系统或手动，切换 <html> 上的 dark 类
  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
    };
    apply();
    if (theme === 'system' && typeof matchMedia !== 'undefined') {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  // 全局键盘快捷键（设计方案 §6.4）
  useEffect(() => {
    function isTyping(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }

    /** 当前视图范围内按时间排序的可见事件 */
    function orderedEvents() {
      const s = useStore.getState();
      const visible = s.visibleEvents();
      let start: number;
      let end: number;
      if (s.view === 'month') {
        start = dayjs(s.anchor).startOf('month').subtract(7, 'day').valueOf();
        end = dayjs(s.anchor).endOf('month').add(14, 'day').valueOf();
      } else if (s.view === 'agenda') {
        start = dayjs(s.anchor).startOf('day').valueOf();
        end = dayjs(s.anchor).add(30, 'day').valueOf();
      } else {
        const days = weekDays(dayjs(s.anchor), s.view === 'day' ? 1 : 7, s.settings.weekStartsOn);
        start = days[0].valueOf();
        end = days[days.length - 1].endOf('day').valueOf();
      }
      return visible.filter((e) => e.end > start && e.start < end).sort((a, b) => a.start - b.start);
    }

    function moveSelection(dir: 1 | -1) {
      const s = useStore.getState();
      const list = orderedEvents();
      if (list.length === 0) return;
      const idx = list.findIndex((e) => e.id === s.selectedEventId);
      const next = idx === -1 ? (dir === 1 ? 0 : list.length - 1) : Math.min(Math.max(idx + dir, 0), list.length - 1);
      s.selectEvent(list[next].id);
    }

    function nudgeSelected(minutes: number | null, days: number | null) {
      const s = useStore.getState();
      const id = s.selectedEventId;
      if (!id) return;
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return;
      let start = ev.start;
      if (minutes !== null) start += minutes * 60_000;
      if (days !== null) start = dayjs(start).add(days, 'day').valueOf();
      if (start < 0) return;
      void s.updateEvent(id, { start, end: start + (ev.end - ev.start) });
    }

    function resizeSelected(deltaMinutes: number) {
      const s = useStore.getState();
      const id = s.selectedEventId;
      if (!id) return;
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return;
      const end = Math.max(ev.end + deltaMinutes * 60_000, ev.start + 15 * 60_000);
      void s.updateEvent(id, { end });
    }

    function createAtNextSlot() {
      const s = useStore.getState();
      const now = nowCN();
      const start = snapMinutes(Math.max(now.hour() * 60 + now.minute() + 15, 8 * 60), 15);
      s.openQuickCreate({
        dateKey: now.format('YYYY-MM-DD'),
        startMin: start,
        endMin: Math.min(start + 60, 24 * 60),
        x: window.innerWidth / 2,
        y: 160,
      });
    }

    function onKeyDown(e: KeyboardEvent) {
      const s = useStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      if (e.key === 'Escape') {
        if (s.paletteOpen || isTyping(e)) return; // 由对应组件自行处理
        if (s.helpOpen) { s.setHelpOpen(false); return; }
        if (s.quickCreate) { s.closeQuickCreate(); return; }
        if (s.taskQuick) { s.closeTaskQuick(); return; }
        if (s.editTaskId) { s.closeEditTask(); return; }
        if (s.drawerOpen) { s.closeDrawer(); return; }
        if (s.selectedEventId) s.selectEvent(null);
        return;
      }
      if (isTyping(e)) return;

      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); void s.undo(); }
        return;
      }

      switch (e.key) {
        case '1': case 'd': case 'D': s.setView('day'); break;
        case '2': case 'w': case 'W': s.setView('week'); break;
        case '3': case 'm': case 'M': s.setView('month'); break;
        case '4': case 'a': case 'A': s.setView('agenda'); break;
        case 't': case 'T': s.goToday(); break;
        case 'p': case 'P': s.shiftPeriod(-1); break;
        case 'n': case 'N': s.shiftPeriod(1); break;
        case 'j': case 'J': moveSelection(1); break;
        case 'k': case 'K': moveSelection(-1); break;
        case 'c': case 'C':
          if (e.shiftKey) {
            // Shift+C：新建待办任务（明确的新增任务入口）
            const today = todayCN();
            s.openTaskQuick({ mode: 'todo', startDate: today, dueDate: today, x: window.innerWidth / 2, y: 160 });
          } else {
            createAtNextSlot();
          }
          break;
        case 'e': case 'E': if (s.selectedEventId) s.openDrawer(s.selectedEventId); break;
        case 'Delete': case 'Backspace':
          if (s.selectedEventId) { e.preventDefault(); void s.deleteEvent(s.selectedEventId); }
          break;
        case 'z': case 'Z': void s.undo(); break;
        case 's': case 'S': s.toggleSidebar(); break;
        case 'r': case 'R': s.toggleTaskPanel(); break;
        case '/': e.preventDefault(); s.setPaletteOpen(true); break;
        case '?': s.setHelpOpen(true); break;
        case 'ArrowUp': e.preventDefault(); e.shiftKey ? resizeSelected(-15) : nudgeSelected(-15, null); break;
        case 'ArrowDown': e.preventDefault(); e.shiftKey ? resizeSelected(15) : nudgeSelected(15, null); break;
        case 'ArrowLeft': e.preventDefault(); nudgeSelected(null, -1); break;
        case 'ArrowRight': e.preventDefault(); nudgeSelected(null, 1); break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const anchorDay = dayjs(anchor);

  return (
    <div className="flex h-full flex-col bg-base font-sans text-tp">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {!sidebarCollapsed && <Sidebar />}
        <main className="min-w-0 flex-1">
          {view === 'day' && <TimeGrid days={weekDays(anchorDay, 1, weekStartsOn)} />}
          {view === 'week' && <TimeGrid days={weekDays(anchorDay, 7, weekStartsOn)} />}
          {view === 'month' && <MonthView />}
          {view === 'agenda' && <AgendaView />}
        </main>
        {!taskPanelCollapsed && <TaskPanel />}
      </div>
      <StatusBar />

      <EventDrawer />
      <QuickCreatePopover />
      <TaskQuickCreate />
      <CommandPalette />
      <ShortcutsHelp />
      <SettingsDialog />
      <Toasts />

      {!loaded && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-base">
          <div className="flex items-center gap-3">
            <LogoMark size={32} />
            <span className="text-[15px] font-semibold text-ts">{appName} 正在加载本地数据…</span>
          </div>
        </div>
      )}
    </div>
  );
}
