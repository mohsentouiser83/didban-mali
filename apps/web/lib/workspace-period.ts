import type { Period } from "./api";

export function resolveWorkspacePeriod(
  periods: Period[],
  savedId: string,
  today: string,
): string {
  if (periods.some((period) => period.id === savedId)) return savedId;
  const newestFirst = [...periods].sort(
    (a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id),
  );
  return (
    newestFirst.find((period) => period.start <= today && today <= period.end)?.id ||
    newestFirst[0]?.id ||
    ""
  );
}
