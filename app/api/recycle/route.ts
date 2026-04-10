import { NextResponse } from 'next/server';
import { getRecycled, deleteRecycled } from '@/lib/db';
import { recycleBinDir } from '@/lib/paths';
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
    const recycled = getRecycled();
    const count = recycled.length;

    try {
      const entries = await fs.readdir(recycleBinDir());
      await Promise.all(
        entries.map((entry) =>
          fs.rm(path.join(recycleBinDir(), entry), { recursive: true, force: true })
        )
      );
    } catch {
      // Folder may not exist yet; ignore
    }

    deleteRecycled();

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
