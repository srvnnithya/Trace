import { env } from 'cloudflare:workers';
import {
  assessChange,
  type Assessment,
  type FreshnessStatus,
} from '@/lib/attention-engine';
import {
  classifyProviderFreshness,
  effectiveFreshnessStatus,
  fetchTwelveDataQuote,
  fetchYfinanceQuote,
  isIndianCashMarketOpen,
  providerPriceDifference,
  type MarketHistoryMetrics,
  type MarketQuote,
  type ProviderQuote,
} from '@/lib/fallback-market-data';
import { normalizeWatchlistImport } from '@/lib/watchlist-import';

const DEMO_USER_ID = 'user-demo';
const PRIMARY_WATCHLIST_ID = 'watchlist-core';

type SeedInstrument = {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  benchmark: string;
  volatility: number;
  high52w: number;
  low52w: number;
  baseline: number;
  price: number;
  volume: number;
  averageVolume: number;
  benchmarkReturn: number;
  dayReturn: number;
  freshness: FreshnessStatus;
  confidence: string;
  event: string | null;
  sentiment: string;
  mentions: number;
  secondaryPrice?: number;
  path: number[];
};

const SEED_INSTRUMENTS: SeedInstrument[] = [
  {
    id: 'ins-hdfcbank',
    symbol: 'HDFCBANK',
    name: 'HDFC Bank',
    sector: 'Private banks',
    benchmark: 'NIFTY BANK',
    volatility: 0.0137,
    high52w: 1794,
    low52w: 1363.55,
    baseline: 1608.25,
    price: 1674.2,
    volume: 42_000_000,
    averageVolume: 10_000_000,
    benchmarkReturn: 0.003,
    dayReturn: 0.041,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: null,
    sentiment: 'POSITIVE',
    mentions: 26,
    path: [1608, 1612, 1607, 1620, 1628, 1634, 1641, 1655, 1662, 1674.2],
  },
  {
    id: 'ins-infy',
    symbol: 'INFY',
    name: 'Infosys',
    sector: 'IT services',
    benchmark: 'NIFTY IT',
    volatility: 0.018,
    high52w: 1519.4,
    low52w: 1186,
    baseline: 1458.6,
    price: 1528.6,
    volume: 21_700_000,
    averageVolume: 7_000_000,
    benchmarkReturn: 0.008,
    dayReturn: 0.048,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: null,
    sentiment: 'POSITIVE',
    mentions: 34,
    path: [1459, 1464, 1471, 1468, 1482, 1491, 1503, 1511, 1519, 1528.6],
  },
  {
    id: 'ins-tcs',
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    sector: 'IT services',
    benchmark: 'NIFTY IT',
    volatility: 0.016,
    high52w: 4592.25,
    low52w: 3311,
    baseline: 3990.7,
    price: 4118.4,
    volume: 5_400_000,
    averageVolume: 3_000_000,
    benchmarkReturn: 0.008,
    dayReturn: 0.032,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: 'Q2 earnings released · revenue beat estimates',
    sentiment: 'POSITIVE',
    mentions: 48,
    path: [3991, 4004, 4010, 3998, 4028, 4052, 4076, 4091, 4104, 4118.4],
  },
  {
    id: 'ins-reliance',
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    sector: 'Energy',
    benchmark: 'NIFTY 50',
    volatility: 0.017,
    high52w: 3217.6,
    low52w: 2220.3,
    baseline: 2988,
    price: 3001.2,
    volume: 6_400_000,
    averageVolume: 8_000_000,
    benchmarkReturn: 0.005,
    dayReturn: 0.0044,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: null,
    sentiment: 'NEUTRAL',
    mentions: 7,
    path: [2988, 2992, 2984, 2990, 2997, 3004, 2999, 3003, 2998, 3001.2],
  },
  {
    id: 'ins-icicibank',
    symbol: 'ICICIBANK',
    name: 'ICICI Bank',
    sector: 'Private banks',
    benchmark: 'NIFTY BANK',
    volatility: 0.014,
    high52w: 1362.35,
    low52w: 899,
    baseline: 1220,
    price: 1215.1,
    volume: 9_100_000,
    averageVolume: 8_400_000,
    benchmarkReturn: 0.003,
    dayReturn: -0.004,
    freshness: 'CONFLICTED',
    confidence: 'DEGRADED',
    event: null,
    sentiment: 'NEUTRAL',
    mentions: 6,
    secondaryPrice: 1248.7,
    path: [1220, 1218, 1222, 1217, 1213, 1219, 1216, 1214, 1217, 1215.1],
  },
  {
    id: 'ins-tatamotors',
    symbol: 'TATAMOTORS',
    name: 'Tata Motors',
    sector: 'Automobiles',
    benchmark: 'NIFTY AUTO',
    volatility: 0.038,
    high52w: 1179,
    low52w: 622,
    baseline: 940,
    price: 970.1,
    volume: 11_800_000,
    averageVolume: 14_000_000,
    benchmarkReturn: 0.028,
    dayReturn: 0.032,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: null,
    sentiment: 'NEUTRAL',
    mentions: 9,
    path: [940, 948, 951, 944, 958, 963, 954, 966, 972, 970.1],
  },
  {
    id: 'ins-hul',
    symbol: 'HINDUNILVR',
    name: 'Hindustan Unilever',
    sector: 'Consumer staples',
    benchmark: 'NIFTY FMCG',
    volatility: 0.009,
    high52w: 3034.5,
    low52w: 2172.05,
    baseline: 2760,
    price: 2771.2,
    volume: 1_300_000,
    averageVolume: 1_850_000,
    benchmarkReturn: 0.003,
    dayReturn: 0.0041,
    freshness: 'DELAYED',
    confidence: 'MEDIUM',
    event: null,
    sentiment: 'NEUTRAL',
    mentions: 3,
    path: [2760, 2762, 2757, 2764, 2768, 2765, 2769, 2773, 2770, 2771.2],
  },
  {
    id: 'ins-lt',
    symbol: 'LT',
    name: 'Larsen & Toubro',
    sector: 'Infrastructure',
    benchmark: 'NIFTY 50',
    volatility: 0.019,
    high52w: 3919.9,
    low52w: 2900,
    baseline: 3568,
    price: 3612.4,
    volume: 3_200_000,
    averageVolume: 2_300_000,
    benchmarkReturn: 0.005,
    dayReturn: 0.0124,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: null,
    sentiment: 'POSITIVE',
    mentions: 11,
    path: [3568, 3571, 3580, 3577, 3586, 3592, 3601, 3597, 3608, 3612.4],
  },
  {
    id: 'ins-asianpaint',
    symbol: 'ASIANPAINT',
    name: 'Asian Paints',
    sector: 'Consumer discretionary',
    benchmark: 'NIFTY 50',
    volatility: 0.015,
    high52w: 3566,
    low52w: 2671,
    baseline: 3088,
    price: 3062.5,
    volume: 1_900_000,
    averageVolume: 1_600_000,
    benchmarkReturn: 0.005,
    dayReturn: -0.0083,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: null,
    sentiment: 'NEGATIVE',
    mentions: 8,
    path: [3088, 3083, 3079, 3085, 3074, 3069, 3072, 3064, 3058, 3062.5],
  },
  {
    id: 'ins-wipro',
    symbol: 'WIPRO',
    name: 'Wipro',
    sector: 'IT services',
    benchmark: 'NIFTY IT',
    volatility: 0.021,
    high52w: 579.9,
    low52w: 375.05,
    baseline: 514.2,
    price: 520.3,
    volume: 7_800_000,
    averageVolume: 8_500_000,
    benchmarkReturn: 0.008,
    dayReturn: 0.0119,
    freshness: 'LIVE',
    confidence: 'HIGH',
    event: null,
    sentiment: 'NEUTRAL',
    mentions: 5,
    path: [514.2, 516, 515.4, 517.8, 519.2, 518.1, 519.6, 521, 519.7, 520.3],
  },
];

type WatchlistRow = {
  id: string;
  name: string;
  benchmark_symbol: string;
  price_threshold: number;
  volume_threshold: number;
  updated_at: string;
};

type RawStockRow = {
  item_id: string;
  instrument_id: string;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  benchmark_symbol: string;
  normal_volatility: number;
  high_52w: number;
  low_52w: number;
  position: number;
  pinned: number;
  item_price_threshold: number | null;
  item_volume_threshold: number | null;
  reviewed_at: string | null;
  current_snapshot_id: string;
  current_price: number;
  current_volume: number;
  average_volume: number;
  benchmark_return: number;
  day_return: number;
  source: string;
  secondary_source: string | null;
  secondary_price: number | null;
  source_timestamp: string;
  received_at: string;
  freshness_status: FreshnessStatus;
  confidence_status: string;
  event_title: string | null;
  news_sentiment: string | null;
  news_mentions: number;
  price_path_json: string;
  baseline_snapshot_id: string | null;
  baseline_price: number | null;
  baseline_timestamp: string | null;
};

export type StockView = Assessment & {
  itemId: string;
  instrumentId: string;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  benchmarkSymbol: string;
  normalVolatility: number;
  high52w: number;
  low52w: number;
  position: number;
  pinned: boolean;
  reviewed: boolean;
  reviewedAt: string | null;
  currentSnapshotId: string;
  currentPrice: number;
  baselineSnapshotId: string | null;
  baselinePrice: number | null;
  checkpointSnapshotId: string | null;
  checkpointPrice: number | null;
  changedSinceCheckpoint: boolean;
  returnSinceCheckpoint: number | null;
  checkpointScore: number | null;
  checkpointPriority: Assessment['priority'] | null;
  checkpointHeadline: string | null;
  checkpointExplanations: string[];
  volume: number;
  averageVolume20d: number;
  benchmarkReturn: number;
  dayReturn: number;
  source: string;
  secondarySource: string | null;
  secondaryPrice: number | null;
  providerDifference: number | null;
  sourceTimestamp: string;
  receivedAt: string;
  quoteAgeSeconds: number;
  freshnessStatus: FreshnessStatus;
  confidenceStatus: string;
  eventTitle: string | null;
  newsSentiment: string | null;
  newsMentions: number;
  pricePath: number[];
  priceThreshold: number;
  volumeThreshold: number;
};

export type DashboardData = {
  user: { id: string; displayName: string };
  watchlist: {
    id: string;
    name: string;
    benchmarkSymbol: string;
    priceThreshold: number;
    volumeThreshold: number;
    updatedAt: string;
  } | null;
  watchlists: Array<{ id: string; name: string; itemCount: number }>;
  stocks: StockView[];
  universe: Array<{
    id: string;
    symbol: string;
    name: string;
    sector: string;
    tracked: boolean;
  }>;
  ledger: Array<{
    id: string;
    symbol: string;
    name: string;
    snapshotPrice: number;
    reviewedAt: string;
  }>;
  counts: {
    attention: number;
    noting: number;
    quiet: number;
    reviewed: number;
  };
  lastCheckpointAt: string | null;
  checkpointSnapshotCount: number;
  marketData: {
    provider: string;
    configured: boolean;
    mode: 'live' | 'delayed' | 'demo';
    health: 'ok' | 'degraded' | 'unavailable';
    marketIsOpen: boolean;
    asOf: string;
    lastUpdatedAt: string | null;
    message: string;
  };
};

function rawDb() {
  if (!env.DB) throw new Error('Persistent database is unavailable.');
  return env.DB;
}

function baselinePath(start: number) {
  return JSON.stringify(
    [
      start * 0.992,
      start * 0.996,
      start * 0.994,
      start * 1.001,
      start * 1.002,
      start * 0.999,
      start,
    ].map((value) => Number(value.toFixed(2))),
  );
}

type MarketSyncRow = {
  instrument_id: string;
  symbol: string;
  exchange: string;
  benchmark_symbol: string;
  normal_volatility: number;
  high_52w: number;
  low_52w: number;
  session_number: number;
  current_price: number;
  current_volume: number;
  average_volume: number;
  benchmark_return: number;
  source: string;
  received_at: string;
  price_path_json: string;
};

type FetchedInstrument = {
  row: MarketSyncRow;
  quote: MarketQuote;
  history: MarketHistoryMetrics | null;
  provider: 'Twelve Data' | 'Yahoo Finance';
  isMarketOpen: boolean;
};

const BENCHMARK_TRADING_SYMBOLS: Record<string, string> = {
  'NIFTY 50': 'NIFTY',
  'NIFTY BANK': 'BANKNIFTY',
  'NIFTY IT': 'NIFTYIT',
  'NIFTY AUTO': 'NIFTYAUTO',
  'NIFTY FMCG': 'NIFTYFMCG',
};

const waitForRateLimit = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 125));

const yfinanceServiceUrl = () =>
  env.YFINANCE_SERVICE_URL?.trim() || 'http://127.0.0.1:8765';

const marketDataConfigured = () =>
  Boolean(env.TWELVE_DATA_API_KEY?.trim() || yfinanceServiceUrl());

export async function refreshMarketData(watchlistId: string, force = true) {
  await seedDemoData();
  const twelveDataKey = env.TWELVE_DATA_API_KEY?.trim();
  const db = rawDb();
  const rows = await db
    .prepare(
      `SELECT i.id AS instrument_id, i.symbol, i.exchange,
              i.benchmark_symbol, i.normal_daily_volatility AS normal_volatility,
              i.high_52w, i.low_52w, ms.session_number,
              ms.price AS current_price, ms.volume AS current_volume,
              ms.average_volume_20d AS average_volume,
              ms.benchmark_return, ms.source, ms.received_at,
              ms.price_path_json
       FROM watchlist_items wi
       JOIN instruments i ON i.id = wi.instrument_id
       JOIN market_snapshots ms
         ON ms.instrument_id = i.id
        AND ms.session_number = (
          SELECT MAX(latest.session_number)
          FROM market_snapshots latest
          WHERE latest.instrument_id = i.id
        )
       WHERE wi.watchlist_id = ?
       ORDER BY wi.position`,
    )
    .bind(watchlistId)
    .all<MarketSyncRow>();

  const now = new Date();
  const pending = rows.results.filter(
    (row) =>
      force ||
      !['Twelve Data', 'Yahoo Finance'].includes(row.source) ||
      now.getTime() - new Date(row.received_at).getTime() >= 5 * 60_000,
  );
  if (!pending.length) {
    return { provider: 'cached', updated: 0, failed: 0, cached: true };
  }

  const fetched: FetchedInstrument[] = [];
  let failed = 0;
  const providerErrors = new Set<string>();
  for (const row of pending) {
    let observation: ProviderQuote | null = null;
    if (twelveDataKey) {
      try {
        observation = await fetchTwelveDataQuote(
          twelveDataKey,
          row.exchange,
          row.symbol,
        );
      } catch (error) {
        providerErrors.add(
          `Twelve Data: ${error instanceof Error ? error.message : 'unavailable'}`,
        );
      }
    }
    if (!observation) {
      try {
        observation = await fetchYfinanceQuote(
          yfinanceServiceUrl(),
          row.exchange,
          row.symbol,
        );
      } catch (error) {
        providerErrors.add(
          `Yahoo Finance: ${error instanceof Error ? error.message : 'unavailable'}`,
        );
      }
    }
    if (observation) {
      fetched.push({
        row,
        quote: observation.quote,
        history: observation.history,
        provider: observation.provider,
        isMarketOpen: observation.isMarketOpen,
      });
    } else {
      failed += 1;
    }
    await waitForRateLimit();
  }

  if (!fetched.length) {
    const details = [...providerErrors].slice(0, 3).join('; ');
    throw new Error(
      `Market providers unavailable. Showing last cached prices.${details ? ` ${details}` : ''}`,
    );
  }

  const benchmarkReturns = new Map<string, number>();
  for (const benchmark of new Set(
    fetched.map(({ row }) => row.benchmark_symbol),
  )) {
    const tradingSymbol = BENCHMARK_TRADING_SYMBOLS[benchmark];
    if (!tradingSymbol) continue;
    try {
      const observation = await fetchYfinanceQuote(
        yfinanceServiceUrl(),
        'NSE',
        tradingSymbol,
      );
      benchmarkReturns.set(benchmark, observation.quote.dayReturn);
    } catch {
      // Keep the last known benchmark return when an index quote is unavailable.
    }
    await waitForRateLimit();
  }

  const receivedAt = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const { row, quote, history, provider, isMarketOpen } of fetched) {
    const previousPath = JSON.parse(row.price_path_json) as number[];
    const basePath = history?.pricePath.length
      ? history.pricePath
      : previousPath.slice(-9);
    const pricePath =
      basePath.at(-1) === quote.price
        ? basePath.slice(-10)
        : [...basePath, quote.price].slice(-10);
    const freshness = classifyProviderFreshness(
      quote.sourceTimestamp,
      isMarketOpen,
      now,
    );
    const confidence =
      freshness === 'LIVE' && provider !== 'Yahoo Finance'
        ? 'HIGH'
        : freshness === 'DELAYED'
          ? 'MEDIUM'
          : 'LOW';
    const high52w = quote.high52w ?? row.high_52w;
    const low52w = quote.low52w ?? row.low_52w;
    const normalVolatility =
      history?.normalDailyVolatility ?? row.normal_volatility;
    const averageVolume =
      history?.averageVolume20d || row.average_volume || row.current_volume;
    const ingestionKey = [
      provider.toLowerCase().replaceAll(' ', '-'),
      row.instrument_id,
      quote.sourceTimestamp,
      quote.price,
      quote.volume,
    ].join(':');

    statements.push(
      db
        .prepare(
          'UPDATE instruments SET normal_daily_volatility = ?, high_52w = ?, low_52w = ? WHERE id = ?',
        )
        .bind(normalVolatility, high52w, low52w, row.instrument_id),
      db
        .prepare(
          'INSERT OR IGNORE INTO market_snapshots (id, instrument_id, session_number, price, volume, average_volume_20d, benchmark_return, day_return, source, secondary_source, secondary_price, source_timestamp, received_at, freshness_status, confidence_status, ingestion_key, event_title, news_sentiment, news_mentions, price_path_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          row.instrument_id,
          row.session_number + 1,
          quote.price,
          quote.volume,
          averageVolume,
          benchmarkReturns.get(row.benchmark_symbol) ?? row.benchmark_return,
          quote.dayReturn,
          provider,
          null,
          null,
          quote.sourceTimestamp,
          receivedAt,
          freshness,
          confidence,
          ingestionKey,
          null,
          null,
          0,
          JSON.stringify(pricePath),
        ),
    );
  }
  await db.batch(statements);
  return {
    provider: [...new Set(fetched.map((item) => item.provider))].join(' + '),
    updated: fetched.length,
    failed,
    cached: false,
  };
}

export async function seedDemoData() {
  const db = rawDb();
  const existing = await db
    .prepare('SELECT id FROM users WHERE id = ? LIMIT 1')
    .bind(DEMO_USER_ID)
    .first<{ id: string }>();
  if (existing) return;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        'INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)',
      )
      .bind(DEMO_USER_ID, 'Nithya', '2026-09-01T09:00:00.000Z'),
    db
      .prepare(
        'INSERT INTO watchlists (id, user_id, name, benchmark_symbol, price_threshold, volume_threshold, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        PRIMARY_WATCHLIST_ID,
        DEMO_USER_ID,
        'Core compounders',
        'NIFTY 50',
        0.02,
        2,
        '2026-09-01T09:00:00.000Z',
        '2026-09-03T10:12:00.000Z',
      ),
  ];

  SEED_INSTRUMENTS.forEach((instrument, index) => {
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO instruments (id, symbol, name, exchange, sector, benchmark_symbol, normal_daily_volatility, high_52w, low_52w) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          instrument.id,
          instrument.symbol,
          instrument.name,
          'NSE',
          instrument.sector,
          instrument.benchmark,
          instrument.volatility,
          instrument.high52w,
          instrument.low52w,
        ),
      db
        .prepare(
          'INSERT OR IGNORE INTO market_snapshots (id, instrument_id, session_number, price, volume, average_volume_20d, benchmark_return, day_return, source, secondary_source, secondary_price, source_timestamp, received_at, freshness_status, confidence_status, ingestion_key, event_title, news_sentiment, news_mentions, price_path_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          `snap-${instrument.symbol}-1`,
          instrument.id,
          1,
          instrument.baseline,
          Math.round(instrument.averageVolume * 0.92),
          instrument.averageVolume,
          0,
          0,
          'Seeded demo',
          null,
          null,
          '2026-09-03T10:10:00.000Z',
          '2026-09-03T10:10:02.000Z',
          'LIVE',
          'HIGH',
          `seed:${instrument.symbol}:1`,
          null,
          'NEUTRAL',
          0,
          baselinePath(instrument.baseline),
        ),
      db
        .prepare(
          'INSERT OR IGNORE INTO market_snapshots (id, instrument_id, session_number, price, volume, average_volume_20d, benchmark_return, day_return, source, secondary_source, secondary_price, source_timestamp, received_at, freshness_status, confidence_status, ingestion_key, event_title, news_sentiment, news_mentions, price_path_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          `snap-${instrument.symbol}-2`,
          instrument.id,
          2,
          instrument.price,
          instrument.volume,
          instrument.averageVolume,
          instrument.benchmarkReturn,
          instrument.dayReturn,
          'Seeded demo',
          instrument.secondaryPrice ? 'Demo secondary source' : null,
          instrument.secondaryPrice ?? null,
          instrument.freshness === 'DELAYED'
            ? '2026-09-04T09:42:00.000Z'
            : '2026-09-04T09:57:00.000Z',
          instrument.freshness === 'DELAYED'
            ? '2026-09-04T09:42:06.000Z'
            : '2026-09-04T09:57:03.000Z',
          instrument.freshness,
          instrument.confidence,
          `seed:${instrument.symbol}:2`,
          instrument.event,
          instrument.sentiment,
          instrument.mentions,
          JSON.stringify(instrument.path),
        ),
    );

    if (index < 7) {
      statements.push(
        db
          .prepare(
            'INSERT INTO watchlist_items (id, user_id, watchlist_id, instrument_id, position, pinned, last_reviewed_snapshot_id, reviewed_at, price_threshold, volume_threshold, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            `item-${instrument.symbol}`,
            DEMO_USER_ID,
            PRIMARY_WATCHLIST_ID,
            instrument.id,
            index,
            index === 0 ? 1 : 0,
            `snap-${instrument.symbol}-1`,
            '2026-09-03T10:12:00.000Z',
            null,
            null,
            '2026-09-01T09:00:00.000Z',
          ),
      );
    }
  });

  statements.push(
    db
      .prepare(
        'INSERT INTO session_checkpoints (id, user_id, watchlist_id, created_at, delivered) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(
        'checkpoint-seed',
        DEMO_USER_ID,
        PRIMARY_WATCHLIST_ID,
        '2026-09-03T10:12:00.000Z',
        1,
      ),
  );
  SEED_INSTRUMENTS.slice(0, 7).forEach((instrument) => {
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO session_checkpoint_snapshots (id, checkpoint_id, instrument_id, snapshot_id) VALUES (?, ?, ?, ?)',
        )
        .bind(
          `checkpoint-seed-${instrument.symbol}`,
          'checkpoint-seed',
          instrument.id,
          `snap-${instrument.symbol}-1`,
        ),
    );
  });
  await db.batch(statements);
}

function reviewedAssessment(): Assessment {
  return {
    score: 0,
    priority: 'quiet',
    returnSinceSeen: 0,
    relativeMove: 0,
    volumeRatio: 1,
    volatilityScore: 0,
    components: [],
    explanations: ['No new market snapshot since you reviewed this stock.'],
    headline: 'Reviewed at current checkpoint',
    expected: false,
  };
}

type SessionCheckpointRow = {
  id: string;
  created_at: string;
};

type CheckpointSnapshotRow = {
  instrument_id: string;
  snapshot_id: string;
  price: number;
};

async function getCheckpointSnapshots(
  db: D1Database,
  checkpoint: SessionCheckpointRow | null,
  watchlistId: string,
) {
  if (!checkpoint) return new Map<string, CheckpointSnapshotRow>();

  let mappings = await db
    .prepare(
      `SELECT scs.instrument_id, scs.snapshot_id, ms.price
       FROM session_checkpoint_snapshots scs
       JOIN market_snapshots ms ON ms.id = scs.snapshot_id
       WHERE scs.checkpoint_id = ?`,
    )
    .bind(checkpoint.id)
    .all<CheckpointSnapshotRow>();

  if (!mappings.results.length) {
    const legacySnapshots = await db
      .prepare(
        `SELECT wi.instrument_id, ms.id AS snapshot_id, ms.price
         FROM watchlist_items wi
         JOIN market_snapshots ms
           ON ms.instrument_id = wi.instrument_id
          AND ms.session_number = (
            SELECT MAX(candidate.session_number)
            FROM market_snapshots candidate
            WHERE candidate.instrument_id = wi.instrument_id
              AND candidate.received_at <= ?
          )
         WHERE wi.watchlist_id = ? AND wi.user_id = ?`,
      )
      .bind(checkpoint.created_at, watchlistId, DEMO_USER_ID)
      .all<CheckpointSnapshotRow>();

    if (legacySnapshots.results.length) {
      await db.batch(
        legacySnapshots.results.map((snapshot) =>
          db
            .prepare(
              'INSERT OR IGNORE INTO session_checkpoint_snapshots (id, checkpoint_id, instrument_id, snapshot_id) VALUES (?, ?, ?, ?)',
            )
            .bind(
              crypto.randomUUID(),
              checkpoint.id,
              snapshot.instrument_id,
              snapshot.snapshot_id,
            ),
        ),
      );
      mappings = legacySnapshots;
    }
  }

  return new Map(
    mappings.results.map((mapping) => [mapping.instrument_id, mapping]),
  );
}

export async function getDashboard(
  watchlistId?: string,
): Promise<DashboardData> {
  await seedDemoData();
  const db = rawDb();
  const watchlistResult = await db
    .prepare(
      `SELECT w.id, w.name, w.benchmark_symbol, w.price_threshold,
              w.volume_threshold, w.updated_at, COUNT(wi.id) AS item_count
       FROM watchlists w
       LEFT JOIN watchlist_items wi ON wi.watchlist_id = w.id
       WHERE w.user_id = ?
       GROUP BY w.id
       ORDER BY w.created_at`,
    )
    .bind(DEMO_USER_ID)
    .all<WatchlistRow & { item_count: number }>();

  const selected =
    watchlistResult.results.find((row) => row.id === watchlistId) ??
    watchlistResult.results[0] ??
    null;

  let marketDataError: string | null = null;
  if (selected) {
    try {
      await refreshMarketData(selected.id, false);
    } catch (error) {
      marketDataError =
        error instanceof Error ? error.message : 'Market refresh failed.';
    }
  }

  const universeResult = await db
    .prepare(
      `SELECT i.id, i.symbol, i.name, i.sector,
              CASE WHEN wi.id IS NULL THEN 0 ELSE 1 END AS tracked
       FROM instruments i
       LEFT JOIN watchlist_items wi
         ON wi.instrument_id = i.id AND wi.watchlist_id = ?
       ORDER BY i.symbol`,
    )
    .bind(selected?.id ?? '')
    .all<{
      id: string;
      symbol: string;
      name: string;
      sector: string;
      tracked: number;
    }>();

  if (!selected) {
    const asOf = new Date();
    return {
      user: { id: DEMO_USER_ID, displayName: 'Nithya' },
      watchlist: null,
      watchlists: [],
      stocks: [],
      universe: universeResult.results.map((row) => ({
        ...row,
        tracked: false,
      })),
      ledger: [],
      counts: { attention: 0, noting: 0, quiet: 0, reviewed: 0 },
      lastCheckpointAt: null,
      checkpointSnapshotCount: 0,
      marketData: {
        provider: 'Cached',
        configured: marketDataConfigured(),
        mode: 'demo',
        health: marketDataError ? 'unavailable' : 'ok',
        marketIsOpen: isIndianCashMarketOpen(asOf),
        asOf: asOf.toISOString(),
        lastUpdatedAt: null,
        message:
          marketDataError ??
          'Create a watchlist to begin fetching market observations.',
      },
    };
  }

  const checkpoint = await db
    .prepare(
      'SELECT id, created_at FROM session_checkpoints WHERE watchlist_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .bind(selected.id)
    .first<SessionCheckpointRow>();
  const checkpointSnapshots = await getCheckpointSnapshots(
    db,
    checkpoint,
    selected.id,
  );

  const stockResult = await db
    .prepare(
      `SELECT wi.id AS item_id, i.id AS instrument_id, i.symbol, i.name,
              i.exchange, i.sector, i.benchmark_symbol,
              i.normal_daily_volatility AS normal_volatility,
              i.high_52w, i.low_52w, wi.position, wi.pinned,
              wi.price_threshold AS item_price_threshold,
              wi.volume_threshold AS item_volume_threshold, wi.reviewed_at,
              cur.id AS current_snapshot_id, cur.price AS current_price,
              cur.volume AS current_volume,
              cur.average_volume_20d AS average_volume,
              cur.benchmark_return, cur.day_return, cur.source,
              cur.secondary_source, cur.secondary_price, cur.source_timestamp,
              cur.received_at, cur.freshness_status, cur.confidence_status,
              cur.event_title, cur.news_sentiment, cur.news_mentions,
              cur.price_path_json,
              base.id AS baseline_snapshot_id, base.price AS baseline_price,
              base.source_timestamp AS baseline_timestamp
       FROM watchlist_items wi
       JOIN instruments i ON i.id = wi.instrument_id
       JOIN market_snapshots cur
         ON cur.instrument_id = i.id
        AND cur.session_number = (
          SELECT MAX(ms.session_number) FROM market_snapshots ms
          WHERE ms.instrument_id = i.id
        )
       LEFT JOIN market_snapshots base ON base.id = wi.last_reviewed_snapshot_id
       WHERE wi.watchlist_id = ?
       ORDER BY wi.position`,
    )
    .bind(selected.id)
    .all<RawStockRow>();

  const dashboardAsOf = new Date();
  const stocks: StockView[] = stockResult.results.map((row) => {
    const priceThreshold = row.item_price_threshold ?? selected.price_threshold;
    const volumeThreshold =
      row.item_volume_threshold ?? selected.volume_threshold;
    const reviewed = row.current_snapshot_id === row.baseline_snapshot_id;
    const effectiveFreshness = effectiveFreshnessStatus(
      row.freshness_status,
      row.source_timestamp,
      row.exchange,
      dashboardAsOf,
    );
    const effectiveConfidence =
      effectiveFreshness === 'CONFLICTED'
        ? 'DEGRADED'
        : effectiveFreshness === 'LIVE'
          ? row.confidence_status
          : effectiveFreshness === 'DELAYED'
            ? row.confidence_status === 'LOW'
              ? 'LOW'
              : 'MEDIUM'
            : 'LOW';
    const assessmentInput = {
      currentPrice: row.current_price,
      baselinePrice: row.baseline_price,
      volume: row.current_volume,
      averageVolume20d: row.average_volume,
      benchmarkReturn: row.benchmark_return,
      normalDailyVolatility: row.normal_volatility,
      high52w: row.high_52w,
      low52w: row.low_52w,
      eventTitle: row.event_title,
      freshnessStatus: effectiveFreshness,
      confidenceStatus: effectiveConfidence,
      priceThreshold,
      volumeThreshold,
    };
    const assessment = reviewed
      ? reviewedAssessment()
      : assessChange(assessmentInput);
    const checkpointSnapshot = checkpointSnapshots.get(row.instrument_id);
    const unchangedSinceCheckpoint =
      checkpointSnapshot?.snapshot_id === row.current_snapshot_id;
    const checkpointAssessment = checkpointSnapshot
      ? unchangedSinceCheckpoint
        ? reviewedAssessment()
        : assessChange({
            ...assessmentInput,
            baselinePrice: checkpointSnapshot.price,
          })
      : null;
    return {
      ...assessment,
      itemId: row.item_id,
      instrumentId: row.instrument_id,
      symbol: row.symbol,
      name: row.name,
      exchange: row.exchange,
      sector: row.sector,
      benchmarkSymbol: row.benchmark_symbol,
      normalVolatility: row.normal_volatility,
      high52w: row.high_52w,
      low52w: row.low_52w,
      position: row.position,
      pinned: Boolean(row.pinned),
      reviewed,
      reviewedAt: row.reviewed_at,
      currentSnapshotId: row.current_snapshot_id,
      currentPrice: row.current_price,
      baselineSnapshotId: row.baseline_snapshot_id,
      baselinePrice: row.baseline_price,
      checkpointSnapshotId: checkpointSnapshot?.snapshot_id ?? null,
      checkpointPrice: checkpointSnapshot?.price ?? null,
      changedSinceCheckpoint: Boolean(
        checkpointSnapshot && !unchangedSinceCheckpoint,
      ),
      returnSinceCheckpoint: checkpointAssessment?.returnSinceSeen ?? null,
      checkpointScore: checkpointAssessment?.score ?? null,
      checkpointPriority: checkpointAssessment?.priority ?? null,
      checkpointHeadline: checkpointAssessment?.headline ?? null,
      checkpointExplanations: checkpointAssessment?.explanations ?? [],
      volume: row.current_volume,
      averageVolume20d: row.average_volume,
      benchmarkReturn: row.benchmark_return,
      dayReturn: row.day_return,
      source: row.source === 'NSE Primary' ? 'Seeded demo' : row.source,
      secondarySource:
        row.secondary_source === 'MarketWire'
          ? 'Demo secondary source'
          : row.secondary_source,
      secondaryPrice: row.secondary_price,
      providerDifference: providerPriceDifference(
        row.current_price,
        row.secondary_price,
      ),
      sourceTimestamp: row.source_timestamp,
      receivedAt: row.received_at,
      quoteAgeSeconds: Math.max(
        0,
        Math.floor(
          (dashboardAsOf.getTime() - new Date(row.source_timestamp).getTime()) /
            1000,
        ),
      ),
      freshnessStatus: effectiveFreshness,
      confidenceStatus: effectiveConfidence,
      eventTitle: row.event_title,
      newsSentiment: row.news_sentiment,
      newsMentions: row.news_mentions,
      pricePath: JSON.parse(row.price_path_json) as number[],
      priceThreshold,
      volumeThreshold,
    };
  });

  stocks.sort(
    (a, b) => b.score - a.score || Number(b.pinned) - Number(a.pinned),
  );

  const ledgerResult = await db
    .prepare(
      `SELECT re.id, i.symbol, i.name, ms.price AS snapshot_price, re.reviewed_at
       FROM review_events re
       JOIN instruments i ON i.id = re.instrument_id
       JOIN market_snapshots ms ON ms.id = re.snapshot_id
       JOIN watchlist_items wi ON wi.id = re.watchlist_item_id
       WHERE wi.watchlist_id = ?
       ORDER BY re.reviewed_at DESC LIMIT 20`,
    )
    .bind(selected.id)
    .all<{
      id: string;
      symbol: string;
      name: string;
      snapshot_price: number;
      reviewed_at: string;
    }>();
  const providerStocks = stocks.filter((stock) =>
    ['Twelve Data', 'Yahoo Finance'].includes(stock.source),
  );
  const providerNames = [
    ...new Set(providerStocks.map((stock) => stock.source)),
  ];
  const latestProviderUpdate = providerStocks
    .map((stock) => stock.sourceTimestamp)
    .sort((a, b) => b.localeCompare(a))[0];
  const allProviderQuotesLive =
    providerStocks.length > 0 &&
    providerStocks.every((stock) => stock.freshnessStatus === 'LIVE');
  const hasDataQualityIssue = stocks.some((stock) =>
    ['STALE', 'CONFLICTED', 'UNAVAILABLE'].includes(stock.freshnessStatus),
  );
  const marketHealth: DashboardData['marketData']['health'] = marketDataError
    ? 'unavailable'
    : hasDataQualityIssue || providerStocks.length < stocks.length
      ? 'degraded'
      : 'ok';

  return {
    user: { id: DEMO_USER_ID, displayName: 'Nithya' },
    watchlist: {
      id: selected.id,
      name: selected.name,
      benchmarkSymbol: selected.benchmark_symbol,
      priceThreshold: selected.price_threshold,
      volumeThreshold: selected.volume_threshold,
      updatedAt: selected.updated_at,
    },
    watchlists: watchlistResult.results.map((row) => ({
      id: row.id,
      name: row.name,
      itemCount: Number(row.item_count),
    })),
    stocks,
    universe: universeResult.results.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      tracked: Boolean(row.tracked),
    })),
    ledger: ledgerResult.results.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      snapshotPrice: row.snapshot_price,
      reviewedAt: row.reviewed_at,
    })),
    counts: {
      attention: stocks.filter((stock) => stock.priority === 'needs_attention')
        .length,
      noting: stocks.filter((stock) => stock.priority === 'worth_noting')
        .length,
      quiet: stocks.filter(
        (stock) => stock.priority === 'quiet' && !stock.reviewed,
      ).length,
      reviewed: stocks.filter((stock) => stock.reviewed).length,
    },
    lastCheckpointAt: checkpoint?.created_at ?? null,
    checkpointSnapshotCount: checkpointSnapshots.size,
    marketData: {
      provider: providerNames.join(' + ') || 'Cached',
      configured: marketDataConfigured(),
      mode: providerStocks.length
        ? allProviderQuotesLive
          ? 'live'
          : 'delayed'
        : 'demo',
      health: marketHealth,
      marketIsOpen: isIndianCashMarketOpen(dashboardAsOf),
      asOf: dashboardAsOf.toISOString(),
      lastUpdatedAt: latestProviderUpdate ?? null,
      message: marketDataError
        ? marketDataError
        : providerStocks.length
          ? `${providerNames.join(' + ')} data for ${providerStocks.length} of ${stocks.length} stocks.${providerStocks.length < stocks.length ? ` ${stocks.length - providerStocks.length} ${stocks.length - providerStocks.length === 1 ? 'stock remains' : 'stocks remain'} on the last cached snapshot.` : ''}`
          : 'Showing seeded/cached prices because external providers are unavailable.',
    },
  };
}

async function latestSnapshotForItem(itemId: string) {
  return rawDb()
    .prepare(
      `SELECT wi.id AS item_id, wi.last_reviewed_snapshot_id, i.id AS instrument_id,
              ms.id AS snapshot_id, ms.price
       FROM watchlist_items wi
       JOIN instruments i ON i.id = wi.instrument_id
       JOIN market_snapshots ms
         ON ms.instrument_id = i.id
        AND ms.session_number = (
          SELECT MAX(x.session_number) FROM market_snapshots x
          WHERE x.instrument_id = i.id
        )
       WHERE wi.id = ? AND wi.user_id = ?`,
    )
    .bind(itemId, DEMO_USER_ID)
    .first<{
      item_id: string;
      last_reviewed_snapshot_id: string | null;
      instrument_id: string;
      snapshot_id: string;
      price: number;
    }>();
}

export async function reviewItem(itemId: string) {
  const db = rawDb();
  const current = await latestSnapshotForItem(itemId);
  if (!current) throw new Error('This watchlist item no longer exists.');
  if (current.snapshot_id === current.last_reviewed_snapshot_id) {
    return { reviewed: false, alreadyCurrent: true };
  }
  const reviewedAt = new Date().toISOString();
  const eventId = crypto.randomUUID();
  const expectedBaseline = current.last_reviewed_snapshot_id ?? '';
  const results = await db.batch([
    db
      .prepare(
        `UPDATE watchlist_items
       SET last_reviewed_snapshot_id = ?, reviewed_at = ?
       WHERE id = ? AND user_id = ?
         AND COALESCE(last_reviewed_snapshot_id, '') = ?`,
      )
      .bind(
        current.snapshot_id,
        reviewedAt,
        itemId,
        DEMO_USER_ID,
        expectedBaseline,
      ),
    db
      .prepare(
        `INSERT INTO review_events
         (id, watchlist_item_id, instrument_id, snapshot_id, reviewed_at)
       SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
      )
      .bind(
        eventId,
        itemId,
        current.instrument_id,
        current.snapshot_id,
        reviewedAt,
      ),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    throw new Error(
      'This item changed while it was being reviewed. Please refresh.',
    );
  }
  return { reviewed: true, snapshotId: current.snapshot_id };
}

export async function reviewAll(watchlistId: string) {
  const db = rawDb();
  const items = await db
    .prepare(
      `SELECT wi.id AS item_id, wi.last_reviewed_snapshot_id,
              i.id AS instrument_id, ms.id AS snapshot_id
       FROM watchlist_items wi
       JOIN instruments i ON i.id = wi.instrument_id
       JOIN market_snapshots ms
         ON ms.instrument_id = i.id
        AND ms.session_number = (
          SELECT MAX(x.session_number) FROM market_snapshots x
          WHERE x.instrument_id = i.id
        )
       WHERE wi.watchlist_id = ? AND wi.user_id = ?`,
    )
    .bind(watchlistId, DEMO_USER_ID)
    .all<{
      item_id: string;
      last_reviewed_snapshot_id: string | null;
      instrument_id: string;
      snapshot_id: string;
    }>();
  const reviewedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const item of items.results) {
    if (item.snapshot_id === item.last_reviewed_snapshot_id) continue;
    statements.push(
      db
        .prepare(
          'UPDATE watchlist_items SET last_reviewed_snapshot_id = ?, reviewed_at = ? WHERE id = ? AND user_id = ?',
        )
        .bind(item.snapshot_id, reviewedAt, item.item_id, DEMO_USER_ID),
      db
        .prepare(
          'INSERT INTO review_events (id, watchlist_item_id, instrument_id, snapshot_id, reviewed_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          item.item_id,
          item.instrument_id,
          item.snapshot_id,
          reviewedAt,
        ),
    );
  }
  if (statements.length) await db.batch(statements);
  return { reviewed: statements.length / 2 };
}

export async function createWatchlist(name: string) {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error('Watchlist name is required.');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await rawDb()
    .prepare(
      'INSERT INTO watchlists (id, user_id, name, benchmark_symbol, price_threshold, volume_threshold, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, DEMO_USER_ID, cleanName, 'NIFTY 50', 0.02, 2, now, now)
    .run();
  return { id, name: cleanName };
}

export async function importWatchlist(payload: unknown) {
  await seedDemoData();
  const imported = normalizeWatchlistImport(payload);
  const db = rawDb();
  const instruments = await db
    .prepare(
      `SELECT i.id, i.symbol, ms.id AS snapshot_id
       FROM instruments i
       JOIN market_snapshots ms
         ON ms.instrument_id = i.id
        AND ms.session_number = (
          SELECT MAX(latest.session_number)
          FROM market_snapshots latest
          WHERE latest.instrument_id = i.id
        )`,
    )
    .all<{ id: string; symbol: string; snapshot_id: string }>();
  const instrumentBySymbol = new Map(
    instruments.results.map((instrument) => [instrument.symbol, instrument]),
  );
  const unknown = imported.items
    .filter((item) => !instrumentBySymbol.has(item.symbol))
    .map((item) => item.symbol);
  if (unknown.length) {
    throw new Error(
      `Unknown symbol${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`,
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        'INSERT INTO watchlists (id, user_id, name, benchmark_symbol, price_threshold, volume_threshold, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        id,
        DEMO_USER_ID,
        imported.name,
        imported.benchmarkSymbol,
        imported.priceThreshold,
        imported.volumeThreshold,
        now,
        now,
      ),
  ];
  imported.items.forEach((item, position) => {
    const instrument = instrumentBySymbol.get(item.symbol)!;
    statements.push(
      db
        .prepare(
          'INSERT INTO watchlist_items (id, user_id, watchlist_id, instrument_id, position, pinned, last_reviewed_snapshot_id, reviewed_at, price_threshold, volume_threshold, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          DEMO_USER_ID,
          id,
          instrument.id,
          position,
          item.pinned ? 1 : 0,
          instrument.snapshot_id,
          now,
          item.priceThreshold,
          item.volumeThreshold,
          now,
        ),
    );
  });
  await db.batch(statements);
  return { id, name: imported.name, imported: imported.items.length };
}

export async function renameWatchlist(watchlistId: string, name: string) {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error('Watchlist name is required.');
  const result = await rawDb()
    .prepare(
      'UPDATE watchlists SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    )
    .bind(cleanName, new Date().toISOString(), watchlistId, DEMO_USER_ID)
    .run();
  if (!result.meta.changes) throw new Error('Watchlist not found.');
  return { id: watchlistId, name: cleanName };
}

export async function deleteWatchlist(watchlistId: string) {
  const result = await rawDb()
    .prepare('DELETE FROM watchlists WHERE id = ? AND user_id = ?')
    .bind(watchlistId, DEMO_USER_ID)
    .run();
  if (!result.meta.changes) throw new Error('Watchlist not found.');
  return { deleted: true };
}

export async function addStock(watchlistId: string, instrumentId: string) {
  const db = rawDb();
  const instrument = await db
    .prepare('SELECT id FROM instruments WHERE id = ? LIMIT 1')
    .bind(instrumentId)
    .first<{ id: string }>();
  if (!instrument) throw new Error('Unknown symbol.');
  const duplicate = await db
    .prepare(
      'SELECT id FROM watchlist_items WHERE watchlist_id = ? AND instrument_id = ?',
    )
    .bind(watchlistId, instrumentId)
    .first<{ id: string }>();
  if (duplicate) throw new Error('This stock is already in the watchlist.');
  const position = await db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM watchlist_items WHERE watchlist_id = ?',
    )
    .bind(watchlistId)
    .first<{ next_position: number }>();
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO watchlist_items (id, user_id, watchlist_id, instrument_id, position, pinned, last_reviewed_snapshot_id, reviewed_at, price_threshold, volume_threshold, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      DEMO_USER_ID,
      watchlistId,
      instrumentId,
      position?.next_position ?? 0,
      0,
      null,
      null,
      null,
      null,
      new Date().toISOString(),
    )
    .run();
  return { id };
}

export async function removeStock(itemId: string) {
  const result = await rawDb()
    .prepare('DELETE FROM watchlist_items WHERE id = ? AND user_id = ?')
    .bind(itemId, DEMO_USER_ID)
    .run();
  if (!result.meta.changes) throw new Error('Watchlist item not found.');
  return { deleted: true };
}

export async function setPinned(itemId: string, pinned: boolean) {
  const result = await rawDb()
    .prepare(
      'UPDATE watchlist_items SET pinned = ? WHERE id = ? AND user_id = ?',
    )
    .bind(pinned ? 1 : 0, itemId, DEMO_USER_ID)
    .run();
  if (!result.meta.changes) throw new Error('Watchlist item not found.');
  return { pinned };
}

export async function updateThresholds(
  itemId: string,
  priceThreshold: number,
  volumeThreshold: number,
) {
  if (priceThreshold < 0.005 || priceThreshold > 0.2)
    throw new Error('Price threshold must be between 0.5% and 20%.');
  if (volumeThreshold < 1 || volumeThreshold > 10)
    throw new Error('Volume threshold must be between 1× and 10×.');
  const result = await rawDb()
    .prepare(
      'UPDATE watchlist_items SET price_threshold = ?, volume_threshold = ? WHERE id = ? AND user_id = ?',
    )
    .bind(priceThreshold, volumeThreshold, itemId, DEMO_USER_ID)
    .run();
  if (!result.meta.changes) throw new Error('Watchlist item not found.');
  return { priceThreshold, volumeThreshold };
}

export async function saveCheckpoint(watchlistId: string) {
  const db = rawDb();
  const exists = await db
    .prepare('SELECT id FROM watchlists WHERE id = ? AND user_id = ?')
    .bind(watchlistId, DEMO_USER_ID)
    .first<{ id: string }>();
  if (!exists) return { saved: false };
  const snapshots = await db
    .prepare(
      `SELECT wi.instrument_id, ms.id AS snapshot_id
       FROM watchlist_items wi
       JOIN market_snapshots ms
         ON ms.instrument_id = wi.instrument_id
        AND ms.session_number = (
          SELECT MAX(latest.session_number)
          FROM market_snapshots latest
          WHERE latest.instrument_id = wi.instrument_id
        )
       WHERE wi.watchlist_id = ? AND wi.user_id = ?`,
    )
    .bind(watchlistId, DEMO_USER_ID)
    .all<{ instrument_id: string; snapshot_id: string }>();
  const checkpointId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        'INSERT INTO session_checkpoints (id, user_id, watchlist_id, created_at, delivered) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(checkpointId, DEMO_USER_ID, watchlistId, createdAt, 1),
  ];
  for (const snapshot of snapshots.results) {
    statements.push(
      db
        .prepare(
          'INSERT INTO session_checkpoint_snapshots (id, checkpoint_id, instrument_id, snapshot_id) VALUES (?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          checkpointId,
          snapshot.instrument_id,
          snapshot.snapshot_id,
        ),
    );
  }
  await db.batch(statements);
  return { saved: true, checkpointId, snapshots: snapshots.results.length };
}

type Scenario =
  | 'return_later'
  | 'advance'
  | 'unusual'
  | 'volume'
  | 'stale'
  | 'conflict';

export async function runScenario(scenario: Scenario) {
  await seedDemoData();
  if (scenario === 'return_later') {
    await reviewAll(PRIMARY_WATCHLIST_ID);
    const checkpoint = await saveCheckpoint(PRIMARY_WATCHLIST_ID);
    const advanced = await writeScenarioSnapshots(scenario);
    return {
      ...advanced,
      reviewed: true,
      checkpointId: checkpoint.checkpointId,
      checkpointSnapshots: checkpoint.snapshots,
      expectedMeaningfulSymbols: ['HDFCBANK'],
    };
  }
  return writeScenarioSnapshots(scenario);
}

async function writeScenarioSnapshots(scenario: Scenario) {
  const db = rawDb();
  const latest = await db
    .prepare(
      `SELECT i.id AS instrument_id, i.symbol, ms.*
       FROM instruments i
       JOIN market_snapshots ms
         ON ms.instrument_id = i.id
        AND ms.session_number = (
          SELECT MAX(x.session_number) FROM market_snapshots x
          WHERE x.instrument_id = i.id
        )
       ORDER BY i.symbol`,
    )
    .all<Record<string, string | number | null>>();
  const statements: D1PreparedStatement[] = [];
  const targets = latest.results.filter((row) => {
    if (scenario === 'advance' || scenario === 'return_later') return true;
    if (scenario === 'unusual') return row.symbol === 'HDFCBANK';
    if (scenario === 'volume') return row.symbol === 'INFY';
    if (scenario === 'stale') return row.symbol === 'RELIANCE';
    return row.symbol === 'ICICIBANK';
  });

  const normalMoves: Record<string, number> = {
    ASIANPAINT: -0.002,
    HDFCBANK: 0.006,
    HINDUNILVR: 0.001,
    ICICIBANK: 0.004,
    INFY: -0.003,
    LT: 0.005,
    RELIANCE: 0.002,
    TATAMOTORS: 0.009,
    TCS: 0.003,
    WIPRO: -0.004,
  };

  for (const row of targets) {
    const symbol = String(row.symbol);
    const sessionNumber = Number(row.session_number) + 1;
    let move =
      scenario === 'advance' || scenario === 'return_later'
        ? (normalMoves[symbol] ?? 0.002)
        : 0;
    let volumeMultiplier =
      scenario === 'advance' || scenario === 'return_later' ? 1.05 : 1;
    let freshness = 'LIVE';
    let confidence = 'HIGH';
    let secondaryPrice: number | null = null;
    let secondarySource: string | null = null;
    if (scenario === 'unusual') {
      move = 0.052;
      volumeMultiplier = 3.8;
    }
    if (scenario === 'return_later' && symbol === 'HDFCBANK') {
      move = 0.052;
      volumeMultiplier = 3.8;
    }
    if (scenario === 'volume') {
      move = 0.004;
      volumeMultiplier = 3.6;
    }
    if (scenario === 'stale') {
      freshness = 'STALE';
      confidence = 'LOW';
    }
    const price = Number(row.price) * (1 + move);
    if (scenario === 'conflict') {
      freshness = 'CONFLICTED';
      confidence = 'DEGRADED';
      secondarySource = 'Demo secondary source';
      secondaryPrice = price * 1.032;
    }
    const receivedAt = new Date();
    const sourceAt = new Date(receivedAt);
    if (scenario === 'stale') {
      sourceAt.setUTCDate(sourceAt.getUTCDate() - 5);
    }
    const timestamp = sourceAt.toISOString();
    const previousPath = JSON.parse(String(row.price_path_json)) as number[];
    const nextPath = [...previousPath.slice(-8), Number(price.toFixed(2))];
    const id = `snap-${symbol}-${scenario}-${sessionNumber}`;
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO market_snapshots (id, instrument_id, session_number, price, volume, average_volume_20d, benchmark_return, day_return, source, secondary_source, secondary_price, source_timestamp, received_at, freshness_status, confidence_status, ingestion_key, event_title, news_sentiment, news_mentions, price_path_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          id,
          String(row.instrument_id),
          sessionNumber,
          Number(price.toFixed(2)),
          Math.round(Number(row.average_volume_20d) * volumeMultiplier),
          Number(row.average_volume_20d),
          0.004,
          move,
          'Demo simulator',
          secondarySource,
          secondaryPrice ? Number(secondaryPrice.toFixed(2)) : null,
          timestamp,
          receivedAt.toISOString(),
          freshness,
          confidence,
          `demo:${symbol}:${scenario}:${sessionNumber}`,
          null,
          'NEUTRAL',
          Number(row.news_mentions),
          JSON.stringify(nextPath),
        ),
    );
  }
  if (statements.length) await db.batch(statements);
  return { scenario, snapshotsCreated: statements.length };
}

export async function resetDemoData() {
  const db = rawDb();
  await db.batch([
    db.prepare('DELETE FROM review_events'),
    db.prepare('DELETE FROM session_checkpoint_snapshots'),
    db.prepare('DELETE FROM session_checkpoints'),
    db.prepare('DELETE FROM watchlist_items'),
    db.prepare('DELETE FROM watchlists'),
    db.prepare('DELETE FROM market_snapshots'),
    db.prepare('DELETE FROM instruments'),
    db.prepare('DELETE FROM users'),
  ]);
  await seedDemoData();
  return { reset: true };
}
