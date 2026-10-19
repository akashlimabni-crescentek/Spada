export interface SevenRatios {
  pressure: number | null;
  churn: number | null;
  support: number | null;
  executionCost: number | null;
  divergence: number | null;
  probabilityMomentum: number | null;
  resolutionTension: number | null;
}

export interface RatioLegacyMetrics {
  ratio: number | null;
  spread: number | null;
  divergence_percent: number | null;
}

export interface RatioMarketSummary {
  canonical_id: string;
  platform: string;
  title: string;
  yes_price: number | null;
}

export interface RatioInputs {
  vol24h?: number | null;
  liquidity?: number | null;
  openInterest?: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  currentProb?: number | null;
  prob24hAgo?: number | null;
  polyProb?: number | null;
  kalshiProb?: number | null;
  daysToClose?: number | null;
  closes7dCount?: number | null;
  matchFromCache?: boolean | null;
}

/** Response from GET /api/v1/ratios/:marketId */
export interface MarketCross {
  matched: boolean;
  similarity: number | null;
  message: string;
  ratios: SevenRatios;
  metrics: RatioLegacyMetrics;
  primaryMarket?: RatioMarketSummary | null;
  counterMarket?: RatioMarketSummary | string | null;
  inputs?: RatioInputs | null;
}
