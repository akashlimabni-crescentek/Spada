// src/components/custom/markets/AiSummaryCard.tsx
"use client";

import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Market } from "@/types/market";

interface AiSummaryCardProps {
  market: Market;
}

function sentimentColor(label: string | null): string {
  switch (label?.toLowerCase()) {
    case "bullish":
    case "positive":
      return "text-positive bg-positive-soft";
    case "bearish":
    case "negative":
      return "text-negative bg-negative-soft";
    case "neutral":
      return "text-warning bg-warning-soft";
    default:
      return "text-muted-foreground bg-raised";
  }
}

export function AiSummaryCard({ market }: AiSummaryCardProps) {
  if (!market.ai_summary) {
    return (
      <Card className="p-4 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="t-h3">AI Summary</h3>
        </div>
        <span className="t-meta text-dim">No AI summary available for this market yet.</span>
      </Card>
    );
  }

  return (
    <Card className="p-4 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="t-h3">AI Summary</h3>
        </div>

        {market.ai_sentiment_label && (
          <span className={`t-label px-2 py-0.5 rounded-md ${sentimentColor(market.ai_sentiment_label)}`}>
            {market.ai_sentiment_label}
          </span>
        )}
      </div>

      <p className="t-body">{market.ai_summary}</p>

      {market.ai_last_updated && (
        <span className="t-meta text-dim mt-3 block">
          Updated {new Date(market.ai_last_updated).toLocaleDateString("en-us", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      )}
    </Card>
  );
}