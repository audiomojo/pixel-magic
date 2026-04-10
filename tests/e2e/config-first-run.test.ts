/**
 * Tests GET /api/config when config.json does not exist (first-run scenario).
 *
 * Sets DATA_DIR to a temp dir with no config.json, verifies the endpoint returns
 * a 200 with sensible defaults, then restores DATA_DIR.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { GET as getConfig } from '@/app/api/config/route';

let tempDir: string;
let origDataDir: string | undefined;

beforeAll(() => {
  origDataDir = process.env.DATA_DIR;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-magic-first-run-'));
  process.env.DATA_DIR = tempDir;
  // Ensure no config.json exists in the temp dir
  const configPath = path.join(tempDir, 'config.json');
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
});

afterAll(() => {
  if (origDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDataDir;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/config — first run (no config.json)', () => {
  it('returns 200 with default config when config.json is missing', async () => {
    const res = await getConfig();
    expect(res.status).toBe(200);
  });

  it('default config has similarityThreshold of 60', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.similarityThreshold).toBe(60);
  });

  it('default config has a non-empty supportedExtensions array', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.supportedExtensions)).toBe(true);
    expect((body.supportedExtensions as string[]).length).toBeGreaterThan(0);
  });

  it('default config does not contain path fields', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.inboundFolder).toBeUndefined();
    expect(body.outboundBase).toBeUndefined();
  });
});
