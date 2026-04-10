'use client';

import React, { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { PanelLeft } from 'lucide-react';
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
import { scoreColor, formatScoreTooltip, topScoredPaths } from '@/lib/scoreHelpers';
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

function imageUrl(filePath: string, thumb = true): string {
  return `/api/images?path=${encodeURIComponent(filePath)}${thumb ? '&thumb=1' : ''}`;
}

function scoreBadge(img: ImageRecord): ReactElement | null {
  if (img.aiScoreStatus === 'scoring') {
    return (
      <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1 py-0.5 text-[9px] font-mono text-white/70">
        …
      </span>
    );
  }
  if (img.aiScoreStatus !== 'scored' || img.aiScore == null) return null;
  return (
    <span className={`absolute right-1 top-1 rounded-full px-1 py-0.5 text-[9px] font-bold ${scoreColor(img.aiScore)}`}>
      {Math.round(img.aiScore)}
    </span>
  );
}


function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all font-mono">{value}</span>
    </div>
  );
}

function ImageDetails({ image }: { image: ImageRecord }) {
  const scoreDetail = image.aiScoreDetail
    ? (() => { try { return JSON.parse(image.aiScoreDetail) as Record<string, unknown>; } catch { return null; } })()
    : null;

  return (
    <div className="space-y-3">
      <section>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">File</p>
        <DetailRow label="Name" value={basename(image.filePath)} />
        <DetailRow label="Path" value={image.filePath} />
        <DetailRow label="ID" value={image.id ?? '—'} />
        <DetailRow label="Status" value={image.status} />
        <DetailRow label="Added" value={new Date(image.addedAt).toLocaleString()} />
      </section>

      <section>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Image</p>
        <DetailRow label="Width" value={`${image.width} px`} />
        <DetailRow label="Height" value={`${image.height} px`} />
        <DetailRow label="DPI X" value={image.dpiX} />
        <DetailRow label="DPI Y" value={image.dpiY} />
        <DetailRow label="Size" value={formatBytes(image.fileSize)} />
        <DetailRow label="Date Taken" value={image.dateTaken ? new Date(image.dateTaken).toLocaleString() : '—'} />
        <DetailRow label="Modified" value={new Date(image.fileMtime).toLocaleString()} />
      </section>

      <section>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hash</p>
        <DetailRow label="Hash" value={image.hash} />
        <DetailRow label="Group" value={image.groupId ?? 'singleton'} />
      </section>

      {scoreDetail && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Score</p>
          <DetailRow label="Score" value={image.aiScore != null ? Math.round(image.aiScore as number) : '—'} />
          <DetailRow label="Type" value={String(scoreDetail.contentType ?? '—')} />
          <DetailRow label="Sharpness" value={String(scoreDetail.sharpness ?? '—')} />
          <DetailRow label="Exposure" value={String(scoreDetail.exposure ?? '—')} />
          <DetailRow label="Composition" value={String(scoreDetail.composition ?? '—')} />
          <DetailRow label="Color" value={String(scoreDetail.color ?? '—')} />
          {scoreDetail.contentType === 'portrait' && (
            <>
              <DetailRow label="Eyes Open" value={String(scoreDetail.eyesOpen ?? '—')} />
              <DetailRow label="Expression" value={String(scoreDetail.expression ?? '—')} />
              <DetailRow label="Face Sharp" value={String(scoreDetail.faceSharpness ?? '—')} />
            </>
          )}
          {!!scoreDetail.rationale && (
            <div className="mt-1 break-words text-muted-foreground" style={{ fontFamily: 'inherit' }}>
              &ldquo;{String(scoreDetail.rationale)}&rdquo;
            </div>
          )}
          {!!scoreDetail.tiebreak && (
            <div className="mt-0.5 text-[10px] italic text-muted-foreground">tiebreak applied</div>
          )}
          <DetailRow label="Scored At" value={image.aiScoredAt ? new Date(image.aiScoredAt).toLocaleString() : '—'} />
        </section>
      )}

      {!scoreDetail && image.aiScoreStatus && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI Score</p>
          <DetailRow label="Status" value={image.aiScoreStatus} />
        </section>
      )}
    </div>
  );
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
  const [showDetails, setShowDetails] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [scoringActive, setScoringActive] = useState(false);

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
        setRotation(0);
        setFocusedIdx(0);

        // Auto-check the highest-scored image(s), or clear if none scored yet
        setKeptPaths(topScoredPaths(detail.images));

        // Check if scoring is still in progress for this group
        const stillPending = detail.images.some(
          (img) => img.aiScoreStatus === 'pending' || img.aiScoreStatus === 'scoring'
        );
        setScoringActive(stillPending);
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

  // Poll for score updates while scoring is in progress for this group
  useEffect(() => {
    if (!scoringActive) return;

    const interval = setInterval(async () => {
      try {
        const detail = await fetch(`/api/groups/${groupId}`).then((r) => r.json()) as { group: ImageGroup; images: ImageRecord[] };
        const stillPending = detail.images.some(
          (img) => img.aiScoreStatus === 'pending' || img.aiScoreStatus === 'scoring'
        );
        setImages(detail.images);

        // Re-apply auto-select whenever new scores arrive
        const top = topScoredPaths(detail.images);
        if (top.length > 0) setKeptPaths(top);

        setScoringActive(stillPending);
        if (!stillPending) clearInterval(interval);
      } catch {
        // ignore poll errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [scoringActive, groupId]);

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

        {scoringActive && (
          <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
            Scoring…
          </span>
        )}

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
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Details sidebar */}
          {showDetails && focusedImage && (
            <div className="w-64 flex-none overflow-y-auto border-r bg-background p-3 text-xs">
              <ImageDetails image={focusedImage} />
            </div>
          )}

          {/* Image canvas */}
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
        </div>

        {/* Metadata row */}
        {focusedImage && (
          <div className="flex flex-none items-center border-t bg-background px-4 py-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-mono">{basename(focusedImage.filePath)}</span>
              <span className="mx-2">·</span>
              <span>{focusedImage.width} × {focusedImage.height}</span>
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
              {focusedImage.aiScore != null && focusedImage.aiScoreStatus === 'scored' && (
                <>
                  <span className="mx-2">·</span>
                  <span
                    title={formatScoreTooltip(focusedImage.aiScoreDetail)}
                    className="cursor-help font-medium text-purple-700 dark:text-purple-300"
                  >
                    AI: {Math.round(focusedImage.aiScore as number)}
                  </span>
                </>
              )}
              <span className="mx-2">·</span>
              <span className="font-mono">{focusedImage.hash.slice(0, 12)}</span>
            </span>
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className={cn(
                'ml-3 flex-none rounded p-0.5 transition-colors hover:bg-muted',
                showDetails && 'bg-muted text-foreground',
              )}
              title={showDetails ? 'Hide full details' : 'Show full details'}
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
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
                  ? {
                      aspectRatio:
                        rotation === 90 || rotation === 270
                          ? `${img.height}/${img.width}`
                          : `${img.width}/${img.height}`,
                    }
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
              {scoreBadge(img)}
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
