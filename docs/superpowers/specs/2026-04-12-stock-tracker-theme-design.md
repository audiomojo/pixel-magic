# Design Spec: Stock Tracker Visual Theme for Pixel Magic

**Date:** 2026-04-12  
**Approach:** Option B — CSS variables remap + targeted component typography tweaks  
**Scope:** Visual reskin only; no behavioral or functional changes  

---

## Summary

Apply the visual language of the stock-analysis app to Pixel Magic. The stock tracker's aesthetic is professional, data-dense, and immediately readable: dark navy header, light blue-gray page background, white cards with subtle shadows, uppercase section labels, and a steel-blue accent. Light mode only (dark mode support removed).

---

## Color Palette

Named CSS custom properties defined on `:root`, then mapped to shadcn tokens:

| Variable | Value | Usage |
|---|---|---|
| `--pm-navy` | `#1a2b4a` | Primary, nav background, headings, buttons |
| `--pm-blue-accent` | `#4e79a7` | Accent, focus rings, badges |
| `--pm-bg` | `#f0f2f5` | Page background |
| `--pm-card` | `#ffffff` | Card background |
| `--pm-border` | `#c8d4e8` | Input/card borders |
| `--pm-muted-label` | `#999999` | Uppercase section labels |
| `--pm-text-secondary` | `#555555` | Secondary body text |
| `--pm-gain` | `#2e7d32` | Positive / success values |
| `--pm-loss` | `#c62828` | Destructive / error values |

Shadcn token mappings (in `:root`):

- `--background` → `--pm-bg`
- `--foreground` → `#1a2b4a`
- `--primary` → `--pm-navy`
- `--primary-foreground` → `#ffffff`
- `--card` → `--pm-card`
- `--card-foreground` → `#1a2b4a`
- `--border` → `--pm-border`
- `--input` → `--pm-border`
- `--ring` → `--pm-blue-accent`
- `--accent` → `#f0f4f8`
- `--accent-foreground` → `#1a2b4a`
- `--muted` → `#f0f4f8`
- `--muted-foreground` → `#888888`
- `--destructive` → `--pm-loss`
- `--radius` → `0.5rem` (8px, down from 0.625rem)

Dark mode section (`.dark { ... }`) is removed entirely.

---

## Nav Component (`components/Nav.tsx`)

**Changes:**
- Background: `bg-[#1a2b4a]` (dark navy), replacing `bg-background`
- Remove `border-b`
- Height: `h-14` (56px), up from `h-11` (44px)
- Title: white text (`text-white`), remove emoji, font-weight 700
- Nav links: `text-white/70` by default, hover `text-white bg-white/10 rounded`
- Active link: `bg-white/[0.18] text-white font-semibold rounded` — replace current border-bottom indicator
- Badge: `bg-[#4e79a7]` instead of `bg-primary`
- Max-width: keep existing `max-w-2xl` to match page layout

---

## Global Styles (`app/globals.css`)

**Changes:**
- Remove `.dark { ... }` block entirely
- Remove `@custom-variant dark` line
- Update `:root` CSS custom properties per palette table above
- Add named `--pm-*` variables before the shadcn mappings
- Add global card shadow: cards use `box-shadow: 0 1px 4px rgba(0,0,0,0.08)` — applied in `components/ui/card.tsx` on the root `Card` div

---

## Component Typography (`ScanControl`, `ConfigPanel`, `ProgressPanel`)

Pattern applied consistently across all three:

- **Section headings** (e.g. "Configuration", "Scan Control", "Last Scan Results"):  
  `text-[11px] font-bold uppercase tracking-[0.06em] text-[#999]`  
  Replace current `text-sm font-semibold` style headings

- **Primary values / titles**: `text-[#1a2b4a] font-semibold`

- **Secondary / metadata text** (image count, timestamps, durations):  
  `text-[11px] uppercase tracking-[0.05em] text-[#999]`

- **Buttons (primary)**: Already use `bg-primary` which maps to navy — no direct changes needed if CSS vars are updated correctly

- **Outline buttons**: `border-[#d0d7de] text-[#555] hover:bg-[#f0f4f8]`

- **Input fields**: `border-[#c8d4e8] focus:border-[#4e79a7] focus:ring-[#4e79a7]/20`

---

## Review Queue Page (`app/review/page.tsx`)

- Group card border: remove `border` class, rely on shadow from card token
- Thumbnail container: `bg-[#e8edf5]` (light blue-gray placeholder)
- Group title: `text-[#1a2b4a] font-semibold`
- Image count: `text-[11px] uppercase tracking-[0.05em] text-[#999]`

---

## Files Changed

1. `app/globals.css` — palette variables, remove dark mode
2. `components/Nav.tsx` — navy header, new active/hover states
3. `components/ConfigPanel.tsx` — section label, input styling
4. `components/ScanControl.tsx` — section label, timestamp styling
5. `components/ProgressPanel.tsx` — section label, stat value styling, button styling
6. `app/review/page.tsx` — card shadow, label typography
7. `components/ui/card.tsx` — add box-shadow to card base styles

---

## Out of Scope

- `app/review/[groupId]/page.tsx` (group detail page) — not reskinned in this pass
- `app/stats/page.tsx` — not reskinned in this pass
- Behavioral changes of any kind
- Font family change (Geist stays)

---

## Design Principles Applied

- All colors reference named `--pm-*` variables or shadcn tokens — no raw hex in component files
- Future components pick up the theme automatically via CSS custom properties
- Typography pattern (uppercase labels, letter-spacing, tight sizes) is applied consistently but not extracted into a shared utility — three uses don't warrant abstraction
