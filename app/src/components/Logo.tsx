/**
 * Mitchell's Schedule 品牌图标。
 * 设计规范：squircle 容器（深色高级底）+ 靛蓝→紫柔和渐变 + 单一焦点符号（日历页 + M）。
 * 参考 2025 图标趋势：圆角容器、低饱和深底、简化几何、高对比焦点。
 */

export function LogoMark({ size = 28, shape = 'squircle' }: { size?: number; shape?: 'squircle' | 'circle' }) {
  const id = `lg-${shape}`;
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="20" y1="8" x2="108" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {/* 容器 */}
      {shape === 'squircle' ? (
        <>
          <rect x="4" y="4" width="120" height="120" rx="30" fill="#17181F" />
          <rect x="5.25" y="5.25" width="117.5" height="117.5" rx="28.75" stroke={`url(#${id}-g)`} strokeOpacity="0.5" strokeWidth="2.5" />
        </>
      ) : (
        <>
          <circle cx="64" cy="64" r="60" fill="#17181F" />
          <circle cx="64" cy="64" r="58.75" stroke={`url(#${id}-g)`} strokeOpacity="0.5" strokeWidth="2.5" />
        </>
      )}
      {/* 日历页（焦点符号的舞台，弱化） */}
      <rect x="32" y="36" width="64" height="62" rx="12" fill="#FFFFFF" fillOpacity="0.05" />
      {/* 挂环点（日历隐喻） */}
      <circle cx="47" cy="32" r="5" fill={`url(#${id}-g)`} />
      <circle cx="81" cy="32" r="5" fill={`url(#${id}-g)`} />
      {/* 渐变日程条 */}
      <rect x="44" y="48" width="40" height="7" rx="3.5" fill={`url(#${id}-g)`} />
      {/* M 字（Mitchell） */}
      <path
        d="M46 92V66L60 81L74 66V92"
        stroke="#F4F4F6"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
