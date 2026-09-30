import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { todayCN } from '../../time';
import { useStore } from '../../store/useStore';
import { PALETTE_KEYS, PALETTE_NAMES_ZH, calColorVars } from '../../types';

/** 任务/待办快速创建与编辑（双带双击、跨日拖选、+菜单、Shift+C、点击条目标题唤起） */
export default function TaskQuickCreate() {
  const tq = useStore((s) => s.taskQuick);
  const editTaskId = useStore((s) => s.editTaskId);
  const tasks = useStore((s) => s.tasks);
  const close = useStore((s) => s.closeTaskQuick);
  const closeEdit = useStore((s) => s.closeEditTask);
  const createTask = useStore((s) => s.createTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [parentId, setParentId] = useState('');
  const [color, setColor] = useState<import('../../types').PaletteKey | ''>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const editing = useMemo(() => tasks.find((t) => t.id === editTaskId), [tasks, editTaskId]);
  const mode: 'task' | 'todo' = editing ? (editing.startDate ? 'task' : 'todo') : tq?.mode ?? 'todo';

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setStartDate(editing.startDate || editing.dueDate || todayCN());
      setDueDate(editing.dueDate || todayCN());
      setParentId(editing.parentId ?? '');
      setColor(editing.color ?? '');
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (tq) {
      setTitle('');
      setStartDate(tq.startDate);
      setDueDate(tq.dueDate);
      setParentId('');
      setColor('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [tq, editTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const multi = useMemo(() => startDate !== dueDate, [startDate, dueDate]);
  /** 可附属的任务（跨天项，未完成类）——仅待办模式 */
  const parentOptions = useMemo(
    () => tasks.filter((t) => t.startDate && t !== editing && !['done', 'done-late'].includes(t.status)),
    [tasks, editing]
  );

  if (!tq && !editing) return null;

  function clampDates(nextStart: string, nextDue: string) {
    if (nextStart && nextDue && nextStart > nextDue) {
      return { s: nextStart, d: nextStart };
    }
    return { s: nextStart, d: nextDue };
  }

  async function save() {
    if (!title.trim()) return;
    if (editing) {
      // 编辑：任务可改起止（状态按新日期重算）；待办日期固定
      if (mode === 'task') {
        await updateTask(editing.id, { title: title.trim(), startDate, dueDate, color: (color || undefined) as never });
      } else {
        await updateTask(editing.id, { title: title.trim(), parentId: parentId || undefined, color: (color || undefined) as never });
      }
      closeEdit();
      return;
    }
    if (!tq) return;
    if (mode === 'task') {
      // 任务：恒带 startDate（同日 = 当天任务），显示在任务带最上方
      await createTask(title.trim(), dueDate, startDate, undefined, color || undefined);
    } else {
      await createTask(title.trim(), dueDate, undefined, parentId || undefined, color || undefined);
    }
    close();
  }

  async function remove() {
    if (!editing) return;
    await deleteTask(editing.id);
    closeEdit();
  }

  function dismiss() {
    if (editing) closeEdit();
    else close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  const W = 320;
  const H = 260;
  const anchorX = editing ? window.innerWidth / 2 - W / 2 : tq ? tq.x : 0;
  const anchorY = editing ? 180 : tq ? tq.y : 0;
  const x = Math.min(anchorX + 12, window.innerWidth - W - 16);
  const y = Math.min(anchorY + 12, window.innerHeight - H - 16);
  const days = dayjs(dueDate).diff(dayjs(startDate), 'day') + 1;

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={dismiss} />
      <div
        className="fixed z-50 w-[320px] rounded-xl border border-line bg-raised p-3 shadow-panel"
        style={{ left: x, top: y }}
        onKeyDown={onKeyDown}
      >
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] border-2 border-accent text-[10px] font-bold text-accent">✓</span>
          <span className="text-[13px] font-bold text-tp">
            {editing
              ? mode === 'task' ? '编辑任务' : '编辑待办'
              : multi ? `跨天任务（${days} 天）` : mode === 'task' ? '新建任务（当天）' : '新建待办'}
          </span>
          {editing && (
            <span className="ml-auto rounded bg-subtle px-1.5 py-px text-[10px] font-medium text-ts">
              {editing.status === 'deferred' ? '已延期' : editing.status === 'upcoming' ? '未开始' : editing.status === 'ongoing' ? '进行中' : editing.status === 'done-late' ? '延期完成' : '已完成'}
            </span>
          )}
        </div>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="任务标题，回车保存"
          className="w-full rounded-md border border-line bg-base px-2.5 py-2 text-[14px] font-semibold text-tp outline-none placeholder:font-normal placeholder:text-tt focus:border-accent"
        />
        <div className="mt-2 flex items-center gap-2 px-1 text-[12px] text-ts">
          {mode === 'task' ? (
            multi ? (
              <>
                <input type="date" value={startDate} onChange={(e) => { const { s, d } = clampDates(e.target.value, dueDate); setStartDate(s); setDueDate(d); }} className="w-[118px] rounded-md border border-line bg-base px-2 py-1 text-[12px] outline-none focus:border-accent" />
                <span>至</span>
                <input type="date" value={dueDate} onChange={(e) => { const { s, d } = clampDates(startDate, e.target.value); setStartDate(s); setDueDate(d); }} className="w-[118px] rounded-md border border-line bg-base px-2 py-1 text-[12px] outline-none focus:border-accent" />
              </>
            ) : (
              <>
                <span>日期</span>
                <input type="date" value={startDate} onChange={(e) => { const { s, d } = clampDates(e.target.value, e.target.value); setStartDate(s); setDueDate(d); }} className="w-[118px] rounded-md border border-line bg-base px-2 py-1 text-[12px] outline-none focus:border-accent" />
                <span className="text-[11px] text-tt">改到另一天 = 当天任务</span>
              </>
            )
          ) : (
            <>
              <span>截止</span>
              <span className="rounded-md bg-subtle px-2 py-1 text-[12px] font-medium text-tp">
                {dayjs(dueDate).format('M月D日 ddd')}
              </span>
              <span className="text-[11px] text-tt">待办固定当天（跨天请建任务）</span>
            </>
          )}
        </div>
        <div className="mt-1.5 px-1 text-[11px] text-tt">
          {multi ? '这几天每天的最上方都显示' : mode === 'task' ? '显示在任务带（最上方）' : '截止当天在待办带显示'}
        </div>
        {/* 范围颜色（工作任务=蓝 / 科研=紫 / 运动=绿 / 个人=黄 …） */}
        <div className="mt-2 flex items-center gap-1.5 px-1">
          <span className="shrink-0 text-[12px] text-ts">颜色</span>
          <button
            onClick={() => setColor('')}
            className={`h-4 w-4 rounded-full border border-dashed border-linestrong ${!color ? 'ring-2 ring-accent ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
            title="按状态着色（默认）"
          />
          {PALETTE_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setColor(k)}
              className={`h-4 w-4 rounded-full ${color === k ? 'scale-110 ring-2 ring-accent ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
              style={{ background: calColorVars(k).bar }}
              title={PALETTE_NAMES_ZH[k]}
            />
          ))}
        </div>
        {/* 待办附属任务 */}
        {mode === 'todo' && !multi && parentOptions.length > 0 && (
          <div className="mt-2 flex items-center gap-2 px-1 text-[12px] text-ts">
            <span className="shrink-0">附属</span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="flex-1 rounded-md border border-line bg-base px-2 py-1 text-[12px] text-tp outline-none focus:border-accent"
            >
              <option value="">（无 · 独立待办）</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}（{p.startDate}~{p.dueDate}）</option>
              ))}
            </select>
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {editing ? (
            <button
              className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-danger hover:bg-[var(--hover-overlay)]"
              onClick={() => void remove()}
            >
              删除
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ts hover:bg-[var(--hover-overlay)]" onClick={dismiss}>
              取消
            </button>
            <button
              className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold text-[var(--accent-contrast)] ${title.trim() ? 'bg-accent hover:opacity-90' : 'cursor-not-allowed bg-[var(--border-strong)]'}`}
              onClick={() => void save()}
              disabled={!title.trim()}
            >
              {editing ? '保存修改' : `保存${mode === 'task' ? '任务' : '待办'}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
