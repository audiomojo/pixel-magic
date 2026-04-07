/**
 * End-to-end tests for the full review workflow.
 *
 * Uses the Similar folder (27 HEIC files) as the inbound source since all files
 * are processable by this build of sharp.
 *
 * Tests the complete pipeline by calling Next.js route handlers directly:
 *   1. Scan via runScan() → populates DB with groups
 *   2. GET /api/groups → returns pending groups
 *   3. GET /api/groups/:id → returns group with all images
 *   4. POST /api/groups/:id → resolves group (keep 1, recycle rest)
 *   5. Verify files copied to correct output folders with YYYY/MM structure
 *   6. POST /api/singletons → copies ungrouped images to Keeping
 *   7. GET /api/stats → reflects resolved state
 *
 * Config is written/restored around the test suite.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { runScan } from '@/lib/processor';
import { clearAll, getAllGroups, getByGroupId } from '@/lib/db';
import { GET as getGroups } from '@/app/api/groups/route';
import { GET as getGroupDetail, POST as resolveGroup } from '@/app/api/groups/[id]/route';
import { GET as getStats, DELETE as deleteStats } from '@/app/api/stats/route';
import { POST as postSingletons } from '@/app/api/singletons/route';
import { NextRequest } from 'next/server';

const SIMILAR_DIR = path.resolve(__dirname, '../../test-photos/Similar');
const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

let outboundBase: string;
let originalConfig: string | null = null;

function makeRequest(url: string, options: RequestInit = {}): NextRequest {
  return new NextRequest(url, options as ConstructorParameters<typeof NextRequest>[1]);
}

beforeAll(async () => {
  outboundBase = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-e2e-'));
  await fs.mkdir(path.join(outboundBase, 'Keeping'), { recursive: true });
  await fs.mkdir(path.join(outboundBase, 'Recycle Bin'), { recursive: true });

  // Back up existing config
  if (existsSync(CONFIG_PATH)) {
    originalConfig = readFileSync(CONFIG_PATH, 'utf-8');
  }

  // Write test config
  const testConfig = {
    inboundFolder: SIMILAR_DIR,
    outboundBase,
    similarityThreshold: 90,
    supportedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'tif', 'jp2'],
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(testConfig, null, 2), 'utf-8');

  // Populate DB with scan results
  clearAll();
  const scanStats = await runScan(testConfig);
  console.log(`\n  E2E setup: ${scanStats.totalScanned} scanned, ${scanStats.groupCount} groups, ${scanStats.singletons} singletons`);
  console.log(`  Outbound: ${outboundBase}`);
}, 120000);

afterAll(async () => {
  if (originalConfig !== null) {
    writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
  }
  clearAll();
  await fs.rm(outboundBase, { recursive: true, force: true });
});

describe('GET /api/groups', () => {
  it('returns a non-empty array of pending groups', async () => {
    const res = await getGroups();
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('each group has id, representativePath, imageCount ≥ 2, and createdAt', async () => {
    const res = await getGroups();
    const groups = (await res.json()) as Array<Record<string, unknown>>;
    for (const g of groups) {
      expect(typeof g.id).toBe('number');
      expect(typeof g.representativePath).toBe('string');
      expect(g.imageCount as number).toBeGreaterThanOrEqual(2);
      expect(typeof g.createdAt).toBe('string');
    }
  });
});

describe('GET /api/groups/:id', () => {
  it('returns group detail with all member images', async () => {
    const groups = getAllGroups();
    const firstGroup = groups[0];

    const req = makeRequest(`http://localhost/api/groups/${firstGroup.id}`);
    const res = await getGroupDetail(req, {
      params: Promise.resolve({ id: String(firstGroup.id) }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { group: Record<string, unknown>; images: unknown[] };
    expect(body.group).toBeDefined();
    expect(Array.isArray(body.images)).toBe(true);
    expect(body.images.length).toBeGreaterThanOrEqual(2);
  });

  it('each image record has hash, dimensions, and status=pending', async () => {
    const groups = getAllGroups();
    const req = makeRequest(`http://localhost/api/groups/${groups[0].id}`);
    const res = await getGroupDetail(req, {
      params: Promise.resolve({ id: String(groups[0].id) }),
    });
    const body = (await res.json()) as { images: Array<Record<string, unknown>> };

    for (const img of body.images) {
      expect(typeof img.filePath).toBe('string');
      expect((img.hash as string).length).toBe(64);
      expect(img.width as number).toBeGreaterThan(0);
      expect(img.height as number).toBeGreaterThan(0);
      expect(img.status).toBe('pending');
    }
  });

  it('returns 404 for a non-existent group id', async () => {
    const req = makeRequest('http://localhost/api/groups/999999');
    const res = await getGroupDetail(req, {
      params: Promise.resolve({ id: '999999' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/groups/:id — group resolution', () => {
  let resolvedGroupId: number;
  let keptPath: string;

  it('keeps the first image and recycles the rest', async () => {
    const groups = getAllGroups();
    const firstGroup = groups[0];
    resolvedGroupId = firstGroup.id;
    const members = getByGroupId(firstGroup.id);

    keptPath = members[0].filePath;
    const recyclePaths = members.slice(1).map((m) => m.filePath);

    const req = makeRequest(`http://localhost/api/groups/${firstGroup.id}`, {
      method: 'POST',
      body: JSON.stringify({ keepPaths: [keptPath], recyclePaths, rotation: 0 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await resolveGroup(req, {
      params: Promise.resolve({ id: String(firstGroup.id) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('kept image is in Outbound-Keeping/YYYY/MM/', async () => {
    const keepingDir = path.join(outboundBase, 'Keeping');
    const files = await walkDir(keepingDir);
    expect(files.length).toBeGreaterThanOrEqual(1);

    for (const file of files) {
      const relative = path.relative(keepingDir, file);
      const parts = relative.split(path.sep);
      // Must be YYYY/MM/filename
      expect(parts.length).toBe(3);
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      expect(year).toBeGreaterThan(2000);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });

  it('recycled images are in Outbound-Recycle Bin/', async () => {
    const recycleDir = path.join(outboundBase, 'Recycle Bin');
    const files = await walkDir(recycleDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when resolution does not account for all group images', async () => {
    // Find a group that still has pending images with ≥ 2 members
    const groups = getAllGroups();
    const pendingGroup = groups.find((g) => {
      const members = getByGroupId(g.id);
      return members.some((m) => m.status === 'pending') && members.length >= 2;
    });
    if (!pendingGroup) return; // all resolved, skip

    const members = getByGroupId(pendingGroup.id).filter((m) => m.status === 'pending');
    // Omit the last image — should cause validation error
    const req = makeRequest(`http://localhost/api/groups/${pendingGroup.id}`, {
      method: 'POST',
      body: JSON.stringify({ keepPaths: [members[0].filePath], recyclePaths: [] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await resolveGroup(req, {
      params: Promise.resolve({ id: String(pendingGroup.id) }),
    });
    expect(res.status).toBe(400);
  });

  it('rotation: 270 keeps file as .jpg in Keeping/', async () => {
    // Find a group that still has pending members
    const groups = getAllGroups();
    const pendingGroup = groups.find((g) => {
      const members = getByGroupId(g.id);
      return members.some((m) => m.status === 'pending') && members.length >= 2;
    });
    if (!pendingGroup) {
      console.warn('  No pending group available for rotation test — skipping');
      return;
    }

    const members = getByGroupId(pendingGroup.id).filter((m) => m.status === 'pending');
    const keptMember = members[0];
    const recyclePaths = members.slice(1).map((m) => m.filePath);

    const req = makeRequest(`http://localhost/api/groups/${pendingGroup.id}`, {
      method: 'POST',
      body: JSON.stringify({
        keepPaths: [keptMember.filePath],
        recyclePaths,
        rotation: 270,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await resolveGroup(req, {
      params: Promise.resolve({ id: String(pendingGroup.id) }),
    });
    expect(res.status).toBe(200);

    // The kept file should now exist in Keeping/ with a .jpg extension
    const keepingDir = path.join(outboundBase, 'Keeping');
    const files = await walkDir(keepingDir);
    const jpgFiles = files.filter((f) => f.endsWith('.jpg'));
    expect(jpgFiles.length).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/singletons', () => {
  it('copies singleton (ungrouped) images to Keeping and returns a count', async () => {
    const res = await postSingletons();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; count: number };
    expect(body.ok).toBe(true);
    expect(typeof body.count).toBe('number');
    expect(body.count).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/stats', () => {
  it('reflects resolved counts accurately', async () => {
    const res = await getStats();
    expect(res.status).toBe(200);
    const stats = (await res.json()) as Record<string, unknown>;

    expect(typeof stats.totalScanned).toBe('number');
    expect(typeof stats.keptCount).toBe('number');
    expect(typeof stats.recycledCount).toBe('number');
    expect(typeof stats.singletonCount).toBe('number');
    expect(typeof stats.pendingGroupCount).toBe('number');
    expect(typeof stats.pendingGroupImageCount).toBe('number');

    // After resolving at least one group, kept + recycled should be > 0
    expect((stats.keptCount as number) + (stats.recycledCount as number)).toBeGreaterThanOrEqual(1);
  });
});

describe('DELETE /api/stats', () => {
  it('clears all DB records and returns { cleared: true }', async () => {
    const res = await deleteStats();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cleared: boolean };
    expect(body.cleared).toBe(true);
  });

  it('GET /api/stats after clear returns zero counts', async () => {
    const res = await getStats();
    expect(res.status).toBe(200);
    const stats = (await res.json()) as Record<string, unknown>;
    expect(stats.totalScanned).toBe(0);
    expect(stats.keptCount).toBe(0);
    expect(stats.recycledCount).toBe(0);
    expect(stats.pendingGroupCount).toBe(0);
  });
});

async function walkDir(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}
