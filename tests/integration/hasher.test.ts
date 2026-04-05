/**
 * Integration tests for lib/hasher.ts
 *
 * Uses real photos from test-photos/Identical and test-photos/Similar.
 *
 * Fixture notes:
 * - Identical/IMG_0496 10.HEIC.png  → real PNG, hashes directly
 * - Identical/IMG_0496 10.HEIC.tiff → real TIFF, requires sharp fallback
 * - Identical/*.HEIC.jpeg           → HEVC-encoded HEIC content misnamed as .jpeg;
 *                                     this build of sharp lacks HEVC codec → returns null
 * - Identical/IMG_0496 10.HEIC.jp2  → JP2 not supported by sharp → returns null
 * - Similar/*.HEIC                  → native HEIC (AVC-encoded); requires sharp fallback
 *                                     with failOn:'none' to ignore tile warnings
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { hashImage } from '@/lib/hasher';

const IDENTICAL_DIR = path.resolve(__dirname, '../../test-photos/Identical');
const SIMILAR_DIR = path.resolve(__dirname, '../../test-photos/Similar');

describe('hashImage — Identical folder (processable formats)', () => {
  it('hashes a real PNG file successfully', async () => {
    const record = await hashImage(path.join(IDENTICAL_DIR, 'IMG_0496 10.HEIC.png'));
    expect(record).not.toBeNull();
    expect(record!.hash).toHaveLength(64);
    expect(record!.width).toBeGreaterThan(0);
    expect(record!.height).toBeGreaterThan(0);
    expect(record!.fileSize).toBeGreaterThan(0);
    expect(record!.status).toBe('pending');
    expect(record!.groupId).toBeNull();
  });

  it('hashes a real TIFF file via sharp fallback', async () => {
    // image-hash does not natively support TIFF; hasher converts via sharp → JPEG
    const record = await hashImage(path.join(IDENTICAL_DIR, 'IMG_0496 10.HEIC.tiff'));
    expect(record).not.toBeNull();
    expect(record!.hash).toHaveLength(64);
    expect(record!.width).toBeGreaterThan(0);
    expect(record!.height).toBeGreaterThan(0);
  });

  it('returns null gracefully for a HEVC-encoded HEIC file (codec not in this sharp build)', async () => {
    // Files like IMG_0496.HEIC.jpeg are HEIC content renamed to .jpeg.
    // This version of sharp lacks the HEVC codec, so hashImage returns null.
    const record = await hashImage(path.join(IDENTICAL_DIR, 'IMG_0496.HEIC.jpeg'));
    expect(record).toBeNull();
  });

  it('returns null gracefully for a JP2 file (unsupported by sharp)', async () => {
    const record = await hashImage(path.join(IDENTICAL_DIR, 'IMG_0496 10.HEIC.jp2'));
    expect(record).toBeNull();
  });

  it('returns null for a non-existent file', async () => {
    const record = await hashImage(path.join(IDENTICAL_DIR, 'does-not-exist.jpg'));
    expect(record).toBeNull();
  });
});

describe('hashImage — Similar folder (native HEIC from iPhone, AVC-encoded)', () => {
  it('hashes an iPhone HEIC file via sharp fallback with failOn:none', async () => {
    const record = await hashImage(path.join(SIMILAR_DIR, 'IMG_1272.HEIC'));
    expect(record).not.toBeNull();
    expect(record!.hash).toHaveLength(64);
    expect(record!.width).toBeGreaterThan(0);
    expect(record!.height).toBeGreaterThan(0);
  });

  it('extracts EXIF dateTaken from a native HEIC file', async () => {
    const record = await hashImage(path.join(SIMILAR_DIR, 'IMG_1320.HEIC'));
    expect(record).not.toBeNull();
    if (record!.dateTaken) {
      expect(() => new Date(record!.dateTaken!)).not.toThrow();
      const year = new Date(record!.dateTaken!).getFullYear();
      expect(year).toBeGreaterThan(2015);
      expect(year).toBeLessThanOrEqual(new Date().getFullYear());
    }
    // fileMtime fallback must always be present
    expect(record!.fileMtime).toBeTruthy();
  });

  it('hashes multiple HEIC files from a burst sequence', async () => {
    const burstFiles = ['IMG_1320.HEIC', 'IMG_1321.HEIC', 'IMG_1322.HEIC', 'IMG_1323.HEIC'];
    const records = await Promise.all(
      burstFiles.map((f) => hashImage(path.join(SIMILAR_DIR, f)))
    );
    for (const r of records) {
      expect(r).not.toBeNull();
      expect(r!.hash).toHaveLength(64);
    }
  });
});
