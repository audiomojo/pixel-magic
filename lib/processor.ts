import { scanFolder } from './scanner';
import { hashImage } from './hasher';
import { buildGroups } from './grouper';
import { emitProgress } from './emitter';
import { inboundDir } from './paths';
import { startScorer } from './scorer';
import {
  getRecordByPath,
  insertRecord,
  insertGroup,
  updateGroupId,
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
    scored: 0,
    scoreErrors: 0,
  };

  // Phase A — Scanning + Hashing
  console.log(`[scan] starting — inbound=${inboundDir()}`);
  const allFiles = await scanFolder(inboundDir(), config.supportedExtensions);
  console.log(`[scan] found ${allFiles.length} files`);

  emitProgress({ type: 'progress', phase: 'hashing', current: 0, total: allFiles.length });

  let i = 0;
  for (const filePath of allFiles) {
    const existing = getRecordByPath(filePath);
    if (existing && existing.status !== 'pending') {
      console.log(`[hash] skip ${i + 1}/${allFiles.length} already-processed file=${filePath}`);
      i++;
      continue;
    }

    const record = await hashImage(filePath);
    if (!record) {
      console.error(`[hash] error ${i + 1}/${allFiles.length} file=${filePath}`);
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
    console.log(`[hash] ${i}/${allFiles.length} file=${filePath}`);
    emitProgress({
      type: 'progress',
      phase: 'hashing',
      current: i,
      total: allFiles.length,
      currentFile: filePath,
    });
  }

  console.log(`[scan] hashing done — scanned=${stats.totalScanned} errors=${stats.errors}`);

  // Phase B — Grouping (only ungrouped pending records)
  const pending = getUngroupedPending();
  console.log(`[group] starting — ${pending.length} ungrouped pending images threshold=${config.similarityThreshold}%`);
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
  console.log(`[group] done — groups=${stats.groupCount} grouped=${stats.grouped} singletons=${stats.singletons}`);

  // Phase C — AI Scoring (if enabled)
  if (config.aiScoringEnabled) {
    const scoreStats = await startScorer(config);
    stats.scored = scoreStats.scored;
    stats.scoreErrors = scoreStats.scoreErrors;
  }

  console.log(`[scan] complete — scanned=${stats.totalScanned} groups=${stats.groupCount} singletons=${stats.singletons} errors=${stats.errors} scored=${stats.scored}`);
  emitProgress({
    type: 'complete',
    phase: 'done',
    current: pending.length,
    total: pending.length,
    stats,
  });

  return stats;
}
