import { useMemo } from 'react';
import dayjs from 'dayjs';
import { useStore } from '../store/useStore';

/** 底部状态栏：下一场安排常驻（设计方案 §4.1，Cron 模式） */
export default function StatusBar() {
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const setAnchor = useStore((s) => s.setAnchor);
  const setView = useStore((s) => s.setView);
  const appName = useStore((s) => s.settings.appName);
  const use24h = useStore((s) => s.settings.use24h);

  const next = useMemo(() => {
    const visible = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
    const now = Date.now();
    return events
      .filter((e) => visible.has(e.calendarId) && e.end > now)
      .sort((a, b) => a.start - b.start)[0];
  }, [events, calendars]);

  let info: React.ReactNode = '今天没有更多安排';
  if (next) {
    const now = Date.now();
    const ongoing = next.start <= now && next.end > now;
    const mins = Math.round((next.start - now) / 60_000);
    const rel = ongoing
      ? '进行中'
      : mins < 60
        ? `${Math.max(mins, 0)} 分钟后`
        : mins < 24 * 60
          ? `${Math.floor(mins / 60)} 小时后`
          : dayjs(next.start).format('M月D日');
    info = (
      <button
        className="text-accent hover:underline"
        onClick={() => { setAnchor(dayjs(next.start).format('YYYY-MM-DD')); setView('day'); }}
      >
        {ongoing
          ? `进行中 · ${next.title}（${dayjs(next.start).format(use24h ? 'HH:mm' : 'h:mm A')} 开始）`
          : `下一场 · ${dayjs(next.start).format(use24h ? 'HH:mm' : 'h:mm A')} ${next.title}（${rel}）`}
      </button>
    );
  }

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-subtle px-4 text-[11px] text-ts">
      <div>{info}</div>
      <div className="flex items-center gap-3">
        <span>{appName} v0.9.5</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[color:var(--cal-sage-bar)]" />本地数据 · 已就绪</span>
      </div>
    </footer>
  );
}
