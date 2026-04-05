# Dashboard UI (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 4 dashboard — config form, scan control, live SSE progress, and pending-work summary — as a single-column page with a persistent top nav.

**Architecture:** `app/page.tsx` is a Client Component that owns all state and the SSE `EventSource`. It passes data down to three child components: `ConfigPanel`, `ScanControl`, `ProgressPanel`. The nav lives in `app/layout.tsx` via a `Nav` Client Component that fetches the pending group count on mount.

**Tech Stack:** Next.js 16.2.2 App Router · TypeScript · Tailwind CSS · shadcn/ui (@base-ui/react) · sonner toasts · next-themes · lucide-react

---

### ⚠️ Before Starting

Read `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md` — this Next.js version may have breaking API changes from your training data.

The dev server must be running throughout (`npm run dev`, currently on port 3001). After each task verify visually in the browser.

---

## File Map

| File | Action |
|---|---|
| `app/layout.tsx` | Modify — add Providers, Nav, Toaster |
| `app/page.tsx` | Modify — replace scaffold with dashboard |
| `app/globals.css` | Modify — add `@keyframes slide` for indeterminate bar |
| `components/Providers.tsx` | Create — ThemeProvider wrapper (Client Component) |
| `components/Nav.tsx` | Create — persistent top nav with active link + badge (Client Component) |
| `components/ConfigPanel.tsx` | Create — config form (Client Component) |
| `components/ScanControl.tsx` | Create — start button + status badge (Client Component) |
| `components/ProgressPanel.tsx` | Create — progress/complete/pending-work display (Client Component) |

---

## Task 1: Layout — Providers, Nav, Toaster

**Files:**
- Create: `components/Providers.tsx`
- Create: `components/Nav.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `components/Providers.tsx`**

The `Sonner` Toaster uses `useTheme` which requires `ThemeProvider`. This wrapper must be a Client Component.

```tsx
'use client';

import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Create `components/Nav.tsx`**

`usePathname` is a Client Component hook, so the nav must be a Client Component. It fetches `/api/stats` on mount to populate the Review Queue badge.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function Nav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d: { pendingGroupCount: number }) => setPendingCount(d.pendingGroupCount))
      .catch(() => {});
  }, []);

  const links = [
    { href: '/', label: 'Dashboard', badge: null },
    { href: '/review', label: 'Review Queue', badge: pendingCount > 0 ? pendingCount : null },
    { href: '/stats', label: 'Stats', badge: null },
  ];

  return (
    <nav className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex h-11 max-w-2xl items-center gap-6 px-4">
        <span className="text-sm font-semibold">✨ Pixel Magic</span>
        <div className="flex items-center gap-5">
          {links.map(({ href, label, badge }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 text-sm transition-colors',
                  active
                    ? 'border-b-2 border-primary pb-0.5 font-semibold text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                {badge != null && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Nav } from '@/components/Nav';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pixel Magic',
  description: 'Image deduplication tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background">
        <Providers>
          <Nav />
          <main className="flex-1">{children}</main>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
```

`suppressHydrationWarning` on `<html>` is required by `next-themes` to avoid a hydration mismatch on the `class` attribute.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify in browser**

Open http://localhost:3001. You should see a nav bar: "✨ Pixel Magic · Dashboard · Review Queue · Stats". Dashboard link should be active (indigo underline).

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx components/Providers.tsx components/Nav.tsx
git commit -m "feat: add persistent nav, ThemeProvider, and Toaster to layout"
```

---

## Task 2: ConfigPanel

**Files:**
- Create: `components/ConfigPanel.tsx`

- [ ] **Step 1: Create `components/ConfigPanel.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppConfig } from '@/types';

const ALL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'tiff', 'gif', 'bmp'];

interface ConfigPanelProps {
  config: AppConfig | null;
  scanning: boolean;
  onSaved: (config: AppConfig) => void;
}

export function ConfigPanel({ config, scanning, onSaved }: ConfigPanelProps) {
  const [inbound, setInbound] = useState('');
  const [outbound, setOutbound] = useState('');
  const [threshold, setThreshold] = useState(90);
  const [extensions, setExtensions] = useState<string[]>(['jpg', 'jpeg', 'png', 'heic', 'webp']);
  const [saving, setSaving] = useState(false);

  // Sync local state when config loads asynchronously
  useEffect(() => {
    if (config) {
      setInbound(config.inboundFolder);
      setOutbound(config.outboundBase);
      setThreshold(config.similarityThreshold);
      setExtensions(config.supportedExtensions);
    }
  }, [config]);

  function toggleExtension(ext: string) {
    setExtensions((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: AppConfig = {
        inboundFolder: inbound.trim(),
        outboundBase: outbound.trim(),
        similarityThreshold: threshold,
        supportedExtensions: extensions,
      };
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        toast.error(error);
      } else {
        toast.success('Configuration saved');
        onSaved(body);
      }
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  // Collapsed summary while a scan is running
  if (scanning) {
    return (
      <div className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {inbound || '—'} → {outbound || '—'} · {threshold}% threshold
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 text-sm">
      <p className="mb-3 font-medium">Configuration</p>

      <div className="mb-3 space-y-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Inbound folder</label>
          <input
            value={inbound}
            onChange={(e) => setInbound(e.target.value)}
            placeholder="/absolute/path/to/inbound"
            className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Output base folder</label>
          <input
            value={outbound}
            onChange={(e) => setOutbound(e.target.value)}
            placeholder="/absolute/path/to/output"
            className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">
          Similarity threshold — <strong>{threshold}%</strong>
        </label>
        <input
          type="range"
          min={80}
          max={100}
          step={1}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>80%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-xs text-muted-foreground">File extensions</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_EXTENSIONS.map((ext) => {
            const active = extensions.includes(ext);
            return (
              <button
                key={ext}
                type="button"
                onClick={() => toggleExtension(ext)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                {ext}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "feat: add ConfigPanel component"
```

---

## Task 3: ScanControl

**Files:**
- Create: `components/ScanControl.tsx`

- [ ] **Step 1: Create `components/ScanControl.tsx`**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ScanStatus } from '@/lib/scanState';

interface ScanControlProps {
  status: ScanStatus;
  lastScanAt: string | null;
  scanDurationMs: number | null;
  onStartScan: () => void;
}

const STATUS_CONFIG: Record<ScanStatus, { label: string; className: string }> = {
  idle:     { label: '● Idle',       className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800' },
  running:  { label: '⟳ Scanning',  className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800' },
  complete: { label: '✓ Complete',   className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800' },
  error:    { label: '✕ Error',      className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800' },
};

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

export function ScanControl({ status, lastScanAt, scanDurationMs, onStartScan }: ScanControlProps) {
  const badge = STATUS_CONFIG[status];

  let timestampLabel = 'Last scan: never';
  if (status === 'complete' && scanDurationMs != null) {
    timestampLabel = `Finished in ${formatDuration(scanDurationMs)}`;
  } else if (lastScanAt) {
    timestampLabel = `Last scan: ${new Date(lastScanAt).toLocaleString()}`;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <Button size="sm" onClick={onStartScan} disabled={status === 'running'}>
        ▶ Start Scan
      </Button>
      <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', badge.className)}>
        {badge.label}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">{timestampLabel}</span>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ScanControl.tsx
git commit -m "feat: add ScanControl component"
```

---

## Task 4: ProgressPanel

**Files:**
- Create: `components/ProgressPanel.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add `@keyframes slide` to `app/globals.css`**

Append to the end of the file:

```css
@keyframes slide {
  0%   { transform: translateX(-100%); }
  50%  { transform: translateX(300%); }
  100% { transform: translateX(300%); }
}
```

- [ ] **Step 2: Create `components/ProgressPanel.tsx`**

Note: the progress bars use plain `<div>` elements rather than the base-ui `Progress` sub-components — base-ui components require their Root context and cannot be used in isolation.

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProgressEvent, ScanStats } from '@/types';
import type { ScanStatus } from '@/lib/scanState';

interface InitialStats {
  pendingGroupCount: number;
  singletonCount: number;
}

interface ProgressPanelProps {
  status: ScanStatus;
  progressEvent: ProgressEvent | null;
  finalStats: ScanStats | null;
  initialStats: InitialStats | null;
  onGoToReview: () => void;
  onAutoKeep: () => void;
}

function StatTile({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-muted/50 px-3 py-2 text-center">
      <span className={cn('tabular-nums text-xl font-bold', color)}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="h-full w-1/3 animate-[slide_1.5s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  );
}

export function ProgressPanel({
  status,
  progressEvent,
  finalStats,
  initialStats,
  onGoToReview,
  onAutoKeep,
}: ProgressPanelProps) {
  // --- Idle state ---
  if (status === 'idle') {
    const hasPending =
      initialStats &&
      (initialStats.pendingGroupCount > 0 || initialStats.singletonCount > 0);

    if (!hasPending) return null;

    const groupLabel =
      initialStats!.pendingGroupCount > 0
        ? `${initialStats!.pendingGroupCount} group${initialStats!.pendingGroupCount !== 1 ? 's' : ''} waiting for review`
        : '';
    const singletonLabel =
      initialStats!.singletonCount > 0
        ? `${initialStats!.singletonCount} singleton${initialStats!.singletonCount !== 1 ? 's' : ''}`
        : '';
    const summary = [groupLabel, singletonLabel].filter(Boolean).join(' · ');

    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950">
        <p className="mb-2 text-sm font-medium text-indigo-800 dark:text-indigo-300">{summary}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={onGoToReview}>
            Go to Review →
          </Button>
          {initialStats!.singletonCount > 0 && (
            <Button size="sm" variant="outline" onClick={onAutoKeep}>
              Auto-keep Singletons
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
        Scan failed. Check the server console for details.
      </div>
    );
  }

  // --- Complete state ---
  if (status === 'complete' && finalStats) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Scan complete</p>
        <div className="mb-4 grid grid-cols-4 gap-2">
          <StatTile value={finalStats.totalScanned} label="Scanned"   color="text-primary" />
          <StatTile value={finalStats.groupCount}   label="Groups"    color="text-green-600 dark:text-green-400" />
          <StatTile value={finalStats.singletons}   label="Singletons" color="text-orange-600 dark:text-orange-400" />
          <StatTile value={finalStats.errors}       label="Errors"    color="text-red-600 dark:text-red-400" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onGoToReview}>
            Go to Review →
          </Button>
          {finalStats.singletons > 0 && (
            <Button size="sm" variant="outline" onClick={onAutoKeep}>
              Auto-keep Singletons ({finalStats.singletons})
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- Scanning state ---
  if (status !== 'running' || !progressEvent) return null;

  const isHashing  = progressEvent.phase === 'hashing';
  const isGrouping = progressEvent.phase === 'grouping';
  const hashPct =
    progressEvent.total > 0
      ? (progressEvent.current / progressEvent.total) * 100
      : 0;

  // Use stats from the event if available (populated on complete); otherwise build from live fields
  const counters: ScanStats = progressEvent.stats ?? {
    totalScanned: progressEvent.current,
    grouped:      0,
    singletons:   0,
    errors:       0,
    groupCount:   0,
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-medium">Progress</p>

      {/* Hashing phase */}
      <div className={cn('mb-3', isGrouping && 'opacity-50')}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold">Hashing</span>
          <span className="text-xs text-muted-foreground">
            {isGrouping
              ? `${progressEvent.total} / ${progressEvent.total}`
              : `${progressEvent.current} / ${progressEvent.total}`}
          </span>
        </div>
        <ProgressBar pct={isGrouping ? 100 : hashPct} />
        {isHashing && progressEvent.currentFile && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {progressEvent.currentFile}
          </p>
        )}
      </div>

      {/* Grouping phase */}
      <div className={cn('mb-4', isHashing && 'opacity-40')}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold">Grouping</span>
          <span className="text-xs text-muted-foreground">{isGrouping ? 'Running…' : 'waiting'}</span>
        </div>
        {isGrouping ? <IndeterminateBar /> : <ProgressBar pct={0} />}
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile value={counters.totalScanned} label="Scanned"    color="text-primary" />
        <StatTile value={counters.groupCount}   label="Groups"     color="text-green-600 dark:text-green-400" />
        <StatTile value={counters.singletons}   label="Singletons" color="text-orange-600 dark:text-orange-400" />
        <StatTile value={counters.errors}       label="Errors"     color="text-red-600 dark:text-red-400" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ProgressPanel.tsx app/globals.css
git commit -m "feat: add ProgressPanel component with all four states"
```

---

## Task 5: Wire up `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ConfigPanel } from '@/components/ConfigPanel';
import { ScanControl } from '@/components/ScanControl';
import { ProgressPanel } from '@/components/ProgressPanel';
import type { AppConfig, ProgressEvent, ScanStats } from '@/types';
import type { ScanStatus } from '@/lib/scanState';

interface StatsData {
  pendingGroupCount: number;
  singletonCount: number;
  lastScanAt: string | null;
  scanDurationMs: number | null;
}

export default function DashboardPage() {
  const router = useRouter();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [progressEvent, setProgressEvent] = useState<ProgressEvent | null>(null);
  const [finalStats, setFinalStats] = useState<ScanStats | null>(null);
  const [initialStats, setInitialStats] = useState<StatsData | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [scanDurationMs, setScanDurationMs] = useState<number | null>(null);

  // Load config and stats on mount
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: AppConfig) => setConfig(data))
      .catch(() => {});

    fetch('/api/stats')
      .then((r) => r.json())
      .then((data: StatsData) => {
        setInitialStats(data);
        setLastScanAt(data.lastScanAt);
        setScanDurationMs(data.scanDurationMs);
      })
      .catch(() => {});
  }, []);

  async function handleStartScan() {
    const res = await fetch('/api/scan', { method: 'POST' });

    if (res.status === 409) {
      toast.error('Scan already in progress');
      return;
    }
    if (res.status === 400) {
      toast.error('Set inbound and output folders first');
      return;
    }
    if (!res.ok) {
      toast.error('Failed to start scan');
      return;
    }

    setScanStatus('running');
    setProgressEvent(null);
    setFinalStats(null);

    const source = new EventSource('/api/progress');

    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ProgressEvent;
      setProgressEvent(event);

      if (event.type === 'complete') {
        setScanStatus('complete');
        if (event.stats) setFinalStats(event.stats);
        source.close();
        // Refresh stats to get accurate duration + updated pending counts for nav badge
        fetch('/api/stats')
          .then((r) => r.json())
          .then((data: StatsData) => {
            setInitialStats(data);
            setScanDurationMs(data.scanDurationMs);
          })
          .catch(() => {});
      }

      if (event.type === 'error') {
        setScanStatus('error');
        toast.error('Scan encountered an error');
        source.close();
      }
    };

    source.onerror = () => {
      setScanStatus('error');
      toast.error('Lost connection to scan progress');
      source.close();
    };
  }

  async function handleAutoKeep() {
    const res = await fetch('/api/singletons', { method: 'POST' });
    if (!res.ok) {
      toast.error('Failed to auto-keep singletons');
      return;
    }
    const { count } = (await res.json()) as { ok: boolean; count: number };
    toast.success(`Kept ${count} singleton${count !== 1 ? 's' : ''}`);
    router.push('/review');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
      <ConfigPanel
        config={config}
        scanning={scanStatus === 'running'}
        onSaved={setConfig}
      />
      <ScanControl
        status={scanStatus}
        lastScanAt={lastScanAt}
        scanDurationMs={scanDurationMs}
        onStartScan={handleStartScan}
      />
      <ProgressPanel
        status={scanStatus}
        progressEvent={progressEvent}
        finalStats={finalStats}
        initialStats={initialStats}
        onGoToReview={() => router.push('/review')}
        onAutoKeep={handleAutoKeep}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: End-to-end verification in browser**

Open http://localhost:3001 and confirm:

1. Nav renders with active Dashboard link underlined
2. Config panel loads with saved values (or empty if none set)
3. Paste real folder paths, click Save → success toast appears
4. Click Start Scan → badge switches to "⟳ Scanning", progress panel appears with hashing phase
5. Once hashing completes, grouping bar animates
6. On completion: badge shows "✓ Complete", stats tiles show final counts, action buttons appear
7. Click "Go to Review →" → navigates to /review

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: build Phase 4 dashboard — config, scan control, live SSE progress"
```
