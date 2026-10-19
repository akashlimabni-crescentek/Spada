"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { RatioInputs, RatioMarketSummary, SevenRatios } from "@/types/ratios";

type RatioKey = keyof SevenRatios;

const RATIO_KEYS: RatioKey[] = [
  "pressure",
  "churn",
  "support",
  "executionCost",
  "divergence",
  "probabilityMomentum",
  "resolutionTension",
];

const RATIO_META: Record<
  RatioKey,
  {
    label: string;
    format: "multiplier" | "percent" | "pp" | "raw";
    description: string;
    formula: string;
    highIsGood: boolean;
  }
> = {
  pressure: {
    label: "Pressure",
    format: "multiplier",
    highIsGood: false,
    description: "24h volume ÷ liquidity — how hard is it being traded?",
    formula: "pressure = vol24h / liquidity",
  },
  churn: {
    label: "Churn",
    format: "multiplier",
    highIsGood: false,
    description: "24h volume ÷ open interest, weighted by days to resolution",
    formula: "churn = (vol24h / openInterest) / ln(1 + daysToClose)",
  },
  support: {
    label: "Support",
    format: "multiplier",
    highIsGood: true,
    description: "Liquidity ÷ open interest — can people get out?",
    formula: "support = liquidity / openInterest",
  },
  executionCost: {
    label: "Execution Cost",
    format: "percent",
    highIsGood: false,
    description: "(Ask − Bid) ÷ mid price — what does it cost to trade?",
    formula: "executionCost = (bestAsk − bestBid) / midPrice",
  },
  divergence: {
    label: "Divergence",
    format: "percent",
    highIsGood: false,
    description: "Platform price gap — do Polymarket and Kalshi agree?",
    formula: "divergence = |polyProb − kalshiProb| / ((polyProb + kalshiProb) / 2)",
  },
  probabilityMomentum: {
    label: "Prob. Momentum",
    format: "pp",
    highIsGood: false,
    description: "Current probability minus 24h ago — which direction is it moving?",
    formula: "probabilityMomentum = currentProb − prob_24h_ago",
  },
  resolutionTension: {
    label: "Resolution Tension",
    format: "raw",
    highIsGood: false,
    description: "7d price std dev × days to resolution — how much uncertainty remains?",
    formula: "resolutionTension = stddev(7d candle closes) × daysToClose",
  },
};

const RATIO_TOOLTIPS: Record<
  RatioKey,
  { ranges: { label: string; color: string }[]; note?: string }
> = {
  pressure: {
    ranges: [
      { label: "< 0.5 — Quiet, low trading activity", color: "#3fb950" },
      { label: "0.5 – 3 — Active, normal flow", color: "#e6edf3" },
      { label: "> 3 — Overheated, heavy pressure", color: "#f85149" },
    ],
  },
  churn: {
    ranges: [
      { label: "< 0.3 — Positions holding steady", color: "#3fb950" },
      { label: "0.3 – 2 — Normal turnover", color: "#e6edf3" },
      { label: "> 2 — High speculation or exit activity", color: "#f85149" },
    ],
    note: "Weighted by days to resolution — high churn near close is expected.",
  },
  support: {
    ranges: [
      { label: "< 0.4 — Fragile, hard to exit", color: "#f85149" },
      { label: "0.4 – 1.5 — Moderate liquidity support", color: "#e6edf3" },
      { label: "> 1.5 — Healthy, positions well backed", color: "#3fb950" },
    ],
  },
  executionCost: {
    ranges: [
      { label: "< 1% — Tight spread, cheap to trade", color: "#3fb950" },
      { label: "1 – 8% — Moderate cost", color: "#e6edf3" },
      { label: "> 8% — Wide spread, expensive", color: "#f85149" },
    ],
  },
  divergence: {
    ranges: [
      { label: "< 2% — Platforms aligned", color: "#3fb950" },
      { label: "2 – 10% — Meaningful gap", color: "#d29922" },
      { label: "> 10% — Potential arb opportunity", color: "#f85149" },
    ],
    note: "Requires a matched market on both platforms.",
  },
  probabilityMomentum: {
    ranges: [
      { label: "Negative — Probability falling", color: "#f85149" },
      { label: "≈ 0 — Stable, no directional move", color: "#e6edf3" },
      { label: "Positive — Probability rising", color: "#3fb950" },
    ],
  },
  resolutionTension: {
    ranges: [
      { label: "Near 0 — Market has settled", color: "#3fb950" },
      { label: "Rising — Increasing uncertainty", color: "#d29922" },
      { label: "High — Volatile, unresolved outcome", color: "#f85149" },
    ],
    note: "7-day price stddev × days to close. Higher = more uncertainty.",
  },
};

type MarketState = {
  label: string;
  color: string;
  detail: string;
};

/** Display-only formatter. Does not calculate ratios. */
function fmtRatio(
  v: number | null | undefined,
  type: "multiplier" | "percent" | "pp" | "raw"
): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (type === "percent") return `${(v * 100).toFixed(1)}%`;
  if (type === "pp") return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}pp`;
  if (type === "multiplier") {
    const abs = Math.abs(v);
    if (abs > 0 && abs < 0.01) return `${v.toFixed(4)}×`;
    if (abs < 1) return `${v.toFixed(3)}×`;
    return `${v.toFixed(2)}×`;
  }
  if (Math.abs(v) > 0 && Math.abs(v) < 0.001) return v.toFixed(6);
  return v.toFixed(4);
}

function fmtVol(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function ratioColor(v: number | null | undefined, highIsGood: boolean): string {
  if (v == null || !Number.isFinite(v)) return "#8b949e";
  if (highIsGood) return v > 2 ? "#3fb950" : v > 0.5 ? "#e6edf3" : "#f85149";
  return v > 0.1 ? "#f85149" : v > 0.03 ? "#d29922" : "#3fb950";
}

/** Classification badge from backend ratio values (display only). */
function deriveMarketState(r: SevenRatios): MarketState {
  const { pressure, churn, support, executionCost } = r;
  if (pressure == null || support == null) {
    return {
      label: "Insufficient Data",
      color: "#8b949e",
      detail: "Not enough market data to classify conditions.",
    };
  }

  const highPressure = pressure > 3;
  const lowPressure = pressure < 0.5;
  const highChurn = churn != null && churn > 2;
  const lowChurn = churn != null && churn < 0.3;
  const highSupport = support > 1.5;
  const lowSupport = support < 0.4;
  const highExecCost = executionCost != null && executionCost > 0.08;

  if (highPressure && highChurn && !highSupport) {
    return {
      label: "Overheated",
      color: "#f85149",
      detail: "Heavy trading pressure with elevated speculation — market may be unstable.",
    };
  }
  if (lowPressure && lowChurn && lowSupport) {
    return {
      label: "Fragile",
      color: "#d29922",
      detail: "Low activity with weak liquidity support — positions may be difficult to exit.",
    };
  }
  if (highPressure && highSupport) {
    return {
      label: "Conviction Move",
      color: "#3fb950",
      detail: "Heavy trading but well-backed — market is making a strong directional move.",
    };
  }
  if (lowPressure && lowChurn && highSupport) {
    return {
      label: "Dormant",
      color: "#e6edf3",
      detail: "Low activity but stable — market hasn't woken up yet.",
    };
  }
  if (highChurn && lowSupport) {
    return {
      label: "Exit Scramble",
      color: "#f85149",
      detail: "Speculation unwinding with limited exit depth — elevated risk.",
    };
  }
  if (!highPressure && !lowPressure && !highExecCost && highSupport) {
    return {
      label: "Healthy",
      color: "#3fb950",
      detail: "Balanced activity with solid liquidity support — stable trading conditions.",
    };
  }
  if (highPressure) {
    return {
      label: "Active",
      color: "#58a6ff",
      detail: "Above-average trading activity — monitor for directional move.",
    };
  }
  if (lowSupport && highExecCost) {
    return {
      label: "Thin Market",
      color: "#d29922",
      detail: "Limited liquidity with elevated trading costs — entry and exit may be costly.",
    };
  }
  return {
    label: "Neutral",
    color: "#e6edf3",
    detail: "No dominant market condition detected.",
  };
}

function RatioRow({ ratioKey, value }: { ratioKey: RatioKey; value: number | null }) {
  const [showTip, setShowTip] = useState(false);
  const meta = RATIO_META[ratioKey];
  const tip = RATIO_TOOLTIPS[ratioKey];
  const formatted = fmtRatio(value, meta.format);
  const color = ratioColor(value, meta.highIsGood);

  return (
    <div className="ratio-row">
      <div className="ratio-row-main">
        <div className="ratio-row-label-block">
          <button
            type="button"
            className="ratio-row-label"
            onClick={() => setShowTip((v) => !v)}
            aria-expanded={showTip}
          >
            {meta.label}
            <span className="ratio-info">ⓘ</span>
          </button>
          <div className="ratio-formula">{meta.formula}</div>
          <div className="ratio-desc ratio-muted">{meta.description}</div>
        </div>
        <div className="ratio-value" style={{ color }}>
          {formatted}
        </div>
      </div>
      {showTip ? (
        <div className="ratio-tooltip">
          {tip.ranges.map((r) => (
            <div key={r.label} className="ratio-tooltip-range" style={{ color: r.color }}>
              {r.label}
            </div>
          ))}
          {tip.note ? <div className="ratio-tooltip-note ratio-muted">{tip.note}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function counterLabel(
  counterMarket?: RatioMarketSummary | string | null
): string | null {
  if (!counterMarket) return null;
  if (typeof counterMarket === "string") return counterMarket;
  return counterMarket.title || counterMarket.platform || counterMarket.canonical_id || null;
}

function counterPlatform(
  counterMarket?: RatioMarketSummary | string | null
): string | null {
  if (!counterMarket || typeof counterMarket === "string") return null;
  return counterMarket.platform || null;
}

function counterYesPrice(
  counterMarket?: RatioMarketSummary | string | null
): number | null {
  if (!counterMarket || typeof counterMarket === "string") return null;
  return counterMarket.yes_price;
}

type MarketRatiosProps = {
  ratios?: SevenRatios | null;
  inputs?: RatioInputs | null;
  matched?: boolean;
  message?: string | null;
  counterMarket?: RatioMarketSummary | string | null;
  similarity?: number | null;
  isLoading?: boolean;
  isError?: boolean;
};

export function MarketRatios({
  ratios,
  inputs,
  matched,
  message,
  counterMarket,
  similarity,
  isLoading = false,
  isError = false,
}: MarketRatiosProps) {
  if (isLoading) {
    return (
      <Card className="p-4 min-w-0" data-testid="market-ratios-loading">
        <div className="ratio-panel">
          <div className="ratio-toolbar">
            <span className="ratio-title">Market Intelligence</span>
            <span className="ratio-meta ratio-muted">Loading…</span>
          </div>
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-4 min-w-0" data-testid="market-ratios-error">
        <div className="ratio-panel">
          <div className="ratio-toolbar">
            <span className="ratio-title">Market Intelligence</span>
          </div>
          <div className="ratio-status-banner ratio-status-warn">
            Ratios unavailable for this market.
          </div>
        </div>
      </Card>
    );
  }

  if (!ratios) {
    return (
      <Card className="p-4 min-w-0" data-testid="market-ratios-empty">
        <div className="ratio-panel">
          <div className="ratio-toolbar">
            <span className="ratio-title">Market Intelligence</span>
          </div>
          <div className="ratio-status-banner ratio-status-warn">
            No ratio data available.
          </div>
        </div>
      </Card>
    );
  }

  const marketState = deriveMarketState(ratios);
  const twinLabel = counterLabel(counterMarket);
  const twinPlatform = counterPlatform(counterMarket);
  const twinPrice = counterYesPrice(counterMarket);

  return (
    <Card className="p-4 min-w-0" data-testid="market-ratios">
      <div className="ratio-panel">
        <div className="ratio-toolbar">
          <span className="ratio-title">Market Intelligence</span>
          <span className="ratio-meta ratio-muted">
            {/* <span className="ratio-live">
              <span className="ratio-live-dot" />
              Backend ratios f
            </span> */}
          </span>
        </div>

        <div
          className="ratio-state"
          style={{
            borderColor: `${marketState.color}55`,
            background: `${marketState.color}14`,
          }}
        >
          <div className="ratio-state-header">
            <span className="ratio-state-dot" style={{ background: marketState.color }} />
            <span className="ratio-state-label" style={{ color: marketState.color }}>
              {marketState.label}
            </span>
          </div>
          <div className="ratio-state-detail ratio-muted">{marketState.detail}</div>
        </div>

        <div className="ratio-inputs ratio-muted">
          <span>Vol24h {fmtVol(inputs?.vol24h)}</span>
          <span>Liq {fmtVol(inputs?.liquidity)}</span>
          <span>OI {fmtVol(inputs?.openInterest)}</span>
          <span>
            DTE{" "}
            {inputs?.daysToClose != null && Number.isFinite(inputs.daysToClose)
              ? `${inputs.daysToClose.toFixed(1)}d`
              : "—"}
          </span>
          {matched && twinPlatform ? (
            <span title={twinLabel ?? undefined}>
              Cross {twinPlatform}
              {twinPrice != null && Number.isFinite(twinPrice)
                ? ` · ${fmtRatio(twinPrice, "percent")}`
                : ""}
              {similarity != null && Number.isFinite(similarity)
                ? ` · ${(similarity * 100).toFixed(0)}%`
                : ""}
              {twinLabel ? (
                <span className="ratio-cross-label">
                  {" "}
                  ·{" "}
                  {twinLabel.length > 42 ? `${twinLabel.slice(0, 40)}…` : twinLabel}
                </span>
              ) : null}
            </span>
          ) : (
            <span title={message ?? undefined}>Cross — (no match)</span>
          )}
        </div>

        <div className="ratio-list">
          {RATIO_KEYS.map((key) => (
            <RatioRow key={key} ratioKey={key} value={ratios[key]} />
          ))}
        </div>
      </div>
    </Card>
  );
}
