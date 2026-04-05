# Dashboard UI Design — Phase 4

**Date:** 2026-04-04
**Scope:** `app/page.tsx`, `app/layout.tsx`, and three new client components

---

## Overview

The dashboard is the entry point to Pixel Magic. It lets the user configure folders, start a scan, and watch live progress. It also surfaces a pending-work summary when groups are waiting for review.

---

## Layout & Navigation

**`app/layout.tsx`** gets a persistent top nav bar shared across all pages:

- Logo/name: "✨ Pixel Magic"
- Links: Dashboard · Review Queue · Stats
- Active link is underlined in indigo
- Review Queue shows a badge with the count of pending groups (fetched from `GET /api/stats` on load)

The nav is a thin horizontal bar; the page content is a single centred column (max-width ~600px).

---

## Component Structure

`app/page.tsx` is a Client Component that owns all shared state and passes data down to three child components:

```
app/page.tsx                  ← state owner, SSE manager
  ├── components/ConfigPanel   ← config form
  ├── components/ScanControl   ← start button + status badge
  └── components/ProgressPanel ← progress/complete/pending-work display
```

No external state library. No React context. The SSE `EventSource` is opened in a `useEffect` when the scan starts and closed on `complete`/`error`.

---

## ConfigPanel

**File:** `components/ConfigPanel.tsx`

Fields:
- **Inbound folder** — text input, monospace, full-width. User pastes an absolute path.
- **Output base folder** — text input, monospace, full-width.
- **Similarity threshold** — range slider 80–100, labelled "90%". Step 1.
- **File extensions** — pill toggles (one per extension). Active = indigo filled, inactive = grey outline. Default active: jpg, jpeg, png, heic, webp.

Save button (bottom-right). On save, `POST /api/config`. Shows a success toast on save, error toast if the API returns 400 (folder not found).

Config loads from `GET /api/config` on mount.

**While scanning:** ConfigPanel renders as a single collapsed summary line (dim/muted): `"<inboundFolder> → <outboundBase> · <threshold>% threshold"`. This prevents edits mid-scan and reduces visual noise.

---

## ScanControl

**File:** `components/ScanControl.tsx`

Contains:
- **Start Scan button** — `POST /api/scan` on click, disabled while `scanStatus === 'running'`
- **Status badge** — pill badge, one of:
  - `● Idle` — green
  - `⟳ Scanning` — amber
  - `✓ Complete` — green
  - `✕ Error` — red
- **Last scan timestamp** — right-aligned, dim text: `"Finished in 4m 12s"` or `"Last scan: never"`

---

## ProgressPanel

**File:** `components/ProgressPanel.tsx`

Renders differently based on `scanStatus`:

### Idle (no prior scan)
Empty — nothing shown. The pending-work card (see below) is shown instead if prior scan data exists.

### Scanning — Hashing phase
Shows when `progressEvent.phase === 'hashing'`:
- **Hashing** section: label + `current / total` counter + deterministic progress bar + current filename (monospace, truncated, full path)
- **Grouping** section: label + flat grey bar + "waiting" label (dimmed)
- **Counters row**: 4 stat tiles — Scanned · Groups · Singletons · Errors (live-updating)

### Scanning — Grouping phase
Shows when `progressEvent.phase === 'grouping'`:
- **Hashing** section: full progress bar (complete), dimmed
- **Grouping** section: indeterminate animated bar + "Grouping…" label
- Counters continue to show hashing totals

### Complete
Shows when `scanStatus === 'complete'`:
- Title: "Scan complete"
- Counters row (final values)
- Two action buttons: **"Go to Review →"** (indigo filled) · **"Auto-keep Singletons (N)"** (indigo outline)
- Auto-keep triggers `POST /api/singletons` then navigates to `/review`

### Pending-work card (idle, prior scan exists)
Shown in place of the empty idle state when `GET /api/stats` returns `pendingGroupCount > 0` or `singletonCount > 0`:
- Indigo-tinted card: `"N groups waiting for review · M singletons"`
- Buttons: **"Go to Review →"** · **"Auto-keep Singletons"**

---

## Data Flow

```
mount → GET /api/config     → populate ConfigPanel
mount → GET /api/stats      → show pending-work card if needed + nav badge

[user clicks Start Scan]
  → POST /api/scan           → sets scanStatus = 'running'
  → new EventSource('/api/progress')
      on message → update progressEvent + live counters
      on 'complete' → set scanStatus = 'complete', close EventSource
      on 'error'    → set scanStatus = 'error', close EventSource

[user clicks Save in ConfigPanel]
  → POST /api/config         → toast success/error

[user clicks Auto-keep Singletons]
  → POST /api/singletons     → navigate to /review
```

---

## Error Handling

- `POST /api/scan` returns 409 if already running → show toast "Scan already in progress"
- `POST /api/scan` returns 400 if config incomplete → show toast "Set inbound and output folders first"
- `POST /api/config` returns 400 → show toast with the server error message
- SSE `error` event → set status badge to Error, show toast

---

## Files to Create / Modify

| File | Action |
|---|---|
| `app/layout.tsx` | Add persistent nav with badge |
| `app/page.tsx` | Replace scaffold with dashboard Client Component |
| `components/ConfigPanel.tsx` | New |
| `components/ScanControl.tsx` | New |
| `components/ProgressPanel.tsx` | New |

All components use existing shadcn/ui primitives: `Button`, `Badge`, `Progress`, `Card`, `Separator`, `Checkbox` (for extension toggles), and `Sonner` for toasts.
