export type ScanStatus = 'idle' | 'running' | 'complete' | 'error';

export const scanState = {
  status: 'idle' as ScanStatus,
  lastScanAt: null as string | null,
  scanStartedAt: null as number | null,
  scanDurationMs: null as number | null,
};
