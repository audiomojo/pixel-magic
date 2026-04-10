import path from 'path';

function dataDir(): string {
  const dir = process.env.DATA_DIR;
  if (!dir) throw new Error('DATA_DIR environment variable is not set');
  return dir;
}

export function inboundDir(): string {
  return path.join(dataDir(), 'Inbound');
}

export function keepingDir(): string {
  return path.join(dataDir(), 'Keeping');
}

export function recycleBinDir(): string {
  return path.join(dataDir(), 'Recycle Bin');
}

export function thumbsDir(): string {
  return path.join(dataDir(), 'thumbs');
}
