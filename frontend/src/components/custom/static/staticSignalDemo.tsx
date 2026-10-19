"use client";

// Fake chart data — probability % over time
const POINTS = [
  50, 49, 51, 50, 52, 51, 50, 53, 55, 54, 56, 58, 57, 59, 61,
  60, 62, 63, 61, 63, 65, 66, 64, 66, 67, 68, 66, 67, 65, 64,
  66, 68, 67, 69, 68, 67, 66, 68, 65,
];

const SIGNALS = [
  {
    label: "VOLUME SURGE",
    color: "warning",
    text: "3.2× normal 24h volume — rapid position build underway",
    dotIndex: 8,
  },
  {
    label: "LIQUIDITY EVENT",
    color: "negative",
    text: "Order book thinning — spread widening, exit conditions deteriorating",
    dotIndex: 33,
  },
];

const COLOR_MAP: Record<string, { border: string; text: string }> = {
  warning: { border: "border-l-warning", text: "text-warning" },
  positive: { border: "border-l-positive", text: "text-positive" },
  negative: { border: "border-l-negative", text: "text-negative" },
};

const CHART_W = 380;
const CHART_H = 180;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;
const PAD_LEFT = 32;
const PAD_RIGHT = 10;

function buildPath(): {
  path: string;
  dots: { x: number; y: number; i: number }[];
} {
  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const min = 44;
  const max = 72;

  const toX = (i: number) => PAD_LEFT + (i / (POINTS.length - 1)) * plotW;
  const toY = (v: number) =>
    PAD_TOP + plotH - ((v - min) / (max - min)) * plotH;

  let d = `M ${toX(0)} ${toY(POINTS[0])}`;
  for (let i = 1; i < POINTS.length; i++) {
    d += ` L ${toX(i)} ${toY(POINTS[i])}`;
  }

  const dots = SIGNALS.map((s) => ({
    x: toX(s.dotIndex),
    y: toY(POINTS[s.dotIndex]),
    i: s.dotIndex,
  }));

  return { path: d, dots };
}

function buildGridLines(): { y: number; label: string }[] {
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const min = 44;
  const max = 72;
  const steps = [50, 55, 60, 65, 70];

  return steps.map((v) => ({
    y: PAD_TOP + plotH - ((v - min) / (max - min)) * plotH,
    label: `${v}%`,
  }));
}

export default function SignalDemo() {
  const { path, dots } = buildPath();
  const grid = buildGridLines();

  // Gradient area path (fill under the line)
  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const areaPath = `${path} L ${PAD_LEFT + plotW} ${CHART_H - PAD_BOTTOM} L ${PAD_LEFT} ${CHART_H - PAD_BOTTOM} Z`;

  return (
    <div
      className="w-full max-w-[440px] bg-card border border-border rounded-lg overflow-hidden"
      data-testid="landing-signal-demo"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="t-label">SIGNAL DEMO</span>
        <div className="flex flex-col items-end">
          <span className="n-stat text-positive">YES 65%</span>
          <span className="n-sm font-semibold text-positive">▲ +20pp</span>
        </div>
      </div>

      {/* Title */}
      <div className="px-5 pb-2">
        <span className="t-h3">Will Tesla beat Earnings?</span>
      </div>

      <p
        className="px-5 pb-3 text-xs text-muted-foreground leading-snug"
        data-testid="landing-demo-disclosure"
        role="note"
      >
        Illustrative demo — not live market data.
      </p>

      {/* Chart */}
      <div className="px-3">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3FCF8E" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#3FCF8E" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {grid.map((g) => (
            <g key={g.label}>
              <line
                x1={PAD_LEFT}
                y1={g.y}
                x2={CHART_W - PAD_RIGHT}
                y2={g.y}
                stroke="#1C212B"
                strokeWidth="0.5"
                strokeDasharray="3 3"
              />
              <text
                x={PAD_LEFT - 6}
                y={g.y + 3.5}
                textAnchor="end"
                fill="#5D6472"
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {g.label}
              </text>
            </g>
          ))}

          {/* Gradient fill */}
          <path d={areaPath} fill="url(#chartGrad)" />

          {/* Line */}
          <path
            d={path}
            fill="none"
            stroke="#3FCF8E"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Signal dots */}
          {dots.map((dot, i) => (
            <g key={i}>
              <circle cx={dot.x} cy={dot.y} r="6" fill="#3FCF8E" opacity="0.15" />
              <circle cx={dot.x} cy={dot.y} r="3.5" fill="#3FCF8E" />
              <circle cx={dot.x} cy={dot.y} r="1.5" fill="#12151B" />
            </g>
          ))}
        </svg>
      </div>

      {/* Signal alerts */}
      <div className="flex flex-col gap-2 px-5 pt-3 pb-5">
        {SIGNALS.map((signal) => {
          const colors = COLOR_MAP[signal.color];
          return (
            <div
              key={signal.label}
              className={`bg-inset border-l-2 ${colors.border} rounded-sm px-3 py-2.5 flex items-start gap-3`}
            >
              <span className={`t-label ${colors.text} shrink-0 mt-0.5`}>
                {signal.label}
              </span>
              <span className="t-meta text-text-body">{signal.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}