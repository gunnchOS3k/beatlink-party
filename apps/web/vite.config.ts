import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@beatlink/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@beatlink/game-engine': path.resolve(__dirname, '../../packages/game-engine/src'),
      '@beatlink/device-ux': path.resolve(__dirname, '../../device_ux/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
