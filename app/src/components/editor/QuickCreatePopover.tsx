import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../../store/useStore';
import { calColorVars, isDone, PALETTE_KEYS, PALETTE_NAMES_ZH } from '../../types';
import { fmtRange } from '../../domain/time';

type CreateType = 'event' | 'task' | 'todo';

const TYPE_LABEL: Record<CreateType, string> = { event: '日程', task: '任务', todo: '待办' };

/**
 * 快速创建气泡（设计方案 §6.1）：点击/划选时间窗弹出。
 * 三类型切换：日程（时间窗）/ 任务（当天或跨天，显示在任务带最上方）/ 待办（DDL + 可附属任务）。
 * 日程无标题不创建；任务/待办必须填标题。
 */
export default function QuickCreatePopover() {
  const qc = useStore((s) => s.quickCreate);
  const calendars = useStore((s) => s.calendars);
  const tasks = useStore((s) => s.tasks);
  const closeQuickCreate = useStore((s) => s.closeQuickCreate);
  const createEvent = useStore((s) => s.createEvent);
  const createTask = useStore((s) => s.createTask);
  const openDraftDrawer = useStore((s) => s.openDraftDrawer);
  const pushToast = useStore((s) => s.pushToast);
  const use24h = useStore((s) => s.settings.use24h);

  const [type, setType] = useState<CreateType>('event');
  const [title, setTitle] = useState('');
  const [calendarId, setCalendarId] = useState<string>('');
  // 任务/待办的日期（默认点击的当天）
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [parentId, setParentId] = useState('');
  const [color, setColor] = useState<import('../../types').PaletteKey | ''>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleCals = useMemo(() => calendars.filter((c) => c.isVisible), [calendars]);
  const effectiveCalId = calendarId && visibleCals.some((c) => c.id === calendarId)
    ? calendarId
    : visibleCals[0]?.id ?? calendars[0]?.id ?? '';
  /** 可附属的任务（跨天项，未完成类） */
  const parentOptions = useMemo(
    () => tasks.filter((t) => t.startDate && !isDone(t.status)),
    [tasks]
  );

  useEffect(() => {
    if (qc) {
      setType('event');
      setTitle('');
      setCalendarId('');
      setFromDate(qc.dateKey);
      setToDate(qc.dateKey);
      setParentId('');
      setColor('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [qc]);

  if (!qc) return null;

  const dayStart = dayjs(qc.dateKey).valueOf();
  const start = dayStart + qc.startMin * 60_000;
  const end = dayStart + qc.endMin * 60_000;

  function clampDates(nextFrom: string, nextTo: string) {
    if (nextFrom && nextTo && nextFrom > nextTo) return { f: nextFrom, t: nextFrom };
    return { f: nextFrom, t: nextTo };
  }

  async function save() {
    const t = title.trim();
    if (!t) {
      pushToast(type === 'event' ? '请输入标题' : `请输入${TYPE_LABEL[type]}标题`);
      inputRef.current?.focus();
      return;
    }
    if (type === 'event') {
      await createEvent({ title: t, calendarId: effectiveCalId, isAllDay: false, start, end });
    } else if (type === 'task') {
      // 任务：恒传 startDate（与 dueDate 相同 = 当天任务）
      await createTask(t, toDate || fromDate, fromDate);
    } else {
      await createTask(t, fromDate || toDate, undefined, parentId || undefined, color || undefined);
    }
    closeQuickCreate();
  }

  function saveEventDraft() {
    // 仅日程支持详细编辑（抽屉草稿）
    if (type !== 'event') return;
    closeQuickCreate();
    openDraftDrawer({ title: title.trim(), calendarId: effectiveCalId, isAllDay: false, start, end });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickCreate();
    }
  }

  const W = 320;
  const H = 300;
  const x = Math.min(qc.x + 12, window.innerWidth - W - 16);
  const y = Math.min(qc.y + 12, window.innerHeight - H - 16);
  const canSave = !!title.trim();

  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={closeQuickCreate} />
      <div
        className="fixed z-50 w-[320px] rounded-xl border border-line bg-raised p-3 shadow-panel"
        style={{ left: x, top: y }}
        onKeyDown={onKeyDown}
      >
        {/* 类型切换：日程 / 任务 / 待办 */}
        <div className="mb-2.5 flex rounded-lg bg-subtle p-0.5">
          {(Object.keys(TYPE_LABEL) as CreateType[]).map((k) => (
            <button
              key={k}
              onClick={() => setType(k)}
              className={`flex-1 rounded-md px-2 py-1 text-[12px] font-semibold transition-colors ${
                type === k ? 'bg-base text-tp shadow-pop' : 'text-ts hover:text-tp'
              }`}
            >
              {TYPE_LABEL[k]}
            </button>
          ))}
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === 'event' ? '添加标题' : `${TYPE_LABEL[type]}标题`}
          className="w-full rounded-md border-none bg-transparent px-1 py-1 text-[15px] font-semibold text-tp outline-none placeholder:text-tt focus:bg-[var(--hover-overlay)]"
        />

        {type === 'event' && (
          <>
            <div className="mt-2 flex items-center gap-2 px-1 text-[12px] text-ts">
              <span>🕙</span>
              <span className="tabular-nums">
                {dayjs(qc.dateKey).format('M月D日 ddd')} · {fmtRange(qc.startMin, qc.endMin, use24h)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 px-1">
              <span className="text-[12px]">🎨</span>
              <div className="flex flex-wrap gap-1.5">
                {visibleCals.map((c) => {
                  const v = calColorVars(c.color);
                  const active = c.id === effectiveCalId;
                  return (
                    <button
                      key={c.id}
                      title={c.name}
                      onClick={() => setCalendarId(c.id)}
                      className={`h-5 w-5 rounded-full transition-transform ${active ? 'scale-110 ring-2 ring-accent ring-offset-1 ring-offset-[var(--bg-raised)]' : 'opacity-70 hover:opacity-100'}`}
                      style={{ background: v.bar }}
                    />
                  );
                })}
              </div>
              <span className="ml-1 text-[12px] text-ts">
                {calendars.find((c) => c.id === effectiveCalId)?.name}
              </span>
            </div>
          </>
        )}

        {type === 'task' && (
          <div className="mt-2.5 space-y-2 px-1">
            <div className="flex items-center gap-2 text-[12px] text-ts">
              <span className="w-8 shrink-0">从</span>
              <input type="date" value={fromDate} onChange={(e) => { const { f, t } = clampDates(e.target.value, toDate); setFromDate(f); setToDate(t); }} className="w-[130px] rounded-md border border-line bg-base px-2 py-1 text-[12px] text-tp outline-none focus:border-accent" />
              <span className="w-8 shrink-0 text-right">到</span>
              <input type="date" value={toDate} onChange={(e) => { const { f, t } = clampDates(fromDate, e.target.value); setFromDate(f); setToDate(t); }} className="w-[130px] rounded-md border border-line bg-base px-2 py-1 text-[12px] text-tp outline-none focus:border-accent" />
            </div>
            <div className="text-[11px] text-tt">
              {fromDate === toDate
                ? '当天任务，显示在任务带（最上方）'
                : `跨 ${dayjs(toDate).diff(dayjs(fromDate), 'day') + 1} 天，这几天每天的最上方都显示`}
            </div>
          </div>
        )}

        {/* 任务/待办范围颜色（工作任务=蓝 / 科研=紫 / 运动=绿 / 个人=黄 …） */}
        {type !== 'event' && (
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
        )}

        {type === 'todo' && (
          <div className="mt-2.5 space-y-2 px-1">
            <div className="flex items-center gap-2 text-[12px] text-ts">
              <span className="shrink-0">截止</span>
              <span className="rounded-md bg-subtle px-2 py-1 text-[12px] font-medium text-tp">
                {dayjs(qc.dateKey).format('M月D日 ddd')}
              </span>
              <span className="text-[11px] text-tt">固定为当天（跨天请用任务）</span>
            </div>
            {parentOptions.length > 0 && (
              <div className="flex items-center gap-2 text-[12px] text-ts">
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
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          {type === 'event' && (
            <button
              className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-accent hover:bg-accent-soft"
              onClick={saveEventDraft}
            >
              详细编辑
            </button>
          )}
          <button
            className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold text-[var(--accent-contrast)] ${canSave ? 'bg-accent hover:opacity-90' : 'cursor-not-allowed bg-[var(--border-strong)]'}`}
            onClick={() => void save()}
            disabled={!canSave}
          >
            保存{type !== 'event' ? TYPE_LABEL[type] : ''}
          </button>
        </div>
      </div>
    </>
  );
}
