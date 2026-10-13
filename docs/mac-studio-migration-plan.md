# Mac Studio Migration Plan

Written 2026-10-12. Moves the pixel-magic repo, its data, and its runtime dependencies from the MacBook Pro to the Mac Studio.

The plan assumes the Mac Studio uses the same username (`rich`) and the same paths. If either differs, see [If the username or paths differ](#if-the-username-or-paths-differ).

## Status

- [x] Source pushed to `https://github.com/audiomojo/pixel-magic.git` (`main` only)
- [x] Photo folders and runtime files added to `.gitignore`
- [x] MacBook worktrees removed (`.worktrees/` is empty)
- [ ] Non-git files copied to the Mac Studio
- [ ] Dependencies installed on the Mac Studio
- [ ] Clone, install, and verification on the Mac Studio

## What has to move

| Item | Size | In git? | How it moves |
|---|---|---|---|
| Source code (`main`) | 3.7 MB | Yes | `git clone` from GitHub |
| `test-photos/` (needed by `scripts/test-grouping.ts` and `scripts/test-scoring.ts`) | 5.5 GB | No (ignored) | Copy |
| `processing-inbound/` | 5.3 GB | No (ignored) | Copy, if the photos are still wanted |
| `AI Testing/` | 51 MB | No (ignored) | Copy |
| Docker data dir `/Users/rich/data/docker/pixel-magic` (`Inbound`, `Keeping`, `Recycle Bin`, `thumbs`, `cache.db`, `config.json`) | 92 MB | No | Copy; this is the live app state |
| `.claude/settings.local.json`, `.superpowers/` | small | No (ignored) | Copy |
| Claude memory `~/.claude/projects/-Users-rich-Data-Source-Code-pixel-magic/` | small | No | Copy |

Do not copy:

- `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `build.log`: rebuilt on the Studio.
- Repo-root `cache.db`, `cache.db-shm`, `cache.db-wal`: local dev cache, recreated on first run.
- Repo-root `config.json`: it points `inboundFolder` and `outboundBase` at temp folders under `/var/folders/...` that will not exist on the Studio. The app recreates it with defaults.

## Dependencies to install on the Mac Studio

1. **Xcode Command Line Tools** (`xcode-select --install`). Provides git, and the compiler `better-sqlite3` needs if no prebuilt binary matches the installed Node version.
2. **Node.js**. The MacBook runs v25.9.0 with npm 11.12.1; the Dockerfile builds on Node 22. Nothing in the repo pins a version. Node 22 matches Docker.
3. **Docker Desktop**. The app runs via `docker-compose.yml` on port 3010, with the data dir mounted at `/data`.
4. **Ollama**, running on the host. The container reaches it at `http://host.docker.internal:11434`.
5. **Ollama model**. The Docker data dir's `config.json` uses `qwen2.5vl:7b` (6 GB): `ollama pull qwen2.5vl:7b`. The code default in `lib/config.ts` is `llama3.2-vision:11b`, which is not installed on the MacBook either; pull it only if the default should work.
6. **Claude Code**, plus the superpowers plugin for the same setup.

npm dependencies come from `package-lock.json` via `npm ci`. Two of them are native modules compiled per machine: `better-sqlite3` and `sharp`.

## Steps

### On the MacBook Pro

1. Keep Docker stopped while copying, so `cache.db`, `cache.db-shm` and `cache.db-wal` in the Docker data dir are copied as a consistent set. The WAL file holds about 4 MB of changes not yet written into `cache.db`.
2. Copy the non-git items to the Studio at the same paths, over SSH or via an external drive:

   ```bash
   STUDIO=rich@<mac-studio-hostname>
   REPO=/Users/rich/Data/Source-Code/pixel-magic

   rsync -a --progress "$REPO/test-photos/"        "$STUDIO:$REPO/test-photos/"
   rsync -a --progress "$REPO/processing-inbound/" "$STUDIO:$REPO/processing-inbound/"
   rsync -a --progress "$REPO/AI Testing/"         "$STUDIO:$REPO/AI Testing/"
   rsync -a --progress "$REPO/.claude/"            "$STUDIO:$REPO/.claude/"
   rsync -a --progress "$REPO/.superpowers/"       "$STUDIO:$REPO/.superpowers/"
   rsync -a --progress /Users/rich/data/docker/pixel-magic/ \
     "$STUDIO:/Users/rich/data/docker/pixel-magic/"
   rsync -a --progress ~/.claude/projects/-Users-rich-Data-Source-Code-pixel-magic/ \
     "$STUDIO:.claude/projects/-Users-rich-Data-Source-Code-pixel-magic/"
   ```

   Run these after the clone in step 2 below, so the repo directory exists on the Studio.

### On the Mac Studio

1. Install the dependencies listed above.
2. Clone the repo:

   ```bash
   git clone https://github.com/audiomojo/pixel-magic.git /Users/rich/Data/Source-Code/pixel-magic
   ```

3. Receive the copied folders (MacBook step 2).
4. Install npm dependencies, which rebuilds the native modules for this machine:

   ```bash
   npm ci
   ```

5. Verify the code:

   ```bash
   npx tsc --noEmit
   npm test
   npm run build
   ```

6. Start Ollama, then start the app:

   ```bash
   ollama list                      # confirm qwen2.5vl:7b is present
   docker compose up --build -d
   ```

   Open `http://localhost:3010`.
7. Run one scan with AI scoring enabled to confirm the container reaches Ollama.

Keep the MacBook copy untouched until steps 5–7 pass.

## If the username or paths differ

- **`docker-compose.yml`**: the volume is hardcoded to `/Users/rich/data/docker/pixel-magic`. Edit it to the new location.
- **Claude memory folder**: it is keyed to the project path (`-Users-rich-Data-Source-Code-pixel-magic`). Rename it to match the new path.
- **`.claude/settings.local.json`**: contains absolute paths in its permission rules. Update or drop them.

## Open items

- **Cached file paths**: not yet checked whether `cache.db` stores absolute image paths. If it does and paths change, the cache needs a rescan.
- **Feature branches**: `feature/ai-photo-scoring` and `feature/stock-tracker-theme` were deleted from GitHub on 2026-10-12 and now exist only on the MacBook, so a clone on the Studio will not include them. Their work appears to be on `main` already as re-created commits (matched by commit title and patch identity, not line by line). Push them again before retiring the MacBook if they should be kept.
- **Worktrees**: they do not transfer. Both MacBook worktrees (`ai-scoring`, `stock-tracker-theme`) were removed on 2026-10-12 after confirming neither held work missing from its branch.
