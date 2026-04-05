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
    let finished = false;

    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ProgressEvent;
      setProgressEvent(event);

      if (event.type === 'complete') {
        finished = true;
        setScanStatus('complete');
        if (event.stats) setFinalStats(event.stats);
        source.close();
        // Refresh stats to get accurate duration + updated pending counts for nav badge
        fetch('/api/stats')
          .then((r) => r.json())
          .then((data: StatsData) => {
            setInitialStats(data);
            setLastScanAt(data.lastScanAt);
            setScanDurationMs(data.scanDurationMs);
          })
          .catch(() => {});
      }

      if (event.type === 'error') {
        finished = true;
        setScanStatus('error');
        toast.error('Scan encountered an error');
        source.close();
      }
    };

    source.onerror = () => {
      if (finished) return;
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
