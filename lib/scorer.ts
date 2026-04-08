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
  let inputBuffer: Parameters<typeof sharp>[0] = filePath;

  // sharp's libheif in Docker lacks the HEVC codec for iPhone HEICs — convert first
  if (/\.heic$/i.test(filePath)) {
    const raw = await fs.readFile(filePath);
    const jpeg = await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.9 });
    inputBuffer = Buffer.from(jpeg);
  }

  const buffer = await sharp(inputBuffer)
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
  resetStuckScoring();

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
