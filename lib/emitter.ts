import { EventEmitter } from 'events';
import type { ProgressEvent } from '@/types';

export const scanEmitter = new EventEmitter();

export function emitProgress(event: ProgressEvent): void {
  scanEmitter.emit('progress', event);
}
