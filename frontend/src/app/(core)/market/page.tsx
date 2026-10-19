"use client"

import { useMarkets } from "@/hooks/useMakret";
import { useState,useMemo } from "react";
import { MarketCard } from "@/components/custom/markets/MarketCardBase";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Platform } from "@/types/market";
import SortDropdown from "@/components/custom/FilterDropdown";



import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CategoryCarousel from "@/components/custom/categorycarousel";
export default function MarketPage() {


  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  const [category, setCategory] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform | undefined>(undefined);
  const [sort, setSort] = useState("volume_desc");

  const { data, hasNextPage } = useMarkets({
    platform,
    category: category ?? undefined,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });


  const hasPrevPage = page > 0;


  const sortedMarkets = useMemo(() => {
    if (!data?.markets) return [];
    const copy = [...data.markets];

    switch (sort) {
      case "volume_desc": return copy.sort((a, b) => b.volume - a.volume);
      case "volume_asc": return copy.sort((a, b) => a.volume - b.volume);
      case "time_asc": return copy.sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime());
      case "time_desc": return copy.sort((a, b) => new Date(b.close_time).getTime() - new Date(a.close_time).getTime());
      default: return copy;
    }
  }, [data, sort]);





  function handlePlatformChange(value: string | null) {
    setPlatform(value === "all" || value === null ? undefined : (value as Platform));
    setPage(0);
  }



  return (
    <>
      

      <div className="flex flex-col">

            <h2 className="t-h2 m-5 md:mt-20 md:ml-5 lg:mt-20 lg:ml-5">Markets</h2>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <CategoryCarousel selected={category} onSelect={setCategory} />

        <div className="flex items-center gap-2 justify-end md:justify-start mr-5">
          <Select value={platform ?? "all"} onValueChange={handlePlatformChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="polymarket">Polymarket</SelectItem>
              <SelectItem value="kalshi">Kalshi</SelectItem>
            </SelectContent>
          </Select>

          <SortDropdown onSortSelect={setSort} />
        </div>
      </div>


      

      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedMarkets.map((market) => (
          <MarketCard key={market.canonical_id} market={market} />
        ))}
      </div>  

      <div className="flex items-center justify-center gap-4 mt-8 pb-30">
        <button
          type="button"
          onClick={() => setPage((p) => p - 1)}
          disabled={!hasPrevPage}
          className="flex items-center gap-1 t-ui px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-raised transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>

        <span className="t-meta">Page {page + 1}</span>

        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasNextPage}
          className="flex items-center gap-1 t-ui px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-raised transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>


    </>
  )
}