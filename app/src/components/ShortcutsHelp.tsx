import { useStore } from '../store/useStore';
import { Kbd } from './Sidebar';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: '视图与导航',
    items: [
      ['1 / D', '日视图'], ['2 / W', '周视图'], ['3 / M', '月视图'], ['4 / A', '议程视图'],
      ['T', '回到今天'], ['P / N', '上一 / 下一周期'], ['J / K', '下一个 / 上一个事件'],
    ],
  },
  {
    title: '事件操作',
    items: [
      ['C', '新建事件（今天下一个整刻）'],
      ['E', '编辑选中事件'],
      ['Delete', '删除选中事件'],
      ['↑ ↓', '移动选中事件时间（±15 分钟）'],
      ['Shift + ↑ ↓', '调整选中事件时长'],
      ['← →', '周 / 日视图内前后移动一天'],
      ['Z 或 Ctrl+Z', '撤销上一步'],
    ],
  },
  {
    title: '鼠标与拖拽',
    items: [
      ['单击空白', '快速创建（默认 1 小时）'],
      ['拖拽空白', '划选时间段创建'],
      ['拖拽事件', '移动（跨天 / 跨周）'],
      ['拖拽上下边缘', '调整时长'],
      ['按住 Alt 拖拽', '1 分钟精度微调'],
      ['单击事件', '打开编辑抽屉'],
      ['拖任务入网格', '排期为时间块'],
    ],
  },
  {
    title: '界面',
    items: [
      ['Ctrl + K', '命令面板'], ['/', '搜索命令'],
      ['S / R', '折叠左栏 / 任务面板'], ['?', '本帮助'], ['Esc', '关闭浮层'],
    ],
  },
];

export default function ShortcutsHelp() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onPointerDown={() => setOpen(false)} />
      <div className="fixed left-1/2 top-[10%] z-[61] max-h-[80vh] w-[640px] max-w-[92vw] -translate-x-1/2 overflow-y-auto rounded-2xl border border-line bg-raised p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-tp">键盘快捷键</h2>
          <button className="rounded-md p-1.5 text-ts hover:bg-[var(--hover-overlay)]" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-accent">{g.title}</div>
              <div className="space-y-1.5">
                {g.items.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-tp">{d}</span>
                    <span className="shrink-0"><Kbd>{k}</Kbd></span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
