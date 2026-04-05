# Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerise pixel-magic so the Next.js app runs in Docker while `config.json`, `cache.db`, and all image folders live on the host at `/Users/rich/Data/pixel-magic/`.

**Architecture:** Three changes to existing files (env-var data path in `lib/db.ts` and `lib/config.ts`, standalone output in `next.config.ts`) plus three new Docker files (`Dockerfile`, `docker-compose.yml`, `.dockerignore`). A `DATA_DIR` environment variable overrides where the app reads/writes `config.json` and `cache.db`; in Docker this is `/data`, which is volume-mounted from the host. The app is built with Next.js standalone output for a minimal production image.

**Tech Stack:** Docker · docker-compose · Node.js 22 (Debian bookworm-slim) · Next.js 16.2.2 standalone · better-sqlite3 · sharp · heic-convert (native modules compiled in builder stage)

---

### ⚠️ Before Starting

Read `node_modules/next/dist/docs/` for the standalone output section before touching `next.config.ts`.

Native modules (`better-sqlite3`, `heic-convert`, `image-hash`) require build tools (`python3 make g++`) in the builder stage. The runner stage does NOT need them — the compiled `.node` binaries are copied via the standalone output's `node_modules/`.

---

## File Map

| File | Action |
|---|---|
| `lib/db.ts` | Modify — use `DATA_DIR` env var for DB path |
| `lib/config.ts` | Modify — use `DATA_DIR` env var for config path |
| `next.config.ts` | Modify — add `output: 'standalone'` |
| `Dockerfile` | Create — multi-stage build |
| `docker-compose.yml` | Create — single service with volume mount |
| `.dockerignore` | Create — exclude build artifacts and data files |

---

## Task 1: Add DATA_DIR support to lib/db.ts and lib/config.ts

**Files:**
- Modify: `lib/db.ts:5`
- Modify: `lib/config.ts:5`

These are one-line changes. No new tests needed — the existing e2e suite exercises both files and will catch any regression.

- [ ] **Step 1: Update `lib/db.ts`**

Find this line (line 5):

```ts
const DB_PATH = path.join(process.cwd(), 'cache.db');
```

Replace it with:

```ts
const DB_PATH = path.join(process.env.DATA_DIR ?? process.cwd(), 'cache.db');
```

- [ ] **Step 2: Update `lib/config.ts`**

Find this line (line 5):

```ts
const CONFIG_PATH = path.join(process.cwd(), 'config.json');
```

Replace it with:

```ts
const CONFIG_PATH = path.join(process.env.DATA_DIR ?? process.cwd(), 'config.json');
```

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

```bash
npx vitest run tests/e2e/api-workflow.test.ts
```

Expected: all 13 tests pass. (The e2e tests do not set `DATA_DIR`, so they exercise the `?? process.cwd()` fallback path — identical to before.)

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts lib/config.ts
git commit -m "feat: respect DATA_DIR env var for config.json and cache.db paths"
```

---

## Task 2: Add standalone output to next.config.ts

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update `next.config.ts`**

The current file:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['image-hash', 'file-type', 'better-sqlite3', 'sharp'],
};

export default nextConfig;
```

Replace it with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['image-hash', 'file-type', 'better-sqlite3', 'sharp'],
};

export default nextConfig;
```

- [ ] **Step 2: Run `next build` to verify standalone output is produced**

```bash
npm run build
```

Expected: build succeeds and `.next/standalone/server.js` exists:

```bash
ls .next/standalone/server.js
```

Expected output: `.next/standalone/server.js`

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: add standalone output mode for Docker build"
```

---

## Task 3: Create Docker files

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
.next
cache.db
cache.db-shm
cache.db-wal
config.json
test-photos
.worktrees
docs
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Build tools required to compile native modules:
# better-sqlite3, heic-convert, image-hash all use node-gyp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output includes server.js + node_modules (with compiled .node binaries)
COPY --from=builder /app/.next/standalone ./
# Static assets must be copied separately — standalone does not include them
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  pixel-magic:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /Users/rich/Data/pixel-magic:/data
    environment:
      DATA_DIR: /data
    restart: unless-stopped
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add Dockerfile and docker-compose for production deployment"
```

---

## Task 4: Build and smoke test

This task verifies the Docker setup end-to-end. No code changes — just build, run, and confirm.

- [ ] **Step 1: Create the host data directories**

```bash
mkdir -p "/Users/rich/Data/pixel-magic/Inbound"
mkdir -p "/Users/rich/Data/pixel-magic/Keeping"
mkdir -p "/Users/rich/Data/pixel-magic/Recycle Bin"
```

Expected: directories exist, no errors.

- [ ] **Step 2: Build and start the container**

```bash
docker compose up --build
```

Expected: Docker pulls `node:22-bookworm-slim`, installs deps, compiles native modules, builds Next.js, starts the server. Final output should include:

```
pixel-magic-1  |  ✓ Starting...
pixel-magic-1  |  ✓ Ready on http://0.0.0.0:3000
```

(Build will take several minutes on first run due to native module compilation.)

- [ ] **Step 3: Verify the app is reachable**

Open http://localhost:3000 in a browser.

Expected: Dashboard page loads. Nav shows Dashboard · Review Queue · Stats.

- [ ] **Step 4: Verify data files land on the host**

In the Dashboard, set:
- Inbound folder: `/data/Inbound`
- Output base folder: `/data`

Click Save.

Expected: `config.json` appears at `/Users/rich/Data/pixel-magic/config.json` on the host:

```bash
cat "/Users/rich/Data/pixel-magic/config.json"
```

Expected: file contains `"inboundFolder": "/data/Inbound"` and `"outboundBase": "/data"`.

- [ ] **Step 5: Stop the container**

```bash
docker compose down
```

- [ ] **Step 6: Verify data persists after restart**

```bash
docker compose up -d
```

Open http://localhost:3000 → Dashboard. Config values should still show `/data/Inbound` and `/data`.

```bash
docker compose down
```
