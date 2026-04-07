'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import type { ImageGroup, ImageRecord } from '@/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

function rotateBadge(rotation: number): string {
  if (rotation === 0) return '';
  const ccw = (360 - rotation) % 360;
  return `–${ccw}°`;
}

function imageUrl(filePath: string): string {
  return `/api/images?path=${encodeURIComponent(filePath)}`;
}

export default function GroupReviewPage() {
  const params = useParams<{ groupId: string }>();
  const router = useRouter();
  const groupId = parseInt(params.groupId, 10);

  const [group, setGroup] = useState<ImageGroup | null>(null);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [allGroups, setAllGroups] = useState<ImageGroup[]>([]);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [keptPaths, setKeptPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);

  const rotateCCW = useCallback(() => {
    setRotation((prev) => (((prev + 270) % 360) as 0 | 90 | 180 | 270));
  }, []);

  const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/groups/${groupId}`).then((r) => r.json()),
      fetch('/api/groups').then((r) => r.json()),
    ])
      .then(([detail, groups]: [{ group: ImageGroup; images: ImageRecord[] }, ImageGroup[]]) => {
        thumbRefs.current = [];
        setGroup(detail.group);
        setImages(detail.images);
        setAllGroups(groups);
        setKeptPaths([]);
        setFocusedIdx(0);
        setRotation(0);
      })
      .catch(() => toast.error('Failed to load group'))
      .finally(() => setLoading(false));
  }, [groupId]);

  // Scroll focused thumbnail into view when it changes
  useEffect(() => {
    thumbRefs.current[focusedIdx]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [focusedIdx]);

  function toggleKeep(filePath: string) {
    setKeptPaths((prev) =>
      prev.includes(filePath) ? prev.filter((p) => p !== filePath) : [...prev, filePath],
    );
  }

  const handleSubmit = useCallback(
    async (keepPaths: string[]) => {
      setSubmitting(true);
      const recyclePaths = images
        .filter((img) => !keepPaths.includes(img.filePath))
        .map((img) => img.filePath);

      try {
        const res = await fetch(`/api/groups/${groupId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepPaths, recyclePaths, rotation }),
        });
        if (!res.ok) {
          const { error } = (await res.json()) as { error: string };
          toast.error(error);
          return;
        }
        const groupIndex = allGroups.findIndex((g) => g.id === groupId);
        const nextGroup = allGroups[groupIndex + 1];
        router.push(nextGroup ? `/review/${nextGroup.id}` : '/review');
      } catch {
        toast.error('Failed to save resolution');
      } finally {
        setSubmitting(false);
      }
    },
    [allGroups, groupId, images, rotation, router],
  );

  // Keyboard shortcuts: ← → navigate, Space toggle keep, Enter submit
  // focusedIdx is in deps so Space always toggles the currently focused image.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't steal from form inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (submitting || discardDialogOpen) return;

      if (e.key === 'ArrowLeft') {
        setFocusedIdx((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setFocusedIdx((prev) => Math.min(images.length - 1, prev + 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        const img = images[focusedIdx];
        if (img) {
          setKeptPaths((prev) =>
            prev.includes(img.filePath)
              ? prev.filter((p) => p !== img.filePath)
              : [...prev, img.filePath],
          );
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit(keptPaths);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [images, focusedIdx, keptPaths, handleSubmit, submitting, discardDialogOpen]);

  const groupIndex = allGroups.findIndex((g) => g.id === groupId);
  const focusedImage = images[focusedIdx] ?? null;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-2.75rem)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex h-[calc(100vh-2.75rem)] flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Group not found.</p>
        <Link href="/review" className="text-sm text-primary underline underline-offset-2">
          ← Back to Review Queue
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2.75rem)] flex-col overflow-hidden">
      {/* ── Action bar ── */}
      <div className="flex flex-none items-center gap-2 border-b bg-background px-4 py-2">
        <Link
          href="/review"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Review Queue
        </Link>

        <span className="mx-auto text-sm font-medium">
          Group {groupIndex >= 0 ? groupIndex + 1 : '?'} of {allGroups.length}
        </span>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setKeptPaths(images.map((img) => img.filePath))}
          >
            Keep All
          </Button>

          <Button
            size="sm"
            variant={rotation !== 0 ? 'default' : 'outline'}
            onClick={rotateCCW}
          >
            ↺ Rotate CCW{rotation !== 0 && (
              <span className="ml-1 rounded bg-white/20 px-1 text-[10px]">
                {rotateBadge(rotation)}
              </span>
            )}
          </Button>

          <Dialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" />}>
              Discard All
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Discard all images?</DialogTitle>
                <DialogDescription>
                  All {images.length} image{images.length !== 1 ? 's' : ''} in this group
                  will be moved to the Recycle Bin. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <DialogClose
                  render={
                    <Button
                      variant="destructive"
                      disabled={submitting}
                      onClick={() => handleSubmit([])}
                    />
                  }
                >
                  Discard All
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button size="sm" onClick={() => handleSubmit(keptPaths)} disabled={submitting}>
            Keep Selected & Continue →
          </Button>
        </div>
      </div>

      {/* ── Large preview ── */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden bg-zinc-950/5 dark:bg-zinc-950/30">
          {focusedImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={focusedImage.filePath}
              src={imageUrl(focusedImage.filePath)}
              alt={basename(focusedImage.filePath)}
              className="max-h-full max-w-full object-contain"
              style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
            />
          )}
        </div>

        {/* Metadata row */}
        {focusedImage && (
          <div className="flex-none border-t bg-background px-4 py-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{basename(focusedImage.filePath)}</span>
            <span className="mx-2">·</span>
            <span>
              {focusedImage.width} × {focusedImage.height}
            </span>
            <span className="mx-2">·</span>
            <span>{formatBytes(focusedImage.fileSize)}</span>
            <span className="mx-2">·</span>
            <span>{focusedImage.dpiX} DPI</span>
            <span className="mx-2">·</span>
            <span>
              {focusedImage.dateTaken
                ? new Date(focusedImage.dateTaken).toLocaleDateString()
                : new Date(focusedImage.fileMtime).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* ── Thumbnail strip ── */}
      <div className="flex h-[25vh] flex-none flex-row gap-1 overflow-x-auto bg-zinc-900 p-1">
        {images.map((img, idx) => {
          const isKept = keptPaths.includes(img.filePath);
          const isFocused = focusedIdx === idx;
          return (
            <div
              key={img.filePath}
              ref={(el) => {
                thumbRefs.current[idx] = el;
              }}
              className={cn(
                'relative h-full flex-none cursor-pointer overflow-hidden rounded-sm transition-opacity',
                isKept
                  ? 'ring-2 ring-green-500'
                  : cn(
                      'ring-1 ring-white/20',
                      isFocused ? 'opacity-100' : 'opacity-60 hover:opacity-90',
                    ),
                isFocused && 'opacity-100',
              )}
              style={
                img.width > 0 && img.height > 0
                  ? { aspectRatio: `${img.width}/${img.height}` }
                  : undefined
              }
              onClick={() => setFocusedIdx(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(img.filePath)}
                alt={basename(img.filePath)}
                className="h-full w-full object-cover"
                style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
              />
              {/* Keep checkbox overlay */}
              <input
                type="checkbox"
                checked={isKept}
                onChange={() => toggleKeep(img.filePath)}
                onClick={(e) => e.stopPropagation()}
                className="absolute left-1 top-1 h-4 w-4 cursor-pointer accent-green-500"
                aria-label={`Keep ${basename(img.filePath)}`}
              />
              {/* Green inset ring when kept */}
              {isKept && (
                <div className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-inset ring-green-500" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Keyboard hints ── */}
      <div className="flex flex-none items-center justify-center gap-5 border-t bg-background px-4 py-1 text-[10px] text-muted-foreground">
        <span>
          <kbd className="rounded border px-1 font-mono text-[9px]">←</kbd>{' '}
          <kbd className="rounded border px-1 font-mono text-[9px]">→</kbd> navigate
        </span>
        <span>
          <kbd className="rounded border px-1 font-mono text-[9px]">Space</kbd> toggle keep
        </span>
        <span>
          <kbd className="rounded border px-1 font-mono text-[9px]">Enter</kbd> submit
        </span>
      </div>
    </div>
  );
}
