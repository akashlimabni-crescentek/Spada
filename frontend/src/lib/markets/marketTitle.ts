/**
 * Safe display title for the single-market page heading.
 * Returns null when there is nothing meaningful to show.
 */
export function resolveMarketTitle(
  title: string | null | undefined
): string | null {
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}
