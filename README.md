# Uncanny Garden

A browser-based WebAR experience in which five elemental entities (五行 / 오행) are summoned through hand gesture. No app, no markers -- only the camera, the hand, and the body's memory of gesture.

**Live:** [uncanny.live](https://uncanny.live)

> Uncanny Garden is a collaborative augmented reality experience inspired by Randi Matushevitz's Flowergirl and Limelight (2026). Participants summon five "Flowergirls" through hand gestures rooted in elemental cosmology to evoke their florescence. A mediated ritual exploring fertility, transformation, and the self, it invokes lush and electronic sonorities to complement the uncanniness.

---

## Experience Flow

1. Open the site on a mobile browser and allow camera access.
2. A preload screen appears instantly, before any model finishes loading -- "Sound On" plus a content warning (sudden and high-pitched sounds), and a "Tap to Begin" prompt, so the wait for assets doubles as an intentional beat rather than a blank stall.
3. Tapping "Tap to Begin" unlocks audio (iOS requires a user gesture), plays a dedicated intro cue, requests the camera, and starts the landing screen: an animated 3D hair model with direction text typed character by character.
4. After models load (minimum 6 seconds on the landing), AR mode begins automatically.
5. A gesture prompt appears for the first element (Wood). Hold the correct gesture steady for 1.5 seconds to confirm.
6. On confirm, a snapshot of the participant's own hand appears at the placement point -- a soft, seed-shaped photo. The model begins growing from that same spot over ~36 seconds, with slow organic rotation and periodic "corruption" stutters whose character (timing, intensity, whether it snaps or swells) is unique to each element. Partway through, the hand-photo folds into a spinning kaleidoscope and dissolves, handing off from "photo of the hand" to "the model."
7. One-finger drag rotates and lifts the model. Two-finger pinch moves it closer or further along the line of sight.
8. When growth completes the model recedes (with a screen-wide glitch burst as it collapses), leaving behind a dormant particle orb (3 drifting colored particles). Tap the orb to reactivate and re-grow that element while others continue.
9. After all five elements complete, a final stage activates: all five models orbit the viewer in a ring, sized to fill the frame without crowding it.
10. In the final stage, drag to spin and tilt the ring; pinch to contract or expand it (now with a much wider zoom range). Hand tracking stays active here: any hand in frame gives all five a light ambient glitch ("Reach the Flowergirls" appears on screen), and reaching toward one specific model -- tracked via the camera, not a screen tap -- mutates just that one, harder and in its own elemental style. The mutation is permanent and cumulative: each touch distorts the model further along a random axis and raises a floor of surface corruption that never fully clears (both capped so repeated touching can't spiral), and re-captures the participant's hand at the point of contact, the same photo-to-kaleidoscope treatment as the original summoning.

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
| 1-finger drag vertical | Tilt the ring up/down (±37°) |
| 2-finger spread | Contract ring (models closer) |
| 2-finger pinch | Expand ring (models further, wide zoom range) |
| Any hand in camera frame | Light ambient glitch across all five models |
| Reach toward a specific model | Localized, permanent "mutate" -- axis distortion + residual glitch that accumulate across touches, styled to that element; also re-captures the participant's hand |

---

## Tech Stack

- **Rendering** -- Three.js 0.170.0 (WebGL, ACES filmic tone mapping, PMREM environment)
- **Hand tracking** -- MediaPipe Tasks Vision 0.10.18 (`HandLandmarker`, GPU delegate, VIDEO mode)
- **Gesture classification** -- Custom landmark-based classifier using finger extension and tip-distance heuristics; 1.5-second hold-confirm with palm-ring progress indicator
- **3D models** -- GLB format, meshopt-compressed with WebP textures (≤5 MB each), loaded with `GLTFLoader` + `MeshoptDecoder`
- **Particle system** -- Custom double-helix `BufferGeometry` (120 particles, additive blending, element-colored glow, dot size 0.11)
- **Dormant orbs** -- 3-particle swirling cluster per element using the same glow texture; transparent `SphereGeometry` hitbox for reliable tap raycasting
- **Audio** -- `SoundEngine` (Web Audio API): per-element growth track + one-shot seed accent triggered together on placement, a looping ambient "tandem" track for the final orbit stage, and a one-shot intro cue on "Tap to Begin". Sound composed by Gustavo Guzmán: lush strings pulverized via granular and FM processing, with per-element gesture-triggered sounds
- **Hand-photo capture** -- `HandPhoto` captures the participant's hand from the camera feed at the moment of gesture-confirm, masked into a soft seed-shaped oval, then folds into a spinning kaleidoscope and dissolves as the real model grows in
- **Glitch system** -- Layered across three levels: a screen-wide `EffectComposer` + `GlitchPass` burst; rigid-body scale/rotation/position jitter on each model's anchor; and `ModelGlitch`, which patches each model's own material (`onBeforeCompile`) for surface-level color corruption and a vertex-shader wobble. All three read from shared per-element "personality" profiles matched to elemental character -- fire is fast and violent, earth is rare and heavy, metal is brief and rigid with sharp mirror-flips, water swells smoothly instead of snapping, wood is the moderate baseline. In the final orbit stage, touch-mutation is additionally permanent and cumulative: non-uniform axis distortion plus a residual glitch floor that never fully clears, both capped per element
- **Fonts** -- Cinzel Decorative (title, gesture prompts, final-stage hint), Josefin Sans (credits, sound/warning copy)
- **Build** -- Vite 5.4, `base: '/'` for custom domain
- **Deploy** -- GitHub Actions → GitHub Pages → custom domain `uncanny.live`

---

## Project Structure

```
uncanny-garden/
├── index.html              # Preload screen, landing page, HUD, CSS, typing-effect script
├── src/
│   ├── main.js             # App entry, AR render loop, HUD, glitch composer, all event wiring
│   ├── HandTracker.js      # MediaPipe wrapper, gesture classifier, hold-confirm logic
│   ├── GrowTree.js         # GLB loader, phase state machine (seed→grow→recede→dormant), per-element glitch stutter
│   ├── ParticleSystem.js   # Double-helix particle emitter (per element)
│   ├── SoundEngine.js      # Per-element sound (growth track + seed accent + ambient tandem track)
│   ├── HandPhoto.js        # Hand snapshot capture, seed-shaped mask, kaleidoscope dissolve
│   └── ModelGlitch.js      # Per-material shader patch for surface glitch + vertex wobble
├── public/
│   ├── models/
│   │   ├── hair_1.glb      # Landing page model
│   │   ├── tree.glb        # Wood element
│   │   ├── fire.glb        # Fire element
│   │   ├── earth.glb       # Soil element
│   │   ├── metal.glb       # Metal element
│   │   └── water.glb       # Water element
│   └── audio/
│       ├── wood.mp3, wood-seed.mp3       # Growth track + seed accent, per element
│       ├── fire.mp3, fire-seed.mp3
│       ├── earth.mp3, earth-seed.mp3
│       ├── metal.mp3, metal-seed.mp3
│       ├── water.mp3, water-seed.mp3
│       ├── tandem.mp3                    # Final orbit stage ambient loop
│       └── intro.mp3                     # "Tap to Begin" one-shot cue
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

- **seed** -- tiny seed scale, waiting for grow timer; the hand-photo snapshot is visible here
- **grow** -- scale interpolated seed→full with easeOutCubic, slow organic rotation, plus a periodic per-element "corruption" stutter (timing/magnitude/smooth-vs-snap character unique to each element) driving both the rigid-body jitter and the model's own surface glitch
- **recede** -- scale shrinks back with easeInOutCubic; a screen-wide glitch burst marks the collapse into the dormant orb
- **dormant** -- model hidden; 3-particle colored orb drifts at anchor position; transparent sphere hitbox enables tap raycasting

---

## Development

```bash
npm install
npm run dev      # HTTPS local server (required for camera + MediaPipe)
```

Camera and MediaPipe require HTTPS. Vite is configured with `@vitejs/plugin-basic-ssl` (pinned to `1.2.0` for Vite 5 compatibility) rather than the bare `https: true` option, since newer Node/OpenSSL builds fail the TLS handshake with the latter -- accept the self-signed certificate on first run. Test on mobile by connecting to the LAN IP shown in the terminal.

### Deploying

Work-in-progress is developed on an `experiment` branch so nothing deploys until it's confirmed working on-device. To ship:

```bash
git checkout main
git merge experiment
git push origin main   # GitHub Actions runs npm ci && npm run build, deploys dist/ to GitHub Pages
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

The work is structured around an ancient elemental cosmology (木火土金水): Wood (목), Fire (화), Soil (토), Metal (금), Water (수). Each element is associated with a cardinal direction, season, color, and body of correspondences, here mapped to hand gesture, 3D form, spatial position, sound, and glitch character in the AR field.

---

## Statements (publishable)

Final publishable versions, locked 2026-07-06. Copy-paste source: `uncanny-garden-statements.txt`.

### Long description (200 words)

Uncanny Garden emerges from a collaboration between Techspressionist visual artist Randi Matushevitz, AR artist Bin Youn, and sound composer Gustavo Guzmán. Rooted in Matushevitz's ongoing exploration of the Flowergirl figure, the work extends her visual world into augmented space and original sound.

Drawing from both Western and East Asian elemental philosophies, the work maps five elemental energies onto hand gesture, 3D botanical form, and spatial position within an augmented reality field. Each element carries its cardinal direction, season, and color into a surrealist landscape inhabited by the Maiden archetype: the flower girl, seeding, blooming, transforming. Participants invoke each figure through sustained gestures, becoming co-authors in a mediated ritual.

At its center, Uncanny Garden holds the ancient fertility symbol not as a relic but as an uncanny living presence. The work holds space for duality: interior and exterior self, the imagined and the real, what we reveal and what we conceal. The grandiose self and the shadow self can coexist.

Techspressionism provides the philosophical ground for this encounter between the digital and the elemental. What is old is made new: ancient ritual, spirit, and myth experienced through contemporary technology, art, and music as a 21st-century act of seeing and becoming.

### Technical statement (200 words)

Uncanny Garden is a browser-based augmented reality experience requiring no application installation. Activated by QR code in a standard mobile browser, the work uses the device camera for real-time hand tracking and spatial AR.

A custom hand gesture classifier maps five hand positions across ancient elemental cosmology (木火土金水): open palm to Wood, raised index to Fire, closed fist to Soil, peace sign to Metal, and OK ring to Water. A 1.5-second hold-confirm creates a deliberate moment before each summoning.

Three.js renders the environment with filmic tone mapping and image-based lighting. A four-phase state machine governs each figure: seed, grow (36 seconds), recede, and dormant. In the dormant state, a glowing particle orb persists; tapping it reactivates the cycle. Touch controls allow one-finger rotation and two-finger depth movement; in the final stage, all five figures form a ring surrounding the viewer, navigable by drag and pinch. The work deploys at uncanny.live.

The sonorities thread about and tension the concepts of uncanny empathy and East Asian elemental cosmology. Summoned Flower Girls are accompanied by lush strings pulverized via granular and FM processing. Elemental sounds triggered by gesture reinforce a parodied yet empathic aesthetic, creating sonic disorientation that embodies the work's surrealist vision.

---

Randi Matushevitz · Bin Youn · Gustavo Guzmán · 2026
