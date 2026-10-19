"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import CategoryCarousel from "@/components/custom/categorycarousel";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { useState } from "react";
import { useMarkets } from "@/hooks/useMakret";
import { useNews } from "@/hooks/useNews";
import { MarketCard } from "@/components/custom/markets/MarketCardBase";
import { MdNewsCard } from "@/components/custom/news/MdNewsCard";
import { useEndingSoon } from "@/hooks/dashboard/useEndingSoon";
import { useMovers } from "@/hooks/dashboard/useMarketMovers";
import { useMarketMetrics } from "@/hooks/dashboard/useMarketMetrics";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BinaryPrice } from "@/components/custom/markets/swaps/binary";
import { getTimeRemaining } from "@/helpers/TimeRemaining";

export default function Dashboard() {


    const [category, setCategory] = useState<string | null>(null);
    // Snapshot once per mount so render stays pure (no Date.now() during render).
    const [nowMs] = useState(() => Date.now());

    const { data: newsArticles, isLoading: newsLoading, error: newsError } = useNews(category);
    const { data: marketsData, isLoading: marketsLoading, error: marketsError } = useMarkets({ limit: 8 });
    const { data: endingSoonMarkets, isLoading: endingSoonLoading, error: endingSoonError } = useEndingSoon(5, category ?? undefined);
    const { data: moverMarkets, isLoading: moversLoading, error: moversError } = useMovers(5, category ?? undefined);
    const { data: metrics, isLoading: metricsLoading, error: metricsError } = useMarketMetrics();


    const [featuredIndex, setFeaturedIndex] = useState(0);

    const featuredMarket = moverMarkets?.[featuredIndex];


    //Helper methods for formatting data below

    function nextFeatured() {
        if (!moverMarkets?.length) return;
        setFeaturedIndex((i) => (i + 1) % moverMarkets.length);
    }

    function prevFeatured() {
        if (!moverMarkets?.length) return;
        setFeaturedIndex((i) => (i - 1 + moverMarkets.length) % moverMarkets.length);
    }

    // changes colour of time based on how close to 0.
    function isUrgent(closeTime: string): boolean {
        const diffMs = new Date(closeTime).getTime() - nowMs;
        const hours = diffMs / 3_600_000;
        return hours < 24 && hours > 0;
    }


    function trendColor(trend: "up" | "down" | null | undefined): string {
        if (trend === "up") return "text-positive";
        if (trend === "down") return "text-negative";
        return "text-dim";
    }

    function formatChange(change: string | null | undefined): string {
        return change && change.trim() ? change : "—";
    }


    // adds value grouping if value is avbove threshold 42,000 -> 42k -  1,000,000 -> 1m
    function formatVolume(volume: number): string {
        if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
        if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
        return `$${volume}`;
    }


    //static top trader interface(note this is to keep the spacing of elements and will need to be populated later)
    interface TopTrader {
        id: string;
        name: string;
        volume: number;
    }

    const topTraders: TopTrader[] = [
        { id: "1", name: "Alex Chen", volume: 3250000 },
        { id: "2", name: "whale99", volume: 2680000 },
        { id: "3", name: "xX_Trader_Xx", volume: 1940000 },
        { id: "4", name: "Priya Nair", volume: 1512000 },
        { id: "5", name: "degen_tom", volume: 987000 },
    ];

    function getInitials(name: string): string {
        return name.trim().slice(0, 2).toUpperCase();
    }




    
    

    return (
        <>
            <div className="md:mt-20 lg:mt-20 ">
                <h1 className=" mt-7 ml-7 t-h2">Dashboard</h1>


                <CategoryCarousel selected={category} onSelect={setCategory} />

                

                <div className="grid grid-cols-1 gap-5 mt-5 px-5 md:grid-cols-3">


                  <Card className="w-full h-full md:col-span-2">
    <CardHeader className="t-ui flex items-center justify-between">
        <span>Featured Market</span>
        {moverMarkets && moverMarkets.length > 1 && (
            <div className="flex items-center gap-2">
                <button
                    onClick={prevFeatured}
                    aria-label="Previous market"
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-raised transition-colors"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="t-meta">{featuredIndex + 1} / {moverMarkets.length}</span>
                <button
                    onClick={nextFeatured}
                    aria-label="Next market"
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-raised transition-colors"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        )}
    </CardHeader>
    <Separator />

    <CardContent className="flex flex-col gap-3 p-4">
        {moversLoading && <p className="t-body">Loading…</p>}
        {moversError && <p className="t-body text-negative">Failed to load.</p>}

        {featuredMarket && (
            <Link href={`/singleMarket/${featuredMarket.canonical_id}`} className="flex flex-col gap-3">
                <span className="t-label">Top Mover</span>

                <span className="t-h1">{featuredMarket.title}</span>

<BinaryPrice
  outcomeALabel={featuredMarket.outcomes[0]}
  outcomeBLabel={featuredMarket.outcomes[1]}
  outcomeAPrice={featuredMarket.outcome_prices[0].price}
  outcomeBPrice={featuredMarket.outcome_prices[1].price}
/>

                <Separator />

                <div className="flex justify-between">
                    <span className="t-label">{featuredMarket.platform}</span>
                    <span className={`t-label ${isUrgent(featuredMarket.close_time) ? "text-negative" : ""}`}>
                        {getTimeRemaining(featuredMarket.close_time)} left
                    </span>
                    <span className="n-sm">{formatVolume(featuredMarket.volume)} vol</span>
                </div>
            </Link>
        )}
    </CardContent>
</Card>

                    

                    <Card className="w-full h-full">
                        <CardHeader className="t-ui">Market Metrics</CardHeader>
                        <Separator />

                        <CardContent className="flex flex-col p-0">
                            {metricsLoading && <p className="t-body px-4 py-2.5">Loading…</p>}
                            {metricsError && <p className="t-body text-negative px-4 py-2.5">Failed to load.</p>}

                            {metrics && (
                                <>
                                    <div className="flex flex-col gap-1 px-4 py-3">
                                        <span className="t-label">Polymarket</span>
                                        <div className="flex items-baseline justify-between">
                                            <span className="n-stat">{metrics.polymarket_active_count.toLocaleString("en-us")}</span>
                                            <span className={`n-sm font-semibold ${trendColor(metrics.polymarket_trend)}`}>
                                                {formatChange(metrics.polymarket_change_24h)}
                                            </span>
                                        </div>
                                    </div>
                                    <Separator />

                                    <div className="flex flex-col gap-1 px-4 py-3">
                                        <span className="t-label">Kalshi</span>
                                        <div className="flex items-baseline justify-between">
                                            <span className="n-stat">{metrics.kalshi_active_count.toLocaleString("en-us")}</span>
                                            <span className={`n-sm font-semibold ${trendColor(metrics.kalshi_trend)}`}>
                                                {formatChange(metrics.kalshi_change_24h)}
                                            </span>
                                        </div>
                                    </div>
                                    <Separator />

                                    <div className="flex flex-col gap-1 px-4 py-3">
                                        <span className="t-label">Total Volume</span>
                                        <div className="flex items-baseline justify-between">
                                            <span className="n-stat">{formatVolume(metrics.total_volume_usd)}</span>
                                            <span className={`n-sm font-semibold ${trendColor(metrics.volume_trend)}`}>
                                                {formatChange(metrics.volume_change_24h)}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                </div>






                <div className="grid grid-cols-1 gap-5 mt-5 px-5 lg:grid-cols-3">

                    <Card className="w-full h-full">
                        <CardHeader className="t-ui">Ending Soon</CardHeader>
                        <Separator />

                        <CardContent className="flex flex-col p-0">
                            {endingSoonLoading && <p className="t-body px-4 py-2.5">Loading…</p>}
                            {endingSoonError && <p className="t-body text-negative px-4 py-2.5">Failed to load.</p>}

                            {endingSoonMarkets?.map((market, i) => (
                                <div key={market.canonical_id}>
                                    <Link
                                        href={`/singleMarket/${market.canonical_id}`}
                                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-raised transition-colors"
                                    >
                                        <span className="t-body truncate">{market.title}</span>
                                        <span
                                            className={`n-sm shrink-0 ${isUrgent(market.close_time) ? "text-negative" : "text-warning"
                                                }`}
                                        >
                                            {getTimeRemaining(market.close_time)}
                                        </span>
                                    </Link>
                                    {i < endingSoonMarkets.length - 1 && <Separator />}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="w-full h-full">
                        <CardHeader className="t-ui">Highest Volume</CardHeader>
                        <Separator />

                        <CardContent className="flex flex-col p-0">
                            {moversLoading && <p className="t-body px-4 py-2.5">Loading…</p>}
                            {moversError && <p className="t-body text-negative px-4 py-2.5">Failed to load.</p>}

                            {moverMarkets?.map((market, i) => (
                                <div key={market.canonical_id}>
                                    <Link
                                        href={`/singleMarket/${market.canonical_id}`}
                                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-raised transition-colors"
                                    >
                                        <span className="t-body truncate">{market.title}</span>
                                        <span className="n-sm text-positive shrink-0">
                                            {formatVolume(market.volume)}
                                        </span>
                                    </Link>
                                    {i < moverMarkets.length - 1 && <Separator />}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="w-full h-full">
                        <CardHeader className="t-ui">Top Traders</CardHeader>
                        <Separator />
                        <CardContent className="flex flex-col p-0">
                            {topTraders.map((trader, i) => (
                                <div key={trader.id}>
                                    <Link
                                        href={`/traders/${trader.id}`}
                                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-raised transition-colors"
                                    >
                                        <span className="t-label text-dim w-4 shrink-0">{i + 1}</span>
                                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-raised text-foreground t-label shrink-0">
                                            {getInitials(trader.name)}
                                        </span>
                                        <span className="t-body truncate flex-1">{trader.name}</span>
                                        <span className="n-sm text-positive shrink-0">
                                            {formatVolume(trader.volume)}
                                        </span>
                                    </Link>
                                    {i < topTraders.length - 1 && <Separator />}
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                </div>
                <div>

                </div>


                <h2 className="t-h2 ml-5 mt-10">News</h2>


                {newsLoading && <p className="t-body ml-5 mt-5">Loading news…</p>}
                {newsError && <p className="t-body text-negative ml-5 mt-5">Failed to load news.</p>}

                {newsArticles && (
                    <div className="flex flex-col items-center gap-5 lg:flex-row lg:justify-center">
                        {newsArticles.slice(0, 3).map((article) => (
                            <MdNewsCard key={article.article_url} article={article} />
                        ))}
                    </div>
                )}

                {/* --- Markets --- */}
                <h2 className="t-h2 ml-5 mt-10">Markets</h2>


                {marketsLoading && <p className="t-body ml-5 mt-5">Loading markets…</p>}
                {marketsError && <p className="t-body text-negative ml-5 mt-5">Failed to load markets.</p>}

                {marketsData && (
                    <div className="grid grid-cols-1 md:grid-cols-3 justify-items-center gap-5">
                        {marketsData.markets.map((market) => (
                            <MarketCard key={market.canonical_id} market={market} />
                        ))}
                    </div>
                )}
            </div>
        </>

    );

}