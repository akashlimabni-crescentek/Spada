/**
 * POC parity tests for seven ratio formulas, input assembly, matching, and HTTP shape.
 * Run: npm run test:ratios
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import {
  closeNearTimestamp,
  closesInWindow,
  computeRatios,
  daysUntilClose,
  DEFAULT_MAX_QUOTE_AGE_MS,
  DEFAULT_MAX_QUOTE_DIFF_MS,
  explainRatioSkips,
  parseSourceTimestampMs,
  populationStddev,
  safeDiv,
  validateQuoteFreshness,
} from './ratios.js';
import {
  CROSS_MATCH_THRESHOLD,
  alignTwinPrice,
  closeTimesAligned,
  pickReliableProb,
  sameMarketKind,
  titleMatchScore,
  titleSimilarity,
} from './crossPlatform.js';
import {
  MATCH_CANDIDATE_LIMIT,
  findBestTwin,
  marketReliableProb,
  scoreTwinAgainstSource,
  type MatchCandidateMarket,
} from '../services/marketMatching.js';
import { rememberLiveQuote, readLiveQuote, readLiveQuoteRecord, LIVE_QUOTE_TTL_MS } from '../lib/liveQuotes.js';
import {
  assembleAlignedTwinProb,
  assembleCurrentProb,
  assembleVol24h,
  buildRatioHttpResponse,
  computeMarketRatios,
  type RatioMarketRow,
} from '../services/ratioEngine.js';

function runFormulas() {
  assert.equal(safeDiv(10, 2), 5);
  assert.equal(safeDiv(10, 0), null);
  assert.equal(safeDiv(null, 2), null);
  assert.equal(safeDiv(10, null), null);

  const closes = [0.4, 0.42, 0.45, 0.44, 0.5, 0.55, 0.58, 0.6];
  const sd = populationStddev(closes);
  assert.ok(sd != null && sd > 0);

  const r = computeRatios({
    vol24h: 50_000,
    liquidity: 20_000,
    openInterest: 40_000,
    bestBid: 0.59,
    bestAsk: 0.61,
    currentProb: 0.6,
    prob24hAgo: 0.58,
    polyProb: 0.6,
    kalshiProb: 0.57,
    daysToClose: 30,
    closes7d: closes,
  });

  assert.ok(Math.abs((r.pressure as number) - 2.5) < 1e-9, `pressure ${r.pressure}`);
  assert.ok(Math.abs((r.support as number) - 0.5) < 1e-9, `support ${r.support}`);
  assert.ok(Math.abs((r.churn as number) - 0.3642) < 0.01, `churn ${r.churn}`);
  assert.ok(Math.abs((r.executionCost as number) - 0.033333) < 1e-4, `exec ${r.executionCost}`);
  assert.ok(
    Math.abs((r.probabilityMomentum as number) - 0.02) < 1e-9,
    `mom ${r.probabilityMomentum}`
  );
  assert.ok(Math.abs((r.divergence as number) - 0.051282) < 1e-4, `div ${r.divergence}`);
  assert.ok(
    Math.abs((r.resolutionTension as number) - 2.145) < 0.05,
    `tension ${r.resolutionTension}`
  );

  assert.equal(
    computeRatios({
      vol24h: 50_000,
      liquidity: 20_000,
      openInterest: 40_000,
      bestBid: 0.59,
      bestAsk: 0.61,
      currentProb: 0.6,
      prob24hAgo: 0.58,
      polyProb: 0.6,
      kalshiProb: 0.57,
      daysToClose: null,
      closes7d: closes,
    }).churn,
    null
  );

  assert.equal(
    computeRatios({
      vol24h: 50_000,
      liquidity: 20_000,
      openInterest: 0,
      bestBid: 0.59,
      bestAsk: 0.61,
      currentProb: 0.6,
      prob24hAgo: 0.58,
      polyProb: 0.6,
      kalshiProb: 0.57,
      daysToClose: 30,
      closes7d: closes,
    }).churn,
    null
  );

  assert.equal(
    computeRatios({
      vol24h: 1,
      liquidity: 1,
      openInterest: 1,
      bestBid: null,
      bestAsk: 0.6,
      currentProb: 0.6,
      prob24hAgo: 0.5,
      polyProb: null,
      kalshiProb: null,
      daysToClose: 1,
      closes7d: [0.5],
    }).executionCost,
    null
  );

  assert.equal(
    computeRatios({
      vol24h: 1,
      liquidity: 1,
      openInterest: 1,
      bestBid: 0,
      bestAsk: 0,
      currentProb: 0.5,
      prob24hAgo: 0.5,
      polyProb: null,
      kalshiProb: null,
      daysToClose: 1,
      closes7d: [0.5],
    }).executionCost,
    null
  );

  assert.equal(
    computeRatios({
      vol24h: 1,
      liquidity: 1,
      openInterest: 1,
      bestBid: 0.5,
      bestAsk: 0.51,
      currentProb: 0.5,
      prob24hAgo: 0.5,
      polyProb: 0.5,
      kalshiProb: null,
      daysToClose: 1,
      closes7d: [0.5],
    }).divergence,
    null
  );

  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const dte = daysUntilClose(future);
  assert.ok(dte != null && dte > 1.9 && dte < 2.1);
  assert.equal(daysUntilClose(null), null);
  assert.equal(daysUntilClose(new Date(Date.now() - 1000).toISOString()), null);

  const young = [
    { ts: new Date(Date.now() - 60 * 60 * 1000).toISOString(), close: 0.42 },
    { ts: new Date(Date.now() - 30 * 60 * 1000).toISOString(), close: 0.44 },
  ];
  assert.equal(closeNearTimestamp(young, Date.now() - 24 * 60 * 60 * 1000), 0.42);

  assert.equal(
    computeRatios({
      vol24h: 1,
      liquidity: 1,
      openInterest: 1,
      bestBid: 0.5,
      bestAsk: 0.51,
      currentProb: 0.5,
      prob24hAgo: null,
      polyProb: null,
      kalshiProb: null,
      daysToClose: 1,
      closes7d: [],
    }).probabilityMomentum,
    null
  );

  assert.equal(
    computeRatios({
      vol24h: 1,
      liquidity: 1,
      openInterest: 1,
      bestBid: 0.5,
      bestAsk: 0.51,
      currentProb: 0.5,
      prob24hAgo: 0.5,
      polyProb: null,
      kalshiProb: null,
      daysToClose: 2,
      closes7d: [],
    }).resolutionTension,
    null
  );

  const win = closesInWindow(
    [
      { ts: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), close: 0.1 },
      { ts: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), close: 0.2 },
    ],
    Date.now() - 7 * 24 * 60 * 60 * 1000,
    Date.now()
  );
  assert.deepEqual(win, [0.2]);

  return r;
}

function runInputAssembly() {
  const now = Date.now();
  const candles24h = [
    { ts: new Date(now - 2 * 60 * 60 * 1000).toISOString(), volume: 100 },
    { ts: new Date(now - 1 * 60 * 60 * 1000).toISOString(), volume: 250 },
    { ts: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), volume: 9999 }, // outside 24h
  ];

  // provider volume available
  assert.equal(assembleVol24h(12_345, candles24h, now), 12_345);

  // provider volume missing → candle volume sum (100+250, not 9999)
  assert.equal(assembleVol24h(null, candles24h, now), 350);
  assert.equal(assembleVol24h(0, candles24h, now), 350);
  assert.equal(assembleVol24h(undefined, candles24h, now), 350);

  // no provider + no candle volume → null
  assert.equal(assembleVol24h(null, [], now), null);
  assert.equal(
    assembleVol24h(null, [{ ts: new Date(now - 1000).toISOString(), volume: 0 }], now),
    null
  );

  // markets.volume must NOT be used by assembleVol24h (caller responsibility)
  // — if only DB volume exists, result stays null without candles/provider
  assert.equal(assembleVol24h(null, [], now), null);

  // reliable current probability: mid preferred
  assert.equal(assembleCurrentProb(0.4, 0.55, 0.57), 0.56);

  // wide spread → last_price (stored)
  assert.equal(assembleCurrentProb(0.42, 0.1, 0.9), 0.42);

  // no book → stored last
  assert.equal(assembleCurrentProb(0.61, null, null), 0.61);

  // live socket YES wins over a placeholder wide book and over a tight book mid
  assert.equal(assembleCurrentProb(0.42, 0.1, 0.9, 0.73), 0.73);
  assert.equal(assembleCurrentProb(0.4, 0.55, 0.57, 0.8), 0.8);
  // invalid live quote is ignored; wide book still falls back to last trade
  assert.equal(assembleCurrentProb(0.42, 0.1, 0.9, 1.5), 0.42);

  // pickReliableProb priority
  assert.equal(pickReliableProb({ mid: 0.5, last_price: 0.4, bid: 0.49, ask: 0.51 }), 0.5);
  assert.equal(pickReliableProb({ mid: null, last_price: 0.4, bid: 0.39, ask: 0.41 }), 0.4);
  assert.equal(pickReliableProb({ mid: null, last_price: null, bid: 0.39, ask: null }), 0.39);
  assert.equal(pickReliableProb(null), null);

  // Twin probability: mid / last / bid+ask / wide book / missing book
  const twinMkt: MatchCandidateMarket = {
    canonical_id: 'kalshi_twin',
    platform: 'kalshi',
    external_id: 'TWIN1',
    title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
    prices: [0.42],
    raw_data: { yes_sub_title: 'Rockies' },
  };
  assert.equal(marketReliableProb(twinMkt, { bid: 0.55, ask: 0.57 }), 0.56); // mid
  assert.equal(marketReliableProb(twinMkt, { bid: null, ask: null }), 0.42); // last fallback
  assert.equal(marketReliableProb(twinMkt, { bid: 0.1, ask: 0.9 }), 0.42); // wide → last
  assert.equal(marketReliableProb(twinMkt), 0.42); // no book args

  const sourceMkt: MatchCandidateMarket = {
    canonical_id: 'polymarket_src',
    platform: 'polymarket',
    external_id: 'SRC1',
    title: 'Colorado Rockies vs Milwaukee Brewers',
    outcomes: ['Rockies', 'Brewers'],
    prices: [0.6],
    raw_data: {},
  };
  // raw twin mid 0.3 + sourceProb 0.7 -> equivalent outcomes ("Rockies" vs "Rockies") -> uses 0.30 directly (no proximity inversion)
  assert.ok(Math.abs((assembleAlignedTwinProb(sourceMkt, twinMkt, 0.28, 0.32, 0.7) as number) - 0.3) < 1e-9);
  // missing bid/ask -> last 0.42; equivalent outcome -> uses 0.42 directly
  assert.equal(assembleAlignedTwinProb(sourceMkt, twinMkt, null, null, 0.6), 0.42);

  const twinMktOpposite: MatchCandidateMarket = {
    canonical_id: 'kalshi_twin_opp',
    platform: 'kalshi',
    external_id: 'TWIN2',
    title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
    prices: [0.42],
    raw_data: { yes_sub_title: 'Brewers' },
  };
  // opposite outcome (Rockies vs Brewers) -> uses 1 - 0.3 = 0.7
  const alignedOpp = assembleAlignedTwinProb(sourceMkt, twinMktOpposite, 0.28, 0.32, 0.7);
  assert.ok(alignedOpp != null && Math.abs(alignedOpp - 0.7) < 1e-9);
}

async function runEngineWithMocks() {
  const closeIso = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const market: RatioMarketRow = {
    canonical_id: 'polymarket_test1',
    platform: 'polymarket',
    external_id: 'cond_test1',
    title: 'Colorado Rockies vs Milwaukee Brewers',
    outcomes: ['Rockies', 'Brewers'],
    prices: [0.55, 0.45],
    volume: 999_999, // must NOT be used as vol24h fallback
    raw_data: { end_date: closeIso },
    active: true,
    updated_at: new Date().toISOString(),
  };

  const now = Date.now();
  const candleRows = Array.from({ length: 20 }, (_, i) => ({
    bucket: new Date(now - (i + 1) * 60 * 60 * 1000).toISOString(),
    close: 0.5 + i * 0.001,
    volume: 10,
  }));

  // Full happy path with twin — twin book mid used for divergence (not prices[0] alone)
  const matched = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 50_000,
      liquidity: 20_000,
      open_interest: 40_000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async (m) => {
      if (m.canonical_id === 'kalshi_KX1') {
        return { bid: 0.53, ask: 0.55, kalshiOrderbook: null, timestamp: new Date().toISOString() }; // twin mid 0.54
      }
      return { bid: 0.59, ask: 0.61, kalshiOrderbook: null, timestamp: new Date().toISOString() };
    },
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => ({
      twin: {
        canonical_id: 'kalshi_KX1',
        platform: 'kalshi',
        external_id: 'KX1',
        title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
        prices: [0.5], // last — mid from book preferred
        raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
        active: true,
        updated_at: new Date().toISOString(),
      },
      similarity: 0.92,
      alignedTwinProb: 0.5, // overwritten by orderbook enrich
      pm_platform_id: 'cond_test1',
      kalshi_platform_id: 'KX1',
      fromCache: true,
    }),
  });

  assert.equal(matched.inputs.vol24h, 50_000);
  assert.equal(matched.inputs.liquidity, 20_000);
  assert.equal(matched.inputs.openInterest, 40_000);
  assert.equal(matched.inputs.bestBid, 0.59);
  assert.equal(matched.inputs.bestAsk, 0.61);
  assert.equal(matched.inputs.currentProb, 0.6); // mid of 0.59/0.61
  assert.equal(matched.inputs.kalshiProb, 0.54); // twin mid after enrich + align
  assert.equal(matched.matched, true);
  assert.equal(matched.inputs.matchFromCache, true);
  assert.ok(matched.ratios.divergence != null);
  assert.ok(matched.ratios.pressure != null);
  assert.ok(matched.legacy.ratio != null); // legacy separate
  assert.notEqual(matched.legacy.ratio, matched.ratios.divergence);

  // provider volume missing → candle sum; DB volume ignored
  const candleVolOnly = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: null,
      liquidity: 20_000,
      open_interest: 40_000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async () => ({ bid: 0.5, ask: 0.52, kalshiOrderbook: null }),
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => null,
  });
  assert.equal(candleVolOnly.inputs.vol24h, 200); // 20 * 10
  assert.equal(candleVolOnly.matched, false);
  assert.equal(candleVolOnly.ratios.divergence, null);

  // no provider + no candle volume → null pressure/churn
  const noVol = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: null,
      liquidity: 20_000,
      open_interest: 40_000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async () => ({ bid: 0.5, ask: 0.52, kalshiOrderbook: null }),
    getCandlesSince: async () => [],
    resolveCrossPlatformMatch: async () => null,
  });
  assert.equal(noVol.inputs.vol24h, null);
  assert.equal(noVol.ratios.pressure, null);
  assert.equal(noVol.ratios.churn, null);

  // missing orderbook → executionCost null; currentProb from stored price
  const noBook = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async () => ({ bid: null, ask: null, kalshiOrderbook: null }),
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => null,
  });
  assert.equal(noBook.ratios.executionCost, null);
  assert.equal(noBook.inputs.currentProb, 0.55);

  // missing OI
  const noOi = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: null,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async () => ({ bid: 0.5, ask: 0.52, kalshiOrderbook: null }),
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => null,
  });
  assert.equal(noOi.ratios.churn, null);
  assert.equal(noOi.ratios.support, null);

  // missing liquidity
  const noLiq = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: null,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async () => ({ bid: 0.5, ask: 0.52, kalshiOrderbook: null }),
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => null,
  });
  assert.equal(noLiq.ratios.pressure, null);
  assert.equal(noLiq.ratios.support, null);

  // missing close time → churn/resolutionTension null
  const noClose: RatioMarketRow = {
    ...market,
    raw_data: {},
  };
  const noCloseResult = await computeMarketRatios(noClose, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async () => ({ bid: 0.5, ask: 0.52, kalshiOrderbook: null }),
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => null,
  });
  assert.equal(noCloseResult.inputs.daysToClose, null);
  assert.equal(noCloseResult.ratios.churn, null);
  assert.equal(noCloseResult.ratios.resolutionTension, null);

  // twin: stored last 0.3, book mid 0.7 → pickReliableProb mid, alignTwinPrice keeps 0.7 vs source 0.6
  const twinAligned = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async (m) => {
      if (m.canonical_id === 'kalshi_t') {
        return { bid: 0.69, ask: 0.71, kalshiOrderbook: null, timestamp: new Date().toISOString() };
      }
      return { bid: 0.6, ask: 0.6, kalshiOrderbook: null, timestamp: new Date().toISOString() };
    },
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => ({
      twin: {
        canonical_id: 'kalshi_t',
        platform: 'kalshi',
        external_id: 'KT',
        title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
        prices: [0.3],
        raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
        active: true,
        updated_at: new Date().toISOString(),
      },
      similarity: 0.9,
      alignedTwinProb: 0.3,
      pm_platform_id: 'cond_test1',
      kalshi_platform_id: 'KT',
      fromCache: false,
    }),
  });
  assert.equal(twinAligned.inputs.kalshiProb, 0.7);
  assert.equal(twinAligned.inputs.polyProb, 0.6);
  assert.ok(twinAligned.ratios.divergence != null);

  // twin wide book → last_price; then opposite outcome inverts (0.3 → 0.7)
  const twinWide = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async (m) => {
      if (m.canonical_id === 'kalshi_wide') {
        return { bid: 0.1, ask: 0.9, kalshiOrderbook: null, timestamp: new Date().toISOString() };
      }
      return { bid: 0.6, ask: 0.6, kalshiOrderbook: null, timestamp: new Date().toISOString() };
    },
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => ({
      twin: {
        canonical_id: 'kalshi_wide',
        platform: 'kalshi',
        external_id: 'KW',
        title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
        prices: [0.3],
        raw_data: { yes_sub_title: 'Brewers', close_time: closeIso },
        active: true,
        updated_at: new Date().toISOString(),
      },
      similarity: 0.9,
      alignedTwinProb: 0.3,
      pm_platform_id: 'cond_test1',
      kalshi_platform_id: 'KW',
      fromCache: false,
    }),
  });
  assert.equal(twinWide.inputs.kalshiProb, 0.7); // Brewers outcome inverts 0.3 → 0.7 for Rockies
  assert.ok(twinWide.ratios.divergence != null);

  // twin missing bid/ask → stored last only
  const twinNoBook = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async (m) => {
      if (m.canonical_id === 'kalshi_nobook') {
        return { bid: null, ask: null, kalshiOrderbook: null, timestamp: new Date().toISOString() };
      }
      return { bid: 0.6, ask: 0.6, kalshiOrderbook: null, timestamp: new Date().toISOString() };
    },
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => ({
      twin: {
        canonical_id: 'kalshi_nobook',
        platform: 'kalshi',
        external_id: 'KN',
        title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
        prices: [0.58],
        raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
        active: true,
        updated_at: new Date().toISOString(),
      },
      similarity: 0.9,
      alignedTwinProb: 0.99,
      pm_platform_id: 'cond_test1',
      kalshi_platform_id: 'KN',
      fromCache: false,
    }),
  });
  assert.equal(twinNoBook.inputs.kalshiProb, 0.58);
  assert.ok(twinNoBook.ratios.divergence != null);

  // Wide placeholder book (0.01/0.99) must not become 0.50 when a live YES quote exists.
  const liveMarket: RatioMarketRow = { ...market, canonical_id: 'polymarket_live_quote', updated_at: new Date().toISOString() };
  rememberLiveQuote(liveMarket.canonical_id, [0.395, 0.605], Date.now());
  try {
    const liveWide = await computeMarketRatios(liveMarket, {
      fetchProviderStats: async () => ({
        volume_24h: 1000,
        liquidity: 500,
        open_interest: 2000,
        updated_at: new Date().toISOString(),
      }),
      fetchBestBidAsk: async () => ({ bid: 0.01, ask: 0.99, kalshiOrderbook: null }),
      getCandlesSince: async () => candleRows,
      resolveCrossPlatformMatch: async () => null,
    });
    assert.equal(liveWide.inputs.currentProb, 0.395);
    assert.equal(liveWide.inputs.polyProb, 0.395);
  } finally {
    rememberLiveQuote(liveMarket.canonical_id, []);
  }

  // Timestamp assembly: book.timestamp and updated_at must NOT become exchange quote timestamps.
  // Without a live socket quote, primaryTs must be null — divergence computed from stored prices
  // without freshness gating (hasAnyTs=false when either side has no live sourceTs).
  const tsMarket: RatioMarketRow = {
    ...market,
    canonical_id: 'polymarket_ts_test',
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h old — would fail stale check
  };
  const tsResult = await computeMarketRatios(tsMarket, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async () => ({
      bid: 0.59,
      ask: 0.61,
      kalshiOrderbook: null,
      timestamp: new Date(Date.now() - 90 * 1000).toISOString(), // 90s old — would fail stale check
    }),
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => ({
      twin: {
        canonical_id: 'kalshi_ts_twin',
        platform: 'kalshi',
        external_id: 'KTS',
        title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
        prices: [0.57],
        raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
        active: true,
        updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h old
      },
      similarity: 0.92,
      alignedTwinProb: 0.57,
      pm_platform_id: 'cond_test1',
      kalshi_platform_id: 'KTS',
      fromCache: true,
    }),
  });
  // No live socket quotes → polyProbTs and kalshiProbTs must both be null
  assert.equal(tsResult.inputs.polyProbTs, null, 'book.timestamp must not become polyProbTs');
  assert.equal(tsResult.inputs.kalshiProbTs, null, 'updated_at must not become kalshiProbTs');
  // Divergence must be computed (not blocked by missing_quote_timestamp)
  assert.ok(tsResult.ratios.divergence != null, 'divergence must compute when no live ts (no freshness gate)');
  assert.equal(tsResult.ratioSkips.divergence, undefined, 'no divergence skip when both ts are null');

  // Timestamp assembly: live socket sourceTs on primary only → hasAnyTs=false (one-sided),
  // divergence still computed without freshness gating.
  const liveOneSide: RatioMarketRow = { ...market, canonical_id: 'polymarket_one_side_ts', updated_at: new Date().toISOString() };
  const liveSourceTs = Date.now() - 5_000;
  rememberLiveQuote(liveOneSide.canonical_id, [0.6, 0.4], liveSourceTs);
  try {
    const oneSideResult = await computeMarketRatios(liveOneSide, {
      fetchProviderStats: async () => ({
        volume_24h: 1000,
        liquidity: 500,
        open_interest: 2000,
        updated_at: new Date().toISOString(),
      }),
      fetchBestBidAsk: async () => ({ bid: 0.59, ask: 0.61, kalshiOrderbook: null }),
      getCandlesSince: async () => candleRows,
      resolveCrossPlatformMatch: async () => ({
        twin: {
          canonical_id: 'kalshi_no_live',
          platform: 'kalshi',
          external_id: 'KNL',
          title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
          prices: [0.57],
          raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
          active: true,
          updated_at: new Date().toISOString(),
        },
        similarity: 0.92,
        alignedTwinProb: 0.57,
        pm_platform_id: 'cond_test1',
        kalshi_platform_id: 'KNL',
        fromCache: true,
      }),
    });
    // Primary has live sourceTs; twin has no live quote → twinTs=null → hasAnyTs=false
    assert.equal(oneSideResult.inputs.polyProbTs, liveSourceTs, 'primary live sourceTs preserved');
    assert.equal(oneSideResult.inputs.kalshiProbTs, null, 'twin with no live quote has null ts');
    // Divergence must compute (not blocked by missing_quote_timestamp from one-sided ts)
    assert.ok(oneSideResult.ratios.divergence != null, 'divergence must compute with one-sided live ts');
    assert.equal(oneSideResult.ratioSkips.divergence, undefined, 'no divergence skip for one-sided ts');
  } finally {
    rememberLiveQuote(liveOneSide.canonical_id, []);
  }

  // Timestamp assembly: both sides have live socket sourceTs → hasAnyTs=true → freshness validated.
  const liveBothSides: RatioMarketRow = { ...market, canonical_id: 'polymarket_both_ts', updated_at: new Date().toISOString() };
  const polyLiveTs = Date.now() - 5_000;
  const kalshiLiveTs = Date.now() - 8_000;
  rememberLiveQuote(liveBothSides.canonical_id, [0.6, 0.4], polyLiveTs);
  const kalshiTwinId = 'kalshi_both_ts_twin';
  rememberLiveQuote(kalshiTwinId, [0.57, 0.43], kalshiLiveTs);
  try {
    const bothResult = await computeMarketRatios(liveBothSides, {
      fetchProviderStats: async () => ({
        volume_24h: 1000,
        liquidity: 500,
        open_interest: 2000,
        updated_at: new Date().toISOString(),
      }),
      fetchBestBidAsk: async () => ({ bid: 0.59, ask: 0.61, kalshiOrderbook: null }),
      getCandlesSince: async () => candleRows,
      resolveCrossPlatformMatch: async () => ({
        twin: {
          canonical_id: kalshiTwinId,
          platform: 'kalshi',
          external_id: 'KBTS',
          title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
          prices: [0.57],
          raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
          active: true,
          updated_at: new Date().toISOString(),
        },
        similarity: 0.92,
        alignedTwinProb: 0.57,
        pm_platform_id: 'cond_test1',
        kalshi_platform_id: 'KBTS',
        fromCache: true,
      }),
    });
    assert.equal(bothResult.inputs.polyProbTs, polyLiveTs, 'poly live sourceTs preserved');
    assert.equal(bothResult.inputs.kalshiProbTs, kalshiLiveTs, 'kalshi live sourceTs preserved');
    assert.ok(bothResult.ratios.divergence != null, 'divergence computes when both live ts are fresh');
    assert.equal(bothResult.ratioSkips.divergence, undefined, 'no divergence skip for fresh both-sided ts');
  } finally {
    rememberLiveQuote(liveBothSides.canonical_id, []);
    rememberLiveQuote(kalshiTwinId, []);
  }

  // Legacy divergence: near-zero counterYes must not produce extreme legacy_div values.
  // When counterYes < 0.01 (resolved/expired market), legacy fields must be null.
  const nearZeroResult = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async (m) => {
      if (m.canonical_id === 'kalshi_near_zero') {
        // Near-zero book: twin is effectively resolved
        return { bid: 0.001, ask: 0.003, kalshiOrderbook: null, timestamp: new Date().toISOString() };
      }
      return { bid: 0.59, ask: 0.61, kalshiOrderbook: null, timestamp: new Date().toISOString() };
    },
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => ({
      twin: {
        canonical_id: 'kalshi_near_zero',
        platform: 'kalshi',
        external_id: 'KNZ',
        title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
        prices: [0.002], // near-zero stored price too
        raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
        active: true,
        updated_at: new Date().toISOString(),
      },
      similarity: 0.92,
      alignedTwinProb: 0.002,
      pm_platform_id: 'cond_test1',
      kalshi_platform_id: 'KNZ',
      fromCache: true,
    }),
  });
  // counterYes = mid(0.001, 0.003) = 0.002 < 0.01 threshold → legacy fields must all be null
  assert.equal(nearZeroResult.legacy.ratio, null, 'near-zero counterYes: legacy ratio must be null');
  assert.equal(nearZeroResult.legacy.spread, null, 'near-zero counterYes: legacy spread must be null');
  assert.equal(nearZeroResult.legacy.divergence_percent, null, 'near-zero counterYes: legacy_div must be null (not 119900)');

  // Near-zero primaryYes must also suppress legacy fields (e.g. legacy_div=-99.92 case)
  const nearZeroPrimaryResult = await computeMarketRatios(market, {
    fetchProviderStats: async () => ({
      volume_24h: 1000,
      liquidity: 500,
      open_interest: 2000,
      updated_at: new Date().toISOString(),
    }),
    fetchBestBidAsk: async (m) => {
      if (m.canonical_id === market.canonical_id) {
        // Near-zero primary book: primary market is effectively resolved
        return { bid: 0.001, ask: 0.003, kalshiOrderbook: null, timestamp: new Date().toISOString() };
      }
      return { bid: 0.69, ask: 0.71, kalshiOrderbook: null, timestamp: new Date().toISOString() };
    },
    getCandlesSince: async () => candleRows,
    resolveCrossPlatformMatch: async () => ({
      twin: {
        canonical_id: 'kalshi_near_zero_primary',
        platform: 'kalshi',
        external_id: 'KNZP',
        title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
        prices: [0.99],
        raw_data: { yes_sub_title: 'Rockies', close_time: closeIso },
        active: true,
        updated_at: new Date().toISOString(),
      },
      similarity: 0.92,
      alignedTwinProb: 0.99,
      pm_platform_id: 'cond_test1',
      kalshi_platform_id: 'KNZP',
      fromCache: true,
    }),
  });
  // primaryYes = mid(0.001, 0.003) = 0.002 < 0.01 threshold → legacy fields must all be null (not -99.92)
  assert.equal(nearZeroPrimaryResult.legacy.divergence_percent, null, 'near-zero primaryYes: legacy_div must be null (not -99.92)');

  console.log('✓ timestamp assembly and legacy divergence engine tests passed');
}

function runMatching() {
  assert.equal(CROSS_MATCH_THRESHOLD, 0.88);
  assert.equal(MATCH_CANDIDATE_LIMIT, 500);
  assert.equal(sameMarketKind('Team A vs Team B Winner?', 'Team A vs Team B'), true);
  assert.equal(sameMarketKind('Team A vs Team B Winner?', 'Team A vs Team B O/U 8.5'), false);

  const sim = titleSimilarity(
    'Colorado Rockies vs Milwaukee Brewers',
    'Colorado Rockies vs. Milwaukee Brewers Winner?'
  );
  assert.ok(sim >= 0.88, `similarity ${sim}`);
  assert.ok(
    titleMatchScore('BetBoom Team wins', 'Dota 2: BetBoom Team vs OG - Game 2 Winner') >=
      CROSS_MATCH_THRESHOLD
  );

  assert.equal(closeTimesAligned(null, null), true);
  assert.equal(closeTimesAligned('2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z'), false);

  // Equivalent outcome retains twin price without numerical proximity inversion
  assert.equal(alignTwinPrice('A vs B', 'A', 'A vs B', 'A / B', 0.3, 0.7), 0.3);
  // Opposite outcome inverts twin price (1 - 0.3 = 0.7)
  assert.equal(alignTwinPrice('A vs B', 'B', 'A vs B', 'A / B', 0.3, 0.7), 0.7);

  const futureCloseIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const farFutureCloseIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const source: MatchCandidateMarket = {
    canonical_id: 'polymarket_1',
    platform: 'polymarket',
    external_id: 'cond1',
    title: 'Colorado Rockies vs Milwaukee Brewers',
    outcomes: ['Rockies', 'Brewers'],
    prices: [0.55, 0.45],
    raw_data: { end_date: futureCloseIso },
    active: true,
  };

  const goodTwin: MatchCandidateMarket = {
    canonical_id: 'kalshi_KX1',
    platform: 'kalshi',
    external_id: 'KX1',
    title: 'Colorado Rockies vs. Milwaukee Brewers Winner?',
    outcomes: ['YES', 'NO'],
    prices: [0.54, 0.46],
    raw_data: {
      close_time: futureCloseIso,
      yes_sub_title: 'Rockies',
    },
    active: true,
  };

  const match = findBestTwin(source, [goodTwin, {
    canonical_id: 'kalshi_OTHER',
    platform: 'kalshi',
    external_id: 'OTHER',
    title: 'Completely Unrelated Election Market',
    outcomes: ['YES', 'NO'],
    prices: [0.5, 0.5],
    raw_data: { close_time: futureCloseIso },
    active: true,
  }], 0.55);
  assert.ok(match, 'expected twin match');
  assert.equal(match!.twin.external_id, 'KX1');
  assert.ok(match!.similarity >= 0.88);

  // similarity below 0.88
  const lowSim = findBestTwin(source, [{
    ...goodTwin,
    title: 'Totally Different Sports Event Winner?',
    external_id: 'LOW',
  }]);
  assert.equal(lowSim, null);

  // close time outside 14 days
  const farClose = findBestTwin(source, [{
    ...goodTwin,
    raw_data: { close_time: farFutureCloseIso },
  }]);
  assert.equal(farClose, null);

  // prop vs moneyline
  const noMatch = findBestTwin(
    {
      canonical_id: 'polymarket_prop',
      platform: 'polymarket',
      external_id: 'prop1',
      title: 'Rockies vs Brewers Over/Under 8.5',
      prices: [0.5, 0.5],
      raw_data: {},
    },
    [{
      canonical_id: 'kalshi_ml',
      platform: 'kalshi',
      external_id: 'ML1',
      title: 'Colorado Rockies vs Milwaukee Brewers Winner?',
      prices: [0.5, 0.5],
      raw_data: {},
    }]
  );
  assert.equal(noMatch, null);

  // scoreTwinAgainstSource validates cache candidates (persisted reuse gate)
  const scored = scoreTwinAgainstSource(source, goodTwin, 0.55);
  assert.ok(scored);
  assert.equal(scored!.twin.external_id, 'KX1');

  const stale = scoreTwinAgainstSource(source, {
    ...goodTwin,
    title: 'Unrelated Market Title Here Forever',
  }, 0.55);
  assert.equal(stale, null);

  // inactive twin rejected
  assert.equal(
    scoreTwinAgainstSource(source, { ...goodTwin, active: false }, 0.55),
    null
  );
}

function runHttpShape() {
  const market: RatioMarketRow = {
    canonical_id: 'polymarket_http',
    platform: 'polymarket',
    external_id: 'http1',
    title: 'Test Market Title Long Enough',
    prices: [0.6],
    raw_data: {},
  };

  const closes = [0.4, 0.42, 0.45, 0.44, 0.5, 0.55, 0.58, 0.6];
  const ratios = computeRatios({
    vol24h: 50_000,
    liquidity: 20_000,
    openInterest: 40_000,
    bestBid: 0.59,
    bestAsk: 0.61,
    currentProb: 0.6,
    prob24hAgo: 0.58,
    polyProb: 0.6,
    kalshiProb: 0.57,
    daysToClose: 30,
    closes7d: closes,
  });

  // matched market with valid seven ratios
  const matchedBody = buildRatioHttpResponse(market, {
    ratios,
    matched: true,
    similarity: 0.91,
    counterMarket: {
      canonical_id: 'kalshi_x',
      platform: 'kalshi',
      title: 'Twin',
      yes_price: 0.57,
    },
    legacy: { ratio: 1.0526, spread: 0.03, divergence_percent: 5.26 },
    inputs: {
      vol24h: 50_000,
      liquidity: 20_000,
      openInterest: 40_000,
      bestBid: 0.59,
      bestAsk: 0.61,
      currentProb: 0.6,
      prob24hAgo: 0.58,
      polyProb: 0.6,
      kalshiProb: 0.57,
      daysToClose: 30,
      closes7dCount: 8,
      matchFromCache: true,
    },
  });

  assert.equal(matchedBody.matched, true);
  assert.ok(matchedBody.ratios.pressure != null);
  assert.ok(matchedBody.ratios.churn != null);
  assert.ok(matchedBody.ratios.support != null);
  assert.ok(matchedBody.ratios.executionCost != null);
  assert.ok(matchedBody.ratios.divergence != null);
  assert.ok(matchedBody.ratios.probabilityMomentum != null);
  assert.ok(matchedBody.ratios.resolutionTension != null);
  assert.ok(matchedBody.metrics.ratio != null);
  assert.notEqual(matchedBody.metrics.ratio, matchedBody.ratios.divergence);
  assert.notEqual(matchedBody.metrics.divergence_percent, matchedBody.ratios.divergence);

  // unmatched → divergence null; legacy metrics null
  const nullRatios = computeRatios({
    vol24h: null,
    liquidity: null,
    openInterest: null,
    bestBid: null,
    bestAsk: null,
    currentProb: 0.55,
    prob24hAgo: null,
    polyProb: 0.55,
    kalshiProb: null,
    daysToClose: null,
    closes7d: [],
  });
  const unmatchedBody = buildRatioHttpResponse(market, {
    ratios: nullRatios,
    matched: false,
    similarity: null,
    counterMarket: null,
    legacy: { ratio: null, spread: null, divergence_percent: null },
    inputs: {
      vol24h: null,
      liquidity: null,
      openInterest: null,
      bestBid: null,
      bestAsk: null,
      currentProb: 0.55,
      prob24hAgo: null,
      polyProb: 0.55,
      kalshiProb: null,
      daysToClose: null,
      closes7dCount: 0,
      matchFromCache: false,
    },
  });

  assert.equal(unmatchedBody.matched, false);
  assert.equal(unmatchedBody.ratios.divergence, null);
  assert.equal(unmatchedBody.ratios.pressure, null);
  assert.equal(unmatchedBody.metrics.ratio, null);
  // Message is the HTTP unmatched notice; Jaccard threshold 0.88 is matching-only.
  assert.equal(
    unmatchedBody.message,
    'No cross-platform counterpart found for this market'
  );
  assert.deepEqual(Object.keys(unmatchedBody.ratios).sort(), [
    'churn',
    'divergence',
    'executionCost',
    'pressure',
    'probabilityMomentum',
    'resolutionTension',
    'support',
  ]);
}

function runMissingAndInvalidInputs() {
  const empty = computeRatios({
    vol24h: null,
    liquidity: null,
    openInterest: null,
    bestBid: null,
    bestAsk: null,
    currentProb: null,
    prob24hAgo: null,
    polyProb: null,
    kalshiProb: null,
    daysToClose: null,
    closes7d: [],
  });
  for (const key of Object.keys(empty) as Array<keyof typeof empty>) {
    assert.equal(empty[key], null, `${key} must stay null with missing inputs`);
  }

  const invalid = computeRatios({
    vol24h: Number.NaN,
    liquidity: Number.POSITIVE_INFINITY,
    openInterest: -1,
    bestBid: 0.5,
    bestAsk: 0.6,
    currentProb: 1.5,
    prob24hAgo: -0.1,
    polyProb: Number.NaN,
    kalshiProb: 0.5,
    daysToClose: 10,
    closes7d: [Number.NaN, Number.POSITIVE_INFINITY],
  });
  assert.equal(invalid.pressure, null);
  assert.equal(invalid.support, null);
  assert.equal(invalid.divergence, null);
  assert.equal(invalid.probabilityMomentum, null);
  assert.equal(invalid.resolutionTension, null);

  const zeroDiv = computeRatios({
    vol24h: 100,
    liquidity: 0,
    openInterest: 0,
    bestBid: 0,
    bestAsk: 0,
    currentProb: 0.5,
    prob24hAgo: 0.4,
    polyProb: 0,
    kalshiProb: 0,
    daysToClose: 5,
    closes7d: [0.4, 0.5],
  });
  assert.equal(zeroDiv.pressure, null);
  assert.equal(zeroDiv.churn, null);
  assert.equal(zeroDiv.support, null);
  assert.equal(zeroDiv.executionCost, null);
  assert.equal(zeroDiv.divergence, null);

  const skips = explainRatioSkips({
    vol24h: null,
    liquidity: 1,
    openInterest: 1,
    bestBid: null,
    bestAsk: null,
    currentProb: 0.5,
    prob24hAgo: null,
    polyProb: 0.5,
    kalshiProb: null,
    daysToClose: null,
    closes7d: [],
  });
  assert.equal(skips.pressure, 'missing_vol24h');
  assert.equal(skips.divergence, 'missing_or_invalid_cross_venue_prob');
  assert.equal(skips.probabilityMomentum, 'missing_or_invalid_probability');
  assert.equal(skips.resolutionTension, 'missing_closes_7d');

  console.log('✓ missing/invalid/zero-division ratio inputs stay null');
}

function runLiveQuoteTTL() {
  const id = 'polymarket_ttl_test';
  const freshTs = Date.now() - 10_000; // 10s ago — within TTL
  const staleTs = Date.now() - (LIVE_QUOTE_TTL_MS + 1_000); // 1s past TTL

  // Fresh record is readable
  rememberLiveQuote(id, [0.6, 0.4], freshTs);
  assert.ok(readLiveQuote(id) != null, 'fresh quote must be readable');
  assert.ok(readLiveQuoteRecord(id) != null, 'fresh record must be readable');
  assert.equal(readLiveQuoteRecord(id)?.sourceTs, freshTs, 'sourceTs preserved');

  // Simulate a stale record by writing with a past receivedAt via a backdated nowMs
  const staleNow = Date.now() + LIVE_QUOTE_TTL_MS + 2_000; // advance clock past TTL
  assert.equal(readLiveQuote(id, staleNow), undefined, 'quote past TTL must return undefined');
  assert.equal(readLiveQuoteRecord(id, staleNow), undefined, 'record past TTL must return undefined');

  // A new tick resets the TTL
  rememberLiveQuote(id, [0.65, 0.35], Date.now());
  assert.ok(readLiveQuote(id) != null, 'refreshed quote must be readable again');

  // Stale sourceTs from a previous session does not leak through TTL gate
  const oldSessionId = 'kalshi_old_session';
  rememberLiveQuote(oldSessionId, [0.01, 0.99], staleTs);
  // Record was written just now (receivedAt = now) but sourceTs is old — still readable within TTL
  assert.ok(readLiveQuoteRecord(oldSessionId) != null, 'record with old sourceTs but fresh receivedAt is readable');
  // Past TTL it disappears
  assert.equal(readLiveQuoteRecord(oldSessionId, staleNow), undefined, 'old-session record evicted past TTL');

  // Untimed update (undefined or null sourceTs) must NOT erase an existing valid sourceTs
  const untimedId = 'polymarket_untimed_test';
  rememberLiveQuote(untimedId, [0.55, 0.45], freshTs);
  assert.equal(readLiveQuoteRecord(untimedId)?.sourceTs, freshTs, 'initial sourceTs preserved');
  rememberLiveQuote(untimedId, [0.56, 0.44]); // undefined sourceTs
  assert.equal(readLiveQuoteRecord(untimedId)?.sourceTs, freshTs, 'untimed update with undefined must not erase sourceTs');
  rememberLiveQuote(untimedId, [0.57, 0.43], null); // null sourceTs
  assert.equal(readLiveQuoteRecord(untimedId)?.sourceTs, freshTs, 'untimed update with null must not erase sourceTs');

  console.log('✓ liveQuotes TTL eviction tests passed');
}

function runPhase9ComprehensiveTests() {
  const baseInputs = {
    vol24h: 10_000,
    liquidity: 5_000,
    openInterest: 20_000,
    bestBid: 0.59,
    bestAsk: 0.61,
    currentProb: 0.6,
    prob24hAgo: 0.58,
    daysToClose: 10,
    closes7d: [0.55, 0.58, 0.6],
  };

  const now = 1_700_000_000_000;

  // 1. Exact divergence formula with standard inputs
  // poly=0.65, kalshi=0.55 -> |0.65 - 0.55| / ((0.65 + 0.55)/2) = 0.10 / 0.60 = 0.16666666666666666
  const t1 = computeRatios({
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
  });
  const expectedT1 = Math.abs(0.65 - 0.55) / ((0.65 + 0.55) / 2);
  assert.ok(t1.divergence != null && Math.abs(t1.divergence - expectedT1) < 1e-9, `T1 expected ${expectedT1}, got ${t1.divergence}`);

  // 2. Zero divergence (equal probabilities) -> 0
  const t2 = computeRatios({
    ...baseInputs,
    polyProb: 0.60,
    kalshiProb: 0.60,
  });
  assert.equal(t2.divergence, 0, 'T2 expected 0 divergence');

  // 3. Missing polyProb -> divergence is null
  const t3 = computeRatios({
    ...baseInputs,
    polyProb: null,
    kalshiProb: 0.55,
  });
  assert.equal(t3.divergence, null, 'T3 expected null divergence');
  assert.equal(explainRatioSkips({ ...baseInputs, polyProb: null, kalshiProb: 0.55 }).divergence, 'missing_or_invalid_cross_venue_prob');

  // 4. Missing kalshiProb -> divergence is null
  const t4 = computeRatios({
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: null,
  });
  assert.equal(t4.divergence, null, 'T4 expected null divergence');
  assert.equal(explainRatioSkips({ ...baseInputs, polyProb: 0.65, kalshiProb: null }).divergence, 'missing_or_invalid_cross_venue_prob');

  // 5. Both probabilities zero -> divergence is null (avoid 0/0)
  const t5 = computeRatios({
    ...baseInputs,
    polyProb: 0,
    kalshiProb: 0,
  });
  assert.equal(t5.divergence, null, 'T5 expected null divergence on zero mean');
  assert.equal(explainRatioSkips({ ...baseInputs, polyProb: 0, kalshiProb: 0 }).divergence, 'zero_mean_prob');

  // 6. Probability > 1.0 rejected -> divergence is null
  const t6 = computeRatios({
    ...baseInputs,
    polyProb: 1.05,
    kalshiProb: 0.5,
  });
  assert.equal(t6.divergence, null, 'T6 expected null divergence for prob > 1.0');

  // 7. Probability < 0.0 rejected -> divergence is null
  const t7 = computeRatios({
    ...baseInputs,
    polyProb: -0.1,
    kalshiProb: 0.5,
  });
  assert.equal(t7.divergence, null, 'T7 expected null divergence for prob < 0.0');

  // 8. Non-finite probability (NaN, Infinity) rejected -> divergence is null
  const t8a = computeRatios({
    ...baseInputs,
    polyProb: Number.NaN,
    kalshiProb: 0.5,
  });
  assert.equal(t8a.divergence, null, 'T8a expected null for NaN');
  const t8b = computeRatios({
    ...baseInputs,
    polyProb: Number.POSITIVE_INFINITY,
    kalshiProb: 0.5,
  });
  assert.equal(t8b.divergence, null, 'T8b expected null for Infinity');

  // 9. Stale quote (> 60s) -> divergence is null, skip reason = 'stale_quote'
  const t9Inputs = {
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
    polyProbTs: now - 65_000, // 65s old (> 60s)
    kalshiProbTs: now - 10_000,
    nowMs: now,
  };
  const t9 = computeRatios(t9Inputs);
  assert.equal(t9.divergence, null, 'T9 expected null divergence for stale quote');
  assert.equal(explainRatioSkips(t9Inputs).divergence, 'stale_quote');

  // 10. Timestamp drift (> 30s) -> divergence is null, skip reason = 'cross_venue_timestamp_divergence'
  const t10Inputs = {
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
    polyProbTs: now - 5_000,
    kalshiProbTs: now - 40_000, // 35s drift (> 30s)
    nowMs: now,
  };
  const t10 = computeRatios(t10Inputs);
  assert.equal(t10.divergence, null, 'T10 expected null divergence for drift > 30s');
  assert.equal(explainRatioSkips(t10Inputs).divergence, 'cross_venue_timestamp_divergence');

  // 11. Future timestamp (> 5s) rejected -> divergence is null, skip reason = 'future_quote_timestamp'
  const t11Inputs = {
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
    polyProbTs: now + 10_000, // 10s in future (> 5s)
    kalshiProbTs: now,
    nowMs: now,
  };
  const t11 = computeRatios(t11Inputs);
  assert.equal(t11.divergence, null, 'T11 expected null divergence for future quote');
  assert.equal(explainRatioSkips(t11Inputs).divergence, 'future_quote_timestamp');

  // 12. Missing timestamp -> divergence is null, skip reason = 'missing_quote_timestamp'
  const t12Inputs = {
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
    polyProbTs: null,
    kalshiProbTs: now - 5_000,
    nowMs: now,
  };
  const t12 = computeRatios(t12Inputs);
  assert.equal(t12.divergence, null, 'T12 expected null divergence for missing timestamp');
  assert.equal(explainRatioSkips(t12Inputs).divergence, 'missing_quote_timestamp');

  // 13. Live quotes within thresholds -> divergence calculated successfully
  const t13Inputs = {
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
    polyProbTs: now - 5_000,
    kalshiProbTs: now - 10_000,
    nowMs: now,
  };
  const t13 = computeRatios(t13Inputs);
  assert.ok(t13.divergence != null && Math.abs(t13.divergence - expectedT1) < 1e-9, 'T13 expected fresh divergence');
  assert.equal(explainRatioSkips(t13Inputs).divergence, undefined);

  // 14. Equivalent outcome alignment -> uses twin price directly
  const t14Aligned = alignTwinPrice(
    'Colorado Rockies vs Milwaukee Brewers',
    'Rockies',
    'Colorado Rockies vs. Milwaukee Brewers Winner?',
    'Rockies',
    0.45
  );
  assert.equal(t14Aligned, 0.45, 'T14 expected twin price directly for equivalent outcome');

  // 15. Opposite outcome alignment -> uses 1 - twin price
  const t15Aligned = alignTwinPrice(
    'Colorado Rockies vs Milwaukee Brewers',
    'Rockies',
    'Colorado Rockies vs. Milwaukee Brewers Winner?',
    'Brewers',
    0.45
  );
  assert.ok(t15Aligned != null && Math.abs(t15Aligned - 0.55) < 1e-9, 'T15 expected 1 - twin price for opposite outcome');

  // 16. Ambiguous outcome alignment -> returns null, divergence is null
  const t16Aligned = alignTwinPrice(
    'Colorado Rockies vs Milwaukee Brewers',
    'Rockies',
    'Colorado Rockies vs. Milwaukee Brewers Winner?',
    null,
    0.45
  );
  assert.equal(t16Aligned, null, 'T16 expected null for ambiguous outcome');
  const t16 = computeRatios({
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: t16Aligned,
  });
  assert.equal(t16.divergence, null, 'T16 expected null divergence for ambiguous outcome');

  // 17. Closed market excluded -> divergence is null, skip reason = 'market_expired_or_closed'
  const t17Inputs = {
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
    isClosedOrExpired: true,
  };
  const t17 = computeRatios(t17Inputs);
  assert.equal(t17.divergence, null, 'T17 expected null divergence for closed market');
  assert.equal(explainRatioSkips(t17Inputs).divergence, 'market_expired_or_closed');

  // 18. Expired market excluded (daysToClose <= 0) -> divergence is null, skip reason = 'market_expired_or_closed'
  const t18Inputs = {
    ...baseInputs,
    polyProb: 0.65,
    kalshiProb: 0.55,
    daysToClose: 0,
  };
  const t18 = computeRatios(t18Inputs);
  assert.equal(t18.divergence, null, 'T18 expected null divergence for expired market');
  assert.equal(explainRatioSkips(t18Inputs).divergence, 'market_expired_or_closed');

  // 19. High legitimate divergence (e.g. 0.85 vs 0.15) preserved without inversion
  // In the old code with proximity heuristic, 0.15 would be inverted to 0.85 because |0.85 - 0.85| < |0.85 - 0.15|.
  // With semantic alignment, 0.15 is preserved as 0.15.
  const t19TwinAligned = alignTwinPrice(
    'Will Candidate X Win?',
    'YES',
    'Will Candidate X Win?',
    'YES',
    0.15,
    0.85
  );
  assert.equal(t19TwinAligned, 0.15, 'T19 expected 0.15 preserved without proximity inversion');
  const t19 = computeRatios({
    ...baseInputs,
    polyProb: 0.85,
    kalshiProb: t19TwinAligned,
  });
  const expectedT19 = Math.abs(0.85 - 0.15) / ((0.85 + 0.15) / 2); // 0.70 / 0.50 = 1.40
  assert.ok(t19.divergence != null && Math.abs(t19.divergence - expectedT19) < 1e-9, `T19 expected ${expectedT19}, got ${t19.divergence}`);

  // 20. parseSourceTimestampMs: missing/null/undefined → null
  assert.equal(parseSourceTimestampMs(null), null, 'T20a null → null');
  assert.equal(parseSourceTimestampMs(undefined), null, 'T20b undefined → null');
  assert.equal(parseSourceTimestampMs(''), null, 'T20c empty string → null');
  assert.equal(parseSourceTimestampMs(0), null, 'T20d zero → null');
  assert.equal(parseSourceTimestampMs(-1), null, 'T20e negative → null');
  assert.equal(parseSourceTimestampMs(NaN), null, 'T20f NaN → null');

  // 21. parseSourceTimestampMs: Unix seconds (< 1e11) → multiply by 1000
  assert.equal(parseSourceTimestampMs(1_700_000_000), 1_700_000_000_000, 'T21 Unix seconds → ms');

  // 22. parseSourceTimestampMs: Unix milliseconds (1e11 <= n < 1e14) → pass through
  assert.equal(parseSourceTimestampMs(1_700_000_000_000), 1_700_000_000_000, 'T22 Unix ms → ms');

  // 23. parseSourceTimestampMs: Unix microseconds (1e14 <= n < 1e17) → divide by 1000
  assert.equal(parseSourceTimestampMs(1_700_000_000_000_000), 1_700_000_000_000, 'T23 Unix µs → ms');

  // 24. parseSourceTimestampMs: Unix nanoseconds (>= 1e17) → divide by 1_000_000
  // Kalshi ts field is nanoseconds
  assert.equal(parseSourceTimestampMs(1_700_000_000_000_000_000), 1_700_000_000_000, 'T24 Unix ns → ms');

  // 25. parseSourceTimestampMs: ISO 8601 string → Date.parse ms
  const isoStr = '2023-11-14T22:13:20.000Z'; // = 1700000000000 ms
  assert.equal(parseSourceTimestampMs(isoStr), 1_700_000_000_000, 'T25 ISO string → ms');

  // 26. parseSourceTimestampMs: numeric string of seconds
  assert.equal(parseSourceTimestampMs('1700000000'), 1_700_000_000_000, 'T26 numeric string seconds → ms');

  // 27. parseSourceTimestampMs: Date object
  assert.equal(parseSourceTimestampMs(new Date(1_700_000_000_000)), 1_700_000_000_000, 'T27 Date object → ms');

  // 28. parseSourceTimestampMs: never returns current backend time (no Date.now() fabrication)
  const before = Date.now();
  const result28 = parseSourceTimestampMs(undefined);
  const after = Date.now();
  assert.equal(result28, null, 'T28 undefined must return null, not Date.now()');
  if (result28 != null) {
    assert.ok(result28 < before || result28 > after, 'T28 must not fabricate current time');
  }

  // 29. parseSourceTimestampMs: numeric string of milliseconds (e.g. Polymarket CLOB "1793707405896")
  assert.equal(parseSourceTimestampMs('1793707405896'), 1_793_707_405_896, 'T29 numeric string ms → ms');

  // 30. parseSourceTimestampMs: ISO string with microsecond fraction (e.g. Kalshi "2026-10-29T09:02:53.906933Z")
  assert.equal(parseSourceTimestampMs('2026-10-29T09:02:53.906933Z'), 1_793_264_573_906, 'T30 ISO with microseconds → ms');

  // 31. parseSourceTimestampMs: invalid string → null
  assert.equal(parseSourceTimestampMs('not-a-timestamp'), null, 'T31 invalid string → null');

  console.log('✓ All 31 Phase 9 divergence, timestamp normalization & market matching test cases passed');
}

async function run() {
  const r = runFormulas();
  runMissingAndInvalidInputs();
  runLiveQuoteTTL();
  runInputAssembly();
  await runEngineWithMocks();
  runMatching();
  runHttpShape();
  runPhase9ComprehensiveTests();

  console.log('ratios.test.ts OK', {
    pressure: r.pressure,
    churn: Number((r.churn as number).toFixed(4)),
    support: r.support,
    executionCost: Number(((r.executionCost as number) * 100).toFixed(2)) + '%',
    divergence: Number(((r.divergence as number) * 100).toFixed(2)) + '%',
    probabilityMomentum: Number(((r.probabilityMomentum as number) * 100).toFixed(1)) + 'pp',
    resolutionTension: Number((r.resolutionTension as number).toFixed(2)),
    candidateLimit: MATCH_CANDIDATE_LIMIT,
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
