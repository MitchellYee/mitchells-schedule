import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../../store/useStore';
import { calColorVars, type EventItem } from '../../types';
import { buildRrule, parseRrule, ruleToText } from '../../domain/recurrence';

function toLocalInput(ms: number, allDay: boolean): string {
  return dayjs(ms).format(allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm');
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/** 事件编辑抽屉（设计方案 §6.2）：右侧 400px，日历保持可见。
 * 编辑模式：自动保存；新建模式（drawerDraft）：确认保存才落库，关闭=放弃，无标题不可保存。 */
export default function EventDrawer() {
  const open = useStore((s) => s.drawerOpen);
  const eventId = useStore((s) => s.drawerEventId);
  const storeDraft = useStore((s) => s.drawerDraft);
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const closeDrawer = useStore((s) => s.closeDrawer);
  const updateEvent = useStore((s) => s.updateEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const createEvent = useStore((s) => s.createEvent);

  const ev = events.find((e) => e.id === eventId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeDrawer]);

  // 新建草稿的本地表单状态（未保存不落库）
  const [draft, setDraft] = useState<null | {
    title: string; isAllDay: boolean; start: number; end: number;
    calendarId: string; location: string; description: string; rrule?: string;
  }>(null);
  useEffect(() => {
    if (storeDraft) {
      setDraft({
        title: storeDraft.title ?? '', isAllDay: storeDraft.isAllDay,
        start: storeDraft.start, end: storeDraft.end,
        calendarId: storeDraft.calendarId, location: '', description: '',
      });
    } else {
      setDraft(null);
    }
  }, [storeDraft]);

  // 重复规则控件状态（切换事件/草稿时重置）
  const [repFreq, setRepFreq] = useState<'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('NONE');
  const [repInterval, setRepInterval] = useState(1);
  const [repDays, setRepDays] = useState<number[]>([]);
  const [repUntil, setRepUntil] = useState('');
  const activeRrule = ev && !draft ? ev.rrule : draft?.rrule;
  useEffect(() => {
    const s = parseRrule(activeRrule);
    setRepFreq(s?.freq ?? 'NONE');
    setRepInterval(s?.interval ?? 1);
    setRepDays(s?.byDay ?? []);
    setRepUntil(s?.until ? dayjs(s.until).format('YYYY-MM-DD') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id, storeDraft]);

  if (!open || (!ev && !draft)) return null;

  const isDraft = !!draft;
  const cur = isDraft ? draft! : ev!;

  const patch = (p: Partial<EventItem>) => {
    void updateEvent(ev!.id, p);
  };
  /** 统一更新入口：编辑模式即时保存；草稿模式仅更新本地 */
  const upd = (p: Partial<typeof cur>) => {
    if (isDraft) setDraft({ ...draft!, ...p });
    else patch(p as Parameters<typeof updateEvent>[1]);
  };

  async function saveDraft() {
    if (!draft || !draft.title.trim()) return;
    await createEvent({
      title: draft.title.trim(),
      calendarId: draft.calendarId,
      isAllDay: draft.isAllDay,
      start: draft.start,
      end: draft.end,
      rrule: draft.rrule,
    });
    closeDrawer();
  }

  const durMin = Math.round((cur.end - cur.start) / 60_000);

  const applyRepeat = (next: { freq?: typeof repFreq; interval?: number; days?: number[]; until?: string }) => {
    const freq = next.freq ?? repFreq;
    const interval = Math.max(1, next.interval ?? repInterval);
    const days = next.days ?? repDays;
    const until = next.until ?? repUntil;
    if (freq === 'NONE') {
      upd({ rrule: undefined });
      return;
    }
    upd({
      rrule: buildRrule({
        freq,
        interval,
        byDay: freq === 'WEEKLY' ? (days.length ? days : [dayjs(cur.start).day()]) : undefined,
        until: until ? dayjs(until).valueOf() : undefined,
      }),
    });
  };

  const setStart = (value: string) => {
    if (!value) return;
    const ms = dayjs(value).valueOf();
    if (cur.isAllDay) {
      const dayShift = dayjs(value).startOf('day').valueOf() - dayjs(cur.start).startOf('day').valueOf();
      upd({ start: cur.start + dayShift, end: cur.end + dayShift });
    } else {
      upd({ start: ms, end: ms + durMin * 60_000 });
    }
  };

  const setEnd = (value: string) => {
    if (!value) return;
    let ms = dayjs(value).valueOf();
    if (cur.isAllDay) ms = dayjs(value).add(1, 'day').startOf('day').valueOf();
    if (ms <= cur.start) ms = cur.start + (cur.isAllDay ? 86400_000 : 15 * 60_000);
    upd({ end: ms });
  };

  const toggleAllDay = (checked: boolean) => {
    if (checked) {
      const s = dayjs(cur.start).startOf('day').valueOf();
      const e = Math.max(dayjs(cur.end).startOf('day').add(1, 'day').valueOf(), s + 86400_000);
      upd({ isAllDay: true, start: s, end: e });
    } else {
      const s = dayjs(cur.start).startOf('day').hour(9).valueOf();
      upd({ isAllDay: false, start: s, end: s + 60 * 60_000 });
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onPointerDown={closeDrawer} />
      <aside className="fixed bottom-0 right-0 top-0 z-40 flex w-[400px] max-w-full flex-col border-l border-line bg-raised shadow-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[13px] font-semibold text-ts">
            {isDraft ? '新建事件' : ev!.rrule ? '编辑重复事件（整个系列）' : '编辑事件'}
          </span>
          <button className="rounded-md p-1.5 text-ts hover:bg-[var(--hover-overlay)]" onClick={closeDrawer} title="关闭 (Esc)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <input
            value={cur.title}
            onChange={(e) => upd({ title: e.target.value })}
            placeholder="添加标题"
            className="w-full rounded-md border-none bg-transparent px-1 py-1 text-[18px] font-bold text-tp outline-none placeholder:text-tt focus:bg-[var(--hover-overlay)]"
          />

          <label className="flex items-center gap-2 px-1 text-[13px] text-tp">
            <input
              type="checkbox"
              checked={cur.isAllDay}
              onChange={(e) => toggleAllDay(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            全天事件
          </label>

          <div className="space-y-2 rounded-lg bg-subtle p-3">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[12px] text-ts">开始</span>
              <input
                type={cur.isAllDay ? 'date' : 'datetime-local'}
                value={toLocalInput(cur.start, cur.isAllDay)}
                onChange={(e) => setStart(e.target.value)}
                className="flex-1 rounded-md border border-line bg-base px-2 py-1.5 text-[13px] text-tp outline-none focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[12px] text-ts">结束</span>
              <input
                type={cur.isAllDay ? 'date' : 'datetime-local'}
                value={toLocalInput(cur.end, cur.isAllDay)}
                onChange={(e) => setEnd(e.target.value)}
                className="flex-1 rounded-md border border-line bg-base px-2 py-1.5 text-[13px] text-tp outline-none focus:border-accent"
              />
            </div>
            {!cur.isAllDay && (
              <div className="text-right text-[11px] text-tt tabular-nums">
                时长 {Math.floor(durMin / 60) > 0 ? `${Math.floor(durMin / 60)} 小时 ` : ''}{durMin % 60 > 0 ? `${durMin % 60} 分钟` : ''}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-1">
            <span className="w-14 shrink-0 text-[12px] text-ts">日历</span>
            <div className="flex flex-wrap gap-1.5">
              {calendars.map((c) => {
                const v = calColorVars(c.color);
                const active = c.id === cur.calendarId;
                return (
                  <button
                    key={c.id}
                    title={c.name}
                    onClick={() => upd({ calendarId: c.id })}
                    className={`h-6 w-6 rounded-full transition-transform ${active ? 'scale-110 ring-2 ring-accent ring-offset-1 ring-offset-[var(--bg-raised)]' : 'opacity-60 hover:opacity-100'}`}
                    style={{ background: v.bar }}
                  />
                );
              })}
            </div>
            <span className="ml-1 text-[12px] text-ts">
              {calendars.find((c) => c.id === cur.calendarId)?.name}
            </span>
          </div>

          {/* 重复规则 */}
          <div className="flex items-start gap-2 px-1">
            <span className="w-14 shrink-0 pt-1.5 text-[12px] text-ts">重复</span>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={repFreq}
                  onChange={(e) => {
                    const v = e.target.value as typeof repFreq;
                    setRepFreq(v);
                    applyRepeat({ freq: v });
                  }}
                  className="rounded-md border border-line bg-base px-2 py-1.5 text-[13px] text-tp outline-none focus:border-accent"
                >
                  <option value="NONE">不重复</option>
                  <option value="DAILY">每 {Math.max(1, repInterval)} 天</option>
                  <option value="WEEKLY">每 {Math.max(1, repInterval)} 周</option>
                  <option value="MONTHLY">每 {Math.max(1, repInterval)} 月</option>
                </select>
                {repFreq !== 'NONE' && (
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={repInterval}
                    onChange={(e) => {
                      const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setRepInterval(v);
                      applyRepeat({ interval: v });
                    }}
                    className="w-16 rounded-md border border-line bg-base px-2 py-1.5 text-[13px] text-tp outline-none focus:border-accent"
                    title="间隔（每 N 天/周/月）"
                  />
                )}
              </div>

              {repFreq === 'WEEKLY' && (
                <div className="flex gap-1">
                  {WEEK_LABELS.map((label, dow) => {
                    const on = repDays.includes(dow);
                    return (
                      <button
                        key={dow}
                        onClick={() => {
                          const next = on ? repDays.filter((d) => d !== dow) : [...repDays, dow];
                          setRepDays(next);
                          applyRepeat({ days: next });
                        }}
                        className={`h-7 w-7 rounded-full text-[11px] font-medium ${
                          on ? 'bg-accent text-[var(--accent-contrast)]' : 'bg-subtle text-ts hover:text-tp'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {repFreq !== 'NONE' && (
                <label className="flex items-center gap-2 text-[12px] text-ts">
                  截止
                  <input
                    type="date"
                    value={repUntil}
                    onChange={(e) => {
                      setRepUntil(e.target.value);
                      applyRepeat({ until: e.target.value });
                    }}
                    className="rounded-md border border-line bg-base px-2 py-1 text-[12px] text-tp outline-none focus:border-accent"
                  />
                  <span className="text-[11px] text-tt">留空 = 一直重复</span>
                </label>
              )}

              {cur.rrule && (
                <div className="rounded-md bg-subtle px-2.5 py-1.5 text-[11px] text-ts">
                  ♻ {ruleToText(cur.rrule)}
                  <div className="text-tt">{isDraft ? '保存后生效' : '编辑与删除作用于整个系列'}</div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 px-1">
            <span className="w-14 shrink-0 text-[12px] text-ts">地点</span>
            <input
              value={cur.location ?? ''}
              onChange={(e) => upd({ location: e.target.value })}
              placeholder="添加地点"
              className="flex-1 rounded-md border border-line bg-base px-2 py-1.5 text-[13px] text-tp outline-none placeholder:text-tt focus:border-accent"
            />
          </div>

          <div className="flex gap-2 px-1">
            <span className="w-14 shrink-0 text-[12px] text-ts">备注</span>
            <textarea
              value={cur.description ?? ''}
              onChange={(e) => upd({ description: e.target.value })}
              placeholder="添加备注"
              rows={4}
              className="flex-1 resize-none rounded-md border border-line bg-base px-2 py-1.5 text-[13px] text-tp outline-none placeholder:text-tt focus:border-accent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          {isDraft ? (
            <>
              <button
                className="rounded-md px-3 py-1.5 text-[12px] font-medium text-ts hover:bg-[var(--hover-overlay)]"
                onClick={closeDrawer}
              >
                取消
              </button>
              <button
                className={`rounded-md px-4 py-1.5 text-[12px] font-semibold text-[var(--accent-contrast)] ${cur.title.trim() ? 'bg-accent hover:opacity-90' : 'cursor-not-allowed bg-[var(--border-strong)]'}`}
                onClick={() => void saveDraft()}
                disabled={!cur.title.trim()}
              >
                保存事件
              </button>
            </>
          ) : (
            <>
              <button
                className="rounded-md px-3 py-1.5 text-[12px] font-medium text-danger hover:bg-[var(--hover-overlay)]"
                onClick={() => void deleteEvent(ev!.id)}
              >
                删除事件
              </button>
              <span className="text-[11px] text-tt">更改自动保存</span>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
