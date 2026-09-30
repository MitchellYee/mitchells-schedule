import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { chronaApiPlugin } from './server/api-plugin';

export default defineConfig({
  plugins: [react(), chronaApiPlugin()],
  server: { port: 5173 },
});
