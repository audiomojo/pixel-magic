import sharp from 'sharp';
import { imageHash as imageHashCb } from 'image-hash';
import heicConvert from 'heic-convert';
import exifr from 'exifr';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { ImageRecord } from '@/types';

const THUMB_SIZE = 1200;
const THUMB_QUALITY = 80;

async function saveThumbnail(hash: string, sharpInput: Buffer | string): Promise<void> {
  if (!process.env.DATA_DIR) return; // no-op outside a DATA_DIR context (e.g. unit tests)
  const { thumbsDir } = await import('./paths');
  const dir = thumbsDir();
  const thumbPath = path.join(dir, `${hash}.jpg`);
  // Skip if already written — same hash = same image content
  try { await fs.access(thumbPath); return; } catch { /* not yet cached */ }
  await fs.mkdir(dir, { recursive: true });
  const buf = await sharp(sharpInput, { failOn: 'none' })
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
  await fs.writeFile(thumbPath, buf);
}

function hashFilePath(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    imageHashCb(filePath, 16, 'hex', (err: Error | null, data: string) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function hashBuffer(buffer: Buffer): Promise<string> {
  // image-hash v7 only accepts file paths — write to a temp file, hash, then delete
  const tmpFile = path.join(os.tmpdir(), `pixel-magic-${randomUUID()}.jpg`);
  try {
    await fs.writeFile(tmpFile, buffer);
    return await hashFilePath(tmpFile);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

async function computeHash(filePath: string): Promise<string> {
  // Always resize to a small thumbnail before hashing to avoid image-hash/jimp memory limits.
  // Perceptual hash is identical regardless of input resolution.
  try {
    // sharp handles JPEG, PNG, WebP, TIFF, GIF, BMP, and most HEIC/HEIF
    const thumb = await sharp(filePath, { failOn: 'none' })
      .resize(256, 256, { fit: 'inside' })
      .jpeg()
      .toBuffer();
    return await hashBuffer(thumb);
  } catch {
    // Fallback: HEVC-encoded HEIC that libvips can't decode — heic-convert has its own libheif
    const raw = await fs.readFile(filePath);
    const jpeg = Buffer.from(await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.92 }));
    const thumb = await sharp(jpeg).resize(256, 256, { fit: 'inside' }).jpeg().toBuffer();
    return await hashBuffer(thumb);
  }
}

async function toSharpInput(filePath: string): Promise<Buffer | string> {
  try {
    // Verify sharp can read the file (fast metadata check)
    await sharp(filePath, { failOn: 'none' }).metadata();
    return filePath; // sharp can handle it directly
  } catch {
    // HEVC HEIC: convert to JPEG buffer via heic-convert
    const raw = await fs.readFile(filePath);
    return Buffer.from(
      await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.92 })
    );
  }
}

export async function hashImage(filePath: string): Promise<ImageRecord | null> {
  try {
    const stat = await fs.stat(filePath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exifData = await exifr.parse(filePath, { DateTimeOriginal: true, DateTimeDigitized: true, CreateDate: true } as any).catch(() => null);

    const sharpInput = await toSharpInput(filePath);
    const [meta, hash] = await Promise.all([
      sharp(sharpInput, { failOn: 'none' }).metadata(),
      computeHash(filePath),
    ]);

    // Generate thumbnail in background — best-effort, never fails the scan
    saveThumbnail(hash, sharpInput).catch(() => {});

    const dateTaken =
      (exifData?.DateTimeOriginal as Date | undefined)?.toISOString() ??
      (exifData?.DateTimeDigitized as Date | undefined)?.toISOString() ??
      (exifData?.CreateDate as Date | undefined)?.toISOString() ??
      null;

    return {
      filePath,
      hash,
      fileSize: stat.size,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      dpiX: meta.density ?? 72,
      dpiY: meta.density ?? 72,
      dateTaken,
      fileMtime: stat.mtime.toISOString(),
      groupId: null,
      status: 'pending',
      addedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[hasher] Could not process ${filePath}:`, (err as Error).message);
    return null;
  }
}
