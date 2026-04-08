import { NextResponse } from 'next/server';
import { clearAll } from '@/lib/db';
import { scanState } from '@/lib/scanState';
import db from '@/lib/db';

export async function GET() {
  try {
    const totalScanned = (
      db.prepare('SELECT COUNT(*) as cnt FROM image_hashes').get() as { cnt: number }
    ).cnt;

    const keptCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM image_hashes WHERE status IN ('kept', 'singleton_kept')").get() as { cnt: number }
    ).cnt;

    const recycledCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM image_hashes WHERE status = 'recycled'").get() as { cnt: number }
    ).cnt;

    const singletonCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM image_hashes WHERE group_id IS NULL AND status = 'pending'").get() as { cnt: number }
    ).cnt;

    // Groups that still have at least one pending member, with their pending image counts
    const pendingGroupRows = db.prepare(`
      SELECT group_id, COUNT(*) as cnt
      FROM image_hashes
      WHERE status = 'pending' AND group_id IS NOT NULL
      GROUP BY group_id
    `).all() as { group_id: number; cnt: number }[];

    const pendingGroupCount = pendingGroupRows.length;
    const pendingGroupImageCount = pendingGroupRows.reduce((sum, row) => sum + row.cnt, 0);

    return NextResponse.json({
      totalScanned,
      keptCount,
      recycledCount,
      singletonCount,
      pendingGroupCount,
      pendingGroupImageCount,
      lastScanAt: scanState.lastScanAt,
      scanDurationMs: scanState.scanDurationMs,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    clearAll();
    scanState.lastScanAt = null;
    scanState.scanDurationMs = null;
    scanState.status = 'idle';
    return NextResponse.json({ cleared: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
