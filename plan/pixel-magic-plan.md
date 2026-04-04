# Image Deduplication App — Multi-Phase Project Plan
**Stack:** Node.js 20 LTS · Next.js 14 (App Router) · TypeScript · sharp · image-hash · better-sqlite3 · shadcn/ui · Tailwind CSS

> **How to use this plan with Claude Code:** Work through each phase sequentially. Begin each phase by pasting the phase header and objectives into Claude Code. Complete all tasks and acceptance criteria before moving to the next phase.

---

## Folder Model

The app operates on three folders, all configured by the user:

```
Inbound/                        ← Source images (never modified)
Outbound - Keeping/             ← Final kept images, organized by date
  2024/
    01/
    06/
  2025/
    03/
Outbound - Recycle Bin/         ← Rejected images, held until user empties
```

**Date organization in Outbound - Keeping:** Use EXIF `DateTimeOriginal` first; fall back to file `mtime`. Create `YYYY/MM/` subdirectories automatically.

**Source images are never moved or deleted.** All operations are copy-only on Inbound files.

---

## Core Workflow

1. **Scan:** Hash all images in Inbound, store metadata + hash in SQLite.
2. **Group:** Cluster hashed images into similarity groups (1-to-many). Each group has one representative and N similar images.
3. **Review:** User opens each group in the review UI, selects which images to keep, and the rest go to the Recycle Bin.
4. **Resolve:** Kept images are copied to `Outbound - Keeping/YYYY/MM/`. Rejected images are copied to `Outbound - Recycle Bin/`.
5. **Empty Recycle Bin:** User explicitly triggers deletion of Recycle Bin contents from within the app.
6. **Singletons:** Images with no near-duplicates are automatically copied to `Outbound - Keeping/YYYY/MM/` without requiring manual review.

---

## Phase 1 — Project Scaffolding & Dependencies

**Objective:** Create the Next.js project, install all dependencies, and establish the folder structure.

### Tasks

1. **Scaffold the Next.js app**
   ```bash
   npx create-next-app@latest pixel-magic \
     --typescript \
     --tailwind \
     --app \
     --no-src-dir \
     --import-alias "@/*"
   cd pixel-magic
   ```

2. **Install core dependencies**
   ```bash
   npm install sharp image-hash better-sqlite3 fast-glob exifr
   npm install @types/better-sqlite3 @types/node --save-dev
   ```
   > `exifr` is a fast, zero-dependency EXIF reader that works in Node.js.

3. **Install UI dependencies**
   ```bash
   npx shadcn@latest init
   npx shadcn@latest add button card progress badge separator tabs toast dialog checkbox
   ```

4. **Create the project folder structure**
   ```
   pixel-magic/
   ├── app/
   │   ├── layout.tsx
   │   ├── page.tsx                    ← Dashboard
   │   ├── review/
   │   │   └── page.tsx                ← Group review list
   │   ├── review/[groupId]/
   │   │   └── page.tsx                ← 1-to-many review UI
   │   ├── stats/
   │   │   └── page.tsx                ← Stats & Recycle Bin management
   │   └── api/
   │       ├── scan/
   │       │   └── route.ts            ← POST: start scan + group
   │       ├── progress/
   │       │   └── route.ts            ← GET: SSE progress stream
   │       ├── images/
   │       │   └── route.ts            ← GET: serve image files safely
   │       ├── groups/
   │       │   └── route.ts            ← GET: list groups
   │       ├── groups/[id]/
   │       │   └── route.ts            ← GET: group detail; POST: resolve group
   │       ├── recycle/
   │       │   └── route.ts            ← GET: recycle bin contents; DELETE: empty bin
   │       ├── singletons/
   │       │   └── route.ts            ← POST: copy all singletons to Keeping
   │       ├── stats/
   │       │   └── route.ts            ← GET: counts and last scan info
   │       └── config/
   │           └── route.ts            ← GET/POST: read & save config
   ├── lib/
   │   ├── scanner.ts                  ← Recursive file scanner
   │   ├── hasher.ts                   ← pHash + EXIF date extraction via sharp + image-hash + exifr
   │   ├── comparator.ts               ← Hamming distance & similarity %
   │   ├── grouper.ts                  ← Cluster hashed images into similarity groups
   │   ├── db.ts                       ← SQLite cache layer
   │   ├── processor.ts                ← Orchestrates scan → hash → group pipeline
   │   ├── organizer.ts                ← Resolves Year/Month path for Keeping folder
   │   ├── emitter.ts                  ← Global SSE event emitter
   │   └── config.ts                   ← Config file reader/writer
   ├── types/
   │   └── index.ts                    ← Shared TypeScript types
   ├── config.json                     ← Runtime config (gitignored)
   └── cache.db                        ← SQLite hash cache (gitignored)
   ```

5. **Add `config.json` default and gitignore both files**
   ```json
   {
     "inboundFolder": "",
     "outboundBase": "",
     "similarityThreshold": 90,
     "supportedExtensions": ["jpg", "jpeg", "png", "webp", "heic", "tiff", "gif", "bmp"]
   }
   ```
   Add to `.gitignore`:
   ```
   config.json
   cache.db
   ```

6. **Define shared TypeScript types** in `types/index.ts`
   ```typescript
   export type ImageStatus = 'pending' | 'kept' | 'recycled' | 'singleton_kept';

   export type ImageRecord = {
     id?: number;
     filePath: string;         // Absolute path in Inbound
     hash: string;             // Blockhash hex string (256-bit, bit length 16)
     fileSize: number;         // Bytes
     width: number;            // Pixels
     height: number;           // Pixels
     dpiX: number;
     dpiY: number;
     dateTaken: string | null; // ISO 8601 from EXIF, or null
     fileMtime: string;        // ISO 8601 file modification time (fallback date)
     groupId: number | null;   // null = singleton (no near-duplicates)
     status: ImageStatus;
     addedAt: string;          // ISO 8601 scan time
   };

   export type ImageGroup = {
     id: number;
     representativePath: string; // Path of the first/largest image in the group
     imageCount: number;
     createdAt: string;
   };

   export type GroupDetail = {
     group: ImageGroup;
     images: ImageRecord[];
   };

   export type GroupResolution = {
     keepPaths: string[];    // These go to Outbound - Keeping/YYYY/MM/
     recyclePaths: string[]; // These go to Outbound - Recycle Bin/
   };

   export type ProgressEvent = {
     type: 'progress' | 'grouping' | 'complete' | 'error';
     phase: 'hashing' | 'grouping' | 'done';
     current: number;
     total: number;
     currentFile?: string;
     stats?: ScanStats;
   };

   export type ScanStats = {
     totalScanned: number;
     grouped: number;         // Images that belong to a similarity group
     singletons: number;      // Images with no near-duplicates
     errors: number;
     groupCount: number;      // Number of distinct groups
   };

   export type AppConfig = {
     inboundFolder: string;
     outboundBase: string;    // Parent of "Keeping" and "Recycle Bin" subdirs
     similarityThreshold: number;
     supportedExtensions: string[];
   };
   ```

### Acceptance Criteria
- [ ] `npm run dev` starts without errors
- [ ] All dependencies installed with no peer-dep conflicts
- [ ] Folder structure matches the spec above
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)

---

## Phase 2 — Core Processing Engine

**Objective:** Build all `/lib` modules that power scanning, hashing, grouping, date extraction, and database operations.

### Tasks

1. **`lib/db.ts` — SQLite Cache Layer**

   Schema:
   ```sql
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
   ```

   Functions to implement:
   - `insertRecord(record: ImageRecord): number` — returns inserted row id
   - `insertGroup(representativePath: string, imageCount: number): number` — returns group id
   - `updateGroupId(recordId: number, groupId: number): void`
   - `updateGroupCount(groupId: number, count: number): void`
   - `updateStatus(recordId: number, status: ImageStatus): void`
   - `getRecordByPath(filePath: string): ImageRecord | undefined`
   - `getAllPending(): ImageRecord[]`
   - `getByGroupId(groupId: number): ImageRecord[]`
   - `getAllGroups(): ImageGroup[]`
   - `getAllSingletons(): ImageRecord[]` — records with `group_id IS NULL` and `status = 'pending'`
   - `getRecycled(): ImageRecord[]`
   - `clearAll(): void`

   Use WAL journal mode. Export a singleton `db` instance.

2. **`lib/hasher.ts` — Hash + Metadata Extraction**

   ```typescript
   import sharp from 'sharp';
   import imageHash from 'image-hash';
   import exifr from 'exifr';
   import fs from 'fs/promises';

   export async function hashImage(filePath: string): Promise<ImageRecord | null>
   ```

   For each image:
   - Use `sharp(filePath).metadata()` for width, height, density (dpiX/dpiY, default 72 if absent)
   - Use `fs.stat` for file size and `mtime`
   - Use `exifr.parse(filePath, { DateTimeOriginal: true })` for EXIF date
   - Use `image-hash` with bit length 16 (256-bit blockhash) for perceptual hash
   - Return `null` and log a warning for corrupt or unreadable files

3. **`lib/comparator.ts` — Similarity Engine**

   ```typescript
   export function hammingDistance(hash1: string, hash2: string): number
   // Convert hex to binary strings, count differing bits

   export function hashSimilarityPct(hash1: string, hash2: string): number
   // Returns 0–100: (1 - hammingDistance / totalBits) * 100
   // For 256-bit hash: totalBits = 256

   export function isSimilar(r1: ImageRecord, r2: ImageRecord, threshold: number): boolean
   // hashSimilarityPct(r1.hash, r2.hash) >= threshold
   ```

   No SSIM in the MVP — blockhash similarity alone drives grouping.

4. **`lib/grouper.ts` — Similarity Grouping**

   ```typescript
   export function buildGroups(
     records: ImageRecord[],
     threshold: number
   ): Map<number, number[]>
   // Returns Map<representativeRecordIndex, memberRecordIndices[]>
   ```

   Algorithm (single-pass, O(n²)):
   ```
   ungrouped = all record indices
   groups = Map()

   for each index i in ungrouped:
     if i is already assigned to a group: continue
     members = [i]
     for each index j > i in ungrouped:
       if isSimilar(records[i], records[j], threshold):
         members.push(j)
     if members.length > 1:
       groups.set(i, members)
     // singletons (members.length === 1) are left ungrouped (groupId = null)

   return groups
   ```

5. **`lib/organizer.ts` — Year/Month Path Resolution**

   ```typescript
   export function getKeepingPath(
     outboundBase: string,
     record: ImageRecord,
     filename: string
   ): string
   ```

   Logic:
   - Use `record.dateTaken` (EXIF) if present; parse to get year and month
   - Otherwise use `record.fileMtime`
   - Return: `path.join(outboundBase, 'Keeping', YYYY, MM, filename)`
   - `YYYY` = 4-digit year, `MM` = 2-digit month (zero-padded)

   Also export:
   ```typescript
   export function getRecyclePath(outboundBase: string, filename: string): string
   // Returns: path.join(outboundBase, 'Recycle Bin', filename)
   ```

   Both functions must handle filename collisions by appending `_1`, `_2`, etc.

6. **`lib/emitter.ts` — SSE Event Emitter**

   ```typescript
   import { EventEmitter } from 'events';

   export const scanEmitter = new EventEmitter();

   export function emitProgress(event: ProgressEvent): void {
     scanEmitter.emit('progress', event);
   }
   ```

7. **`lib/config.ts` — Config Reader/Writer**

   ```typescript
   export function readConfig(): AppConfig
   export function writeConfig(config: AppConfig): void
   ```

   Validate that `inboundFolder` and `outboundBase` exist on disk before accepting them. Throw a descriptive error if not.

8. **`lib/processor.ts` — Two-Phase Pipeline**

   ```typescript
   export async function runScan(config: AppConfig): Promise<ScanStats>
   ```

   **Phase A — Hashing:**
   ```
   files = scanFolder(config.inboundFolder, config.supportedExtensions)
   emit { type: 'progress', phase: 'hashing', current: 0, total: files.length }

   for each filePath in files:
     skip if getRecordByPath(filePath) already exists in DB with status !== 'pending'
     record = hashImage(filePath)
     if record is null: increment errors, continue
     insertRecord(record)
     emit { type: 'progress', phase: 'hashing', current: ++i, total, currentFile: filePath }
   ```

   **Phase B — Grouping:**
   ```
   pending = getAllPending()
   emit { type: 'grouping', phase: 'grouping', current: 0, total: pending.length }

   groups = buildGroups(pending, config.similarityThreshold)

   for each [representativeIdx, memberIndices] in groups:
     groupId = insertGroup(pending[representativeIdx].filePath, memberIndices.length)
     for each idx in memberIndices:
       updateGroupId(pending[idx].id, groupId)

   // Singletons: records not assigned to any group — their groupId stays null
   emit { type: 'complete', phase: 'done', stats }
   ```

   **`lib/scanner.ts`** — unchanged from original spec:
   ```typescript
   export async function scanFolder(
     sourceFolder: string,
     extensions: string[]
   ): Promise<string[]>
   ```
   Use `fast-glob`. Exclude `outboundBase` from scan. Return sorted absolute paths.

### Acceptance Criteria
- [ ] `hashImage()` returns correct width, height, DPI, fileSize, and a 64-char hex hash for a test JPEG
- [ ] `hammingDistance()` returns 0 for identical hashes
- [ ] `hashSimilarityPct()` returns 100 for identical hashes
- [ ] `buildGroups()` correctly clusters 3 similar images into one group and leaves a dissimilar image ungrouped
- [ ] `getKeepingPath()` returns `Keeping/2024/06/photo.jpg` for an image with a June 2024 EXIF date
- [ ] `runScan()` populates DB with correct group assignments after scanning a test folder
- [ ] Write `scripts/test-engine.ts` that exercises each lib function

---

## Phase 3 — API Layer

**Objective:** Build all Next.js API routes that the UI will consume.

### Tasks

1. **`app/api/config/route.ts`**
   - `GET` — returns current `config.json` as JSON
   - `POST` — validates and writes new config; return 400 if folders don't exist

2. **`app/api/scan/route.ts`**
   - `POST` — reads config, starts `runScan()` asynchronously, returns 202 immediately
   - Prevents concurrent scans — returns 409 if already running
   - Tracks scan state in a module-level variable: `'idle' | 'running' | 'complete' | 'error'`

3. **`app/api/progress/route.ts`**
   - `GET` — opens SSE stream (`Content-Type: text/event-stream`, `Cache-Control: no-cache`)
   - Listens to `scanEmitter`, writes each `ProgressEvent` as `data: <json>\n\n`
   - Closes on `complete` or `error`
   - Add `export const runtime = 'nodejs'` (required for SSE in App Router)

4. **`app/api/images/route.ts`**
   - `GET ?path=<absolute-path>` — reads and returns the image as binary
   - Validates that path is within `inboundFolder`, `Keeping/`, or `Recycle Bin/` (never arbitrary paths)
   - Sets `Content-Type` based on file extension

5. **`app/api/groups/route.ts`**
   - `GET` — returns all `ImageGroup` records from DB (groups awaiting review)

6. **`app/api/groups/[id]/route.ts`**
   - `GET` — returns `GroupDetail` (group metadata + all `ImageRecord`s in the group)
   - `POST { keepPaths: string[], recyclePaths: string[] }` — resolves the group:
     - For each `keepPath`: copy source file to `Keeping/YYYY/MM/`, update status to `'kept'`
     - For each `recyclePath`: copy source file to `Recycle Bin/`, update status to `'recycled'`
     - Validate that `keepPaths + recyclePaths` = all paths in the group (no unaccounted images)
     - Return 400 if validation fails

7. **`app/api/singletons/route.ts`**
   - `POST` — copies all singleton images (no group) to `Keeping/YYYY/MM/`, updates status to `'singleton_kept'`
   - Returns count of images moved

8. **`app/api/recycle/route.ts`**
   - `GET` — returns all `ImageRecord`s with status `'recycled'`
   - `DELETE` — permanently deletes all files in `Recycle Bin/` folder and updates DB status

9. **`app/api/stats/route.ts`**
   - `GET` — returns:
     ```typescript
     {
       totalScanned: number;
       keptCount: number;
       recycledCount: number;
       singletonCount: number;
       pendingGroupCount: number;   // groups awaiting review
       pendingGroupImageCount: number;
       lastScanAt: string | null;
       scanDurationMs: number | null;
     }
     ```

### Acceptance Criteria
- [ ] `GET /api/config` returns valid JSON with `inboundFolder` and `outboundBase`
- [ ] `POST /api/scan` returns 202 and scan begins (verify via SSE stream with `curl`)
- [ ] `GET /api/groups` returns an array of groups after a scan
- [ ] `GET /api/groups/:id` returns the group with all member images
- [ ] `POST /api/groups/:id` with valid keepPaths/recyclePaths copies files to correct folders
- [ ] `POST /api/singletons` correctly copies singleton images to `Keeping/YYYY/MM/`
- [ ] `DELETE /api/recycle` deletes files from disk and updates DB

---

## Phase 4 — Dashboard UI

**Objective:** Main dashboard for configuration, scan control, and live progress.

### Tasks

1. **Config Panel (`app/page.tsx`)**
   - Form fields:
     - Inbound folder path (text input)
     - Output base folder path (text input) — note: app creates `Keeping/` and `Recycle Bin/` subdirs automatically
     - Similarity threshold (slider, 80–100%, default 90%)
     - Supported file extensions (multi-select checkboxes)
   - Save button → `POST /api/config`; show success/error toast

2. **Scan Control**
   - "Start Scan" button → `POST /api/scan`
   - Disable + spinner while running
   - Status badge: `Idle` / `Scanning` / `Grouping` / `Complete` / `Error`

3. **Live Progress Panel**
   - Opens SSE connection on scan start
   - Shows two sub-phases with their own progress bars:
     - **Hashing:** current/total files, current filename
     - **Grouping:** progress indicator (indeterminate spinner during O(n²) pass)
   - Running counters: Scanned / Groups Found / Singletons / Errors
   - On `complete`: show final stats, offer "Go to Review" and "Auto-keep Singletons" buttons

4. **Navigation**
   - Top nav: Dashboard · Review Queue · Stats
   - Review Queue badge: count of groups awaiting review

### Acceptance Criteria
- [ ] Config saves and reloads correctly after page refresh
- [ ] Scan starts and both progress phases are visible in real-time
- [ ] Completion state shows group count, singleton count, and action buttons

---

## Phase 5 — Review UI

**Objective:** 1-to-many group review interface where users select which images to keep per group.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Group 3 of 12  ·  5 images  ·  Keep Selected  Discard Rest │  ← header bar
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│              LARGE PREVIEW (≥75% viewport height)           │
│                   (clicked image shown here)                 │
│                                                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  ← scroll →  [✓ img1] [img2] [✓ img3] [img4] [img5]  →    │
│              HORIZONTAL SCROLL STRIP (≥25% viewport height) │
└──────────────────────────────────────────────────────────────┘
```

### Tasks

1. **Group List Page (`app/review/page.tsx`)**
   - Fetch from `GET /api/groups`
   - Show each group as a card: representative image thumbnail, image count, similarity range
   - "Review" button → navigates to `app/review/[groupId]/page.tsx`
   - "Auto-keep All Singletons" button → `POST /api/singletons`
   - Show "All groups reviewed" empty state when list is empty

2. **Group Review Page (`app/review/[groupId]/page.tsx`)**

   **Large preview area (top, min 75vh):**
   - Displays the currently selected thumbnail at full readable size
   - Shows filename, dimensions, file size, DPI, and date taken below the image
   - Defaults to showing the first image when group loads

   **Horizontal scroll strip (bottom, min 25vh):**
   - Renders all images in the group as thumbnails filling the full 25vh height
   - Each thumbnail has a checkbox overlay in the top-left corner for multi-select
   - Clicking a thumbnail (not the checkbox) updates the large preview
   - Checking the checkbox marks the image as "keep"
   - Selected (keep) thumbnails show a green border; unselected show a neutral border
   - Strip is horizontally scrollable; thumbnails do not wrap

   **Header action bar:**
   - Shows "Group N of M" navigation
   - "Keep Selected & Continue" button:
     - Sends `POST /api/groups/:id` with checked paths as `keepPaths`, unchecked as `recyclePaths`
     - Navigates to next group on success
   - "Keep All" shortcut (marks all checked, submits)
   - "Discard All" button (confirms via dialog, sends all as `recyclePaths`)

   **Keyboard shortcuts (shown in a tooltip):**
   - `←` / `→` — navigate thumbnails in the strip
   - `Space` — toggle keep/discard on the focused thumbnail
   - `Enter` — submit current selections and advance to next group

3. **Image loading via proxy:**
   All `<img>` tags use `/api/images?path=<encoded-absolute-path>` — never raw file paths.

### Acceptance Criteria
- [ ] Group list page loads and shows correct group count
- [ ] Review page renders all group images in the horizontal strip at ≥25vh height
- [ ] Clicking a thumbnail updates the large preview
- [ ] Checkbox multi-select works; selected images show green border
- [ ] "Keep Selected & Continue" correctly POSTs and advances to the next group
- [ ] "Discard All" shows a confirmation dialog before submitting
- [ ] Keyboard shortcuts work for navigation and selection
- [ ] After all groups are reviewed, list shows empty state

---

## Phase 6 — Stats Page & Global Polish

**Objective:** Stats dashboard, Recycle Bin management, and finishing touches.

### Tasks

1. **Stats Page (`app/stats/page.tsx`)**
   - Fetch from `GET /api/stats`
   - Summary cards:
     - Images kept (in `Keeping/`)
     - Images in Recycle Bin (pending deletion)
     - Groups pending review
     - Last scan timestamp and duration
   - **"Empty Recycle Bin" button:**
     - Opens confirmation dialog: "This will permanently delete N files. This cannot be undone."
     - On confirm → `DELETE /api/recycle`
     - Shows success toast with count deleted
   - **"Clear Cache & Rescan" button:**
     - Wipes `cache.db` entirely (all records, all groups)
     - Does NOT touch files in `Keeping/` or `Recycle Bin/`
     - Allows a full rescan from scratch

2. **Global Error Handling**
   - All API routes return `{ error: string }` on failure with appropriate HTTP status
   - UI shows toast notifications for API errors
   - Scan errors logged to `scan.log` in `outboundBase`

3. **Loading & Empty States**
   - Skeleton loaders for all data-fetching pages
   - Empty states: no config set, no scan run yet, all groups reviewed

4. **Responsive Layout**
   - Dashboard and Stats: functional at 1280px width
   - Review page: horizontal strip remains horizontally scrollable on narrow viewports; large preview scales down gracefully

### Acceptance Criteria
- [ ] Stats page shows accurate live counts
- [ ] "Empty Recycle Bin" deletes files, updates DB, and reflects new counts
- [ ] "Clear Cache" wipes DB without touching output files
- [ ] All error states handled without crashes

---

## Phase 7 — Testing & Hardening

**Objective:** Validate the pipeline against real-world image scenarios and edge cases.

### Test Scenarios

| Scenario | Expected Outcome |
|---|---|
| Identical file, different name | Grouped together (100% similar) |
| Same image, resaved as different format | Grouped (pHash survives format change) |
| Image resized slightly (95% of original) | Grouped (≥90% similar) |
| Completely different images | Separate singletons |
| Corrupt / unreadable file | Logged as error, scan continues |
| HEIC file from iPhone | Hashed and grouped correctly on M1 Mac |
| Very large image (50MP+) | sharp streams it; monitor memory |
| Empty source folder | Scan completes with 0 files, no crash |
| Inbound same path as outboundBase | Config validation rejects it |
| Re-run scan on same folder | Already-resolved images skipped; only new files processed |
| Group with 10+ images | Horizontal scroll strip handles gracefully |
| All images are singletons | "Auto-keep All Singletons" resolves in one click |

### Tasks

1. Write `scripts/generate-test-images.ts` using `sharp` to produce a test set covering the scenarios above
2. Run full pipeline against test set; verify outcomes match expected
3. Profile memory usage on 1,000+ images using `--inspect`
4. Tune Hamming distance threshold: for a 256-bit hash, distance ≤ 25 ≈ 90% similar — verify this holds for your image types

### Acceptance Criteria
- [ ] All test scenarios produce expected outcome
- [ ] No memory leaks on large folder scans
- [ ] Scan of 500 images completes in under 90 seconds on M1 Mac
- [ ] App recovers cleanly from corrupt files

---

## Phase 8 (Optional) — Ollama AI Semantic Similarity

**Objective:** Add optional AI semantic similarity for cases where blockhash misses (same subject, different lighting/crop).

> **Prerequisite:** Ollama installed locally with `nomic-embed-vision` model pulled.
> ```bash
> ollama pull nomic-embed-vision
> ```

### Tasks

1. **Install Ollama SDK**
   ```bash
   npm install ollama
   ```

2. **`lib/embedder.ts` — Image Embedding via Ollama**
   ```typescript
   export async function getImageEmbedding(filePath: string): Promise<number[]>
   ```
   - Convert image to base64 via `sharp`
   - Call `nomic-embed-vision` via Ollama SDK
   - Return embedding vector

3. **`lib/comparator.ts` — Add Cosine Similarity**
   ```typescript
   export function cosineSimilarity(v1: number[], v2: number[]): number
   // Returns 0–1
   ```
   Used as a third-pass check when blockhash similarity is between 70–89%.

4. **Config Toggle**
   - Add `"useAISimilarity": false` to `config.json`
   - Add toggle to Dashboard config panel
   - When enabled: embeddings generated alongside hashes, stored in DB as JSON blob

5. **DB Schema Addition**
   - Add `embedding TEXT` column to `image_hashes` (nullable JSON array)
   - No migration needed — add as nullable column with `ALTER TABLE IF NOT EXISTS` guard

6. **Ollama Health Check**
   - Ping `http://localhost:11434` on app start when AI mode is enabled
   - Show status badge ("AI: Online" / "AI: Offline") in Dashboard
   - Gracefully degrade to blockhash-only if Ollama is unreachable

### Acceptance Criteria
- [ ] Embeddings stored and retrieved correctly
- [ ] Cosine similarity correctly groups semantically similar images blockhash misses
- [ ] AI toggle can be changed without breaking base pipeline
- [ ] Offline Ollama degrades gracefully with warning

---

## Appendix: Key Technical Notes

- **Never modify or delete source images.** All operations are copy-only on Inbound files.
- **`sharp` on M1:** Ships native ARM64 binaries; works without Rosetta.
- **`better-sqlite3` on M1:** May need `npm rebuild` if native module issues arise.
- **SSE in Next.js App Router:** Use `new Response()` with a `ReadableStream`. Add `export const runtime = 'nodejs'` to the progress route — Edge runtime does not support Node.js `EventEmitter`.
- **Image serving security:** Always validate that the requested path is within one of the three configured folders before serving. Never serve arbitrary filesystem paths.
- **Blockhash bit length:** Use 16 (256-bit). The 8-bit default (64-bit) is too coarse for a 90% threshold.
- **Hamming distance to similarity:** For a 256-bit hash, distance ≤ 25 bits ≈ 90% similar. Tune in Phase 7.
- **Grouping complexity:** The O(n²) grouper is fine up to ~5,000 images. If needed, optimize later with a hash index (bucket by first N hex chars to prune comparisons).
- **Filename collisions in output:** `organizer.ts` must check if the destination path exists and append `_1`, `_2`, etc. to avoid overwriting files with the same name from different source directories.
- **EXIF date parsing:** `exifr` reads `DateTimeOriginal`, `DateTimeDigitized`, and `CreateDate` — use the first non-null value in that order.
- **Outbound subfolder creation:** Use `fs.mkdir(path, { recursive: true })` before copying. Do not assume `Keeping/YYYY/MM/` exists.
- **Concurrency:** Hash images sequentially to avoid memory spikes. Do not parallelize the hashing loop without first verifying memory safety on large folders.
