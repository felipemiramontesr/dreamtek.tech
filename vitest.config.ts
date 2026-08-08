import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/src/**/*.ts'],
      exclude: [
        'server/src/**/*.d.ts',
        'server/src/index.ts',
        'server/src/db.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 55,
        statements: 75,
      },
    },
  },
});
