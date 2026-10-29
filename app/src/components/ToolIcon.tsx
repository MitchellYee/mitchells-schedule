export default function ToolIcon({ id, size = 22 }: { id: string; size?: number }) {
  const shapes: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/></>,
    translate: <><path d="M3 5h12M9 3v2m3 0c0 6-4 9-9 11m1-8c1 3 4 6 7 7m2 6 4-11 4 11m-7-3h6"/></>,
    latex: <><path d="M17 4H6l7 8-7 8h11M4 4h2m-2 16h2"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--bg-base)"/><circle cx="15" cy="17" r="3" fill="var(--bg-base)"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{shapes[id] || shapes.home}</svg>;
}
