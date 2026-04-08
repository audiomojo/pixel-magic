import type { ImageRecord } from '@/types';

export function scoreColor(score: number): string {
  if (score >= 75) return 'bg-green-500 text-white';
  if (score >= 50) return 'bg-yellow-500 text-black';
  return 'bg-red-500 text-white';
}

export function formatScoreTooltip(aiScoreDetail: string | null | undefined): string | undefined {
  if (!aiScoreDetail) return undefined;
  try {
    const d = JSON.parse(aiScoreDetail) as {
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
    return undefined;
  }
}

export function topScoredPaths(images: ImageRecord[]): string[] {
  const scored = images.filter(
    (img) => img.aiScoreStatus === 'scored' && img.aiScore != null
  );
  if (scored.length === 0) return [];
  const topScore = Math.max(...scored.map((img) => img.aiScore as number));
  return scored.filter((img) => img.aiScore === topScore).map((img) => img.filePath);
}
