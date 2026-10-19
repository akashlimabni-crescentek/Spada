// src/components/custom/markets/MarketOutcomesList.tsx
import { Card } from "@/components/ui/card";
import type { Market } from "@/types/market";

export function MarketOutcomesList({ market }: { market: Market }) {
  const outcomePrices = market.outcome_prices ?? [];

  if (!outcomePrices.length) {
    return (
      <Card className="p-4 min-w-0">
        <h3 className="t-h3 mb-2">Outcomes</h3>
        <span className="t-meta text-dim">No outcome data available.</span>
      </Card>
    );
  }


  const deduped = Object.values(
    outcomePrices.reduce((acc, o) => {
      if (!acc[o.name] || o.percentage > acc[o.name].percentage) {
        acc[o.name] = o;
      }
      return acc;
    }, {} as Record<string, typeof outcomePrices[number]>)
  );


  const sorted = [...deduped].sort((a, b) => b.percentage - a.percentage);

  return (
    <Card className="p-4 min-w-0">
      <h3 className="t-h3 mb-3">Outcomes</h3>

      <div className="flex flex-col gap-1">
        {sorted.map((outcome) => (
          <div
            key={outcome.name}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md hover:bg-raised transition-colors min-w-0"
          >
            <span className="t-ui truncate flex-1 min-w-0">{outcome.name}</span>

            <div className="flex items-center gap-3 shrink-0">
              {/* Mini bar — quick visual weight */}
              <div className="hidden sm:block w-24 h-1.5 rounded-full bg-inset overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${outcome.percentage}%` }}
                />
              </div>

              <span className="n text-foreground w-14 text-right">
                {Math.round(outcome.percentage)}%
              </span>

              <span className="n-sm text-text-dim w-14 text-right">
                {outcome.price.toFixed(2)}¢
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}