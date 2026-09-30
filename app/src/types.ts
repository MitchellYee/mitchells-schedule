/** 日历色板 key（设计方案 §7.2 Google 11 色） */
export type PaletteKey =
  | 'tomato' | 'flamingo' | 'tangerine' | 'banana' | 'sage'
  | 'basil' | 'peacock' | 'blueberry' | 'lavender' | 'grape' | 'graphite';

export const PALETTE_KEYS: PaletteKey[] = [
  'tomato', 'flamingo', 'tangerine', 'banana', 'sage',
  'basil', 'peacock', 'blueberry', 'lavender', 'grape', 'graphite',
];

export const PALETTE_NAMES_ZH: Record<PaletteKey, string> = {
  tomato: '番茄', flamingo: '火烈鸟', tangerine: '橘', banana: '香蕉',
  sage: '鼠尾草', basil: '罗勒', peacock: '孔雀', blueberry: '蓝莓',
  lavender: '薰衣草', grape: '葡萄', graphite: '石墨',
};

export function calColorVars(key: PaletteKey) {
  return {
    bg: `var(--cal-${key}-bg)`,
    fg: `var(--cal-${key}-fg)`,
    bar: `var(--cal-${key}-bar)`,
  };
}

export interface Calendar {
  id: string;
  name: string;
  color: PaletteKey;
  isVisible: boolean;
  sortOrder: number;
}

/** 定时事件存 epoch ms（本地时区）；全天事件 start/end 存当日 0 点，end 为排除式（次日 0 点） */
export interface EventItem {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  isAllDay: boolean;
  start: number;
  end: number;
  /** RFC5545 风格重复规则（子集）：FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=n;BYDAY=MO,WE;UNTIL=20270101 */
  rrule?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/**
 * 待办/任务五态（v0.8）：未完成类由日期自动推导（deriveTaskStatus），完成类手动设置。
 * - 未开始 upcoming：今天 < 开始日
 * - 进行中 ongoing：开始日 ≤ 今天 ≤ 截止日
 * - 延期 deferred：今天 > 截止日（每日自动刷新）
 * - 完成 done / 延期完成 done-late：点方框或命令设置（超期完成自动记 done-late）
 */
export type TaskStatus = 'upcoming' | 'ongoing' | 'deferred' | 'done' | 'done-late';

export const TASK_STATUS_ZH: Record<TaskStatus, string> = {
  upcoming: '未开始',
  ongoing: '进行中',
  deferred: '延期',
  done: '完成',
  'done-late': '延期完成',
};

/** 未完成态由日期推导（今天 todayKey 为 YYYY-MM-DD） */
export function deriveTaskStatus(t: { startDate?: string; dueDate?: string }, todayKey: string): 'upcoming' | 'ongoing' | 'deferred' {
  if (!t.dueDate) return 'ongoing';
  if (todayKey > t.dueDate) return 'deferred';
  const from = t.startDate || t.dueDate;
  if (todayKey < from) return 'upcoming';
  return 'ongoing';
}

/** 是否完成态（按时完成或延期完成） */
export function isDone(status?: TaskStatus): boolean {
  return status === 'done' || status === 'done-late';
}

/**
 * 层级模型：任务 > 待办 > 日程。
 * - 任务（跨天）：startDate~dueDate 区间，连体长条显示在「任务」带（最高层）
 * - 待办（单日 DDL）：仅 dueDate，显示在「待办」带；可经 parentId 附属到某任务
 * - 日程：定时事件（EventItem）
 */
export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  /** 截止日 YYYY-MM-DD（任务=区间末尾；待办=DDL），可空 */
  dueDate?: string;
  /** 开始日 YYYY-MM-DD；有此字段 = 跨天「任务」，无 = 「待办」 */
  startDate?: string;
  /** 附属任务的 id（待办 → 任务） */
  parentId?: string;
  /** 自定义颜色（如 工作/科研/运动/个人 范围色）；缺省按状态着色 */
  color?: PaletteKey;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type ViewKind = 'day' | 'week' | 'month' | 'agenda';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  /** 软件名（DIY）：顶栏双击可改，同步到状态栏/标签页/窗口标题/托盘 */
  appName: string;
  /** 每小时像素高度：48 紧凑 / 56 默认 / 64 宽松 */
  hourHeight: number;
  use24h: boolean;
  /** 0 = 周日, 1 = 周一 */
  weekStartsOn: 0 | 1;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  appName: "Mitchell's Schedule",
  hourHeight: 56,
  use24h: true,
  weekStartsOn: 1,
  theme: 'system',
};

export interface Toast {
  id: string;
  message: string;
  undo?: () => void;
}

export function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
