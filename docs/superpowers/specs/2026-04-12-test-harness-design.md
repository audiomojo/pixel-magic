# Design Spec: Grouping and Scoring Test Harness

**Date:** 2026-04-12  
**Goal:** Empirically tune the grouping similarity threshold and the LLM scoring rubric against a labeled set of test images.

---

## Test Dataset

Location: `test-photos/test-automation/`

36 HEIC images across 9 expected groups. Filename convention:

```
{group}-{variant}[-best].HEIC
```

- `group` — integer (1–9): which images should be clustered together
- `variant` — letter (a, b, c, …): distinguishes images within a group
- `-best` — present on the one image in the group the user considers the best pick

| Group | Size | Best |
|-------|------|------|
| 1 | 4 | 1-c |
| 2 | 2 | 2-a |
| 3 | 2 | 3-a |
| 4 | 5 | 4-b |
| 5 | 4 | 5-c |
| 6 | 4 | 6-d |
| 7 | 5 | 7-e |
| 8 | 6 | 8-d |
| 9 | 3 | 9-a |

---

## Script 1: `scripts/test-grouping.ts`

### Purpose

Find the similarity threshold that best reproduces the 9 expected groups.

### Algorithm

1. Parse all filenames in `test-photos/test-automation/` to build ground-truth groups.
2. Hash all 36 images using `hashImage()` from `lib/hasher.ts` (sequentially; expect ~30–60s for HEIC decode).
3. For each integer threshold T from 50 to 95:
   - Run `buildGroups(records, T)` from `lib/grouper.ts`.
   - For each expected group, find the system group with the most members in common.
   - Compute three metrics:
     - **Perfect matches** — expected group reproduced exactly (same members, one system group)
     - **Splits** — one expected group spread across multiple system groups
     - **Merges** — two or more expected groups collapsed into one system group
4. Print a summary table (threshold → perfect / splits / merges).
5. Select the threshold that maximises perfect matches, using fewest merges as a tiebreaker.
6. Write the winning threshold to `config.json` using `writeConfig()` from `lib/config.ts`.

### Output (example)

```
Threshold  Perfect  Splits  Merges
50         3        0       6
...
75         7        1       1
80         8        1       0   ← winner
85         6        3       0
...

Winner: 80% — writing to config.json
```

### Running

```bash
npx tsx scripts/test-grouping.ts
```

---

## Script 2: `scripts/test-scoring.ts`

### Purpose

Measure how often the LLM picks the user-labeled "best" image as the top scorer within each group. Target: ≥ 8 of 9 groups correct.

### Algorithm

1. Parse filenames to identify expected groups and best labels.
2. For each image, call Ollama at `http://localhost:11434` using `SCORE_PROMPT` from `lib/scorer.ts` and the configured model (read from `config.json`, default `llama3.2-vision:11b`).
3. Within each expected group, rank by score descending.
4. Check whether the top-ranked image is the `-best` labeled image.
5. Print per-group results with full score breakdowns and LLM rationale for wrong calls.
6. Print overall accuracy and whether the 8/9 target is met.

### Output (example)

```
Group 1 ✓  best=1-c  top=1-c   a=61 b=58 c=74 d=55
Group 4 ✗  best=4-b  top=4-a   a=82 b=71 c=68 e=60 f=55
           4-a rationale: "crisp focus, well-lit subject"
           4-b rationale: "slightly soft on subject face"

Accuracy: 6/9 (67%) — target: 8/9 ✗
```

### CLI flag

`--model <name>` overrides the model from config.

### Running

```bash
npx tsx scripts/test-scoring.ts
npx tsx scripts/test-scoring.ts --model llava:13b
```

---

## Tuning Loop

### Threshold (one-shot)

Run `test-grouping.ts` once. It finds and saves the winner automatically.

### Scoring rubric (iterative)

1. Run `test-scoring.ts` — note which groups are wrong and which criteria are misfiring.
2. Edit `SCORE_PROMPT` in `lib/scorer.ts`.
3. Re-run `test-scoring.ts`.
4. Repeat until accuracy ≥ 8/9.

Typical adjustments:
- Increase weight of criteria that distinguish the user's preferred images (e.g. expression, sharpness)
- Add explicit guidance for edge cases surfaced by the wrong-group rationales

---

## Files Changed

| File | Action |
|------|--------|
| `scripts/test-grouping.ts` | New |
| `scripts/test-scoring.ts` | New |
| `lib/scorer.ts` | `SCORE_PROMPT` updated after tuning |
| `config.json` (runtime) | Threshold written by `test-grouping.ts` |

No new dependencies. Scripts use `tsx` (`npx tsx` if not in devDependencies).

---

## Out of Scope

- No new UI pages or API routes
- No database — scripts work entirely in memory
- `test-grouping.ts` does not modify `lib/grouper.ts` — it only updates the config value
- Scoring tuning does not change score storage or the tiebreak mechanism
