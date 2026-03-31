# Design Spec Review: Image Tracking Fixes

**Spec:** `docs/superpowers/specs/2026-03-31-image-tracking-fixes-design.md`
**Reviewer:** Senior Code Reviewer
**Date:** 2026-03-31
**Verdict:** APPROVED with 2 important issues and 3 suggestions

---

## Overall Assessment

The spec is well-structured, correctly identifies real bugs in `src/main.ts`, and proposes surgical fixes that preserve the existing architecture. The "Architecture Preserved" section demonstrates strong awareness of Needle Engine constraints. All five fixes are independently verifiable and non-conflicting.

---

## Fix-by-Fix Review

### Fix 1: Marker File Path — CORRECT

**Current code:** `url: "./assets/marker.png"`
**Actual file on disk:** `assets/marker.jpeg` (confirmed, no `.png` exists)
**Proposed:** Change to `"./assets/marker.jpeg"`

No issues. This is a straightforward 404 bug. The `widthInMeters: 0.21` matches the stated ~21cm print width.

### Fix 2: Local DRACO Decoders — CORRECT

**Current code:** CDN path `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`
**Proposed:** `"./include/draco/"`

Local files confirmed: `draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js` all present in `include/draco/`.

**[IMPORTANT] Vite static file serving:** The `include/` directory is outside the project root's `public/` folder. Vite serves static files from `public/` by default. The spec should verify that `include/draco/` is accessible at build time. Either:
- Move decoders to `public/draco/` and use `"./draco/"`, OR
- Add Vite `publicDir` config, OR
- Confirm that Needle Engine's Vite plugin already handles `include/` as a static directory

Without this, the fix could trade a CDN 404 for a local 404.

### Fix 3: Two-Axis Model Scaling — CORRECT

**Current code:** `PAPER_SHORT / Math.max(size.x, size.z)` — only constrains the larger axis
**Proposed:** `Math.min(PAPER_W / size.x, PAPER_D / size.z)` — constrains both axes

Mathematically sound. Uses `min()` to pick the tighter constraint, guaranteeing the model fits within the paper rectangle. The constant values (0.2159m = 8.5", 0.2794m = 11") are correct.

**[SUGGESTION] Division-by-zero guard:** If the GLB has zero extent on either axis (degenerate mesh), this will produce `Infinity`. Add:
```ts
const scaleFactor = (size.x > 0 && size.z > 0)
  ? Math.min(PAPER_W / size.x, PAPER_D / size.z)
  : 1;
```

### Fix 4: Enable OrbitControls on Desktop — CORRECT

**Current code:** `orbit.enabled = false` after camera framing
**Proposed:** `orbit.enabled = true` (or remove the line)

The spec correctly notes orbit is already disabled during AR via the session lifecycle handlers. Enabling it on desktop is safe.

**[SUGGESTION] Consider `orbit.target` update:** After setting `cam.lookAt()`, the OrbitControls target may not match. For smooth orbit behavior, explicitly set:
```ts
if (orbit) {
  orbit.enabled = true;
  // orbit.target may need updating to match lookAt point
}
```
This depends on whether Needle's OrbitControls auto-syncs target from camera — worth verifying during testing.

### Fix 5: Canvas Opacity Flash Prevention — CORRECT

**CSS:** Start canvas at `opacity: 0` with `transition: opacity 0.4s ease`
**JS:** Set `opacity = "1"` after model is positioned

**[IMPORTANT] Timing gap on slow networks:** The canvas reveal is tied to GLB load completion. If the GLB takes several seconds to load, the user sees a completely blank screen with no loading indicator. The spec should address this — either:
- Add a lightweight loading spinner/text that is visible while canvas is hidden
- OR reveal the canvas immediately and only hide the 3D content (not the entire canvas)

**[SUGGESTION] Selector specificity:** The CSS selector `needle-engine canvas` targets the canvas element. If `needle-engine` has not yet created its canvas when the stylesheet loads, this is fine (the rule will apply once the element exists). But confirm the canvas element name — it may be a `<canvas>` or a shadow DOM element depending on Needle Engine version.

---

## Cross-Fix Consistency Check

| Fix | Conflicts with other fixes? | Affects Architecture? |
|-----|----------------------------|-----------------------|
| 1 (marker path) | None | No |
| 2 (DRACO local) | None | No |
| 3 (scaling) | None — innerGroup pattern preserved | No |
| 4 (orbit) | None — AR lifecycle unchanged | No |
| 5 (canvas flash) | None | No |

All fixes are orthogonal. No conflicts detected.

---

## Missing Considerations

1. **Desktop model scaling:** Fix 3 changes the AR `scaleFactor` but the desktop clone is created before scaling is applied. The desktop model uses `desktopModel.position.set(-center.x, -bbox.min.y, -center.z)` with no scale — this is intentional (1:1 preview) but worth calling out explicitly in the spec so implementers don't accidentally apply the new scale to the desktop clone.

2. **No rollback plan:** The spec does not mention how to verify each fix independently or rollback if one causes issues. Given these are 5 independent changes, consider implementing and testing them one commit at a time.

---

## Files Verified

- `src/main.ts` — all 5 fix locations confirmed against current source
- `assets/marker.jpeg` — exists (485KB), no `.png` variant
- `include/draco/` — all 3 decoder files present
- `src/styles/index.css` — no existing canvas opacity rules (clean target)
- `vite.config.ts` — no `publicDir` override (relevant to Fix 2)
- `package.json` — Vite pinned to `<=4.3.9`, Needle Engine 4.15.0 confirmed

---

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Important | 2 (DRACO static serving, blank screen during load) |
| Suggestions | 3 (div-by-zero guard, orbit target, canvas selector) |

The spec is ready for implementation after addressing the two important items. The DRACO static file serving question is the highest priority — it could silently break the fix on production builds.
