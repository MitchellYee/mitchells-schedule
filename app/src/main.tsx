import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import FloatWindow from './components/FloatWindow';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

dayjs.locale('zh-cn');

// 桌面悬浮窗模式（Electron ?mode=float）；否则渲染完整应用
const isFloatMode = new URLSearchParams(window.location.search).get('mode') === 'float';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isFloatMode ? <FloatWindow /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
