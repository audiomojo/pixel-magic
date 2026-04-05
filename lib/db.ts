import Database from 'better-sqlite3';
import path from 'path';
import type { ImageRecord, ImageGroup, ImageStatus } from '@/types';

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

export function updateGroupCount(groupId: number, count: number): void {
  db.prepare('UPDATE image_groups SET image_count = ? WHERE id = ?').run(count, groupId);
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

export default db;
