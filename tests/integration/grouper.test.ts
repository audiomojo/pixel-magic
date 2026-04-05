/**
 * Integration tests for lib/grouper.ts
 *
 * Uses real photos to verify the grouper correctly clusters similar images.
 *
 * Fixture notes:
 * - Identical folder: only IMG_0496 10.HEIC.png and .tiff are processable.
 *   They are the SAME source image in two formats → should form 1 group of 2.
 * - Similar folder: 27 HEIC files (burst sequences) → multiple groups expected.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { hashImage } from '@/lib/hasher';
import { buildGroups } from '@/lib/grouper';
import type { ImageRecord } from '@/types';

const IDENTICAL_DIR = path.resolve(__dirname, '../../test-photos/Identical');
const SIMILAR_DIR = path.resolve(__dirname, '../../test-photos/Similar');

const THRESHOLD = 90;

async function hashFiles(dir: string, filenames: string[]): Promise<ImageRecord[]> {
  const results = await Promise.all(
    filenames.map((f) => hashImage(path.join(dir, f)))
  );
  return results.filter((r): r is ImageRecord => r !== null);
}

async function hashFolder(dir: string): Promise<ImageRecord[]> {
  const { default: fs } = await import('fs/promises');
  const files = await fs.readdir(dir);
  return hashFiles(
    dir,
    files.filter((f) => !f.startsWith('.'))
  );
}

describe('buildGroups — cross-format grouping (PNG vs TIFF of same image)', () => {
  let records: ImageRecord[];
  let groups: Map<number, number[]>;

  beforeAll(async () => {
    records = await hashFiles(IDENTICAL_DIR, [
      'IMG_0496 10.HEIC.png',
      'IMG_0496 10.HEIC.tiff',
    ]);
    groups = buildGroups(records, THRESHOLD);
    console.log(`\n  Cross-format: ${records.length} images → ${groups.size} group(s)`);
    for (const [rep, members] of groups) {
      const names = members.map((i) => path.basename(records[i].filePath));
      console.log(`    Group (rep idx ${rep}): ${names.join(', ')}`);
    }
  }, 60000);

  it('produces exactly 1 group for PNG and TIFF of the same source image', () => {
    expect(records.length).toBe(2);
    expect(groups.size).toBe(1);
  });

  it('the group contains both the PNG and the TIFF', () => {
    const [, members] = [...groups.entries()][0];
    expect(members.length).toBe(2);
    const names = members.map((i) => path.basename(records[i].filePath));
    expect(names.some((n) => n.endsWith('.png'))).toBe(true);
    expect(names.some((n) => n.endsWith('.tiff'))).toBe(true);
  });
});

describe('buildGroups — Similar folder (27 burst-shot HEIC files)', () => {
  let records: ImageRecord[];
  let groups: Map<number, number[]>;

  beforeAll(async () => {
    records = await hashFolder(SIMILAR_DIR);
    groups = buildGroups(records, THRESHOLD);
    console.log(`\n  Similar folder: ${records.length} images → ${groups.size} group(s)`);
    for (const [rep, members] of groups) {
      const repName = path.basename(records[rep].filePath);
      const memberNames = members.map((i) => path.basename(records[i].filePath)).join(', ');
      console.log(`    Group (rep: ${repName}): ${memberNames}`);
    }
    const totalGrouped = [...groups.values()].reduce((sum, m) => sum + m.length, 0);
    const singletons = records.length - totalGrouped;
    console.log(`  Singletons: ${singletons}`);
  }, 120000);

  it('all 27 HEIC files hashed successfully', () => {
    expect(records.length).toBe(27);
  });

  it('finds at least 2 distinct groups (multiple burst sequences)', () => {
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });

  it('every group has at least 2 members', () => {
    for (const [, members] of groups) {
      expect(members.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('groups contain consecutive burst shots', () => {
    let foundSequential = false;
    for (const [, members] of groups) {
      const numbers = members
        .map((idx) => {
          const m = path.basename(records[idx].filePath).match(/IMG_(\d+)/);
          return m ? parseInt(m[1], 10) : -1;
        })
        .filter((n) => n >= 0)
        .sort((a, b) => a - b);

      for (let i = 0; i < numbers.length - 1; i++) {
        if (numbers[i + 1] - numbers[i] === 1) {
          foundSequential = true;
          break;
        }
      }
      if (foundSequential) break;
    }
    expect(foundSequential).toBe(true);
  });

  it('not all images land in the same group (distinct burst sessions)', () => {
    const maxGroupSize = Math.max(...[...groups.values()].map((m) => m.length));
    expect(maxGroupSize).toBeLessThan(records.length);
  });

  it('all record indices in all groups are valid', () => {
    for (const [rep, members] of groups) {
      expect(rep).toBeGreaterThanOrEqual(0);
      expect(rep).toBeLessThan(records.length);
      for (const idx of members) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(records.length);
      }
    }
  });
});

describe('buildGroups — edge cases', () => {
  it('returns empty map for empty input', () => {
    expect(buildGroups([], THRESHOLD).size).toBe(0);
  });

  it('returns empty map for a single image (cannot form a group alone)', async () => {
    const record = await hashImage(path.join(SIMILAR_DIR, 'IMG_1272.HEIC'));
    expect(record).not.toBeNull();
    expect(buildGroups([record!], THRESHOLD).size).toBe(0);
  });
});
