// function that calculates time remianing based off provided tiem from api.

export function getTimeRemaining(closeTime: string) {
  const diffMs = new Date(closeTime).getTime() - Date.now();

  if (diffMs <= 0) return "Closed";

  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  if (minutes > 0) return `${minutes}m left`;
  return "<1m left";
}