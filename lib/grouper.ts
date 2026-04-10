import type { ImageRecord } from '@/types';
import { isSimilar } from './comparator';

/**
 * Clusters records into similarity groups using complete-linkage clustering.
 * A candidate joins a group only if it meets the threshold against EVERY
 * existing member — not just the representative. This prevents dissimilar
 * images from landing in the same group via a shared intermediary.
 *
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
      // Complete-linkage: must be similar to every current member
      const similarToAll = members.every((m) => isSimilar(records[m], records[j], threshold));
      if (similarToAll) {
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
