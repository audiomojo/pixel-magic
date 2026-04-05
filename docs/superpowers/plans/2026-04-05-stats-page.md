# Stats Page (Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stats page — 4 summary cards, an Empty Recycle Bin action, and a Clear Cache & Rescan action — plus the `DELETE /api/stats` backend endpoint that supports cache clearing.

**Architecture:** Two changes. First, add a `DELETE` handler to the existing `app/api/stats/route.ts` that calls `db.clearAll()` and returns `{ cleared: true }`. Second, replace the `app/stats/page.tsx` stub with a client component that fetches `GET /api/stats` on mount, renders summary cards and action cards with confirmation dialogs, and calls `DELETE /api/recycle` or `DELETE /api/stats` on confirmation. No new components — all logic is self-contained in the page file.

**Tech Stack:** Next.js 16.2.2 App Router · TypeScript · Tailwind CSS · shadcn/ui (@base-ui/react) · sonner toasts · lucide-react

---

### ⚠️ Before Starting

The dev server must be running (`npm run dev`, port 3001). After each task verify in the browser.

The `DELETE /api/stats` route is tested by adding a describe block to the **end** of `tests/e2e/api-workflow.test.ts`. It must run last because `clearAll()` wipes the DB — the afterAll hook depends on the DB being intact until all other tests finish.

---

## File Map

| File | Action |
|---|---|
| `app/api/stats/route.ts` | Modify — add `DELETE` handler |
| `app/stats/page.tsx` | Modify — replace stub with full stats page |
| `tests/e2e/api-workflow.test.ts` | Modify — append `DELETE /api/stats` describe block |

---

## Task 1: Add `DELETE /api/stats` with integration test

**Files:**
- Modify: `app/api/stats/route.ts`
- Modify: `tests/e2e/api-workflow.test.ts`

- [ ] **Step 1: Add the test at the end of `tests/e2e/api-workflow.test.ts`**

Find this line near the top of the file:

```ts
import { GET as getStats } from '@/app/api/stats/route';
```

Replace it with:

```ts
import { GET as getStats, DELETE as deleteStats } from '@/app/api/stats/route';
```

Then append this describe block at the very end of the file (after the `walkDir` helper):

```ts
describe('DELETE /api/stats', () => {
  it('clears all DB records and returns { cleared: true }', async () => {
    const res = await deleteStats();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cleared: boolean };
    expect(body.cleared).toBe(true);
  });

  it('GET /api/stats after clear returns zero counts', async () => {
    const res = await getStats();
    expect(res.status).toBe(200);
    const stats = (await res.json()) as Record<string, unknown>;
    expect(stats.totalScanned).toBe(0);
    expect(stats.keptCount).toBe(0);
    expect(stats.recycledCount).toBe(0);
    expect(stats.pendingGroupCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/e2e/api-workflow.test.ts
```

Expected: the two new tests fail with something like `deleteStats is not a function` or `DELETE export not found`.

- [ ] **Step 3: Add the `DELETE` handler to `app/api/stats/route.ts`**

Find this line near the top of the file:

```ts
import { getAllGroups, getByGroupId, getAllPending, getAllSingletons, getRecycled } from '@/lib/db';
```

Replace it with:

```ts
import { getAllGroups, getByGroupId, getAllPending, getAllSingletons, getRecycled, clearAll } from '@/lib/db';
```

Then append this handler at the bottom of the file:

```ts
export async function DELETE() {
  try {
    clearAll();
    return NextResponse.json({ cleared: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run tests/e2e/api-workflow.test.ts
```

Expected: all tests pass, including the two new `DELETE /api/stats` tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/stats/route.ts tests/e2e/api-workflow.test.ts
git commit -m "feat: add DELETE /api/stats to clear scan cache"
```

---

## Task 2: Stats page UI

**Files:**
- Modify: `app/stats/page.tsx`

- [ ] **Step 1: Replace `app/stats/page.tsx` with the full implementation**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type StatsResponse = {
  totalScanned: number;
  keptCount: number;
  recycledCount: number;
  singletonCount: number;
  pendingGroupCount: number;
  pendingGroupImageCount: number;
  lastScanAt: string | null;
  scanDurationMs: number | null;
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return ` · ${s}s`;
  return ` · ${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchStats() {
    setLoading(true);
    fetch('/api/stats')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StatsResponse>;
      })
      .then((data) => {
        setStats(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchStats();
  }, []);

  async function handleEmptyRecycleBin() {
    const res = await fetch('/api/recycle', { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to empty recycle bin');
      return;
    }
    const { count } = (await res.json()) as { ok: boolean; count: number };
    toast.success(`Deleted ${count} file${count !== 1 ? 's' : ''} permanently`);
    fetchStats();
  }

  async function handleClearCache() {
    const res = await fetch('/api/stats', { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to clear cache');
      return;
    }
    toast.success('Cache cleared');
    router.push('/');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-2 text-sm font-medium text-destructive">Failed to load stats</p>
        <p className="mb-4 text-xs text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchStats}>
          Retry
        </Button>
      </div>
    );
  }

  const recycleCount = stats.recycledCount;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Images Kept</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold text-green-600">{stats.keptCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">In Recycle Bin</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold text-red-600">{stats.recycledCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pending Review</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-2xl font-bold text-amber-600">{stats.pendingGroupCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">Last Scan</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-sm font-semibold leading-snug">
              {formatRelativeTime(stats.lastScanAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.lastScanAt
                ? `${stats.totalScanned} files${formatDuration(stats.scanDurationMs)}`
                : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Empty Recycle Bin */}
        <Card className="border-red-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-sm font-semibold">Empty Recycle Bin</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Permanently delete {recycleCount} file{recycleCount !== 1 ? 's' : ''} from disk.
              This cannot be undone.
            </p>
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={recycleCount === 0}
                  />
                }
              >
                Delete {recycleCount} file{recycleCount !== 1 ? 's' : ''} permanently
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Empty recycle bin?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete {recycleCount} file
                    {recycleCount !== 1 ? 's' : ''} from disk. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter showCloseButton>
                  <DialogClose
                    render={
                      <Button variant="destructive" onClick={handleEmptyRecycleBin} />
                    }
                  >
                    Delete permanently
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Clear Cache & Rescan */}
        <Card>
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-sm font-semibold">Clear Cache & Rescan</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Wipe scan database and start fresh. Does not affect files in Keeping/ or Recycle Bin/.
            </p>
            <Dialog>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                Clear cache.db
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear scan cache?</DialogTitle>
                  <DialogDescription>
                    This will wipe all scan data. Your files in Keeping/ and Recycle Bin/ are not
                    affected. You will need to rescan from the Dashboard.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter showCloseButton>
                  <DialogClose
                    render={<Button variant="destructive" onClick={handleClearCache} />}
                  >
                    Clear cache.db
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
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

- [ ] **Step 3: Verify in browser**

Open http://localhost:3001/stats. Confirm:

1. Skeleton pulse placeholders appear briefly while fetching
2. Four summary cards render: "Images Kept" (green number), "In Recycle Bin" (red number), "Pending Review" (amber number), "Last Scan" (relative time + file count + duration)
3. "Empty Recycle Bin" card has a red border and shows the correct file count in button text; button is disabled when count is 0
4. Clicking "Delete N files permanently" opens a confirmation dialog; cancelling closes it; confirming shows a success toast and refreshes the counts
5. "Clear Cache & Rescan" card button opens a confirmation dialog; confirming shows a toast and redirects to the Dashboard
6. If `GET /api/stats` fails, a full-page error state is shown with a Retry button

- [ ] **Step 4: Commit**

```bash
git add app/stats/page.tsx
git commit -m "feat: add Stats page with summary cards and action dialogs"
```
