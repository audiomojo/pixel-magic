# Stock Tracker Visual Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Pixel Magic with the stock tracker's visual language — dark navy header, light blue-gray page background, white cards with subtle shadows, uppercase section labels, steel-blue accent.

**Architecture:** Pure visual reskin. Update CSS custom properties in `globals.css` to establish the new palette, update the `Nav` component for the dark header, then apply consistent typography and shadow patterns to each dashboard component. No behavioral changes.

**Tech Stack:** Next.js 15, Tailwind CSS v4, shadcn/ui, TypeScript

---

## Files Changed

| File | Change |
|---|---|
| `app/globals.css` | Add `--pm-*` palette vars, remap shadcn tokens, remove dark mode |
| `components/ui/card.tsx` | Replace `ring-1 ring-foreground/10` with `shadow-[0_1px_4px_rgba(0,0,0,0.08)]` |
| `components/Nav.tsx` | Dark navy header, white links, new active/hover states |
| `components/ConfigPanel.tsx` | Section label typography, border→shadow, remove dark classes |
| `components/ScanControl.tsx` | Border→shadow, remove dark variant classes |
| `components/ProgressPanel.tsx` | Section label typography, border→shadow, remove all dark variants |
| `app/review/page.tsx` | Card border→shadow, group title and count label typography |

---

## Task 1: Update global CSS palette

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace the full `:root` block and remove dark mode**

Open `app/globals.css`. Replace everything from `@custom-variant dark` through the end of the `.dark { ... }` block with the following. Keep the `@import` lines, `@theme inline` block, `@layer base` block, and `@keyframes slide` block untouched.

Remove this line:
```css
@custom-variant dark (&:is(.dark *));
```

Replace the entire `:root { ... }` block with:
```css
:root {
  /* ── Pixel Magic palette ── */
  --pm-navy:          #1a2b4a;
  --pm-blue-accent:   #4e79a7;
  --pm-bg:            #f0f2f5;
  --pm-card:          #ffffff;
  --pm-border:        #c8d4e8;
  --pm-muted-label:   #999999;
  --pm-gain:          #2e7d32;
  --pm-loss:          #c62828;

  /* ── shadcn token mappings ── */
  --background:             #f0f2f5;
  --foreground:             #1a2b4a;
  --card:                   #ffffff;
  --card-foreground:        #1a2b4a;
  --popover:                #ffffff;
  --popover-foreground:     #1a2b4a;
  --primary:                #1a2b4a;
  --primary-foreground:     #ffffff;
  --secondary:              #f0f4f8;
  --secondary-foreground:   #1a2b4a;
  --muted:                  #f0f4f8;
  --muted-foreground:       #888888;
  --accent:                 #f0f4f8;
  --accent-foreground:      #1a2b4a;
  --destructive:            #c62828;
  --border:                 #c8d4e8;
  --input:                  #c8d4e8;
  --ring:                   #4e79a7;
  --chart-1:                #4e79a7;
  --chart-2:                #2e7d32;
  --chart-3:                #c62828;
  --chart-4:                #ca8a04;
  --chart-5:                #7c3aed;
  --radius:                 0.5rem;
  --sidebar:                #f0f4f8;
  --sidebar-foreground:     #1a2b4a;
  --sidebar-primary:        #1a2b4a;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent:         #e8edf5;
  --sidebar-accent-foreground: #1a2b4a;
  --sidebar-border:         #c8d4e8;
  --sidebar-ring:           #4e79a7;
}
```

Delete the entire `.dark { ... }` block.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: remap CSS palette to stock tracker theme, remove dark mode"
```

---

## Task 2: Update Card component shadow

**Files:**
- Modify: `components/ui/card.tsx`

- [ ] **Step 1: Replace ring with shadow in the Card className**

In `components/ui/card.tsx`, the `Card` function's `className` prop contains `ring-1 ring-foreground/10`. Replace it with `shadow-[0_1px_4px_rgba(0,0,0,0.08)]`.

The full updated className string (the `cn(...)` call inside `Card`):
```tsx
className={cn(
  "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground shadow-[0_1px_4px_rgba(0,0,0,0.08)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
  className
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/card.tsx
git commit -m "style: replace card ring outline with subtle box shadow"
```

---

## Task 3: Update Nav to dark navy header

**Files:**
- Modify: `components/Nav.tsx`

- [ ] **Step 1: Rewrite the Nav JSX**

Replace the entire `return (...)` block in `components/Nav.tsx` with:

```tsx
  return (
    <nav className="sticky top-0 z-10 bg-[#1a2b4a]">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <span className="text-sm font-bold text-white">Pixel Magic</span>
        <div className="flex items-center gap-1">
          {links.map(({ href, label, badge }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-white/[0.18] font-semibold text-white'
                    : 'font-medium text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                {label}
                {badge != null && (
                  <span className="rounded-full bg-[#4e79a7] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/Nav.tsx
git commit -m "style: apply dark navy header to Nav component"
```

---

## Task 4: Update ConfigPanel typography and shadow

**Files:**
- Modify: `components/ConfigPanel.tsx`

- [ ] **Step 1: Update the scanning state div**

Find the scanning state return (when `scanning` is true):
```tsx
      <div className="rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
```

Replace with:
```tsx
      <div className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
```

- [ ] **Step 2: Update the main card container**

Find the main card container:
```tsx
    <div className="rounded-xl border bg-card p-4 text-sm">
```

Replace with:
```tsx
    <div className="rounded-xl bg-card p-4 text-sm shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
```

- [ ] **Step 3: Update the section heading**

Find:
```tsx
      <p className="mb-3 font-medium">Configuration</p>
```

Replace with:
```tsx
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[#999]">Configuration</p>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/ConfigPanel.tsx
git commit -m "style: apply section label typography and shadow to ConfigPanel"
```

---

## Task 5: Update ScanControl shadow and remove dark classes

**Files:**
- Modify: `components/ScanControl.tsx`

- [ ] **Step 1: Update STATUS_CONFIG to remove dark mode variants**

Replace the entire `STATUS_CONFIG` constant:
```tsx
const STATUS_CONFIG: Record<ScanStatus, { label: string; className: string }> = {
  idle:     { label: '● Idle',       className: 'bg-green-50 text-green-700 border-green-200' },
  running:  { label: '⟳ Scanning',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  complete: { label: '✓ Complete',   className: 'bg-green-50 text-green-700 border-green-200' },
  error:    { label: '✕ Error',      className: 'bg-red-50 text-red-700 border-red-200' },
};
```

- [ ] **Step 2: Update the card container**

Find:
```tsx
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
```

Replace with:
```tsx
    <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ScanControl.tsx
git commit -m "style: apply shadow, remove dark variants from ScanControl"
```

---

## Task 6: Update ProgressPanel — section labels, shadow, remove dark variants

**Files:**
- Modify: `components/ProgressPanel.tsx`

- [ ] **Step 1: Update StatTile color props throughout — remove dark variants**

Find all `StatTile` usages and remove the `dark:` suffixes from color props. There are two places (running state and complete state).

Running state grid (near bottom of file):
```tsx
        <StatTile value={counters.totalScanned} label="Scanned"    color="text-primary" />
        <StatTile value={counters.groupCount}   label="Groups"     color="text-green-600" />
        <StatTile value={counters.singletons}   label="Singletons" color="text-orange-600" />
        <StatTile value={counters.errors}       label="Errors"     color="text-red-600" />
```

Complete state grid:
```tsx
          <StatTile value={finalStats.totalScanned} label="Scanned"    color="text-primary" />
          <StatTile value={finalStats.groupCount}   label="Groups"     color="text-green-600" />
          <StatTile value={finalStats.singletons}   label="Singletons" color="text-orange-600" />
          <StatTile value={finalStats.errors}       label="Errors"     color="text-red-600" />
          {(finalStats.scored ?? 0) > 0 && (
            <StatTile value={finalStats.scored ?? 0} label="Scored" color="text-purple-600" />
          )}
```

- [ ] **Step 2: Update the idle state container — remove dark variants**

Find:
```tsx
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950">
        <p className="mb-2 text-sm font-medium text-indigo-800 dark:text-indigo-300">{summary}</p>
```

Replace with:
```tsx
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <p className="mb-2 text-sm font-medium text-indigo-800">{summary}</p>
```

- [ ] **Step 3: Update the error state container — remove dark variants**

Find:
```tsx
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
```

Replace with:
```tsx
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
```

- [ ] **Step 4: Update the complete state card — shadow and section label**

Find:
```tsx
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Scan complete</p>
```

Replace with:
```tsx
      <div className="rounded-xl bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[#999]">Scan complete</p>
```

- [ ] **Step 5: Update the running state card — shadow and section label**

Find:
```tsx
      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Progress</p>
```

Replace with:
```tsx
      <div className="rounded-xl bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-[#999]">Progress</p>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/ProgressPanel.tsx
git commit -m "style: section labels, shadow, remove dark variants from ProgressPanel"
```

---

## Task 7: Update Review Queue page typography and shadow

**Files:**
- Modify: `app/review/page.tsx`

- [ ] **Step 1: Update the group card container**

Find:
```tsx
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
```

Replace with:
```tsx
            className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
```

- [ ] **Step 2: Update the group title typography**

Find:
```tsx
              <p className="text-sm font-medium">Group {idx + 1}</p>
```

Replace with:
```tsx
              <p className="text-sm font-semibold text-[#1a2b4a]">Group {idx + 1}</p>
```

- [ ] **Step 3: Update the image count typography**

Find:
```tsx
              <p className="text-xs text-muted-foreground">
                {group.imageCount} image{group.imageCount !== 1 ? 's' : ''}
              </p>
```

Replace with:
```tsx
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#999]">
                {group.imageCount} image{group.imageCount !== 1 ? 's' : ''}
              </p>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/review/page.tsx
git commit -m "style: card shadow and label typography on review queue page"
```

---

## Task 8: Visual verification

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/rich/Data/Source-Code/pixel-magic && npm run dev
```

Open `http://localhost:3000` in a browser.

- [ ] **Step 2: Verify Dashboard page**

Check:
- Nav is dark navy (`#1a2b4a`) full-width, 56px tall, white text
- "Pixel Magic" title is white, no emoji
- Active nav link has a semi-transparent white background (not an underline)
- Page background is light blue-gray (`#f0f2f5`), not white
- ConfigPanel, ScanControl, ProgressPanel cards are white with a soft shadow and no border
- "Configuration" heading is uppercase, small, gray, letter-spaced

- [ ] **Step 3: Verify Review Queue page**

Navigate to `/review`. Check:
- Group cards have shadow, no border
- "Group 1" title is dark navy and semi-bold
- Image count ("4 images") is uppercase, small, and gray

- [ ] **Step 4: Final commit if any fixups were needed**

If you made visual fixup edits in steps 2–3, commit them now:
```bash
git add -p
git commit -m "style: visual fixups after browser review"
```
