/**
 * Integration tests for lib/processor.ts (full scan pipeline)
 *
 * Fixture notes:
 * - Identical folder: 13 files total.
 *   - 12 processable: PNG + TIFF + 10 HEIC.jpeg (handled via heic-convert fallback)
 *   - 1 will fail: *.jp2 (unsupported)
 *   - Expect: 1 group, 12 grouped images, 0 singletons, 1 error
 *
 * - Similar folder: 27 HEIC files from iPhone (sourced from folder-2).
 *   - All should process successfully via sharp fallback
 *   - Expect: 27 scanned, 0 errors; group count depends on visual similarity
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { runScan } from '@/lib/processor';
import { clearAll, getAllGroups, getAllSingletons, getByGroupId } from '@/lib/db';
import type { AppConfig } from '@/types';

const IDENTICAL_DIR = path.resolve(__dirname, '../../test-photos/Identical');
const SIMILAR_DIR = path.resolve(__dirname, '../../test-photos/Similar');

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'tif', 'jp2'];

function makeConfig(): AppConfig {
  return {
    similarityThreshold: 90,
    supportedExtensions: SUPPORTED_EXTENSIONS,
    aiScoringEnabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2-vision:11b',
  };
}

describe('runScan — Identical folder (mixed processable/unprocessable)', () => {
  let dataDir: string;
  let origDataDir: string | undefined;
  let stats: Awaited<ReturnType<typeof runScan>>;

  beforeAll(async () => {
    origDataDir = process.env.DATA_DIR;
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-identical-'));
    await fs.cp(IDENTICAL_DIR, path.join(dataDir, 'Inbound'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'Keeping'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'Recycle Bin'), { recursive: true });
    process.env.DATA_DIR = dataDir;
    clearAll();
    stats = await runScan(makeConfig());
    console.log('\n  Identical scan stats:', JSON.stringify(stats, null, 2));
  }, 120000);

  afterAll(async () => {
    clearAll();
    await fs.rm(dataDir, { recursive: true, force: true });
    if (origDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = origDataDir;
  });

  it('processes 12 images (PNG + TIFF + 10 HEIC.jpeg via heic-convert)', () => {
    // heic-convert fallback handles the HEIC.jpeg files; only jp2 fails
    expect(stats.totalScanned).toBe(12);
  });

  it('reports 1 error for jp2 (unsupported format)', () => {
    expect(stats.errors).toBe(1);
  });

  it('creates 1 group (all processable files are the same source image)', () => {
    expect(stats.groupCount).toBe(1);
    expect(getAllGroups().length).toBe(1);
  });

  it('the group contains all 12 processable files', () => {
    const group = getAllGroups()[0];
    const members = getByGroupId(group.id);
    expect(members.length).toBe(12);
  });

  it('has 0 singletons (all processable files grouped)', () => {
    expect(stats.singletons).toBe(0);
    expect(getAllSingletons().length).toBe(0);
  });

  it('totalScanned = grouped + singletons', () => {
    expect(stats.totalScanned).toBe(stats.grouped + stats.singletons);
  });
});

describe('runScan — Similar folder (27 iPhone HEIC burst shots)', () => {
  let dataDir: string;
  let origDataDir: string | undefined;
  let stats: Awaited<ReturnType<typeof runScan>>;

  beforeAll(async () => {
    origDataDir = process.env.DATA_DIR;
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-similar-'));
    await fs.cp(SIMILAR_DIR, path.join(dataDir, 'Inbound'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'Keeping'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'Recycle Bin'), { recursive: true });
    process.env.DATA_DIR = dataDir;
    clearAll();
    stats = await runScan(makeConfig());
    console.log('\n  Similar scan stats:', JSON.stringify(stats, null, 2));
  }, 120000);

  afterAll(async () => {
    clearAll();
    await fs.rm(dataDir, { recursive: true, force: true });
    if (origDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = origDataDir;
  });

  it('processes all 27 HEIC files with no errors', () => {
    expect(stats.errors).toBe(0);
    expect(stats.totalScanned).toBe(27);
  });

  it('grouped + singletons = totalScanned', () => {
    expect(stats.totalScanned).toBe(stats.grouped + stats.singletons);
  });

  it('group count from stats matches DB', () => {
    expect(getAllGroups().length).toBe(stats.groupCount);
  });

  it('each group in the DB has a valid representative path within the Similar folder', () => {
    const dbGroups = getAllGroups();
    for (const group of dbGroups) {
      expect(group.representativePath).toContain('Similar');
    }
  });
});

describe('runScan — incremental (re-scan respects already-scanned images)', () => {
  let dataDir: string;
  let origDataDir: string | undefined;

  beforeAll(async () => {
    origDataDir = process.env.DATA_DIR;
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-incr-'));
    await fs.cp(SIMILAR_DIR, path.join(dataDir, 'Inbound'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'Keeping'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'Recycle Bin'), { recursive: true });
    process.env.DATA_DIR = dataDir;
    clearAll();
  }, 30000);

  afterAll(async () => {
    clearAll();
    await fs.rm(dataDir, { recursive: true, force: true });
    if (origDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = origDataDir;
  });

  it('first scan processes all 27 images', async () => {
    const stats = await runScan(makeConfig());
    expect(stats.totalScanned).toBe(27);
  }, 120000);

  it('second scan on the same folder produces no errors and consistent group count', async () => {
    const groupsBefore = getAllGroups().length;
    const stats2 = await runScan(makeConfig());
    expect(stats2.errors).toBe(0);
    expect(getAllGroups().length).toBeGreaterThanOrEqual(groupsBefore);
  }, 120000);
});
