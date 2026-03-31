# NeedleLabQR Image Tracking Fixes — Design Spec

**Date:** 2026-03-31
**Approach:** Surgical Fix (Approach A)
**Scope:** 5 point fixes to existing `src/main.ts` + 1 CSS addition

## Context

NeedleLabQR is a WebXR AR image tracking experience using Needle Engine 4.15.0. A user points their phone camera at a printed silicon wafer marker and a 3D Clean Room building model spawns on top of it. The current implementation has the correct architecture but 5 bugs/deviations that prevent it from working correctly.

## Requirements

- **Marker:** `assets/marker.jpeg` (1887x1364px), printed at ~21x16 cm physical size
- **Model spawn area:** 21.59 x 27.94 cm (letter paper, 8.5" x 11")
- **Vertical placement:** Model base sits flat on the marker surface
- **Tracking loss:** Model persists at last known position; realigns when marker re-detected
- **Desktop:** Orbit rotation enabled (was previously disabled)
- **Debug overlay:** Kept as-is for development

## Identified Issues & Fixes

### Fix 1: Marker File Path (CRITICAL)

**Problem:** `src/main.ts` line 65 references `./assets/marker.png` but the actual file is `assets/marker.jpeg`. Image tracking silently fails with a 404.

**Fix:** Change the URL string from `./assets/marker.png` to `./assets/marker.jpeg`.

**File:** `src/main.ts` line 65

---

### Fix 2: Local DRACO Decoders

**Problem:** `src/main.ts` line 78 fetches DRACO decoders from `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`. This external CDN dependency can fail on mobile AR sessions with spotty network after initial page load.

**Fix:** Move the existing decoders from `include/draco/` to `public/draco/` (Vite's static asset root) so they are served correctly in both dev and production builds. Then update the decoder path:

```ts
dracoLoader.setDecoderPath("./draco/");
```

**File changes:**
- Move: `include/draco/draco_decoder.js` → `public/draco/draco_decoder.js`
- Move: `include/draco/draco_decoder.wasm` → `public/draco/draco_decoder.wasm`
- Move: `include/draco/draco_wasm_wrapper.js` → `public/draco/draco_wasm_wrapper.js`
- Update: `src/main.ts` line 78

**Why:** Vite has no `publicDir` override — it serves only `public/` as static root. The `include/` folder is not served, so `./include/draco/` 404s in production.

---

### Fix 3: Two-Axis Model Scaling

**Problem:** `src/main.ts` lines 99-101 scale using only `PAPER_SHORT / max(size.x, size.z)`. This only constrains one axis — the model could overflow the paper bounds on the other axis depending on its proportions.

**Fix:** Scale to fit within both letter paper dimensions:

```ts
const PAPER_W = 0.2159; // 8.5 inches
const PAPER_D = 0.2794; // 11 inches
const scaleFactor = Math.min(PAPER_W / size.x, PAPER_D / size.z);
```

This guarantees the model footprint stays within the paper rectangle regardless of aspect ratio.

**File:** `src/main.ts` lines 98-101

---

### Fix 4: Enable OrbitControls on Desktop

**Problem:** `src/main.ts` line 141 force-disables OrbitControls after camera framing. User now wants orbit rotation enabled.

**Fix:** Remove the `if (orbit) orbit.enabled = false;` line. Keep the camera framing logic (position + lookAt) so the initial viewpoint is good.

**File:** `src/main.ts` lines 140-141

---

### Fix 5: Canvas Opacity Flash Prevention

**Problem:** When the GLB loads, the model briefly appears at the origin before being positioned. This creates a visual "flash" that looks broken.

**Fix:** Three parts:

**HTML** (`index.html`): Add a simple loading overlay inside the body (before the script tag):

```html
<div id="loading-overlay" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:#fff;font-family:sans-serif;font-size:1rem;z-index:9999;">
  Loading…
</div>
```

**CSS** (`src/styles/index.css`): Start the needle-engine element invisible:

```css
needle-engine {
  opacity: 0;
  transition: opacity 0.4s ease;
}
```

**JS** (`src/main.ts`): After model is positioned and camera is framed, hide the overlay and reveal the engine:

```ts
const overlay = document.getElementById("loading-overlay");
const engine = document.getElementById("engine");
if (overlay) overlay.style.display = "none";
if (engine) (engine as HTMLElement).style.opacity = "1";
```

This goes immediately after `dbg("Ready!")`.

**Files:** `index.html`, `src/styles/index.css`, `src/main.ts`

---

## Files Modified

| File | Changes |
|------|---------|
| `src/main.ts` | Fixes 1, 2, 3, 4, 5 (marker path, DRACO path, scaling, orbit, canvas reveal) |
| `src/styles/index.css` | Fix 5 (needle-engine opacity rule) |
| `index.html` | Fix 5 (loading overlay div) |
| `public/draco/` | Fix 2 (DRACO decoders moved from `include/draco/`) |

## Architecture Preserved

The following correct patterns remain unchanged:

- `Context.DefaultWebGLRendererParameters.alpha = true` as first statement
- `GameObject.addComponent()` for all component instantiation
- `trackedContent` NOT added to scene (engine manages XR rig parenting)
- `innerGroup` pattern for scale/offset inside tracked content
- `WebXRImageTrackingModel` with `createObjectInstance: false`
- `hideWhenTrackingIsLost: false` for persistence + realignment
- `imageDoesNotMove: false` for table/paper markers
- `NeedleXRSession.onXRSessionStart/End` for desktop/AR visibility toggle
- `usePlacementReticle: false` and `autoPlace: false`

## Testing Protocol

1. `npm start` — verify desktop preview loads with orbit controls working
2. Verify no console errors (especially no 404 for marker or DRACO)
3. Verify canvas fades in smoothly (no flash)
4. Open on Android Chrome (with `chrome://flags/#webxr-incubations` enabled)
5. Print marker at ~21x16 cm, enter AR, point camera at marker
6. Verify: model spawns flat on marker surface within letter paper bounds
7. Move camera away from marker — model persists
8. Point camera back at marker — model realigns to tracked position
9. Test on iOS via Needle Go App Clip
