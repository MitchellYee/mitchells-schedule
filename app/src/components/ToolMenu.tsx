import { useEffect, useRef, useState } from 'react';
import { toolRegistry } from '../tools/registry';
import { useStore } from '../store/useStore';

export default function ToolMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = useStore((s) => s.activeTool);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={ref} className="relative">
    <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ts hover:bg-subtle">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="16" height="11" rx="2"/><path d="M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M2 10h16M8 9v3h4V9"/></svg>
      工具箱 <span className="text-tt">⌄</span>
    </button>
    {open && <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line bg-raised p-2 shadow-panel">
      <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-tt">我的工作工具</div>
      {toolRegistry.map((tool) => <button key={tool.id} disabled={tool.status !== 'ready'}
        onClick={() => { useStore.getState().setActiveTool(tool.id); setOpen(false); }}
        className={`mb-1 block w-full rounded-xl px-3 py-3 text-left ${tool.status === 'planned' ? 'opacity-55' : active === tool.id ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
        <span className={`block text-[13px] font-semibold ${active === tool.id ? 'text-accent' : 'text-tp'}`}>{tool.name}{active === tool.id ? '  ✓' : ''}</span>
        <span className="mt-1 block text-[11px] text-ts">{tool.description}</span>
      </button>)}
      <p className="border-t border-line px-3 pt-2 text-[11px] leading-5 text-tt">更多工具将逐步加入，日程继续作为当前工作区。</p>
    </div>}
  </div>;
}
