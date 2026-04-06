import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

function isAllowedPath(filePath: string, inboundFolder: string, outboundBase: string): boolean {
  const normalized = path.normalize(filePath);
  return (
    normalized.startsWith(path.normalize(inboundFolder)) ||
    normalized.startsWith(path.normalize(outboundBase))
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  let config;
  try {
    config = readConfig();
  } catch {
    return NextResponse.json({ error: 'Could not read config' }, { status: 500 });
  }

  if (!isAllowedPath(filePath, config.inboundFolder, config.outboundBase)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  try {
    const raw = await fs.readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();

    // Convert to JPEG for browser display — handles HEIC, TIFF, and other non-web formats
    try {
      let jpegBuffer: Buffer;
      if (ext === 'heic' || ext === 'heif') {
        // Try sharp first (handles HEVC on some platforms); fall back to heic-convert
        try {
          jpegBuffer = await sharp(raw, { failOn: 'none' }).jpeg({ quality: 85 }).toBuffer();
        } catch {
          const converted = await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.85 });
          jpegBuffer = Buffer.from(converted);
        }
      } else {
        jpegBuffer = await sharp(raw, { failOn: 'none' }).jpeg({ quality: 85 }).toBuffer();
      }
      return new Response(jpegBuffer.buffer as ArrayBuffer, { headers: { 'Content-Type': 'image/jpeg' } });
    } catch {
      // Fall back to serving the raw file if conversion fails
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      return new Response(raw.buffer as ArrayBuffer, { headers: { 'Content-Type': contentType } });
    }
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
