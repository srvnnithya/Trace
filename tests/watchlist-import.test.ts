import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWatchlistImport } from '../lib/watchlist-import';

void test('watchlist imports are normalized and duplicate symbols are removed', () => {
  const imported = normalizeWatchlistImport({
    name: ' Shared ideas ',
    benchmarkSymbol: 'NIFTY 50',
    priceThreshold: 0.03,
    volumeThreshold: 2.5,
    items: [
      {
        symbol: ' infy ',
        pinned: true,
        priceThreshold: 0.04,
        volumeThreshold: 3,
      },
      { symbol: 'INFY' },
      { symbol: 'TCS', priceThreshold: 999, volumeThreshold: -1 },
    ],
  });
  assert.equal(imported.name, 'Shared ideas');
  assert.deepEqual(
    imported.items.map((item) => item.symbol),
    ['INFY', 'TCS'],
  );
  assert.equal(imported.items[0].pinned, true);
  assert.equal(imported.items[1].priceThreshold, null);
});

void test('empty imports are rejected', () => {
  assert.throws(
    () => normalizeWatchlistImport({ name: 'Empty', items: [] }),
    /no stocks/i,
  );
});

void test('imports larger than the supported batch are rejected', () => {
  assert.throws(
    () =>
      normalizeWatchlistImport({
        name: 'Too large',
        items: Array.from({ length: 101 }, (_, index) => ({
          symbol: `STOCK${index}`,
        })),
      }),
    /up to 100 stocks/i,
  );
});
