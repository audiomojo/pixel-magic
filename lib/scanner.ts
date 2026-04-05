import fg from 'fast-glob';
import path from 'path';

export async function scanFolder(
  sourceFolder: string,
  extensions: string[]
): Promise<string[]> {
  const patterns = extensions.map((ext) => `**/*.${ext}`);
  const files = await fg(patterns, {
    cwd: sourceFolder,
    absolute: true,
    caseSensitiveMatch: false,
    onlyFiles: true,
  });
  return files.sort();
}

export function excludeOutbound(files: string[], outboundBase: string): string[] {
  const normalized = path.normalize(outboundBase);
  return files.filter((f) => !path.normalize(f).startsWith(normalized));
}
