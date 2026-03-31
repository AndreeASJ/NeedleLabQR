import { Context } from "@needle-tools/engine";
Context.DefaultWebGLRendererParameters.alpha = true;

import {
  onStart,
  WebXR,
  GameObject,
  WebXRImageTracking,
  WebXRImageTrackingModel,
  NeedleXRSession,
} from "@needle-tools/engine";
import { Object3D, Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// ── On-screen debug (AR only — hidden on desktop via class) ─────────────────
const debugEl = document.createElement("div");
debugEl.id = "ar-debug";
debugEl.style.cssText = `
  position:fixed; bottom:10px; left:10px; right:10px; z-index:99999;
  background:rgba(0,0,0,0.85); color:#0f0; font:9px monospace;
  padding:6px; border-radius:6px; pointer-events:none; max-height:20vh; overflow:auto;
  display:none;
`;
document.body.appendChild(debugEl);
let msgCount = 0;
function dbg(msg: string) {
  msgCount++;
  console.log("[LabQR]", `[${msgCount}] ${msg}`);
  debugEl.textContent += `[${msgCount}] ${msg}\n`;
  debugEl.scrollTop = debugEl.scrollHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
onStart((context) => {
  const scene = context.scene;
  dbg("onStart fired");

  // ── 1. WebXR ──────────────────────────────────────────────────────────────
  const webxrObj = new Object3D();
  webxrObj.name = "WebXR";
  scene.add(webxrObj);
  const webxr = GameObject.addComponent(webxrObj, WebXR);
  webxr.createVRButton = false;
  webxr.createARButton = true;
  webxr.createSendToQuestButton = false;
  webxr.createQRCode = true;
  webxr.usePlacementReticle = false;
  webxr.usePlacementAdjustment = false;
  webxr.autoPlace = false;

  // ── 2. Tracked content — NOT added to scene, engine will parent to XR rig ─
  const trackedContent = new Object3D();
  trackedContent.name = "Tracked Content";
  // DO NOT scene.add(trackedContent) — let engine manage parenting to xr.rig

  // ── 3. Image Tracking ─────────────────────────────────────────────────────
  const trackerObj = new Object3D();
  trackerObj.name = "Image Tracking";
  scene.add(trackerObj);
  const imageTracking = GameObject.addComponent(trackerObj, WebXRImageTracking);

  const trackingModel = new WebXRImageTrackingModel({
    url: "./assets/marker.jpeg",
    widthInMeters: 0.21,
    object: trackedContent,
    createObjectInstance: false,
    imageDoesNotMove: false,
    hideWhenTrackingIsLost: false,
  });
  imageTracking.addImage(trackingModel, true);
  dbg("Image tracking configured");

  // ── 4. Load GLB ───────────────────────────────────────────────────────────
  dbg("Loading GLB...");
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("./draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  let desktopModel: Object3D | null = null;

  loader.load(
    "./assets/Clean_Room_Needle_mobile.glb",
    (gltf) => {
      const model = gltf.scene;
      dbg("GLB loaded: " + model.children.length + " children");

      // Measure
      const bbox = new Box3().setFromObject(model);
      const center = new Vector3();
      const size = new Vector3();
      bbox.getCenter(center);
      bbox.getSize(size);
      dbg("Size: " + size.x.toFixed(2) + "x" + size.y.toFixed(2) + "x" + size.z.toFixed(2) + "m");

      // ── Scale to fit letter paper (both axes) ──────────────────────────────
      const PAPER_W = 0.2159; // 8.5" = 21.59cm
      const PAPER_D = 0.2794; // 11"  = 27.94cm
      const scaleFactor = Math.min(PAPER_W / size.x, PAPER_D / size.z);
      dbg("Scale: " + scaleFactor.toFixed(6));

      // Desktop preview — clone FIRST before moving children
      desktopModel = model.clone(true);
      desktopModel.name = "Desktop_Preview";
      desktopModel.position.set(-center.x, -bbox.min.y, -center.z);
      scene.add(desktopModel);
      dbg("Desktop model added to scene");

      // AR miniature — use inner group so engine can freely set trackedContent transform
      // trackedContent: engine controls position/rotation (tracking pose)
      //   └─ innerGroup: WE control scale + centering offset
      //       └─ model children
      const innerGroup = new Object3D();
      innerGroup.name = "AR_Miniature";
      innerGroup.scale.setScalar(scaleFactor);
      innerGroup.position.set(
        -center.x * scaleFactor,
        -bbox.min.y * scaleFactor,
        -center.z * scaleFactor
      );
      for (const child of [...model.children]) {
        innerGroup.add(child);
      }
      trackedContent.add(innerGroup);
      dbg("AR miniature in TrackedContent→innerGroup, scale=" + scaleFactor.toFixed(6) + ", children=" + innerGroup.children.length);

      // If already in AR, hide desktop model
      if (context.renderer.xr?.getSession()) {
        desktopModel.visible = false;
      }

      // Frame camera
      const cam = context.mainCamera;
      if (cam) {
        const d = Math.max(size.x, size.z) * 0.9;
        cam.position.set(d, d * 0.55, -d);
        cam.lookAt(0, size.y * 0.3, 0);
      }

      dbg("Ready!");
      // Reveal engine, hide loading overlay
      const overlay = document.getElementById("loading-overlay");
      const engine = document.getElementById("engine");
      if (overlay) overlay.style.display = "none";
      if (engine) (engine as HTMLElement).style.opacity = "1";
    },
    (progress) => {
      if (progress.total > 0) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        if (pct % 25 === 0) dbg("Loading: " + pct + "%");
      }
    },
    (error) => {
      dbg("ERROR loading GLB: " + error);
      const overlay = document.getElementById("loading-overlay");
      const engine = document.getElementById("engine");
      if (overlay) overlay.style.display = "none";
      if (engine) (engine as HTMLElement).style.opacity = "1";
    }
  );

  // ── 5. AR session lifecycle ─────────────────────────────────────────────────
  NeedleXRSession.onXRSessionStart((_session: any) => {
    debugEl.style.display = "block"; // Show debug in AR
    dbg("─── XR SESSION START ───");
    try {
      const xrSession = context.renderer.xr.getSession();
      if (xrSession) {
        dbg("Features: " + JSON.stringify((xrSession as any).enabledFeatures));
      }
    } catch (e) { /* ignore */ }

    if (desktopModel) desktopModel.visible = false;
    dbg("TC children=" + trackedContent.children.length + " scale=" + trackedContent.scale.x.toFixed(4));
  });

  NeedleXRSession.onXRSessionEnd((_session: any) => {
    debugEl.style.display = "none"; // Hide debug on desktop
    dbg("─── XR SESSION END ───");
    if (desktopModel) desktopModel.visible = true;
  });
});
