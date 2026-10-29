import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { clamp } from '../domain/time';

/** 初始 08:00–18:00；普通滚轮原生滚动，Ctrl+滚轮以鼠标处时间为锚缩放。 */
export function useTimeViewport(periodKey: string) {
  const settings = useStore((s) => s.settings);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(560);
  const [reset, setReset] = useState(0);
  const hourH = settings.autoFitHours ? Math.max(24, height / 10) : settings.hourHeight;
  const latestHeight = useRef(hourH);
  const previous = useRef<{ hourH: number; period: string; reset: number; auto: boolean }>();
  const zoomAnchor = useRef<{ hour: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => { if (el.clientHeight > 0) setHeight(el.clientHeight); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = previous.current;
    if (zoomAnchor.current) {
      el.scrollTop = zoomAnchor.current.hour * hourH - zoomAnchor.current.y;
      zoomAnchor.current = null;
    } else if (!prev || prev.period !== periodKey || prev.reset !== reset || (!prev.auto && settings.autoFitHours)) {
      el.scrollTop = 8 * hourH;
    } else if (prev.hourH !== hourH) {
      el.scrollTop = el.scrollTop / prev.hourH * hourH;
    }
    previous.current = { hourH, period: periodKey, reset, auto: settings.autoFitHours };
    latestHeight.current = hourH;
  }, [hourH, periodKey, reset, settings.autoFitHours]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      const el = scrollRef.current;
      if (!el) return;
      e.preventDefault();
      const current = latestHeight.current;
      const next = clamp(current + (e.deltaY < 0 ? 6 : -6), 24, 176);
      if (next === current) return;
      const y = clamp(e.clientY - el.getBoundingClientRect().top, 0, el.clientHeight);
      zoomAnchor.current = { hour: (el.scrollTop + y) / current, y };
      useStore.getState().updateSettings({ autoFitHours: false, hourHeight: next });
    };
    const restore = () => {
      useStore.getState().updateSettings({ autoFitHours: true });
      setReset((v) => v + 1);
    };
    root.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('working-tool:reset-hours', restore);
    return () => {
      root.removeEventListener('wheel', wheel);
      window.removeEventListener('working-tool:reset-hours', restore);
    };
  }, []);
  return { scrollRef, rootRef, hourH };
}
