import { NextResponse } from 'next/server';
import { getAllSingletons, updateStatus } from '@/lib/db';
import { getKeepingPath } from '@/lib/organizer';
import fs from 'fs/promises';
import path from 'path';

export async function POST() {
  try {
    const singletons = getAllSingletons();
    let count = 0;

    for (const record of singletons) {
      const filename = path.basename(record.filePath);
      const dest = getKeepingPath(record, filename);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(record.filePath, dest);
      if (record.id !== undefined) updateStatus(record.id, 'singleton_kept');
      count++;
    }

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
