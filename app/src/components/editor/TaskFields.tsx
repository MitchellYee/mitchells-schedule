import { useRef } from 'react';
import { calColorVars, TASK_IMPORTANCE_OPTIONS, uid,
  type SubtaskItem, type TaskImportance, type TaskInput, type TaskItem } from '../../types';

export interface TaskFormValues {
  title: string;
  startDate: string;
  dueDate: string;
  parentId: string;
  importance: TaskImportance;
  description: string;
  subtasks: SubtaskItem[];
}

export function taskFormValues(startDate: string, dueDate = startDate, task?: TaskItem): TaskFormValues {
  return {
    title: task?.title ?? '', startDate: task?.startDate || task?.dueDate || startDate,
    dueDate: task?.dueDate ?? dueDate, parentId: task?.parentId ?? '',
    importance: task?.importance ?? 'normal', description: task?.description ?? '',
    subtasks: (task?.subtasks ?? []).map((step) => ({ ...step })),
  };
}

export function taskFormInput(value: TaskFormValues, mode: 'task' | 'todo'): TaskInput {
  return {
    title: value.title.trim(), dueDate: value.dueDate || undefined,
    startDate: mode === 'task' ? value.startDate : undefined,
    parentId: mode === 'todo' ? value.parentId || undefined : undefined,
    importance: value.importance,
    description: value.description,
    subtasks: value.subtasks.filter((step) => step.title.trim()).map((step) => ({ ...step, title: step.title.trim() })),
  };
}

export function taskFormError(value: TaskFormValues, mode: 'task' | 'todo'): string | null {
  if (!value.title.trim()) return '请输入标题';
  if (!value.dueDate || (mode === 'task' && !value.startDate)) return '请选择日期';
  if (mode === 'task' && value.startDate > value.dueDate) return '开始日期不能晚于截止日期';
  return null;
}

/** 创建与编辑共用的任务表单。所有输入只修改草稿，保存时统一提交。 */
export default function TaskFields({ value, onChange, mode, parents, disabled = false }: {
  value: TaskFormValues; onChange: (value: TaskFormValues) => void; mode: 'task' | 'todo';
  parents: TaskItem[]; disabled?: boolean;
}) {
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const patch = (next: Partial<TaskFormValues>) => onChange({ ...value, ...next });
  const updateStep = (id: string, next: Partial<SubtaskItem>) => patch({
    subtasks: value.subtasks.map((step) => step.id === id ? { ...step, ...next } : step),
  });
  const fieldClass = 'w-full rounded-lg border border-line bg-base px-3 py-2 text-[13px] text-tp outline-none focus:border-accent disabled:opacity-60';
  const labelClass = 'mb-1.5 block text-[12px] font-semibold text-ts';

  function addStep() {
    const id = uid();
    patch({ subtasks: [...value.subtasks, { id, title: '', done: false }] });
    requestAnimationFrame(() => inputs.current.get(id)?.focus());
  }

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <label className="block">
        <span className={labelClass}>{mode === 'task' ? '任务名' : '待办名'}</span>
        <input autoFocus aria-label={mode === 'task' ? '任务名' : '待办名'} value={value.title}
          onChange={(e) => patch({ title: e.target.value })} placeholder="输入标题" className={fieldClass} />
      </label>
      <div className={mode === 'task' ? 'grid grid-cols-2 gap-3' : ''}>
        {mode === 'task' && <label className="block">
          <span className={labelClass}>开始日期</span>
          <input type="date" aria-label="开始日期" value={value.startDate} className={fieldClass}
            onChange={(e) => patch({ startDate: e.target.value,
              dueDate: e.target.value > value.dueDate ? e.target.value : value.dueDate })} />
        </label>}
        <label className="block">
          <span className={labelClass}>截止日期</span>
          <input type="date" aria-label="截止日期" value={value.dueDate} min={mode === 'task' ? value.startDate : undefined}
            onChange={(e) => patch({ dueDate: e.target.value })} className={fieldClass} />
        </label>
      </div>
      <fieldset>
        <legend className={labelClass}>重要程度</legend>
        <div className="grid grid-cols-3 gap-2">
          {TASK_IMPORTANCE_OPTIONS.map((option) => {
            const color = calColorVars(option.color);
            const active = value.importance === option.value;
            return <button key={option.value} type="button" aria-pressed={active}
              onClick={() => patch({ importance: option.value })}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12px] font-semibold ${active ? 'ring-1 ring-inset' : 'hover:opacity-80'}`}
              style={{ background: active ? color.bg : 'var(--bg-base)', color: color.fg,
                borderColor: active ? color.bar : 'var(--border-subtle)', '--tw-ring-color': color.bar } as React.CSSProperties}>
              <span className="h-2 w-2 rounded-full" style={{ background: color.bar }} />{option.label}
            </button>;
          })}
        </div>
      </fieldset>
      {mode === 'todo' && parents.length > 0 && <label className="block">
        <span className={labelClass}>所属任务</span>
        <select aria-label="所属任务" className={fieldClass} value={value.parentId} onChange={(e) => {
          const parent = parents.find((t) => t.id === e.target.value);
          patch({ parentId: e.target.value, importance: parent ? parent.importance ?? 'normal' : value.importance });
        }}>
          <option value="">独立待办</option>
          {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.title}</option>)}
        </select>
        <span className="mt-1 block text-[11px] text-tt">选择所属任务时继承重要程度，之后可单独调整</span>
      </label>}
      {mode === 'task' && <>
        <label className="block">
          <span className={labelClass}>任务描述</span>
          <textarea aria-label="任务描述" value={value.description} rows={5}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="填写任务背景、目标、要求或排程时需要考虑的事项…" className={`${fieldClass} resize-y leading-6`} />
        </label>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-ts">子任务{value.subtasks.length > 0 ? `（${value.subtasks.filter((s) => s.done).length}/${value.subtasks.length}）` : ''}</span>
            <button type="button" onClick={addStep} className="rounded-md px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent-soft">＋ 添加子任务</button>
          </div>
          {value.subtasks.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-3 text-[12px] text-tt">点击「＋ 添加子任务」拆解任务步骤</div>}
          <ol className="space-y-2">
            {value.subtasks.map((step, index) => <li key={step.id} className="flex items-start gap-2">
              <input type="checkbox" aria-label={`完成子任务 ${index + 1}`} checked={step.done}
                onChange={(e) => updateStep(step.id, { done: e.target.checked })} className="mt-3 accent-[var(--accent)]" />
              <span className="mt-2.5 text-[11px] text-tt">{index + 1}.</span>
              <textarea ref={(el) => { if (el) inputs.current.set(step.id, el); else inputs.current.delete(step.id); }}
                aria-label={`子任务 ${index + 1}`} value={step.title} rows={2} placeholder="输入子任务内容"
                onChange={(e) => updateStep(step.id, { title: e.target.value })}
                className={`${fieldClass} min-w-0 flex-1 resize-y ${step.done ? 'line-through opacity-60' : ''}`} />
              <button type="button" aria-label={`删除子任务 ${index + 1}`} title="删除此子任务"
                onClick={() => patch({ subtasks: value.subtasks.filter((s) => s.id !== step.id) })}
                className="mt-1 rounded-md px-2 py-1 text-[16px] text-tt hover:bg-[var(--hover-overlay)] hover:text-danger">×</button>
            </li>)}
          </ol>
        </div>
      </>}
    </fieldset>
  );
}
