'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ImageGroup } from '@/types';

export default function ReviewListPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<ImageGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/groups')
      .then((r) => {
        if (!r.ok) throw new Error('Server error');
        return r.json();
      })
      .then((data: ImageGroup[]) => setGroups(data))
      .catch(() => toast.error('Failed to load groups'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAutoKeepSingletons() {
    const res = await fetch('/api/singletons', { method: 'POST' });
    if (!res.ok) {
      toast.error('Failed to auto-keep singletons');
      return;
    }
    const { count } = (await res.json()) as { ok: boolean; count: number };
    toast.success(`Kept ${count} singleton${count !== 1 ? 's' : ''}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-4 text-sm text-muted-foreground">
          All groups reviewed — nothing pending.
        </p>
        <Link href="/" className="text-sm text-primary underline underline-offset-2">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium">
          {groups.length} group{groups.length !== 1 ? 's' : ''} pending review
        </p>
        <Button size="sm" variant="outline" onClick={handleAutoKeepSingletons}>
          Auto-keep Singletons
        </Button>
      </div>
      <div className="space-y-3">
        {groups.map((group, idx) => (
          <div
            key={group.id}
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images?path=${encodeURIComponent(group.representativePath)}&thumb=1`}
              alt={`Group ${idx + 1} representative`}
              className="h-16 w-16 flex-none rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Group {idx + 1}</p>
              <p className="text-xs text-muted-foreground">
                {group.imageCount} image{group.imageCount !== 1 ? 's' : ''}
              </p>
            </div>
            <Button size="sm" onClick={() => router.push(`/review/${group.id}`)}>
              Review →
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
