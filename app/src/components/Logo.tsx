/**
 * 品牌图标：默认用 avatar.png（用户头像，scripts/apply-avatar.mjs 生成全套），
 * 设置中心 DIY 的自定义图标（settings.appIcon dataURL）优先。
 */
import { useStore } from '../store/useStore';
import defaultAvatar from '../assets/avatar.png';

export function LogoMark({ size = 28, shape = 'squircle' }: { size?: number; shape?: 'squircle' | 'circle' }) {
  const custom = useStore((s) => s.settings.appIcon);
  const src = custom || defaultAvatar;
  return (
    <img
      src={src}
      width={size}
      height={size}
      aria-hidden
      draggable={false}
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        borderRadius: shape === 'circle' ? '50%' : Math.round(size * 0.23),
        display: 'block',
      }}
    />
  );
}
