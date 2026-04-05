import type { ImageRecord } from '@/types';
import { isSimilar } from './comparator';

/**
 * Clusters records into similarity groups.
 * Returns a Map of representativeIndex → [all member indices including representative].
 * Records with no similar peers are singletons and are NOT included in the map.
 */
export function buildGroups(
  records: ImageRecord[],
  threshold: number
): Map<number, number[]> {
  const assigned = new Set<number>();
  const groups = new Map<number, number[]>();

  for (let i = 0; i < records.length; i++) {
    if (assigned.has(i)) continue;

    const members: number[] = [i];

    for (let j = i + 1; j < records.length; j++) {
      if (assigned.has(j)) continue;
      if (isSimilar(records[i], records[j], threshold)) {
        members.push(j);
      }
    }

    if (members.length > 1) {
      members.forEach((idx) => assigned.add(idx));
      groups.set(i, members);
    }
    // singletons: members.length === 1 — not added to groups, groupId stays null
  }

  return groups;
}
