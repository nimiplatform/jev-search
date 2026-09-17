/** Analytics must never change the outcome of a search or result click. */
export function writeAnalytics(
  dataset: Pick<AnalyticsEngineDataset, 'writeDataPoint'> | undefined,
  point: AnalyticsEngineDataPoint
): boolean {
  if (!dataset) return false;
  try {
    dataset.writeDataPoint(point);
    return true;
  } catch {
    console.warn('[analytics] Failed to write data point');
    return false;
  }
}
