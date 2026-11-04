import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import { CrossesTab } from './CrossesTab';
import { emptyPlan, PlannerTab, type Plan } from './PlannerTab';
import { StocksTab } from './StocksTab';
import type { FlyStore } from './store';

const TABS = [
  { id: 'stocks', label: 'Stocks' },
  { id: 'planner', label: 'Cross planner' },
  { id: 'crosses', label: 'Crosses' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Fly room: stocks, the cross planner, and crosses being tracked. */
export function FlyRoomView({
  ctx,
  store,
  start,
}: {
  ctx: ModuleContext;
  store: FlyStore;
  /** A tab to open at, such as `crosses` from the Home card. */
  start?: string | null;
}) {
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.id === start)?.id ?? 'stocks');
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [openCross, setOpenCross] = useState<string | null>(null);

  return (
    <div className="fly-view">
      <div className="ribbon-tabs fly-tabs" role="tablist" aria-label="Fly room">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'stocks' && (
        <StocksTab
          ctx={ctx}
          store={store}
          onPlan={(stock, as) => {
            const parent = { stock: stock.name, genotype: stock.genotype };
            setPlan(as === 'mother' ? { ...plan, mother: parent } : { ...plan, father: parent });
            setTab('planner');
          }}
        />
      )}
      {tab === 'planner' && (
        <PlannerTab
          store={store}
          plan={plan}
          onPlan={setPlan}
          onTracked={(path) => {
            setOpenCross(path);
            setTab('crosses');
          }}
        />
      )}
      {tab === 'crosses' && (
        <CrossesTab
          ctx={ctx}
          store={store}
          open={openCross}
          onOpen={setOpenCross}
          onCrossOn={(next) => {
            setPlan(next);
            setTab('planner');
          }}
        />
      )}
    </div>
  );
}
