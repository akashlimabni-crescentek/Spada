"use client";

import { use } from "react";

import { Card } from "@/components/ui/card";
import { Tabs, TabsTrigger, TabsContent, TabsList } from "@/components/ui/tabs";
import { MarketActionBar } from "@/components/custom/markets/ActionBar";

import { useMarket } from "@/hooks/useSingleMarket";
import { useRelatedNews } from "@/hooks/useRelatedNews";

import { SmNewsCard } from "@/components/custom/news/SmNewsCard";
import CalculatorSuite from "@/components/custom/markets/CalculatorSuite";
import { useRatios } from "@/hooks/dashboard/useMarketRatio";
import { useOrderBook } from "@/hooks/useOrderBook";
import { OrderBook } from "@/components/custom/markets/OrderBook";
import { AiSummaryCard } from "@/components/custom/markets/AiSummary";
import { MarketOutcomesList } from "@/components/custom/markets/MarketOutcomes";
import { MarketRatios } from "@/components/custom/markets/MarketRatios";
import { BackButton } from "@/components/custom/nav/BackButton";

import { getTimeRemaining } from "@/helpers/TimeRemaining";
import { HistoricalOhlcvChart } from "@/components/custom/markets/HistoricalOhlcvChart";
import { useMarketSubscription } from "@/providers/priceStreamConnector";
import { resolveMarketTitle } from "@/lib/markets/marketTitle";

export default function SingleMarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Live prices come from the real WebSocket connector + price store — no fake ticks.
  useMarketSubscription(id);

  const { data: market, isLoading, isError } = useMarket(id);
  const { data: relatedNews } = useRelatedNews(id);

  const {
    data: relatedMarket,
    isLoading: isRatiosLoading,
    isError: isRatiosError,
  } = useRatios(id);
  const { data: orderBook, isLoading: isOrderBookLoading } = useOrderBook(id);

  if (isLoading) {
    return (
      <div className="t-body" data-testid="market-loading">
        Loading...
      </div>
    );
  }

  if (isError || !market) {
    return (
      <div className="t-body text-negative" data-testid="market-error">
        Failed to load market.
      </div>
    );
  }

  const title = resolveMarketTitle(market.title);

  return (
    <div className="mb-32" data-testid="single-market-page">
      <div className="m-5 text-left md:mt-20 md:ml-10 md:mr-10 lg:mt-20 lg:ml-10 lg:mr-10 ">
        <BackButton />
        {title ? (
          <h1 className="t-h1" data-testid="market-title">
            {title}
          </h1>
        ) : (
          <h1 className="t-h1 text-dim" data-testid="market-title">
            Untitled market
          </h1>
        )}
        <div
          className="flex items-center gap-4 mb-6 flex-wrap"
          data-testid="market-meta"
        >
          <span className="t-ui">{market.category}</span>
          <span className="n-sm" data-testid="market-volume">
            $ {Math.round(market.volume).toLocaleString("en-us")} vol
          </span>
          {market.event_volume != null &&
          Number.isFinite(market.event_volume) &&
          Math.round(market.event_volume) !== Math.round(market.volume) ? (
            <span className="n-sm text-dim">
              $ {Math.round(market.event_volume).toLocaleString("en-us")} event vol
            </span>
          ) : null}
          <span className="t-ui">{market.platform}</span>
          <span className="t-ui">{getTimeRemaining(market.close_time)}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — 2/3 width */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div data-testid="market-chart">
            <HistoricalOhlcvChart market={market} />
          </div>

            <AiSummaryCard market={market} />

            <Card>
              <Tabs defaultValue="rules">
                <TabsList>
                  <TabsTrigger value="rules" className="t-h4">
                    Rules
                  </TabsTrigger>
                  <TabsTrigger value="resolution" className="t-h4">
                    Resolution
                  </TabsTrigger>
                  <TabsTrigger value="context" className="t-h4">
                    Context
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="rules" className="t-ui text-left p-5">
                  {market.rules || "No Market Rules Avalible"}
                </TabsContent>
                <TabsContent value="resolution" className="t-ui text-left p-5">
                  {market.resolution_source || "No resolution source provided."}
                </TabsContent>
                <TabsContent value="context" className="text-left t-ui p-5">
                  {market.context || "No resolution Context Provided"}
                </TabsContent>
              </Tabs>
            </Card>

            <MarketOutcomesList market={market} />

            {orderBook ? (
              <div data-testid="market-orderbook">
                <OrderBook bids={orderBook.bids} asks={orderBook.asks} canonicalId={id} />
              </div>
            ) : !isOrderBookLoading ? (
              <Card className="p-4 min-w-0" data-testid="market-orderbook-empty">
                <h3 className="t-h3 mb-2">Order Book</h3>
                <span className="t-meta text-dim">
                  No order book data available for this market.
                </span>
              </Card>
            ) : null}
            {market && <MarketActionBar market={market} />}

            <MarketRatios
              ratios={relatedMarket?.ratios}
              inputs={relatedMarket?.inputs}
              matched={relatedMarket?.matched}
              message={relatedMarket?.message}
              counterMarket={relatedMarket?.counterMarket}
              similarity={relatedMarket?.similarity}
              isLoading={isRatiosLoading}
              isError={isRatiosError}
            />

            <Card className="p-4 min-w-0">
              <h3 className="t-h3 mb-2">Cross Platform</h3>
              {isRatiosLoading ? (
                <span className="t-meta text-dim">Loading comparison…</span>
              ) : isRatiosError ? (
                <span className="t-meta text-dim">
                  Cross-platform comparison unavailable.
                </span>
              ) : relatedMarket ? (
                <div className="flex flex-col gap-1">
                  <span className="t-meta">
                    {relatedMarket.matched ? "Matched" : "No match"}
                  </span>
                  {relatedMarket.message ? (
                    <span className="t-meta text-dim">{relatedMarket.message}</span>
                  ) : null}
                  {relatedMarket.matched &&
                  relatedMarket.similarity != null &&
                  Number.isFinite(relatedMarket.similarity) ? (
                    <span className="n-sm text-dim">
                      Similarity {(relatedMarket.similarity * 100).toFixed(0)}%
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="t-meta text-dim">No comparison data available.</span>
              )}
            </Card>
          </div>

          {/* Right — 1/3 width, sidebar widgets */}
          <div className="flex flex-col gap-6">
            <CalculatorSuite />

            <div className="flex flex-col gap-2">
              <h2 className="t-h3">Related News</h2>
              {relatedNews?.length ? (
                relatedNews.slice(0, 3).map((article) => (
                  <SmNewsCard key={article.article_url} article={article} />
                ))
              ) : (
                <span className="t-meta">No related news.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
