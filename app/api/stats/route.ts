import { NextResponse } from 'next/server';
import { getAllGroups, getByGroupId, getAllPending, getAllSingletons, getRecycled } from '@/lib/db';
import { scanState } from '@/lib/scanState';
import db from '@/lib/db';

export async function GET() {
  try {
    const allGroups = getAllGroups();

    const pendingGroups = allGroups.filter((g) => {
      const members = getByGroupId(g.id);
      return members.some((m) => m.status === 'pending');
    });

    const pendingGroupImageCount = pendingGroups.reduce((sum, g) => {
      return sum + getByGroupId(g.id).filter((m) => m.status === 'pending').length;
    }, 0);

    const keptCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM image_hashes WHERE status IN ('kept', 'singleton_kept')").get() as { cnt: number }
    ).cnt;

    const recycledCount = getRecycled().length;
    const singletonCount = getAllSingletons().length;

    const totalScanned = (
      db.prepare('SELECT COUNT(*) as cnt FROM image_hashes').get() as { cnt: number }
    ).cnt;

    return NextResponse.json({
      totalScanned,
      keptCount,
      recycledCount,
      singletonCount,
      pendingGroupCount: pendingGroups.length,
      pendingGroupImageCount,
      lastScanAt: scanState.lastScanAt,
      scanDurationMs: scanState.scanDurationMs,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
