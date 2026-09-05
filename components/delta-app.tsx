'use client';

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Bell,
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileUp,
  Keyboard,
  Layers3,
  List,
  Moon,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Save,
  Smartphone,
  Sun,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DashboardData, StockView } from '@/lib/delta-service';

type Screen = 'dashboard' | 'detail' | 'timeline' | 'watchlist';
type Theme = 'light' | 'dark';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const screenOrder: Screen[] = ['dashboard', 'detail', 'timeline', 'watchlist'];

const watchlistExport = (data: DashboardData) => ({
  format: 'trace-watchlist',
  version: 1,
  name: data.watchlist?.name ?? 'TRACE watchlist',
  benchmarkSymbol: data.watchlist?.benchmarkSymbol ?? 'NIFTY 50',
  priceThreshold: data.watchlist?.priceThreshold ?? 0.02,
  volumeThreshold: data.watchlist?.volumeThreshold ?? 2,
  exportedAt: new Date().toISOString(),
  items: data.stocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((stock) => ({
      symbol: stock.symbol,
      pinned: stock.pinned,
      priceThreshold: stock.priceThreshold,
      volumeThreshold: stock.volumeThreshold,
    })),
});

const safeFilename = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'trace-watchlist';

const downloadFile = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const watchlistCsv = (data: DashboardData) =>
  [
    'symbol,price_threshold_percent,volume_threshold,pinned',
    ...data.stocks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(
        (stock) =>
          `${stock.symbol},${(stock.priceThreshold * 100).toFixed(2)},${stock.volumeThreshold.toFixed(2)},${stock.pinned}`,
      ),
  ].join('\n');

const parseWatchlistFile = (filename: string, content: string) => {
  if (filename.toLowerCase().endsWith('.csv')) {
    const rows = content
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((row) => {
        const [symbol, price, volume, pinned] = row.split(',');
        return {
          symbol: symbol?.trim(),
          priceThreshold: Number(price) / 100,
          volumeThreshold: Number(volume),
          pinned: pinned?.trim().toLowerCase() === 'true',
        };
      });
    return {
      name: filename.replace(/\.csv$/i, '').replaceAll('-', ' '),
      items: rows,
    };
  }
  return JSON.parse(content) as unknown;
};

const money = (value: number | null) =>
  value === null
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      }).format(value);

const signedPercent = (value: number | null) =>
  value === null
    ? 'New'
    : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

const dateTime = (value: string | null) => {
  if (!value) return 'No checkpoint yet';
  return new Intl.DateTimeFormat('en-IN', {
    // Keep server-rendered and browser-rendered text identical. The local
    // server can run in UTC while the browser uses the machine time zone.
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const ageLabel = (seconds: number) => {
  if (seconds < 60) return `${seconds} sec ago`;
  if (seconds < 60 * 60) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 24 * 60 * 60)
    return `${Math.floor(seconds / (60 * 60))} hr ago`;
  return `${Math.floor(seconds / (24 * 60 * 60))} days ago`;
};

const freshnessLabel = (stock: StockView) => {
  const age = `Updated ${ageLabel(stock.quoteAgeSeconds)}`;
  if (stock.freshnessStatus === 'CONFLICTED') return `${age} · Data conflict`;
  if (stock.freshnessStatus === 'UNAVAILABLE')
    return `${age} · Last known value`;
  const state =
    stock.freshnessStatus === 'LIVE'
      ? 'Live'
      : stock.freshnessStatus === 'DELAYED'
        ? 'Delayed'
        : 'Stale';
  return `${age} · ${state}`;
};

const timeOnly = (value: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const avatarTone = (symbol: string) => {
  const tones: Record<string, string> = {
    HDFCBANK: '#175970',
    INFY: '#6A3D9A',
    RELIANCE: '#91320F',
    TCS: '#1B3D69',
    TATAMOTORS: '#3E401A',
    MARUTI: '#1B3D69',
    MARUTISUZUKI: '#1B3D69',
    BAJFINANCE: '#5422A8',
    ICICIBANK: '#5422A8',
    ITC: '#175970',
    SBIN: '#96320F',
    HINDUNILVR: '#C32920',
    LT: '#A5650B',
    ASIANPAINT: '#803B57',
    WIPRO: '#0C6B57',
  };

  if (tones[symbol]) return tones[symbol];

  const palette = [
    '#175970',
    '#91320F',
    '#3E401A',
    '#1B3D69',
    '#5422A8',
    '#C32920',
    '#A5650B',
    '#0C6B57',
    '#803B57',
    '#365314',
    '#334C7D',
    '#71412B',
  ];
  const colorIndex = symbol
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0);

  return palette[colorIndex % palette.length];
};

function Chart({ stock }: { stock: StockView }) {
  const width = 900;
  const height = 260;
  const values = stock.pricePath.length
    ? stock.pricePath
    : [stock.currentPrice];
  const all = stock.baselinePrice ? [...values, stock.baselinePrice] : values;
  const min = Math.min(...all) * 0.995;
  const max = Math.max(...all) * 1.005;
  const span = Math.max(max - min, 1);
  const coords = values.map((value, index) => ({
    x: 28 + (index / Math.max(values.length - 1, 1)) * (width - 56),
    y: height - 28 - ((value - min) / span) * (height - 62),
  }));
  const points = coords.map(({ x, y }) => `${x},${y}`).join(' ');
  const area = `28,${height - 24} ${points} ${width - 28},${height - 24}`;
  const baselineY = stock.baselinePrice
    ? height - 28 - ((stock.baselinePrice - min) / span) * (height - 62)
    : null;
  const positive = (stock.returnSinceSeen ?? stock.dayReturn) >= 0;

  return (
    <section className="trace-chart-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold">Since your last review</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The dotted line is your fixed comparison baseline.
          </p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {values.length} snapshots
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-6 block w-full">
        <title>{stock.symbol} price history since last review</title>
        <defs>
          <linearGradient
            id={`trace-area-${stock.symbol}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0"
              stopColor={positive ? '#0e6b4e' : '#b3261e'}
              stopOpacity=".16"
            />
            <stop
              offset="1"
              stopColor={positive ? '#0e6b4e' : '#b3261e'}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        {[60, 120, 180, 236].map((y) => (
          <line
            key={y}
            x1="28"
            x2={width - 28}
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeOpacity=".07"
          />
        ))}
        {baselineY !== null && (
          <>
            <line
              x1="28"
              x2={width - 28}
              y1={baselineY}
              y2={baselineY}
              stroke="#8d96a6"
              strokeDasharray="8 8"
            />
            <text
              x="34"
              y={Math.max(14, baselineY - 9)}
              fill="#8d96a6"
              fontSize="10"
              fontFamily="monospace"
            >
              LAST REVIEW · {money(stock.baselinePrice)}
            </text>
          </>
        )}
        <polygon points={area} fill={`url(#trace-area-${stock.symbol})`} />
        <polyline
          points={points}
          fill="none"
          stroke={positive ? '#0e6b4e' : '#b3261e'}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.at(-1) && (
          <circle
            cx={coords.at(-1)?.x}
            cy={coords.at(-1)?.y}
            r="5"
            fill={positive ? '#0e6b4e' : '#b3261e'}
          />
        )}
      </svg>
    </section>
  );
}

export function DeltaApp({
  initialData,
}: {
  initialData: DashboardData | null;
}) {
  const [data, setData] = useState(initialData);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [selected, setSelected] = useState<StockView | null>(
    initialData?.stocks[0] ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [listName, setListName] = useState('');
  const [priceThreshold, setPriceThreshold] = useState(2);
  const [volumeThreshold, setVolumeThreshold] = useState(2);
  const [theme, setTheme] = useState<Theme>('light');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const importInputRef = useRef<HTMLInputElement>(null);
  const attentionCountRef = useRef(initialData?.counts.attention ?? 0);

  const load = useCallback(async (watchlistId?: string) => {
    const suffix = watchlistId
      ? `?watchlistId=${encodeURIComponent(watchlistId)}`
      : '';
    const response = await fetch(`/api/delta${suffix}`, { cache: 'no-store' });
    const body = (await response.json()) as DashboardData & { error?: string };
    if (!response.ok)
      throw new Error(body.error ?? 'Unable to load the watchlist.');
    const priorAttention = attentionCountRef.current;
    attentionCountRef.current = body.counts.attention;
    if (
      body.counts.attention > priorAttention &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      'serviceWorker' in navigator
    ) {
      void navigator.serviceWorker.ready.then((registration) =>
        registration.showNotification('TRACE needs your attention', {
          body: `${body.counts.attention} ${body.counts.attention === 1 ? 'stock has' : 'stocks have'} a meaningful new change.`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'trace-attention',
        }),
      );
    }
    setData(body);
    setSelected((current) =>
      current
        ? (body.stocks.find((stock) => stock.itemId === current.itemId) ??
          body.stocks[0] ??
          null)
        : (body.stocks[0] ?? null),
    );
    return body;
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('trace-theme');
    const preferred: Theme =
      savedTheme === 'dark' || savedTheme === 'light'
        ? savedTheme
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.classList.toggle('dark', preferred === 'dark');
    const timer = window.setTimeout(() => {
      setTheme(preferred);
      setNotificationPermission(
        'Notification' in window ? Notification.permission : 'unsupported',
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    return () =>
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
  }, []);

  useEffect(() => {
    if (initialData) return;
    const timer = window.setTimeout(() => {
      void load().catch((reason: Error) => setError(reason.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialData, load]);

  useEffect(() => {
    const watchlistId = data?.watchlist?.id;
    if (!watchlistId) return;
    let pendingCheckpointId: string | null = null;
    const checkpoint = () => {
      pendingCheckpointId ??= crypto.randomUUID();
      const payload = JSON.stringify({
        action: 'checkpoint',
        watchlistId,
        checkpointId: pendingCheckpointId,
      });
      const queued = navigator.sendBeacon?.(
        '/api/delta',
        new Blob([payload], { type: 'application/json' }),
      );
      if (queued) return;
      void fetch('/api/delta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      });
    };
    const onVisibilityChange = () => {
      if (document.hidden) checkpoint();
      else pendingCheckpointId = null;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', checkpoint);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', checkpoint);
    };
  }, [data?.watchlist?.id]);

  const mutate = useCallback(
    async (
      payload: Record<string, unknown>,
      message: string,
      nextWatchlistId?: string,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch('/api/delta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as {
          error?: string;
          result?: { id?: string };
        };
        if (!response.ok) throw new Error(result.error ?? 'Action failed.');
        await load(nextWatchlistId ?? data?.watchlist?.id);
        setNotice(message);
        window.setTimeout(() => setNotice(null), 2600);
        return result;
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : 'Action failed.';
        setError(message);
        throw reason;
      } finally {
        setBusy(false);
      }
    },
    [data, load],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearch('');
        setAddOpen(true);
        return;
      }
      if (
        editing ||
        document.querySelector('[role="dialog"]') ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key)
      )
        return;
      event.preventDefault();
      const currentIndex = screenOrder.indexOf(screen);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex =
        (currentIndex + direction + screenOrder.length) % screenOrder.length;
      setScreen(screenOrder[nextIndex]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen]);

  useEffect(() => {
    const watchlistId = data?.watchlist?.id;
    if (!watchlistId) return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try {
        const response = await fetch('/api/delta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh_market', watchlistId }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? 'Market refresh failed.');
        }
        if (active) await load(watchlistId);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : 'Market refresh failed.',
          );
        }
      } finally {
        refreshing = false;
      }
    };
    const onVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };
    const timer = window.setInterval(() => void refresh(), 5 * 60_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [data?.watchlist?.id, load]);

  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool || !data?.watchlist) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'read_attention_summary',
          title: 'Read attention summary',
          description: 'Read the current TRACE attention ranking and reasons.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            watchlist: data.watchlist?.name,
            counts: data.counts,
            top: data.stocks.slice(0, 3).map((stock) => ({
              symbol: stock.symbol,
              score: stock.score,
              reason: stock.headline,
            })),
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [data]);

  const openDetail = (stock: StockView) => {
    setSelected(stock);
    setPriceThreshold(stock.priceThreshold * 100);
    setVolumeThreshold(stock.volumeThreshold);
    setScreen('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const universe = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.universe ?? []).filter(
      (item) =>
        !query ||
        item.symbol.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.sector.toLowerCase().includes(query),
    );
  }, [data?.universe, search]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    window.localStorage.setItem('trace-theme', nextTheme);
    setTheme(nextTheme);
  };

  const exportWatchlist = (format: 'json' | 'csv') => {
    if (!data?.watchlist) return;
    const filename = safeFilename(data.watchlist.name);
    if (format === 'csv') {
      downloadFile(`${filename}.csv`, watchlistCsv(data), 'text/csv');
    } else {
      downloadFile(
        `${filename}.json`,
        JSON.stringify(watchlistExport(data), null, 2),
        'application/json',
      );
    }
    showNotice(`${data.watchlist.name} exported as ${format.toUpperCase()}`);
  };

  const shareWatchlist = async () => {
    if (!data?.watchlist) return;
    const content = JSON.stringify(watchlistExport(data), null, 2);
    const file = new File(
      [content],
      `${safeFilename(data.watchlist.name)}.json`,
      { type: 'application/json' },
    );
    if (
      navigator.share &&
      (!navigator.canShare || navigator.canShare({ files: [file] }))
    ) {
      try {
        await navigator.share({
          title: `TRACE · ${data.watchlist.name}`,
          text: 'Import this watchlist into TRACE.',
          files: [file],
        });
        showNotice('Watchlist shared');
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError')
          return;
      }
    }
    downloadFile(file.name, content, 'application/json');
    showNotice('Sharing is unavailable here, so TRACE downloaded the backup');
  };

  const importWatchlistFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseWatchlistFile(file.name, await file.text());
      const result = await mutate(
        { action: 'import_watchlist', watchlist: parsed },
        'Watchlist imported',
      );
      if (result.result?.id) {
        await load(result.result.id);
        setScreen('watchlist');
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to import watchlist.',
      );
    }
  };

  const installApp = async () => {
    if (!installPrompt) {
      showNotice('Use your browser’s Install App command to add TRACE');
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') showNotice('TRACE installed');
    setInstallPrompt(null);
  };

  const enableNotifications = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setError('This browser does not support app notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== 'granted') {
      setError(
        'Notifications remain off. You can allow them in browser settings.',
      );
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('TRACE browser alerts enabled', {
      body: 'Alerts can appear while TRACE is open and refreshing market data.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'trace-enabled',
    });
    showNotice('Browser alerts enabled while TRACE is running');
  };

  if (!data && error) {
    return (
      <main className="min-h-screen bg-background px-5 py-16 text-foreground">
        <div className="mx-auto max-w-[680px]">
          <EmptyState
            title="TRACE could not open its local database"
            detail={error}
            action="Try again"
            onAction={() => {
              setError(null);
              void load().catch((reason: Error) => setError(reason.message));
            }}
          />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-background px-5 py-16 text-foreground">
        <div className="mx-auto max-w-[980px] animate-pulse">
          <div className="h-12 w-48 rounded-xl bg-muted" />
          <div className="mt-16 h-24 w-2/3 rounded-2xl bg-muted" />
          <div className="mt-8 space-y-4">
            <div className="h-40 rounded-3xl bg-muted" />
            <div className="h-40 rounded-3xl bg-muted" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-20 text-foreground">
      <div className="mx-auto max-w-[980px] px-[22px]">
        <header className="flex h-[92px] items-center justify-between border-b border-border">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => setScreen('dashboard')}
            aria-label="Open TRACE dashboard"
          >
            <span className="grid size-[22px] place-items-center rounded-md bg-[#0b0f17] text-[#6fe3b4]">
              <Activity className="size-3.5" strokeWidth={2.6} />
            </span>
            <span>
              <strong className="block font-heading text-[18px] font-extrabold tracking-[-.01em]">
                TRACE
              </strong>
              <small className="block text-xs text-muted-foreground">
                The market, since you left.
              </small>
            </span>
          </button>
          <div className="flex items-center gap-1">
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              title={data.marketData.message}
            >
              <span
                className={`size-1.5 rounded-full ${data.marketData.mode === 'live' ? 'bg-[#0f9d6c]' : data.marketData.mode === 'delayed' ? 'bg-[#c57a14]' : 'bg-[#9ca3af]'}`}
              />
              <span className="hidden font-mono text-[11px] sm:inline">
                {data.marketData.lastUpdatedAt
                  ? `Updated ${ageLabel(
                      Math.max(
                        0,
                        Math.floor(
                          (new Date(data.marketData.asOf).getTime() -
                            new Date(data.marketData.lastUpdatedAt).getTime()) /
                            1000,
                        ),
                      ),
                    )}`
                  : 'No provider quote'}{' '}
                ·{' '}
                {data.marketData.health === 'unavailable'
                  ? 'Provider unavailable'
                  : data.marketData.mode === 'live'
                    ? 'Live'
                    : data.marketData.mode === 'delayed'
                      ? 'Delayed'
                      : 'Cached'}
              </span>
              <button
                className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                disabled={busy || !data.watchlist?.id}
                onClick={() => {
                  if (!data.watchlist?.id) return;
                  void mutate(
                    {
                      action: 'refresh_market',
                      watchlistId: data.watchlist.id,
                    },
                    'Market data refreshed',
                  ).catch(() => undefined);
                }}
                aria-label="Refresh market data"
              >
                <RefreshCw
                  className={`size-3.5 ${busy ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
            <button
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-pressed={theme === 'dark'}
            >
              {theme === 'light' ? (
                <Moon className="size-3.5" />
              ) : (
                <Sun className="size-3.5" />
              )}
            </button>
          </div>
        </header>

        <Tabs
          value={screen}
          onValueChange={(value) => setScreen(value as Screen)}
        >
          <TabsList
            variant="line"
            className="h-[58px] w-full justify-start gap-7 overflow-x-auto border-b border-border"
          >
            <TabsTrigger
              value="dashboard"
              className="h-full flex-none rounded-none px-0 text-sm"
            >
              Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="detail"
              className="h-full flex-none rounded-none px-0 text-sm"
            >
              Trace detail
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="h-full flex-none rounded-none px-0 text-sm"
            >
              Timeline
            </TabsTrigger>
            <TabsTrigger
              value="watchlist"
              className="h-full flex-none rounded-none px-0 text-sm"
            >
              Watchlist
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {(data.marketData.mode !== 'live' ||
          data.marketData.health !== 'ok') && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#ead9bd] bg-[#fbf3e7] px-4 py-3 text-xs text-[#7d4a0c] dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Database className="size-4 shrink-0" />
            <span>
              {data.marketData.message}{' '}
              {data.marketData.marketIsOpen
                ? 'The exchange is currently open.'
                : 'The exchange is closed, so the latest closing quote may correctly be delayed rather than stale.'}
            </span>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="size-4" />
            </button>
          </div>
        )}

        {screen === 'dashboard' && (
          <Dashboard
            data={data}
            openDetail={openDetail}
            onAdd={() => setAddOpen(true)}
            busy={busy}
            onReview={(stock) =>
              mutate(
                { action: 'review', itemId: stock.itemId },
                `${stock.symbol} signal dismissed`,
              ).catch(() => undefined)
            }
            onReviewAll={() => {
              if (!data.watchlist) return;
              void mutate(
                {
                  action: 'review_all',
                  watchlistId: data.watchlist.id,
                },
                'All current stock snapshots marked reviewed',
              ).catch(() => undefined);
            }}
          />
        )}
        {screen === 'detail' && selected && (
          <Detail
            stock={selected}
            busy={busy}
            priceThreshold={priceThreshold}
            volumeThreshold={volumeThreshold}
            setPriceThreshold={setPriceThreshold}
            setVolumeThreshold={setVolumeThreshold}
            onBack={() => setScreen('dashboard')}
            onReview={() =>
              mutate(
                { action: 'review', itemId: selected.itemId },
                `${selected.symbol} marked reviewed`,
              ).catch(() => undefined)
            }
            onSaveThresholds={() =>
              mutate(
                {
                  action: 'thresholds',
                  itemId: selected.itemId,
                  priceThreshold: priceThreshold / 100,
                  volumeThreshold,
                },
                `Sensitivity updated for ${selected.symbol}`,
              ).catch(() => undefined)
            }
          />
        )}
        {screen === 'detail' && !selected && (
          <EmptyState
            title="Choose a stock first"
            detail="Open any dashboard row to inspect its change."
            action="Back to dashboard"
            onAction={() => setScreen('dashboard')}
          />
        )}
        {screen === 'timeline' && (
          <Timeline
            data={data}
            busy={busy}
            openDetail={openDetail}
            onCheckpoint={() => {
              if (!data.watchlist) return;
              void mutate(
                {
                  action: 'checkpoint',
                  watchlistId: data.watchlist.id,
                  checkpointId: crypto.randomUUID(),
                },
                'Session checkpoint saved',
              ).catch(() => undefined);
            }}
          />
        )}
        {screen === 'watchlist' && (
          <Watchlist
            data={data}
            busy={busy}
            openDetail={openDetail}
            onSwitch={(id) =>
              load(id).catch((reason: Error) => setError(reason.message))
            }
            onCreate={() => {
              setListName('');
              setCreateOpen(true);
            }}
            onRename={() => {
              setListName(data.watchlist?.name ?? '');
              setRenameOpen(true);
            }}
            onDelete={() => setDeleteOpen(true)}
            onAdd={() => setAddOpen(true)}
            onExport={exportWatchlist}
            onImport={() => importInputRef.current?.click()}
            onShare={() => void shareWatchlist()}
            onInstall={() => void installApp()}
            onNotify={() => void enableNotifications()}
            notificationPermission={notificationPermission}
            installAvailable={Boolean(installPrompt)}
            onPin={(stock) =>
              mutate(
                {
                  action: 'set_pinned',
                  itemId: stock.itemId,
                  pinned: !stock.pinned,
                },
                stock.pinned
                  ? `${stock.symbol} unpinned`
                  : `${stock.symbol} pinned`,
              ).catch(() => undefined)
            }
            onRemove={(stock) =>
              mutate(
                { action: 'remove_stock', itemId: stock.itemId },
                `${stock.symbol} removed`,
              ).catch(() => undefined)
            }
          />
        )}
      </div>

      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".json,.csv,application/json,text/csv"
        onChange={(event) => void importWatchlistFile(event)}
        aria-label="Import TRACE watchlist"
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[82vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border p-5 pr-12">
            <DialogTitle className="text-lg font-bold">Add a stock</DialogTitle>
            <DialogDescription>
              Search the ten NSE instruments currently available in this local
              prototype. Stocks already tracked stay disabled.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search symbol, company or sector"
              />
            </div>
          </div>
          <div className="max-h-[54vh] overflow-y-auto px-4 pb-4">
            {universe.length ? (
              universe.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 border-b border-border py-3 last:border-0"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-muted font-mono text-[10px] font-bold">
                    {item.symbol.slice(0, 3)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm">{item.symbol}</strong>
                    <small className="block truncate text-xs text-muted-foreground">
                      {item.name} · {item.sector}
                    </small>
                  </span>
                  <Button
                    size="sm"
                    variant={item.tracked ? 'ghost' : 'outline'}
                    disabled={item.tracked || busy || !data.watchlist}
                    onClick={() => {
                      if (!data.watchlist) return;
                      mutate(
                        {
                          action: 'add_stock',
                          watchlistId: data.watchlist.id,
                          instrumentId: item.id,
                        },
                        `${item.symbol} added`,
                      )
                        .then(() => setAddOpen(false))
                        .catch(() => undefined);
                    }}
                  >
                    {item.tracked ? (
                      <>
                        <Check /> Added
                      </>
                    ) : (
                      <>
                        <Plus /> Add
                      </>
                    )}
                  </Button>
                </div>
              ))
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No matching stock found.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create watchlist</DialogTitle>
            <DialogDescription>
              Give a new set of stocks its own attention baseline.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            placeholder="Watchlist name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !listName.trim()}
              onClick={() =>
                mutate(
                  { action: 'create_watchlist', name: listName },
                  'Watchlist created',
                )
                  .then((result) => {
                    setCreateOpen(false);
                    if (result.result?.id) void load(result.result.id);
                  })
                  .catch(() => undefined)
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename watchlist</DialogTitle>
            <DialogDescription>
              This change is saved in the local TRACE database.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={listName}
            onChange={(event) => setListName(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !data.watchlist || !listName.trim()}
              onClick={() =>
                data.watchlist &&
                mutate(
                  {
                    action: 'rename_watchlist',
                    watchlistId: data.watchlist.id,
                    name: listName,
                  },
                  'Watchlist renamed',
                )
                  .then(() => setRenameOpen(false))
                  .catch(() => undefined)
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{data.watchlist?.name}”?</DialogTitle>
            <DialogDescription>
              The watchlist and its review ledger will be removed. Shared market
              snapshots stay intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !data.watchlist}
              onClick={() =>
                data.watchlist &&
                mutate(
                  {
                    action: 'delete_watchlist',
                    watchlistId: data.watchlist.id,
                  },
                  'Watchlist deleted',
                  '',
                )
                  .then(() => setDeleteOpen(false))
                  .catch(() => undefined)
              }
            >
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {notice && (
        <output className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-xl">
          <Check className="size-4 text-emerald-400" />
          {notice}
        </output>
      )}
    </main>
  );
}

function Dashboard({
  data,
  openDetail,
  onAdd,
  busy,
  onReview,
  onReviewAll,
}: {
  data: DashboardData;
  openDetail: (stock: StockView) => void;
  onAdd: () => void;
  busy: boolean;
  onReview: (stock: StockView) => void;
  onReviewAll: () => void;
}) {
  if (!data.watchlist)
    return (
      <EmptyState
        title="No watchlist yet"
        detail="Create a watchlist to start preserving attention checkpoints."
      />
    );
  if (!data.stocks.length)
    return (
      <EmptyState
        title="Your watchlist is empty"
        detail="Add a stock to start a durable review baseline."
        action="Add a stock"
        onAction={onAdd}
      />
    );

  const top = data.stocks
    .filter((stock) => !stock.reviewed && stock.priority !== 'quiet')
    .slice(0, 2);
  const meaningfulCount = data.stocks.filter(
    (stock) => !stock.reviewed && stock.priority !== 'quiet',
  ).length;
  const movers = data.stocks
    .filter((stock) => !stock.reviewed && (stock.returnSinceSeen ?? 0) > 0.01)
    .slice(0, 4);
  const news = data.stocks
    .filter(
      (stock) =>
        !stock.reviewed && (stock.eventTitle || stock.newsMentions >= 8),
    )
    .slice(0, 3);
  const issues = data.stocks.filter(
    (stock) => !stock.reviewed && stock.freshnessStatus !== 'LIVE',
  );
  const quiet = data.stocks.filter(
    (stock) => stock.priority === 'quiet',
  ).length;
  const meaningfulSinceCheckpoint = data.stocks.filter(
    (stock) =>
      stock.changedSinceCheckpoint && stock.checkpointPriority !== 'quiet',
  ).length;
  const hasUnreviewed = data.stocks.some((stock) => !stock.reviewed);

  return (
    <section className="py-9 sm:py-12">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-[38px] place-items-center rounded-[11px] bg-[#0b0f17] text-white">
            <Bell className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-[-.035em]">
              {meaningfulCount} things changed since your last review
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{data.stocks.length}</span> stocks
              tracked · checkpoint{' '}
              <span className="font-mono">
                {dateTime(data.lastCheckpointAt)}
              </span>
              {data.checkpointSnapshotCount > 0 && (
                <>
                  {' '}
                  · {meaningfulSinceCheckpoint} meaningful since that session
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !hasUnreviewed}
          onClick={onReviewAll}
        >
          <Check /> Mark all reviewed
        </Button>
      </div>

      <div className="space-y-4">
        {top.map((stock) => (
          <HeroChange
            key={stock.itemId}
            stock={stock}
            onOpen={() => openDetail(stock)}
            onDismiss={() => onReview(stock)}
          />
        ))}
      </div>

      <div className="quiet-divider">
        <span />
        {quiet} stocks with no significant changes
        <span />
      </div>

      <StockGroup
        icon={TrendingUp}
        title="Movers"
        count={movers.length}
        stocks={movers}
        openDetail={openDetail}
      />
      <StockGroup
        icon={List}
        title="Stored event context"
        count={news.length}
        stocks={news}
        openDetail={openDetail}
        variant="news"
      />
      <StockGroup
        icon={AlertTriangle}
        title="Data watch"
        count={issues.length}
        stocks={issues}
        openDetail={openDetail}
        variant="warning"
      />
    </section>
  );
}

function HeroChange({
  stock,
  onOpen,
  onDismiss,
}: {
  stock: StockView;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const positive = (stock.returnSinceSeen ?? 0) >= 0;
  return (
    <article className="trace-hero-card">
      <button
        className="flex min-w-0 flex-1 items-start gap-4 text-left"
        onClick={onOpen}
        aria-label={`Open ${stock.symbol} change detail`}
      >
        <span
          className="stock-avatar"
          style={{ backgroundColor: avatarTone(stock.symbol) }}
        >
          {stock.symbol.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-3">
            <span>
              <strong className="block text-base">{stock.name}</strong>
              <small className="font-mono text-[10px] text-muted-foreground">
                {stock.symbol}
              </small>
            </span>
            <span className="text-right">
              <strong className="block font-mono text-base">
                {money(stock.currentPrice)}
              </strong>
              <small
                className={`flex items-center justify-end gap-1 font-mono text-xs font-bold ${positive ? 'text-[#0e6b4e]' : 'text-[#b3261e]'}`}
              >
                {positive ? (
                  <ArrowUp className="size-3" />
                ) : (
                  <ArrowDown className="size-3" />
                )}
                {signedPercent(stock.returnSinceSeen)}
              </small>
            </span>
          </span>
          <span className="mt-4 grid gap-2 text-left text-xs text-muted-foreground sm:grid-cols-[auto_1fr]">
            <span className={`reason-tag ${stock.priority}`}>
              {stock.priority === 'needs_attention'
                ? 'High signal'
                : 'Worth noting'}
            </span>
            <span>
              {stock.headline} ·{' '}
              {stock.explanations[1] ?? stock.explanations[0]}
            </span>
            <span className="reason-tag context">Compared with</span>
            <span>
              {stock.baselinePrice === null
                ? 'No review baseline yet — mark reviewed once to create it'
                : `${money(stock.baselinePrice)} at your last explicit review`}
            </span>
            <span className="reason-tag context">Context</span>
            <span>
              {stock.volumeRatio.toFixed(1)}× average volume ·{' '}
              {signedPercent(stock.relativeMove)} vs {stock.benchmarkSymbol}
            </span>
          </span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 self-center text-muted-foreground"
        onClick={onDismiss}
        title="Acknowledge this snapshot; genuinely new changes can appear again"
      >
        <Check /> Dismiss
      </Button>
    </article>
  );
}

function StockGroup({
  icon: Icon,
  title,
  count,
  stocks,
  openDetail,
  variant = 'default',
}: {
  icon: typeof TrendingUp;
  title: string;
  count: number;
  stocks: StockView[];
  openDetail: (stock: StockView) => void;
  variant?: 'default' | 'news' | 'warning';
}) {
  return (
    <section className="mb-8">
      <div className={`trace-group-title ${variant}`}>
        <Icon className="size-4" />
        <h2>{title}</h2>
        <span>
          {count} {count === 1 ? 'stock' : 'stocks'}
        </span>
      </div>
      <div className="trace-stock-table">
        {stocks.length ? (
          stocks.map((stock) => (
            <button
              key={stock.itemId}
              className="trace-stock-row"
              onClick={() => openDetail(stock)}
              aria-label={`Open ${stock.symbol} change detail`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className="stock-avatar small"
                  style={{ backgroundColor: avatarTone(stock.symbol) }}
                >
                  {stock.symbol.slice(0, 2)}
                </span>
                <span className="min-w-0 text-left">
                  <strong className="block truncate text-sm">
                    {stock.name}
                  </strong>
                  <small className="block truncate text-[11px] text-muted-foreground">
                    {stock.headline}
                  </small>
                </span>
              </span>
              <span
                className={`font-mono text-sm font-bold ${(stock.returnSinceSeen ?? 0) >= 0 ? 'text-[#0e6b4e]' : 'text-[#b3261e]'}`}
              >
                {signedPercent(stock.returnSinceSeen)}
              </span>
              <span className="hidden text-right text-xs text-muted-foreground sm:block">
                {stock.eventTitle
                  ? 'Stored event context'
                  : stock.freshnessStatus !== 'LIVE'
                    ? freshnessLabel(stock)
                    : `${stock.volumeRatio.toFixed(1)}× normal volume`}
              </span>
            </button>
          ))
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Nothing in this group right now.
          </p>
        )}
      </div>
    </section>
  );
}

function Detail({
  stock,
  busy,
  priceThreshold,
  volumeThreshold,
  setPriceThreshold,
  setVolumeThreshold,
  onBack,
  onReview,
  onSaveThresholds,
}: {
  stock: StockView;
  busy: boolean;
  priceThreshold: number;
  volumeThreshold: number;
  setPriceThreshold: (value: number) => void;
  setVolumeThreshold: (value: number) => void;
  onBack: () => void;
  onReview: () => void;
  onSaveThresholds: () => void;
}) {
  const positive = (stock.returnSinceSeen ?? 0) >= 0;
  return (
    <section className="py-9 sm:py-10">
      <button
        className="mb-8 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <span
            className="stock-avatar large"
            style={{ backgroundColor: avatarTone(stock.symbol) }}
          >
            {stock.symbol.slice(0, 2)}
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-.04em]">
              {stock.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {stock.symbol} · {stock.exchange}
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="font-mono text-3xl font-bold">
            {money(stock.currentPrice)}
          </div>
          <div
            className={`mt-1 font-mono text-sm font-bold ${positive ? 'text-[#0e6b4e]' : 'text-[#b3261e]'}`}
          >
            {signedPercent(stock.returnSinceSeen)} since review
          </div>
        </div>
      </div>

      <section className="trace-score-card">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/55">Attention strength</span>
          <strong className="font-mono text-base text-[#6fe3b4]">
            {stock.score}/100
          </strong>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0f9d6c] to-[#6fe3b4]"
            style={{ width: `${stock.score}%` }}
          />
        </div>
        <div className="mt-6 space-y-3">
          {stock.explanations.slice(0, 4).map((line) => (
            <p
              key={line}
              className="flex items-start gap-3 text-sm text-white/75"
            >
              <Check className="mt-0.5 size-4 shrink-0 text-[#6fe3b4]" />
              {line}
            </p>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-white/15 pt-5">
          <div>
            <p className="text-sm text-white">
              This is{' '}
              <strong className="text-[#6fe3b4]">
                {stock.headline.toLowerCase()}
              </strong>
              , not a raw price alert.
            </p>
            <p className="mt-3 text-xs text-white/45">
              {stock.baselinePrice === null
                ? 'No review baseline exists yet. Mark reviewed once to start comparisons.'
                : `Compared with ${money(stock.baselinePrice)} at your last explicit review.`}
            </p>
          </div>
          <Button
            className="bg-white text-[#0b0f17] hover:bg-white/90"
            disabled={busy || stock.reviewed}
            onClick={onReview}
          >
            {stock.reviewed ? (
              <>
                <Check /> Already reviewed
              </>
            ) : (
              <>
                <Check /> Mark reviewed
              </>
            )}
          </Button>
        </div>
      </section>

      <div className="my-7 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Metric
          label="Volume"
          value={`${stock.volumeRatio.toFixed(1)}×`}
          detail="vs 20-day average"
        />
        <Metric
          label="Usual range"
          value={`${((stock.normalVolatility || 0) * 100).toFixed(1)}%`}
          detail={`${stock.volatilityScore?.toFixed(1) ?? '—'}× unusualness`}
        />
        <Metric
          label="vs benchmark"
          value={signedPercent(stock.relativeMove)}
          detail={stock.benchmarkSymbol}
          tone={(stock.relativeMove ?? 0) >= 0 ? 'up' : 'down'}
        />
        <Metric
          label="Since session"
          value={signedPercent(stock.returnSinceCheckpoint)}
          detail={
            stock.checkpointSnapshotId
              ? `from ${money(stock.checkpointPrice)}`
              : 'No mapped session checkpoint'
          }
          tone={(stock.returnSinceCheckpoint ?? 0) >= 0 ? 'up' : 'down'}
        />
        <Metric
          label="Data"
          value={stock.confidenceStatus}
          detail={freshnessLabel(stock)}
        />
      </div>

      <Chart stock={stock} />

      {stock.freshnessStatus === 'CONFLICTED' && (
        <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-100">
            <AlertTriangle className="size-4" /> Provider prices conflict
          </div>
          <p className="mt-2 text-sm text-amber-900/70 dark:text-amber-200/70">
            TRACE does not silently average observations from different sources.
            The prices are{' '}
            {stock.providerDifference === null
              ? 'outside the accepted range'
              : `${(stock.providerDifference * 100).toFixed(1)}% apart`}
            , beyond the 0.8% tolerance. The score has been reduced until the
            conflict clears.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-3 dark:bg-black/20">
              <small className="text-muted-foreground">{stock.source}</small>
              <strong className="mt-1 block font-mono">
                {money(stock.currentPrice)}
              </strong>
            </div>
            <div className="rounded-xl bg-white p-3 dark:bg-black/20">
              <small className="text-muted-foreground">
                {stock.secondarySource}
              </small>
              <strong className="mt-1 block font-mono">
                {money(stock.secondaryPrice)}
              </strong>
            </div>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="trace-settings-card">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-extrabold">Why this score</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Every score component and its point value are shown.
              </p>
            </div>
            <BarChart3 className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-4">
            {stock.components.length ? (
              stock.components.map((component) => (
                <div
                  key={component.key}
                  className="flex items-start justify-between gap-4 border-t border-border py-3"
                >
                  <div>
                    <strong className="text-xs">{component.label}</strong>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {component.detail}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold">
                    +{component.points}
                  </span>
                </div>
              ))
            ) : (
              <p className="border-t border-border py-5 text-sm text-muted-foreground">
                No new signals after this review.
              </p>
            )}
          </div>
        </section>
        <section className="trace-settings-card">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-extrabold">Meaningful to you</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Per-stock rules override watchlist defaults.
              </p>
            </div>
            <Settings2 className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-6 space-y-6">
            <div>
              <div className="mb-2 flex justify-between text-xs font-semibold">
                <span>Price move</span>
                <span className="font-mono">{priceThreshold.toFixed(1)}%</span>
              </div>
              <Slider
                min={0.5}
                max={10}
                step={0.5}
                value={[priceThreshold]}
                onValueChange={(value) =>
                  setPriceThreshold(
                    Array.isArray(value) ? value[0] : Number(value),
                  )
                }
              />
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs font-semibold">
                <span>Volume anomaly</span>
                <span className="font-mono">{volumeThreshold.toFixed(1)}×</span>
              </div>
              <Slider
                min={1}
                max={5}
                step={0.1}
                value={[volumeThreshold]}
                onValueChange={(value) =>
                  setVolumeThreshold(
                    Array.isArray(value) ? value[0] : Number(value),
                  )
                }
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-6"
            disabled={busy}
            onClick={onSaveThresholds}
          >
            Save thresholds
          </Button>
        </section>
      </div>
    </section>
  );
}

function Timeline({
  data,
  busy,
  openDetail,
  onCheckpoint,
}: {
  data: DashboardData;
  busy: boolean;
  openDetail: (stock: StockView) => void;
  onCheckpoint: () => void;
}) {
  const hasMappedCheckpoint = data.checkpointSnapshotCount > 0;
  const active = data.stocks
    .filter(
      (stock) =>
        stock.changedSinceCheckpoint && stock.checkpointPriority !== 'quiet',
    )
    .sort((a, b) => (b.checkpointScore ?? 0) - (a.checkpointScore ?? 0))
    .slice(0, 5);
  return (
    <section className="py-10">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-.04em]">
            Review timeline
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last confirmed checkpoint: {dateTime(data.lastCheckpointAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !data.watchlist}
          onClick={onCheckpoint}
        >
          <Save /> Save checkpoint
        </Button>
      </div>
      <h2 className="timeline-day">SESSION CONTEXT</h2>
      <TimelineItem
        time={timeOnly(data.lastCheckpointAt)}
        title={
          data.lastCheckpointAt
            ? 'Session checkpoint saved'
            : 'No session checkpoint yet'
        }
        detail={
          data.lastCheckpointAt
            ? 'This confirmed checkpoint does not change any stock review baseline.'
            : 'Save a checkpoint to preserve the exact snapshot for every tracked stock.'
        }
      />
      <h2 className="timeline-day mt-10">LATEST STORED SIGNALS</h2>
      {!hasMappedCheckpoint ? (
        <TimelineItem
          time="—"
          title="No mapped session snapshot yet"
          detail="Leave TRACE once to save the exact market snapshot for every tracked stock."
        />
      ) : active.length ? (
        active.map((stock) => (
          <TimelineItem
            key={stock.itemId}
            time={timeOnly(stock.sourceTimestamp)}
            title={`${stock.symbol} · ${stock.checkpointHeadline ?? 'New snapshot stored'}`}
            detail={`Quote ${dateTime(stock.sourceTimestamp)} · ${stock.checkpointExplanations[0] ?? 'A newer market snapshot is available'} · confidence ${stock.confidenceStatus.toLowerCase()}`}
            tone={
              stock.checkpointPriority === 'needs_attention'
                ? 'high'
                : stock.freshnessStatus !== 'LIVE'
                  ? 'warn'
                  : 'normal'
            }
            stock={stock}
            openDetail={openDetail}
          />
        ))
      ) : (
        <TimelineItem
          time="—"
          title="No new meaningful changes since you left"
          detail="Any newer stored quotes stayed below your price, volume and attention thresholds."
        />
      )}
    </section>
  );
}

function TimelineItem({
  time,
  title,
  detail,
  tone = 'normal',
  stock,
  openDetail,
}: {
  time: string;
  title: string;
  detail: string;
  tone?: 'normal' | 'high' | 'warn';
  stock?: StockView;
  openDetail?: (stock: StockView) => void;
}) {
  const content = (
    <div className="min-w-0 flex-1">
      <strong className="block text-sm leading-5">{title}</strong>
      <span className="mt-1.5 block text-xs leading-5">{detail}</span>
    </div>
  );
  return (
    <div className="timeline-item">
      <div className="timeline-time">
        <span className={`timeline-node ${tone}`} />
        <span>{time}</span>
      </div>
      {stock && openDetail ? (
        <button
          className={`timeline-card ${tone} text-left`}
          onClick={() => openDetail(stock)}
          aria-label={`Open ${stock.symbol} detail`}
        >
          {content}
          <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className={`timeline-card ${tone}`}>{content}</div>
      )}
    </div>
  );
}

function Watchlist({
  data,
  busy,
  openDetail,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onAdd,
  onExport,
  onImport,
  onShare,
  onInstall,
  onNotify,
  notificationPermission,
  installAvailable,
  onPin,
  onRemove,
}: {
  data: DashboardData;
  busy: boolean;
  openDetail: (stock: StockView) => void;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onExport: (format: 'json' | 'csv') => void;
  onImport: () => void;
  onShare: () => void;
  onInstall: () => void;
  onNotify: () => void;
  notificationPermission: NotificationPermission | 'unsupported';
  installAvailable: boolean;
  onPin: (stock: StockView) => void;
  onRemove: (stock: StockView) => void;
}) {
  return (
    <section className="py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-.04em]">
            Manage watchlist
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved in this local TRACE workspace across reloads and restarts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onImport}>
            <FileUp /> Import
          </Button>
          <Button onClick={onCreate}>
            <Plus /> New watchlist
          </Button>
        </div>
      </div>
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {data.watchlists.map((list) => (
          <button
            key={list.id}
            onClick={() => onSwitch(list.id)}
            className={`list-chip ${data.watchlist?.id === list.id ? 'active' : ''}`}
          >
            <Layers3 className="size-3.5" />
            {list.name}
            <span>{list.itemCount}</span>
          </button>
        ))}
      </div>
      {data.watchlist ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold">{data.watchlist.name}</h2>
              <p className="text-xs text-muted-foreground">
                Benchmark {data.watchlist.benchmarkSymbol} · price{' '}
                {data.watchlist.priceThreshold * 100}% · volume{' '}
                {data.watchlist.volumeThreshold}×
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onRename}
                aria-label="Rename watchlist"
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                aria-label="Delete watchlist"
              >
                <Trash2 />
              </Button>
              <Button variant="outline" onClick={onAdd}>
                <Plus /> Add stock
              </Button>
            </div>
          </div>
          <div className="mb-6 grid gap-3 rounded-[18px] border border-border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <h3 className="text-sm font-bold">Backup, share and install</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                JSON preserves TRACE settings. CSV works well in spreadsheets.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport('json')}
              >
                <Download /> JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport('csv')}
              >
                <Download /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={onShare}>
                <Share2 /> Share
              </Button>
              <Button variant="outline" size="sm" onClick={onInstall}>
                <Smartphone /> {installAvailable ? 'Install' : 'Install app'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  notificationPermission === 'granted' ||
                  notificationPermission === 'unsupported'
                }
                onClick={onNotify}
              >
                <BellRing />
                {notificationPermission === 'granted'
                  ? 'Alerts on'
                  : notificationPermission === 'denied'
                    ? 'Alerts blocked'
                    : 'Enable alerts'}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
              <Keyboard className="size-3.5" />
              <span>
                <kbd>⌘ K</kbd> search · <kbd>←</kbd> <kbd>→</kbd> move between
                views
              </span>
            </div>
          </div>
          <div className="trace-stock-table">
            {data.stocks.length ? (
              [...data.stocks]
                .sort(
                  (a, b) =>
                    Number(b.pinned) - Number(a.pinned) ||
                    a.position - b.position,
                )
                .map((stock) => (
                  <div key={stock.itemId} className="manage-stock-row">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => openDetail(stock)}
                      aria-label={`Open ${stock.symbol} detail`}
                    >
                      <span
                        className="stock-avatar small"
                        style={{ backgroundColor: avatarTone(stock.symbol) }}
                      >
                        {stock.symbol.slice(0, 2)}
                      </span>
                      <span className="min-w-0">
                        <strong className="flex items-center gap-2 truncate text-sm">
                          {stock.symbol}
                          {stock.pinned && (
                            <Pin className="size-3 fill-current text-violet-600" />
                          )}
                        </strong>
                        <small className="block truncate text-xs text-muted-foreground">
                          {stock.name}
                        </small>
                      </span>
                    </button>
                    <span className="hidden font-mono text-xs text-muted-foreground sm:block">
                      {(stock.priceThreshold * 100).toFixed(1)}% ·{' '}
                      {stock.volumeThreshold.toFixed(1)}×
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      onClick={() => onPin(stock)}
                      aria-label={
                        stock.pinned
                          ? `Unpin ${stock.symbol}`
                          : `Pin ${stock.symbol}`
                      }
                    >
                      {stock.pinned ? <PinOff /> : <Pin />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      onClick={() => onRemove(stock)}
                      aria-label={`Remove ${stock.symbol}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No stocks in this watchlist yet.
              </p>
            )}
          </div>
          <div className="mt-6 grid min-w-0 gap-3 md:grid-cols-3">
            <ProfileCard
              icon={Database}
              label="Storage"
              value="Local D1 database"
              detail="Stored on this computer"
            />
            <ProfileCard
              icon={Clock3}
              label="Last checkpoint"
              value={dateTime(data.lastCheckpointAt)}
              detail="Session context"
            />
            <ProfileCard
              icon={ShieldCheck}
              label="Market data"
              value={`${data.marketData.provider} · ${data.marketData.mode}`}
              detail="Freshness always visible"
            />
          </div>
        </>
      ) : (
        <EmptyState
          title="No watchlist selected"
          detail="Create one to begin tracking meaningful changes."
          action="Create watchlist"
          onAction={onCreate}
        />
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="trace-metric">
      <small>{label}</small>
      <strong
        className={
          tone === 'up'
            ? 'text-[#0e6b4e]'
            : tone === 'down'
              ? 'text-[#b3261e]'
              : ''
        }
      >
        {value}
      </strong>
      <span>{detail}</span>
    </div>
  );
}

function ProfileCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="trace-profile-card">
      <span className="grid size-9 place-items-center rounded-xl bg-muted">
        <Icon className="size-4" />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </div>
  );
}

function EmptyState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className="my-12 rounded-3xl border border-dashed border-border px-6 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted">
        <Layers3 className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-extrabold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {detail}
      </p>
      {action && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {action}
        </Button>
      )}
    </section>
  );
}
