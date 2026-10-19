"use client"
import React, { useState } from "react";

type AccentColor = "red" | "teal" | "yellow" | "green";

interface Metric {
  label: string;
  value: string;
  barPercent: number; // 0-100
  color: AccentColor;
  highlight?: boolean;
}

interface MarketData {
  id: string;
  name: string;
  metrics: Metric[];
}

const ACCENT_HEX: Record<AccentColor, string> = {
  red: "#ff5c5c",
  teal: "#4fc3ff",
  yellow: "#e8c65a",
  green: "#3ddc97",
};

const MARKETS: MarketData[] = [
  {
    id: "michigan",
    name: "Michigan Democratic Senate Prim...",
    metrics: [
      { label: "Pressure", value: "2.8x", barPercent: 70, color: "red", highlight: true },
      { label: "Churn", value: "1.2x", barPercent: 30, color: "teal" },
      { label: "Support", value: "0.9x", barPercent: 22, color: "teal" },
      { label: "Exec Cost", value: "0.4x", barPercent: 12, color: "teal" },
      { label: "Divergence", value: "1.6x", barPercent: 40, color: "yellow" },
      { label: "Momentum", value: "3.1x", barPercent: 78, color: "green" },
      { label: "Tension", value: "0.7x", barPercent: 18, color: "teal" },
    ],
  },
  {
    id: "fed",
    name: "Fed Decision in September?",
    metrics: [
      { label: "Pressure", value: "1.1x", barPercent: 24, color: "teal" },
      { label: "Churn", value: "2.4x", barPercent: 60, color: "yellow" },
      { label: "Support", value: "4.2x", barPercent: 95, color: "green", highlight: true },
      { label: "Exec Cost", value: "0.8x", barPercent: 20, color: "teal" },
      { label: "Divergence", value: "0.5x", barPercent: 14, color: "teal" },
      { label: "Momentum", value: "1.9x", barPercent: 48, color: "teal" },
      { label: "Tension", value: "1.3x", barPercent: 32, color: "teal" },
    ],
  },
];

export default function SevenMetrics() {
  const [activeId, setActiveId] = useState(MARKETS[0].id);
  const active = MARKETS.find((m) => m.id === activeId) ?? MARKETS[0];

  return (
    <div className="w-full text-foreground font-sans">
      {/* Market tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {MARKETS.map((m) => {
          const isActive = m.id === activeId;
          return (
            <button
              key={m.id}
              onClick={() => setActiveId(m.id)}
              className="flex items-center justify-between gap-3 text-left rounded-lg px-3.5 py-3 transition-colors duration-200"
              style={{
                background: isActive ? "#12181c" : "#0b0d10",
                border: "1px solid " + (isActive ? "#4fc3ff" : "#23262b"),
              }}
            >
              <span
                className="text-[13px] truncate"
                style={{ color: isActive ? "#f4f5f6" : "#8a9098" }}
              >
                {m.name}
              </span>
              <span
                className="shrink-0 text-[10px] font-bold tracking-wider rounded px-1.5 py-0.5"
                style={{
                  color: "#3ddc97",
                  background: "rgba(61,220,151,0.12)",
                  border: "1px solid rgba(61,220,151,0.3)",
                }}
              >
                LIVE
              </span>
            </button>
          );
        })}
      </div>

      

      {/* Metrics grid: 1 col on mobile, 4 cols from md up */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4 gap-3.5">
        {active.metrics.map((metric) => {
          const accent = ACCENT_HEX[metric.color];
          return (
            <div
              key={metric.label}
              className="relative rounded-lg overflow-hidden px-4 pt-4 pb-3.5 transition-colors duration-300"
              style={{
                background: "#0b0d10",
                border: "1px solid " + (metric.highlight ? accent : "#23262b"),
              }}
            >
              {metric.highlight && (
                <span
                  className="absolute left-0 top-0 bottom-0"
                  style={{ width: 3, background: accent }}
                />
              )}
              <div className="flex items-baseline justify-between mb-3.5">
                <span
                  className="text-[11px] font-semibold tracking-wider uppercase"
                  style={{ color: "#8a9098" }}
                >
                  {metric.label}
                </span>
                <span
                  className="text-xl font-bold transition-colors duration-300"
                  style={{ color: metric.highlight ? accent : "#f4f5f6" }}
                >
                  {metric.value}
                </span>
              </div>
              <div
                className="w-full rounded-full overflow-hidden"
                style={{ height: 2, background: "#23262b" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${metric.barPercent}%`, background: accent }}
                />
              </div>
            </div>
          );
        })}
      </div>

      
    </div>
  );
}