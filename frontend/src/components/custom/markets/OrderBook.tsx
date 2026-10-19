"use client";

import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface OrderLevel {
  price: number | string;
  size: number | string;
}

interface OrderBookProps {
  bids: OrderLevel[];
  asks: OrderLevel[];
}

function levelNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function OrderBook({ bids, asks }: OrderBookProps) {

  const safeBids = bids ?? [];
  const safeAsks = asks ?? [];

  const sortedAsks = [...safeAsks].sort((a, b) => levelNumber(a.price) - levelNumber(b.price));
  const sortedBids = [...safeBids].sort((a, b) => levelNumber(b.price) - levelNumber(a.price));

  const bestAsk = sortedAsks[0] ? levelNumber(sortedAsks[0].price) : null;
  const bestBid = sortedBids[0] ? levelNumber(sortedBids[0].price) : null;
  const spread = bestAsk != null && bestBid != null ? (bestAsk - bestBid) : null;

  if (!safeBids.length && !safeAsks.length) {
    return (
      <Card className="p-4 min-w-0" data-testid="orderbook-no-orders">
        <h3 className="t-h3 mb-2">Order Book</h3>
        <span className="t-meta text-dim">No open orders for this market.</span>
      </Card>
    );
  }

  return (
    <Card className="p-4 min-w-0" data-testid="orderbook-levels">
      <h3 className="t-h3 mb-3">Order Book</h3>

      {/* Best bid / ask / spread summary — the "so what" at a glance */}
      <div className="grid grid-cols-3 gap-2 mb-3 pb-3 border-b border-divider">
        <div className="flex flex-col">
          <span className="t-label text-dim">Best Bid</span>
          <span className="n text-positive">
            {bestBid != null ? `$${bestBid.toFixed(3)}` : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="t-label text-dim">Best Ask</span>
          <span className="n text-negative">
            {bestAsk != null ? `$${bestAsk.toFixed(3)}` : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="t-label text-dim">Spread</span>
          <span className="n text-foreground">
            {spread != null ? `$${spread.toFixed(3)}` : "—"}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 t-label text-dim pb-2">
        <span>Price ($ per share)</span>
        <span className="text-right">Size (shares)</span>
      </div>

      {/* Asks — sells, red, best (lowest) closest to the middle */}
      <div className="orderbook-scroll max-h-40 min-w-0 overflow-y-auto">
        {sortedAsks.length ? (
          sortedAsks.map((ask, i) => (
            <div key={i} className="grid grid-cols-2 n-sm py-1">
              <span className="text-negative">${levelNumber(ask.price).toFixed(3)}</span>
              <span className="text-right text-text-dim">
                {levelNumber(ask.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))
        ) : (
          <span className="t-meta text-dim">No sell orders.</span>
        )}
      </div>

      <Separator className="my-2" />

      {/* Bids — buys, green, best (highest) closest to the middle */}
      <div className="orderbook-scroll max-h-40 min-w-0 overflow-y-auto">
        {sortedBids.length ? (
          sortedBids.map((bid, i) => (
            <div key={i} className="grid grid-cols-2 n-sm py-1">
              <span className="text-positive">${levelNumber(bid.price).toFixed(3)}</span>
              <span className="text-right text-text-dim">
                {levelNumber(bid.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))
        ) : (
          <span className="t-meta text-dim">No buy orders.</span>
        )}
      </div>
    </Card>
  );
}
