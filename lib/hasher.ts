import sharp from 'sharp';
import { imageHash as imageHashCb } from 'image-hash';
import heicConvert from 'heic-convert';
import exifr from 'exifr';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { ImageRecord } from '@/types';

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
  // Fast path: image-hash supports JPEG, PNG, GIF, BMP, WebP natively
  try {
    return await hashFilePath(filePath);
  } catch {
    // Fallback 1: sharp → JPEG (handles TIFF, AVIF, misnamed files, etc.)
    try {
      const buffer = await sharp(filePath, { failOn: 'none' }).jpeg().toBuffer();
      return await hashBuffer(buffer);
    } catch {
      // Fallback 2: HEIC/HEIF with HEVC codec — heic-convert bundles its own libheif with HEVC
      const raw = await fs.readFile(filePath);
      const jpegBuffer = Buffer.from(
        await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.92 })
      );
      return await hashBuffer(jpegBuffer);
    }
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
