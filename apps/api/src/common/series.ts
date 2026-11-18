export interface ChartPoint {
  label: string;
  value: number;
}

export interface MonthBucket {
  key: string;
  label: string;
}

/** The last `months` calendar months, oldest first, ready to feed a chart. */
export function monthBuckets(months = 6, now = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));

    buckets.push({
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date),
    });
  }

  return buckets;
}

export function monthlySeries(
  buckets: MonthBucket[],
  amounts: Array<{ issueDate: string; amount: number }>,
): ChartPoint[] {
  const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));

  for (const entry of amounts) {
    const key = entry.issueDate.slice(0, 7);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + entry.amount);
    }
  }

  return buckets.map((bucket) => ({ label: bucket.label, value: totals.get(bucket.key) ?? 0 }));
}
