// The part of react-test-renderer the hook tests use (it ships no types of its own).
declare module 'react-test-renderer' {
  import type { ReactNode } from 'react';

  export interface ReactTestRenderer {
    unmount(): void;
  }
  export function create(element: ReactNode): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
