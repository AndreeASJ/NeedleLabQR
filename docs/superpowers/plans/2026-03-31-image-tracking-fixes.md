# Image Tracking Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 bugs in `src/main.ts` that prevent AR image tracking from working correctly, plus a CSS/HTML flash fix.

**Architecture:** Surgical point fixes to the existing `onStart` callback architecture. No new files created, no refactoring. Each fix is independent and does not affect the others.

**Tech Stack:** Needle Engine 4.15.0, Three.js, Vite 4.x, TypeScript

---

## Chunk 1: Critical Fixes (Marker Path + DRACO)

### Task 1: Fix marker file path

**Files:**
- Modify: `src/main.ts:65`

The code references `./assets/marker.png` but the actual file on disk is `assets/marker.jpeg`. This causes a 404 and image tracking never registers a target — it silently does nothing.

- [ ] **Step 1: Open `src/main.ts` and locate the marker URL on line 65**

The line currently reads:
```ts
url: "./assets/marker.png",
```

- [ ] **Step 2: Change the URL to the correct filename**

```ts
url: "./assets/marker.jpeg",
```

- [ ] **Step 3: Verify the file exists (Vite serves from public/)**

Run:
```bash
ls "public/assets/marker.jpeg"
```
Expected: file listed with size ~475KB

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix: correct marker file path from .png to .jpeg"
```

---

### Task 2: Move DRACO decoders to public/ and update path

**Files:**
- Move: `include/draco/draco_decoder.js` → `public/draco/draco_decoder.js`
- Move: `include/draco/draco_decoder.wasm` → `public/draco/draco_decoder.wasm`
- Move: `include/draco/draco_wasm_wrapper.js` → `public/draco/draco_wasm_wrapper.js`
- Modify: `src/main.ts:78`

Vite serves only `public/` as static root. The `include/` folder is not served, so `./include/draco/` returns 404 in production. Moving decoders to `public/draco/` ensures they are served at `./draco/` in both dev and production.

- [ ] **Step 1: Verify `vite.config.js` has no custom `publicDir`**

```bash
cat vite.config.js
```
Confirm there is no `publicDir:` key. If one exists pointing elsewhere, update the DRACO target path accordingly. Expected: no `publicDir` setting (Vite defaults to `public/`).

- [ ] **Step 2: Check all files in `include/draco/` before moving**

```bash
ls include/draco/
```
Expected at minimum: `draco_decoder.js  draco_decoder.wasm  draco_wasm_wrapper.js`

If additional files exist (e.g. `draco_decoder_gltf.js`), move them all in the next step.

- [ ] **Step 3: Create `public/draco/` and move all decoder files**

```bash
mkdir -p public/draco
mv include/draco/* public/draco/
```

- [ ] **Step 4: Verify files are in place**

```bash
ls public/draco/
```
Expected: `draco_decoder.js  draco_decoder.wasm  draco_wasm_wrapper.js` (plus any extras from step 2)

- [ ] **Step 5: Update the decoder path in `src/main.ts` line 78**

Current:
```ts
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
```

Change to:
```ts
dracoLoader.setDecoderPath("./draco/");
```

- [ ] **Step 6: Start the dev server and verify no 404 for DRACO**

```bash
npm start
```

Open browser devtools → Network tab → filter by `draco`. All decoder files should return **200**. Also confirm the `.wasm` file has MIME type `application/wasm` (visible in the Response Headers tab) — a wrong MIME type causes silent failures in Chrome.

- [ ] **Step 7: Commit**

```bash
git add public/draco/ src/main.ts
git commit -m "fix: move DRACO decoders to public/ for correct Vite static serving"
```

---

## Chunk 2: Scaling + OrbitControls

### Task 3: Fix two-axis model scaling

**Files:**
- Modify: `src/main.ts:98-101`

Current code uses `PAPER_SHORT / Math.max(size.x, size.z)` — this only constrains the model on one axis. If the model is taller (in Z) than it is wide (in X), it can overflow the paper bounds. The fix uses `Math.min()` across both letter-paper dimensions so the model always fits within the full paper rectangle.

- [ ] **Step 1: Locate the scaling block in `src/main.ts` around lines 98-101**

Current code:
```ts
// ── Scale to fit letter paper ───────────────────────────────────────────
const PAPER_SHORT = 0.216; // 8.5" = 21.6cm
const maxDim = Math.max(size.x, size.z);
const scaleFactor = PAPER_SHORT / maxDim;
```

- [ ] **Step 2: Replace with two-axis scaling**

```ts
// ── Scale to fit letter paper (both axes) ──────────────────────────────
const PAPER_W = 0.2159; // 8.5" = 21.59cm
const PAPER_D = 0.2794; // 11"  = 27.94cm
const scaleFactor = Math.min(PAPER_W / size.x, PAPER_D / size.z);
```

- [ ] **Step 3: Verify the debug output makes sense**

After `npm start`, open the browser console. The `dbg("Scale: ...")` line will print the computed scale factor. The value should be a small decimal (e.g. `0.0003` to `0.01` range for a large building model). Confirm it is positive and non-zero.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix: scale model to fit both letter-paper axes using Math.min"
```

---

### Task 4: Re-enable OrbitControls on desktop

**Files:**
- Modify: `src/main.ts:140-141`

OrbitControls are currently force-disabled after camera framing. The user wants orbit rotation enabled on desktop.

- [ ] **Step 1: Locate the orbit disable block in `src/main.ts` around lines 140-141**

Current code (inside the camera framing block):
```ts
const orbit = GameObject.getComponent(cam as any, OrbitControls);
if (orbit) orbit.enabled = false;
```

- [ ] **Step 2: Remove the two orbit lines AND the unused import**

**In `src/main.ts` lines 140-141**, remove:
```ts
const orbit = GameObject.getComponent(cam as any, OrbitControls);
if (orbit) orbit.enabled = false;
```

After removal the camera block should end at:
```ts
cam.lookAt(0, size.y * 0.3, 0);
```

**Also in `src/main.ts` line 8**, remove `OrbitControls,` from the import destructure:
```ts
// Before
import {
  onStart,
  WebXR,
  GameObject,
  OrbitControls,
  WebXRImageTracking,
  WebXRImageTrackingModel,
  NeedleXRSession,
} from "@needle-tools/engine";

// After
import {
  onStart,
  WebXR,
  GameObject,
  WebXRImageTracking,
  WebXRImageTrackingModel,
  NeedleXRSession,
} from "@needle-tools/engine";
```

- [ ] **Step 3: Verify on desktop**

Run `npm start`, open in browser. Confirm the model renders and you can click-drag to orbit around it.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix: re-enable OrbitControls on desktop view"
```

---

## Chunk 3: Loading Flash Prevention

### Task 5: Add loading overlay and canvas reveal

**Files:**
- Modify: `index.html` (add loading overlay div)
- Modify: `src/styles/index.css` (start needle-engine invisible)
- Modify: `src/main.ts` (reveal engine after GLB load)

Without this, the model briefly renders at the world origin before the positioning code runs — creating a visible flash/jump that looks broken.

- [ ] **Step 1: Add loading overlay to `index.html`**

Inside `<body>`, before the `<script>` tag, add:

```html
<div id="loading-overlay" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:#fff;font-family:sans-serif;font-size:1rem;z-index:9999;">
  Loading…
</div>
```

The full body block should look like:
```html
<body>
  <div id="loading-overlay" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:#fff;font-family:sans-serif;font-size:1rem;z-index:9999;">
    Loading…
  </div>

  <needle-engine
    id="engine"
    environment-image="studio"
    background-color="#1a1a2e"
  ></needle-engine>

  <script type="module" src="/src/main.ts"></script>
</body>
```

- [ ] **Step 2: Add opacity to the existing `needle-engine` rule in `src/styles/index.css`**

The current rule at lines 25-29 is:
```css
needle-engine {
  display: block;
  width: 100%;
  height: 100%;
}
```

Add `opacity` and `transition` inside this existing rule (do NOT create a new rule):
```css
needle-engine {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.4s ease;
}
```

- [ ] **Step 3: Reveal engine after GLB is positioned in `src/main.ts`**

Locate the `dbg("Ready!")` line (currently line 144). Immediately after it, add:

```ts
dbg("Ready!");
// Reveal engine, hide loading overlay
const overlay = document.getElementById("loading-overlay");
const engine = document.getElementById("engine");
if (overlay) overlay.style.display = "none";
if (engine) (engine as HTMLElement).style.opacity = "1";
```

- [ ] **Step 4: Verify the loading sequence**

Run `npm start`. On page load you should see:
1. Dark blue `#1a1a2e` screen with "Loading…" text
2. After the GLB finishes loading: overlay disappears, 3D view fades in smoothly (0.4s)
3. No flash of model at wrong position

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles/index.css src/main.ts
git commit -m "fix: add loading overlay and fade-in to prevent model position flash"
```

---

## Final: End-to-End Verification

- [ ] **Run the dev server**

```bash
npm start
```

- [ ] **Desktop checks**
  - No console errors (no 404s for marker, DRACO files, or GLB)
  - "Loading…" overlay appears then fades out
  - 3D model renders correctly in isometric view
  - Orbit rotation works (click-drag rotates model)
  - Debug overlay is hidden on desktop

- [ ] **Mobile AR checks (Android Chrome)**
  1. Enable `chrome://flags/#webxr-incubations`
  2. Navigate to the local HTTPS URL (e.g. `https://192.168.x.x:3002`)
  3. Tap the AR button
  4. Point camera at printed marker (~21×16 cm physical size)
  5. Verify: model spawns flat on marker surface within letter-paper bounds
  6. Move camera away — model persists at last position
  7. Point camera back at marker — model realigns
  8. Debug overlay is visible in AR session

- [ ] **Build check**

```bash
npm run build:production
```

Expected: build succeeds, no chunk size warnings that indicate DRACO was bundled (it should be external in `public/draco/`).
