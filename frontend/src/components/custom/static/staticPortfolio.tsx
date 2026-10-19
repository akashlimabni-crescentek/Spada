"use client";

import { useEffect, useId, useMemo, useState, type MouseEvent, type TouchEvent } from "react";

type PlatformKey = "polymarket" | "kalshi";

interface SeriesData {
  label: string;
  color: string;
  values: number[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

const SERIES: Record<PlatformKey, SeriesData> = {
  polymarket: {
    label: "Polymarket",
    color: "var(--chart-2)",
    values: [0, 3.5, 2.1, 5.8, 7.2, 9.6, 11.4, 14.2],
  },
  kalshi: {
    label: "Kalshi",
    color: "var(--positive)",
    values: [0, 1.2, 0.8, 2.4, 3.1, 4.0, 5.2, 6.3],
  },
};

const PLATFORM_TABS: { key: PlatformKey; label: string }[] = [
  { key: "polymarket", label: "Polymarket" },
  { key: "kalshi", label: "Kalshi" },
];

function useBreakpoint(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function buildPath(
  values: number[],
  yMin: number,
  yMax: number,
  width: number,
  height: number,
  padLeft: number,
  padRight: number,
  padTop: number,
  padBottom: number
) {
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const stepX = innerW / (values.length - 1);

  const points: [number, number][] = values.map((v, i) => {
    const x = padLeft + i * stepX;
    const t = (v - yMin) / (yMax - yMin);
    const y = padTop + innerH * (1 - t);
    return [x, y];
  });

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;
    d += ` Q ${x0} ${y0} ${mx} ${(y0 + y1) / 2}`;
  }
  d += ` T ${points[points.length - 1][0]} ${points[points.length - 1][1]}`;

  return { d, points };
}

export default function PortfolioChart() {
  const [platform, setPlatform] = useState<PlatformKey>("polymarket");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gradientId = useId();

  const isSm = useBreakpoint("(min-width: 640px)");
  const isMd = useBreakpoint("(min-width: 768px)");

  const WIDTH = isMd ? 900 : isSm ? 640 : 340;
  const HEIGHT = isMd ? 320 : isSm ? 280 : 220;
  const PAD_LEFT = isMd ? 50 : isSm ? 42 : 34;
  const PAD_RIGHT = isMd ? 16 : 10;
  const PAD_TOP = isMd ? 20 : 16;
  const PAD_BOTTOM = isMd ? 32 : 26;
  const fontSize = isMd ? 11 : isSm ? 10.5 : 10;

  const active = SERIES[platform];

  const { yMin, yMax, ticks } = useMemo(() => {
    const vals = active.values;
    const min = Math.min(...vals, -2);
    const max = Math.max(...vals, 15);
    const roundedMin = Math.floor(min / 5) * 5;
    const roundedMax = Math.ceil(max / 5) * 5;
    const stepCount = (roundedMax - roundedMin) / 5;
    const t = Array.from({ length: stepCount + 1 }, (_, i) => roundedMin + i * 5);
    return { yMin: roundedMin, yMax: roundedMax, ticks: t.reverse() };
  }, [active]);

  const { d, points } = useMemo(
    () => buildPath(active.values, yMin, yMax, WIDTH, HEIGHT, PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM),
    [active, yMin, yMax, WIDTH, HEIGHT, PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM]
  );

  const latestValue = active.values[active.values.length - 1];
  const isPositive = latestValue >= 0;

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverValue = hoverIdx !== null ? active.values[hoverIdx] : null;

  function updateHoverFromClientX(clientX: number, rect: DOMRect) {
    const scaleX = WIDTH / rect.width;
    const relX = (clientX - rect.left) * scaleX;
    const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const stepX = innerW / (MONTHS.length - 1);
    let idx = Math.round((relX - PAD_LEFT) / stepX);
    idx = Math.max(0, Math.min(MONTHS.length - 1, idx));
    setHoverIdx(idx);
  }

  function handleMouseMove(e: MouseEvent<SVGSVGElement>) {
    updateHoverFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
  }

  function handleTouchMove(e: TouchEvent<SVGSVGElement>) {
    const touch = e.touches[0];
    if (!touch) return;
    updateHoverFromClientX(touch.clientX, e.currentTarget.getBoundingClientRect());
  }

  const tooltipNearRightEdge = hoverPoint ? hoverPoint[0] / WIDTH > 0.65 : false;
  const tooltipNearBottomEdge = hoverPoint ? hoverPoint[1] / HEIGHT > 0.6 : false;

  return (
    <div className="bg-card border border-border rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-5 max-w-full sm:max-w-[70%] md:max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: active.color }}
          />
          <span className="t-ui text-foreground">{active.label}</span>
          <span
            className={`n-sm font-semibold ${isPositive ? "text-positive" : "text-negative"}`}
          >
            {isPositive ? "+" : ""}
            {latestValue.toFixed(2)}%
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Platform"
          className="inline-flex items-center gap-1 bg-inset border border-border rounded-lg p-1 w-fit"
        >
          {PLATFORM_TABS.map((tab) => {
            const isActive = tab.key === platform;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setPlatform(tab.key);
                  setHoverIdx(null);
                }}
                className={[
                  "t-label px-3 py-1.5 rounded-md transition-colors text-center",
                  isActive
                    ? "bg-raised text-foreground"
                    : "text-dim hover:text-muted-foreground",
                ].join(" ")}
              >
                {tab.label.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto block touch-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={active.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={active.color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map((t) => {
            const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
            const y = PAD_TOP + innerH * (1 - (t - yMin) / (yMax - yMin));
            return (
              <g key={t}>
                <line
                  x1={PAD_LEFT}
                  x2={WIDTH - PAD_RIGHT}
                  y1={y}
                  y2={y}
                  stroke="var(--divider)"
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                  fontSize={fontSize}
                  fill="var(--text-dim)"
                >
                  {t > 0 ? `+${t}%` : `${t}%`}
                </text>
              </g>
            );
          })}

          {MONTHS.map((label, i) => {
            const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
            const stepX = innerW / (MONTHS.length - 1);
            const x = PAD_LEFT + i * stepX;
            return (
              <text
                key={label}
                x={x}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={fontSize}
                fill="var(--text-dim)"
              >
                {label}
              </text>
            );
          })}

          <path
            d={`${d} L ${points[points.length - 1][0]} ${HEIGHT - PAD_BOTTOM} L ${points[0][0]} ${HEIGHT - PAD_BOTTOM} Z`}
            fill={`url(#${gradientId})`}
          />

          <path d={d} fill="none" stroke={active.color} strokeWidth={2} />

          {hoverPoint && (
            <>
              <line
                x1={hoverPoint[0]}
                x2={hoverPoint[0]}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="var(--border-hover)"
                strokeWidth={1}
              />
              <circle
                cx={hoverPoint[0]}
                cy={hoverPoint[1]}
                r={4}
                fill={active.color}
                stroke="var(--card)"
                strokeWidth={2}
              />
            </>
          )}
        </svg>

        {hoverPoint && hoverValue !== null && hoverIdx !== null && (
          <div
            className="absolute bg-popover border border-border rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 pointer-events-none shadow-lg z-10"
            style={{
              left: `${(hoverPoint[0] / WIDTH) * 100}%`,
              top: `${(hoverPoint[1] / HEIGHT) * 100}%`,
              transform: `translate(${tooltipNearRightEdge ? "-110%" : "12px"}, ${tooltipNearBottomEdge ? "-110%" : "12px"})`,
            }}
          >
            <div className="t-meta mb-1 whitespace-nowrap">{MONTHS[hoverIdx]}</div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: active.color }}
              />
              <span className="t-ui text-foreground">{active.label}</span>
              <span
                className={`n-sm font-semibold ${hoverValue >= 0 ? "text-positive" : "text-negative"}`}
              >
                {hoverValue >= 0 ? "+" : ""}
                {hoverValue.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="t-meta text-right mt-2 sm:mt-3">
        HYPOTHETICAL PERFORMANCE · FOR ILLUSTRATION ONLY
      </div>
    </div>
  );
}