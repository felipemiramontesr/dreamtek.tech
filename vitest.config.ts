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
      include: [
        'src/**/*.{ts,tsx}',
        'server/src/middleware/**/*.{ts,js}',
        'server/src/utils/**/*.{ts,js}',
        'server/src/schemas/**/*.{ts,js}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/__tests__/**',
        'server/src/**/*.d.ts',
        'server/src/utils/crypto.ts',
        'server/src/db.ts',
        'server/src/index.ts',
      ],
      thresholds: {
        'server/src/middleware/auth.ts': { lines: 75, functions: 100, branches: 60, statements: 75 },
        'server/src/middleware/auditLogger.ts': { lines: 40, functions: 50, branches: 15, statements: 40 },
        'server/src/utils/cache.ts': { lines: 50, functions: 70, branches: 50, statements: 50 },
        lines: 65,
        functions: 65,
        branches: 60,
        statements: 65,
      },
    },
  },
});
