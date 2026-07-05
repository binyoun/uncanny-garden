# Uncanny Garden — Sound Design Guide

For Gustavo Guzman. This documents exactly when each clip plays, how long it needs to be, and what the visual behavior is at that moment, so sound design can be timed precisely against it. Live build: uncanny.live

## Overview

Five elements are summoned one at a time, in this fixed order: Wood, Fire, Earth, Metal, Water. Each element has a hand gesture, a color, and a 3D model that grows from the palm position and then recedes into a small dormant orb. Once all five have grown at least once, the piece moves into a final stage where all five orbit together and can be touched.

Two clips per element, plus one shared ambient track for the final stage, plus one landing intro cue. Twelve files total.

## Files needed

| Element | Clip | Role | Target length |
|---|---|---|---|
| (landing) | intro | one-shot, fires on "Tap to Begin" | 6 sec |
| Wood | wood-seed | one-shot accent, fires at gesture confirm | 1 to 2 sec |
| Wood | wood | growth track, plays under the full bloom | 40.5 sec |
| Fire | fire-seed | one-shot accent | 1 to 2 sec |
| Fire | fire | growth track | 40.5 sec |
| Earth | earth-seed | one-shot accent | 1 to 2 sec |
| Earth | earth | growth track | 40.5 sec |
| Metal | metal-seed | one-shot accent | 1 to 2 sec |
| Metal | metal | growth track | 40.5 sec |
| Water | water-seed | one-shot accent | 1 to 2 sec |
| Water | water | growth track | 40.5 sec |
| (shared) | tandem | ambient bed, loops for the whole final stage | any length, loop-safe |

The current placeholder tracks run about 40 to 41.7 seconds and work fine. 40.5 sec is the exact on-screen duration, so anything within a second or two of that is safe. The seed and growth track for an element always start in the same instant, so they should be mixed as a pair, not as isolated files.

## Landing intro cue (not yet delivered)

There is a black "Tap to Begin" screen before anything else. Tapping it does three things at once: unlocks audio playback (a browser requirement, not something sound design needs to worry about), starts the typing animation on the title screen ("Your Hand Gestures / Bloom Five Elemental / Flowergirls."), and starts the intro cue.

For now, tapping plays the tandem track once as a stand-in, since there's no dedicated intro clip yet. This is a placeholder, not a suggestion for the final piece.

The typing animation takes exactly 4.6 sec to finish. The landing screen then holds for about 1.4 sec more before moving into AR, so the intro cue has a **6 second window**, one-shot, not looped. Design it to land its ending (or at least its main gesture) close to that 6 second mark, since that's roughly when the screen transitions away.

Note: on a slow connection the 3D models can take longer than 6 seconds to load, in which case the landing screen simply stays up longer after the cue has already finished. That's fine, expected, and not something the cue needs to account for. No need to loop it or pad it out to guess at load time.

## Per-element timeline (identical structure for all five)

Both clips for an element start together, at the instant the gesture is confirmed (a 1.5 second hold).

| Time | Visual event | Audio event |
|---|---|---|
| 0:00.0 | Gesture confirmed. Tiny seed model appears, held in place. | Seed accent fires. Growth track starts. |
| 0:02.0 | Model begins to bloom (eased, fast start then decelerating). | Growth track continues. |
| 0:02.0 to ~0:03 | Snapshot photo of the summoning hand glitches apart and dissolves. | (optional accent point if you want to hit this moment) |
| 0:38.0 | Bloom finishes, model at full scale. | Growth track nearing its end. |
| 0:38.0 to 0:40.5 | Model shrinks back down (eased both directions) into a small dormant orb. | Growth track finishes. |
| 0:40.5 | Model fully dormant. Small swirling particle orb remains, tappable. | Silence, until next trigger. |

Breakdown of the 40.5 sec: 2.0 sec seed hold, 36.0 sec bloom, 2.5 sec recede.

Tapping a dormant orb later replays the exact same seed and growth pair from 0:00. So each track needs to work as a loopable "cold start", not something that only makes sense once.

## Element character

Each element has a distinct movement personality already built into the visuals (used for the "touch to mutate" effect in the final stage, but it is a good reference for what each element should feel like sonically too):

| Element | Gesture | Color | Feel |
|---|---|---|---|
| Wood | open palm | green | organic, springy, mid-speed |
| Fire | index finger up | red | fastest, sharp, most volatile, high flip/glitch chance |
| Earth | closed fist | gold | slowest, heaviest, low amplitude, grounded |
| Metal | peace sign | silver/white | very fast, rigid, high glitch chance, brittle |
| Water | ok ring | blue | slow, the only one with a smooth eased envelope (no hard cuts), never glitch-flips |

If it helps: Fire and Metal are the two "sharpest" elements (fastest, most prone to visual glitch and mirroring), Earth is the heaviest and slowest, Wood sits in the middle with an organic quality, Water is the only element that moves smoothly rather than in hard steps.

## Final stage: tandem track

Once all five elements have grown at least once, there is a 1.2 second pause, then all five models move into an orbit formation around the viewer and the tandem track starts, looping for as long as the visitor stays in that stage (no fixed end).

In this stage, hand tracking stays active:
- any hand appearing in frame gives all five models a mild simultaneous glitch jitter
- touching a specific model (via the tracked hand position, not a screen tap) gives that one model a stronger localized glitch, using the same per-element personalities above

Tandem should be a bed that can sit under occasional glitch moments without being disrupted by them. No sync points needed for it since the glitches are hand-driven and open-ended, not on a fixed timeline.

## Technical delivery spec

- Format: mp3, or WAV if you prefer (either is fine, the app decodes it before playback)
- Sample rate: 44.1kHz
- Loudness: please normalize/master before delivery. Playback is a single master gain in-browser with no compression or limiting applied on our end, so files should already sit at a consistent, mobile-speaker-friendly level (roughly -14 to -16 LUFS integrated is a safe target, peak below -1dBFS)
- Mono or stereo both fine
- File naming: keep the pattern above (wood.mp3, wood-seed.mp3, tandem.mp3, intro.mp3, etc) so nothing needs remapping on our side

## Mixing note

Only one element's seed and growth track ever play at once (starting a new one always stops whatever was previously playing). Tandem only ever plays once the sequential five are done and never overlaps with an element's seed or growth track. Intro only ever plays once, right at the start, and is always finished well before any element sound can begin. So no need to design for simultaneous layers anywhere, just each piece against itself.
