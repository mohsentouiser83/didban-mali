/** Exact decimal normalization for visual coordinates; monetary labels stay untouched. */
export type FinancialChartData = {
  paths: string[];
  points: { index: number; x: number; y: number }[];
  firstLabel: string;
  lastLabel: string;
};
function scaled(raw: string) {
  const negative = raw.startsWith("-"),
    [integer, fraction = ""] = raw.replace(/^-/, "").split(".");
  return (
    (BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, "0"))) *
    (negative ? -1n : 1n)
  );
}
export function createFinancialChartData(
  rows: { label: string; value: string | null }[],
): FinancialChartData {
  const values = rows.map((r) => (r.value === null ? null : scaled(r.value)));
  const valid = values.filter((v): v is bigint => v !== null);
  if (!valid.length)
    return {
      paths: [],
      points: [],
      firstLabel: rows[0]?.label ?? "",
      lastLabel: rows.at(-1)?.label ?? "",
    };
  let min = valid[0],
    max = valid[0];
  for (const value of valid) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const points: { index: number; x: number; y: number }[] = [],
    paths: string[] = [];
  let segment = "";
  values.forEach((value, index) => {
    if (value === null) {
      if (segment) paths.push(segment);
      segment = "";
      return;
    }
    const x = 52 + (index * 684) / Math.max(rows.length - 1, 1),
      y =
        max === min
          ? 109
          : 19 + Number(((max - value) * 18000n) / (max - min)) / 100;
    points.push({ index, x, y });
    segment += `${segment ? " L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  });
  if (segment) paths.push(segment);
  return {
    paths,
    points,
    firstLabel: rows[0]?.label ?? "",
    lastLabel: rows.at(-1)?.label ?? "",
  };
}
