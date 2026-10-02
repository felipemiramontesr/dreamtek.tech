import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';

const initialEnv = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  cleanup();
  // Restore pristine process.env to prevent cross-test leakage (NODE_ENV, JWT_SECRET, etc.)
  for (const key of Object.keys(process.env)) {
    if (!(key in initialEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(initialEnv)) {
    process.env[key] = value;
  }
  process.env.NODE_ENV = 'test';
});

vi.mock('next-export-optimize-images/image', () => {
  return {
    default: (props: Record<string, unknown>) =>
      React.createElement('img', { ...props, alt: (props.alt as string) || '' }),
  };
});

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  };
});

