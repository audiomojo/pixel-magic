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
        <div className={cn('mb-4 grid gap-2', (finalStats.scored ?? 0) > 0 ? 'grid-cols-5' : 'grid-cols-4')}>
          <StatTile value={finalStats.totalScanned} label="Scanned"    color="text-primary" />
          <StatTile value={finalStats.groupCount}   label="Groups"     color="text-green-600 dark:text-green-400" />
          <StatTile value={finalStats.singletons}   label="Singletons" color="text-orange-600 dark:text-orange-400" />
          <StatTile value={finalStats.errors}       label="Errors"     color="text-red-600 dark:text-red-400" />
          {(finalStats.scored ?? 0) > 0 && (
            <StatTile value={finalStats.scored ?? 0} label="Scored" color="text-purple-600 dark:text-purple-400" />
          )}
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
  const isScoring  = progressEvent.phase === 'scoring';
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
    scored:       0,
    scoreErrors:  0,
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-medium">Progress</p>

      {/* Hashing phase */}
      <div className={cn('mb-3', (isGrouping || isScoring) && 'opacity-50')}>
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
      <div className={cn('mb-4', isHashing && 'opacity-40', isScoring && 'opacity-50')}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold">Grouping</span>
          <span className="text-xs text-muted-foreground">{isGrouping ? 'Running…' : 'waiting'}</span>
        </div>
        {isGrouping ? <IndeterminateBar /> : <ProgressBar pct={0} />}
      </div>

      {/* Scoring phase — only shown if scan includes AI scoring */}
      {isScoring && (
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold">AI Scoring</span>
            <span className="text-xs text-muted-foreground">
              {isScoring
                ? `${progressEvent!.current} / ${progressEvent!.total}`
                : `${finalStats?.scored ?? 0} scored`}
            </span>
          </div>
          {isScoring ? (
            <>
              <ProgressBar
                pct={progressEvent!.total > 0 ? (progressEvent!.current / progressEvent!.total) * 100 : 0}
              />
              {progressEvent!.currentFile && (
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {progressEvent!.currentFile}
                </p>
              )}
            </>
          ) : (
            <ProgressBar pct={100} />
          )}
        </div>
      )}

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
