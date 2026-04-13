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

type AiScoreDetailWithMoment = AiScoreDetail & { moment?: number | null };

interface ScoredImage extends GroundTruth {
  score: number;
  detail: AiScoreDetailWithMoment;
}

async function main() {
  // Parse --model flag
  const modelFlagIdx = process.argv.indexOf('--model');
  const modelOverride = modelFlagIdx >= 0 ? process.argv[modelFlagIdx + 1] : null;

  let config: AppConfig;
  try { config = readConfig(); } catch { config = defaultConfig(); }

  const model = modelOverride ?? config.ollamaModel;
  const ollamaUrl = 'http://localhost:11434';

  const entries = await fs.readdir(TEST_DIR);
  const imagePaths = entries
    .filter(f => /\.(heic|jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(TEST_DIR, f));

  const groundTruths = imagePaths
    .map(fp => parseFilename(fp))
    .filter((gt): gt is GroundTruth => gt !== null)
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  console.log(`Scoring ${groundTruths.length} images with model=${model}\n`);

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
      const detail = JSON.parse(data.response) as AiScoreDetailWithMoment;
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
      const fmt = (d: AiScoreDetailWithMoment) => {
        const base = `sharpness=${d.sharpness} exposure=${d.exposure} composition=${d.composition} color=${d.color}`;
        const portrait = d.eyesOpen != null
          ? ` eyesOpen=${d.eyesOpen} expression=${d.expression} faceSharpness=${d.faceSharpness}`
          : '';
        const moment = d.moment != null ? ` moment=${d.moment}` : '';
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
