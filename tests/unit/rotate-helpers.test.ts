import { describe, it, expect } from 'vitest';

/**
 * Pure-function tests for the CCW rotation helpers defined in the review page.
 *
 * rotateCCW logic: (prev + 270) % 360
 * rotateBadge logic: rotation === 0 ? '' : `–${(360 - rotation) % 360}°`
 */

function rotateCCW(prev: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  return (((prev + 270) % 360) as 0 | 90 | 180 | 270);
}

function rotateBadge(rotation: number): string {
  if (rotation === 0) return '';
  const ccw = (360 - rotation) % 360;
  return `–${ccw}°`;
}

describe('rotateCCW — four-step CCW cycle', () => {
  it('0° → 270° (first click: CCW 90°)', () => {
    expect(rotateCCW(0)).toBe(270);
  });
  it('270° → 180° (second click: CCW 180° total)', () => {
    expect(rotateCCW(270)).toBe(180);
  });
  it('180° → 90° (third click: CCW 270° total)', () => {
    expect(rotateCCW(180)).toBe(90);
  });
  it('90° → 0° (fourth click: full rotation, back to 0)', () => {
    expect(rotateCCW(90)).toBe(0);
  });
});

describe('rotateBadge — CCW display angle', () => {
  it('returns empty string when rotation is 0', () => {
    expect(rotateBadge(0)).toBe('');
  });
  it('270° stored (1 click) → displays –90°', () => {
    expect(rotateBadge(270)).toBe('–90°');
  });
  it('180° stored (2 clicks) → displays –180°', () => {
    expect(rotateBadge(180)).toBe('–180°');
  });
  it('90° stored (3 clicks) → displays –270°', () => {
    expect(rotateBadge(90)).toBe('–270°');
  });
});
