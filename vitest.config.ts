import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
    exclude: ['node_modules/**', '**/node_modules/**', 'e2e/**'],
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/src/**/*.ts', 'src/lib/**/*.ts'],
      exclude: [
        'server/src/**/*.d.ts',
        'server/src/index.ts',
        'server/src/db.ts',
        'src/lib/db/types.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 80,
        branches: 75,
        statements: 85,
      },
    },
  },
});
