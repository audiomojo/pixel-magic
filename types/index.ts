export type ImageStatus = 'pending' | 'kept' | 'recycled' | 'singleton_kept';

export type AiScoreStatus = 'pending' | 'scoring' | 'scored' | 'error';

export type AiScoreDetail = {
  contentType: 'portrait' | 'landscape' | 'other';
  sharpness: number;
  exposure: number;
  composition: number;
  color: number;
  eyesOpen: number | null;
  expression: number | null;
  faceSharpness: number | null;
  score: number;
  rationale: string;
  tiebreak?: boolean;
};

export type ImageRecord = {
  id?: number;
  filePath: string;         // Absolute path in Inbound
  hash: string;             // Blockhash hex string (256-bit, bit length 16)
  fileSize: number;         // Bytes
  width: number;            // Pixels
  height: number;           // Pixels
  dpiX: number;
  dpiY: number;
  dateTaken: string | null; // ISO 8601 from EXIF, or null
  fileMtime: string;        // ISO 8601 file modification time (fallback date)
  groupId: number | null;   // null = singleton (no near-duplicates)
  status: ImageStatus;
  addedAt: string;          // ISO 8601 scan time
  // AI scoring — optional: absent until the migration runs or scoring begins
  aiScore?: number | null;
  aiScoreDetail?: string | null;   // JSON string of AiScoreDetail
  aiScoredAt?: string | null;
  aiScoreStatus?: AiScoreStatus;
};

export type ImageGroup = {
  id: number;
  representativePath: string; // Path of the first image to start the group
  imageCount: number;
  createdAt: string;
};

export type GroupDetail = {
  group: ImageGroup;
  images: ImageRecord[];
};

export type GroupResolution = {
  keepPaths: string[];    // These go to Outbound - Keeping/YYYY/MM/
  recyclePaths: string[]; // These go to Outbound - Recycle Bin/
  rotation?: 0 | 90 | 180 | 270; // clockwise degrees for sharp; omitted = no rotation
};

export type ProgressEvent = {
  type: 'progress' | 'grouping' | 'complete' | 'error';
  phase: 'hashing' | 'grouping' | 'scoring' | 'done';
  current: number;
  total: number;
  currentFile?: string;
  stats?: ScanStats;
};

export type ScanStats = {
  totalScanned: number;
  grouped: number;      // Images that belong to a similarity group
  singletons: number;   // Images with no near-duplicates
  errors: number;
  groupCount: number;   // Number of distinct groups
  scored?: number;      // Populated once ai-scoring is merged
  scoreErrors?: number;
};

export type AppConfig = {
  inboundFolder: string;
  outboundBase: string;  // Parent of "Keeping" and "Recycle Bin" subdirs
  similarityThreshold: number;
  supportedExtensions: string[];
  aiScoringEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
};
