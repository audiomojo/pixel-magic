import { NextResponse } from 'next/server';
import { getAllGroups, getByGroupId } from '@/lib/db';

export async function GET() {
  try {
    // Only return groups that still have at least one pending image
    const allGroups = getAllGroups();
    const pendingGroups = allGroups.filter((g) => {
      const members = getByGroupId(g.id);
      return members.some((m) => m.status === 'pending');
    });
    return NextResponse.json(pendingGroups);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
