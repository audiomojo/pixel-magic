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
