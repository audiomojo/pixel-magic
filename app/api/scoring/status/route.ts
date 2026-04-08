import { NextResponse } from 'next/server';
import { getScoringCounts } from '@/lib/db';
import { readConfig } from '@/lib/config';

export async function GET() {
  try {
    const counts = getScoringCounts();
    let enabled = false;
    try {
      const config = readConfig();
      enabled = config.aiScoringEnabled;
    } catch {
      // no config yet
    }
    return NextResponse.json({ enabled, ...counts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
