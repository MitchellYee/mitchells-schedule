import { useEffect, useId, useRef, type ReactNode } from 'react';

export default function EditorFrame({ title, children, footer, error, busy, onSave, onDismiss, point }: {
  title: string; children: ReactNode; footer: ReactNode; error?: string; busy: boolean;
  onSave: () => void; onDismiss: () => void; point?: { x: number; y: number };
}) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (root.current?.querySelector<HTMLElement>('input:not([type="checkbox"]), textarea') ?? root.current)?.focus();
    return () => previous?.focus();
  }, []);
  const width = Math.min(460, window.innerWidth - 32);
  const height = Math.min(720, window.innerHeight - 32);
  const left = Math.max(16, Math.min(point ? point.x + 12 : (window.innerWidth - width) / 2, window.innerWidth - width - 16));
  const top = Math.max(16, Math.min(point ? point.y + 12 : window.innerHeight * 0.08, window.innerHeight - height - 16));
  return <>
    <div className="fixed inset-0 z-40 bg-black/15" onPointerDown={() => { if (!busy) onDismiss(); }} />
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-raised shadow-panel"
      style={{ left, top, width, maxHeight: height }} onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) onDismiss(); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); if (!busy) onSave(); }
        if (e.key === 'Tab') {
          const items = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
          if (!items?.length) return;
          const first = items[0]; const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }}>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <span id={titleId} className="text-[14px] font-bold text-tp">{title}</span>
        <button type="button" aria-label="关闭编辑" disabled={busy} onClick={onDismiss}
          className="rounded-md px-2 text-[20px] text-ts hover:bg-[var(--hover-overlay)]">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      {error && <div role="alert" className="px-5 pb-2 text-[12px] text-danger">{error}</div>}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-3">{footer}</div>
    </div>
  </>;
}
