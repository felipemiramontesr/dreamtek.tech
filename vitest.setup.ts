import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

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
