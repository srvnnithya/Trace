'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock3,
  DatabaseZap,
  RefreshCw,
  SkipForward,
  Volume2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const scenarios = [
  {
    id: 'return_later',
    icon: Activity,
    title: 'Run the complete return-later story',
    detail:
      'Review all, save exact per-stock checkpoints, then advance every stock with only HDFCBANK crossing a meaningful threshold.',
  },
  {
    id: 'advance',
    icon: SkipForward,
    title: 'Advance one market session',
    detail: 'Create a new deterministic snapshot for every instrument.',
  },
  {
    id: 'unusual',
    icon: Zap,
    title: 'Create an unusual price move',
    detail: 'Push HDFCBANK 5.2% higher on 3.8× normal volume.',
  },
  {
    id: 'volume',
    icon: Volume2,
    title: 'Create a volume spike',
    detail:
      'Increase INFY activity to 3.6× average with little price movement.',
  },
  {
    id: 'stale',
    icon: Clock3,
    title: 'Make provider data stale',
    detail: 'Publish a stale RELIANCE observation with low confidence.',
  },
  {
    id: 'conflict',
    icon: AlertTriangle,
    title: 'Simulate provider conflict',
    detail: 'Create disagreeing ICICIBANK prices beyond the 0.8% tolerance.',
  },
] as const;

export default function DemoLab() {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('Seed scenario ready');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: 'scenario' | 'reset', scenario?: string) => {
    setBusy(scenario ?? action);
    setError(null);
    try {
      const response = await fetch('/api/delta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scenario }),
      });
      const body = (await response.json()) as {
        error?: string;
        result?: {
          snapshotsCreated?: number;
          expectedMeaningfulSymbols?: string[];
        };
      };
      if (!response.ok) throw new Error(body.error ?? 'Scenario failed.');
      setMessage(
        action === 'reset'
          ? 'Demo data restored to its original checkpoints'
          : body.result?.expectedMeaningfulSymbols
            ? `Return-later state ready · expected meaningful change: ${body.result.expectedMeaningfulSymbols.join(', ')}`
            : `${body.result?.snapshotsCreated ?? 0} deterministic snapshot${body.result?.snapshotsCreated === 1 ? '' : 's'} created`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Scenario failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#0b0f17] px-5 py-8 text-[#f7f8fa] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#6fe3b4] text-[#0b0f17]">
              <DatabaseZap className="size-5" />
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-[-0.04em]">
                TRACE LAB
              </div>
              <div className="text-xs text-white/45">
                Developer-only return-later simulator
              </div>
            </div>
          </div>
          <Link href="/">
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft /> Back to product
            </Button>
          </Link>
        </header>

        <section className="py-10">
          <div className="max-w-2xl">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[#6fe3b4]">
              <Activity className="size-3.5" /> Demonstration controls
            </p>
            <h1 className="text-[clamp(2.5rem,7vw,5.8rem)] font-extrabold leading-[.9] tracking-[-.07em]">
              Leave. Move time.
              <br />
              Come back.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/55">
              Review stocks in the customer view, return here to change the
              market, then reopen TRACE. Snapshot ingestion is idempotent and
              review baselines stay untouched.
            </p>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          {scenarios.map((scenario, index) => {
            const Icon = scenario.icon;
            return (
              <button
                key={scenario.id}
                disabled={Boolean(busy)}
                onClick={() => run('scenario', scenario.id)}
                className="group flex min-h-36 items-start gap-4 rounded-2xl border border-white/10 bg-white/[.04] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#6fe3b4]/50 hover:bg-white/[.07] disabled:opacity-50"
              >
                <span className="font-mono text-[10px] text-white/35">
                  0{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Icon className="mb-5 size-5 text-[#6fe3b4]" />
                  <h2 className="font-bold tracking-[-.02em]">
                    {scenario.title}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    {scenario.detail}
                  </p>
                </div>
                {busy === scenario.id ? (
                  <RefreshCw className="size-4 animate-spin text-[#6fe3b4]" />
                ) : (
                  <span className="text-white/25 transition group-hover:translate-x-1 group-hover:text-[#6fe3b4]">
                    →
                  </span>
                )}
              </button>
            );
          })}
          <button
            disabled={Boolean(busy)}
            onClick={() => run('reset')}
            className="group flex min-h-36 items-start gap-4 rounded-2xl border border-dashed border-white/15 p-5 text-left transition hover:border-red-400/60 hover:bg-red-500/[.06] disabled:opacity-50"
          >
            <span className="font-mono text-[10px] text-white/35">07</span>
            <div className="min-w-0 flex-1">
              <RefreshCw
                className={`mb-5 size-5 text-red-300 ${busy === 'reset' ? 'animate-spin' : ''}`}
              />
              <h2 className="font-bold tracking-[-.02em]">Reset demo data</h2>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Restore the original seven-stock watchlist, snapshots and
                baseline state.
              </p>
            </div>
          </button>
        </div>

        <output
          className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs ${error ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-[#6fe3b4]/20 bg-[#6fe3b4]/[.06] text-[#6fe3b4]'}`}
        >
          <span
            className={`size-2 rounded-full ${error ? 'bg-red-400' : 'bg-[#6fe3b4]'}`}
          />
          {error ?? message}
        </output>
      </div>
    </main>
  );
}
