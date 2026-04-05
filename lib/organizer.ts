import path from 'path';
import fs from 'fs';
import type { ImageRecord } from '@/types';

function resolveDate(record: ImageRecord): Date {
  const src = record.dateTaken ?? record.fileMtime;
  return new Date(src);
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

function uniquePath(dest: string): string {
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(dest);
  const base = dest.slice(0, dest.length - ext.length);
  let counter = 1;
  while (fs.existsSync(`${base}_${counter}${ext}`)) {
    counter++;
  }
  return `${base}_${counter}${ext}`;
}

export function getKeepingPath(
  outboundBase: string,
  record: ImageRecord,
  filename: string
): string {
  const date = resolveDate(record);
  const yyyy = String(date.getFullYear());
  const mm = padTwo(date.getMonth() + 1);
  const dest = path.join(outboundBase, 'Keeping', yyyy, mm, filename);
  return uniquePath(dest);
}

export function getRecyclePath(outboundBase: string, filename: string): string {
  const dest = path.join(outboundBase, 'Recycle Bin', filename);
  return uniquePath(dest);
}
