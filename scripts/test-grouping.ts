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
