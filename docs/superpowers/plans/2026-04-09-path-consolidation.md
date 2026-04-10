# Path Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-path config (`inboundFolder` + `outboundBase`) with a single `DATA_DIR` env var whose fixed subfolders (`Inbound/`, `Keeping/`, `Recycle Bin/`) are derived in a new `lib/paths.ts` module.

**Architecture:** A new `lib/paths.ts` exports three functions (`inboundDir()`, `keepingDir()`, `recycleBinDir()`) that read `DATA_DIR` at call time. All callers that currently use `config.inboundFolder` / `config.outboundBase` are updated to call these functions instead. The `AppConfig` type and UI lose the two path fields entirely.

**Tech Stack:** TypeScript, Next.js App Router, better-sqlite3, vitest

---

### Task 1: Create `lib/paths.ts` with unit tests

**Files:**
- Create: `lib/paths.ts`
- Create: `tests/unit/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/paths.test.ts
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
npx vitest run tests/unit/paths.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/paths'`

- [ ] **Step 3: Create `lib/paths.ts`**

```ts
// lib/paths.ts
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run tests/unit/paths.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/paths.ts tests/unit/paths.test.ts
git commit -m "feat: add lib/paths.ts — derive Inbound/Keeping/Recycle Bin from DATA_DIR"
```

---

### Task 2: Remove path fields from `AppConfig` type and `lib/config.ts`

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/config.ts`

- [ ] **Step 1: Remove `inboundFolder` and `outboundBase` from `AppConfig`**

In `types/index.ts`, replace the `AppConfig` type (lines 77–85):

```ts
export type AppConfig = {
  similarityThreshold: number;
  supportedExtensions: string[];
  aiScoringEnabled: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string;
};
```

- [ ] **Step 2: Remove path validation from `lib/config.ts`**

Replace the `writeConfig` function:

```ts
export function writeConfig(config: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
```

- [ ] **Step 3: Commit**

```bash
git add types/index.ts lib/config.ts
git commit -m "refactor: remove inboundFolder and outboundBase from AppConfig"
```

---

### Task 3: Update `lib/organizer.ts`

Remove the `outboundBase` parameter from both exported functions. Import `keepingDir` and `recycleBinDir` from `lib/paths.ts`.

**Files:**
- Modify: `lib/organizer.ts`

- [ ] **Step 1: Rewrite `lib/organizer.ts`**

```ts
import path from 'path';
import fs from 'fs';
import type { ImageRecord } from '@/types';
import { keepingDir, recycleBinDir } from '@/lib/paths';

function resolveDate(record: ImageRecord): Date {
  const src = record.dateTaken ?? record.fileMtime;
  return new Date(src);
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

function uniquePath(dest: string): string {
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(dest);
  const base = dest.slice(0, dest.length - ext.length);
  let counter = 1;
  while (fs.existsSync(`${base}_${counter}${ext}`)) {
    counter++;
  }
  return `${base}_${counter}${ext}`;
}

export function getKeepingPath(record: ImageRecord, filename: string): string {
  const date = resolveDate(record);
  const yyyy = String(date.getFullYear());
  const mm = padTwo(date.getMonth() + 1);
  const dest = path.join(keepingDir(), yyyy, mm, filename);
  return uniquePath(dest);
}

export function getRecyclePath(filename: string): string {
  const dest = path.join(recycleBinDir(), filename);
  return uniquePath(dest);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/organizer.ts
git commit -m "refactor: organizer reads keepingDir/recycleBinDir from lib/paths"
```

---

### Task 4: Update `lib/processor.ts`

Replace `config.inboundFolder` with `inboundDir()`. Remove the `excludeOutbound` call (Inbound is always isolated from Keeping/Recycle Bin since they are siblings, not children).

**Files:**
- Modify: `lib/processor.ts`

- [ ] **Step 1: Update the imports and scan phase**

Add the import at the top of `lib/processor.ts`:

```ts
import { inboundDir } from './paths';
```

Replace lines 27–31 in `lib/processor.ts`:

```ts
  console.log(`[scan] starting — inbound=${inboundDir()}`);
  const allFiles = await scanFolder(inboundDir(), config.supportedExtensions);
  console.log(`[scan] found ${allFiles.length} files`);
```

Also remove the now-unused `excludeOutbound` import from the `import { scanFolder, excludeOutbound }` line — change it to:

```ts
import { scanFolder } from './scanner';
```

- [ ] **Step 2: Commit**

```bash
git add lib/processor.ts
git commit -m "refactor: processor uses inboundDir() from lib/paths"
```

---

### Task 5: Update API routes

**Files:**
- Modify: `app/api/scan/route.ts`
- Modify: `app/api/images/route.ts`
- Modify: `app/api/groups/[id]/route.ts`
- Modify: `app/api/recycle/route.ts`
- Modify: `app/api/singletons/route.ts`
- Modify: `app/api/config/route.ts`

- [ ] **Step 1: Update `app/api/scan/route.ts` — remove the "configure folders first" guard**

Remove lines 18–20 (the `if (!config.inboundFolder || !config.outboundBase)` block):

```ts
import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';
import { runScan } from '@/lib/processor';
import { scanState } from '@/lib/scanState';

export async function POST() {
  if (scanState.status === 'running') {
    return NextResponse.json({ error: 'Scan already running' }, { status: 409 });
  }

  let config;
  try {
    config = readConfig();
  } catch {
    return NextResponse.json({ error: 'Could not read config' }, { status: 500 });
  }

  scanState.status = 'running';
  scanState.scanStartedAt = Date.now();
  scanState.lastScanAt = new Date().toISOString();

  runScan(config)
    .then(() => {
      scanState.status = 'complete';
      scanState.scanDurationMs = Date.now() - (scanState.scanStartedAt ?? Date.now());
    })
    .catch(() => {
      scanState.status = 'error';
      scanState.scanDurationMs = Date.now() - (scanState.scanStartedAt ?? Date.now());
    });

  return NextResponse.json({ ok: true, status: 'running' }, { status: 202 });
}
```

- [ ] **Step 2: Update `app/api/images/route.ts` — fix `isAllowedPath`**

Replace the `isAllowedPath` function and its call site. Add the import and rewrite the guard:

```ts
import { inboundDir, keepingDir, recycleBinDir } from '@/lib/paths';

function isAllowedPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return (
    normalized.startsWith(path.normalize(inboundDir())) ||
    normalized.startsWith(path.normalize(keepingDir())) ||
    normalized.startsWith(path.normalize(recycleBinDir()))
  );
}
```

Replace the call site (line 43):

```ts
  if (!isAllowedPath(filePath)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }
```

Remove the now-unused `readConfig` import and `config` variable from `app/api/images/route.ts`. The full updated file:

```ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { inboundDir, keepingDir, recycleBinDir } from '@/lib/paths';

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

function isAllowedPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  return (
    normalized.startsWith(path.normalize(inboundDir())) ||
    normalized.startsWith(path.normalize(keepingDir())) ||
    normalized.startsWith(path.normalize(recycleBinDir()))
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  if (!isAllowedPath(filePath)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  try {
    const raw = await fs.readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();

    try {
      let jpegBuffer: Buffer;
      if (ext === 'heic' || ext === 'heif') {
        try {
          jpegBuffer = await sharp(raw, { failOn: 'none' }).jpeg({ quality: 85 }).toBuffer();
        } catch {
          const converted = await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.85 });
          jpegBuffer = Buffer.from(converted);
        }
      } else {
        jpegBuffer = await sharp(raw, { failOn: 'none' }).jpeg({ quality: 85 }).toBuffer();
      }
      return new Response(jpegBuffer.buffer as ArrayBuffer, { headers: { 'Content-Type': 'image/jpeg' } });
    } catch {
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      return new Response(raw.buffer as ArrayBuffer, { headers: { 'Content-Type': contentType } });
    }
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
```

- [ ] **Step 3: Update `app/api/groups/[id]/route.ts` — update organizer call sites**

The `getKeepingPath` and `getRecyclePath` calls no longer pass `outboundBase`. Update lines 77 and 95:

```ts
// line 77 — was: getKeepingPath(config.outboundBase, record, filename)
const dest = getKeepingPath(record, filename);

// line 95 — was: getRecyclePath(config.outboundBase, filename)
const dest = getRecyclePath(filename);
```

Also remove `const config = readConfig();` (line 71) and the `readConfig` import since the route no longer needs config.

The updated imports for this file:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAllGroups, getByGroupId, updateStatus } from '@/lib/db';
import { getKeepingPath, getRecyclePath } from '@/lib/organizer';
import fs from 'fs/promises';
import path from 'path';
import type { GroupResolution } from '@/types';
import sharp from 'sharp';
```

- [ ] **Step 4: Update `app/api/recycle/route.ts` — use `recycleBinDir()`**

Replace the DELETE handler body:

```ts
import { NextResponse } from 'next/server';
import { getRecycled, deleteRecycled } from '@/lib/db';
import { recycleBinDir } from '@/lib/paths';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const recycled = getRecycled();
    return NextResponse.json(recycled);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const recycled = getRecycled();
    const count = recycled.length;

    try {
      const entries = await fs.readdir(recycleBinDir());
      await Promise.all(
        entries.map((entry) =>
          fs.rm(path.join(recycleBinDir(), entry), { recursive: true, force: true })
        )
      );
    } catch {
      // Folder may not exist yet; ignore
    }

    deleteRecycled();

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Update `app/api/singletons/route.ts` — update `getKeepingPath` call**

Remove `const config = readConfig();` and update the `getKeepingPath` call. Full updated file:

```ts
import { NextResponse } from 'next/server';
import { getAllSingletons, updateStatus } from '@/lib/db';
import { getKeepingPath } from '@/lib/organizer';
import fs from 'fs/promises';
import path from 'path';

export async function POST() {
  try {
    const singletons = getAllSingletons();
    let count = 0;

    for (const record of singletons) {
      const filename = path.basename(record.filePath);
      const dest = getKeepingPath(record, filename);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(record.filePath, dest);
      if (record.id !== undefined) updateStatus(record.id, 'singleton_kept');
      count++;
    }

    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Update `app/api/config/route.ts` — remove path fields from defaults**

Replace the default response object in the `GET` handler (the `catch` branch):

```ts
return NextResponse.json({
  similarityThreshold: 60,
  supportedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'gif', 'bmp'],
  aiScoringEnabled: false,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  ollamaModel: 'qwen2.5vl:7b',
} satisfies AppConfig);
```

Also remove `inboundFolder: ''` and `outboundBase: ''` from the `POST` handler's `body` construction — these fields no longer exist in `AppConfig`, so the `body` is just the remaining fields.

- [ ] **Step 7: Commit all API route changes**

```bash
git add app/api/scan/route.ts app/api/images/route.ts app/api/groups/[id]/route.ts \
        app/api/recycle/route.ts app/api/singletons/route.ts app/api/config/route.ts
git commit -m "refactor: api routes use lib/paths instead of config path fields"
```

---

### Task 6: Update `components/ConfigPanel.tsx`

Remove the `inbound`/`outbound` state, the two path input fields, and the scanning summary that references them.

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Rewrite `ConfigPanel.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppConfig } from '@/types';

const ALL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'tiff', 'gif', 'bmp'];

interface ConfigPanelProps {
  config: AppConfig | null;
  scanning: boolean;
  onSaved: (config: AppConfig) => void;
}

export function ConfigPanel({ config, scanning, onSaved }: ConfigPanelProps) {
  const [threshold, setThreshold] = useState(90);
  const [extensions, setExtensions] = useState<string[]>(['jpg', 'jpeg', 'png', 'heic', 'webp']);
  const [saving, setSaving] = useState(false);
  const [aiScoringEnabled, setAiScoringEnabled] = useState(false);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://host.docker.internal:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen2.5vl:7b');

  useEffect(() => {
    if (config) {
      setThreshold(config.similarityThreshold);
      setExtensions(config.supportedExtensions);
      setAiScoringEnabled(config.aiScoringEnabled ?? false);
      setOllamaBaseUrl(config.ollamaBaseUrl ?? 'http://host.docker.internal:11434');
      setOllamaModel(config.ollamaModel ?? 'qwen2.5vl:7b');
    }
  }, [config]);

  function toggleExtension(ext: string) {
    setExtensions((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: AppConfig = {
        similarityThreshold: threshold,
        supportedExtensions: extensions,
        aiScoringEnabled,
        ollamaBaseUrl: ollamaBaseUrl.trim(),
        ollamaModel: ollamaModel.trim(),
      };
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        toast.error(error);
      } else {
        toast.success('Configuration saved');
        onSaved(body);
      }
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  if (scanning) {
    return (
      <div className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {threshold}% similarity threshold
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 text-sm">
      <p className="mb-3 font-medium">Configuration</p>

      <div className="mb-3">
        <label htmlFor="similarity-threshold" className="mb-1 block text-xs text-muted-foreground">
          Similarity threshold — <strong>{threshold}%</strong>
        </label>
        <input
          id="similarity-threshold"
          type="range"
          min={50}
          max={100}
          step={1}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-xs text-muted-foreground">File extensions</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_EXTENSIONS.map((ext) => {
            const active = extensions.includes(ext);
            return (
              <button
                key={ext}
                type="button"
                onClick={() => toggleExtension(ext)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                {ext}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-xs text-muted-foreground">AI Scoring</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={aiScoringEnabled}
              onChange={(e) => setAiScoringEnabled(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
            />
            Enable automatic photo scoring via Ollama
          </label>
          {aiScoringEnabled && (
            <>
              <div>
                <label htmlFor="ollama-url" className="mb-1 block text-xs text-muted-foreground">
                  Ollama base URL
                </label>
                <input
                  id="ollama-url"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="ollama-model" className="mb-1 block text-xs text-muted-foreground">
                  Ollama model
                </label>
                <input
                  id="ollama-model"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch('/api/scoring/rescore', { method: 'POST' });
                  if (!res.ok) {
                    const { error } = (await res.json()) as { error: string };
                    toast.error(error);
                  } else {
                    toast.success('Re-scoring started');
                  }
                }}
                className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
              >
                Re-score All
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "refactor: remove inbound/outbound path fields from ConfigPanel"
```

---

### Task 7: Update `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace with single-volume config**

```yaml
services:
  pixel-magic:
    build: .
    ports:
      - "3010:3000"
    volumes:
      - /Users/rich/data/docker/pixel-magic:/data
    environment:
      - DATA_DIR=/data
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    restart: unless-stopped
```

- [ ] **Step 2: Ensure host subfolders exist**

```bash
mkdir -p "/Users/rich/data/docker/pixel-magic/Inbound"
mkdir -p "/Users/rich/data/docker/pixel-magic/Keeping"
mkdir -p "/Users/rich/data/docker/pixel-magic/Recycle Bin"
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: consolidate to single DATA_DIR volume in docker-compose"
```

---

### Task 8: Update tests

**Files:**
- Modify: `tests/e2e/config-first-run.test.ts`
- Modify: `tests/integration/processor.test.ts`
- Modify: `tests/e2e/api-workflow.test.ts`

- [ ] **Step 1: Update `tests/e2e/config-first-run.test.ts`**

The test currently backs up `config.json` at the project root. With `DATA_DIR` driving the config path, the test should set `DATA_DIR` to a temp dir with no `config.json`. Remove the `inboundFolder`/`outboundBase` assertions.

```ts
/**
 * Tests GET /api/config when config.json does not exist (first-run scenario).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { GET as getConfig } from '@/app/api/config/route';

let tempDir: string;
let origDataDir: string | undefined;

beforeAll(() => {
  origDataDir = process.env.DATA_DIR;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-magic-first-run-'));
  process.env.DATA_DIR = tempDir;
  // Ensure no config.json exists in the temp dir
  const configPath = path.join(tempDir, 'config.json');
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
});

afterAll(() => {
  if (origDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDataDir;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/config — first run (no config.json)', () => {
  it('returns 200 with default config when config.json is missing', async () => {
    const res = await getConfig();
    expect(res.status).toBe(200);
  });

  it('default config has similarityThreshold of 60', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.similarityThreshold).toBe(60);
  });

  it('default config has a non-empty supportedExtensions array', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.supportedExtensions)).toBe(true);
    expect((body.supportedExtensions as string[]).length).toBeGreaterThan(0);
  });

  it('default config does not contain path fields', async () => {
    const res = await getConfig();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.inboundFolder).toBeUndefined();
    expect(body.outboundBase).toBeUndefined();
  });
});
```

- [ ] **Step 2: Update `tests/integration/processor.test.ts`**

Replace `makeConfig` (which took `inboundFolder` and `outboundBase`) with a version that only takes behavioural fields. Set `DATA_DIR` via the env var and create the dir structure. Use a symlink for `Inbound` pointing to the test fixture folder so actual files don't need to be copied.

Replace the `makeConfig` function and `beforeAll`/`afterAll` blocks:

```ts
// Remove these imports (no longer needed):
// import type { AppConfig } from '@/types';

// Add at top:
import type { AppConfig } from '@/types';

// Replace makeConfig:
function makeConfig(): AppConfig {
  return {
    similarityThreshold: 90,
    supportedExtensions: SUPPORTED_EXTENSIONS,
    aiScoringEnabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2-vision:11b',
  };
}
```

For the `describe('runScan — Identical folder ...')` block, replace `beforeAll`/`afterAll`:

```ts
let dataDir: string;
let origDataDir: string | undefined;

beforeAll(async () => {
  origDataDir = process.env.DATA_DIR;
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-identical-'));
  await fs.symlink(IDENTICAL_DIR, path.join(dataDir, 'Inbound'));
  await fs.mkdir(path.join(dataDir, 'Keeping'), { recursive: true });
  await fs.mkdir(path.join(dataDir, 'Recycle Bin'), { recursive: true });
  process.env.DATA_DIR = dataDir;
  clearAll();
  stats = await runScan(makeConfig());
  console.log('\n  Identical scan stats:', JSON.stringify(stats, null, 2));
}, 120000);

afterAll(async () => {
  clearAll();
  await fs.rm(dataDir, { recursive: true, force: true });
  if (origDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDataDir;
});
```

Apply the same pattern to the `describe('runScan — Similar folder ...')` block (substituting `SIMILAR_DIR` for `IDENTICAL_DIR` and adjusting the temp dir prefix to `pixel-magic-similar-`).

- [ ] **Step 3: Update `tests/e2e/api-workflow.test.ts`**

Remove the `outboundBase` temp dir and `CONFIG_PATH` backup/restore approach. Replace with a `DATA_DIR` temp dir setup:

```ts
// Remove: let outboundBase: string;
// Remove: const CONFIG_PATH = ...;
// Remove: let originalConfig: string | null = null;
// Add:
let dataDir: string;
let origDataDir: string | undefined;
```

Replace the `beforeAll` setup:

```ts
beforeAll(async () => {
  origDataDir = process.env.DATA_DIR;
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixel-magic-e2e-'));
  await fs.symlink(SIMILAR_DIR, path.join(dataDir, 'Inbound'));
  await fs.mkdir(path.join(dataDir, 'Keeping'), { recursive: true });
  await fs.mkdir(path.join(dataDir, 'Recycle Bin'), { recursive: true });
  process.env.DATA_DIR = dataDir;

  const testConfig = {
    similarityThreshold: 90,
    supportedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'tiff', 'tif', 'jp2'],
    aiScoringEnabled: false,
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2-vision:11b',
  };
  writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(testConfig, null, 2), 'utf-8');

  clearAll();
  const scanStats = await runScan(testConfig);
  console.log(`\n  E2E setup: ${scanStats.totalScanned} scanned, ${scanStats.groupCount} groups, ${scanStats.singletons} singletons`);
  console.log(`  Data dir: ${dataDir}`);
}, 120000);
```

Replace `afterAll`:

```ts
afterAll(async () => {
  clearAll();
  await fs.rm(dataDir, { recursive: true, force: true });
  if (origDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDataDir;
});
```

Update any assertions in the test that check file paths under `outboundBase` — replace `outboundBase` with `dataDir`. For example, where tests verify a file was moved to `Keeping/YYYY/MM/`, use `path.join(dataDir, 'Keeping', ...)`.

- [ ] **Step 4: Run all tests**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
npx vitest run
```

Expected: all tests pass. Fix any remaining TypeScript compile errors (likely `config.inboundFolder` / `config.outboundBase` references in test files that weren't covered above).

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: update test suites for DATA_DIR-based path model"
```

---

### Task 9: TypeScript compile check

- [ ] **Step 1: Verify no type errors**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic"
npx tsc --noEmit
```

Expected: 0 errors. Fix any residual `inboundFolder`/`outboundBase` references.

- [ ] **Step 2: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: resolve remaining TypeScript errors after path consolidation"
```
