# Uncanny Garden

A browser-based WebAR experience in which five elemental entities (五行 / 오행) are summoned through hand gesture. No app, no markers -- only the camera, the hand, and the body's memory of gesture.

**Live:** [uncanny.live](https://uncanny.live)

---

## Experience Flow

1. Open the site on a mobile browser and allow camera access.
2. A landing screen shows an animated 3D hair model with direction text typed character by character.
3. After models load (minimum 10 seconds on the landing), AR mode begins automatically.
4. A gesture prompt appears for the first element (Wood). Hold the correct gesture steady for 1.5 seconds to confirm.
5. The model blooms at a cardinal AR position over ~36 seconds with slow organic rotation and growth.
6. One-finger drag rotates and lifts the model. Two-finger pinch moves it closer or further along the line of sight.
7. When growth completes the model recedes, leaving behind a dormant particle orb (3 drifting colored particles). Tap the orb to reactivate and re-grow that element while others continue.
8. After all five elements complete, a final stage activates: all five models orbit the viewer in a ring with the camera at the center.
9. In the final stage, drag to spin and tilt the ring; pinch to contract or expand it.

## Gesture Map

| Gesture | Element | Direction | Color |
|---|---|---|---|
| Open palm | Wood | East | Green |
| Index finger up | Fire | South | Red |
| Closed fist | Soil | Center | Yellow |
| Peace sign | Metal | West | Silver |
| OK ring | Water | North | Blue |

---

## Interaction Reference

### During element growth (AR mode)

| Input | Action |
|---|---|
| 1-finger drag | Rotate model (Y axis) and adjust height |
| 2-finger spread | Move model closer along camera ray |
| 2-finger pinch | Move model further along camera ray |
| Tap dormant orb | Reactivate and re-grow that element |

### Final orbit stage

| Input | Action |
|---|---|
| 1-finger drag horizontal | Spin the ring around Y axis |
| 1-finger drag vertical | Tilt the ring up/down (±26°) |
| 2-finger spread | Contract ring (models closer) |
| 2-finger pinch | Expand ring (models further) |

---

## Tech Stack

- **Rendering** -- Three.js 0.170.0 (WebGL, ACES filmic tone mapping, PMREM environment)
- **Hand tracking** -- MediaPipe Tasks Vision 0.10.18 (`HandLandmarker`, GPU delegate, VIDEO mode)
- **Gesture classification** -- Custom landmark-based classifier using finger extension and tip-distance heuristics; 1.5-second hold-confirm with palm-ring progress indicator
- **3D models** -- GLB format, meshopt-compressed with WebP textures (≤5 MB each), loaded with `GLTFLoader` + `MeshoptDecoder`
- **Particle system** -- Custom double-helix `BufferGeometry` (120 particles, additive blending, element-colored glow, dot size 0.11)
- **Dormant orbs** -- 3-particle swirling cluster per element using the same glow texture; transparent `SphereGeometry` hitbox for reliable tap raycasting
- **Audio** -- `SoundEngine` (Tone.js) triggered on placement and full growth
- **Fonts** -- Cinzel Decorative (title, gesture prompts), Josefin Sans (credits)
- **Build** -- Vite 5.4, `base: '/'` for custom domain
- **Deploy** -- GitHub Actions → GitHub Pages → custom domain `uncanny.live`

---

## Project Structure

```
uncanny-garden/
├── index.html              # Landing page, HUD, CSS, typing-effect script
├── src/
│   ├── main.js             # App entry, AR render loop, HUD, all event wiring
│   ├── HandTracker.js      # MediaPipe wrapper, gesture classifier, hold-confirm logic
│   ├── GrowTree.js         # GLB loader, phase state machine (seed→grow→recede→dormant)
│   ├── ParticleSystem.js   # Double-helix particle emitter (per element)
│   └── SoundEngine.js      # Audio trigger wrapper
├── public/
│   └── models/
│       ├── hair_1.glb      # Landing page model
│       ├── tree.glb        # Wood element
│       ├── fire.glb        # Fire element
│       ├── earth.glb       # Soil element
│       ├── metal.glb       # Metal element
│       └── water.glb       # Water element
├── .github/
│   └── workflows/
│       └── deploy.yml      # Build + deploy to GitHub Pages on push to main
└── vite.config.js
```

---

## GrowTree State Machine

Each placed element cycles through four phases:

```
seed (2 s hold) → grow (36 s bloom) → recede (2.5 s shrink) → dormant
                                                                    ↓
                                                          tap orb → seed
```

- **seed** -- tiny seed scale, waiting for grow timer
- **grow** -- scale interpolated seed→full with easeOutCubic, slow organic rotation
- **recede** -- scale shrinks back with easeInOutCubic
- **dormant** -- model hidden; 3-particle colored orb drifts at anchor position; transparent sphere hitbox enables tap raycasting

---

## Development

```bash
npm install
npm run dev      # HTTPS local server (required for camera + MediaPipe)
```

Camera and MediaPipe require HTTPS. Vite is configured with `server: { https: true, host: true }` -- accept the self-signed certificate on first run. Test on mobile by connecting to the LAN IP shown in the terminal.

### Deploying

Push to `main`. GitHub Actions runs `npm ci && npm run build` and deploys `dist/` to GitHub Pages automatically.

```bash
git push origin main
```

The custom domain `uncanny.live` requires `base: '/'` in `vite.config.js` (not the repo-name subdirectory path).

### Optimizing GLB models

Source models are typically 20--40 MB. Compress before committing:

```bash
npx gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 1024
```

If `git push` fails on large binaries:

```bash
git config http.postBuffer 524288000
```

---

## Five Elements Reference

The work is structured around 오행 (五行, Wu Xing) -- the classical East Asian system of five elemental phases: Wood (목), Fire (화), Soil (토), Metal (금), Water (수). Each element is associated with a cardinal direction, season, color, and body of correspondences, here mapped to hand gesture, 3D form, and spatial position in the AR field.

---

Randi Matushevitz · Bin Youn · Gustavo Guzmán · 2026
