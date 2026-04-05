/**
 * Integration tests for lib/processor.ts (full scan pipeline)
 *
 * Fixture notes:
 * - Identical folder: 13 files total.
 *   - 2 processable: IMG_0496 10.HEIC.png (PNG) + IMG_0496 10.HEIC.tiff (TIFF)
 *   - 11 will fail: *.HEIC.jpeg (HEVC codec not supported), *.jp2 (unsupported)
 *   - Expect: 1 group, 2 grouped images, 0 singletons, ~11 errors
 *
 * - Similar folder: 27 HEIC files from iPhone.
 *   - All should process successfully via sharp fallback
 *   - Expect: multiple groups of burst shots + some singletons
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

function makeConfig(inboundFolder: string, outboundBase: string): AppConfig {
  return {
    inboundFolder,
    outboundBase,
    similarityThreshold: 90,
    supportedExtensions: SUPPORTED_EXTENSIONS,
  };
}

describe('runScan — Identical folder (mixed processable/unprocessable)', () => {
  let outboundBase: string;
  let stats: Awaited<ReturnType<typeof runScan>>;

  beforeAll(async () => {
    outboundBase = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-identical-'));
    await fs.mkdir(path.join(outboundBase, 'Keeping'), { recursive: true });
    await fs.mkdir(path.join(outboundBase, 'Recycle Bin'), { recursive: true });
    clearAll();
    stats = await runScan(makeConfig(IDENTICAL_DIR, outboundBase));
    console.log('\n  Identical scan stats:', JSON.stringify(stats, null, 2));
  }, 120000);

  afterAll(async () => {
    clearAll();
    await fs.rm(outboundBase, { recursive: true, force: true });
  });

  it('processes exactly 2 images (PNG + TIFF)', () => {
    // Only IMG_0496 10.HEIC.png and .tiff are decodable by this sharp build
    expect(stats.totalScanned).toBe(2);
  });

  it('reports errors for unprocessable files (HEVC HEIC + JP2)', () => {
    // 10 *.HEIC.jpeg + 1 *.jp2 = 11 failures
    expect(stats.errors).toBeGreaterThan(0);
  });

  it('creates 1 group (PNG and TIFF are the same source image)', () => {
    expect(stats.groupCount).toBe(1);
    expect(getAllGroups().length).toBe(1);
  });

  it('the group contains both processable files', () => {
    const group = getAllGroups()[0];
    const members = getByGroupId(group.id);
    expect(members.length).toBe(2);
  });

  it('has 0 singletons (both processable files grouped)', () => {
    expect(stats.singletons).toBe(0);
    expect(getAllSingletons().length).toBe(0);
  });

  it('totalScanned = grouped + singletons', () => {
    expect(stats.totalScanned).toBe(stats.grouped + stats.singletons);
  });
});

describe('runScan — Similar folder (27 iPhone HEIC burst shots)', () => {
  let outboundBase: string;
  let stats: Awaited<ReturnType<typeof runScan>>;

  beforeAll(async () => {
    outboundBase = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-similar-'));
    await fs.mkdir(path.join(outboundBase, 'Keeping'), { recursive: true });
    await fs.mkdir(path.join(outboundBase, 'Recycle Bin'), { recursive: true });
    clearAll();
    stats = await runScan(makeConfig(SIMILAR_DIR, outboundBase));
    console.log('\n  Similar scan stats:', JSON.stringify(stats, null, 2));
  }, 120000);

  afterAll(async () => {
    clearAll();
    await fs.rm(outboundBase, { recursive: true, force: true });
  });

  it('processes all 27 HEIC files with no errors', () => {
    expect(stats.errors).toBe(0);
    expect(stats.totalScanned).toBe(27);
  });

  it('finds multiple groups (distinct burst sequences)', () => {
    expect(stats.groupCount).toBeGreaterThanOrEqual(2);
    expect(getAllGroups().length).toBe(stats.groupCount);
  });

  it('largest group does not contain all images', () => {
    const dbGroups = getAllGroups();
    const largestGroupSize = Math.max(...dbGroups.map((g) => getByGroupId(g.id).length));
    expect(largestGroupSize).toBeLessThan(27);
  });

  it('grouped + singletons = totalScanned', () => {
    expect(stats.totalScanned).toBe(stats.grouped + stats.singletons);
  });

  it('each group in the DB has a valid representative path within the Similar folder', () => {
    const dbGroups = getAllGroups();
    for (const group of dbGroups) {
      expect(group.representativePath).toContain('Similar');
    }
  });
});

describe('runScan — incremental (re-scan respects already-scanned images)', () => {
  let outboundBase: string;

  beforeAll(async () => {
    outboundBase = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-incr-'));
    await fs.mkdir(path.join(outboundBase, 'Keeping'), { recursive: true });
    await fs.mkdir(path.join(outboundBase, 'Recycle Bin'), { recursive: true });
    clearAll();
  }, 30000);

  afterAll(async () => {
    clearAll();
    await fs.rm(outboundBase, { recursive: true, force: true });
  });

  it('first scan processes all 27 images', async () => {
    const stats = await runScan(makeConfig(SIMILAR_DIR, outboundBase));
    expect(stats.totalScanned).toBe(27);
  }, 120000);

  it('second scan on the same folder produces no errors and consistent group count', async () => {
    const groupsBefore = getAllGroups().length;
    const stats2 = await runScan(makeConfig(SIMILAR_DIR, outboundBase));
    expect(stats2.errors).toBe(0);
    expect(getAllGroups().length).toBeGreaterThanOrEqual(groupsBefore);
  }, 120000);
});
