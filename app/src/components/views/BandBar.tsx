import dayjs from 'dayjs';
import { todayCN } from '../../time';
import { useStore } from '../../store/useStore';
import type { TaskItem } from '../../types';
import { calColorVars } from '../../types';

/** 任务/待办条数据（外层只负责分组；分段由 BandBar 按「区间∩视口」自算） */
export interface TaskBarRow {
  task: TaskItem;
  colStart: number;
  span: number;
  cutStart: boolean;
  cutEnd: boolean;
  range: string;
}

export const BAND_MAX_ROWS = 3;

/** 条目颜色：自定义范围色优先；否则按状态（ongoing 主题色 / upcoming 灰 / deferred 橙） */
export function bandTone(task: TaskItem): string {
  if (task.color) return calColorVars(task.color).bar;
  if (task.status === 'deferred') return 'var(--status-deferred)';
  if (task.status === 'upcoming') return 'var(--text-tertiary)';
  if (task.status === 'done-late') return 'var(--status-deferred)';
  if (task.status === 'done') return 'var(--cal-sage-bar)';
  return 'var(--accent)';
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
  const tone = bandTone(task);
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
      className={`group/bar relative flex items-stretch border text-left ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold ${
        cutStart ? 'rounded-l-sm' : 'rounded-l-full'
      } ${cutEnd ? 'rounded-r-sm' : 'rounded-r-full'} ${done ? 'opacity-70' : ''} ${isResizing ? 'z-30 shadow-pop' : ''}`}
      style={{
        gridColumn: `${colStart + 1} / span ${span}`,
        ...(row !== undefined ? { gridRow: String(row) } : {}),
        borderColor: tone,
        color: tone,
        background: 'var(--bg-base)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 左方框：完成/撤销 */}
      <button
        className={`flex shrink-0 items-center ${compact ? 'pl-1.5 pr-0.5' : 'pl-2 pr-1'}`}
        title="点击设为完成（超期自动记延期完成）"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        <span className="h-2.5 w-2.5 rounded-[3px] border border-current" />
      </button>
      {/* 标题区：编辑 */}
      <button
        className={`flex min-w-0 flex-1 items-center gap-1 ${compact ? 'py-[1px] pr-1.5' : 'py-[2px] pr-2'} ${done ? 'line-through decoration-current' : ''}`}
        title={`${task.startDate ? '任务' : '待办'}：${task.title}${statusLabel}（点击编辑；边缘可拖拽改期）`}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
      >
        {task.status === 'deferred' && <span className="shrink-0 text-[9px] font-bold">延</span>}
        {task.status === 'upcoming' && <span className="shrink-0 text-[9px] font-bold">未</span>}
        <span className="truncate">{task.title}</span>
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

/** 按列分组渲染待办条（行对齐）：每列 >3 折叠为前 2 条 + 省略条 */
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
    const shown = list.length > BAND_MAX_ROWS ? list.slice(0, BAND_MAX_ROWS - 1) : list;
    shown.forEach((b, i) => {
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
    if (list.length > BAND_MAX_ROWS) {
      const hidden = list.length - (BAND_MAX_ROWS - 1);
      out.push(
        <div
          key={`more@${col}`}
          className="flex items-center truncate rounded-full bg-subtle px-2 text-[10px] font-medium text-ts"
          style={{ gridColumn: `${col + 1}`, gridRow: String(BAND_MAX_ROWS) }}
          title={`还有 ${hidden} 项未显示（见右侧面板）`}
        >
          …还有 {hidden} 项
        </div>
      );
    }
  });
  return out;
}
