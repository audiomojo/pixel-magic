import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { rescoreAll } from '@/lib/scorer';

export async function POST() {
  try {
    const config = readConfig();
    if (!config.aiScoringEnabled) {
      return NextResponse.json({ error: 'AI scoring is not enabled' }, { status: 400 });
    }
    // Fire and forget — returns immediately
    rescoreAll(config).catch((err: unknown) =>
      console.error('[api/scoring/rescore] scorer error:', err)
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
