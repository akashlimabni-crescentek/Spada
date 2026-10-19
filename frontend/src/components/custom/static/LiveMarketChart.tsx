"use client"
import React, { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

// Deterministic-ish random walk generator so the line looks like a believable
// probability series (bounded 0-100, gentle steps, occasional bigger moves).
function nextValue(prev: number, min: number = 30, max: number = 75): number {
  const drift = (Math.random() - 0.45) * 3.2; // slight upward bias
  let next = prev + drift;
  if (next < min) next = min + Math.random() * 2;
  if (next > max) next = max - Math.random() * 2;
  return Math.round(next * 10) / 10;
}

interface DataPoint {
  i: number;
  value: number;
}

const LABELS = ["Apr 1", "Apr 8", "Apr 14", "Apr 21", "Apr 28", "May 5"];

function buildInitialSeries(): DataPoint[] {
  const points: DataPoint[] = [];
  let v = 40;
  const totalPoints = 42; // dense enough for a smooth curve across 6 labels
  for (let i = 0; i < totalPoints; i++) {
    v = nextValue(v, 35, 55);
    points.push({ i, value: v });
  }
  return points;
}

// Deterministic placeholder used for the very first (server + pre-hydration)
// render, so server and client output match exactly. Real random data is
// swapped in after mount via rAF callback (not sync setState in effect body).
function buildPlaceholderSeries(): DataPoint[] {
  return Array.from({ length: 42 }, (_, i) => ({ i, value: 40 }));
}

type ChartMode = "LINE" | "CANDLE";

export default function LiveMarketChart() {
  const [mode, setMode] = useState<ChartMode>("LINE");
  const [data, setData] = useState<DataPoint[]>(buildPlaceholderSeries);
  const [baseline, setBaseline] = useState(40);
  const [flash, setFlash] = useState(false);
  const lastValueRef = useRef<number>(40);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const initial = buildInitialSeries();
      setData(initial);
      setBaseline(initial[0].value);
      lastValueRef.current = initial[initial.length - 1].value;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev: DataPoint[]) => {
        const last = prev[prev.length - 1];
        const newVal = nextValue(last.value, 32, 70);
        lastValueRef.current = newVal;
        const shifted = prev.slice(1).map((p, idx) => ({ ...p, i: idx }));
        shifted.push({ i: prev.length - 1, value: newVal });
        return shifted;
      });
      setFlash(true);
      setTimeout(() => setFlash(false), 260);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  const current = data[data.length - 1].value;
  const change = useMemo(
    () => Math.round((current - baseline) * 10) / 10,
    [current, baseline]
  );
  const isUp = change >= 0;

  return (
    <div
      data-testid="landing-live-chart-demo"
      style={{
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        width: "100%",
        maxWidth: 620,
        background: "#0b0d10",
        border: "1px solid #23262b",
        borderRadius: 14,
        padding: "22px 22px 14px",
        color: "#f4f5f6",
        boxSizing: "border-box",
      }}
    >
      <p
        data-testid="landing-demo-disclosure"
        role="note"
        style={{
          margin: "0 0 14px",
          fontSize: 12,
          lineHeight: 1.35,
          color: "#9aa0a6",
        }}
      >
        Illustrative demo — not live market data.
      </p>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#3ddc97",
                boxShadow: flash ? "0 0 0 4px rgba(61,220,151,0.25)" : "none",
                transition: "box-shadow 0.25s ease",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                color: "#9aa0a6",
                fontWeight: 600,
              }}
            >
              LIVE FEED
            </span>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.25,
              maxWidth: 260,
            }}
          >
            Will BoE Cut Rates in Q2?
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#ff5c8a",
                letterSpacing: "0.03em",
              }}
            >
              YES
            </span>
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: "#ff5c8a",
              lineHeight: 1.1,
              transition: "color 0.2s ease",
            }}
          >
            {current.toFixed(0)}%
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isUp ? "#3ddc97" : "#ff5c5c",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 3,
              marginTop: 2,
            }}
          >
            <span>{isUp ? "▲" : "▼"}</span>
            <span>
              {isUp ? "+" : ""}
              {change.toFixed(1)}pp
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              onClick={() => setMode("LINE")}
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid " + (mode === "LINE" ? "#4c525a" : "#23262b"),
                background: mode === "LINE" ? "#1b1e22" : "transparent",
                color: mode === "LINE" ? "#f4f5f6" : "#6b7076",
                cursor: "pointer",
              }}
            >
              LINE
            </button>
            <button
              onClick={() => setMode("CANDLE")}
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid " + (mode === "CANDLE" ? "#4c525a" : "#23262b"),
                background: mode === "CANDLE" ? "#1b1e22" : "transparent",
                color: mode === "CANDLE" ? "#f4f5f6" : "#6b7076",
                cursor: "pointer",
              }}
            >
              CANDLE
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid
              stroke="#1c1f23"
              strokeDasharray="0"
              vertical={false}
            />
            <YAxis
              domain={[30, 75]}
              ticks={[30, 40, 50, 60, 70]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: "#6b7076", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <XAxis
              dataKey="i"
              ticks={[0, 8, 16, 24, 32, 41]}
              tickFormatter={(v: number) => {
                const idx = [0, 8, 16, 24, 32, 41].indexOf(v);
                return idx >= 0 ? LABELS[idx] : "";
              }}
              tick={{ fill: "#6b7076", fontSize: 11 }}
              axisLine={{ stroke: "#23262b" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#15181c",
                border: "1px solid #2a2e34",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={() => ""}
              formatter={(v) => {
                const num = typeof v === "number" ? v : Number(v);
                return [`${num.toFixed(1)}%`, "YES"];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#4fc3ff"
              strokeWidth={2.25}
              dot={false}
              isAnimationActive={true}
              animationDuration={700}
              animationEasing="ease-out"
              activeDot={{ r: 4, fill: "#4fc3ff", stroke: "#0b0d10", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
