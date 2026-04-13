# Test Harness: Grouping and Scoring Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two scripts that empirically find the optimal grouping similarity threshold and tune the LLM scoring rubric against 36 hand-labeled test images in `test-photos/test-automation/`.

**Architecture:** Two standalone `tsx` scripts under `scripts/`. `test-grouping.ts` hashes the test images using the existing hasher, tries every integer threshold 50–95, prints a table, and writes the winner to `config.json`. `test-scoring.ts` calls Ollama directly at `http://localhost:11434`, scores each image, compares the top-scorer per group to the `-best` filename label, and prints a diagnostic table. No database or running app server required.

**Tech Stack:** TypeScript · tsx · Node.js · sharp · heic-convert · `lib/hasher.ts` · `lib/grouper.ts` · `lib/config.ts` · `lib/scorer.ts` (SCORE_PROMPT) · Ollama REST API

---

### ⚠️ Before Starting

- Run all scripts from the project root: `cd /Users/rich/Data/Source-Code/pixel-magic`
- Ollama must be running at `http://localhost:11434` before running `test-scoring.ts`
- If `config.json` doesn't exist in the project root (app not yet run locally outside Docker), the scripts handle this gracefully by using default values then writing the winner

---

## File Map

| File | Action |
|---|---|
| `scripts/test-grouping.ts` | Create |
| `scripts/test-scoring.ts` | Create |
| `types/index.ts` | Modify — add `moment` field to `AiScoreDetail` |
| `lib/scorer.ts` | Modify — update `SCORE_PROMPT` after running baseline |

---

## Task 1: Write test-grouping.ts

**Files:**
- Create: `scripts/test-grouping.ts`

- [ ] **Step 1: Create `scripts/test-grouping.ts`**

```typescript
import path from 'path';
import fs from 'fs/promises';
import { hashImage } from '../lib/hasher';
import { buildGroups } from '../lib/grouper';
import { readConfig, writeConfig } from '../lib/config';
import type { ImageRecord, AppConfig } from '../types/index';

const TEST_DIR = path.join(process.cwd(), 'test-photos', 'test-automation');

interface GroundTruth {
  filePath: string;
  group: number;
  variant: string;
  isBest: boolean;
}

function parseFilename(filePath: string): GroundTruth | null {
  const base = path.basename(filePath);
  const stem = base.replace(/\.[^.]+$/, '');
  const match = stem.match(/^(\d+)-([a-zA-Z]+)(-best)?$/i);
  if (!match) return null;
  return {
    filePath,
    group: parseInt(match[1], 10),
    variant: match[2].toLowerCase(),
    isBest: !!match[3],
  };
}

function defaultConfig(): AppConfig {
  return {
    similarityThreshold: 75,
    supportedExtensions: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
    aiScoringEnabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2-vision:11b',
  };
}

async function main() {
  const entries = await fs.readdir(TEST_DIR);
  const imagePaths = entries
    .filter(f => /\.(heic|jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(TEST_DIR, f));

  const groundTruths = imagePaths
    .map(fp => parseFilename(fp))
    .filter((gt): gt is GroundTruth => gt !== null)
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  // Build expected groups: groupNumber → [filePaths]
  const expectedGroups = new Map<number, string[]>();
  for (const gt of groundTruths) {
    if (!expectedGroups.has(gt.group)) expectedGroups.set(gt.group, []);
    expectedGroups.get(gt.group)!.push(gt.filePath);
  }

  console.log(`Found ${groundTruths.length} images in ${expectedGroups.size} expected groups`);
  console.log('Hashing images (HEIC decode takes ~30–60s total)...\n');

  // Hash all images — order matches groundTruths order
  const records: ImageRecord[] = [];
  for (const gt of groundTruths) {
    process.stdout.write(`  ${path.basename(gt.filePath)}...`);
    const record = await hashImage(gt.filePath);
    if (record) {
      records.push(record);
      process.stdout.write(' ok\n');
    } else {
      process.stdout.write(' FAILED\n');
    }
  }

  console.log(`\nHashed ${records.length}/${groundTruths.length} successfully\n`);

  // Test thresholds 50–95
  type Result = { threshold: number; perfect: number; splits: number; merges: number };
  const results: Result[] = [];
  let bestThreshold = 75;
  let bestPerfect = -1;
  let bestMerges = Infinity;

  for (let t = 50; t <= 95; t++) {
    const systemGroupMap = buildGroups(records, t);

    // Convert Map<repIdx, memberIdxs[]> to array of filePath sets
    const systemGroupSets: Set<string>[] = [];
    for (const [, memberIdxs] of systemGroupMap) {
      systemGroupSets.push(new Set(memberIdxs.map(idx => records[idx].filePath)));
    }

    let perfect = 0;
    let splits = 0;
    let merges = 0;

    for (const [, expectedMembers] of expectedGroups) {
      const expectedSet = new Set(expectedMembers);

      // Find which system groups overlap with this expected group
      const overlapping = systemGroupSets
        .map((sg, si) => ({ si, overlap: expectedMembers.filter(fp => sg.has(fp)).length }))
        .filter(x => x.overlap > 0);

      if (overlapping.length === 0) {
        // All expected members became singletons — treated as a split
        splits++;
      } else if (overlapping.length === 1) {
        const sg = systemGroupSets[overlapping[0].si];
        const exact = sg.size === expectedSet.size && expectedMembers.every(fp => sg.has(fp));
        if (exact) perfect++;
        else merges++; // system group absorbed extras from other expected groups
      } else {
        // Expected group members spread across multiple system groups
        splits++;
      }
    }

    results.push({ threshold: t, perfect, splits, merges });

    if (perfect > bestPerfect || (perfect === bestPerfect && merges < bestMerges)) {
      bestPerfect = perfect;
      bestMerges = merges;
      bestThreshold = t;
    }
  }

  // Print table
  console.log('Threshold  Perfect  Splits  Merges');
  console.log('-'.repeat(40));
  for (const r of results) {
    const marker = r.threshold === bestThreshold ? ' ← winner' : '';
    console.log(
      `${String(r.threshold).padStart(9)}  ${String(r.perfect).padStart(7)}  ${String(r.splits).padStart(6)}  ${String(r.merges).padStart(6)}${marker}`
    );
  }

  const w = results.find(r => r.threshold === bestThreshold)!;
  console.log(
    `\nWinner: ${bestThreshold}% — ${w.perfect}/${expectedGroups.size} perfect, ${w.splits} splits, ${w.merges} merges`
  );

  // Write to config
  let config: AppConfig;
  try {
    config = readConfig();
  } catch {
    config = defaultConfig();
  }
  config.similarityThreshold = bestThreshold;
  writeConfig(config);
  console.log(`Written to config.json (similarityThreshold: ${bestThreshold})`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the script**

```bash
npx tsx scripts/test-grouping.ts
```

Expected: prints the threshold table, writes the winner to `config.json`. Runtime: ~30–60s.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-grouping.ts config.json
git commit -m "test: add grouping threshold script; set optimal threshold in config"
```

---

## Task 2: Write test-scoring.ts

**Files:**
- Create: `scripts/test-scoring.ts`

- [ ] **Step 1: Create `scripts/test-scoring.ts`**

```typescript
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { SCORE_PROMPT } from '../lib/scorer';
import { readConfig } from '../lib/config';
import type { AiScoreDetail, AppConfig } from '../types/index';

const TEST_DIR = path.join(process.cwd(), 'test-photos', 'test-automation');

interface GroundTruth {
  filePath: string;
  group: number;
  variant: string;
  isBest: boolean;
}

function parseFilename(filePath: string): GroundTruth | null {
  const base = path.basename(filePath);
  const stem = base.replace(/\.[^.]+$/, '');
  const match = stem.match(/^(\d+)-([a-zA-Z]+)(-best)?$/i);
  if (!match) return null;
  return {
    filePath,
    group: parseInt(match[1], 10),
    variant: match[2].toLowerCase(),
    isBest: !!match[3],
  };
}

function defaultConfig(): AppConfig {
  return {
    similarityThreshold: 75,
    supportedExtensions: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
    aiScoringEnabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2-vision:11b',
  };
}

async function toBase64(filePath: string): Promise<string> {
  const resize = (input: Parameters<typeof sharp>[0]) =>
    sharp(input)
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  try {
    if (/\.heic$/i.test(filePath)) throw new Error('heic');
    return (await resize(filePath)).toString('base64');
  } catch {
    const raw = await fs.readFile(filePath);
    const jpeg = await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.9 });
    return (await resize(Buffer.from(jpeg))).toString('base64');
  }
}

interface ScoredImage extends GroundTruth {
  score: number;
  detail: AiScoreDetail;
}

async function main() {
  // Parse --model flag
  const modelFlagIdx = process.argv.indexOf('--model');
  const modelOverride = modelFlagIdx >= 0 ? process.argv[modelFlagIdx + 1] : null;

  let config: AppConfig;
  try { config = readConfig(); } catch { config = defaultConfig(); }

  const model = modelOverride ?? config.ollamaModel;
  const ollamaUrl = 'http://localhost:11434';

  // Read and parse test images
  const entries = await fs.readdir(TEST_DIR);
  const imagePaths = entries
    .filter(f => /\.(heic|jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(TEST_DIR, f));

  const groundTruths = imagePaths
    .map(fp => parseFilename(fp))
    .filter((gt): gt is GroundTruth => gt !== null)
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  console.log(`Scoring ${groundTruths.length} images with model=${model}\n`);

  // Score each image
  const scored: ScoredImage[] = [];
  for (const gt of groundTruths) {
    process.stdout.write(`  ${path.basename(gt.filePath)}...`);
    try {
      const b64 = await toBase64(gt.filePath);
      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: SCORE_PROMPT, images: [b64], stream: false, format: 'json' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { response: string };
      const detail = JSON.parse(data.response) as AiScoreDetail;
      scored.push({ ...gt, score: detail.score, detail });
      process.stdout.write(` score=${detail.score} type=${detail.contentType}\n`);
    } catch (err) {
      process.stdout.write(` ERROR: ${(err as Error).message}\n`);
    }
  }

  // Group and evaluate
  const byGroup = new Map<number, ScoredImage[]>();
  for (const s of scored) {
    if (!byGroup.has(s.group)) byGroup.set(s.group, []);
    byGroup.get(s.group)!.push(s);
  }

  console.log('\n--- Results ---\n');
  let correct = 0;
  const groups = [...byGroup.keys()].sort((a, b) => a - b);

  for (const g of groups) {
    const images = byGroup.get(g)!.sort((a, b) => b.score - a.score);
    const top = images[0];
    const best = images.find(i => i.isBest);
    if (top.isBest) correct++;

    const mark = top.isBest ? '✓' : '✗';
    const scores = images.map(i => `${i.variant}=${i.score}`).join(' ');
    console.log(`Group ${g} ${mark}  best=${best?.variant ?? '?'}  top=${top.variant}  [${scores}]`);

    if (!top.isBest) {
      const fmt = (d: AiScoreDetail) => {
        const base = `sharpness=${d.sharpness} exposure=${d.exposure} composition=${d.composition} color=${d.color}`;
        const portrait = d.eyesOpen != null
          ? ` eyesOpen=${d.eyesOpen} expression=${d.expression} faceSharpness=${d.faceSharpness}`
          : '';
        const moment = (d as AiScoreDetail & { moment?: number | null }).moment != null
          ? ` moment=${(d as AiScoreDetail & { moment?: number | null }).moment}`
          : '';
        return base + portrait + moment;
      };
      console.log(`  top  (${top.variant}): ${top.detail.rationale}`);
      if (best) console.log(`  best (${best.variant}): ${best.detail.rationale}`);
      console.log(`  top  breakdown: ${fmt(top.detail)}`);
      if (best) console.log(`  best breakdown: ${fmt(best.detail)}`);
      console.log();
    }
  }

  const total = groups.length;
  const pct = Math.round((correct / total) * 100);
  console.log(`\nAccuracy: ${correct}/${total} (${pct}%) — target: 8/9`);
  if (correct >= 8) {
    console.log('✓ Target met!');
  } else {
    console.log('✗ Target not met — adjust SCORE_PROMPT in lib/scorer.ts and re-run');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the baseline**

```bash
npx tsx scripts/test-scoring.ts
```

Expected: per-group results table with accuracy N/9. Runtime: ~2–5 min depending on model speed. Note which groups fail and which criteria are misaligned.

- [ ] **Step 4: Commit the script (before prompt tuning)**

```bash
git add scripts/test-scoring.ts
git commit -m "test: add scoring accuracy script against test-automation labeled set"
```

---

## Task 3: Add `moment` field to AiScoreDetail type

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add `moment` to `AiScoreDetail`**

Find:
```typescript
  faceSharpness: number | null;
  score: number;
```

Replace with:
```typescript
  faceSharpness: number | null;
  moment: number | null;
  score: number;
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

## Task 4: Tune SCORE_PROMPT and verify accuracy

**Files:**
- Modify: `lib/scorer.ts`

- [ ] **Step 1: Replace `SCORE_PROMPT` with the improved version**

The key changes from the current prompt:
- `expression` max raised from 10 → 15 (most important portrait differentiator)
- New `moment` criterion added (0–10): captures authenticity, emotional resonance, connection between subjects
- Portrait max is now 115; LLM is told to normalise to 100
- Explicit instruction to prefer genuine moments over minor technical edge
- `moment` field added to the JSON output spec

Replace the entire `SCORE_PROMPT` constant:

```typescript
export const SCORE_PROMPT = `You are an expert photo curator helping select the best photo from a set of similar shots taken at the same time.

First, classify the primary content:
- "portrait": one or more people with visible faces are the prominent subjects
- "landscape": outdoor or indoor scene without prominent people
- "other": objects, abstract, pets, or unclear

Score each criterion 0 to its maximum based on what you actually observe in this specific photo:

ALL PHOTOS:
- sharpness: 0-25 (is the primary subject in crisp focus? penalise motion blur, soft focus, camera shake)
- exposure: 0-20 (well-lit, no blown highlights or crushed shadows; faces should be well exposed)
- composition: 0-15 (balanced framing, clean background, subject well-positioned in frame)
- color: 0-10 (natural white balance, pleasing saturation, no colour cast)

PORTRAIT ONLY (use null for non-portrait):
- eyesOpen: 0-10 (all visible eyes clearly open; any closed or half-closed eye is a significant penalty)
- expression: 0-15 (genuine natural smile or authentic candid moment; NOT stiff, forced, or posed; highest scores for spontaneous joy)
- faceSharpness: 0-10 (faces in sharp focus and clearly visible)
- moment: 0-10 (overall authenticity — does the photo capture a real, unrepeatable moment? connection between subjects, energy, spontaneity)

Score calculation:
- Portrait: score = round((sharpness + exposure + composition + color + eyesOpen + expression + faceSharpness + moment) / 115 * 100)
- Non-portrait: score = round((sharpness + exposure + composition + color) / 70 * 100)

When comparing similar shots, prefer the photo where people look most natural and alive. A genuine expression or meaningful moment outweighs minor technical differences in sharpness or exposure.

Evaluate carefully. Scores must reflect what you observe — a blurry photo must score low on sharpness, a dark photo must score low on exposure.

Return ONLY valid JSON, no other text:
{"contentType":"<portrait|landscape|other>","sharpness":<0-25>,"exposure":<0-20>,"composition":<0-15>,"color":<0-10>,"eyesOpen":<0-10 or null>,"expression":<0-15 or null>,"faceSharpness":<0-10 or null>,"moment":<0-10 or null>,"score":<0-100>,"rationale":"<one sentence on what you actually see>"}`;
```

- [ ] **Step 2: Run test-scoring.ts with updated prompt**

```bash
npx tsx scripts/test-scoring.ts
```

Expected: accuracy ≥ 8/9. If still below target, read the wrong-group breakdown and make targeted adjustments:
- If the LLM is over-rewarding technical sharpness for portraits: increase `expression` and `moment` weights further
- If a landscape group is wrong: check whether `sharpness` or `composition` is misaligned in the rationale
- If `eyesOpen` is causing the wrong pick: confirm the images actually have closed eyes vs the rationale

Re-run after each adjustment until accuracy ≥ 8/9.

- [ ] **Step 3: Commit the tuned prompt**

```bash
git add lib/scorer.ts types/index.ts
git commit -m "feat: tune AI scoring rubric — add moment criterion, raise expression weight"
```
