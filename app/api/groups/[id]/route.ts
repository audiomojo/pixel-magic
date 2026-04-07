import { NextRequest, NextResponse } from 'next/server';
import { getAllGroups, getByGroupId, updateStatus } from '@/lib/db';
import { readConfig } from '@/lib/config';
import { getKeepingPath, getRecyclePath } from '@/lib/organizer';
import fs from 'fs/promises';
import path from 'path';
import type { GroupResolution } from '@/types';
import sharp from 'sharp';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const groupId = parseInt(id, 10);
    const groups = getAllGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    const images = getByGroupId(groupId);
    return NextResponse.json({ group, images });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const groupId = parseInt(id, 10);
    const body = (await req.json()) as GroupResolution;
    const { keepPaths, recyclePaths, rotation } = body;

    if (rotation !== undefined && rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
      return NextResponse.json({ error: `Invalid rotation value: ${rotation}` }, { status: 400 });
    }

    const members = getByGroupId(groupId);
    const memberPaths = new Set(members.map((m) => m.filePath));

    // Validate all paths accounted for
    const allProvided = new Set([...keepPaths, ...recyclePaths]);
    for (const p of memberPaths) {
      if (!allProvided.has(p)) {
        return NextResponse.json(
          { error: `Image not accounted for in resolution: ${p}` },
          { status: 400 }
        );
      }
    }
    for (const p of allProvided) {
      if (!memberPaths.has(p)) {
        return NextResponse.json(
          { error: `Path not in group: ${p}` },
          { status: 400 }
        );
      }
    }

    const config = readConfig();

    for (const filePath of keepPaths) {
      const record = members.find((m) => m.filePath === filePath);
      if (!record) continue;
      const filename = path.basename(filePath);
      const dest = getKeepingPath(config.outboundBase, record, filename);
      await fs.mkdir(path.dirname(dest), { recursive: true });

      if (rotation) {
        const jpegDest = dest.replace(/\.[^.]+$/, '.jpg');
        await sharp(filePath).rotate(rotation).jpeg({ quality: 92 }).toFile(jpegDest);
        await fs.unlink(filePath); // Safe: unlink only runs after successful toFile()
      } else {
        await fs.rename(filePath, dest);
      }

      if (record.id !== undefined) updateStatus(record.id, 'kept');
    }

    for (const filePath of recyclePaths) {
      const record = members.find((m) => m.filePath === filePath);
      if (!record) continue;
      const filename = path.basename(filePath);
      const dest = getRecyclePath(config.outboundBase, filename);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(filePath, dest);
      if (record.id !== undefined) updateStatus(record.id, 'recycled');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
