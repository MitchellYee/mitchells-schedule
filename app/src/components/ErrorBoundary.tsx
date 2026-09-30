import React from 'react';

interface State {
  error: Error | null;
}

/** 顶层错误边界：渲染异常时显示可恢复的错误页，而不是整个应用白屏/黑屏 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Chrona] 渲染异常：', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-base p-8 text-center">
          <div className="text-[15px] font-semibold text-tp">界面渲染出现了一个问题</div>
          <div className="max-w-xl break-all rounded-lg bg-subtle p-3 text-left text-[12px] text-ts">
            {String(this.state.error.message)}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-[var(--accent-contrast)]"
              onClick={() => this.setState({ error: null })}
            >
              重试
            </button>
            <button
              className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-ts hover:text-tp"
              onClick={() => location.reload()}
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
