import dayjs from 'dayjs';
import { todayCN } from '../../time';
import { useStore } from '../../store/useStore';
import type { TaskItem } from '../../types';
import { importanceOption, taskColorVars } from '../../types';

/** 任务/待办条数据（外层只负责分组；分段由 BandBar 按「区间∩视口」自算） */
export interface TaskBarRow {
  task: TaskItem;
  colStart: number;
  span: number;
  cutStart: boolean;
  cutEnd: boolean;
  range: string;
}

/** 未完成条目用重要程度色，完成后统一使用中性灰。 */
export function bandTone(task: TaskItem): string {
  return taskColorVars(task).bar;
}

interface BandBarProps {
  bar: TaskBarRow;
  /** 视口首日（YYYY-MM-DD）——分段自算基准，翻页后条自动跟随 */
  viewStartKey: string;
  /** 视口列数 */
  colCount: number;
  onToggle: () => void;
  onEdit: () => void;
  row?: number;
  compact?: boolean;
}

/**
 * 任务/待办条（周/月视图共用）：
 * 左方框 = 完成（逾期自动记延期完成）；标题区 = 打开编辑；左右边缘拖拽 = 调整起止日期。
 * 拖拽状态存全局 store（bandResize）——翻周/翻月重渲染不丢；分段按「预览区间∩视口」实时自算。
 */
export default function BandBar({ bar, viewStartKey, colCount, onToggle, onEdit, row, compact }: BandBarProps) {
  const task = bar.task;
  const color = taskColorVars(task);
  const tone = bandTone(task);
  const importance = importanceOption(task.importance).label;
  const statusLabel =
    task.status === 'deferred' ? '（已延期）' : task.status === 'upcoming' ? '（未开始）' : '';
  const done = task.status === 'done' || task.status === 'done-late';

  const bandResize = useStore((s) => s.bandResize);
  const startBandResize = useStore((s) => s.startBandResize);
  const isResizing = bandResize?.taskId === task.id;
  const resizeEdge = isResizing ? bandResize!.edge : null;
  const deltaDays = isResizing ? bandResize!.deltaDays : 0;

  /* 拖拽预览区间（clamp：开始不得晚于结束） */
  const origFrom = task.startDate || task.dueDate || todayCN();
  const origTo = task.dueDate || origFrom;
  let effFrom = origFrom;
  let effTo = origTo;
  if (isResizing) {
    if (resizeEdge === 'start') {
      effFrom = dayjs(origFrom).add(deltaDays, 'day').format('YYYY-MM-DD');
      if (effFrom > effTo) effFrom = effTo;
    } else {
      effTo = dayjs(origTo).add(deltaDays, 'day').format('YYYY-MM-DD');
      if (effTo < effFrom) effTo = effFrom;
    }
  }

  /* 区间 ∩ 视口 → 分段 */
  const cs = dayjs(effFrom).diff(dayjs(viewStartKey), 'day');
  const ce = dayjs(effTo).diff(dayjs(viewStartKey), 'day');
  const colStart = Math.max(0, cs);
  const colEndIncl = Math.min(colCount - 1, ce);
  const inView = colEndIncl >= colStart;
  const cutStart = cs < 0;
  const cutEnd = ce > colCount - 1;
  const multi = effFrom !== effTo;
  const range = multi ? `${dayjs(effFrom).format('M.D')}-${dayjs(effTo).format('M.D')}` : '';
  const span = inView ? colEndIncl - colStart + 1 : 1;

  function startResize(e: React.PointerEvent, edge: 'start' | 'end') {
    e.stopPropagation();
    e.preventDefault();
    startBandResize(task.id, edge, e.clientX);
    window.dispatchEvent(new CustomEvent('chrona-band-resize', { detail: { active: true, clientX: e.clientX } }));
  }

  const previewFrom = isResizing && resizeEdge === 'start' ? effFrom.slice(5).replace('-', '.') : null;
  const previewTo = isResizing && resizeEdge === 'end' ? effTo.slice(5).replace('-', '.') : null;

  if (!inView) return null; // 位于全部 hooks 之后

  return (
    <div
      data-task-id={task.id}
      data-completed={done}
      className={`task-band group/bar relative flex items-stretch border text-left ${compact ? 'text-[11px]' : 'text-[12px]'} font-medium ${
        cutStart ? 'rounded-l-sm' : 'rounded-l-md'
      } ${cutEnd ? 'rounded-r-sm' : 'rounded-r-md'} ${done ? 'completed-item' : ''} ${isResizing ? 'z-30 shadow-pop' : ''}`}
      style={{
        gridColumn: `${colStart + 1} / span ${span}`,
        ...(row !== undefined ? { gridRow: String(row) } : {}),
        borderColor: 'transparent',
        borderLeft: `3px solid ${tone}`,
        color: color.fg,
        background: `color-mix(in srgb, ${color.bg} 68%, var(--bg-base))`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 左方框：完成/撤销 */}
      <button
        className={`flex shrink-0 items-center ${compact ? 'pl-1.5 pr-0.5' : 'pl-2 pr-1'}`}
        aria-label={`${done ? '恢复' : '完成'}${task.title}`}
        aria-pressed={done}
        title={done ? '已完成，点击恢复' : '点击完成（超期自动记延期完成）'}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        <span className="flex h-3 w-3 items-center justify-center rounded-[3px] border border-current text-[9px]">{done ? '✓' : ''}</span>
      </button>
      {/* 标题区：编辑 */}
      <button
        className={`flex min-w-0 flex-1 items-center gap-1 ${compact ? 'py-[1px] pr-1.5' : 'py-[2px] pr-2'} ${done ? 'line-through decoration-current' : ''}`}
        title={`${task.startDate ? '任务' : '待办'}：${task.title} · ${importance}${statusLabel}${task.description ? `\n${task.description}` : ''}（点击编辑；边缘可拖拽改期）`}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
      >
        {task.status === 'deferred' && <span className="shrink-0 text-[9px] font-bold">延</span>}
        {task.status === 'upcoming' && <span className="shrink-0 text-[9px] font-bold">未</span>}
        <span className="truncate">{task.title}</span>
        {done && <span className="shrink-0 text-[9px] no-underline">已完成</span>}
        {range && <span className="ml-auto shrink-0 text-[8px] font-medium opacity-70">{cutStart ? '←' : ''}{range}{cutEnd ? '→' : ''}</span>}
      </button>

      {/* 左右边缘拖拽手柄 */}
      <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" title="拖动调整开始日期（贴边自动翻页）" onPointerDown={(e) => startResize(e, 'start')} />
      <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" title="拖动调整结束日期（贴边自动翻页）" onPointerDown={(e) => startResize(e, 'end')} />

      {/* 拖拽提示 */}
      {isResizing && (
        <div className="pointer-events-none absolute -top-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-pop">
          {resizeEdge === 'start' ? `开始 → ${previewFrom}` : `结束 → ${previewTo}`}
        </div>
      )}
    </div>
  );
}

/** 按列分组且保持顺序；外层限定高度并滚动，完成不会改变位置或挤走其他条目。 */
export function renderBandBars(
  bars: TaskBarRow[],
  handlers: { onToggle: (t: TaskItem) => void; onEdit: (t: TaskItem) => void },
  viewStartKey: string,
  colCount: number
) {
  const byCol = new Map<number, TaskBarRow[]>();
  for (const b of bars) {
    if (!byCol.has(b.colStart)) byCol.set(b.colStart, []);
    byCol.get(b.colStart)!.push(b);
  }
  const out: React.ReactNode[] = [];
  byCol.forEach((list, col) => {
    list.forEach((b, i) => {
      out.push(
        <BandBar
          key={b.task.id + '@' + col}
          bar={b}
          row={i + 1}
          viewStartKey={viewStartKey}
          colCount={colCount}
          onToggle={() => handlers.onToggle(b.task)}
          onEdit={() => handlers.onEdit(b.task)}
        />
      );
    });
  });
  return out;
}
