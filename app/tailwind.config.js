/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        subtle: 'var(--bg-subtle)',
        raised: 'var(--bg-raised)',
        line: 'var(--border-subtle)',
        linestrong: 'var(--border-strong)',
        tp: 'var(--text-primary)',
        ts: 'var(--text-secondary)',
        tt: 'var(--text-tertiary)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        danger: 'var(--danger)'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        pop: 'var(--shadow-pop)',
        panel: 'var(--shadow-panel)'
      }
    }
  },
  plugins: []
};
