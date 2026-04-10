# Path Consolidation Design

**Date:** 2026-04-09  
**Status:** Approved

## Problem

The app currently has three separate path concerns spread across env vars and config:
- `DATA_DIR` env var → `config.json` + `cache.db`
- `config.inboundFolder` → where photos are scanned from
- `config.outboundBase` → parent of `Keeping/` and `Recycle Bin/`

This requires two Docker volume mounts, two path inputs in the UI, and scattered path logic.

## Goal

One `DATA_DIR` env var controls everything. Fixed subfolders are derived automatically. No path configuration in the UI.

## Directory Layout

```
$DATA_DIR/
  Inbound/          ← scan source (replaces inboundFolder)
  Keeping/          ← kept photos, organised as Keeping/YYYY/MM/
  Recycle Bin/      ← recycled photos
  config.json       ← app settings (unchanged)
  cache.db          ← sqlite database (unchanged)
```

## Architecture

### New module: `lib/paths.ts`

Reads `DATA_DIR` at module load time. Exports three string constants:

```ts
export const inboundDir: string   // $DATA_DIR/Inbound
export const keepingDir: string   // $DATA_DIR/Keeping
export const recycleBinDir: string // $DATA_DIR/Recycle Bin
```

Throws a clear error at startup if `DATA_DIR` is not set.

### `AppConfig` type (`types/index.ts`)

Remove `inboundFolder` and `outboundBase`. Remaining fields:
- `similarityThreshold`
- `supportedExtensions`
- `aiScoringEnabled`
- `ollamaBaseUrl`
- `ollamaModel`

### `lib/config.ts`

Remove the `inboundFolder` and `outboundBase` existence checks from `writeConfig`. No other changes.

### `lib/organizer.ts`

Remove the `outboundBase` parameter from `getKeepingPath` and `getRecyclePath`. Both functions import `keepingDir` and `recycleBinDir` directly from `lib/paths.ts`.

## Affected Files

| File | Change |
|------|--------|
| `lib/paths.ts` | **New** — derives all folder paths from DATA_DIR |
| `types/index.ts` | Remove `inboundFolder`, `outboundBase` from AppConfig |
| `lib/config.ts` | Remove path existence checks |
| `lib/organizer.ts` | Remove `outboundBase` param; import from paths |
| `lib/processor.ts` | `config.inboundFolder` → `inboundDir` |
| `lib/scanner.ts` | `config.inboundFolder` → `inboundDir` |
| `app/api/config/route.ts` | Remove path fields from defaults |
| `app/api/scan/route.ts` | Remove "configure folders first" guard |
| `app/api/images/route.ts` | `isAllowedPath` uses paths module constants |
| `app/api/groups/[id]/route.ts` | Update `getKeepingPath`/`getRecyclePath` call sites |
| `app/api/recycle/route.ts` | Use `recycleBinDir` from paths |
| `app/api/singletons/route.ts` | Update `getKeepingPath` call site |
| `components/ConfigPanel.tsx` | Remove inbound/outbound fields and state |
| `docker-compose.yml` | Single volume mount; remove duplicate |

## Docker

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

The old `/Users/rich/Data/pixel-magic:/data` inbound-only volume is removed. Photos go in `$DATA_DIR/Inbound` on the host.

## Migration Notes

- Existing `config.json` files will have stale `inboundFolder`/`outboundBase` keys — these are silently ignored after the change.
- Photos previously in `/Users/rich/Data/pixel-magic` should be moved to `/Users/rich/data/docker/pixel-magic/Inbound`.
- The `cache.db` at `/Users/rich/data/docker/pixel-magic/cache.db` (set up in the previous session) requires no migration.

## Tests

- `tests/e2e/config-first-run.test.ts` — remove assertions on `inboundFolder`/`outboundBase` from first-run defaults
- `tests/integration/processor.test.ts` — `makeConfig` helper no longer takes path params; set `DATA_DIR` env before tests
- `tests/e2e/api-workflow.test.ts` — set `DATA_DIR` env instead of passing `inboundFolder` in config POST
