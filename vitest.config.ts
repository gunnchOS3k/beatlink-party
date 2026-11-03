import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.{ts,tsx}',
      'packages/**/src/**/*.test.ts',
      'scripts/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      'react': path.resolve(__dirname, 'apps/web/node_modules/react'),
      'react-dom': path.resolve(__dirname, 'apps/web/node_modules/react-dom'),
      '@beatlink/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@beatlink/game-engine': path.resolve(__dirname, 'packages/game-engine/src'),
      '@beatlink/device-ux': path.resolve(__dirname, 'device_ux/src'),
      'socket.io': path.resolve(__dirname, 'apps/server/node_modules/socket.io'),
      'socket.io-client': path.resolve(__dirname, 'apps/server/node_modules/socket.io-client'),
    },
  },
});
