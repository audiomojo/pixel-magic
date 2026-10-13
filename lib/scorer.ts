import sharp from 'sharp';
import heicConvert from 'heic-convert';
import fs from 'fs/promises';
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

export const SCORE_PROMPT = `You are an expert photo editor selecting the single best shot from a burst sequence. These photos were taken seconds apart — your job is to find the subtle differences that make one shot superior.

Classify the photo:
- "portrait": people with visible faces are the primary subject
- "landscape": scene, event, or environment without close-up faces
- "other": objects, abstract, pets

Score each criterion honestly based on what you actually observe:

ALL PHOTOS:
- sharpness: 0-25 (primary subject in crisp focus? Penalise motion blur, soft focus, or camera shake)
- exposure: 0-20 (well-exposed with detail in highlights and shadows?)
- composition: 0-15 (assess carefully: Does the frame capture the FULL subject or scene, or only a partial/awkward angle? Is the horizon level? Are all important subjects fully in frame and well-placed? For group shots, are ALL people fully visible and not cropped? A shot that shows the complete scene or all subjects scores higher than one that cuts them off or shows only part of the subject)
- color: 0-10 (white balance accurate, colours natural, no unwanted cast)

PORTRAIT ONLY (use null for non-portrait):
- eyesOpen: 0-10 (every visible eye fully open? Half-closed = −4 minimum, closed = −8 minimum)
- expression: 0-15 (genuine natural expression? Peak of laugh, real smile, candid authenticity scores highest; forced, stiff, or mid-transition scores near 0)
- faceSharpness: 0-10 (face itself sharp? Soft facial features lower this score)
- moment: 0-10 (did the shutter fire at the exact peak? Peak of laughter, strongest connection between subjects, most alive instant)

NON-PORTRAIT (use null for portrait):
- moment: 0-10 (scene completeness and timing — does this frame capture the FULL scene at its best angle? A wide shot showing the complete landscape scores higher than a partial or close-cropped view of the same scene; also reward best light angle and cleanest version)

Score formula:
- Portrait: score = round((sharpness + exposure + composition + color + eyesOpen + expression + faceSharpness + moment) / 115 * 100)
- Non-portrait: score = round((sharpness + exposure + composition + color + moment) / 80 * 100)

Return ONLY valid JSON — rationale must name the SPECIFIC feature that distinguishes this shot:
{"contentType":"<portrait|landscape|other>","sharpness":<0-25>,"exposure":<0-20>,"composition":<0-15>,"color":<0-10>,"eyesOpen":<0-10 or null>,"expression":<0-15 or null>,"faceSharpness":<0-10 or null>,"moment":<0-10 or null>,"score":<0-100>,"rationale":"<one sentence on the specific strength or weakness that distinguishes this shot>"}`;

export const TIEBREAK_PROMPT = `You are an expert photo curator. Two photos scored equally and you must differentiate them.

The first image in this request is Photo 1. The second image is Photo 2.

Examine subtle differences:
- Which face has a more genuine, natural expression?
- Which has sharper eyes or better subject focus?
- Which composition feels more alive or spontaneous?
- Which lighting is more flattering?

You MUST give different scores to the two photos. Even a 1-point difference is fine.

Return ONLY valid JSON with scores reflecting what you actually observe, no other text:
{"photo1Score":<integer 0-100>,"photo2Score":<integer 0-100>,"rationale":"<one sentence on the key differentiator>"}`;

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
  const resize = (input: Parameters<typeof sharp>[0]) =>
    sharp(input)
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

  // Try sharp directly first; fall back to heic-convert on decode failure
  // (covers .heic by extension AND misnamed HEIC files e.g. .HEIC.jpeg)
  try {
    if (/\.heic$/i.test(filePath)) throw new Error('heic-first');
    return (await resize(filePath)).toString('base64');
  } catch {
    const raw = await fs.readFile(filePath);
    const jpeg = await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.9 });
    return (await resize(Buffer.from(jpeg))).toString('base64');
  }
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
    console.error(`[scorer] tiebreak error group=${groupId}:`, err);
  }
}

export async function startScorer(
  config: AppConfig,
): Promise<{ scored: number; scoreErrors: number }> {
  if (scorerRunning) {
    console.log('[scorer] already running — skipped');
    return { scored: 0, scoreErrors: 0 };
  }
  scorerRunning = true;
  resetStuckScoring();

  let scored = 0;
  let scoreErrors = 0;

  try {
    const { queued } = getScoringCounts();
    const total = queued;
    console.log(`[scorer] starting — ${total} images queued`);
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
        console.log(
          `[scorer] scored ${current + 1}/${total} score=${detail.score} type=${detail.contentType} file=${record.filePath}`
        );

        if (record.groupId !== null) {
          const { allDone, topIds } = getGroupScoringState(record.groupId);
          if (allDone && topIds.length >= 2) {
            console.log(`[scorer] tiebreak group=${record.groupId} ids=${topIds.join(',')}`);
            await runTiebreak(config, record.groupId, topIds);
          }
        }
      } catch (err) {
        console.error(`[scorer] error file=${record.filePath}:`, (err as Error).message);
        markScoreError(record.id);
        scoreErrors++;
      }

      current++;
    }
  } finally {
    scorerRunning = false;
  }

  console.log(`[scorer] done — scored=${scored} errors=${scoreErrors}`);
  return { scored, scoreErrors };
}

export async function rescoreAll(config: AppConfig): Promise<{ scored: number; scoreErrors: number }> {
  resetAllScores();
  return startScorer(config);
}
