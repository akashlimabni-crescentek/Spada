"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { usePriceStore } from "@/stores/usePriceStore";

interface OrderLevel {
  price: number | string;
  size: number | string;
}

interface OrderBookProps {
  bids: OrderLevel[];
  asks: OrderLevel[];
  canonicalId?: string;
}

function levelNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function OrderBook({ bids, asks, canonicalId }: OrderBookProps) {
  const safeBids = bids ?? [];
  const safeAsks = asks ?? [];

  // Live price subscription from WebSocket price store
  const livePrices = usePriceStore((state) => (canonicalId ? state.prices[canonicalId] : undefined));
  const currentPrice = livePrices?.[0] != null && Number.isFinite(livePrices[0]) ? livePrices[0] : null;

  const [priceDirection, setPriceDirection] = useState<"up" | "down" | null>(null);
  const [flashSpread, setFlashSpread] = useState(false);
  const prevPriceRef = useRef<number | null>(null);
  const prevSpreadRef = useRef<number | null>(null);

  const sortedAsks = [...safeAsks].sort((a, b) => levelNumber(a.price) - levelNumber(b.price));
  const sortedBids = [...safeBids].sort((a, b) => levelNumber(b.price) - levelNumber(a.price));

  const bestAsk = sortedAsks[0] ? levelNumber(sortedAsks[0].price) : null;
  const bestBid = sortedBids[0] ? levelNumber(sortedBids[0].price) : null;
  const spread = bestAsk != null && bestBid != null ? Number((bestAsk - bestBid).toFixed(4)) : null;

  // Max size for relative depth bar calculations
  const maxAskSize = Math.max(...sortedAsks.map((a) => levelNumber(a.size)), 1);
  const maxBidSize = Math.max(...sortedBids.map((b) => levelNumber(b.size)), 1);

  // Trigger real-time flash animation when live price moves
  useEffect(() => {
    if (currentPrice == null) return;
    if (prevPriceRef.current != null && prevPriceRef.current !== currentPrice) {
      const dir = currentPrice > prevPriceRef.current ? "up" : "down";
      setPriceDirection(dir);
      const timer = setTimeout(() => setPriceDirection(null), 800);
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  // Trigger flash when spread shifts
  useEffect(() => {
    if (spread == null) return;
    if (prevSpreadRef.current != null && prevSpreadRef.current !== spread) {
      setFlashSpread(true);
      const timer = setTimeout(() => setFlashSpread(false), 600);
      return () => clearTimeout(timer);
    }
    prevSpreadRef.current = spread;
  }, [spread]);

  if (!safeBids.length && !safeAsks.length) {
    return (
      <Card className="p-4 min-w-0" data-testid="orderbook-no-orders">
        <div className="flex items-center justify-between mb-2">
          <h3 className="t-h3">Order Book</h3>
          <span className="flex items-center gap-1.5 text-[11px] text-dim font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-dim" />
            Idle
          </span>
        </div>
        <span className="t-meta text-dim">No open orders for this market.</span>
      </Card>
    );
  }

  const effectiveMid =
    currentPrice != null
      ? currentPrice
      : bestBid != null && bestAsk != null
        ? (bestBid + bestAsk) / 2
        : bestBid ?? bestAsk ?? null;

  return (
    <Card className="p-4 min-w-0" data-testid="orderbook-levels">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="t-h3">Order Book</h3>
          <span className="flex items-center gap-1 text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
        {priceDirection && (
          <span
            className={`text-xs font-mono font-semibold transition-all duration-300 ${
              priceDirection === "up" ? "text-positive" : "text-negative"
            }`}
          >
            {priceDirection === "up" ? "▲ Tick Up" : "▼ Tick Down"}
          </span>
        )}
      </div>

      {/* Best bid / ask / spread summary */}
      <div className="grid grid-cols-3 gap-2 mb-3 pb-3 border-b border-divider">
        <div className="flex flex-col">
          <span className="t-label text-dim">Best Bid</span>
          <span className="n text-positive font-mono transition-colors duration-200">
            {bestBid != null ? `$${bestBid.toFixed(3)}` : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="t-label text-dim">Best Ask</span>
          <span className="n text-negative font-mono transition-colors duration-200">
            {bestAsk != null ? `$${bestAsk.toFixed(3)}` : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="t-label text-dim">Spread</span>
          <span
            className={`n font-mono transition-colors duration-200 ${
              flashSpread ? "text-primary" : "text-foreground"
            }`}
          >
            {spread != null ? `$${spread.toFixed(3)}` : "—"}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 t-label text-dim pb-2 select-none">
        <span>Price ($ per share)</span>
        <span className="text-right">Size (shares)</span>
      </div>

      {/* Asks (Sells, red, lowest ask closest to bottom) */}
      <div className="orderbook-scroll max-h-44 min-w-0 overflow-y-auto space-y-0.5">
        {sortedAsks.length ? (
          sortedAsks.map((ask, i) => {
            const price = levelNumber(ask.price);
            const size = levelNumber(ask.size);
            const depthPercent = Math.min(100, Math.max(8, Math.round((size / maxAskSize) * 100)));

            return (
              <div
                key={`ask-${i}-${price}`}
                className="relative grid grid-cols-2 n-sm py-1 px-1.5 rounded overflow-hidden transition-all duration-300 hover:bg-white/5"
              >
                {/* Horizontal depth visualization bar */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-red-500/15 pointer-events-none transition-all duration-500 rounded-sm"
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="relative z-10 text-negative font-mono font-medium">
                  ${price.toFixed(3)}
                </span>
                <span className="relative z-10 text-right text-text-dim font-mono transition-all duration-300">
                  {size.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })
        ) : (
          <span className="t-meta text-dim py-2 block">No sell orders.</span>
        )}
      </div>

      {/* Real-time Center Price Ticker (moves dynamically on every WebSocket tick) */}
      <div
        className={`flex items-center justify-between px-2.5 py-1.5 my-2 rounded border font-mono transition-all duration-300 ${
          priceDirection === "up"
            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
            : priceDirection === "down"
              ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
              : "bg-muted/40 border-border/40 text-foreground"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-sans text-dim">Market Price:</span>
          <span className="font-bold text-sm tracking-tight transition-colors duration-200">
            {effectiveMid != null ? `$${effectiveMid.toFixed(3)}` : "—"}
          </span>
          {priceDirection === "up" && <span className="text-emerald-400 text-xs animate-bounce">▲</span>}
          {priceDirection === "down" && <span className="text-rose-400 text-xs animate-bounce">▼</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-dim">
          <span>Spread:</span>
          <span className="text-foreground font-medium font-mono">
            {spread != null ? `$${spread.toFixed(3)}` : "—"}
          </span>
        </div>
      </div>

      {/* Bids (Buys, green, highest bid closest to top) */}
      <div className="orderbook-scroll max-h-44 min-w-0 overflow-y-auto space-y-0.5">
        {sortedBids.length ? (
          sortedBids.map((bid, i) => {
            const price = levelNumber(bid.price);
            const size = levelNumber(bid.size);
            const depthPercent = Math.min(100, Math.max(8, Math.round((size / maxBidSize) * 100)));

            return (
              <div
                key={`bid-${i}-${price}`}
                className="relative grid grid-cols-2 n-sm py-1 px-1.5 rounded overflow-hidden transition-all duration-300 hover:bg-white/5"
              >
                {/* Horizontal depth visualization bar */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-emerald-500/15 pointer-events-none transition-all duration-500 rounded-sm"
                  style={{ width: `${depthPercent}%` }}
                />
                <span className="relative z-10 text-positive font-mono font-medium">
                  ${price.toFixed(3)}
                </span>
                <span className="relative z-10 text-right text-text-dim font-mono transition-all duration-300">
                  {size.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })
        ) : (
          <span className="t-meta text-dim py-2 block">No buy orders.</span>
        )}
      </div>
    </Card>
  );
}
