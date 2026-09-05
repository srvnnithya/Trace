import { NextRequest, NextResponse } from 'next/server';
import {
  addStock,
  createWatchlist,
  deleteWatchlist,
  getDashboard,
  importWatchlist,
  removeStock,
  refreshMarketData,
  renameWatchlist,
  resetDemoData,
  reviewAll,
  reviewItem,
  runScenario,
  saveCheckpoint,
  setPinned,
  updateThresholds,
} from '@/lib/delta-service';

export const dynamic = 'force-dynamic';

const stringValue = (value: unknown) =>
  typeof value === 'string' ? value : '';

export async function GET(request: NextRequest) {
  try {
    const watchlistId =
      request.nextUrl.searchParams.get('watchlistId') ?? undefined;
    return NextResponse.json(await getDashboard(watchlistId));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load TRACE.',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = stringValue(body.action);
    let result: unknown;

    switch (action) {
      case 'review':
        result = await reviewItem(stringValue(body.itemId));
        break;
      case 'review_all':
        result = await reviewAll(stringValue(body.watchlistId));
        break;
      case 'create_watchlist':
        result = await createWatchlist(stringValue(body.name));
        break;
      case 'import_watchlist':
        result = await importWatchlist(body.watchlist);
        break;
      case 'rename_watchlist':
        result = await renameWatchlist(
          stringValue(body.watchlistId),
          stringValue(body.name),
        );
        break;
      case 'delete_watchlist':
        result = await deleteWatchlist(stringValue(body.watchlistId));
        break;
      case 'add_stock':
        result = await addStock(
          stringValue(body.watchlistId),
          stringValue(body.instrumentId),
        );
        break;
      case 'remove_stock':
        result = await removeStock(stringValue(body.itemId));
        break;
      case 'set_pinned':
        result = await setPinned(
          stringValue(body.itemId),
          Boolean(body.pinned),
        );
        break;
      case 'thresholds':
        result = await updateThresholds(
          stringValue(body.itemId),
          Number(body.priceThreshold),
          Number(body.volumeThreshold),
        );
        break;
      case 'checkpoint':
        result = await saveCheckpoint(stringValue(body.watchlistId));
        break;
      case 'refresh_market':
        result = await refreshMarketData(stringValue(body.watchlistId));
        break;
      case 'scenario': {
        const scenario = stringValue(body.scenario);
        if (
          ![
            'return_later',
            'advance',
            'unusual',
            'volume',
            'stale',
            'conflict',
          ].includes(scenario)
        )
          throw new Error('Unknown demo scenario.');
        result = await runScenario(
          scenario as
            | 'return_later'
            | 'advance'
            | 'unusual'
            | 'volume'
            | 'stale'
            | 'conflict',
        );
        break;
      }
      case 'reset':
        result = await resetDemoData();
        break;
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed.';
    const status = /already|unknown|required|between/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
