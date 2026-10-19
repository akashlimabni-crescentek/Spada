import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Market } from "@/types/market";
import { Separator } from "@/components/ui/separator";
import { WatchlistToggle } from "./WatchListToggle";

import { BinaryPrice } from "./swaps/binary";
import { useLivePrice } from "@/stores/usePriceStore";
import { useMarketSubscription } from "@/providers/priceStreamConnector";
import { MultiOutcomeBars } from "./swaps/multiOutcome";
import { getTimeRemaining } from "@/helpers/TimeRemaining";



export function MarketCard({ market }: { market: Market }) {
    useMarketSubscription(market.canonical_id);
    const livePrices = useLivePrice(market.canonical_id, market.prices);
    const outcomes = market.outcomes ?? [];

  return (
    <Link href={`/singleMarket/${market.canonical_id}`}>
      <Card className="relative flex flex-row gap-3 m-5 p-3 items-center md:max-w-110 h-65">
        <div className="flex flex-col justify-start gap-1 flex-1 min-w-0">
          <span className="t-ui">{market.category}</span>
          <WatchlistToggle
            canonicalId={market.canonical_id}
            platform={market.platform}
            className="absolute top-3 right-3"
          />
          <span className="t-h3 line-clamp-2 mb-5">{market.title}</span>

          {outcomes.length === 2 ? (
            <BinaryPrice
              outcomeALabel={outcomes[0]}
              outcomeBLabel={outcomes[1]}
              outcomeAPrice={livePrices[0]}
              outcomeBPrice={livePrices[1]}
            />
          ) : (
            <MultiOutcomeBars outcomePrices={market.outcome_prices} />
          )}

          <Separator className="mt-5 mb-5" />

          <div className="flex flex-row justify-between">
            <span className="t-label capitalize pr-5">{market.platform}</span>
            <span className="t-label pr-5">{getTimeRemaining(market.close_time)}</span>
            <span className="n-sm pr-5">
              $
              {(
                market.outcome_type === "categorical" &&
                market.event_volume != null &&
                Number.isFinite(market.event_volume)
                  ? market.event_volume
                  : market.volume
              ).toLocaleString("en-us", { maximumFractionDigits: 0 })}
            </span>
          </div>
          
        </div>
      </Card>
    </Link>
  );
}