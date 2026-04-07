# Design: Group-Wide Rotate All (CCW) in Review UI

**Date:** 2026-04-06  
**Status:** Approved

## Summary

Add a "Rotate CCW ↺" button to the group review action bar. One click rotates all images in the group 90° counter-clockwise. Rotation is CSS-only during review (instant, no disk writes). When the user submits, the server uses sharp to bake the rotation into the pixel data of kept files before moving them. Recycled files are moved as-is.

## UI

- A "↺ Rotate CCW" button is added to the action bar, between "Keep All" and "Discard All".
- Each click adds –90° (CCW). The angle cycles: 0° → 270° → 180° → 90° → 0°.
- While rotation ≠ 0°, the button is highlighted (blue) and shows the cumulative angle as a small badge (e.g. "–90°", "–180°").
- All preview images and thumbnails receive `style={{ transform: 'rotate(Xdeg)' }}` immediately — no network call.
- Navigation to the next group resets rotation to 0°.
- No per-image rotation — the button applies to the whole group only.

## State

A single `rotation` integer (0 | 90 | 180 | 270) is added to the review page's React state, initialized to 0.

```ts
const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);

function rotateCCW() {
  setRotation(prev => ((prev + 270) % 360) as 0 | 90 | 180 | 270);
}
```

CSS applied to each `<img>`:
```ts
style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}
```

Note: `rotation` stores the clockwise equivalent (what sharp expects). CCW 90° → 270° clockwise; CCW 180° → 180°; CCW 270° → 90°.

## API

`POST /api/groups/[id]` body gains one optional field:

```ts
type GroupResolution = {
  keepPaths: string[];
  recyclePaths: string[];
  rotation?: 0 | 90 | 180 | 270; // clockwise degrees for sharp; omitted = 0
};
```

`GroupResolution` in `types/index.ts` is updated to include the optional field.

## Server-Side Logic

In `app/api/groups/[id]/route.ts`, the keep loop checks `rotation`:

```ts
for (const filePath of keepPaths) {
  const record = members.find((m) => m.filePath === filePath);
  if (!record) continue;
  const filename = path.basename(filePath);
  const dest = getKeepingPath(config.outboundBase, record, filename);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  if (rotation && rotation !== 0) {
    // Read → rotate → write as JPEG to dest (normalises HEIC/TIFF/etc),
    // then delete source. Destination path uses .jpg extension.
    const jpegDest = dest.replace(/\.[^.]+$/, '.jpg');
    await sharp(filePath).rotate(rotation).jpeg({ quality: 92 }).toFile(jpegDest);
    await fs.unlink(filePath);
    dest = jpegDest; // used for status update below (informational only)
  } else {
    await fs.rename(filePath, dest);
  }

  if (record.id !== undefined) updateStatus(record.id, 'kept');
}
```

Recycled files continue to use `fs.rename` unchanged.

## Error Handling

- If sharp fails for a specific file, the route returns `500` with the filename in the error message.
- The source file is not deleted on failure (sharp writes to `dest` first; `unlink` only runs after success), so no data is lost.
- Cross-device moves (where `fs.rename` would fail) are not addressed here — that is an existing issue separate from this feature.

## Testing

- **Unit test** (new): `rotateCCW()` helper — verifies the click-count → degrees mapping (0→270→180→90→0).
- **E2E test** (update): The existing `POST /api/groups/[id]` test in `tests/e2e/api-workflow.test.ts` passes `rotation: 0` explicitly to confirm the field is accepted and the existing fast-path (`fs.rename`) is preserved.
- No new integration test for the sharp rotation path — sharp's own test coverage is sufficient, and the logic is a thin wrapper.

## Format Note

When rotation is applied, kept files are written as JPEG (quality 92) regardless of original format. HEIC, TIFF, PNG, etc. are all converted. Sharp cannot write HEIC natively, and this approach is consistent with how the app already displays images as JPEG. The destination filename's extension is changed to `.jpg`.

Files where rotation = 0 are moved with `fs.rename`, preserving their original format and extension unchanged.

## Out of Scope

- Per-image rotation
- Clockwise rotation button
- Applying rotation to recycled files
- Lossless JPEG rotation
