import { describe, it, expect, afterEach } from 'vitest';
import { inboundDir, keepingDir, recycleBinDir } from '@/lib/paths';

describe('lib/paths', () => {
  const origDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = origDataDir;
  });

  it('inboundDir() returns DATA_DIR/Inbound', () => {
    process.env.DATA_DIR = '/tmp/test-data';
    expect(inboundDir()).toBe('/tmp/test-data/Inbound');
  });

  it('keepingDir() returns DATA_DIR/Keeping', () => {
    process.env.DATA_DIR = '/tmp/test-data';
    expect(keepingDir()).toBe('/tmp/test-data/Keeping');
  });

  it('recycleBinDir() returns DATA_DIR/Recycle Bin', () => {
    process.env.DATA_DIR = '/tmp/test-data';
    expect(recycleBinDir()).toBe('/tmp/test-data/Recycle Bin');
  });

  it('throws if DATA_DIR is not set', () => {
    delete process.env.DATA_DIR;
    expect(() => inboundDir()).toThrow('DATA_DIR environment variable is not set');
  });
});
