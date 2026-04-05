/**
 * Phase 2 acceptance test script.
 * Run with: npx tsx scripts/test-engine.ts
 *
 * Creates a small test JPEG with sharp, then exercises every lib function.
 */

import sharp from 'sharp';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { hashImage } from '../lib/hasher';
import { hammingDistance, hashSimilarityPct, isSimilar } from '../lib/comparator';
import { buildGroups } from '../lib/grouper';
import { getKeepingPath, getRecyclePath } from '../lib/organizer';
import { insertRecord, insertGroup, updateGroupId, getAllGroups, getAllPending, getByGroupId, clearAll } from '../lib/db';
import type { ImageRecord } from '../types';

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-test-'));
  const testImage = path.join(tmpDir, 'test.jpg');
  const outboundBase = path.join(tmpDir, 'outbound');
  await fs.mkdir(path.join(outboundBase, 'Keeping'), { recursive: true });
  await fs.mkdir(path.join(outboundBase, 'Recycle Bin'), { recursive: true });

  // Create a simple 100x100 red JPEG
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .toFile(testImage);

  console.log('\n=== hashImage ===');
  const record = await hashImage(testImage);
  if (!record) throw new Error('hashImage returned null');
  console.log(`  filePath: ${record.filePath}`);
  console.log(`  hash length: ${record.hash.length} chars (expected 64)`);
  console.log(`  width: ${record.width}, height: ${record.height}`);
  console.log(`  fileSize: ${record.fileSize} bytes`);
  console.log(`  dpiX: ${record.dpiX}, dpiY: ${record.dpiY}`);
  if (record.hash.length !== 64) throw new Error(`Expected 64-char hash, got ${record.hash.length}`);
  if (record.width !== 100 || record.height !== 100) throw new Error('Unexpected dimensions');
  console.log('  PASS');

  console.log('\n=== hammingDistance (identical hashes) ===');
  const dist = hammingDistance(record.hash, record.hash);
  console.log(`  distance: ${dist} (expected 0)`);
  if (dist !== 0) throw new Error('Expected 0 hamming distance for identical hashes');
  console.log('  PASS');

  console.log('\n=== hashSimilarityPct (identical hashes) ===');
  const sim = hashSimilarityPct(record.hash, record.hash);
  console.log(`  similarity: ${sim}% (expected 100)`);
  if (sim !== 100) throw new Error('Expected 100% similarity for identical hashes');
  console.log('  PASS');

  console.log('\n=== buildGroups (3 similar + 1 dissimilar) ===');
  const r1: ImageRecord = { ...record, id: 1, filePath: '/a.jpg' };
  const r2: ImageRecord = { ...record, id: 2, filePath: '/b.jpg' }; // identical hash → similar
  const r3: ImageRecord = { ...record, id: 3, filePath: '/c.jpg' }; // identical hash → similar
  const r4: ImageRecord = {
    ...record,
    id: 4,
    filePath: '/d.jpg',
    hash: 'f'.repeat(64), // all-1s hash → dissimilar from all-0s-ish hash
  };
  const groups = buildGroups([r1, r2, r3, r4], 90);
  console.log(`  groups found: ${groups.size} (expected 1)`);
  const [repIdx, members] = [...groups.entries()][0];
  console.log(`  representative index: ${repIdx}, members: ${members.length} (expected 3)`);
  if (groups.size !== 1) throw new Error('Expected exactly 1 group');
  if (members.length !== 3) throw new Error('Expected 3 members in the group');
  console.log('  PASS');

  console.log('\n=== getKeepingPath (EXIF date → 2024/06) ===');
  const r2024: ImageRecord = {
    ...record,
    dateTaken: '2024-06-15T10:00:00.000Z',
    fileMtime: '2020-01-01T00:00:00.000Z',
  };
  const keepPath = getKeepingPath(outboundBase, r2024, 'photo.jpg');
  console.log(`  path: ${keepPath}`);
  if (!keepPath.includes(path.join('Keeping', '2024', '06'))) {
    throw new Error(`Expected Keeping/2024/06 in path, got: ${keepPath}`);
  }
  console.log('  PASS');

  console.log('\n=== getRecyclePath ===');
  const recyclePath = getRecyclePath(outboundBase, 'photo.jpg');
  console.log(`  path: ${recyclePath}`);
  if (!recyclePath.includes('Recycle Bin')) throw new Error('Expected Recycle Bin in path');
  console.log('  PASS');

  console.log('\n=== DB: insertRecord, insertGroup, updateGroupId, getAllPending ===');
  clearAll();
  const dbRecord: ImageRecord = { ...record, filePath: testImage };
  const rowId = insertRecord(dbRecord);
  console.log(`  inserted record id: ${rowId}`);
  const pending = getAllPending();
  console.log(`  pending count: ${pending.length} (expected 1)`);
  if (pending.length !== 1) throw new Error('Expected 1 pending record');

  const groupId = insertGroup(testImage, 1);
  updateGroupId(rowId, groupId);
  const groupMembers = getByGroupId(groupId);
  console.log(`  group members: ${groupMembers.length} (expected 1)`);
  if (groupMembers.length !== 1) throw new Error('Expected 1 member in group');

  const allGroups = getAllGroups();
  console.log(`  total groups: ${allGroups.length} (expected 1)`);
  if (allGroups.length !== 1) throw new Error('Expected 1 group');
  console.log('  PASS');

  // Cleanup
  await fs.rm(tmpDir, { recursive: true });
  clearAll();

  console.log('\n✓ All Phase 2 acceptance criteria passed.\n');
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
