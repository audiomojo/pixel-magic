import { describe, it, expect } from 'vitest';
import { scoreColor, formatScoreTooltip, topScoredPaths } from '@/lib/scoreHelpers';
import type { ImageRecord } from '@/types';

function makeRecord(overrides: Partial<ImageRecord>): ImageRecord {
  return {
    filePath: '/fake/img.jpg',
    hash: 'abc',
    fileSize: 1000,
    width: 800,
    height: 600,
    dpiX: 72,
    dpiY: 72,
    dateTaken: null,
    fileMtime: '2024-01-01T00:00:00Z',
    groupId: 1,
    status: 'pending',
    addedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── scoreColor ────────────────────────────────────────────────────────────────

describe('scoreColor', () => {
  it('returns green for score >= 75', () => {
    expect(scoreColor(75)).toBe('bg-green-500 text-white');
    expect(scoreColor(100)).toBe('bg-green-500 text-white');
  });

  it('returns yellow for score 50–74', () => {
    expect(scoreColor(50)).toBe('bg-yellow-500 text-black');
    expect(scoreColor(74)).toBe('bg-yellow-500 text-black');
  });

  it('returns red for score < 50', () => {
    expect(scoreColor(49)).toBe('bg-red-500 text-white');
    expect(scoreColor(0)).toBe('bg-red-500 text-white');
  });
});

// ── formatScoreTooltip ────────────────────────────────────────────────────────

describe('formatScoreTooltip', () => {
  it('returns undefined for null input', () => {
    expect(formatScoreTooltip(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(formatScoreTooltip(undefined)).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(formatScoreTooltip('not json')).toBeUndefined();
  });

  it('formats all fields when present', () => {
    const detail = JSON.stringify({
      rationale: 'Sharp focus',
      sharpness: 88,
      exposure: 72,
      composition: 65,
      color: 90,
    });
    const result = formatScoreTooltip(detail);
    expect(result).toContain('Rationale: Sharp focus');
    expect(result).toContain('Sharpness: 88');
    expect(result).toContain('Exposure: 72');
    expect(result).toContain('Composition: 65');
    expect(result).toContain('Color: 90');
  });

  it('uses em-dash for missing fields', () => {
    const result = formatScoreTooltip(JSON.stringify({}));
    expect(result).toContain('Rationale: —');
    expect(result).toContain('Sharpness: —');
  });
});

// ── topScoredPaths ────────────────────────────────────────────────────────────

describe('topScoredPaths', () => {
  it('returns empty array when no images are scored', () => {
    const images = [
      makeRecord({ filePath: '/a.jpg', aiScoreStatus: 'pending' }),
      makeRecord({ filePath: '/b.jpg', aiScoreStatus: 'scoring' }),
    ];
    expect(topScoredPaths(images)).toEqual([]);
  });

  it('returns empty array when all images have no aiScoreStatus', () => {
    const images = [makeRecord({}), makeRecord({ filePath: '/b.jpg' })];
    expect(topScoredPaths(images)).toEqual([]);
  });

  it('returns the single highest-scored path', () => {
    const images = [
      makeRecord({ filePath: '/a.jpg', aiScoreStatus: 'scored', aiScore: 80 }),
      makeRecord({ filePath: '/b.jpg', aiScoreStatus: 'scored', aiScore: 60 }),
      makeRecord({ filePath: '/c.jpg', aiScoreStatus: 'pending' }),
    ];
    expect(topScoredPaths(images)).toEqual(['/a.jpg']);
  });

  it('returns all paths tied for top score', () => {
    const images = [
      makeRecord({ filePath: '/a.jpg', aiScoreStatus: 'scored', aiScore: 85 }),
      makeRecord({ filePath: '/b.jpg', aiScoreStatus: 'scored', aiScore: 85 }),
      makeRecord({ filePath: '/c.jpg', aiScoreStatus: 'scored', aiScore: 70 }),
    ];
    expect(topScoredPaths(images)).toEqual(['/a.jpg', '/b.jpg']);
  });

  it('ignores images with null aiScore', () => {
    const images = [
      makeRecord({ filePath: '/a.jpg', aiScoreStatus: 'scored', aiScore: null }),
      makeRecord({ filePath: '/b.jpg', aiScoreStatus: 'scored', aiScore: 70 }),
    ];
    expect(topScoredPaths(images)).toEqual(['/b.jpg']);
  });
});
