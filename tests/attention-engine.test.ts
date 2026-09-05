import assert from 'node:assert/strict';
import test from 'node:test';
import { assessChange } from '../lib/attention-engine';

const normal = {
  currentPrice: 102,
  baselinePrice: 100,
  volume: 1_100_000,
  averageVolume20d: 1_000_000,
  benchmarkReturn: 0.01,
  normalDailyVolatility: 0.02,
  high52w: 140,
  low52w: 70,
  eventTitle: null,
  freshnessStatus: 'LIVE' as const,
  confidenceStatus: 'HIGH',
  priceThreshold: 0.03,
  volumeThreshold: 2,
};

void test('attention scores always stay between 0 and 100', () => {
  const result = assessChange({
    ...normal,
    currentPrice: 200,
    volume: 50_000_000,
  });
  assert.ok(result.score >= 0 && result.score <= 100);
});

void test('a quiet stock cannot outrank a genuinely unusual move', () => {
  const quiet = assessChange(normal);
  const unusual = assessChange({
    ...normal,
    currentPrice: 108,
    volume: 3_500_000,
    benchmarkReturn: 0,
  });
  assert.ok(unusual.score > quiet.score);
  assert.equal(unusual.priority, 'needs_attention');
});

void test('stale data cannot be treated like live data', () => {
  const live = assessChange({
    ...normal,
    currentPrice: 108,
    volume: 3_500_000,
  });
  const stale = assessChange({
    ...normal,
    currentPrice: 108,
    volume: 3_500_000,
    freshnessStatus: 'STALE',
  });
  assert.ok(stale.score < live.score);
  assert.ok(stale.explanations.some((line) => line.includes('stale')));
});

void test('conflicting provider data is visibly reflected in the explanation', () => {
  const result = assessChange({
    ...normal,
    currentPrice: 108,
    volume: 3_500_000,
    freshnessStatus: 'CONFLICTED',
  });
  assert.ok(result.explanations.some((line) => line.includes('conflicted')));
});

void test('a missing baseline produces a safe first-checkpoint state', () => {
  const result = assessChange({ ...normal, baselinePrice: null });
  assert.equal(result.priority, 'quiet');
  assert.equal(result.returnSinceSeen, null);
  assert.match(result.headline, /first checkpoint/i);
});

void test('relative performance changes meaning even for the same absolute return', () => {
  const sectorMove = assessChange({
    ...normal,
    currentPrice: 104,
    benchmarkReturn: 0.038,
  });
  const stockSpecific = assessChange({
    ...normal,
    currentPrice: 104,
    benchmarkReturn: -0.005,
  });
  assert.ok(stockSpecific.score > sectorMove.score);
});

void test('personal volume threshold changes whether the rule matches', () => {
  const sensitive = assessChange({
    ...normal,
    volume: 1_800_000,
    volumeThreshold: 1.5,
  });
  const relaxed = assessChange({
    ...normal,
    volume: 1_800_000,
    volumeThreshold: 2.5,
  });
  assert.ok(sensitive.score >= relaxed.score);
  assert.ok(
    sensitive.components.some((component) => component.key === 'personal'),
  );
});

void test('scoring is deterministic for the same snapshots', () => {
  assert.deepEqual(assessChange(normal), assessChange(normal));
});

void test('a stored corporate event contributes context and is marked expected', () => {
  const result = assessChange({
    ...normal,
    currentPrice: 106,
    eventTitle: 'Quarterly results released',
  });
  assert.equal(result.expected, true);
  assert.ok(result.components.some((component) => component.key === 'event'));
  assert.match(result.headline, /event-driven/i);
});

void test('crossing a 52-week boundary adds the level component', () => {
  const result = assessChange({ ...normal, currentPrice: 141 });
  assert.ok(result.components.some((component) => component.key === 'level'));
  assert.ok(result.explanations.some((line) => /52-week high/i.test(line)));
});
