# TRACE

TRACE is an attention-first market watchlist. It answers “what changed since I last reviewed this stock, how unusual is that change, and why does it matter?” rather than presenting a flat price table.

The app is a full-stack Vinext/React site with a Cloudflare D1-compatible database. During local development, that database runs on this computer through Miniflare. Its market-data chain tries Twelve Data when configured, then a local yfinance service, and finally the most recent cached/seeded snapshot. Watchlists, personal thresholds, market snapshots, session checkpoints, and review baselines persist in the local database across reloads and development-server restarts.

## Product model

Market refreshes and user attention are separate:

```text
shared market snapshot stream
            │
            ├── current snapshot
            │
user ── watchlist item ── last reviewed snapshot
            │
            └── deterministic diff → score → explanation
```

Opening or refreshing TRACE never advances a review baseline. A baseline changes only when the user marks an item reviewed, dismisses its current signal, or explicitly chooses “Mark all reviewed.” Leaving the page creates a session checkpoint and records the exact current snapshot for every stock in that watchlist. Session checkpoints support “what changed since I left” without acknowledging any stock-specific review signal.

## Meaningful-change engine

For each watchlist item:

```text
return_since_seen = (current_price - baseline_price) / baseline_price
relative_move = return_since_seen - benchmark_return
volume_ratio = current_volume / average_20_day_volume
volatility_score = abs(return_since_seen) / max(normal_daily_volatility, 0.01)
```

The 0–100 attention score combines capped, inspectable components:

- Price unusualness: up to 30 points
- Volume anomaly: up to 25 points
- Benchmark-relative movement: up to 20 points
- 52-week level crossing: 12 points
- New corporate event: 13 points
- Unexpected move with no scheduled event: 8 points
- Personal rule match: 5 points

The result is multiplied by a data-quality factor: live `1.0`, delayed `0.85`, conflicted `0.60`, stale `0.55`, or unavailable `0.30`. Scores at 75+ need attention, 45–74 are worth noting, and lower scores are quiet. Every score is accompanied by the contributing facts.

## Data architecture

- `instruments` stores shared instrument metadata and normal volatility.
- `market_snapshots` is append-only and uses a unique ingestion key for idempotency.
- `watchlists` and `watchlist_items` are owned through `user_id`.
- `last_reviewed_snapshot_id` is the per-item attention checkpoint.
- `review_events` is the auditable acknowledgement ledger.
- `session_checkpoints` records return-later sessions without erasing attention state.
- `session_checkpoint_snapshots` maps every checkpoint to the exact market snapshot captured for each tracked instrument.

The database migrations are in `drizzle/0000_sweet_wolfpack.sql` and `drizzle/0001_sleepy_mystique.sql`. Application queries use prepared statements, shared snapshots are never deleted when a stock is removed, and common item/snapshot access paths are indexed.

## Data integrity decisions

- Every snapshot stores its source timestamp, receive time, provider, freshness, confidence, and ingestion key.
- Freshness is recalculated when the dashboard is read, so an old quote cannot keep a historical `LIVE` label indefinitely.
- The conflict demo stores both simulated provider prices and displays them side by side. A difference above 0.8% is `CONFLICTED`; TRACE does not average the values and applies the 0.60 confidence multiplier.
- The last known snapshot remains available when a provider is unavailable.
- NSE/BSE regular hours are evaluated in `Asia/Kolkata` (weekdays, 09:15–15:30). Recent closing observations are delayed outside those hours instead of becoming falsely stale overnight; observations older than four days are stale. This prototype does not include an exchange-holiday calendar.
- A single-item review update and its ledger entry run in one D1 batch. A compare-and-set baseline guard detects concurrent changes for that action.

## Failure handling

| Condition                        | Implemented behavior                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Local database cannot be opened  | Full error state with the database error and a retry action; the loading skeleton is not left running. |
| Empty watchlist                  | Dedicated empty state with an add-stock action.                                                        |
| Duplicate stock                  | Database uniqueness constraint plus a visible “already in the watchlist” error.                        |
| Unknown imported symbol          | Import is rejected with the exact unknown symbols; no partial watchlist is created.                    |
| All market providers unavailable | The latest stored values remain visible and a provider-unavailable warning is shown.                   |
| No review baseline               | The stock stays quiet and asks for the first explicit review instead of inventing a comparison.        |
| Stale or conflicting quote       | Timestamp, status and reduced confidence are shown; the score is discounted.                           |

## Scale path

Market state belongs to the instrument, not the user. The current local implementation stores one append-only snapshot stream per instrument and reuses a recent provider observation across watchlists through a five-minute freshness guard. Refresh work is batched and D1 indexes cover instrument/session and watchlist/position lookups.

This is not yet a distributed ingestion service: the local refresh endpoint is still initiated from a selected watchlist and could duplicate an upstream request during simultaneous stale refreshes. At larger scale, a scheduled instrument-level ingester plus a distributed lock would fetch each symbol once, cache latest state, and asynchronously precompute user-specific assessments. Cursor pagination or list virtualization would be added for 100+ rows. That removes provider calls from user page requests without pretending the local prototype already does so.

## Local development

```bash
cp .dev.vars.example .dev.vars
python3 -m venv .venv
.venv/bin/pip install -r requirements-yfinance.txt
# Optionally add TWELVE_DATA_API_KEY to .dev.vars.
npm run dev
npm run build
npm test
```

`npm run dev` starts both TRACE and its loopback-only yfinance fallback. Twelve
Data is attempted first when `TWELVE_DATA_API_KEY` is present. The yfinance
adapter supplies the price, volume, 20-day average volume, volatility, 52-week
range and chart path used by the attention engine. Because Yahoo's public data
can be delayed, its source timestamp and medium/low confidence are shown in the
UI rather than calling it live.

Twelve Data credentials stay in the ignored `.dev.vars` file and are never sent
to the browser. Real credential files are excluded from Git; only the placeholder
`.dev.vars.example` is committed.

The browser refreshes market data when a tab becomes visible and every five
minutes while it remains open. Provider refreshes append shared snapshots; they
never move a user's review baseline. If all remote providers and the local
yfinance process are unavailable, TRACE keeps the latest D1 snapshot and shows
that it is cached/stale instead of presenting it as current.

## Personal controls and portability

- **Review or dismiss:** “Mark reviewed” and “Dismiss” acknowledge only the
  current snapshot. A later meaningful change appears again automatically.
- **Backup and sharing:** the selected watchlist exports to JSON with thresholds
  and pinned state, or to spreadsheet-friendly CSV. Import validates symbols,
  removes duplicates and creates a new backend-persisted watchlist.
- **Theme and keyboard:** light/dark preference is stored on the device. `Cmd/Ctrl
  - K` opens stock search and the left/right arrows move between TRACE views.
- **Installable app:** the web manifest, application icons, service worker and
  offline navigation fallback allow supported browsers to install TRACE. The
  service worker does not provide full offline editing or background sync.
  Opt-in browser notifications can fire when a refresh discovers more stocks
  needing attention while the app is open; there is no remote push service.

The customer product is at `/`. The developer-only return-later controls are at `/demo` and intentionally do not appear in customer navigation.

## Two-minute demo

1. Open `/demo` and choose **Run the complete return-later story**. This explicitly reviews every current stock, stores an exact per-stock session checkpoint, advances all seven stocks, and makes only HDFCBANK cross a meaningful threshold.
2. Return to `/`. The dashboard and Timeline show HDFCBANK as the new meaningful change; ordinary new snapshots remain below the configured thresholds.
3. Open HDFCBANK. Show what changed, the checkpoint/review comparison price, why it is unusual, the score components, and quote freshness.
4. Return to `/demo`, choose **Simulate provider conflict**, then open ICICIBANK to show both values, their percentage disagreement and reduced confidence.
5. Choose **Make provider data stale** and show the timestamp/status treatment for RELIANCE.

## Invariants

Automated tests cover score bounds, quiet-versus-unusual ranking, stale/conflicted confidence, provider conflict tolerance, market-hours classification, missing baselines, benchmark context, personal thresholds, deterministic scoring, import validation and provider parsing. Database tests verify that inserting a market snapshot does not change either review or session baselines, an explicit review changes only the review baseline, checkpoint mappings remain exact, duplicate mappings fail, and checkpoint deletion cascades safely.
