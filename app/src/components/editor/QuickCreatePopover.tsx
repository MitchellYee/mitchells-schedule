import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../../store/useStore';
import { calColorVars, isDone } from '../../types';
import { fmtRange } from '../../domain/time';
import EditorFrame from './EditorFrame';
import TaskFields, { taskFormError, taskFormInput, taskFormValues } from './TaskFields';

type CreateType = 'event' | 'task' | 'todo';
const TYPE_LABEL: Record<CreateType, string> = { event: '日程', task: '任务', todo: '待办' };

export default function QuickCreatePopover() {
  const qc = useStore((s) => s.quickCreate);
  const calendars = useStore((s) => s.calendars);
  const tasks = useStore((s) => s.tasks);
  const use24h = useStore((s) => s.settings.use24h);
  const [type, setType] = useState<CreateType>('event');
  const [value, setValue] = useState(() => taskFormValues(''));
  const [calendarId, setCalendarId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const visibleCals = useMemo(() => calendars.filter((c) => c.isVisible), [calendars]);
  const parents = useMemo(() => tasks.filter((t) => t.startDate && !isDone(t.status)), [tasks]);
  const effectiveCalId = visibleCals.some((c) => c.id === calendarId) ? calendarId : visibleCals[0]?.id ?? calendars[0]?.id ?? '';
  useEffect(() => {
    if (!qc) return;
    setType('event'); setValue(taskFormValues(qc.dateKey)); setCalendarId(''); setError('');
  }, [qc]);
  if (!qc) return null;
  const start = dayjs(qc.dateKey).valueOf() + qc.startMin * 60_000;
  const end = dayjs(qc.dateKey).valueOf() + qc.endMin * 60_000;
  const dismiss = () => useStore.getState().closeQuickCreate();
  async function save() {
    if (saving.current) return;
    const validation = type === 'event' ? (!value.title.trim() ? '请输入标题' : !effectiveCalId ? '请先创建一个日历' : null) : taskFormError(value, type);
    if (validation) { setError(validation); return; }
    saving.current = true; setBusy(true); setError('');
    try {
      const s = useStore.getState();
      if (type === 'event') await s.createEvent({ title: value.title.trim(), calendarId: effectiveCalId, isAllDay: false, start, end });
      else await s.createTask(taskFormInput(value, type));
      dismiss();
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); }
    finally { saving.current = false; setBusy(false); }
  }
  function detailedEdit() {
    if (!effectiveCalId) { setError('请先创建一个日历'); return; }
    useStore.getState().openDraftDrawer({ title: value.title.trim(), calendarId: effectiveCalId, isAllDay: false, start, end });
  }
  return <EditorFrame title={`新建${TYPE_LABEL[type]}`} point={{ x: qc.x, y: qc.y }} busy={busy} error={error}
    onDismiss={dismiss} onSave={() => void save()} footer={<>
      {type === 'event' ? <button disabled={busy} onClick={detailedEdit} className="text-[12px] font-semibold text-accent hover:underline">详细编辑</button>
        : <span className="text-[11px] text-tt">Ctrl+Enter 保存</span>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={dismiss} className="rounded-lg px-3 py-2 text-[12px] text-ts hover:bg-[var(--hover-overlay)]">取消</button>
        <button disabled={busy || !value.title.trim()} onClick={() => void save()} className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-[var(--accent-contrast)] disabled:opacity-50">{busy ? '保存中…' : `创建${TYPE_LABEL[type]}`}</button>
      </div>
    </>}>
    <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1">
      {(Object.keys(TYPE_LABEL) as CreateType[]).map((kind) => <button key={kind} disabled={busy} aria-pressed={type === kind}
        onClick={() => { setType(kind); setError(''); }} className={`rounded-md py-1.5 text-[12px] font-semibold ${type === kind ? 'bg-base text-tp shadow-pop' : 'text-ts'}`}>{TYPE_LABEL[kind]}</button>)}
    </div>
    {type === 'event' ? <div className="space-y-4">
      <label className="block text-[12px] font-semibold text-ts">日程标题
        <input aria-label="日程标题" autoFocus disabled={busy} value={value.title} onChange={(e) => setValue({ ...value, title: e.target.value })}
          placeholder="输入标题" className="mt-1.5 w-full rounded-lg border border-line bg-base px-3 py-2 text-[14px] text-tp outline-none focus:border-accent" />
      </label>
      <div className="text-[12px] text-ts">{dayjs(qc.dateKey).format('M月D日 ddd')} · {fmtRange(qc.startMin, qc.endMin, use24h)}</div>
      <label className="block text-[12px] font-semibold text-ts">日历
        <select aria-label="日历" disabled={busy} value={effectiveCalId} onChange={(e) => setCalendarId(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-base px-3 py-2 text-[13px] text-tp outline-none focus:border-accent">
          {(visibleCals.length ? visibleCals : calendars).map((cal) => <option key={cal.id} value={cal.id}>{cal.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2">{visibleCals.map((cal) => <button key={cal.id} title={cal.name} aria-label={`选择日历 ${cal.name}`} disabled={busy}
        onClick={() => setCalendarId(cal.id)} className={`h-5 w-5 rounded-full ${effectiveCalId === cal.id ? 'ring-2 ring-accent ring-offset-2' : ''}`}
        style={{ background: calColorVars(cal.color).bar }} />)}</div>
    </div> : <TaskFields value={value} onChange={setValue} mode={type} parents={parents} disabled={busy} />}
  </EditorFrame>;
}
