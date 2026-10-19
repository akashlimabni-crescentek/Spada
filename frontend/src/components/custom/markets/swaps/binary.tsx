// components/BinaryPrice.tsx
export function BinaryPrice({
  outcomeALabel,
  outcomeBLabel,
  outcomeAPrice,
  outcomeBPrice,
}: {
  outcomeALabel: string;
  outcomeBLabel: string;
  outcomeAPrice: number;
  outcomeBPrice: number;
}) {
  return (
    <div className="flex flex-row gap-2">
      <div className="flex-1 bg-inset rounded-md px-2 py-1 text-center hover:bg-raised transition-colors">
        <span className="t-label text-positive block truncate">{outcomeALabel}</span>
        <span className="n-lg text-positive">{Math.round(outcomeAPrice * 100)}¢</span>
      </div>
      <div className="flex-1 bg-inset rounded-md px-2 py-1 text-center hover:bg-raised transition-colors">
        <span className="t-label text-negative block truncate">{outcomeBLabel}</span>
        <span className="n-lg text-negative">{Math.round(outcomeBPrice * 100)}¢</span>
      </div>
    </div>
  );
}