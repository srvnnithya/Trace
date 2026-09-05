export type ImportedWatchlistItem = {
  symbol: string;
  pinned: boolean;
  priceThreshold: number | null;
  volumeThreshold: number | null;
};

export type NormalizedWatchlistImport = {
  name: string;
  benchmarkSymbol: string;
  priceThreshold: number;
  volumeThreshold: number;
  items: ImportedWatchlistItem[];
};

export function normalizeWatchlistImport(
  payload: unknown,
): NormalizedWatchlistImport {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Import file is not a valid TRACE watchlist.');
  }
  const record = payload as Record<string, unknown>;
  const name =
    typeof record.name === 'string' ? record.name.trim().slice(0, 60) : '';
  if (!name) throw new Error('Imported watchlist needs a name.');
  if (!Array.isArray(record.items) || !record.items.length) {
    throw new Error('Imported watchlist has no stocks.');
  }
  if (record.items.length > 100) {
    throw new Error('Import supports up to 100 stocks at a time.');
  }
  const seen = new Set<string>();
  const items: ImportedWatchlistItem[] = [];
  for (const rawItem of record.items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const symbol =
      typeof item.symbol === 'string'
        ? item.symbol.trim().toUpperCase().slice(0, 32)
        : '';
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const rawPrice = Number(item.priceThreshold);
    const rawVolume = Number(item.volumeThreshold);
    items.push({
      symbol,
      pinned: item.pinned === true,
      priceThreshold:
        Number.isFinite(rawPrice) && rawPrice >= 0.005 && rawPrice <= 0.2
          ? rawPrice
          : null,
      volumeThreshold:
        Number.isFinite(rawVolume) && rawVolume >= 1 && rawVolume <= 10
          ? rawVolume
          : null,
    });
  }
  if (!items.length) throw new Error('Imported watchlist has no valid stocks.');
  const rawListPrice = Number(record.priceThreshold);
  const rawListVolume = Number(record.volumeThreshold);
  return {
    name,
    benchmarkSymbol:
      typeof record.benchmarkSymbol === 'string' &&
      record.benchmarkSymbol.trim()
        ? record.benchmarkSymbol.trim().slice(0, 40)
        : 'NIFTY 50',
    priceThreshold:
      Number.isFinite(rawListPrice) &&
      rawListPrice >= 0.005 &&
      rawListPrice <= 0.2
        ? rawListPrice
        : 0.02,
    volumeThreshold:
      Number.isFinite(rawListVolume) &&
      rawListVolume >= 1 &&
      rawListVolume <= 10
        ? rawListVolume
        : 2,
    items,
  };
}
