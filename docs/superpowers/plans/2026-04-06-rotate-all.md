# Rotate All (CCW) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single "Rotate CCW ↺" button to the group review UI that rotates all images 90° counter-clockwise for preview, then bakes the rotation into kept files on submit using sharp.

**Architecture:** Rotation angle is tracked in React state (0 | 90 | 180 | 270, stored as clockwise degrees for sharp compatibility). CSS `transform: rotate()` provides instant preview. On submit, the angle travels in the POST body; the server uses sharp to rotate-and-write kept files as JPEG before unlinking the source, falling back to `fs.rename` when rotation is 0.

**Tech Stack:** Next.js (App Router), React, sharp, TypeScript, Vitest

---

## File Map

| File | Change |
|---|---|
| `types/index.ts` | Add `rotation?: 0 \| 90 \| 180 \| 270` to `GroupResolution` |
| `app/api/groups/[id]/route.ts` | Import sharp; `let dest`; rotation branch in keep loop |
| `app/review/[groupId]/page.tsx` | `rotation` state, `rotateCCW()`, button, CSS transforms, pass rotation in submit |
| `tests/e2e/api-workflow.test.ts` | Add `rotation: 0` to existing POST test; add new rotation: 270 test |

---

### Task 1: Extend GroupResolution type

**Files:**
- Modify: `types/index.ts:31-34`

- [ ] **Step 1: Add the rotation field**

Open `types/index.ts` and replace:

```ts
export type GroupResolution = {
  keepPaths: string[];    // These go to Outbound - Keeping/YYYY/MM/
  recyclePaths: string[]; // These go to Outbound - Recycle Bin/
};
```

with:

```ts
export type GroupResolution = {
  keepPaths: string[];    // These go to Outbound - Keeping/YYYY/MM/
  recyclePaths: string[]; // These go to Outbound - Recycle Bin/
  rotation?: 0 | 90 | 180 | 270; // clockwise degrees for sharp; omitted = no rotation
};
```

- [ ] **Step 2: Confirm no type errors**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add rotation field to GroupResolution type"
```

---

### Task 2: Write failing tests for the rotation path

**Files:**
- Modify: `tests/e2e/api-workflow.test.ts`

- [ ] **Step 1: Add `rotation: 0` to the existing POST test and add a rotation: 270 test**

In `tests/e2e/api-workflow.test.ts`, find the describe block `'POST /api/groups/:id — group resolution'`. Make two changes:

**2a.** In the existing `'keeps the first image and recycles the rest'` test, add `rotation: 0` to the request body (line ~155):

```ts
body: JSON.stringify({ keepPaths: [keptPath], recyclePaths, rotation: 0 }),
```

**2b.** After the `'returns 400 when resolution does not account for all group images'` test, add a new test (still inside the same describe block):

```ts
it('rotation: 270 keeps file as .jpg in Keeping/', async () => {
  // Find a group that still has pending members
  const groups = getAllGroups();
  const pendingGroup = groups.find((g) => {
    const members = getByGroupId(g.id);
    return members.some((m) => m.status === 'pending') && members.length >= 2;
  });
  if (!pendingGroup) {
    console.warn('  No pending group available for rotation test — skipping');
    return;
  }

  const members = getByGroupId(pendingGroup.id).filter((m) => m.status === 'pending');
  const keptMember = members[0];
  const recyclePaths = members.slice(1).map((m) => m.filePath);

  const req = makeRequest(`http://localhost/api/groups/${pendingGroup.id}`, {
    method: 'POST',
    body: JSON.stringify({
      keepPaths: [keptMember.filePath],
      recyclePaths,
      rotation: 270,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  const res = await resolveGroup(req, {
    params: Promise.resolve({ id: String(pendingGroup.id) }),
  });
  expect(res.status).toBe(200);

  // The kept file should now exist in Keeping/ with a .jpg extension
  const keepingDir = path.join(outboundBase, 'Keeping');
  const files = await walkDir(keepingDir);
  const jpgFiles = files.filter((f) => f.endsWith('.jpg'));
  expect(jpgFiles.length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Run the tests and confirm the new test fails**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx vitest run tests/e2e/api-workflow.test.ts 2>&1 | tail -30
```

Expected: the new `rotation: 270` test fails (route doesn't handle rotation yet, so it renames as-is and the file keeps its original extension). The existing tests should still pass.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/e2e/api-workflow.test.ts
git commit -m "test: add rotation: 0 explicit + failing rotation: 270 e2e test"
```

---

### Task 3: Implement server-side rotation in the route handler

**Files:**
- Modify: `app/api/groups/[id]/route.ts`

- [ ] **Step 1: Add the sharp import and update the keep loop**

Open `app/api/groups/[id]/route.ts`. Make these changes:

**3a.** At the top, add the sharp import after the existing imports:

```ts
import sharp from 'sharp';
```

**3b.** In the `POST` handler, extract `rotation` from the body (around line 35):

```ts
const { keepPaths, recyclePaths, rotation } = body;
```

**3c.** Change the keep loop so `dest` is `let` (not `const`) and add the rotation branch. Replace the entire keep loop (currently lines ~62–70) with:

```ts
for (const filePath of keepPaths) {
  const record = members.find((m) => m.filePath === filePath);
  if (!record) continue;
  const filename = path.basename(filePath);
  let dest = getKeepingPath(config.outboundBase, record, filename);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  if (rotation && rotation !== 0) {
    const jpegDest = dest.replace(/\.[^.]+$/, '.jpg');
    await sharp(filePath).rotate(rotation).jpeg({ quality: 92 }).toFile(jpegDest);
    await fs.unlink(filePath);
    dest = jpegDest;
  } else {
    await fs.rename(filePath, dest);
  }

  if (record.id !== undefined) updateStatus(record.id, 'kept');
}
```

The full updated `POST` handler should look like this:

```ts
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const groupId = parseInt(id, 10);
    const body = (await req.json()) as GroupResolution;
    const { keepPaths, recyclePaths, rotation } = body;

    const members = getByGroupId(groupId);
    const memberPaths = new Set(members.map((m) => m.filePath));

    // Validate all paths accounted for
    const allProvided = new Set([...keepPaths, ...recyclePaths]);
    for (const p of memberPaths) {
      if (!allProvided.has(p)) {
        return NextResponse.json(
          { error: `Image not accounted for in resolution: ${p}` },
          { status: 400 }
        );
      }
    }
    for (const p of allProvided) {
      if (!memberPaths.has(p)) {
        return NextResponse.json(
          { error: `Path not in group: ${p}` },
          { status: 400 }
        );
      }
    }

    const config = readConfig();

    for (const filePath of keepPaths) {
      const record = members.find((m) => m.filePath === filePath);
      if (!record) continue;
      const filename = path.basename(filePath);
      let dest = getKeepingPath(config.outboundBase, record, filename);
      await fs.mkdir(path.dirname(dest), { recursive: true });

      if (rotation && rotation !== 0) {
        const jpegDest = dest.replace(/\.[^.]+$/, '.jpg');
        await sharp(filePath).rotate(rotation).jpeg({ quality: 92 }).toFile(jpegDest);
        await fs.unlink(filePath);
        dest = jpegDest;
      } else {
        await fs.rename(filePath, dest);
      }

      if (record.id !== undefined) updateStatus(record.id, 'kept');
    }

    for (const filePath of recyclePaths) {
      const record = members.find((m) => m.filePath === filePath);
      if (!record) continue;
      const filename = path.basename(filePath);
      const dest = getRecyclePath(config.outboundBase, filename);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(filePath, dest);
      if (record.id !== undefined) updateStatus(record.id, 'recycled');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Confirm no type errors**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Run the e2e tests — all should pass**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx vitest run tests/e2e/api-workflow.test.ts 2>&1 | tail -30
```

Expected: all tests pass including the new rotation: 270 test.

- [ ] **Step 4: Commit**

```bash
git add app/api/groups/[id]/route.ts
git commit -m "feat: apply sharp rotation to kept files on group resolution"
```

---

### Task 4: Add the Rotate CCW button and state to the review UI

**Files:**
- Modify: `app/review/[groupId]/page.tsx`

No automated test for the UI — verify manually by running the dev server.

- [ ] **Step 1: Add rotation state and rotateCCW function**

After the existing state declarations (around line 46), add:

```ts
const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);

function rotateCCW() {
  setRotation((prev) => (((prev + 270) % 360) as 0 | 90 | 180 | 270));
}
```

Also reset rotation when the group changes — add `setRotation(0)` inside the `.then(...)` callback in the `useEffect` that loads group data (around line 62):

```ts
.then(([detail, groups]: [{ group: ImageGroup; images: ImageRecord[] }, ImageGroup[]]) => {
  thumbRefs.current = [];
  setGroup(detail.group);
  setImages(detail.images);
  setAllGroups(groups);
  setKeptPaths([]);
  setFocusedIdx(0);
  setRotation(0);  // ← add this line
})
```

- [ ] **Step 2: Add the rotation badge helper**

After the `basename` function (around line 28), add:

```ts
function rotateBadge(rotation: number): string {
  if (rotation === 0) return '';
  const ccw = (360 - rotation) % 360;
  return `–${ccw}°`;
}
```

- [ ] **Step 3: Add the Rotate CCW button to the action bar**

In the action bar `<div>` (around line 182), add the button between "Keep All" and the Discard All dialog trigger:

```tsx
<Button
  size="sm"
  variant={rotation !== 0 ? 'default' : 'outline'}
  onClick={rotateCCW}
>
  ↺ Rotate CCW{rotation !== 0 && (
    <span className="ml-1 rounded bg-white/20 px-1 text-[10px]">
      {rotateBadge(rotation)}
    </span>
  )}
</Button>
```

- [ ] **Step 4: Apply CSS rotation to the large preview image**

Find the `<img>` in the large preview section (around line 230) and add the style prop:

```tsx
<img
  key={focusedImage.filePath}
  src={imageUrl(focusedImage.filePath)}
  alt={basename(focusedImage.filePath)}
  className="max-h-full max-w-full object-contain"
  style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
/>
```

- [ ] **Step 5: Apply CSS rotation to thumbnail images**

Find the thumbnail `<img>` (around line 290) and add the same style:

```tsx
<img
  src={imageUrl(img.filePath)}
  alt={basename(img.filePath)}
  className="h-full w-full object-cover"
  style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
/>
```

- [ ] **Step 6: Pass rotation in the submit call**

Update `handleSubmit` to pass `rotation` in the POST body. Change the `body: JSON.stringify(...)` line (around line 93):

```ts
body: JSON.stringify({ keepPaths, recyclePaths, rotation }),
```

`handleSubmit` also needs `rotation` in its dependency array. Since `rotation` is from component state and `handleSubmit` is wrapped in `useCallback`, add `rotation` to the dependency array (around line 111):

```ts
}, [allGroups, groupId, images, rotation, router]);
```

- [ ] **Step 7: Confirm no type errors**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 8: Smoke test in the browser**

```bash
cd "/Users/rich/Data/Source Code/pixel-magic" && npm run dev
```

Open a group in the review UI. Click "↺ Rotate CCW" — all images should rotate 90° CCW. Click again — 180°. Click again — 270°. Click again — back to 0° and button returns to outline style. Keep some images and submit — the kept files in the output folder should be JPEG rotated correctly.

- [ ] **Step 9: Commit**

```bash
git add app/review/[groupId]/page.tsx
git commit -m "feat: add Rotate CCW button to group review UI"
```
