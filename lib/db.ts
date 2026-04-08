import Database from 'better-sqlite3';
import path from 'path';
import type { ImageRecord, ImageGroup, ImageStatus, AiScoreStatus } from '@/types';

const DB_PATH = path.join(process.env.DATA_DIR || process.cwd(), 'cache.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS image_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    representative_path TEXT NOT NULL,
    image_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS image_hashes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    dpi_x REAL NOT NULL,
    dpi_y REAL NOT NULL,
    date_taken TEXT,
    file_mtime TEXT NOT NULL,
    group_id INTEGER REFERENCES image_groups(id),
    status TEXT NOT NULL DEFAULT 'pending',
    added_at TEXT NOT NULL
  );
`);

// ── AI scoring columns (idempotent migration) ──────────────────────────────
function addColumnIfMissing(sql: string): void {
  try {
    db.exec(sql);
  } catch {
    // Column already exists — SQLite throws on duplicate column name
  }
}

addColumnIfMissing("ALTER TABLE image_hashes ADD COLUMN ai_score REAL");
addColumnIfMissing("ALTER TABLE image_hashes ADD COLUMN ai_score_detail TEXT");
addColumnIfMissing("ALTER TABLE image_hashes ADD COLUMN ai_scored_at TEXT");
addColumnIfMissing(
  "ALTER TABLE image_hashes ADD COLUMN ai_score_status TEXT NOT NULL DEFAULT 'pending'"
);

function rowToRecord(row: Record<string, unknown>): ImageRecord {
  return {
    id: row.id as number,
    filePath: row.file_path as string,
    hash: row.hash as string,
    fileSize: row.file_size as number,
    width: row.width as number,
    height: row.height as number,
    dpiX: row.dpi_x as number,
    dpiY: row.dpi_y as number,
    dateTaken: row.date_taken as string | null,
    fileMtime: row.file_mtime as string,
    groupId: row.group_id as number | null,
    status: row.status as ImageStatus,
    addedAt: row.added_at as string,
    aiScore: (row.ai_score ?? null) as number | null,
    aiScoreDetail: (row.ai_score_detail ?? null) as string | null,
    aiScoredAt: (row.ai_scored_at ?? null) as string | null,
    aiScoreStatus: ((row.ai_score_status as string) ?? 'pending') as AiScoreStatus,
  };
}

function rowToGroup(row: Record<string, unknown>): ImageGroup {
  return {
    id: row.id as number,
    representativePath: row.representative_path as string,
    imageCount: row.image_count as number,
    createdAt: row.created_at as string,
  };
}

export function insertRecord(record: ImageRecord): number {
  const stmt = db.prepare(`
    INSERT INTO image_hashes
      (file_path, hash, file_size, width, height, dpi_x, dpi_y,
       date_taken, file_mtime, group_id, status, added_at)
    VALUES
      (@filePath, @hash, @fileSize, @width, @height, @dpiX, @dpiY,
       @dateTaken, @fileMtime, @groupId, @status, @addedAt)
  `);
  const result = stmt.run({
    filePath: record.filePath,
    hash: record.hash,
    fileSize: record.fileSize,
    width: record.width,
    height: record.height,
    dpiX: record.dpiX,
    dpiY: record.dpiY,
    dateTaken: record.dateTaken ?? null,
    fileMtime: record.fileMtime,
    groupId: record.groupId ?? null,
    status: record.status,
    addedAt: record.addedAt,
  });
  return result.lastInsertRowid as number;
}

export function insertGroup(representativePath: string, imageCount: number): number {
  const stmt = db.prepare(`
    INSERT INTO image_groups (representative_path, image_count, created_at)
    VALUES (@representativePath, @imageCount, @createdAt)
  `);
  const result = stmt.run({
    representativePath,
    imageCount,
    createdAt: new Date().toISOString(),
  });
  return result.lastInsertRowid as number;
}

export function updateGroupId(recordId: number, groupId: number): void {
  db.prepare('UPDATE image_hashes SET group_id = ? WHERE id = ?').run(groupId, recordId);
}


export function updateStatus(recordId: number, status: ImageStatus): void {
  db.prepare('UPDATE image_hashes SET status = ? WHERE id = ?').run(status, recordId);
}

export function getRecordByPath(filePath: string): ImageRecord | undefined {
  const row = db
    .prepare('SELECT * FROM image_hashes WHERE file_path = ?')
    .get(filePath) as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : undefined;
}

export function getAllPending(): ImageRecord[] {
  const rows = db
    .prepare("SELECT * FROM image_hashes WHERE status = 'pending'")
    .all() as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getUngroupedPending(): ImageRecord[] {
  const rows = db
    .prepare("SELECT * FROM image_hashes WHERE status = 'pending' AND group_id IS NULL")
    .all() as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getByGroupId(groupId: number): ImageRecord[] {
  const rows = db
    .prepare('SELECT * FROM image_hashes WHERE group_id = ?')
    .all(groupId) as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getAllGroups(): ImageGroup[] {
  const rows = db
    .prepare('SELECT * FROM image_groups ORDER BY created_at DESC')
    .all() as Record<string, unknown>[];
  return rows.map(rowToGroup);
}

export function getAllSingletons(): ImageRecord[] {
  const rows = db
    .prepare("SELECT * FROM image_hashes WHERE group_id IS NULL AND status = 'pending'")
    .all() as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getRecycled(): ImageRecord[] {
  const rows = db
    .prepare("SELECT * FROM image_hashes WHERE status = 'recycled'")
    .all() as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function deleteRecycled(): void {
  db.prepare("DELETE FROM image_hashes WHERE status = 'recycled'").run();
}

export function clearAll(): void {
  db.exec('DELETE FROM image_hashes; DELETE FROM image_groups;');
}

// ── AI Scoring helpers ─────────────────────────────────────────────────────

export function getNextUnscoredImage(): ImageRecord | undefined {
  const row = db
    .prepare(`
      SELECT * FROM image_hashes
      WHERE ai_score_status = 'pending'
        AND group_id IS NOT NULL
        AND status = 'pending'
      ORDER BY added_at ASC
      LIMIT 1
    `)
    .get() as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : undefined;
}

export function markScoring(recordId: number): void {
  db.prepare("UPDATE image_hashes SET ai_score_status = 'scoring' WHERE id = ?").run(recordId);
}

export function updateAiScore(recordId: number, score: number, detail: string): void {
  db.prepare(`
    UPDATE image_hashes
    SET ai_score = ?, ai_score_detail = ?, ai_scored_at = ?, ai_score_status = 'scored'
    WHERE id = ?
  `).run(score, detail, new Date().toISOString(), recordId);
}

export function markScoreError(recordId: number): void {
  db.prepare("UPDATE image_hashes SET ai_score_status = 'error' WHERE id = ?").run(recordId);
}

export function resetScoreById(recordId: number): void {
  db.prepare(`
    UPDATE image_hashes
    SET ai_score = NULL, ai_score_detail = NULL, ai_scored_at = NULL, ai_score_status = 'pending'
    WHERE id = ?
  `).run(recordId);
}

export function resetStuckScoring(): void {
  db.prepare("UPDATE image_hashes SET ai_score_status = 'pending' WHERE ai_score_status = 'scoring'").run();
}

export function resetAllScores(): void {
  db.prepare(`
    UPDATE image_hashes
    SET ai_score = NULL, ai_score_detail = NULL, ai_scored_at = NULL, ai_score_status = 'pending'
    WHERE group_id IS NOT NULL AND status = 'pending'
  `).run();
}

export function getScoringCounts(): {
  queued: number;
  scoring: number;
  scored: number;
  errors: number;
} {
  const count = (status: string): number =>
    (
      db
        .prepare(
          `SELECT COUNT(*) as cnt FROM image_hashes
           WHERE group_id IS NOT NULL AND status = 'pending' AND ai_score_status = ?`
        )
        .get(status) as { cnt: number }
    ).cnt;
  return {
    queued: count('pending'),
    scoring: count('scoring'),
    scored: count('scored'),
    errors: count('error'),
  };
}

export function getGroupScoringState(groupId: number): {
  allDone: boolean;
  topScore: number | null;
  topIds: number[];
} {
  const rows = db
    .prepare(
      `SELECT id, ai_score, ai_score_status
       FROM image_hashes WHERE group_id = ?`
    )
    .all(groupId) as { id: number; ai_score: number | null; ai_score_status: string }[];

  const allDone = rows.every(
    (r) => r.ai_score_status === 'scored' || r.ai_score_status === 'error'
  );
  if (!allDone) return { allDone: false, topScore: null, topIds: [] };

  const scoredRows = rows.filter((r) => r.ai_score !== null);
  if (scoredRows.length === 0) return { allDone: true, topScore: null, topIds: [] };

  const topScore = Math.max(...scoredRows.map((r) => r.ai_score!));
  const topIds = scoredRows.filter((r) => r.ai_score === topScore).map((r) => r.id);
  return { allDone: true, topScore, topIds };
}

export default db;
