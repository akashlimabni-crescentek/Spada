

export interface OutcomePrice {
  name: string;
  price: number;
  percentage: number;
}

export interface EndingSoonMarket {
  canonical_id: string;
  platform: string;
  platform_id: string;
  title: string;
  category: string;
  outcome_type: "binary" | "multi";
  outcomes: string[];
  outcome_prices: OutcomePrice[];
  prices: number[];
  yes_price: number;
  no_price: number;
  implied_probability: number;
  volume: number;
  is_active: boolean;
  end_date: string;
  close_time: string;
  rules: string;
  resolution_source: string;
  context: string | null;
  ai_summary: string | null;
  ai_sentiment_label: string;
  ai_last_updated: string | null;
  updated_at: string;
}

export interface EndingSoonResponse {
  ending_soon: EndingSoonMarket[];
}



export type MoverMarket = EndingSoonMarket;

export interface MoversResponse {
  movers: MoverMarket[];
}


export  interface HighVolumeMarket {
        id: string;
        title: string;
        volume: number;
    }




export interface MarketMetrics {
  total_active_markets: number;
  polymarket_active_count: number;
  /** Null until a stored sample about 24h old exists. Never invented. */
  polymarket_trend: "up" | "down" | null;
  polymarket_change_24h: string | null;
  kalshi_active_count: number;
  kalshi_trend: "up" | "down" | null;
  kalshi_change_24h: string | null;
  total_volume_usd: number;
  volume_trend: "up" | "down" | null;
  volume_change_24h: string | null;
  last_updated: string;
}

export interface MarketMetricsResponse {
  metrics: MarketMetrics;
}