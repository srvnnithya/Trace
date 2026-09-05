import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

void test('session checkpoints preserve one exact snapshot per instrument', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync('drizzle/0000_sweet_wolfpack.sql', 'utf8'));
  db.exec(readFileSync('drizzle/0001_sleepy_mystique.sql', 'utf8'));

  db.exec(`
    INSERT INTO users VALUES ('user', 'Local user', '2026-09-05T00:00:00Z');
    INSERT INTO instruments VALUES ('instrument', 'TRACE', 'Trace Ltd', 'NSE', 'Test', 'NIFTY 50', 0.01, 120, 80);
    INSERT INTO market_snapshots VALUES ('snapshot', 'instrument', 1, 100, 1000, 900, 0, 0, 'Test', NULL, NULL, '2026-09-05T00:00:00Z', '2026-09-05T00:00:01Z', 'LIVE', 'HIGH', 'test:snapshot', NULL, NULL, 0, '[100]');
    INSERT INTO watchlists VALUES ('watchlist', 'user', 'Test list', 'NIFTY 50', 0.02, 2, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z');
    INSERT INTO watchlist_items VALUES ('item', 'user', 'watchlist', 'instrument', 0, 0, 'snapshot', '2026-09-05T00:00:00Z', NULL, NULL, '2026-09-05T00:00:00Z');
    INSERT INTO session_checkpoints VALUES ('checkpoint', 'user', 'watchlist', '2026-09-05T00:01:00Z', 1);
    INSERT INTO session_checkpoint_snapshots VALUES ('mapping', 'checkpoint', 'instrument', 'snapshot');
  `);

  const mapping = db
    .prepare(
      `SELECT scs.checkpoint_id, scs.instrument_id, scs.snapshot_id, ms.price
       FROM session_checkpoint_snapshots scs
       JOIN market_snapshots ms ON ms.id = scs.snapshot_id`,
    )
    .get() as Record<string, unknown>;
  assert.deepEqual(
    { ...mapping },
    {
      checkpoint_id: 'checkpoint',
      instrument_id: 'instrument',
      snapshot_id: 'snapshot',
      price: 100,
    },
  );

  db.exec(`
    INSERT INTO market_snapshots VALUES ('snapshot-2', 'instrument', 2, 108, 2500, 900, 0, 0.08, 'Test', NULL, NULL, '2026-09-05T00:02:00Z', '2026-09-05T00:02:01Z', 'LIVE', 'HIGH', 'test:snapshot-2', NULL, NULL, 0, '[100,108]');
  `);
  const afterRefresh = db
    .prepare(
      `SELECT wi.last_reviewed_snapshot_id AS baseline,
              scs.snapshot_id AS checkpoint_snapshot,
              latest.id AS current_snapshot
       FROM watchlist_items wi
       JOIN session_checkpoint_snapshots scs
         ON scs.instrument_id = wi.instrument_id
        AND scs.checkpoint_id = 'checkpoint'
       JOIN market_snapshots latest
         ON latest.instrument_id = wi.instrument_id
        AND latest.session_number = (
          SELECT MAX(candidate.session_number)
          FROM market_snapshots candidate
          WHERE candidate.instrument_id = wi.instrument_id
        )
       WHERE wi.id = 'item'`,
    )
    .get() as Record<string, unknown>;
  assert.deepEqual(
    { ...afterRefresh },
    {
      baseline: 'snapshot',
      checkpoint_snapshot: 'snapshot',
      current_snapshot: 'snapshot-2',
    },
  );

  db.exec(`
    UPDATE watchlist_items
    SET last_reviewed_snapshot_id = 'snapshot-2', reviewed_at = '2026-09-05T00:03:00Z'
    WHERE id = 'item';
    INSERT INTO review_events VALUES ('review', 'item', 'instrument', 'snapshot-2', '2026-09-05T00:03:00Z');
  `);
  const afterReview = db
    .prepare(
      `SELECT wi.last_reviewed_snapshot_id AS baseline,
              scs.snapshot_id AS checkpoint_snapshot,
              COUNT(re.id) AS review_events
       FROM watchlist_items wi
       JOIN session_checkpoint_snapshots scs
         ON scs.instrument_id = wi.instrument_id
        AND scs.checkpoint_id = 'checkpoint'
       LEFT JOIN review_events re ON re.watchlist_item_id = wi.id
       WHERE wi.id = 'item'
       GROUP BY wi.id`,
    )
    .get() as Record<string, unknown>;
  assert.deepEqual(
    { ...afterReview },
    {
      baseline: 'snapshot-2',
      checkpoint_snapshot: 'snapshot',
      review_events: 1,
    },
  );

  assert.throws(
    () =>
      db.exec(
        "INSERT INTO session_checkpoint_snapshots VALUES ('duplicate', 'checkpoint', 'instrument', 'snapshot')",
      ),
    /unique/i,
  );

  db.exec("DELETE FROM session_checkpoints WHERE id = 'checkpoint'");
  const remaining = db
    .prepare('SELECT COUNT(*) AS count FROM session_checkpoint_snapshots')
    .get() as { count: number };
  assert.equal(remaining.count, 0);
  db.close();
});
