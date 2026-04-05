import type { ImageRecord } from '@/types';

function hexToBinary(hex: string): string {
  return hex
    .split('')
    .map((c) => parseInt(c, 16).toString(2).padStart(4, '0'))
    .join('');
}

export function hammingDistance(hash1: string, hash2: string): number {
  const bin1 = hexToBinary(hash1);
  const bin2 = hexToBinary(hash2);
  let distance = 0;
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) distance++;
  }
  return distance;
}

export function hashSimilarityPct(hash1: string, hash2: string): number {
  const totalBits = hexToBinary(hash1).length;
  return (1 - hammingDistance(hash1, hash2) / totalBits) * 100;
}

export function isSimilar(r1: ImageRecord, r2: ImageRecord, threshold: number): boolean {
  return hashSimilarityPct(r1.hash, r2.hash) >= threshold;
}
