import type { FreshnessStatus } from '@/lib/attention-engine';

export type MarketQuote = {
  price: number;
  volume: number;
  dayReturn: number;
  sourceTimestamp: string;
  high52w: number | null;
  low52w: number | null;
};

export type MarketHistoryMetrics = {
  averageVolume20d: number;
  normalDailyVolatility: number;
  pricePath: number[];
};

export type ProviderQuote = {
  provider: 'Twelve Data' | 'Yahoo Finance';
  quote: MarketQuote;
  history: MarketHistoryMetrics | null;
  isMarketOpen: boolean;
};

const numberValue = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isoTimestamp = (value: unknown, fallback = new Date()) => {
  const numeric = numberValue(value);
  const parsed = numeric
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(typeof value === 'string' ? value : fallback);
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString()
    : parsed.toISOString();
};

export function parseTwelveDataQuote(
  payload: Record<string, unknown>,
  receivedAt = new Date(),
): ProviderQuote {
  if (payload.status === 'error') {
    throw new Error(
      typeof payload.message === 'string'
        ? payload.message
        : 'Twelve Data rejected the quote request.',
    );
  }
  const price = numberValue(payload.close);
  const volume = numberValue(payload.volume);
  if (price === null || price <= 0 || volume === null || volume < 0) {
    throw new Error('Twelve Data returned an incomplete quote.');
  }
  const percentChange = numberValue(payload.percent_change) ?? 0;
  const high52w =
    payload.fifty_two_week && typeof payload.fifty_two_week === 'object'
      ? numberValue((payload.fifty_two_week as Record<string, unknown>).high)
      : null;
  const low52w =
    payload.fifty_two_week && typeof payload.fifty_two_week === 'object'
      ? numberValue((payload.fifty_two_week as Record<string, unknown>).low)
      : null;

  return {
    provider: 'Twelve Data',
    quote: {
      price,
      volume,
      dayReturn: percentChange / 100,
      sourceTimestamp: isoTimestamp(
        payload.last_quote_at ?? payload.timestamp ?? payload.datetime,
        receivedAt,
      ),
      high52w,
      low52w,
    },
    history: null,
    isMarketOpen: payload.is_market_open === true,
  };
}

export async function fetchTwelveDataQuote(
  apiKey: string,
  exchange: string,
  symbol: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL('https://api.twelvedata.com/quote');
  url.searchParams.set('symbol', `${symbol}:${exchange}`);
  url.searchParams.set('interval', '1day');
  url.searchParams.set('apikey', apiKey);
  const response = await fetcher(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.message === 'string'
        ? payload.message
        : `Twelve Data returned HTTP ${response.status}.`,
    );
  }
  return parseTwelveDataQuote(payload);
}

export function parseYfinanceQuote(
  payload: Record<string, unknown>,
  receivedAt = new Date(),
): ProviderQuote {
  const price = numberValue(payload.price);
  const volume = numberValue(payload.volume);
  if (price === null || price <= 0 || volume === null || volume < 0) {
    throw new Error('Yahoo Finance returned an incomplete quote.');
  }
  const pricePath = Array.isArray(payload.price_path)
    ? payload.price_path
        .map(numberValue)
        .filter((value): value is number => value !== null && value > 0)
    : [];
  const averageVolume20d = numberValue(payload.average_volume_20d);
  const normalDailyVolatility = numberValue(payload.normal_daily_volatility);

  return {
    provider: 'Yahoo Finance',
    quote: {
      price,
      volume,
      dayReturn: numberValue(payload.day_return) ?? 0,
      sourceTimestamp: isoTimestamp(payload.source_timestamp, receivedAt),
      high52w: numberValue(payload.high_52w),
      low52w: numberValue(payload.low_52w),
    },
    history:
      averageVolume20d !== null && normalDailyVolatility !== null
        ? {
            averageVolume20d,
            normalDailyVolatility,
            pricePath,
          }
        : null,
    isMarketOpen: payload.is_market_open === true,
  };
}

export async function fetchYfinanceQuote(
  serviceUrl: string,
  exchange: string,
  symbol: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL('/quote', serviceUrl);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('exchange', exchange);
  const response = await fetcher(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Yahoo Finance fallback returned HTTP ${response.status}.`,
    );
  }
  return parseYfinanceQuote(payload);
}

export function classifyProviderFreshness(
  sourceTimestamp: string,
  isMarketOpen: boolean,
  receivedAt = new Date(),
): FreshnessStatus {
  const sourceTime = new Date(sourceTimestamp).getTime();
  const age = Math.max(0, receivedAt.getTime() - sourceTime);
  if (!Number.isFinite(sourceTime)) return 'UNAVAILABLE';
  if (isMarketOpen) {
    if (age <= 15 * 60_000) return 'LIVE';
    if (age <= 60 * 60_000) return 'DELAYED';
    return 'STALE';
  }
  // Closing prices remain valid between sessions. Weekends and ordinary
  // exchange holidays should not turn a last-session quote into fake staleness.
  return age <= 4 * 24 * 60 * 60_000 ? 'DELAYED' : 'STALE';
}

export function isIndianCashMarketOpen(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekday = value('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

export function effectiveFreshnessStatus(
  storedStatus: FreshnessStatus,
  sourceTimestamp: string,
  exchange: string,
  at = new Date(),
): FreshnessStatus {
  if (storedStatus === 'CONFLICTED' || storedStatus === 'UNAVAILABLE') {
    return storedStatus;
  }
  if (storedStatus === 'STALE') return 'STALE';

  const isMarketOpen = ['NSE', 'BSE'].includes(exchange.toUpperCase())
    ? isIndianCashMarketOpen(at)
    : true;
  const currentStatus = classifyProviderFreshness(
    sourceTimestamp,
    isMarketOpen,
    at,
  );

  // A delayed observation can age into stale, but it must never become live
  // merely because the page was opened again.
  if (storedStatus === 'DELAYED' && currentStatus === 'LIVE') return 'DELAYED';
  return currentStatus;
}

export function providerPriceDifference(
  primaryPrice: number,
  secondaryPrice: number | null,
) {
  if (!secondaryPrice || primaryPrice <= 0) return null;
  return Math.abs(secondaryPrice - primaryPrice) / primaryPrice;
}

export function providerPricesConflict(
  primaryPrice: number,
  secondaryPrice: number | null,
  tolerance = 0.008,
) {
  const difference = providerPriceDifference(primaryPrice, secondaryPrice);
  return difference !== null && difference > tolerance;
}
