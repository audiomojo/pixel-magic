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

export function excludeOutbound(files: string[], outboundBase: string, inboundFolder: string): string[] {
  const normalizedOut = path.normalize(outboundBase);
  const normalizedIn = path.normalize(inboundFolder);
  // If inboundFolder is inside outboundBase, no output files can appear in scan results
  // (output dirs are siblings of inbound, not children), so skip exclusion entirely.
  if (normalizedIn.startsWith(normalizedOut)) return files;
  return files.filter((f) => !path.normalize(f).startsWith(normalizedOut));
}
