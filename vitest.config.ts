import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 20000,
    fileParallelism: false,
    maxWorkers: 1,
    exclude: ['node_modules/**', '**/node_modules/**', 'e2e/**'],
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      include: ['server/src/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: [
        'server/src/**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/__tests__/**',
        'e2e/**',
        'node_modules/**',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
