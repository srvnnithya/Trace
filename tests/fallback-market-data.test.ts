import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyProviderFreshness,
  effectiveFreshnessStatus,
  isIndianCashMarketOpen,
  parseTwelveDataQuote,
  parseYfinanceQuote,
  providerPriceDifference,
  providerPricesConflict,
} from '../lib/fallback-market-data';

void test('parses a Twelve Data NSE quote with source metadata', () => {
  const parsed = parseTwelveDataQuote({
    close: '712.10',
    volume: '14488024',
    percent_change: '1.25',
    timestamp: 1_788_457_800,
    is_market_open: true,
    fifty_two_week: { high: '720.00', low: '540.50' },
  });
  assert.equal(parsed.provider, 'Twelve Data');
  assert.equal(parsed.quote.price, 712.1);
  assert.equal(parsed.quote.dayReturn, 0.0125);
  assert.equal(parsed.quote.high52w, 720);
  assert.equal(parsed.isMarketOpen, true);
});

void test('parses yfinance history metrics for the attention engine', () => {
  const parsed = parseYfinanceQuote({
    price: 712.1,
    volume: 14_488_024,
    day_return: 0.012,
    source_timestamp: '2026-09-04T00:00:00+05:30',
    high_52w: 720,
    low_52w: 540,
    average_volume_20d: 10_000_000,
    normal_daily_volatility: 0.013,
    price_path: [690, 700, 712.1],
    is_market_open: false,
  });
  assert.equal(parsed.provider, 'Yahoo Finance');
  assert.equal(parsed.history?.averageVolume20d, 10_000_000);
  assert.deepEqual(parsed.history?.pricePath, [690, 700, 712.1]);
});

void test('a recent closing quote is delayed, not stale, outside market hours', () => {
  const receivedAt = new Date('2026-09-05T09:00:00.000Z');
  assert.equal(
    classifyProviderFreshness('2026-09-04T10:00:00.000Z', false, receivedAt),
    'DELAYED',
  );
});

void test('an old closing quote is still marked stale', () => {
  const receivedAt = new Date('2026-09-10T09:00:00.000Z');
  assert.equal(
    classifyProviderFreshness('2026-09-04T10:00:00.000Z', false, receivedAt),
    'STALE',
  );
});

void test('Indian cash-market hours are evaluated in Asia/Kolkata', () => {
  assert.equal(
    isIndianCashMarketOpen(new Date('2026-09-04T05:00:00.000Z')),
    true,
  );
  assert.equal(
    isIndianCashMarketOpen(new Date('2026-09-04T12:00:00.000Z')),
    false,
  );
  assert.equal(
    isIndianCashMarketOpen(new Date('2026-09-05T05:00:00.000Z')),
    false,
  );
});

void test('stored live labels decay and closing quotes do not become stale overnight', () => {
  assert.equal(
    effectiveFreshnessStatus(
      'LIVE',
      '2026-09-04T10:00:00.000Z',
      'NSE',
      new Date('2026-09-05T05:00:00.000Z'),
    ),
    'DELAYED',
  );
  assert.equal(
    effectiveFreshnessStatus(
      'LIVE',
      '2026-09-01T10:00:00.000Z',
      'NSE',
      new Date('2026-09-06T05:00:00.000Z'),
    ),
    'STALE',
  );
});

void test('provider conflicts use the documented 0.8% tolerance', () => {
  assert.equal(providerPricesConflict(100, 100.7), false);
  assert.equal(providerPricesConflict(100, 101), true);
  assert.ok(
    Math.abs((providerPriceDifference(100, 103.2) ?? 0) - 0.032) < 1e-12,
  );
  assert.equal(providerPricesConflict(100, null), false);
});
