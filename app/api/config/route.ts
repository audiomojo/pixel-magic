import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';
import type { AppConfig } from '@/types';

export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json(config);
  } catch {
    // config.json doesn't exist yet (first run) — return defaults
    return NextResponse.json({
      inboundFolder: '',
      outboundBase: '',
      similarityThreshold: 90,
      supportedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'gif', 'bmp'],
    } satisfies AppConfig);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AppConfig;
    writeConfig(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
