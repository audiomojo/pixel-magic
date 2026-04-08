# AI Photo Scoring — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

---

## Overview

Automatically score grouped images using a local Ollama vision model so the review UI can pre-select the best photo in each group. Scoring runs as Phase C of the scan pipeline, on app startup for previously unscored images, and on demand via a manual re-score action. All scoring is sequential (one image at a time) and progress is reported via the existing SSE emitter.

---

## 1. Rubric

The LLM scores each image 0–100 using a structured JSON response. It first detects the content type, then applies the appropriate criteria.

### Base criteria (all images) — 70 pts

| Criterion | Max pts |
|---|---|
| Sharpness / focus | 25 |
| Exposure (not blown out or crushed) | 20 |
| Composition (framing, rule of thirds, balance) | 15 |
| Color saturation & white balance | 10 |

### Portrait bonus (when people/faces are present) — 30 pts

| Criterion | Max pts |
|---|---|
| Eyes open and clearly visible | 10 |
| Natural expression (genuine smile or candid; not stiff/posed) | 10 |
| Face sharp and prominent | 10 |

Non-portrait images are normalized from their 70-pt base to a 0–100 scale so all scores are directly comparable. The LLM returns:

```jsonc
{
  "contentType": "portrait" | "landscape" | "other",
  "sharpness": 22,
  "exposure": 18,
  "composition": 12,
  "color": 8,
  "eyesOpen": 9,        // omitted for non-portrait
  "expression": 8,      // omitted for non-portrait
  "faceSharpness": 9,   // omitted for non-portrait
  "score": 86,          // final normalized 0–100
  "rationale": "Well-exposed candid portrait with both eyes open and a genuine smile. Slightly tight crop."
}
```

---

## 2. LLM & Image Preparation

**Model:** `llama3.2-vision:11b`  
Best accuracy/speed balance in the 11B vision class. ~8GB model weight leaves ample headroom on a 24GB RAM Mac. Handles structured JSON output reliably.

**Image resize (before every Ollama call):**
- Use `sharp` (already installed) to resize so the **long side = 768px**
- Convert to JPEG at quality 80
- Hold the buffer in memory — never written to disk
- 768px gives the LLM sufficient detail for all rubric criteria while keeping payloads small

---

## 3. Data Model

New columns on `image_hashes` via SQLite `ALTER TABLE` migration at startup:

```sql
ALTER TABLE image_hashes ADD COLUMN ai_score REAL;
ALTER TABLE image_hashes ADD COLUMN ai_score_detail TEXT;   -- full JSON rubric breakdown
ALTER TABLE image_hashes ADD COLUMN ai_scored_at TEXT;      -- ISO 8601
ALTER TABLE image_hashes ADD COLUMN ai_score_status TEXT DEFAULT 'pending';
-- ai_score_status values: 'pending' | 'scoring' | 'scored' | 'error'
```

`image_groups` gets no new columns. The group's best score is derived at query time (`MAX(ai_score)` over member rows). Tie detection is also done at query time.

**`ImageRecord` type** gains four optional fields:
```ts
aiScore?: number | null;
aiScoreDetail?: string | null;   // raw JSON string
aiScoredAt?: string | null;
aiScoreStatus?: 'pending' | 'scoring' | 'scored' | 'error';
```

---

## 4. Configuration

Two new fields in `AppConfig` / `config.json`:

```ts
aiScoringEnabled: boolean;   // master on/off switch; default false
ollamaBaseUrl: string;       // default "http://host.docker.internal:11434"
ollamaModel: string;         // default "llama3.2-vision:11b"
```

The Config UI gains a new "AI Scoring" section with a toggle and fields to override the URL and model. When `aiScoringEnabled` is toggled on, scoring starts for any unscored images immediately.

---

## 5. Scoring Module (`lib/scorer.ts`)

Exports:
- `startScorer(config: AppConfig): Promise<void>` — scores all `ai_score_status = 'pending'` grouped images sequentially, then returns
- `rescoreAll(config: AppConfig): Promise<void>` — resets all `'scored'`, `'error'`, and `'scoring'` rows to `'pending'`, then calls `startScorer`

**Inner loop (inside `startScorer`):**

1. Query: oldest `image_hashes` row where `ai_score_status = 'pending'` AND `group_id IS NOT NULL` AND `status = 'pending'`
2. If no row found: return (loop ends)
3. Mark row `ai_score_status = 'scoring'`
4. Emit `{ type: 'progress', phase: 'scoring', current, total, currentFile }`
5. Read image file → `sharp` resize → JPEG buffer → base64
6. POST to `{ollamaBaseUrl}/api/generate` with model and rubric prompt
7. Parse JSON from response content
8. Write `ai_score`, `ai_score_detail`, `ai_scored_at`, `ai_score_status = 'scored'`
9. Check if all images in this group are now scored → if so, run tie-break check
10. On any error: mark `ai_score_status = 'error'`, log, continue
11. Repeat from step 1

**Tie-breaking:**

After a group's last image is scored, query the group's top score. If two or more images share it, re-score only those images using an enhanced prompt that explicitly asks the model to differentiate between near-equal photos. Re-scored images replace their previous scores. If still tied after re-score, both scores remain equal and the UI checks all tied images.

**Prompts live in `lib/scorer.ts`** as constants — `SCORE_PROMPT` and `TIEBREAK_PROMPT`.

---

## 6. Trigger Points

### a. Scan (Phase C of `runScan`)

`processor.ts` calls `startScorer(config)` after Phase B (grouping) completes, but only if `config.aiScoringEnabled`. Phase C uses the same SSE emitter with `phase: 'scoring'`.

### b. App Startup

A Next.js instrumentation hook (`instrumentation.ts`) calls `startScorer(config)` on server start if `aiScoringEnabled` and there are any `ai_score_status = 'pending'` grouped images. This handles images from prior scans.

### c. Config Save (enable toggle)

When the Config UI saves settings with `aiScoringEnabled: true`, the `POST /api/config` handler calls `startScorer(config)` after writing the file if scoring was previously disabled. This covers the "toggle on → scoring starts immediately" behavior.

### d. Manual Re-score

`POST /api/scoring/rescore` calls `rescoreAll(config)`. Exposed as a "Re-score All" button in the Config UI.

---

## 7. API Routes

| Route | Method | Purpose |
|---|---|---|
| `GET /api/scoring/status` | GET | Returns `{ enabled, queued, scoring, scored, errors }` counts |
| `POST /api/scoring/start` | POST | Trigger `startScorer` (used by instrumentation hook) |
| `POST /api/scoring/rescore` | POST | Reset all scores and re-score everything |

Status counts are derived from live DB queries (no in-memory state). The scorer runs one image at a time; there is no concurrency concern.

---

## 8. Progress & SSE

`ProgressEvent` gains a new `phase` value `'scoring'`. The scan progress UI adds a third step indicator after Hashing and Grouping. Events emitted during scoring:

```ts
{ type: 'progress', phase: 'scoring', current: N, total: M, currentFile: '/path/...' }
{ type: 'complete', phase: 'done', current: M, total: M, stats: { ...existing, scored: M } }
```

`ScanStats` gains `scored: number` and `scoreErrors: number` fields.

---

## 9. Review UI Changes

### Thumbnail strip
- Each thumbnail shows a score badge in the top-right corner
  - Gray pill: not yet scored
  - Green (≥75), yellow (50–74), red (<50) pill with score number
- Auto-checks the highest-scored image as "kept" when the group loads (if any images are scored)
- If tied top scores: all tied images are auto-checked

### Metadata bar
- Shows `AI: 86` inline when the focused image has a score
- Clicking it expands a tooltip/popover with the full per-criterion breakdown and rationale

### Action bar
- Shows a subtle `Scoring…` badge when any image in the group has `ai_score_status = 'pending'` or `'scoring'`
- UI polls `GET /api/scoring/status` every 3 seconds while this badge is visible; refreshes image data when counts change

---

## 10. Docker / Connectivity

No Docker changes needed. The container reaches the Mac host's Ollama instance at `http://host.docker.internal:11434` (the default `ollamaBaseUrl`). Ollama must be installed and running on the Mac with `llama3.2-vision:11b` pulled:

```bash
ollama pull llama3.2-vision:11b
```

---

## Out of Scope

- Scoring singleton images (no near-duplicates) — rubric is only meaningful for comparison within a group
- Per-group re-score (re-score is all-or-nothing for now)
- Streaming Ollama responses (full response awaited before parsing)
