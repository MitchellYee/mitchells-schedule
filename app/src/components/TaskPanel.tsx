import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { todayCN } from '../time';
import { useStore } from '../store/useStore';
import { isDone, TASK_STATUS_ZH, type TaskItem, type TaskStatus } from '../types';

const STATUS_TONE: Record<TaskStatus, string> = {
  upcoming: 'var(--text-tertiary)',
  ongoing: 'var(--accent)',
  deferred: 'var(--status-deferred)',
  done: 'var(--cal-sage-bar)',
  'done-late': 'var(--status-deferred)',
};

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
  const createTask = useStore((s) => s.createTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);

  const todayKey = todayCN();
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const { missions, todos, doneList } = useMemo(() => {
    const undone = tasks.filter((t) => !isDone(t.status));
    return {
      missions: undone.filter((t) => t.startDate).sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1)),
      todos: undone.filter((t) => !t.startDate).sort((a, b) => ((a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1)),
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
    void createTask(t, dueDate);
    setTitle('');
  }

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-subtle">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[13px] font-semibold text-tp">任务与待办</span>
        <span className="text-[11px] text-tt">{missions.length + todos.length} 项进行中</span>
      </div>

      <div className="px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="添加待办，@9-30 设截止日"
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

        {doneList.length > 0 && (
          <div className="mt-3">
            <button
              className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-tt hover:text-ts"
              onClick={() => setShowDone((v) => !v)}
            >
              已完成（{doneList.length}）{showDone ? '▾' : '▸'}
            </button>
            {showDone && doneList.map((t) => (
              <Row key={t.id} task={t} taskById={taskById} onDelete={() => void deleteTask(t.id)} />
            ))}
          </div>
        )}
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
  if (status === 'deferred') return { text: '已延期', cls: 'text-[color:var(--status-deferred)]' };
  if (dueDate < todayKey) {
    const days = dayjs(todayKey).diff(dayjs(dueDate), 'day');
    return { text: `逾期 ${days} 天`, cls: 'bg-[color:var(--danger)]/10 text-danger' };
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
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = dueBadge(task, todayCN());
  const parent = task.parentId ? taskById.get(task.parentId) : undefined;
  const done = isDone(task.status);

  return (
    <div className="group relative flex items-center gap-2 rounded-lg border border-line bg-base px-2.5 py-2 hover:shadow-pop">
      <button
        onClick={() => void toggleTask(task.id)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[9px] font-bold"
        style={{ borderColor: STATUS_TONE[task.status], color: STATUS_TONE[task.status] }}
        title={TASK_STATUS_ZH[task.status]}
      >
        {task.status !== 'ongoing' && task.status !== 'upcoming' ? STATUS_ICON[task.status] : task.status === 'upcoming' ? '○' : '◈'}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] ${done ? 'text-tt line-through' : 'text-tp'}`}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {badge.text && !done && <span className={`rounded px-1.5 py-px text-[10px] font-medium ${badge.cls.includes('bg') ? badge.cls : badge.cls}`}>{badge.text}</span>}
          {!done && task.status !== 'ongoing' && (
            <span className="rounded px-1.5 py-px text-[10px] font-semibold" style={{ color: STATUS_TONE[task.status], background: 'var(--bg-subtle)' }}>
              {task.status === 'deferred' ? '延期' : '未开始'}
            </span>
          )}
          {task.startDate && !done && <span className="rounded bg-[color:var(--status-deferred)]/10 px-1.5 py-px text-[10px] font-semibold" style={{ color: 'var(--status-deferred)' }}>任务</span>}
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
              <span className="w-6 shrink-0 text-center text-[10px] font-bold" style={{ color: STATUS_TONE[st] }}>{STATUS_ICON[st]}</span>
              {st === 'ongoing' ? '恢复未完成（按日期）' : TASK_STATUS_ZH[st]}
            </button>
          ))}
          </div>
        </>
      )}
    </div>
  );
}
