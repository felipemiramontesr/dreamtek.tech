import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

vi.mock('next-export-optimize-images/image', () => {
  return {
    default: (props: Record<string, unknown>) =>
      React.createElement('img', { ...props, alt: (props.alt as string) || '' }),
  };
});
