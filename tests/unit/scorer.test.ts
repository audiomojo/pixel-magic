import { describe, it, expect } from 'vitest';
import { normalizeScore, parseScoreResponse, SCORE_PROMPT, TIEBREAK_PROMPT } from '@/lib/scorer';

describe('normalizeScore', () => {
  it('returns raw sum unchanged for portraits (max 100)', () => {
    expect(normalizeScore(86, true)).toBe(86);
  });

  it('clamps portrait scores above 100 to 100', () => {
    expect(normalizeScore(110, true)).toBe(100);
  });

  it('normalizes non-portrait from 70-pt base to 100', () => {
    expect(normalizeScore(70, false)).toBe(100);
  });

  it('normalizes non-portrait mid score', () => {
    expect(normalizeScore(35, false)).toBe(50);
  });

  it('rounds non-portrait fractional results', () => {
    expect(normalizeScore(50, false)).toBe(71);
  });

  it('clamps non-portrait below 0 to 0', () => {
    expect(normalizeScore(-5, false)).toBe(0);
  });
});

describe('parseScoreResponse', () => {
  it('parses a valid portrait response', () => {
    const raw = JSON.stringify({
      contentType: 'portrait',
      sharpness: 22,
      exposure: 18,
      composition: 12,
      color: 8,
      eyesOpen: 9,
      expression: 8,
      faceSharpness: 9,
      score: 86,
      rationale: 'Great shot',
    });
    const result = parseScoreResponse(raw);
    expect(result.score).toBe(86);
    expect(result.contentType).toBe('portrait');
    expect(result.eyesOpen).toBe(9);
  });

  it('parses a valid non-portrait response', () => {
    const raw = JSON.stringify({
      contentType: 'landscape',
      sharpness: 20,
      exposure: 16,
      composition: 12,
      color: 8,
      eyesOpen: null,
      expression: null,
      faceSharpness: null,
      score: 80,
      rationale: 'Nice landscape',
    });
    const result = parseScoreResponse(raw);
    expect(result.score).toBe(80);
    expect(result.eyesOpen).toBeNull();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseScoreResponse('not json')).toThrow();
  });

  it('throws when score field is missing', () => {
    expect(() =>
      parseScoreResponse(JSON.stringify({ contentType: 'portrait' }))
    ).toThrow('Invalid score response shape');
  });
});

describe('SCORE_PROMPT', () => {
  it('contains the JSON output template', () => {
    expect(SCORE_PROMPT).toContain('"contentType"');
    expect(SCORE_PROMPT).toContain('"score"');
    expect(SCORE_PROMPT).toContain('"rationale"');
  });

  it('instructs the model to return only JSON', () => {
    expect(SCORE_PROMPT).toContain('Return ONLY valid JSON');
  });
});

describe('TIEBREAK_PROMPT', () => {
  it('references photo1Score and photo2Score', () => {
    expect(TIEBREAK_PROMPT).toContain('"photo1Score"');
    expect(TIEBREAK_PROMPT).toContain('"photo2Score"');
  });

  it('instructs the model to give different scores', () => {
    expect(TIEBREAK_PROMPT).toContain('MUST give different scores');
  });
});
