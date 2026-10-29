import { useEffect, useMemo, useRef, useState } from 'react';
import { todayCN } from '../../time';
import { useStore } from '../../store/useStore';
import { isDone } from '../../types';
import EditorFrame from './EditorFrame';
import TaskFields, { taskFormError, taskFormInput, taskFormValues } from './TaskFields';

export default function TaskQuickCreate() {
  const tq = useStore((s) => s.taskQuick);
  const editTaskId = useStore((s) => s.editTaskId);
  const tasks = useStore((s) => s.tasks);
  const editing = tasks.find((task) => task.id === editTaskId);
  const mode = editing ? (editing.startDate ? 'task' : 'todo') : tq?.mode ?? 'todo';
  const [value, setValue] = useState(() => taskFormValues(todayCN()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  useEffect(() => {
    const initial = taskFormValues(tq?.startDate ?? todayCN(), tq?.dueDate ?? todayCN(), editing);
    if (!editing) initial.title = tq?.title ?? '';
    setValue(initial);
    setError('');
    // 轮询不会覆盖正在填写的草稿，仅在切换编辑对象时重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tq, editTaskId]);
  const parents = useMemo(() => tasks.filter((t) => t.startDate && t.id !== editTaskId &&
    (!isDone(t.status) || t.id === editing?.parentId)), [tasks, editTaskId, editing?.parentId]);
  if (!tq && !editing) return null;

  function dismiss() {
    const s = useStore.getState();
    if (editing) s.closeEditTask(); else s.closeTaskQuick();
  }
  async function save() {
    if (saving.current) return;
    const validation = taskFormError(value, mode);
    if (validation) { setError(validation); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      const data = taskFormInput(value, mode);
      const s = useStore.getState();
      if (editing) await s.updateTask(editing.id, data); else await s.createTask(data);
      dismiss();
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { saving.current = false; setBusy(false); }
  }
  async function remove() {
    if (!editing || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await useStore.getState().deleteTask(editing.id); dismiss(); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败，请重试'); }
    finally { saving.current = false; setBusy(false); }
  }
  const kind = mode === 'task' ? '任务' : '待办';
  return <EditorFrame title={`${editing ? '编辑' : '新建'}${kind}`} busy={busy} error={error}
    point={!editing && tq ? { x: tq.x, y: tq.y } : undefined} onSave={() => void save()} onDismiss={dismiss}
    footer={<>
      {editing ? <button disabled={busy} onClick={() => void remove()} className="text-[12px] text-danger hover:underline">删除{kind}</button>
        : <span className="text-[11px] text-tt">Ctrl+Enter 保存</span>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={dismiss} className="rounded-lg px-3 py-2 text-[12px] text-ts hover:bg-[var(--hover-overlay)]">取消</button>
        <button disabled={busy || !value.title.trim()} onClick={() => void save()} className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-[var(--accent-contrast)] disabled:opacity-50">
          {busy ? '保存中…' : editing ? '保存修改' : `创建${kind}`}
        </button>
      </div>
    </>}>
    <TaskFields value={value} onChange={setValue} mode={mode} parents={parents} disabled={busy} />
  </EditorFrame>;
}
