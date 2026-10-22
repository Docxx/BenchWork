import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not lay pages out, so it has no geometry. ProseMirror asks for
// it when scrolling the cursor into view; empty answers are enough in tests.
if (typeof window !== 'undefined') {
  const fill = (target: object, name: string, value: unknown) => {
    const record = target as Record<string, unknown>;
    if (typeof record[name] !== 'function') record[name] = value;
  };
  for (const proto of [Element.prototype, Range.prototype]) {
    fill(proto, 'getClientRects', () => []);
    fill(proto, 'getBoundingClientRect', () => new DOMRect(0, 0, 0, 0));
  }
  fill(document, 'elementFromPoint', () => null);
}
