import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { todayCN } from '../time';
import { useStore } from '../store/useStore';
import { isDone, taskColorVars, TASK_STATUS_ZH, type TaskItem, type TaskStatus } from '../types';
import ImportanceBadge from './ImportanceBadge';

const STATUS_ICON: Record<TaskStatus, string> = {
  upcoming: '○',
  ongoing: '◈',
  deferred: '延',
  done: '✓',
  'done-late': '✓迟',
};

/** 右侧面板：任务（跨天）> 待办（单日，可附属任务）；四态：未完成/完成/延期完成/延期 */
export default function TaskPanel() {
  const tasks = useStore((s) => s.tasks);
  const openTaskQuick = useStore((s) => s.openTaskQuick);
  const deleteTask = useStore((s) => s.deleteTask);
  const [title, setTitle] = useState('');

  const todayKey = todayCN();
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const { missions, todos, doneList } = useMemo(() => {
    return {
      missions: tasks.filter((t) => t.startDate).sort((a, b) => a.startDate!.localeCompare(b.startDate!) || a.createdAt - b.createdAt),
      todos: tasks.filter((t) => !t.startDate).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt - b.createdAt),
      doneList: tasks.filter((t) => isDone(t.status)),
    };
  }, [tasks]);

  /** 解析「标题 @9-30 / @2026-10-01 / @今天 / @明天」中的截止日期 */
  function parseDue(raw: string): { title: string; dueDate?: string } {
    const m = raw.match(/^(.*?)\s*@(.+)$/);
    if (!m) return { title: raw.trim() };
    let t = m[1].trim();
    let s = m[2].trim().replace(/\s*/g, '');
    let due: string | undefined;
    if (s === '今天' || s === 'today') due = todayKey;
    else if (s === '明天' || s === 'tmr') due = dayjs(todayCN()).add(1, 'day').format('YYYY-MM-DD');
    else if (s === '后天') due = dayjs(todayCN()).add(2, 'day').format('YYYY-MM-DD');
    else {
      const full = s.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/);
      const short = s.match(/^(\d{1,2})[-.](\d{1,2})$/);
      if (full) due = dayjs(`${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`).format('YYYY-MM-DD');
      else if (short) due = dayjs(`${dayjs(todayCN()).year()}-${String(short[1]).padStart(2, '0')}-${String(short[2]).padStart(2, '0')}`).format('YYYY-MM-DD');
    }
    if (!due) return { title: raw.trim() }; // 日期无法解析时原样保留，绝不丢字
    return { title: t || '（无标题）', dueDate: due };
  }

  function add() {
    const { title: t, dueDate } = parseDue(title);
    if (!t) return;
    const date = dueDate || todayKey;
    openTaskQuick({ title: t, mode: 'todo', startDate: date, dueDate: date, x: window.innerWidth / 2, y: 160 });
    setTitle('');
  }

  return (
    <aside className="task-panel flex shrink-0 flex-col border-l border-line bg-subtle">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[13px] font-semibold text-tp">任务与待办</span>
        <span className="text-[11px] text-tt">{tasks.length - doneList.length} 待完成 · {doneList.length} 已完成</span>
      </div>

      <div className="px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) add(); }}
          placeholder="待办名，@9-30 设截止日，回车编辑"
          className="w-full rounded-lg border border-line bg-base px-3 py-2 text-[13px] outline-none placeholder:text-tt focus:border-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <TaskGroup label={`任务（${missions.length}）`} hint="跨天 · 最高层级">
          {missions.map((t) => (
            <Row key={t.id} task={t} taskById={taskById} onDelete={() => void deleteTask(t.id)} />
          ))}
          {missions.length === 0 && <Empty text="没有进行中的任务" />}
        </TaskGroup>

        <TaskGroup label={`待办（${todos.length}）`} hint="单日 DDL · 可附属任务">
          {todos.map((t) => (
            <Row key={t.id} task={t} taskById={taskById} onDelete={() => void deleteTask(t.id)} />
          ))}
          {todos.length === 0 && <Empty text="没有进行中的待办" />}
        </TaskGroup>

        <p className="mt-5 px-1 text-[11px] leading-5 text-tt">完成后保留原位，点击勾选可恢复。</p>
      </div>
    </aside>
  );
}

function TaskGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ts">{label}</span>
        {hint && <span className="text-[10px] text-ts opacity-80">{hint}</span>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-line px-3 py-2 text-[12px] text-tt">{text}</div>;
}

function dueBadge(t: TaskItem, todayKey: string): { text: string; cls: string } {
  const { dueDate, startDate, status } = t;
  if (!dueDate) return { text: '', cls: '' };
  const multi = !!startDate && startDate !== dueDate;
  if (multi) {
    return { text: `${dayjs(startDate).format('M月D日')} – ${dayjs(dueDate).format('M月D日')}`, cls: 'bg-subtle text-ts' };
  }
  if (status === 'deferred') return { text: '已延期', cls: 'bg-subtle text-ts' };
  if (dueDate < todayKey) {
    const days = dayjs(todayKey).diff(dayjs(dueDate), 'day');
    return { text: `逾期 ${days} 天`, cls: 'bg-subtle text-ts' };
  }
  if (dueDate === todayKey) return { text: '今天截止', cls: 'bg-accent-soft text-accent' };
  const d = dayjs(dueDate);
  const soon = d.diff(dayjs(todayKey), 'day') <= 3;
  return {
    text: `${d.format('M月D日')} 截止${['', ' 周一', ' 周二', ' 周三', ' 周四', ' 周五', ' 周六'][d.day()]}`,
    cls: soon ? 'bg-accent-soft text-accent' : 'bg-subtle text-ts',
  };
}

/** 行：勾选框（点击=切换完成）+ 状态菜单（四态）+ 标题 + DDL/区间 + 所属任务标签 */
function Row({ task, taskById, onDelete }: { task: TaskItem; taskById: Map<string, TaskItem>; onDelete: () => void }) {
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const toggleTask = useStore((s) => s.toggleTask);
  const openEditTask = useStore((s) => s.openEditTask);
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = dueBadge(task, todayCN());
  const parent = task.parentId ? taskById.get(task.parentId) : undefined;
  const done = isDone(task.status);
  const color = taskColorVars(task);
  const steps = task.subtasks ?? [];

  return (
    <div data-task-id={task.id} data-completed={done} className={`task-card group relative flex items-center gap-2 rounded-xl border border-line bg-base px-3 py-2.5 hover:border-[var(--border-strong)] ${done ? 'completed-item' : ''}`}>
      <button
        aria-label={`${done ? '恢复' : '完成'}${task.title}`}
        aria-pressed={done}
        onClick={() => void toggleTask(task.id)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[9px] font-bold"
        style={{ borderColor: color.bar, color: color.fg }}
        title={TASK_STATUS_ZH[task.status]}
      >
        {task.status !== 'ongoing' && task.status !== 'upcoming' ? STATUS_ICON[task.status] : task.status === 'upcoming' ? '○' : '◈'}
      </button>
      <div className="min-w-0 flex-1">
        <button onClick={() => openEditTask(task.id)} title="编辑任务详情" className={`block w-full truncate text-left text-[13px] hover:underline ${done ? 'text-tt line-through' : 'text-tp'}`}>{task.title}</button>
        {task.description && <div className="mt-0.5 truncate text-[11px] text-tt" title={task.description}>{task.description}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {done ? <span className="text-[10px] text-ts">✓ 已完成</span> : <ImportanceBadge importance={task.importance} />}
          {steps.length > 0 && <span className="text-[10px] text-ts">子任务 {steps.filter((s) => s.done).length}/{steps.length}</span>}
          {badge.text && !done && <span className={`rounded px-1.5 py-px text-[10px] font-medium ${badge.cls.includes('bg') ? badge.cls : badge.cls}`}>{badge.text}</span>}
          {!done && task.status !== 'ongoing' && (
            <span className="rounded bg-subtle px-1.5 py-px text-[10px] font-semibold text-ts">
              {task.status === 'deferred' ? '延期' : '未开始'}
            </span>
          )}
          {task.startDate && !done && <span className="rounded bg-subtle px-1.5 py-px text-[10px] font-semibold text-ts">任务</span>}
          {parent && !done && (
            <span className="rounded bg-subtle px-1.5 py-px text-[10px] text-ts" title={`附属任务：${parent.title}`}>
              ↳ {parent.title.slice(0, 10)}
            </span>
          )}
        </div>
      </div>

      {/* 状态菜单（四态） */}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="shrink-0 rounded p-0.5 text-tt opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
        title="调整状态"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 rounded p-0.5 text-tt opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
        title="删除"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-2 top-9 z-20 w-28 overflow-hidden rounded-lg border border-line bg-raised p-1 shadow-pop">
          {( ['done', 'done-late', 'ongoing'] as TaskStatus[]).map((st) => (
            <button
              key={st}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] ${st === task.status ? 'bg-accent-soft text-accent' : 'text-tp hover:bg-[var(--hover-overlay)]'}`}
              onClick={() => { setMenuOpen(false); void setTaskStatus(task.id, st); }}
            >
              <span className="w-6 shrink-0 text-center text-[10px] font-bold">{STATUS_ICON[st]}</span>
              {st === 'ongoing' ? '恢复未完成（按日期）' : TASK_STATUS_ZH[st]}
            </button>
          ))}
          </div>
        </>
      )}
    </div>
  );
}
