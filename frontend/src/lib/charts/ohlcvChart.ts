import {
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { candlesLookLikeProbability } from "@/lib/candles/normalize";
import type { ChartLineSeries, LinePoint, NormalizedCandle } from "@/lib/candles/types";

type ChartCandle = CandlestickData<UTCTimestamp>;
type ChartVolume = HistogramData<UTCTimestamp>;
type ChartLinePoint = LineData<UTCTimestamp>;

type ChartTheme = {
  background: string;
  text: string;
  grid: string;
  border: string;
  up: string;
  down: string;
  crosshair: string;
  fontFamily: string;
};

export type OhlcvChartHandle = {
  setCandles: (rows: NormalizedCandle[], options?: { fit?: boolean }) => void;
  /** Slow lane: replace completed history once (load / interval change). */
  setHistory: (rows: NormalizedCandle[], options?: { fit?: boolean }) => void;
  /** Fast lane: patch only the trailing forming candle (per tick / RAF). */
  updateLive: (row: NormalizedCandle) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
};

export type LineChartHandle = {
  setPoints: (points: LinePoint[], options?: { fit?: boolean }) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
};

export type MultiLineChartHandle = {
  setLines: (lines: ChartLineSeries[], options?: { fit?: boolean }) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
};

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function withAlpha(color: string, alpha: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alpha}`;
  return color;
}

function readTheme(): ChartTheme {
  return {
    background: cssColor("--background", "#0B0D11"),
    text: cssColor("--text-body", "#A8B0BD"),
    grid: cssColor("--divider", "#1C212B"),
    border: cssColor("--border", "#232833"),
    up: cssColor("--positive", "#3FCF8E"),
    down: cssColor("--negative", "#E5645B"),
    crosshair: cssColor("--primary", "#6C9BF5"),
    fontFamily: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

function formatGmt(ms: number, withTime: boolean): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: withTime ? "numeric" : undefined,
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
    hour12: false,
  }).formatToParts(new Date(ms));

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  if (!withTime) return `${pick("day")} ${pick("month")}`;
  return `${pick("day")} ${pick("month")} ${pick("year")}, ${pick("hour")}:${pick("minute")} GMT`;
}

function timeToSeconds(time: Time): number | null {
  if (typeof time === "number") return time;
  if (typeof time === "string") {
    const ms = Date.parse(time);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  if (typeof time === "object" && time != null && "year" in time) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }
  return null;
}

function formatAxis(ms: number, withSeconds = false): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).formatToParts(new Date(ms));

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const clock = withSeconds
    ? `${pick("hour")}:${pick("minute")}:${pick("second")}`
    : `${pick("hour")}:${pick("minute")}`;
  return `${pick("day")} ${pick("month")} ${clock}`;
}

function formatScalePrice(price: number, probability: boolean): string {
  if (!Number.isFinite(price)) return "";
  if (probability && Math.abs(price) > 1.5) return formatVolume(price);
  return formatPrice(price, probability, 1);
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatPrice(value: number, probability: boolean, digits: number): string {
  if (probability) return `${(value * 100).toFixed(digits)}%`;
  return value.toFixed(digits);
}

function toChartCandles(rows: NormalizedCandle[]): ChartCandle[] {
  return rows.map((row) => ({
    time: row.time as UTCTimestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
  }));
}

function toVolumeBars(rows: NormalizedCandle[], up: string, down: string): ChartVolume[] {
  return rows.map((row) => ({
    time: row.time as UTCTimestamp,
    value: row.volume,
    color: row.close >= row.open ? withAlpha(up, "55") : withAlpha(down, "55"),
  }));
}

function isLastCandleUpdate(prev: ChartCandle[], next: ChartCandle[]): boolean {
  if (!prev.length || next.length !== prev.length) return false;
  for (let i = 0; i < prev.length - 1; i += 1) {
    const before = prev[i];
    const after = next[i];
    if (
      before.time !== after.time ||
      before.open !== after.open ||
      before.high !== after.high ||
      before.low !== after.low ||
      before.close !== after.close
    ) {
      return false;
    }
  }
  return prev[prev.length - 1].time === next[next.length - 1].time;
}

function sameChartCandle(a: ChartCandle, b: ChartCandle): boolean {
  return (
    a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close
  );
}

/** One or more new bars appended after an unchanged prefix (gap-fill + bucket roll). */
function isAppendCandles(prev: ChartCandle[], next: ChartCandle[]): boolean {
  if (next.length <= prev.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (!sameChartCandle(prev[i], next[i])) return false;
  }
  return true;
}

function isLastPointUpdate(prev: ChartLinePoint[], next: ChartLinePoint[]): boolean {
  if (!prev.length || next.length !== prev.length) return false;
  for (let i = 0; i < prev.length - 1; i += 1) {
    if (prev[i].time !== next[i].time || prev[i].value !== next[i].value) return false;
  }
  return prev[prev.length - 1].time === next[next.length - 1].time;
}

/**
 * Put the newest bar on the right border.
 * Mouse pan and wheel keep their zoom until the next socket tick, which snaps back here.
 * The library applies a new bar on a later frame and can undo a same-turn scroll,
 * so the pin is repeated after that frame.
 */
function pinLatestBar(chart: IChartApi, isAlive: () => boolean): void {
  const pin = () => {
    if (!isAlive()) return;
    chart.timeScale().scrollToPosition(0, false);
  };
  pin();
  requestAnimationFrame(() => {
    requestAnimationFrame(pin);
  });
}

function isAppendPoint(prev: ChartLinePoint[], next: ChartLinePoint[]): boolean {
  if (next.length !== prev.length + 1) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i].time !== next[i].time || prev[i].value !== next[i].value) return false;
  }
  return true;
}

function renderTooltip(
  tooltip: HTMLDivElement,
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  probability: boolean
) {
  const rising = close >= open;
  const change = close - open;
  const changePct = open !== 0 ? (change / open) * 100 : 0;
  const tone = rising ? "ohlcv-tooltip-up" : "ohlcv-tooltip-down";
  const sign = rising ? "+" : "";

  tooltip.innerHTML = `
    <div class="ohlcv-tooltip-time">${formatGmt(time * 1000, true)}</div>
    <div class="ohlcv-tooltip-grid">
      <div class="ohlcv-tooltip-row"><span class="ohlcv-tooltip-key">O</span><span class="ohlcv-tooltip-val">${formatPrice(open, probability, 2)}</span></div>
      <div class="ohlcv-tooltip-row"><span class="ohlcv-tooltip-key">H</span><span class="ohlcv-tooltip-val">${formatPrice(high, probability, 2)}</span></div>
      <div class="ohlcv-tooltip-row"><span class="ohlcv-tooltip-key">L</span><span class="ohlcv-tooltip-val">${formatPrice(low, probability, 2)}</span></div>
      <div class="ohlcv-tooltip-row"><span class="ohlcv-tooltip-key">C</span><span class="ohlcv-tooltip-val ${tone}">${formatPrice(close, probability, 2)}</span></div>
      <div class="ohlcv-tooltip-row"><span class="ohlcv-tooltip-key">V</span><span class="ohlcv-tooltip-val">${formatVolume(volume)}</span></div>
    </div>
    <div class="ohlcv-tooltip-change ${tone}">${sign}${formatPrice(change, probability, 2)} (${sign}${changePct.toFixed(2)}%)</div>
  `;
}

function placeTooltip(tooltip: HTMLDivElement, wrapper: HTMLElement, x: number, y: number) {
  tooltip.style.display = "block";
  const pad = 8;
  const maxLeft = wrapper.clientWidth - tooltip.offsetWidth - pad;
  const maxTop = wrapper.clientHeight - tooltip.offsetHeight - pad;
  tooltip.style.left = `${Math.max(pad, Math.min(x + 14, maxLeft))}px`;
  tooltip.style.top = `${Math.max(pad, Math.min(y - tooltip.offsetHeight - 10, maxTop))}px`;
}

export function createOhlcvChart(
  container: HTMLElement,
  wrapper: HTMLElement,
  height: number
): OhlcvChartHandle {
  const theme = readTheme();
  const chart = createChart(container, {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.text,
      fontFamily: theme.fontFamily,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid },
    },
    rightPriceScale: { borderColor: theme.border },
    localization: {
      priceFormatter: (price: number) => formatScalePrice(price, true),
      timeFormatter: (time: Time) => {
        const seconds = timeToSeconds(time);
        return seconds == null ? "" : formatGmt(seconds * 1000, true);
      },
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 0,
      shiftVisibleRangeOnNewBar: true,
      tickMarkFormatter: (time: Time, tickMarkType: number) => {
        const seconds = timeToSeconds(time);
        if (seconds == null) return "";
        if (tickMarkType <= 2) return formatGmt(seconds * 1000, false);
        return formatAxis(seconds * 1000);
      },
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: {
        color: withAlpha(theme.crosshair, "88"),
        style: 2,
        labelVisible: true,
        labelBackgroundColor: theme.border,
      },
      horzLine: {
        color: withAlpha(theme.crosshair, "88"),
        style: 2,
        labelVisible: true,
        labelBackgroundColor: theme.border,
      },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  });

  const candleSeries: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
    upColor: theme.up,
    downColor: theme.down,
    borderUpColor: theme.up,
    borderDownColor: theme.down,
    wickUpColor: theme.up,
    wickDownColor: theme.down,
  });

  const volumeSeries: ISeriesApi<"Histogram"> = chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
  });

  chart.priceScale("volume").applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 },
  });

  candleSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.28 },
  });

  if (getComputedStyle(wrapper).position === "static") {
    wrapper.style.position = "relative";
  }

  const tooltip = document.createElement("div");
  tooltip.className = "ohlcv-tooltip";
  tooltip.setAttribute("role", "tooltip");
  wrapper.appendChild(tooltip);

  let alive = true;
  let probability = true;
  const candleByTime = new Map<number, NormalizedCandle>();
  let lastChartCandles: ChartCandle[] = [];

  const onCrosshair = (param: MouseEventParams) => {
    if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
      tooltip.style.display = "none";
      return;
    }

    const seconds = timeToSeconds(param.time);
    const candle = param.seriesData.get(candleSeries) as ChartCandle | undefined;
    if (seconds == null || !candle) {
      tooltip.style.display = "none";
      return;
    }

    const volume = param.seriesData.get(volumeSeries) as ChartVolume | undefined;
    const row = candleByTime.get(seconds);
    renderTooltip(
      tooltip,
      seconds,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      volume?.value ?? row?.volume ?? 0,
      probability
    );
    placeTooltip(tooltip, wrapper, param.point.x, param.point.y);
  };

  chart.subscribeCrosshairMove(onCrosshair);

  const applyProbabilityFormat = (rows: NormalizedCandle[]) => {
    probability = candlesLookLikeProbability(rows);
    chart.applyOptions({
      localization: {
        priceFormatter: (price: number) => formatScalePrice(price, probability),
        timeFormatter: (time: Time) => {
          const seconds = timeToSeconds(time);
          return seconds == null ? "" : formatGmt(seconds * 1000, true);
        },
      },
    });
  };

  return {
    setCandles(rows, options = {}) {
      const fit = options.fit === true;
      applyProbabilityFormat(rows);

      candleByTime.clear();
      for (const row of rows) candleByTime.set(row.time, row);

      const chartCandles = toChartCandles(rows);
      const volumeBars = toVolumeBars(rows, theme.up, theme.down);
      const lastCandle = chartCandles[chartCandles.length - 1];
      const lastVolume = volumeBars[volumeBars.length - 1];

      if (
        !fit &&
        lastCandle != null &&
        lastVolume != null &&
        isLastCandleUpdate(lastChartCandles, chartCandles)
      ) {
        candleSeries.update(lastCandle);
        volumeSeries.update(lastVolume);
      } else if (!fit && isAppendCandles(lastChartCandles, chartCandles)) {
        for (let i = lastChartCandles.length; i < chartCandles.length; i += 1) {
          candleSeries.update(chartCandles[i]);
          volumeSeries.update(volumeBars[i]);
        }
      } else {
        candleSeries.setData(chartCandles);
        volumeSeries.setData(volumeBars);
      }

      lastChartCandles = chartCandles;
      if (fit) chart.timeScale().fitContent();
    },

    // Slow lane — immutable completed history only.
    setHistory(rows, options = {}) {
      const fit = options.fit === true;
      const timeScale = chart.timeScale();
      // setData() resets the time scale. Keep the user's zoom (bar spacing)
      // and the window they were looking at.
      const visibleRange = fit ? null : timeScale.getVisibleLogicalRange();
      const barSpacing = fit ? null : timeScale.options().barSpacing;
      applyProbabilityFormat(rows);

      candleByTime.clear();
      for (const row of rows) candleByTime.set(row.time, row);

      const chartCandles = toChartCandles(rows);
      candleSeries.setData(chartCandles);
      volumeSeries.setData(toVolumeBars(rows, theme.up, theme.down));
      lastChartCandles = chartCandles;

      if (fit) {
        timeScale.fitContent();
      } else {
        if (barSpacing != null && Number.isFinite(barSpacing)) {
          timeScale.applyOptions({ barSpacing });
        }
        if (visibleRange) {
          timeScale.setVisibleLogicalRange(visibleRange);
        }
      }
    },

    // Fast lane — O(1) trailing candle patch. Each socket tick pins the open candle to the right edge.
    updateLive(row) {
      candleByTime.set(row.time, row);
      const [candle] = toChartCandles([row]);
      if (!candle) return;
      candleSeries.update(candle);
      const [volume] = toVolumeBars([row], theme.up, theme.down);
      if (volume) volumeSeries.update(volume);

      // Keep lastChartCandles in sync so a later setCandles patch still works.
      if (
        lastChartCandles.length &&
        lastChartCandles[lastChartCandles.length - 1].time === candle.time
      ) {
        lastChartCandles = [...lastChartCandles.slice(0, -1), candle];
      } else if (
        !lastChartCandles.length ||
        (lastChartCandles[lastChartCandles.length - 1].time as number) < (candle.time as number)
      ) {
        lastChartCandles = [...lastChartCandles, candle];
      }
      pinLatestBar(chart, () => alive);
    },

    resize(width, nextHeight) {
      chart.applyOptions({ width, height: nextHeight });
    },
    destroy() {
      alive = false;
      chart.unsubscribeCrosshairMove(onCrosshair);
      tooltip.remove();
      chart.remove();
    },
  };
}

function toLineData(points: LinePoint[]): ChartLinePoint[] {
  return points.map((point) => ({
    time: point.time as UTCTimestamp,
    value: point.value,
  }));
}

export function createLineChart(
  container: HTMLElement,
  wrapper: HTMLElement,
  height: number
): LineChartHandle {
  const theme = readTheme();
  const chart = createChart(container, {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.text,
      fontFamily: theme.fontFamily,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid },
    },
    rightPriceScale: { borderColor: theme.border },
    localization: {
      priceFormatter: (price: number) => formatScalePrice(price, true),
      timeFormatter: (time: Time) => {
        const seconds = timeToSeconds(time);
        return seconds == null ? "" : formatGmt(seconds * 1000, true);
      },
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 0,
      shiftVisibleRangeOnNewBar: true,
      tickMarkFormatter: (time: Time, tickMarkType: number) => {
        const seconds = timeToSeconds(time);
        if (seconds == null) return "";
        if (tickMarkType <= 2) return formatGmt(seconds * 1000, false);
        return formatAxis(seconds * 1000);
      },
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: {
        color: withAlpha(theme.crosshair, "88"),
        style: 2,
        labelVisible: true,
        labelBackgroundColor: theme.border,
      },
      horzLine: {
        color: withAlpha(theme.crosshair, "88"),
        style: 2,
        labelVisible: true,
        labelBackgroundColor: theme.border,
      },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  });

  const lineSeries = chart.addLineSeries({
    color: theme.crosshair,
    lineWidth: 2,
    priceLineVisible: true,
    lastValueVisible: true,
    crosshairMarkerVisible: true,
  });

  if (getComputedStyle(wrapper).position === "static") {
    wrapper.style.position = "relative";
  }

  const tooltip = document.createElement("div");
  tooltip.className = "ohlcv-tooltip";
  tooltip.setAttribute("role", "tooltip");
  wrapper.appendChild(tooltip);

  let probability = true;
  let lastPoints: ChartLinePoint[] = [];

  const onCrosshair = (param: MouseEventParams) => {
    if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
      tooltip.style.display = "none";
      return;
    }

    const seconds = timeToSeconds(param.time);
    const point = param.seriesData.get(lineSeries) as ChartLinePoint | undefined;
    if (seconds == null || !point) {
      tooltip.style.display = "none";
      return;
    }

    tooltip.innerHTML = `
      <div class="ohlcv-tooltip-time">${formatGmt(seconds * 1000, true)}</div>
      <div class="ohlcv-tooltip-row">
        <span class="ohlcv-tooltip-key">Price</span>
        <span class="ohlcv-tooltip-val">${formatPrice(point.value, probability, 2)}</span>
      </div>
    `;
    placeTooltip(tooltip, wrapper, param.point.x, param.point.y);
  };

  chart.subscribeCrosshairMove(onCrosshair);

  return {
    setPoints(points, options = {}) {
      const fit = options.fit === true;
      probability = points.length === 0 || points.every((point) => point.value >= 0 && point.value <= 1.5);
      chart.applyOptions({
        localization: {
          priceFormatter: (price: number) => formatScalePrice(price, probability),
          timeFormatter: (time: Time) => {
            const seconds = timeToSeconds(time);
            return seconds == null ? "" : formatGmt(seconds * 1000, true);
          },
        },
      });

      const chartPoints = toLineData(points);
      const last = chartPoints[chartPoints.length - 1];
      const canPatch =
        !fit &&
        last != null &&
        (isLastPointUpdate(lastPoints, chartPoints) || isAppendPoint(lastPoints, chartPoints));

      if (canPatch) {
        lineSeries.update(last);
      } else {
        lineSeries.setData(chartPoints);
      }

      lastPoints = chartPoints;
      if (fit) chart.timeScale().fitContent();
    },
    resize(width, nextHeight) {
      chart.applyOptions({ width, height: nextHeight });
    },
    destroy() {
      chart.unsubscribeCrosshairMove(onCrosshair);
      tooltip.remove();
      chart.remove();
    },
  };
}

/** Multi-outcome line chart. Live tips are one point per second, so the axis shows seconds. */
export function createMultiLineChart(
  container: HTMLElement,
  height: number
): MultiLineChartHandle {
  const theme = readTheme();
  const chart = createChart(container, {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.text,
      fontFamily: theme.fontFamily,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid },
    },
    rightPriceScale: { borderColor: theme.border },
    localization: {
      priceFormatter: (price: number) => formatScalePrice(price, true),
      timeFormatter: (time: Time) => {
        const seconds = timeToSeconds(time);
        return seconds == null ? "" : formatGmt(seconds * 1000, true);
      },
    },
    timeScale: {
      borderColor: theme.border,
      timeVisible: true,
      secondsVisible: true,
      rightOffset: 0,
      shiftVisibleRangeOnNewBar: true,
      tickMarkFormatter: (time: Time, tickMarkType: number) => {
        const seconds = timeToSeconds(time);
        if (seconds == null) return "";
        if (tickMarkType <= 2) return formatGmt(seconds * 1000, false);
        return formatAxis(seconds * 1000, tickMarkType >= 4);
      },
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: {
        color: withAlpha(theme.crosshair, "88"),
        style: 2,
        labelVisible: true,
        labelBackgroundColor: theme.border,
      },
      horzLine: {
        color: withAlpha(theme.crosshair, "88"),
        style: 2,
        labelVisible: true,
        labelBackgroundColor: theme.border,
      },
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  });

  const seriesById = new Map<number, ISeriesApi<"Line">>();
  const pointsById = new Map<number, ChartLinePoint[]>();
  let alive = true;

  return {
    setLines(lines, options = {}) {
      const fit = options.fit === true;
      const scale = chart.timeScale();
      const nextIds = new Set(lines.map((line) => line.id));

      for (const [id, series] of seriesById) {
        if (!nextIds.has(id)) {
          chart.removeSeries(series);
          seriesById.delete(id);
          pointsById.delete(id);
        }
      }

      for (const line of lines) {
        let series = seriesById.get(line.id);
        const chartPoints = toLineData(line.points);

        if (!series) {
          series = chart.addLineSeries({
            color: line.color,
            lineWidth: 2,
            title: line.label,
            priceLineVisible: false,
            lastValueVisible: true,
          });
          seriesById.set(line.id, series);
          series.setData(chartPoints);
          pointsById.set(line.id, chartPoints);
          continue;
        }

        series.applyOptions({ color: line.color, title: line.label });
        const prev = pointsById.get(line.id) ?? [];
        const last = chartPoints[chartPoints.length - 1];
        if (!last) {
          series.setData([]);
          pointsById.set(line.id, []);
          continue;
        }

        if (isLastPointUpdate(prev, chartPoints) || isAppendPoint(prev, chartPoints)) {
          series.update(last);
        } else {
          series.setData(chartPoints);
        }
        pointsById.set(line.id, chartPoints);
      }

      const hasPoints = lines.some((line) => line.points.length > 0);
      // A fitted series hides new ticks: every point stays on screen, so the edge never moves.
      // The first view uses a fixed bar width and sits on the newest point. Later ticks keep
      // the mouse zoom and only pull that newest point back to the right border.
      if (fit) scale.applyOptions({ barSpacing: 8, rightOffset: 0 });
      if (hasPoints) pinLatestBar(chart, () => alive);
    },
    resize(width, nextHeight) {
      chart.applyOptions({ width, height: nextHeight });
    },
    destroy() {
      alive = false;
      chart.remove();
    },
  };
}
