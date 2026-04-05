import { scanFolder, excludeOutbound } from './scanner';
import { hashImage } from './hasher';
import { buildGroups } from './grouper';
import { emitProgress } from './emitter';
import {
  getRecordByPath,
  insertRecord,
  insertGroup,
  updateGroupId,
  getAllPending,
  getUngroupedPending,
} from './db';
import type { AppConfig, ScanStats } from '@/types';

export async function runScan(config: AppConfig): Promise<ScanStats> {
  const stats: ScanStats = {
    totalScanned: 0,
    grouped: 0,
    singletons: 0,
    errors: 0,
    groupCount: 0,
  };

  // Phase A — Hashing
  let allFiles = await scanFolder(config.inboundFolder, config.supportedExtensions);
  if (config.outboundBase) {
    allFiles = excludeOutbound(allFiles, config.outboundBase);
  }

  emitProgress({ type: 'progress', phase: 'hashing', current: 0, total: allFiles.length });

  let i = 0;
  for (const filePath of allFiles) {
    const existing = getRecordByPath(filePath);
    if (existing && existing.status !== 'pending') {
      i++;
      continue;
    }

    const record = await hashImage(filePath);
    if (!record) {
      stats.errors++;
      i++;
      emitProgress({
        type: 'progress',
        phase: 'hashing',
        current: i,
        total: allFiles.length,
        currentFile: filePath,
      });
      continue;
    }

    if (!existing) {
      insertRecord(record);
    }

    stats.totalScanned++;
    i++;
    emitProgress({
      type: 'progress',
      phase: 'hashing',
      current: i,
      total: allFiles.length,
      currentFile: filePath,
    });
  }

  // Phase B — Grouping (only ungrouped pending records)
  const pending = getUngroupedPending();
  emitProgress({ type: 'grouping', phase: 'grouping', current: 0, total: pending.length });

  const groups = buildGroups(pending, config.similarityThreshold);

  for (const [repIdx, memberIndices] of groups) {
    const groupId = insertGroup(pending[repIdx].filePath, memberIndices.length);
    for (const idx of memberIndices) {
      const recordId = pending[idx].id;
      if (recordId !== undefined) {
        updateGroupId(recordId, groupId);
      }
    }
    stats.grouped += memberIndices.length;
    stats.groupCount++;
  }

  stats.singletons = pending.length - stats.grouped;

  emitProgress({ type: 'complete', phase: 'done', current: pending.length, total: pending.length, stats });

  return stats;
}
