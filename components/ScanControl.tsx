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
