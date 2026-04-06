/**
 * Tests GET /api/config when config.json does not exist (first-run scenario).
 *
 * Backs up any existing config.json, removes it, verifies the endpoint returns
 * a 200 with sensible defaults, then restores the original.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { GET as getConfig } from '@/app/api/config/route';

const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

let originalConfig: string | null = null;

beforeAll(() => {
  if (existsSync(CONFIG_PATH)) {
    originalConfig = readFileSync(CONFIG_PATH, 'utf-8');
    unlinkSync(CONFIG_PATH);
  }
});

afterAll(() => {
  if (originalConfig !== null) {
    writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
  }
});

describe('GET /api/config — first run (no config.json)', () => {
  it('returns 200 with default config when config.json is missing', async () => {
    const res = await getConfig();
    expect(res.status).toBe(200);
  });

  it('default config has empty inboundFolder and outboundBase', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.inboundFolder).toBe('');
    expect(body.outboundBase).toBe('');
  });

  it('default config has similarityThreshold of 90', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.similarityThreshold).toBe(90);
  });

  it('default config has a non-empty supportedExtensions array', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.supportedExtensions)).toBe(true);
    expect((body.supportedExtensions as string[]).length).toBeGreaterThan(0);
  });
});
