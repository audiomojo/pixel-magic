import { NextResponse } from 'next/server';
import { getRecycled, deleteRecycled } from '@/lib/db';
import { readConfig } from '@/lib/config';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const recycled = getRecycled();
    return NextResponse.json(recycled);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const config = readConfig();
    const recycleBinPath = path.join(config.outboundBase, 'Recycle Bin');
    const recycled = getRecycled();
    const count = recycled.length;

    // Delete all files in the Recycle Bin folder
    try {
      const entries = await fs.readdir(recycleBinPath);
      await Promise.all(
        entries.map((entry) =>
          fs.rm(path.join(recycleBinPath, entry), { recursive: true, force: true })
        )
      );
    } catch {
      // Folder may not exist yet; ignore
    }

    // Remove recycled records from DB
    deleteRecycled();

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
