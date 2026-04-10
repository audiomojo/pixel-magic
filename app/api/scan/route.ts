import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { runScan } from '@/lib/processor';
import { scanState } from '@/lib/scanState';

export async function POST() {
  if (scanState.status === 'running') {
    return NextResponse.json({ error: 'Scan already running' }, { status: 409 });
  }

  let config;
  try {
    config = readConfig();
  } catch {
    return NextResponse.json({ error: 'Could not read config' }, { status: 500 });
  }

  scanState.status = 'running';
  scanState.scanStartedAt = Date.now();
  scanState.lastScanAt = new Date().toISOString();

  runScan(config)
    .then(() => {
      scanState.status = 'complete';
      scanState.scanDurationMs = Date.now() - (scanState.scanStartedAt ?? Date.now());
    })
    .catch(() => {
      scanState.status = 'error';
      scanState.scanDurationMs = Date.now() - (scanState.scanStartedAt ?? Date.now());
    });

  return NextResponse.json({ ok: true, status: 'running' }, { status: 202 });
}
