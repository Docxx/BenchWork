import { lazy, Suspense } from 'react';
import type { LabelStudioProps } from './LabelStudio';
const Studio = lazy(() => import('./LabelStudio').then((m) => ({ default: m.LabelStudio })));
export function LabelStudio(props: LabelStudioProps) {
  return (
    <Suspense fallback={<p>Opening Label Studio…</p>}>
      <Studio {...props} />
    </Suspense>
  );
}
