import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * CalculatorSuite — drop-in for the single market page.
 *
 * Each calculator mode (EV, Edge, Kelly, Odds, Hedge, B/E, Sim) is a plain
 * data object: its inputs, its optional toggle groups, and a compute()
 * function. One generic block renders whichever mode is active, so adding
 * or editing a mode means editing MODES below, not writing new JSX.
 */

type Tone = "positive" | "negative" | "warning" | "primary";
type Values = Record<string, string>;

interface FieldDef {
  key: string;
  label: string;
  suffix?: string;
}
interface ToggleOption {
  value: string;
  label: string;
  tone?: "yes" | "no";
}
interface ToggleGroup {
  key: string;
  options: ToggleOption[];
}
interface OutputRowData {
  label: string;
  value: string;
  tone?: Tone;
}
interface Hero {
  value: string;
  label: string;
  tone?: Tone;
}
interface ComputeResult {
  hero?: Hero;
  rows: OutputRowData[];
}
interface ModeConfig {
  id: string;
  label: string;
  full: string;
  fields: FieldDef[];
  toggles?: ToggleGroup[];
  compute: (v: Values) => ComputeResult;
}

// ---- formatting helpers ---------------------------------------------------

const num = (v: Values, key: string) => parseFloat(v[key]);
const fmtUsd = (n: number) => (isFinite(n) ? `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}` : "—");
const fmtPct = (n: number, d = 1) => (isFinite(n) ? `${n.toFixed(d)}%` : "—");
const fmtNum = (n: number, d = 3) => (isFinite(n) ? n.toFixed(d).replace(/\.?0+$/, (m) => (m === "." ? "" : m)) : "—");
const toFraction = (profit: number) => {
  if (!isFinite(profit) || profit <= 0) return "—";
  let denom = 1;
  let n = profit;
  while (Math.abs(n - Math.round(n)) > 0.001 && denom < 1000) {
    denom *= 10;
    n = profit * denom;
  }
  n = Math.round(n);
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(n, denom) || 1;
  return `${n / g}/${denom / g}`;
};
const sign = (n: number) => (n >= 0 ? "+" : "");
const toneOf = (n: number): Tone => (n >= 0 ? "positive" : "negative");

// ---- mode definitions ------------------------------------------------------

const KELLY_MULT: Record<string, number> = { full: 1, half: 0.5, "r-adj": 0.35, port: 0.25 };

const MODES: ModeConfig[] = [
  {
    id: "ev",
    label: "EV",
    full: "Expected value",
    fields: [
      { key: "yourProb", label: "Your probability", suffix: "%" },
      { key: "marketPrice", label: "Market price", suffix: "¢" },
      { key: "stake", label: "Stake", suffix: "$" },
    ],
    compute: (v) => {
      const p = num(v, "yourProb") / 100;
      const price = num(v, "marketPrice") / 100;
      const stake = num(v, "stake");
      const shares = stake / price;
      const ev = p * shares - stake;
      return {
        hero: { value: fmtUsd(ev), label: `Expected value on ${fmtNum(shares, 1)} shares`, tone: toneOf(ev) },
        rows: [{ label: "EV %", value: fmtPct((ev / stake) * 100), tone: toneOf(ev) }],
      };
    },
  },
  {
    id: "edge",
    label: "Edge",
    full: "Edge",
    fields: [
      { key: "yourProb", label: "Your probability", suffix: "%" },
      { key: "marketPrice", label: "Market price", suffix: "¢" },
    ],
    compute: (v) => {
      const p = num(v, "yourProb") / 100;
      const price = num(v, "marketPrice") / 100;
      const edgePts = (p - price) * 100;
      const edgeRel = (edgePts / (price * 100)) * 100;
      return {
        hero: { value: `${sign(edgePts)}${fmtNum(edgePts, 1)}pp`, label: "Edge vs. market", tone: toneOf(edgePts) },
        rows: [{ label: "Relative edge", value: fmtPct(edgeRel), tone: toneOf(edgeRel) }],
      };
    },
  },
  {
    id: "kelly",
    label: "Kelly",
    full: "Kelly sizing",
    fields: [
      { key: "yourProb", label: "Your probability", suffix: "%" },
      { key: "marketPrice", label: "Market price", suffix: "¢" },
      { key: "bankroll", label: "Bankroll", suffix: "$" },
    ],
    toggles: [
      {
        key: "kellyFraction",
        options: [
          { value: "full", label: "Full" },
          { value: "half", label: "Half" },
          { value: "r-adj", label: "R-Adj" },
          { value: "port", label: "Port." },
        ],
      },
      {
        key: "kellySide",
        options: [
          { value: "yes", label: "YES side", tone: "yes" },
          { value: "no", label: "NO side", tone: "no" },
        ],
      },
    ],
    compute: (v) => {
      const p = num(v, "yourProb") / 100;
      const price = num(v, "marketPrice") / 100;
      const bankroll = num(v, "bankroll");
      const side = v.kellySide;
      const effP = side === "yes" ? p : 1 - p;
      const effPrice = side === "yes" ? price : 1 - price;
      const b = (1 - effPrice) / effPrice;
      const f = Math.max(effP - (1 - effP) / b, 0);
      const sizedF = f * (KELLY_MULT[v.kellyFraction] ?? 0.5);
      return {
        hero: { value: fmtUsd(sizedF * bankroll), label: `Suggested stake (${fmtPct(sizedF * 100)} of bankroll)`, tone: "primary" },
        rows: [{ label: "Full Kelly fraction", value: fmtPct(f * 100) }],
      };
    },
  },
  {
    id: "odds",
    label: "Odds",
    full: "Odds converter",
    fields: [{ key: "oddsInput", label: "Probability / price" }],
    toggles: [
      {
        key: "oddsFormat",
        options: [
          { value: "prob", label: "Prob %" },
          { value: "decimal", label: "Decimal" },
          { value: "american", label: "American" },
        ],
      },
    ],
    compute: (v) => {
      const format = v.oddsFormat;
      const raw = num(v, "oddsInput");
      let yesProb =
        format === "prob" ? raw / 100 : format === "decimal" ? 1 / raw : raw < 0 ? -raw / (-raw + 100) : 100 / (raw + 100);
      yesProb = Math.min(Math.max(yesProb, 0.0001), 0.9999);
      const noProb = 1 - yesProb;
      const dec = (p: number) => 1 / p;
      const am = (p: number) => (p > 0.5 ? -100 * (p / (1 - p)) : 100 * ((1 - p) / p));
      const row = (label: string, p: number, tone: Tone): OutputRowData[] => [
        { label: `${label} implied prob`, value: fmtPct(p * 100), tone },
        { label: `${label} decimal odds`, value: fmtNum(dec(p)) },
        { label: `${label} American`, value: `${sign(am(p))}${Math.round(am(p))}` },
        { label: `${label} fractional`, value: toFraction(dec(p) - 1) },
      ];
      return { rows: [...row("YES", yesProb, "positive"), ...row("NO", noProb, "negative")] };
    },
  },
  {
    id: "hedge",
    label: "Hedge",
    full: "Hedge",
    fields: [
      { key: "entryPrice", label: "Entry price", suffix: "¢" },
      { key: "sharesHeld", label: "Shares held" },
      { key: "currentPrice", label: "Current price", suffix: "¢" },
    ],
    toggles: [
      {
        key: "hedgeSide",
        options: [
          { value: "yes", label: "Long YES", tone: "yes" },
          { value: "no", label: "Long NO", tone: "no" },
        ],
      },
    ],
    compute: (v) => {
      const entry = num(v, "entryPrice") / 100;
      const shares = num(v, "sharesHeld");
      const current = num(v, "currentPrice") / 100;
      const cost = shares * entry;
      const value = shares * current;
      const pnl = value - cost;
      const hedgeShares = shares;
      const hedgeCost = hedgeShares * (1 - current);

      return {
        hero: { value: fmtUsd(pnl), label: `Unrealized P/L (${fmtPct((pnl / cost) * 100)})`, tone: toneOf(pnl) },
        rows: [
          { label: "Cost basis", value: fmtUsd(cost) },
          { label: "Position value", value: fmtUsd(value) },
          { label: "Opposite shares to lock in", value: fmtNum(hedgeShares, 1) },
          { label: "Cost to hedge", value: fmtUsd(hedgeCost) },
          { label: "Locked P/L if hedged", value: fmtUsd(pnl), tone: "primary" },
        ],
      };
    },
  },
  {
    id: "be",
    label: "B/E",
    full: "Breakeven",
    fields: [
      { key: "marketPrice", label: "Market price", suffix: "¢" },
      { key: "feeRate", label: "Fee rate", suffix: "%" },
      { key: "targetRoi", label: "Target ROI", suffix: "%" },
    ],
    compute: (v) => {
      const price = num(v, "marketPrice") / 100;
      const fee = num(v, "feeRate") / 100;
      const roi = num(v, "targetRoi") / 100;
      const beNoFees = price * 100;
      const costWFees = price * (1 + fee);
      const beWFees = costWFees * 100;
      const minForRoi = Math.min(costWFees * (1 + roi) * 100, 100);
      return {
        rows: [
          { label: "Breakeven prob (no fees)", value: fmtPct(beNoFees) },
          { label: "Breakeven prob (w/ fees)", value: fmtPct(beWFees), tone: "warning" },
          { label: `Min prob for ${v.targetRoi || 0}% ROI`, value: fmtPct(minForRoi) },
          { label: "Required edge", value: `>${fmtPct(beWFees)}`, tone: "negative" },
        ],
      };
    },
  },
  {
    id: "sim",
    label: "Sim",
    full: "Payout simulator",
    fields: [
      { key: "simEntry", label: "Entry price", suffix: "¢" },
      { key: "simShares", label: "Shares" },
    ],
    toggles: [
      {
        key: "simSide",
        options: [
          { value: "yes", label: "Long YES", tone: "yes" },
          { value: "no", label: "Long NO", tone: "no" },
        ],
      },
    ],
    compute: (v) => {
      const entry = num(v, "simEntry") / 100;
      const shares = num(v, "simShares");
      const cost = shares * entry;
      const win = shares - cost;
      const exitAt = (cents: number) => shares * (cents / 100) - cost;
      const wonLabel = v.simSide === "yes" ? "YES" : "NO";
      const lostLabel = v.simSide === "yes" ? "NO" : "YES";
      return {
        rows: [
          { label: `Resolves ${wonLabel}`, value: fmtUsd(win), tone: "positive" },
          { label: `Resolves ${lostLabel}`, value: fmtUsd(-cost), tone: "negative" },
          { label: "Exit @ 75¢", value: fmtUsd(exitAt(75)), tone: toneOf(exitAt(75)) },
          { label: "Exit @ 50¢", value: fmtUsd(exitAt(50)), tone: toneOf(exitAt(50)) },
          { label: "Exit @ 25¢", value: fmtUsd(exitAt(25)), tone: toneOf(exitAt(25)) },
          { label: "Exit @ 10¢", value: fmtUsd(exitAt(10)), tone: toneOf(exitAt(10)) },
          { label: "Cost basis", value: fmtUsd(cost) },
        ],
      };
    },
  },
];

const DEFAULTS: Values = {
  yourProb: "65",
  marketPrice: "92.5",
  stake: "100",
  bankroll: "10000",
  kellySide: "yes",
  kellyFraction: "half",
  oddsFormat: "prob",
  oddsInput: "92.5",
  hedgeSide: "yes",
  entryPrice: "40",
  sharesHeld: "100",
  currentPrice: "92.5",
  feeRate: "0",
  targetRoi: "10",
  simSide: "yes",
  simEntry: "92.5",
  simShares: "100",
};

// Declared outside CalculatorSuite so React keeps the same component
// identity across renders — nesting these inside the parent caused every
// input to remount (and lose focus) on each keystroke.
function Field({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  return (
    <div className="sp-field">
      <label className="sp-label">{def.label}</label>
      <div className="sp-input-wrap">
        <input className="sp-input n" inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        {def.suffix && <span className="sp-suffix t-meta">{def.suffix}</span>}
      </div>
    </div>
  );
}

function ToggleRow({ group, value, onChange }: { group: ToggleGroup; value: string; onChange: (v: string) => void }) {
  return (
    <div className="sp-seg-group">
      {group.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`sp-seg-btn t-ui${opt.tone ? ` sp-seg-btn--${opt.tone}` : ""}${
            value === opt.value ? " sp-seg-btn--active" : ""
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function OutputRow({ row }: { row: OutputRowData }) {
  return (
    <div className="sp-output-row">
      <span className="sp-output-label t-meta">{row.label}</span>
      <span className={`sp-output-value n${row.tone ? ` sp-tone-${row.tone}` : ""}`}>{row.value}</span>
    </div>
  );
}

export default function IdCalculatorSuite() {
  const [modeId, setModeId] = useState("ev");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(DEFAULTS);

  const mode = MODES.find((m) => m.id === modeId)!;
  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));
  const result = useMemo(() => mode.compute(values), [mode, values]);

  return (
    <div className="sp-calc-card">
      <style>{`
        .sp-calc-card {
          --background:#0B0D11; --card:#12151B; --popover:#12151B; --inset:#171B22;
          --raised:#1B2028; --divider:#1C212B; --border:#232833; --input:#262C38; --border-hover:#333B49;
          --foreground:#E8EAEE; --text-body:#A8B0BD; --muted-foreground:#8B93A1; --text-dim:#5D6472;
          --positive:#3FCF8E; --negative:#E5645B; --warning:#E0A63C;
          --positive-soft:rgba(63,207,142,0.14); --negative-soft:rgba(229,100,91,0.14);
          --primary:#6C9BF5; --radius:0.625rem;
          font-family: var(--font-sans, 'Geist', ui-sans-serif, system-ui, sans-serif);
          background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 16px; width: 100%; max-width: 420px; box-sizing: border-box; color: var(--foreground);
        }
        .sp-calc-card * { box-sizing: border-box; }
        .n, .sp-input { font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace); }
        .n { font-size: 13.5px; font-weight: 600; }
        .t-ui { font-size: 13.5px; font-weight: 500; color: var(--muted-foreground); }
        .t-h2 { font-size: 15px; font-weight: 700; }
        .t-meta { font-size: 12px; color: var(--text-dim); }

        .sp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .sp-dropdown { position: relative; }
        .sp-dropdown-trigger {
          display: flex; align-items: center; gap: 6px; background: var(--inset); border: 1px solid var(--input);
          border-radius: calc(var(--radius) * 0.5); padding: 5px 8px; cursor: pointer; color: var(--foreground);
        }
        .sp-dropdown-trigger:hover { border-color: var(--border-hover); }
        .sp-dropdown-badge {
          font-size: 11px; font-weight: 700; color: var(--primary); background: rgba(108,155,245,0.12);
          border-radius: 4px; padding: 2px 6px; font-family: var(--font-mono, 'JetBrains Mono', monospace);
        }
        .sp-dropdown-menu {
          position: absolute; top: calc(100% + 6px); right: 0; min-width: 200px; background: var(--popover);
          border: 1px solid var(--border); border-radius: calc(var(--radius) * 0.6); overflow: hidden; z-index: 20;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .sp-dropdown-item { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; cursor: pointer; color: var(--text-body); font-size: 13.5px; }
        .sp-dropdown-item:hover, .sp-dropdown-item--active { background: var(--raised); color: var(--foreground); }

        .sp-seg-group { display: flex; gap: 6px; margin-bottom: 14px; }
        .sp-seg-btn { flex: 1; background: var(--inset); border: 1px solid var(--input); color: var(--muted-foreground); padding: 7px 8px; border-radius: calc(var(--radius) * 0.5); cursor: pointer; }
        .sp-seg-btn--active { border-color: var(--primary); color: var(--foreground); }
        .sp-seg-btn--yes.sp-seg-btn--active { border-color: var(--positive); color: var(--positive); background: var(--positive-soft); }
        .sp-seg-btn--no.sp-seg-btn--active { border-color: var(--negative); color: var(--negative); background: var(--negative-soft); }

        .sp-field { margin-bottom: 12px; }
        .sp-label { display: block; font-size: 11px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
        .sp-input-wrap { position: relative; }
        .sp-input { width: 100%; background: var(--inset); border: 1px solid var(--input); border-radius: calc(var(--radius) * 0.5); padding: 8px 34px 8px 10px; color: var(--foreground); font-size: 13.5px; font-weight: 600; outline: none; }
        .sp-input:focus { border-color: var(--primary); }
        .sp-suffix { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); }

        .sp-output-block { margin-top: 16px; border-top: 1px solid var(--divider); padding-top: 12px; }
        .sp-output-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .sp-output-row + .sp-output-row { border-top: 1px solid var(--divider); }
        .sp-output-value { font-size: 14px; }
        .sp-tone-positive { color: var(--positive); }
        .sp-tone-negative { color: var(--negative); }
        .sp-tone-warning { color: var(--warning); }
        .sp-tone-primary { color: var(--primary); }

        .sp-hero { background: var(--inset); border-radius: calc(var(--radius) * 0.5); padding: 14px; text-align: center; margin-top: 4px; }
        .sp-hero-value { font-size: 22px; font-weight: 700; font-family: var(--font-mono, 'JetBrains Mono', monospace); }
        .sp-hero-label { margin-top: 4px; }
      `}</style>

      <div className="sp-header">
        <span className="t-h2">Calculator suite</span>
        <div className="sp-dropdown">
          <button type="button" className="sp-dropdown-trigger" onClick={() => setOpen((o) => !o)}>
            <span className="sp-dropdown-badge">{mode.label}</span>
            <ChevronDown size={14} color="var(--muted-foreground)" style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </button>
          {open && (
            <div className="sp-dropdown-menu">
              {MODES.map((m) => (
                <div
                  key={m.id}
                  className={`sp-dropdown-item${m.id === modeId ? " sp-dropdown-item--active" : ""}`}
                  onClick={() => {
                    setModeId(m.id);
                    setOpen(false);
                  }}
                >
                  <span>{m.full}</span>
                  <span className="sp-dropdown-badge">{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {mode.toggles?.map((group) => (
        <ToggleRow key={group.key} group={group} value={values[group.key]} onChange={(v) => setValue(group.key, v)} />
      ))}

      {mode.fields.map((f) => (
        <Field key={f.key} def={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} />
      ))}

      {result.hero && (
        <div className="sp-hero">
          <div className={`sp-hero-value${result.hero.tone ? ` sp-tone-${result.hero.tone}` : ""}`}>{result.hero.value}</div>
          <div className="t-meta sp-hero-label">{result.hero.label}</div>
        </div>
      )}

      <div className="sp-output-block">
        {result.rows.map((row, i) => (
          <OutputRow key={i} row={row} />
        ))}
      </div>
    </div>
  );
}