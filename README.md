# Uncanny Garden

A browser-based WebAR experience in which five elemental entities (五行 / 오행) are summoned through hand gesture. No app, no markers -- only the camera, the hand, and the body's memory of gesture.

**Live:** [binyoun.github.io/uncanny-garden](https://binyoun.github.io/uncanny-garden)

---

## How It Works

1. Open the site on a mobile browser and allow camera access.
2. A gesture guide appears listing the five hand gestures.
3. Tap to enter the orb stage and tap any element orb to start AR.
4. Hold a gesture steady in view of the camera for 1.5 seconds.
5. A 3D model grows from your palm position and expands over ~60 seconds.
6. Drag to rotate and explore the grown model.
7. Show another gesture to summon a new element.

## Gesture Map

| Gesture | Element | Korean |
|---|---|---|
| Open palm | Wood | 목 (木) |
| Index finger up | Fire | 화 (火) |
| Closed fist | Earth | 토 (土) |
| Peace sign | Metal | 금 (金) |
| OK ring | Water | 수 (水) |

---

## Tech Stack

- **Rendering** -- Three.js 0.170.0 (WebGL, ACES filmic tone mapping, PMREM environment)
- **Hand tracking** -- MediaPipe Tasks Vision 0.10.18 (`HandLandmarker`, GPU delegate, VIDEO mode)
- **Gesture classification** -- Custom landmark-based classifier using finger extension and tip-distance heuristics
- **3D models** -- GLB format, meshopt-compressed with WebP textures (≤5MB each), loaded with `GLTFLoader` + `MeshoptDecoder`
- **Particle system** -- Custom double-helix `BufferGeometry` (120 particles, additive blending, element-colored glow)
- **Audio** -- `SoundEngine` (Tone.js) triggered on placement and full growth
- **Build** -- Vite 5.4
- **Deploy** -- GitHub Pages via `gh-pages`

---

## Project Structure

```
uncanny-garden/
├── index.html              # Landing (guide screen + orb stage)
├── src/
│   ├── main.js             # App entry, AR loop, HUD, event wiring
│   ├── HandTracker.js      # MediaPipe wrapper, gesture classifier, hold-confirm logic
│   ├── GrowTree.js         # GLB loader, placement, two-phase growth animation
│   ├── ParticleSystem.js   # Double-helix particle emitter
│   └── SoundEngine.js      # Audio trigger wrapper
├── public/
│   └── models/
│       ├── tree.glb        # Wood element
│       ├── fire.glb        # Fire element
│       ├── earth.glb       # Earth element
│       ├── metal.glb       # Metal element
│       └── water.glb       # Water element
└── vite.config.js
```

---

## Development

```bash
npm install
npm run dev      # HTTPS local server (required for camera access)
```

Camera access requires HTTPS. Vite is configured with `server: { https: true, host: true }` -- accept the self-signed certificate in your browser on first run.

### Deploying

```bash
npm run build
npx gh-pages -d dist
```

### Optimizing GLB models

Source models are typically 20--40MB. Compress before committing:

```bash
npx gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 1024
```

If `git push` fails on large binaries, increase the buffer:

```bash
git config http.postBuffer 524288000
```

---

## Five Elements Reference

The work is structured around 오행 (五行, Wu Xing) -- the classical East Asian system of five elemental phases: Wood (목), Fire (화), Earth (토), Metal (금), Water (수). Each element is associated with a direction, season, color, and body of correspondences. Here they are mapped to hand gesture and 3D form.

---

Bin Youn · 2026
