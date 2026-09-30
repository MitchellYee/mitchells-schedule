import { useStore } from '../store/useStore';

/** 右下角 toast（带撤销按钮，设计方案 §6.3） */
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const hasUndo = useStore((s) => s.undos.length > 0);
  const dismissToast = useStore((s) => s.dismissToast);
  const undo = useStore((s) => s.undo);

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[70] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-raised px-3.5 py-2.5 shadow-panel"
        >
          <span className="text-[12px] text-tp">{t.message}</span>
          {hasUndo && (
            <button
              className="text-[12px] font-semibold text-accent hover:underline"
              onClick={() => { dismissToast(t.id); void undo(); }}
            >
              撤销
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
