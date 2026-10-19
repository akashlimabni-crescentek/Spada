// src/components/custom/markets/MultiOutcomeBars.tsx
import type { OutcomePrice } from "@/types/market";

const BAR_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3"];

export function MultiOutcomeBars({ outcomePrices }: { outcomePrices: OutcomePrice[] }) {
  const safePrices = outcomePrices ?? [];

  const topThree = [...safePrices]
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3);

  if (!topThree.length) {
    return <span className="t-meta text-dim">No outcome data.</span>;
  }


  console.log("topThree  ==>",topThree);

  return (
    <div className="flex flex-col gap-1.5">
      {topThree.map((outcome, i) => (
        <div key={`${outcome.name}-${i}`} className="flex items-center gap-2">
          <span className="t-label text-dim truncate w-16 shrink-0">
            {outcome.name}
          </span>
          <div className="flex-1 h-2 rounded-full bg-inset overflow-hidden min-w-0">
            <div
              className={`h-full rounded-full ${BAR_COLORS[i]}`}
              style={{ width: `${outcome.percentage}%` }}
            />
          </div>
          <span className="n-sm text-text-dim w-10 text-right shrink-0">
            {Math.round(outcome.percentage)}%
          </span>
        </div>
      ))}
    </div>
  );
}