"use client"

import { useWatchlist } from "@/hooks/useWatchlist";
import { MarketCard } from "@/components/custom/markets/MarketCardBase";

export default function Watchlist() {

    const { data, isLoading, error } = useWatchlist();

    if (isLoading) return <p className="t-body px-5 md:px-20">Loading…</p>;
    if (error) return <p className="t-body text-negative px-5 md:px-20">Couldn&apos;t load your watchlist.</p>;

    if (!data?.watchlist?.length) {
        return (
            <div className="flex flex-col items-center justify-center text-center gap-2 mt-24">
                <p className="t-h3">Nothing on your watchlist yet</p>
                <p className="t-body text-muted-foreground">Tap the bookmark on any market to track it here.</p>
            </div>
        );
    }

    return (
        <>
            <h2 className="t-h2 m-5 md:mt-20 md:ml-20">Watchlist</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-5 md:px-20">
                {data.watchlist.map((item) => (
                    <MarketCard
                        key={item.id}
                        market={{ ...item.market, canonical_id: item.canonical_id, platform: item.platform }}
                        
                        
                    />
                ))}
            </div>
        </>
    );
}