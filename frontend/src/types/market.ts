export type Platform = "polymarket" | "kalshi";

export interface OutcomePrice {
  name: string;
  price: number;
  percentage: number;
}

export interface Market {
  canonical_id: string;
  platform: Platform;
  platform_id: string;
  title: string;
  category: string | null;
  market_url: string; 
  outcome_type: "binary" | "categorical";
  outcomes: string[];
  outcome_prices: OutcomePrice[];
  prices: number[];
  yes_price: number;
  no_price: number;
  implied_probability: number;
  volume: number;
  /** Event-level volume when available (Kalshi event_ticker sum / Polymarket event). */
  event_volume?: number | null;
  event_ticker?: string | null;
  is_active: boolean;
  end_date: string;
  close_time: string;
  rules: string;
  resolution_source: string;
  context: string;
  ai_summary: string | null;
  ai_sentiment_label: string | null;
  ai_last_updated: string | null;
  updated_at: string;             
}

export interface MarketsResponse {
  markets: Market[];
  
}

export interface MarketsQueryParams {
  platform?: Platform;
  limit?: number;
  offset?: number;
  category?: string; 
}

export interface MarketResponse {
  market: Market;
}