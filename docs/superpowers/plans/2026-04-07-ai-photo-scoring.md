# AI Photo Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score grouped images via a local Ollama vision model so the review UI can auto-select the best photo in each group.

**Architecture:** A `lib/scorer.ts` module provides `startScorer(config)` and `rescoreAll(config)`. Scoring runs as Phase C of the scan pipeline, at app startup (for previously unscored images), and on demand via a "Re-score All" API action. All scoring is sequential and progress is emitted over the existing SSE channel.

**Tech Stack:** Ollama HTTP API (`llama3.2-vision:11b`), `sharp` (already installed), `better-sqlite3` (already installed), Next.js instrumentation hook, Vitest for tests.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `types/index.ts` | Add `AiScoreStatus`, `AiScoreDetail`, extend `ImageRecord`, `AppConfig`, `ProgressEvent`, `ScanStats` |
| Modify | `lib/db.ts` | Add `migrateAiScoreColumns()`, update `rowToRecord`, add 7 scoring helper functions |
| Create | `lib/scorer.ts` | Core scoring loop, prompts, resize helper, tiebreak logic |
| Create | `tests/unit/scorer.test.ts` | Unit tests for pure scorer functions |
| Modify | `lib/processor.ts` | Add Phase C (call `startScorer`), delay final `complete` event |
| Create | `instrumentation.ts` | Next.js server-start hook to score unscored images from prior scans |
| Create | `app/api/scoring/status/route.ts` | GET — returns queued/scoring/scored/error counts |
| Create | `app/api/scoring/start/route.ts` | POST — triggers `startScorer` |
| Create | `app/api/scoring/rescore/route.ts` | POST — triggers `rescoreAll` |
| Modify | `app/api/config/route.ts` | Trigger `startScorer` when `aiScoringEnabled` is turned on |
| Modify | `components/ConfigPanel.tsx` | Add AI Scoring section (toggle, URL, model) |
| Modify | `components/ProgressPanel.tsx` | Add scoring phase display |
| Modify | `app/review/[groupId]/page.tsx` | Score badges, auto-check, scoring indicator, polling |

---

## Task 1: Extend Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Replace `types/index.ts` with extended version**

```ts
export type ImageStatus = 'pending' | 'kept' | 'recycled' | 'singleton_kept';

export type AiScoreStatus = 'pending' | 'scoring' | 'scored' | 'error';

export type AiScoreDetail = {
  contentType: 'portrait' | 'landscape' | 'other';
  sharpness: number;
  exposure: number;
  composition: number;
  color: number;
  eyesOpen: number | null;
  expression: number | null;
  faceSharpness: number | null;
  score: number;
  rationale: string;
  tiebreak?: boolean;
};

export type ImageRecord = {
  id?: number;
  filePath: string;
  hash: string;
  fileSize: number;
  width: number;
  height: number;
  dpiX: number;
  dpiY: number;
  dateTaken: string | null;
  fileMtime: string;
  groupId: number | null;
  status: ImageStatus;
  addedAt: string;
  // AI scoring — optional: absent until the migration runs or scoring begins
  aiScore?: number | null;
  aiScoreDetail?: string | null;   // JSON string of AiScoreDetail
  aiScoredAt?: string | null;
  aiScoreStatus?: AiScoreStatus;
};

export type ImageGroup = {
  id: number;
  representativePath: string;
  imageCount: number;
  createdAt: string;
};

export type GroupDetail = {
  group: ImageGroup;
  images: ImageRecord[];
};

export type GroupResolution = {
  keepPaths: string[];
  recyclePaths: string[];
  rotation?: 0 | 90 | 180 | 270;
};

export type ProgressEvent = {
  type: 'progress' | 'grouping' | 'complete' | 'error';
  phase: 'hashing' | 'grouping' | 'scoring' | 'done';
  current: number;
  total: number;
  currentFile?: string;
  stats?: ScanStats;
};

export type ScanStats = {
  totalScanned: number;
  grouped: number;
  singletons: number;
  errors: number;
  groupCount: number;
  scored: number;
  scoreErrors: number;
};

export type AppConfig = {
  inboundFolder: string;
  outboundBase: string;
  similarityThreshold: number;
  supportedExtensions: string[];
  aiScoringEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | head -30
```

Expected: Errors only about missing `aiScore`/`aiScoreStatus` etc. in `lib/db.ts` rowToRecord — those are fixed in Task 2. If other unrelated errors appear, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add types/index.ts
git commit -m "feat: extend types for AI scoring (AiScoreDetail, AiScoreStatus, AppConfig fields)"
```

---

## Task 2: DB Migration and Scoring Helpers

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Add `migrateAiScoreColumns()` and call it at module init**

Add this function after the existing `db.exec(...)` schema block (around line 34):

```ts
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
```

- [ ] **Step 2: Update `rowToRecord` to map the new columns**

Replace the existing `rowToRecord` function body:

```ts
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
```

Add `AiScoreStatus` to the import at the top of `lib/db.ts`:

```ts
import type { ImageRecord, ImageGroup, ImageStatus, AiScoreStatus } from '@/types';
```

- [ ] **Step 3: Add scoring helper functions**

Add these after the existing `deleteRecycled` and `clearAll` functions:

```ts
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
  // Reset any rows left in 'scoring' state from a prior crashed session
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
```

- [ ] **Step 4: Verify TypeScript compiles clean**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in files not yet updated (scorer.ts, processor.ts). Zero errors in db.ts and types/index.ts.

- [ ] **Step 5: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add lib/db.ts
git commit -m "feat: add AI scoring DB columns and helper functions"
```

---

## Task 3: Core Scorer Module

**Files:**
- Create: `lib/scorer.ts`

- [ ] **Step 1: Create `lib/scorer.ts`**

```ts
import sharp from 'sharp';
import {
  getNextUnscoredImage,
  markScoring,
  updateAiScore,
  markScoreError,
  resetAllScores,
  getGroupScoringState,
  getByGroupId,
  resetScoreById,
  getScoringCounts,
  resetStuckScoring,
} from './db';
import { emitProgress } from './emitter';
import type { AppConfig, AiScoreDetail } from '@/types';

let scorerRunning = false;

export const SCORE_PROMPT = `You are an expert photo curator. Analyze this photo and return a JSON score.

First, classify the primary content:
- "portrait": one or more people with visible faces are the prominent subjects
- "landscape": outdoor or indoor scene without prominent people
- "other": objects, abstract, pets, or unclear

Score each criterion 0 to its maximum:

ALL PHOTOS:
- sharpness: 0-25 (is the primary subject in crisp focus?)
- exposure: 0-20 (well-lit, no blown highlights or crushed shadows?)
- composition: 0-15 (balanced framing, clean background, good use of space)
- color: 0-10 (natural white balance, pleasing saturation)

PORTRAIT ONLY (use null for non-portrait):
- eyesOpen: 0-10 (both eyes clearly open and visible)
- expression: 0-10 (genuine smile or candid natural moment, not stiff or posed)
- faceSharpness: 0-10 (face in sharp focus and prominent in the frame)

Score calculation:
- Portrait: score = sharpness + exposure + composition + color + eyesOpen + expression + faceSharpness
- Non-portrait: score = round((sharpness + exposure + composition + color) / 70 * 100)

Return ONLY valid JSON, no other text:
{"contentType":"portrait","sharpness":22,"exposure":18,"composition":12,"color":8,"eyesOpen":9,"expression":8,"faceSharpness":9,"score":86,"rationale":"Well-exposed candid portrait with both eyes open."}`;

export const TIEBREAK_PROMPT = `You are an expert photo curator. Two photos scored equally and you must differentiate them.

The first image in this request is Photo 1. The second image is Photo 2.

Examine subtle differences:
- Which face has a more genuine, natural expression?
- Which has sharper eyes or better subject focus?
- Which composition feels more alive or spontaneous?
- Which lighting is more flattering?

You MUST give different scores to the two photos. Even a 1-point difference is fine.

Return ONLY valid JSON, no other text:
{"photo1Score":87,"photo2Score":84,"rationale":"Photo 1 has sharper eyes and a more genuine smile."}`;

export function normalizeScore(rawSum: number, isPortrait: boolean): number {
  if (isPortrait) return Math.min(100, Math.max(0, rawSum));
  return Math.min(100, Math.max(0, Math.round((rawSum / 70) * 100)));
}

export function parseScoreResponse(raw: string): AiScoreDetail {
  const parsed = JSON.parse(raw) as AiScoreDetail;
  if (typeof parsed.score !== 'number' || typeof parsed.contentType !== 'string') {
    throw new Error('Invalid score response shape');
  }
  return parsed;
}

async function resizeForOllama(filePath: string): Promise<string> {
  const buffer = await sharp(filePath)
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buffer.toString('base64');
}

async function callOllama(
  baseUrl: string,
  model: string,
  prompt: string,
  images: string[],
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, images, stream: false, format: 'json' }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { response: string };
  return data.response;
}

async function runTiebreak(
  config: AppConfig,
  groupId: number,
  tiedIds: number[],
): Promise<void> {
  // Take only the first two tied images; if >2 are tied, the others remain checked in the UI
  const [id1, id2] = tiedIds;
  if (id2 === undefined) return;

  const members = getByGroupId(groupId);
  const rec1 = members.find((m) => m.id === id1);
  const rec2 = members.find((m) => m.id === id2);
  if (!rec1 || !rec2) return;

  try {
    const [b64_1, b64_2] = await Promise.all([
      resizeForOllama(rec1.filePath),
      resizeForOllama(rec2.filePath),
    ]);
    const raw = await callOllama(config.ollamaBaseUrl, config.ollamaModel, TIEBREAK_PROMPT, [
      b64_1,
      b64_2,
    ]);
    const result = JSON.parse(raw) as {
      photo1Score: number;
      photo2Score: number;
      rationale: string;
    };
    if (result.photo1Score !== result.photo2Score) {
      updateAiScore(id1, result.photo1Score, JSON.stringify({ score: result.photo1Score, rationale: result.rationale, tiebreak: true }));
      updateAiScore(id2, result.photo2Score, JSON.stringify({ score: result.photo2Score, rationale: result.rationale, tiebreak: true }));
    }
  } catch (err) {
    console.error(`[scorer] Tiebreak error for group ${groupId}:`, err);
  }
}

export async function startScorer(
  config: AppConfig,
): Promise<{ scored: number; scoreErrors: number }> {
  if (scorerRunning) return { scored: 0, scoreErrors: 0 };
  scorerRunning = true;
  resetStuckScoring(); // Reset any rows stuck in 'scoring' from a prior crashed run

  let scored = 0;
  let scoreErrors = 0;

  try {
    const { queued } = getScoringCounts();
    const total = queued;
    let current = 0;

    while (true) {
      const record = getNextUnscoredImage();
      if (!record || record.id === undefined) break;

      markScoring(record.id);
      emitProgress({
        type: 'progress',
        phase: 'scoring',
        current,
        total,
        currentFile: record.filePath,
      });

      try {
        const b64 = await resizeForOllama(record.filePath);
        const raw = await callOllama(
          config.ollamaBaseUrl,
          config.ollamaModel,
          SCORE_PROMPT,
          [b64],
        );
        const detail = parseScoreResponse(raw);
        updateAiScore(record.id, detail.score, JSON.stringify(detail));
        scored++;

        if (record.groupId !== null) {
          const { allDone, topIds } = getGroupScoringState(record.groupId);
          if (allDone && topIds.length >= 2) {
            await runTiebreak(config, record.groupId, topIds);
          }
        }
      } catch (err) {
        console.error(`[scorer] Error scoring ${record.filePath}:`, err);
        markScoreError(record.id);
        scoreErrors++;
      }

      current++;
    }
  } finally {
    scorerRunning = false;
  }

  return { scored, scoreErrors };
}

export async function rescoreAll(config: AppConfig): Promise<{ scored: number; scoreErrors: number }> {
  resetAllScores();
  return startScorer(config);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "lib/scorer" | head -20
```

Expected: no errors from `lib/scorer.ts`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add lib/scorer.ts
git commit -m "feat: add core AI scorer module with prompts, resize, and tiebreak logic"
```

---

## Task 4: Unit Tests for Scorer Pure Functions

**Files:**
- Create: `tests/unit/scorer.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeScore, parseScoreResponse, SCORE_PROMPT, TIEBREAK_PROMPT } from '@/lib/scorer';

describe('normalizeScore', () => {
  it('returns raw sum unchanged for portraits (max 100)', () => {
    expect(normalizeScore(86, true)).toBe(86);
  });

  it('clamps portrait scores above 100 to 100', () => {
    expect(normalizeScore(110, true)).toBe(100);
  });

  it('normalizes non-portrait from 70-pt base to 100', () => {
    // 70/70 * 100 = 100
    expect(normalizeScore(70, false)).toBe(100);
  });

  it('normalizes non-portrait mid score', () => {
    // 35/70 * 100 = 50
    expect(normalizeScore(35, false)).toBe(50);
  });

  it('rounds non-portrait fractional results', () => {
    // 50/70 * 100 = 71.43 → 71
    expect(normalizeScore(50, false)).toBe(71);
  });

  it('clamps non-portrait below 0 to 0', () => {
    expect(normalizeScore(-5, false)).toBe(0);
  });
});

describe('parseScoreResponse', () => {
  it('parses a valid portrait response', () => {
    const raw = JSON.stringify({
      contentType: 'portrait',
      sharpness: 22,
      exposure: 18,
      composition: 12,
      color: 8,
      eyesOpen: 9,
      expression: 8,
      faceSharpness: 9,
      score: 86,
      rationale: 'Great shot',
    });
    const result = parseScoreResponse(raw);
    expect(result.score).toBe(86);
    expect(result.contentType).toBe('portrait');
    expect(result.eyesOpen).toBe(9);
  });

  it('parses a valid non-portrait response', () => {
    const raw = JSON.stringify({
      contentType: 'landscape',
      sharpness: 20,
      exposure: 16,
      composition: 12,
      color: 8,
      eyesOpen: null,
      expression: null,
      faceSharpness: null,
      score: 80,
      rationale: 'Nice landscape',
    });
    const result = parseScoreResponse(raw);
    expect(result.score).toBe(80);
    expect(result.eyesOpen).toBeNull();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseScoreResponse('not json')).toThrow();
  });

  it('throws when score field is missing', () => {
    expect(() =>
      parseScoreResponse(JSON.stringify({ contentType: 'portrait' }))
    ).toThrow('Invalid score response shape');
  });
});

describe('SCORE_PROMPT', () => {
  it('contains the JSON output template', () => {
    expect(SCORE_PROMPT).toContain('"contentType"');
    expect(SCORE_PROMPT).toContain('"score"');
    expect(SCORE_PROMPT).toContain('"rationale"');
  });

  it('instructs the model to return only JSON', () => {
    expect(SCORE_PROMPT).toContain('Return ONLY valid JSON');
  });
});

describe('TIEBREAK_PROMPT', () => {
  it('references photo1Score and photo2Score', () => {
    expect(TIEBREAK_PROMPT).toContain('"photo1Score"');
    expect(TIEBREAK_PROMPT).toContain('"photo2Score"');
  });

  it('instructs the model to give different scores', () => {
    expect(TIEBREAK_PROMPT).toContain('MUST give different scores');
  });
});
```

- [ ] **Step 2: Run tests and verify they pass**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx vitest run tests/unit/scorer.test.ts -v
```

Expected: all tests pass (PASS).

- [ ] **Step 3: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add tests/unit/scorer.test.ts
git commit -m "test: add unit tests for scorer normalizeScore and parseScoreResponse"
```

---

## Task 5: Integrate Phase C into `lib/processor.ts`

**Files:**
- Modify: `lib/processor.ts`

- [ ] **Step 1: Update imports and add Phase C**

Replace the entire file:

```ts
import { scanFolder, excludeOutbound } from './scanner';
import { hashImage } from './hasher';
import { buildGroups } from './grouper';
import { emitProgress } from './emitter';
import { startScorer } from './scorer';
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
    scored: 0,
    scoreErrors: 0,
  };

  // Phase A — Hashing
  let allFiles = await scanFolder(config.inboundFolder, config.supportedExtensions);
  if (config.outboundBase) {
    allFiles = excludeOutbound(allFiles, config.outboundBase, config.inboundFolder);
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

  // Phase C — AI Scoring (if enabled)
  if (config.aiScoringEnabled) {
    const scoreStats = await startScorer(config);
    stats.scored = scoreStats.scored;
    stats.scoreErrors = scoreStats.scoreErrors;
  }

  emitProgress({
    type: 'complete',
    phase: 'done',
    current: pending.length,
    total: pending.length,
    stats,
  });

  return stats;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "processor" | head -10
```

Expected: no errors.

- [ ] **Step 3: Run existing processor tests**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx vitest run tests/integration/processor.test.ts -v
```

Expected: all tests pass. The tests use `makeConfig` without `aiScoringEnabled`, so scoring is disabled — Phase C is skipped.

**If tests fail because `makeConfig` is missing required fields:** Update the `makeConfig` helper in the test file to include the new required fields:

```ts
function makeConfig(inboundFolder: string, outboundBase: string): AppConfig {
  return {
    inboundFolder,
    outboundBase,
    similarityThreshold: 90,
    supportedExtensions: SUPPORTED_EXTENSIONS,
    aiScoringEnabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2-vision:11b',
  };
}
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add lib/processor.ts tests/integration/processor.test.ts
git commit -m "feat: add Phase C AI scoring to scan pipeline"
```

---

## Task 6: App Startup Instrumentation Hook

**Files:**
- Create: `instrumentation.ts` (project root)

- [ ] **Step 1: Create `instrumentation.ts`**

```ts
export async function register() {
  // Only run scorer on the Node.js server runtime, not the edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readConfig } = await import('./lib/config');
    const { startScorer } = await import('./lib/scorer');
    const { getScoringCounts } = await import('./lib/db');

    try {
      const config = readConfig();
      if (config.aiScoringEnabled) {
        const { queued, scoring } = getScoringCounts();
        // Reset any stuck 'scoring' rows from a crashed prior run, then start
        if (queued + scoring > 0) {
          // Fire and forget — don't block server startup
          startScorer(config).catch((err: unknown) =>
            console.error('[instrumentation] scorer error:', err)
          );
        }
      }
    } catch {
      // No config.json yet (first run) — skip scoring
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "instrumentation" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add instrumentation.ts
git commit -m "feat: add Next.js instrumentation hook to score images on server start"
```

---

## Task 7: Scoring API Routes

**Files:**
- Create: `app/api/scoring/status/route.ts`
- Create: `app/api/scoring/start/route.ts`
- Create: `app/api/scoring/rescore/route.ts`

- [ ] **Step 1: Create `app/api/scoring/status/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getScoringCounts } from '@/lib/db';
import { readConfig } from '@/lib/config';

export async function GET() {
  try {
    const counts = getScoringCounts();
    let enabled = false;
    try {
      const config = readConfig();
      enabled = config.aiScoringEnabled;
    } catch {
      // no config yet
    }
    return NextResponse.json({ enabled, ...counts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/scoring/start/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { startScorer } from '@/lib/scorer';

export async function POST() {
  try {
    const config = readConfig();
    if (!config.aiScoringEnabled) {
      return NextResponse.json({ error: 'AI scoring is not enabled' }, { status: 400 });
    }
    // Fire and forget — returns immediately
    startScorer(config).catch((err: unknown) =>
      console.error('[api/scoring/start] scorer error:', err)
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `app/api/scoring/rescore/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { rescoreAll } from '@/lib/scorer';

export async function POST() {
  try {
    const config = readConfig();
    if (!config.aiScoringEnabled) {
      return NextResponse.json({ error: 'AI scoring is not enabled' }, { status: 400 });
    }
    // Fire and forget — returns immediately
    rescoreAll(config).catch((err: unknown) =>
      console.error('[api/scoring/rescore] scorer error:', err)
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "api/scoring" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add app/api/scoring/
git commit -m "feat: add scoring API routes (status, start, rescore)"
```

---

## Task 8: Config API — Trigger Scorer on Enable

**Files:**
- Modify: `app/api/config/route.ts`

- [ ] **Step 1: Update `app/api/config/route.ts` to trigger scorer when enabling**

Replace the file:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { readConfig, writeConfig } from '@/lib/config';
import { startScorer } from '@/lib/scorer';
import type { AppConfig } from '@/types';

export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({
      inboundFolder: '',
      outboundBase: '',
      similarityThreshold: 60,
      supportedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'gif', 'bmp'],
      aiScoringEnabled: false,
      ollamaBaseUrl: 'http://host.docker.internal:11434',
      ollamaModel: 'llama3.2-vision:11b',
    } satisfies AppConfig);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AppConfig;

    // Detect if scoring is being toggled on
    let wasEnabled = false;
    try {
      const prev = readConfig();
      wasEnabled = prev.aiScoringEnabled;
    } catch {
      // first save
    }

    writeConfig(body);

    // If scoring was just enabled, kick off the scorer for any queued images
    if (body.aiScoringEnabled && !wasEnabled) {
      startScorer(body).catch((err: unknown) =>
        console.error('[api/config] scorer error after enable:', err)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "api/config" | head -10
```

Expected: no errors.

- [ ] **Step 3: Run e2e tests to confirm config routes still work**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx vitest run tests/e2e/config-first-run.test.ts -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add app/api/config/route.ts
git commit -m "feat: trigger AI scorer when aiScoringEnabled is toggled on via config save"
```

---

## Task 9: Config UI — AI Scoring Section

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Add AI Scoring state and include in save**

Add these state variables after the existing state declarations (around line 21):

```ts
const [aiScoringEnabled, setAiScoringEnabled] = useState(false);
const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://host.docker.internal:11434');
const [ollamaModel, setOllamaModel] = useState('llama3.2-vision:11b');
```

Update the `useEffect` that syncs config to also sync the new fields:

```ts
useEffect(() => {
  if (config) {
    setInbound(config.inboundFolder);
    setOutbound(config.outboundBase);
    setThreshold(config.similarityThreshold);
    setExtensions(config.supportedExtensions);
    setAiScoringEnabled(config.aiScoringEnabled ?? false);
    setOllamaBaseUrl(config.ollamaBaseUrl ?? 'http://host.docker.internal:11434');
    setOllamaModel(config.ollamaModel ?? 'llama3.2-vision:11b');
  }
}, [config]);
```

Update `handleSave` to include the new fields in the body:

```ts
const body: AppConfig = {
  inboundFolder: inbound.trim(),
  outboundBase: outbound.trim(),
  similarityThreshold: threshold,
  supportedExtensions: extensions,
  aiScoringEnabled,
  ollamaBaseUrl: ollamaBaseUrl.trim(),
  ollamaModel: ollamaModel.trim(),
};
```

- [ ] **Step 2: Add AI Scoring section to the JSX**

Add this section after the file extensions block and before the Save button `div`:

```tsx
<div className="mb-4">
  <label className="mb-2 block text-xs text-muted-foreground">AI Scoring</label>
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={aiScoringEnabled}
        onChange={(e) => setAiScoringEnabled(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-primary"
      />
      Enable automatic photo scoring via Ollama
    </label>
    {aiScoringEnabled && (
      <>
        <div>
          <label htmlFor="ollama-url" className="mb-1 block text-xs text-muted-foreground">
            Ollama base URL
          </label>
          <input
            id="ollama-url"
            value={ollamaBaseUrl}
            onChange={(e) => setOllamaBaseUrl(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="ollama-model" className="mb-1 block text-xs text-muted-foreground">
            Ollama model
          </label>
          <input
            id="ollama-model"
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            const res = await fetch('/api/scoring/rescore', { method: 'POST' });
            if (!res.ok) {
              const { error } = (await res.json()) as { error: string };
              toast.error(error);
            } else {
              toast.success('Re-scoring started');
            }
          }}
          className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          Re-score All
        </button>
      </>
    )}
  </div>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "ConfigPanel" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add components/ConfigPanel.tsx
git commit -m "feat: add AI Scoring section to ConfigPanel (toggle, URL, model, re-score)"
```

---

## Task 10: Progress Panel — Scoring Phase

**Files:**
- Modify: `components/ProgressPanel.tsx`

- [ ] **Step 1: Add scoring phase detection and display**

Add `isScoring` detection after the existing phase variables (around line 130):

```ts
const isHashing  = progressEvent.phase === 'hashing';
const isGrouping = progressEvent.phase === 'grouping';
const isScoring  = progressEvent.phase === 'scoring';
```

Add scoring progress bar after the grouping section (after the `</div>` that closes the grouping section):

```tsx
{/* Scoring phase — only shown if scan includes AI scoring */}
{(isScoring || (status === 'complete' && finalStats && finalStats.scored > 0)) && (
  <div className={cn('mb-4', !isScoring && 'opacity-50')}>
    <div className="mb-1 flex items-center justify-between">
      <span className="text-xs font-semibold">AI Scoring</span>
      <span className="text-xs text-muted-foreground">
        {isScoring
          ? `${progressEvent!.current} / ${progressEvent!.total}`
          : `${finalStats?.scored ?? 0} scored`}
      </span>
    </div>
    {isScoring ? (
      <>
        <ProgressBar
          pct={progressEvent!.total > 0 ? (progressEvent!.current / progressEvent!.total) * 100 : 0}
        />
        {progressEvent!.currentFile && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {progressEvent!.currentFile}
          </p>
        )}
      </>
    ) : (
      <ProgressBar pct={100} />
    )}
  </div>
)}
```

Update the hashing and grouping `opacity` logic to also dim when scoring:

```ts
// Existing hashing section — update className:
<div className={cn('mb-3', (isGrouping || isScoring) && 'opacity-50')}>

// Existing grouping section — update className:
<div className={cn('mb-4', isHashing && 'opacity-40', isScoring && 'opacity-50')}>
```

Update the complete state stat tiles to include scoring:

```tsx
{/* In the complete state, add scored stat if >0 */}
{finalStats.scored > 0 && (
  <StatTile value={finalStats.scored} label="Scored" color="text-purple-600 dark:text-purple-400" />
)}
```

The complete state grid should become `grid-cols-5` when scored > 0, or keep `grid-cols-4`. Use a conditional:

```tsx
<div className={cn('mb-4 grid gap-2', finalStats.scored > 0 ? 'grid-cols-5' : 'grid-cols-4')}>
  <StatTile value={finalStats.totalScanned} label="Scanned"    color="text-primary" />
  <StatTile value={finalStats.groupCount}   label="Groups"     color="text-green-600 dark:text-green-400" />
  <StatTile value={finalStats.singletons}   label="Singletons" color="text-orange-600 dark:text-orange-400" />
  <StatTile value={finalStats.errors}       label="Errors"     color="text-red-600 dark:text-red-400" />
  {finalStats.scored > 0 && (
    <StatTile value={finalStats.scored} label="Scored" color="text-purple-600 dark:text-purple-400" />
  )}
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "ProgressPanel" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add components/ProgressPanel.tsx
git commit -m "feat: add AI Scoring phase to ProgressPanel"
```

---

## Task 11: Review UI — Score Badges and Auto-Select

**Files:**
- Modify: `app/review/[groupId]/page.tsx`

- [ ] **Step 1: Add score polling state and auto-select logic**

Add these state variables after the existing state declarations:

```ts
const [scoringActive, setScoringActive] = useState(false);
```

Update the `useEffect` that loads the group to also detect if scoring is active and auto-check the highest-scored image:

```ts
.then(([detail, groups]: [{ group: ImageGroup; images: ImageRecord[] }, ImageGroup[]]) => {
  thumbRefs.current = [];
  setGroup(detail.group);
  setImages(detail.images);
  setAllGroups(groups);
  setRotation(0);
  setFocusedIdx(0);

  // Auto-check the highest-scored image(s)
  const scored = detail.images.filter((img) => img.aiScoreStatus === 'scored' && img.aiScore !== null);
  if (scored.length > 0) {
    const topScore = Math.max(...scored.map((img) => img.aiScore!));
    const topPaths = scored.filter((img) => img.aiScore === topScore).map((img) => img.filePath);
    setKeptPaths(topPaths);
  } else {
    setKeptPaths([]);
  }

  // Check if scoring is still in progress for this group
  const stillPending = detail.images.some(
    (img) => img.aiScoreStatus === 'pending' || img.aiScoreStatus === 'scoring'
  );
  setScoringActive(stillPending);
})
```

- [ ] **Step 2: Add polling effect for live score updates**

Add this `useEffect` after the existing ones:

```ts
// Poll for score updates while scoring is in progress for this group
useEffect(() => {
  if (!scoringActive) return;

  const interval = setInterval(async () => {
    try {
      const detail = await fetch(`/api/groups/${groupId}`).then((r) => r.json()) as { group: ImageGroup; images: ImageRecord[] };
      const stillPending = detail.images.some(
        (img) => img.aiScoreStatus === 'pending' || img.aiScoreStatus === 'scoring'
      );
      setImages(detail.images);

      // Re-apply auto-select whenever new scores arrive
      const scored = detail.images.filter((img) => img.aiScoreStatus === 'scored' && img.aiScore !== null);
      if (scored.length > 0) {
        const topScore = Math.max(...scored.map((img) => img.aiScore!));
        const topPaths = scored.filter((img) => img.aiScore === topScore).map((img) => img.filePath);
        setKeptPaths(topPaths);
      }

      setScoringActive(stillPending);
      if (!stillPending) clearInterval(interval);
    } catch {
      // ignore poll errors
    }
  }, 3000);

  return () => clearInterval(interval);
}, [scoringActive, groupId]);
```

- [ ] **Step 3: Add score badge to thumbnails**

Add a `scoreBadge` helper function before the component return:

```ts
function scoreBadge(img: ImageRecord): JSX.Element | null {
  if (img.aiScoreStatus === 'scoring') {
    return (
      <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1 py-0.5 text-[9px] font-mono text-white/70">
        …
      </span>
    );
  }
  if (img.aiScoreStatus !== 'scored' || img.aiScore === null) return null;
  const score = img.aiScore;
  const color =
    score >= 75
      ? 'bg-green-500 text-white'
      : score >= 50
        ? 'bg-yellow-500 text-black'
        : 'bg-red-500 text-white';
  return (
    <span className={`absolute right-1 top-1 rounded-full px-1 py-0.5 text-[9px] font-bold ${color}`}>
      {Math.round(score)}
    </span>
  );
}
```

Inside the thumbnail `<div>`, after the keep checkbox overlay, add:

```tsx
{scoreBadge(img)}
```

- [ ] **Step 4: Add scoring indicator to action bar and score to metadata row**

In the action bar `<div>`, before the button group, add the scoring indicator:

```tsx
{scoringActive && (
  <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
    Scoring…
  </span>
)}
```

In the metadata bar, add score display after the date span:

```tsx
{focusedImage.aiScore !== null && focusedImage.aiScoreStatus === 'scored' && (
  <>
    <span className="mx-2">·</span>
    <span
      title={
        focusedImage.aiScoreDetail
          ? (() => {
              try {
                const d = JSON.parse(focusedImage.aiScoreDetail) as {
                  rationale?: string;
                  sharpness?: number;
                  exposure?: number;
                  composition?: number;
                  color?: number;
                };
                return [
                  `Rationale: ${d.rationale ?? '—'}`,
                  `Sharpness: ${d.sharpness ?? '—'}  Exposure: ${d.exposure ?? '—'}`,
                  `Composition: ${d.composition ?? '—'}  Color: ${d.color ?? '—'}`,
                ].join('\n');
              } catch {
                return '';
              }
            })()
          : undefined
      }
      className="cursor-help font-medium text-purple-700 dark:text-purple-300"
    >
      AI: {Math.round(focusedImage.aiScore)}
    </span>
  </>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit 2>&1 | grep "review" | head -10
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
git add app/review/
git commit -m "feat: add AI score badges, auto-select, and scoring indicator to review UI"
```

---

## Manual Smoke Test Checklist

Before calling this done, verify end-to-end with Ollama running:

- [ ] `ollama pull llama3.2-vision:11b` on the Mac host
- [ ] Ollama is running: `ollama serve`
- [ ] Docker container is running: `docker compose up -d`
- [ ] Open config at `http://localhost:3010` → enable AI Scoring → save
- [ ] Run a scan — watch progress panel show Hashing → Grouping → AI Scoring
- [ ] Navigate to Review → open a group → highest-scored image is auto-checked
- [ ] Score badge appears on thumbnails
- [ ] Metadata bar shows `AI: 87` for focused image
- [ ] Hover over `AI: 87` → tooltip shows rationale and sub-scores
- [ ] Click "Re-score All" in config → toast says "Re-scoring started"
