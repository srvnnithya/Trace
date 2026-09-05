import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const instruments = sqliteTable(
  'instruments',
  {
    id: text('id').primaryKey(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    exchange: text('exchange').notNull(),
    sector: text('sector').notNull(),
    benchmarkSymbol: text('benchmark_symbol').notNull(),
    normalDailyVolatility: real('normal_daily_volatility').notNull(),
    high52w: real('high_52w').notNull(),
    low52w: real('low_52w').notNull(),
  },
  (table) => [uniqueIndex('uq_instruments_symbol').on(table.symbol)],
);

export const marketSnapshots = sqliteTable(
  'market_snapshots',
  {
    id: text('id').primaryKey(),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => instruments.id),
    sessionNumber: integer('session_number').notNull(),
    price: real('price').notNull(),
    volume: integer('volume').notNull(),
    averageVolume20d: integer('average_volume_20d').notNull(),
    benchmarkReturn: real('benchmark_return').notNull(),
    dayReturn: real('day_return').notNull(),
    source: text('source').notNull(),
    secondarySource: text('secondary_source'),
    secondaryPrice: real('secondary_price'),
    sourceTimestamp: text('source_timestamp').notNull(),
    receivedAt: text('received_at').notNull(),
    freshnessStatus: text('freshness_status').notNull(),
    confidenceStatus: text('confidence_status').notNull(),
    ingestionKey: text('ingestion_key').notNull(),
    eventTitle: text('event_title'),
    newsSentiment: text('news_sentiment'),
    newsMentions: integer('news_mentions').notNull().default(0),
    pricePathJson: text('price_path_json').notNull(),
  },
  (table) => [
    uniqueIndex('uq_market_snapshots_ingestion_key').on(table.ingestionKey),
    index('idx_market_snapshots_instrument_session').on(
      table.instrumentId,
      table.sessionNumber,
    ),
  ],
);

export const watchlists = sqliteTable(
  'watchlists',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    benchmarkSymbol: text('benchmark_symbol').notNull(),
    priceThreshold: real('price_threshold').notNull().default(0.02),
    volumeThreshold: real('volume_threshold').notNull().default(2),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_watchlists_user').on(table.userId)],
);

export const watchlistItems = sqliteTable(
  'watchlist_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    watchlistId: text('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => instruments.id),
    position: integer('position').notNull(),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    lastReviewedSnapshotId: text('last_reviewed_snapshot_id').references(
      () => marketSnapshots.id,
    ),
    reviewedAt: text('reviewed_at'),
    priceThreshold: real('price_threshold'),
    volumeThreshold: real('volume_threshold'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_watchlist_items_watchlist_instrument').on(
      table.watchlistId,
      table.instrumentId,
    ),
    index('idx_watchlist_items_watchlist_position').on(
      table.watchlistId,
      table.position,
    ),
  ],
);

export const reviewEvents = sqliteTable(
  'review_events',
  {
    id: text('id').primaryKey(),
    watchlistItemId: text('watchlist_item_id')
      .notNull()
      .references(() => watchlistItems.id, { onDelete: 'cascade' }),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => instruments.id),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => marketSnapshots.id),
    reviewedAt: text('reviewed_at').notNull(),
  },
  (table) => [
    index('idx_review_events_item_time').on(
      table.watchlistItemId,
      table.reviewedAt,
    ),
  ],
);

export const sessionCheckpoints = sqliteTable(
  'session_checkpoints',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    watchlistId: text('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    delivered: integer('delivered', { mode: 'boolean' })
      .notNull()
      .default(true),
  },
  (table) => [
    index('idx_session_checkpoints_user_time').on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const sessionCheckpointSnapshots = sqliteTable(
  'session_checkpoint_snapshots',
  {
    id: text('id').primaryKey(),
    checkpointId: text('checkpoint_id')
      .notNull()
      .references(() => sessionCheckpoints.id, { onDelete: 'cascade' }),
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => instruments.id),
    snapshotId: text('snapshot_id')
      .notNull()
      .references(() => marketSnapshots.id),
  },
  (table) => [
    uniqueIndex('uq_checkpoint_snapshots_checkpoint_instrument').on(
      table.checkpointId,
      table.instrumentId,
    ),
  ],
);

export const marketRefreshState = sqliteTable('market_refresh_state', {
  watchlistId: text('watchlist_id')
    .primaryKey()
    .references(() => watchlists.id, { onDelete: 'cascade' }),
  lastAttemptAt: text('last_attempt_at').notNull(),
  lastResult: text('last_result').notNull(),
  message: text('message'),
});
