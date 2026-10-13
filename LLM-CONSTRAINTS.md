# LLM Scoring Constraints & Learnings

This document captures what was learned attempting to tune an LLM-based photo scorer to select the "best" image from burst sequences, with a target of ≥8/9 correct picks on a labelled test set of 35 images across 9 groups.

---

## The Task

Given a group of near-identical photos taken seconds apart, pick the single best one. "Best" is defined by subtle differences in:
- Sharpness / focus (especially eyes)
- Expression (peak of laugh vs. mid-transition)
- Composition (full scene vs. partial/awkward angle; all subjects in frame)
- Exposure and colour
- Peak timing (the decisive moment)

Test images are HEIC files named `{group}-{variant}[-best].HEIC`. The `-best` suffix marks the ground-truth preference.

---

## Process & Iterations

### Baseline (Iteration 0)
**Model:** `qwen2.5vl:7b`  
**Prompt:** Original SCORE_PROMPT — standard rubric with sharpness, exposure, composition, color, portrait-specific criteria.  
**Result:** **2/9 (22%)**

Key observations:
- Most images within a group received identical scores (e.g. all landscapes = 53, all portraits = 75–76)
- Occasional score variation was essentially random — not correlated with actual quality
- Groups 3 and 9 were correct; all others wrong

---

### Iteration 1 — "Force differentiation" instruction
**Change:** Added `CRITICAL RULE: You MUST assign different scores to different photos even when they look nearly identical.`  
Also added:
- `moment` criterion for non-portraits (0–10, peak timing / scene completeness)
- `expression` raised from 0–10 to 0–15
- Updated score formulas to include `moment`

**Result:** **2/9 (22%)** — no improvement

Key observations:
- The "CRITICAL RULE" backfired: instead of spreading scores meaningfully, the model began assigning uniform high scores (85) to all portraits in a group
- Landscapes still collapsed to 75 uniformly
- Groups 3 and 9 remained correct; no new wins
- The instruction created the illusion of differentiation while actually making things worse for some groups

**Lesson:** Instructing a model to behave differently doesn't work if it genuinely can't perceive the difference. The rule just changed which uniform score it picked.

---

### Iteration 2 — Improved composition guidance, removed forced-differentiation rule
**Change:** Removed the "CRITICAL RULE". Rewrote composition criterion to explicitly call out:
- Full scene vs. partial/awkward angle
- All subjects visible and not cropped in group shots

Also improved non-portrait `moment` description to reward completeness of scene.

**Result:** **3/9 (33%)** — marginal improvement

Per-group breakdown:
| Group | Expected | Got | Notes |
|-------|----------|-----|-------|
| 1 | c | c ✓ | Won by accident: 1-c-best classified as portrait (score=85), others misclassified as landscape (score=50) |
| 2 | a | b ✗ | Both scored 75; tiebreak picked b (positional bias) |
| 3 | a | a ✓ | Both scored 75; tiebreak picked a (positional bias, got lucky) |
| 4 | b | a ✗ | All scored 75; tournament gave a the win |
| 5 | c | a ✗ | All scored 75; tournament gave a the win |
| 6 | d | b ✗ | b and d tied at 85; tiebreak picked b |
| 7 | e | a ✗ | All portraits scored 85; tournament gave a the win |
| 8 | d | a ✗ | All portraits scored 85; tournament gave a the win |
| 9 | a | a ✓ | Scores spread (75/75/75 → tiebreak resolved correctly) |

Key observations:
- The model assigns quality **tiers** not quality **scores**: landscapes → 75, portraits → 85, regardless of content
- Prompt rewrites cannot override this — the model simply cannot perceive the subtle quality differences
- Tiebreak results are dominated by **positional bias**: Photo 1 (alphabetically first = variant `a`) wins almost every head-to-head

---

## Root Cause Analysis

The fundamental constraint is **model capability**, not prompt design.

`qwen2.5vl:7b` can assess broad quality categories (portrait vs. landscape, roughly sharp vs. blurry) but **cannot reliably perceive**:
- Which of two nearly-identical faces has sharper eyes
- Whether a smile is at peak or mid-transition
- Subtle composition differences between burst shots taken ~1 second apart
- Which of two similar landscapes has better framing

These require a vision model with significantly higher visual reasoning capability than a 7B parameter model can provide.

---

## What Was Also Tried

### `qwen3-vl:8b`
Attempted to run with this model. It **does not support `format: 'json'`** in Ollama's API — returned malformed JSON on every call. Would require a different output-parsing approach (regex extraction from free-form text) to use.

### Tiebreak tournament
Implemented a sequential knockout tournament among all images sharing the top score (rather than just the top 2). This was architecturally correct but couldn't fix the underlying problem: when a model assigns the same score to every image in a group, tiebreak outcomes are determined by positional bias, not quality.

---

## Options for Fixing the Problem

### Option A: Use a more capable local model — `qwen3-vl:30b`
**Pros:** Available locally, no API cost, same infrastructure  
**Cons:** Slower (30B parameters), still uncertain whether it can perceive burst-shot differences  
**Likely outcome:** Better differentiation than 7B, but positional bias in tiebreaks may persist  
**Status:** Not yet tried

### Option B: Fix `qwen3-vl:8b` JSON parsing
Parse the model's free-form text response and extract scores with regex rather than requiring `format: 'json'`.  
**Pros:** 8B model with potentially better vision than qwen2.5vl:7b  
**Cons:** Fragile parsing; unclear if 8B is capable enough  
**Status:** Not yet tried

### Option C: Use a cloud vision API
Claude 3.5 Sonnet or GPT-4o — designed for fine-grained visual analysis, strong at noticing subtle differences.  
**Pros:** Most likely to actually work; these models are trained specifically for this kind of visual discrimination  
**Cons:** API cost per image; requires internet; changes the app architecture (currently Ollama-only)  
**Status:** Not yet tried

### Option D: Pairwise ranking instead of absolute scoring
Instead of scoring each image independently, do head-to-head comparisons for all pairs in a group and rank by win count (Condorcet method).  
**Pros:** More robust than tiebreaks; removes dependence on score calibration  
**Cons:** O(n²) API calls for large groups; positional bias still affects each pair  
**Status:** Not yet tried; would combine well with Option A or C

### Option E: Accept the limitation, set realistic expectations
The current system achieves ~33% accuracy. For groups where the model correctly identifies content type, it sometimes gets lucky. Could document this as a "best effort" feature rather than a reliable one.  
**Pros:** No further engineering required  
**Cons:** User expectation was ≥8/9 accuracy  
**Status:** Not recommended

---

## Recommended Next Step

Try **Option A (`qwen3-vl:30b`)** first — it's available locally with no setup. If it shows genuine score differentiation (images in a group get different scores without tiebreaks), the existing architecture works. If it still assigns uniform tier scores, move to **Option C** (cloud API).
