# Docker Deployment Design
**Date:** 2026-04-05
**Scope:** Containerise pixel-magic with host-mounted data volume

---

## Goal

Run the Next.js app in Docker while keeping all persistent data (images, database, config) on the host at `/Users/rich/Data/pixel-magic/`.

---

## Host Folder Layout

```
/Users/rich/Data/pixel-magic/
  Inbound/          ← drop images here to scan
  Keeping/          ← kept images land here (YYYY/MM/ subfolders)
  Recycle Bin/      ← recycled images land here
  config.json       ← written by Dashboard config save; created on first save
  cache.db          ← SQLite database; created on first scan
```

The container mounts this directory to `/data`. Inside the container, paths are `/data/Inbound`, `/data/Keeping`, `/data/Recycle Bin`. The user configures these in the Dashboard UI exactly as in dev.

---

## Code Changes

### `lib/db.ts`

Change the DB path to respect a `DATA_DIR` environment variable:

```ts
const DB_PATH = path.join(process.env.DATA_DIR ?? process.cwd(), 'cache.db');
```

### `lib/config.ts`

Change the config path to respect `DATA_DIR`:

```ts
const CONFIG_PATH = path.join(process.env.DATA_DIR ?? process.cwd(), 'config.json');
```

When `DATA_DIR` is unset (dev mode on the host), behaviour is identical to today — both files resolve to `process.cwd()`.

### `next.config.ts`

Add `output: 'standalone'` to produce a self-contained `server.js` in `.next/standalone/`:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['image-hash', 'file-type', 'better-sqlite3', 'sharp'],
};
```

---

## Docker Files

### `Dockerfile`

Multi-stage build:

1. **Builder stage** (`node:22-bookworm-slim`) — installs build tools, runs `npm ci`, runs `next build`. Build tools (`python3`, `make`, `g++`) are needed to compile native modules (`sharp`, `better-sqlite3`, `heic-convert`) for Linux.
2. **Runner stage** (`node:22-bookworm-slim`) — copies only the standalone output and production node_modules from the builder. Does not include build tools or source.

```dockerfile
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Native module build dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

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

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

### `docker-compose.yml`

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

### `.dockerignore`

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

---

## Startup & First-Run

1. Create host folders if they don't exist:
   ```bash
   mkdir -p "/Users/rich/Data/pixel-magic/Inbound"
   mkdir -p "/Users/rich/Data/pixel-magic/Keeping"
   mkdir -p "/Users/rich/Data/pixel-magic/Recycle Bin"
   ```
2. `docker compose up --build` — builds image and starts container.
3. Open http://localhost:3000 → Dashboard → set inbound folder to `/data/Inbound`, output base to `/data` → Save.
4. `config.json` and `cache.db` appear in `/Users/rich/Data/pixel-magic/` on the host after first save/scan.

---

## Out of Scope

- HTTPS / reverse proxy setup
- Multi-user or authentication
- Automatic creation of `config.json` on container start (user sets paths via Dashboard)
