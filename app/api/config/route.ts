import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';
import { startScorer } from '@/lib/scorer';
import type { AppConfig } from '@/types';

export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json(config);
  } catch {
    // No config.json yet (first run) — return defaults
    return NextResponse.json({
      inboundFolder: '',
      outboundBase: '',
      similarityThreshold: 60,
      supportedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'gif', 'bmp'],
      aiScoringEnabled: false,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      ollamaModel: 'qwen2.5vl:7b',
    } satisfies AppConfig);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AppConfig;

    // Detect if scoring is being toggled on
    let wasEnabled = false;
    try {
      const prev = readConfig();
      wasEnabled = prev.aiScoringEnabled;
    } catch {
      // first save
    }

    writeConfig(body);

    // If scoring was just enabled, kick off the scorer for any queued images
    if (body.aiScoringEnabled && !wasEnabled) {
      startScorer(body).catch((err: unknown) =>
        console.error('[api/config] scorer error after enable:', err)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
