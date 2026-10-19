// src/components/custom/markets/MarketActionBar.tsx
"use client";

import { useState, useRef } from "react";
import { ExternalLink, Share2, Copy, Download, Check } from "lucide-react";
import type { Market } from "@/types/market";

interface MarketActionBarProps {
    market: Market;
}

function getExternalUrl(market: Market): string {
    return market.market_url;
}

/**
 * Genuine Yes/No binary markets only.
 * Multi-outcome / categorical events often still carry yes_price/no_price from the
 * first two outcomes — those must not be shown as Yes/No in the action bar.
 */
function isBinaryYesNoMarket(market: Market): boolean {
    if (market.outcome_type === "binary") return true;

    const outcomes = market.outcomes ?? [];
    if (outcomes.length !== 2) return false;

    const [a, b] = outcomes.map((o) => o.trim().toLowerCase());
    return (a === "yes" && b === "no") || (a === "no" && b === "yes");
}

function binaryYesNoPercents(market: Market): { yes: number; no: number } | null {
    if (!isBinaryYesNoMarket(market)) return null;
    if (!Number.isFinite(market.yes_price) || !Number.isFinite(market.no_price)) return null;
    return {
        yes: Math.round(market.yes_price * 100),
        no: Math.round(market.no_price * 100),
    };
}

function sharePriceSuffix(market: Market): string {
    const percents = binaryYesNoPercents(market);
    if (!percents) return "";
    return ` — Yes ${percents.yes}% / No ${percents.no}%`;
}

// Draws a 1080x1080 shareable card onto a canvas and returns it as a PNG blob
async function generateShareImage(market: Market): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d")!;

    // Background
    ctx.fillStyle = "#0B0D11";
    ctx.fillRect(0, 0, 1080, 1080);

    // Card panel
    ctx.fillStyle = "#12151B";
    ctx.fillRect(60, 60, 960, 960);
    ctx.strokeStyle = "#232833";
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 60, 960, 960);

    // Wordmark
    ctx.fillStyle = "#E8EAEE";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText("SPADA", 110, 160);

    // Category pill
    ctx.fillStyle = "#8B93A1";
    ctx.font = "24px sans-serif";
    ctx.fillText((market.category ?? "").toUpperCase(), 110, 220);

    // Title — wrapped manually across up to 4 lines
    ctx.fillStyle = "#E8EAEE";
    ctx.font = "bold 52px sans-serif";
    const words = market.title.split(" ");
    let line = "";
    let y = 320;
    const maxWidth = 860;
    for (const word of words) {
        const test = line + word + " ";
        if (ctx.measureText(test).width > maxWidth && line !== "") {
            ctx.fillText(line.trim(), 110, y);
            line = word + " ";
            y += 64;
        } else {
            line = test;
        }
    }
    ctx.fillText(line.trim(), 110, y);

    // Yes / No prices — only for genuine binary Yes/No markets
    const percents = binaryYesNoPercents(market);
    if (percents) {
        const priceY = y + 160;
        ctx.font = "bold 90px monospace";
        ctx.fillStyle = "#3FCF8E";
        ctx.fillText(`YES ${percents.yes}%`, 110, priceY);
        ctx.fillStyle = "#E5645B";
        ctx.fillText(`NO ${percents.no}%`, 110, priceY + 110);
    }

    // Footer — platform + volume
    ctx.fillStyle = "#5D6472";
    ctx.font = "28px sans-serif";
    ctx.fillText(
        `${market.platform.toUpperCase()} · $${market.volume.toLocaleString("en-us", { maximumFractionDigits: 0 })} volume`,
        110,
        960
    );

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), "image/png");
    });
}

export function MarketActionBar({ market }: MarketActionBarProps) {
    const [shareOpen, setShareOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [generating, setGenerating] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const binaryPercents = binaryYesNoPercents(market);

    async function handleDownloadImage() {
        setGenerating(true);
        try {
            const blob = await generateShareImage(market);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${market.canonical_id}.png`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setGenerating(false);
        }
    }

    async function handleNativeShare() {
        setGenerating(true);
        try {
            const blob = await generateShareImage(market);
            const file = new File([blob], `${market.canonical_id}.png`, { type: "image/png" });

            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: market.title,
                    text: `${market.title}${sharePriceSuffix(market)}`,
                });
            } else {
                // Fallback for browsers without file-sharing support (most desktop browsers)
                await handleDownloadImage();
            }
        } finally {
            setGenerating(false);
            setShareOpen(false);
        }
    }

    function handleCopyLink() {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    function handleTwitterShare() {
        const text = encodeURIComponent(`${market.title}${sharePriceSuffix(market)}`);
        const url = encodeURIComponent(window.location.href);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
    }


    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-1/2 md:bottom-6 z-40 rounded-xl border border-border bg-sidebar shadow-lg">
            <div className="flex items-center gap-3 px-4 py-3 md:px-10 min-w-0">
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="t-ui truncate">{market.title}</span>
                    <div className="flex items-center gap-3">
                        {binaryPercents ? (
                            <>
                                <span className="n-sm text-positive">Yes {binaryPercents.yes}%</span>
                                <span className="n-sm text-negative">No {binaryPercents.no}%</span>
                            </>
                        ) : null}
                        <span className="n-sm text-text-dim">
                            ${market.volume.toLocaleString("en-us", { maximumFractionDigits: 0 })} vol
                        </span>
                    </div>
                </div>

                <div className="relative flex items-center gap-2 shrink-0">
                    {/* Share button + dropdown */}
                    <button
                        type="button"
                        onClick={() => setShareOpen((v) => !v)}
                        className="flex items-center justify-center h-9 w-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-border-hover transition-colors"
                        aria-label="Share"
                    >
                        <Share2 className="h-4 w-4" />
                    </button>

                    {shareOpen && (
                        <div
                            ref={menuRef}
                            className="absolute bottom-12 right-0 w-56 rounded-lg border border-border bg-card shadow-lg p-2 flex flex-col gap-1"
                        >
                            <button
                                onClick={handleNativeShare}
                                disabled={generating}
                                className="flex items-center gap-2 t-ui px-3 py-2 rounded-md hover:bg-raised text-left disabled:opacity-50"
                            >
                                <Share2 className="h-4 w-4" />
                                {generating ? "Generating…" : "Share image…"}
                            </button>
                            <button
                                onClick={handleTwitterShare}
                                className="flex items-center gap-2 t-ui px-3 py-2 rounded-md hover:bg-raised text-left"
                            >
                                <span className="h-4 w-4 flex items-center justify-center text-xs font-bold">𝕏</span>
                                Share text on X
                            </button>
                            <button
                                onClick={handleDownloadImage}
                                disabled={generating}
                                className="flex items-center gap-2 t-ui px-3 py-2 rounded-md hover:bg-raised text-left disabled:opacity-50"
                            >
                                <Download className="h-4 w-4" />
                                Download image
                            </button>
                            <button
                                onClick={handleCopyLink}
                                className="flex items-center gap-2 t-ui px-3 py-2 rounded-md hover:bg-raised text-left"
                            >
                                {copied ? <Check className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
                                {copied ? "Copied!" : "Copy link"}
                            </button>
                        </div>
                    )}

                    {/* Trade button — outlined pill, matches screenshot style */}
                    <a
                        href={getExternalUrl(market)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 t-label px-4 py-2.5 rounded-md border whitespace-nowrap transition-colors ${market.platform === "polymarket"
                                ? "border-[#3B5FE3] text-[#3B5FE3] hover:bg-[#3B5FE3] hover:text-white"
                                : "border-[#1DB876] text-[#1DB876] hover:bg-[#1DB876] hover:text-white"
                            }`}
                    >
                        TRADE ON {market.platform.toUpperCase()}
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </div>
            </div>
        </div>
    );
}