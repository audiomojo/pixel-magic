export interface AppConfig {
  inboundFolder: string;
  outboundBase: string;
  similarityThreshold: number;
  supportedExtensions: string[];
}

export interface ScanStats {
  totalScanned: number;
  grouped?: number;
  singletons: number;
  errors: number;
  groupCount: number;
}

export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error';
  phase: 'hashing' | 'grouping';
  current: number;
  total: number;
  currentFile?: string;
  stats?: ScanStats;
}
