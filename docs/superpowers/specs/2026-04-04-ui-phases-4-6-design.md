# UI Design Spec — Phases 4–6
**Date:** 2026-04-04  
**Scope:** Dashboard (Phase 4), Review UI (Phase 5), Stats Page (Phase 6)

---

## Decisions Made

| Decision | Choice |
|---|---|
| Navigation | Top nav |
| Color theme | Light zinc/slate (shadcn defaults, no dark mode) |
| Dashboard layout | Stacked (full-width sections) |

---

## App Shell

### Layout
- Top nav bar, full width, white background, `border-bottom` in slate-200
- Logo left: `✦ Pixel Magic` in `font-bold text-slate-900`
- Nav links right: Dashboard · Review Queue · Stats
- Review Queue link shows a red badge with pending group count (hidden when 0)
- Active link: `bg-slate-100 rounded-full` pill treatment
- Body: `min-h-screen bg-slate-50`
- Max content width: `max-w-5xl mx-auto px-6 py-8`

### Layout file changes needed
- Update `app/layout.tsx` to include the nav bar and Sonner `<Toaster />`
- Update `metadata` title to `"Pixel Magic"`

---

## Phase 4 — Dashboard (`app/page.tsx`)

### Structure (stacked, full-width sections)

**Section 1 — Configuration card**
- `<Card>` with header "Configuration"
- Two text inputs side by side (at `sm:` breakpoint, stacked on mobile):
  - Inbound folder path (full absolute path, type=text)
  - Output base folder path
- Similarity threshold: labeled slider `80–100`, default `90`, shows current value inline
- Supported extensions: row of `<Checkbox>` items (jpg, jpeg, png, webp, heic, tiff, gif, bmp)
- Save button → `POST /api/config` → success/error toast via Sonner

**Section 2 — Scan Control card**
- `<Card>` with header "Scan"
- Row: "Start Scan" `<Button>` + status `<Badge>` (Idle / Scanning / Grouping / Complete / Error)
- Button disables and shows spinner while scan is running
- Status badge colors: Idle=slate, Scanning=blue, Grouping=violet, Complete=green, Error=red
- Clicking Start Scan → `POST /api/scan` (202) → opens SSE connection to `/api/progress`

**Section 3 — Live Progress card**
- `<Card>` with header "Progress", hidden until scan is started (or has run before)
- Two progress phases shown sequentially:
  - **Hashing:** `<Progress>` bar + `current / total` counter + current filename (truncated)
  - **Grouping:** indeterminate spinner (O(n²) pass, no per-item count available)
- Running counters row: Scanned / Groups Found / Singletons / Errors — update on each SSE event
- On `complete` event:
  - Show final stat summary
  - Two buttons: "Go to Review →" (links to `/review`) and "Auto-keep Singletons" (→ `POST /api/singletons` → toast with count)

### Data flow
- On page mount: `GET /api/config` to populate form; `GET /api/stats` to show last scan info in Scan card
- SSE connection opened on scan start, closed on `complete` or `error` event
- All state is component-local (`useState` / `useRef`); no global state library needed

---

## Phase 5 — Review UI

### Group List Page (`app/review/page.tsx`)
- `GET /api/groups` on mount
- Each group renders as a `<Card>`:
  - Representative image thumbnail (via `/api/images?path=...`) left-aligned
  - Right: image count, group ID
  - "Review" button → navigates to `/review/[groupId]`
- "Auto-keep All Singletons" button at top → `POST /api/singletons` → toast + refetch
- Empty state when all groups reviewed: centered message + link back to Dashboard

### Group Review Page (`app/review/[groupId]/page.tsx`)

**Viewport split:**
- Large preview area: `min-h-[75vh]` — fills top portion
- Thumbnail strip: `min-h-[25vh]` — fixed to bottom of viewport, no page scroll

**Large preview area:**
- Displays currently focused image at `object-contain` filling available space
- Below image: filename, `W × H`, file size, DPI, date taken — in a single muted metadata row
- Default: first image in group on load

**Thumbnail strip:**
- `flex flex-row overflow-x-auto` — no wrapping, horizontal scroll only
- Each thumbnail: image fills full `25vh` height, `aspect-auto`, `object-cover`
- Checkbox overlay: top-left corner, 16×16px, toggles keep/discard state
- Clicking thumbnail body (not checkbox): updates large preview, does not change selection
- Checking checkbox: marks image as "keep"
- Visual state: keep=`ring-2 ring-green-600`, unselected=`ring-1 ring-slate-200`

**Action bar (above preview area):**
- Left: "← Back to Review Queue" link
- Center: "Group N of M" (derived from total group count from `/api/groups`)
- Right: "Keep All" button · "Discard All" button (opens `<Dialog>` for confirmation) · "Keep Selected & Continue →" primary button
- "Keep Selected & Continue" → `POST /api/groups/[id]` with `{ keepPaths, recyclePaths }` → on success navigate to next group (or back to list if last)

**Keyboard shortcuts:**
- `←` / `→`: move focus between thumbnails (updates large preview)
- `Space`: toggle keep/discard on focused thumbnail
- `Enter`: submit current selections and advance
- Shortcuts shown in a small `<kbd>`-styled hint row at bottom of thumbnail strip

**Image proxying:**
- All `<img>` src attributes use `/api/images?path=<encoded-path>` — never raw filesystem paths

---

## Phase 6 — Stats Page (`app/stats/page.tsx`)

### Layout
- `GET /api/stats` on mount
- Four summary cards in a `grid grid-cols-2 sm:grid-cols-4` row:
  1. Images Kept — count, green accent
  2. In Recycle Bin — count, red accent
  3. Groups Pending Review — count, amber accent
  4. Last Scan — relative time + duration + total files scanned
- Skeleton loaders while fetching

### Action cards (below summary row)
Two cards in a `grid grid-cols-2` row:

**Empty Recycle Bin card** (red-tinted border `border-red-200`):
- Description: "Permanently delete N files from disk. This cannot be undone."
- Button: "Delete N files permanently" (red variant)
- Clicking → opens `<Dialog>`: "This will permanently delete N files. This cannot be undone." → Confirm → `DELETE /api/recycle` → toast with count deleted → refetch stats

**Clear Cache & Rescan card** (neutral border):
- Description: "Wipe scan database and start fresh. Does not affect files in Keeping/ or Recycle Bin/."
- Button: "Clear cache.db" (outline variant)
- Clicking → opens `<Dialog>` for confirmation → calls `DELETE /api/stats` → toast → redirect to Dashboard
- `DELETE /api/stats` needs to be added to `app/api/stats/route.ts`: calls `db.clearAll()`, returns `{ cleared: true }`

### Error handling
- All API calls show error toasts via Sonner on failure
- Stats page shows a full-page error state if the initial fetch fails

---

## Shared Conventions

- **Toasts:** Sonner (`<Toaster />` in layout). Success = default, Error = `toast.error(...)`.
- **Loading states:** Skeleton components (`<Skeleton>` from shadcn or simple `animate-pulse` divs) on all data-fetching pages.
- **Empty states:** Each page has a clearly styled empty state (centered, muted text, action link).
- **No dark mode:** Light zinc/slate only. Remove `dark:` classes from layout.
- **Image proxy:** All images served via `/api/images?path=...`. Never expose raw paths in `<img src>`.
- **`next/navigation`:** Use `useRouter` and `useParams` for client-side navigation in review pages.

---

## Out of Scope

- Phase 7 (testing/hardening) and Phase 8 (Ollama AI) are not part of this spec.
- No mobile-first responsive layout — functional at 1280px+ per the plan.
- No authentication, no multi-user support.
