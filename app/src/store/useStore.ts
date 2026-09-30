import { create } from 'zustand';
import dayjs from 'dayjs';
import { todayCN } from '../time';
import type { Calendar, EventItem, PaletteKey, Settings, TaskItem, ThemeMode, Toast, ViewKind } from '../types';
import { DEFAULT_SETTINGS, uid, isDone, deriveTaskStatus } from '../types';
import { loadAll, putCalendar, putEvent, putTask, deleteEvent as apiDeleteEvent, deleteTask as apiDeleteTask, fetchRemote } from '../db/repository';

export interface QuickCreateState {
  dateKey: string;
  startMin: number;
  endMin: number;
  x: number;
  y: number;
}

/** 任务快速创建（跨日拖选 / + 菜单 / Shift+C / 双击任务带或待办带唤起） */
export interface TaskQuickState {
  /** task = 任务（带 startDate，显示在任务带）；todo = 待办（DDL，显示在待办带） */
  mode: 'task' | 'todo';
  startDate: string;
  dueDate: string;
  x: number;
  y: number;
}

/** 抽屉「新建事件」草稿：未保存前不落库（无标题不创建） */
export interface EventDraft {
  title?: string;
  calendarId: string;
  isAllDay: boolean;
  start: number;
  end: number;
}

interface UndoEntry {
  label: string;
  fn: () => Promise<void>;
}

const SETTINGS_KEY = 'chrona-settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

interface Store {
  loaded: boolean;
  view: ViewKind;
  anchor: string; // YYYY-MM-DD

  calendars: Calendar[];
  events: EventItem[];
  tasks: TaskItem[];

  selectedEventId: string | null;
  drawerOpen: boolean;
  drawerEventId: string | null;
  drawerDraft: EventDraft | null;
  quickCreate: QuickCreateState | null;
  taskQuick: TaskQuickState | null;
  /** 正在编辑的任务 id（点击条目标题区打开） */
  editTaskId: string | null;
  /** 长条边缘拖拽改期（全局唯一，翻周/翻月不丢） */
  bandResize: { taskId: string; edge: 'start' | 'end'; deltaDays: number; startX: number } | null;

  sidebarCollapsed: boolean;
  taskPanelCollapsed: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  settingsOpen: boolean;

  settings: Settings;
  toasts: Toast[];
  undos: UndoEntry[];

  init: () => Promise<void>;
  setView: (v: ViewKind) => void;
  setAnchor: (dateKey: string) => void;
  goToday: () => void;
  shiftPeriod: (dir: 1 | -1) => void;

  visibleEvents: () => EventItem[];
  createEvent: (data: Pick<EventItem, 'title' | 'calendarId' | 'isAllDay' | 'start' | 'end'> & { rrule?: string; silent?: boolean }) => Promise<EventItem>;
  updateEvent: (id: string, patch: Partial<EventItem>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  moveEvent: (id: string, start: number, end: number, toastLabel: string) => Promise<void>;

  toggleCalendar: (id: string) => Promise<void>;
  setCalendarColor: (id: string, color: PaletteKey) => Promise<void>;
  addCalendar: (name: string, color: PaletteKey) => Promise<void>;

  createTask: (title: string, dueDate?: string, startDate?: string, parentId?: string, color?: import('../types').PaletteKey) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  setTaskStatus: (id: string, status: TaskItem['status']) => Promise<void>;
  updateTask: (id: string, patch: Partial<TaskItem>) => Promise<void>;
  refreshTaskStatuses: () => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  openDrawer: (eventId: string) => void;
  closeDrawer: () => void;
  openDraftDrawer: (draft: EventDraft) => void;
  openQuickCreate: (qc: QuickCreateState) => void;
  closeQuickCreate: () => void;
  openTaskQuick: (tq: TaskQuickState) => void;
  closeTaskQuick: () => void;
  openEditTask: (id: string) => void;
  closeEditTask: () => void;
  startBandResize: (taskId: string, edge: 'start' | 'end', startX: number) => void;
  updateBandResize: (deltaDays: number) => void;
  endBandResize: () => Promise<void>;
  selectEvent: (id: string | null) => void;

  toggleSidebar: () => void;
  toggleTaskPanel: () => void;
  setPaletteOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  pushToast: (message: string, undo?: { label: string; fn: () => Promise<void> }) => void;
  dismissToast: (id: string) => void;
  undo: () => Promise<void>;

  /** 轮询到的远端数据（CLI/LLM 写入）应用到界面；近 2s 内有本地写入时跳过以防覆盖 */
  applyRemote: () => Promise<void>;
  lastWriteAt: number;
}

/** 防止轮询用服务端旧数据覆盖刚发生的本地写入 */
let initPromise: Promise<void> | null = null;
function stampWrite(): void {
  useStore.setState({ lastWriteAt: Date.now() });
}

export const useStore = create<Store>()((set, get) => ({
  loaded: false,
  view: 'week',
  anchor: todayCN(),

  calendars: [],
  events: [],
  tasks: [],  selectedEventId: null,
  drawerOpen: false,
  drawerEventId: null,
  drawerDraft: null,
  quickCreate: null,
  taskQuick: null,
  editTaskId: null,
  bandResize: null,

  sidebarCollapsed: false,
  taskPanelCollapsed: false,
  paletteOpen: false,
  helpOpen: false,
  settingsOpen: false,

  settings: loadSettings(),
  toasts: [],
  undos: [],
  lastWriteAt: 0,

  async init() {
    if (!initPromise) {
      initPromise = (async () => {
        const { calendars, events, tasks } = await loadAll();
        set({ loaded: true, calendars, events, tasks });
        await get().refreshTaskStatuses();
      })();
    }
    await initPromise;
  },

  setView(v) {
    set({ view: v });
  },
  setAnchor(dateKey) {
    set({ anchor: dateKey });
  },
  goToday() {
    set({ anchor: todayCN() });
  },
  shiftPeriod(dir) {
    const { view, anchor } = get();
    const d = dayjs(anchor);
    const next =
      view === 'day' ? d.add(dir, 'day') :
      view === 'week' ? d.add(dir * 7, 'day') :
      view === 'month' ? d.add(dir, 'month') :
      d.add(dir * 7, 'day');
    set({ anchor: next.format('YYYY-MM-DD') });
  },

  visibleEvents() {
    const { events, calendars } = get();
    const visible = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
    return events.filter((e) => visible.has(e.calendarId));
  },

  async createEvent(data) {
    const now = Date.now();
    const ev: EventItem = {
      id: uid(),
      title: data.title || '新事件',
      calendarId: data.calendarId,
      isAllDay: data.isAllDay,
      start: data.start,
      end: data.end,
      rrule: data.rrule,
      createdAt: now,
      updatedAt: now,
    };
    stampWrite();
    await putEvent(ev);
    set((s) => ({ events: upsert(s.events, ev), selectedEventId: ev.id }));
    if (!data.silent) {
      get().pushToast(`已创建「${ev.title}」`, {
        label: '撤销新建',
        fn: async () => {
          await putEvent({ ...ev, deletedAt: Date.now(), updatedAt: Date.now() });
          set((s) => ({ events: s.events.filter((x) => x.id !== ev.id) }));
        },
      });
    }
    return ev;
  },

  async updateEvent(id, patch) {
    const ev = get().events.find((e) => e.id === id);
    if (!ev) return;
    const next = { ...ev, ...patch, updatedAt: Date.now() };
    stampWrite();
    await putEvent(next);
    set((s) => ({ events: upsert(s.events, next) }));
  },

  async deleteEvent(id) {
    const ev = get().events.find((e) => e.id === id);
    if (!ev) return;
    stampWrite();
    await apiDeleteEvent(id);
    set((s) => ({
      events: s.events.filter((x) => x.id !== id),
      drawerOpen: s.drawerEventId === id ? false : s.drawerOpen,
      drawerEventId: s.drawerEventId === id ? null : s.drawerEventId,
      selectedEventId: s.selectedEventId === id ? null : s.selectedEventId,
    }));
    get().pushToast(`已删除「${ev.title}」`, {
      label: '撤销删除',
      fn: async () => {
        await putEvent(ev);
        set((s) => ({ events: upsert(s.events, ev) }));
      },
    });
  },

  async moveEvent(id, start, end, toastLabel) {
    const ev = get().events.find((e) => e.id === id);
    if (!ev) return;
    const prev = { start: ev.start, end: ev.end };
    if (prev.start === start && prev.end === end) return;
    await get().updateEvent(id, { start, end });
    get().pushToast(toastLabel, {
      label: '撤销移动',
      fn: async () => {
        await get().updateEvent(id, prev);
      },
    });
  },

  async toggleCalendar(id) {
    const cal = get().calendars.find((c) => c.id === id);
    if (!cal) return;
    const next = { ...cal, isVisible: !cal.isVisible };
    stampWrite();
    await putCalendar(next);
    set((s) => ({ calendars: upsert(s.calendars, next) }));
  },

  async setCalendarColor(id, color) {
    const cal = get().calendars.find((c) => c.id === id);
    if (!cal) return;
    const next = { ...cal, color };
    stampWrite();
    await putCalendar(next);
    set((s) => ({ calendars: upsert(s.calendars, next) }));
  },

  async addCalendar(name, color) {
    const next: Calendar = {
      id: uid(), name, color, isVisible: true, sortOrder: get().calendars.length,
    };
    stampWrite();
    await putCalendar(next);
    set((s) => ({ calendars: [...s.calendars, next] }));
  },

  async createTask(title, dueDate, startDate, parentId, color) {
    const now = Date.now();
    const task: TaskItem = { id: uid(), title, status: deriveTaskStatus({ startDate, dueDate }, todayCN()), dueDate, startDate, parentId, color, createdAt: now, updatedAt: now };
    stampWrite();
    await putTask(task);
    set((s) => ({ tasks: [...s.tasks, task] }));
  },

  /** 点击方框：完成类→撤销为推导态；未完成→逾期/延期中记延期完成，否则按时完成 */
  async toggleTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const todayKey = todayCN();
    let nextStatus: TaskItem['status'];
    if (isDone(task.status)) {
      nextStatus = deriveTaskStatus(task, todayKey);
    } else if (todayKey > (task.dueDate ?? '') || task.status === 'deferred') {
      nextStatus = 'done-late';
    } else {
      nextStatus = 'done';
    }
    await get().setTaskStatus(id, nextStatus);
  },

  async setTaskStatus(id, status) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const next = { ...task, status, updatedAt: Date.now() };
    stampWrite();
    await putTask(next);
    set((s) => ({ tasks: upsert(s.tasks, next) }));
  },

  /** 编辑/拖拽提交：patch 日期后未完成类自动重算状态 */
  async updateTask(id, patch) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const merged = { ...task, ...patch, updatedAt: Date.now() };
    if (patch.startDate !== undefined || patch.dueDate !== undefined) {
      if (!isDone(merged.status)) {
        merged.status = deriveTaskStatus(merged, todayCN());
      }
    }
    stampWrite();
    await putTask(merged);
    set((s) => ({ tasks: upsert(s.tasks, merged) }));
  },

  /** 每日刷新：未完成类按今天重算状态（超 DDL 自动转延期）。仅在有变化时写库。 */
  async refreshTaskStatuses() {
    const todayKey = todayCN();
    const updates: TaskItem[] = [];
    for (const t of get().tasks) {
      if (isDone(t.status)) continue;
      const derived = deriveTaskStatus(t, todayKey);
      if (t.status !== derived) updates.push({ ...t, status: derived, updatedAt: Date.now() });
    }
    if (!updates.length) return;
    stampWrite();
    await Promise.all(updates.map((t) => putTask(t)));
    set((s) => ({
      tasks: s.tasks.map((t) => {
        const u = updates.find((x) => x.id === t.id);
        return u ?? t;
      }),
    }));
  },

  async deleteTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    stampWrite();
    await apiDeleteTask(id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  openDrawer(eventId) {
    set({ drawerOpen: true, drawerEventId: eventId, drawerDraft: null, quickCreate: null, taskQuick: null });
  },
  closeDrawer() {
    set({ drawerOpen: false, drawerEventId: null, drawerDraft: null });
  },
  openDraftDrawer(draft) {
    set({ drawerOpen: true, drawerEventId: null, drawerDraft: draft, quickCreate: null, taskQuick: null });
  },
  openQuickCreate(qc) {
    set({ quickCreate: qc, taskQuick: null, drawerOpen: false, drawerEventId: null, drawerDraft: null, paletteOpen: false });
  },
  closeQuickCreate() {
    set({ quickCreate: null });
  },
  openTaskQuick(tq) {
    set({ taskQuick: tq, editTaskId: null, quickCreate: null, drawerOpen: false, drawerEventId: null, drawerDraft: null, paletteOpen: false });
  },
  closeTaskQuick() {
    set({ taskQuick: null });
  },
  openEditTask(id) {
    set({ editTaskId: id, quickCreate: null, taskQuick: null, drawerOpen: false, drawerEventId: null, drawerDraft: null, paletteOpen: false });
  },
  closeEditTask() {
    set({ editTaskId: null });
  },
  startBandResize(taskId, edge, startX) {
    set({ bandResize: { taskId, edge, deltaDays: 0, startX } });
  },
  updateBandResize(deltaDays) {
    const cur = get().bandResize;
    if (!cur || cur.deltaDays === deltaDays) return;
    set({ bandResize: { ...cur, deltaDays } });
  },
  async endBandResize() {
    const cur = get().bandResize;
    set({ bandResize: null });
    if (!cur || cur.deltaDays === 0) return;
    const task = get().tasks.find((t) => t.id === cur.taskId);
    if (!task) return;
    const from = task.startDate || task.dueDate!;
    const to = task.dueDate!;
    if (cur.edge === 'start') {
      const nf = dayjs(from).add(cur.deltaDays, 'day').format('YYYY-MM-DD');
      if (nf > to) return;
      await get().updateTask(task.id, task.startDate ? { startDate: nf, dueDate: to } : { dueDate: to });
      get().pushToast(`已调整开始日期 -> ${nf}`);
    } else {
      const nt = dayjs(to).add(cur.deltaDays, 'day').format('YYYY-MM-DD');
      if (nt < from) return;
      await get().updateTask(task.id, { startDate: from, dueDate: nt });
      get().pushToast(`已调整结束日期 -> ${nt}`);
    }
  },
  selectEvent(id) {
    set({ selectedEventId: id });
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
  },
  toggleTaskPanel() {
    set((s) => ({ taskPanelCollapsed: !s.taskPanelCollapsed }));
  },
  setPaletteOpen(open) {
    set({ paletteOpen: open });
  },
  setHelpOpen(open) {
    set({ helpOpen: open });
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open });
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    set({ settings });
  },

  pushToast(message, undo) {
    const id = uid();
    set((s) => ({
      toasts: [...s.toasts.slice(-2), { id, message }],
      undos: undo ? [...s.undos.slice(-49), { label: undo.label, fn: undo.fn }] : s.undos,
    }));
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  async undo() {
    const entry = get().undos[get().undos.length - 1];
    if (!entry) {
      get().pushToast('没有可撤销的操作');
      return;
    }
    set((s) => ({ undos: s.undos.slice(0, -1) }));
    stampWrite();
    await entry.fn();
    get().pushToast(`已撤销：${entry.label}`);
  },

  async applyRemote() {
    const s = get();
    if (Date.now() - s.lastWriteAt < 2000) return;
    try {
      const remote = await fetchRemote();
      const same =
        JSON.stringify(remote.calendars) === JSON.stringify(s.calendars) &&
        JSON.stringify(remote.events) === JSON.stringify(s.events) &&
        JSON.stringify(remote.tasks) === JSON.stringify(s.tasks);
      if (!same) {
        set({ calendars: remote.calendars, events: remote.events, tasks: remote.tasks });
        await get().refreshTaskStatuses();
      }
    } catch {
      /* dev server 未就绪时静默跳过 */
    }
  },
}));

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// 开发诊断钩子
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__store = useStore;
}
