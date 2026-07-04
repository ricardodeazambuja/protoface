# ProtoFace: Technical Notes 🛠️

This document provides a deep dive into the internal mechanics of ProtoFace for developers looking to extend or modify the system.

## 🏗️ Architecture

- **Framework**: React 18+
- **Build Tool**: Vite
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Rendering**: SVG (Parametric Geometry)

## 🎨 Face Geometry (`src/components/Face.jsx`)

The face is rendered as a single SVG with multiple groups for eyebrows, eyes, and the mouth.

### 👄 The Mouth Curve (`intersection` function)
The most complex part of the rendering logic is the mouth. It uses a custom `intersection` function (derived from Red Blob Games) to calculate the intersection points of two Bezier curves. 
- The mouth is defined by an **upper lip curve** and a **lower lip curve**.
- The `intersection` logic ensures that when the mouth "closes" or "smiles", the curves resolve into a single path that feels organic rather than just scaling a circle.

### 👁️ Responsive Eye Layering
To support overlapping eyes (low `eyeSpacing`), the pupils are rendered **last** within the eye group. This prevents the white area of one eye from clipping the pupil of the other.

```javascript
// Ordering ensures pupils are Z-index: top
<g transform="translate(50, 85)">
  {/* White Ellipses */}
  {/* Pupil Circles */}
</g>
```

## 🧠 Animation Engine (`src/utils/AnimationEngine.js`)

The `parseTextToAnimation` function is the core of the project's "life." It converts raw text (including specific markup like `<joy>`) into a timed sequence of instructions that the React components use to animate in real-time.

### 📜 Text-to-Animation Conversion Process

The conversion follows a systematic, greedy-matching approach:

1.  **Parsing Markup**: The engine first splits the input text using a regex that identifies tags. It supports:
    - **Emotion tags**: `<joy>`, `<sad>`, `<angry>`, etc. - Change the face's base emotional state
    - **Pause tags**: `<pause:500>` - Insert a silent pause (in ms)
    - **Speed tags**: `<speed:0.5>` - Modify animation speed (0.1x to 5x)
    - **Emphasis tags**: `<emphasis>text</emphasis>` - Add visual emphasis (raised brows, extra squash)
2.  **Greedy Phoneme Matching**: For the remaining text, the engine iterates through characters and attempts to match the longest possible phoneme from the `phonemeMap` (e.g., matching `sh` before falling back to `s` and `h`). 
3.  **Frame Generation**: Each identified phoneme generates a "frame" object containing:
    - `phoneme`: The target mouth shape.
    - `duration`: How long to hold the shape (scaled by current speed modifier).
    - `squash`: Vertical scale modifier for "bounce."
    - `browJump`: Eye brow offset for secondary motion.
    - `isPause`: Boolean flag for pause frames (exempt from audio scaling).
4.  **Special Handling**: 
    - **Spaces**: Generate a `closed` phoneme with an extended duration to represent pauses between words.
    - **Punctuation**: Characters like `!`, `?`, or `.` trigger modified durations and exaggerated `squash`/`browJump` values to simulate emphasis.

### 🎚️ The Expressiveness Slider

The `expressiveness` parameter (0% to 100%) acts as a global "personality" scalar. It doesn't just change one thing; it modifies the entire animation algorithm:

- **Velocity Tuning**: At 0% (Realistic), the `baseDuration` is longer for a steady pace. At 100% (Cartoon), durations are shorter, making the mouth "snap" between positions with higher energy.
- **Squash & Stretch Intensity**: This controls the "bounce." 
    - At 0%, `squash` stays near 1.0 (no bounce).
    - At 100%, the face noticeably compresses on vowels and stretches on exclamation points.
- **Secondary Motion Amplitude**: Higher expressiveness increases the range of `browJump`, making the eyebrows react much more violently to the rhythm of speech.

### 🎭 Animation Principles (Cartoon Mode)

When expressiveness is set high (>60%), the engine automatically injects "Disney/Pixar-style" principles into the procedural sequence:

- **Anticipation (Pre-frames)**: For vowels like `a`, `o`, or `u`, and before emotion changes, the engine inserts a very short `closed` frame with a `squash < 1.0`. This makes the face "squat" for a moment before bursting into the next shape, making the movement feel physical and weighted.
- **Overshoot & Settle (Post-frames)**: On punctuation like `!`, the engine creates a "peak" frame with high squash/browJump, followed by a "settle" frame (`squash: 0.95`) that makes the face slightly rebound before returning to neutral. This simulates a natural elastic follow-through.

## 📐 Transformation Logic

Face movements (Left/Right, Up/Down) are applied at the SVG root using `framer-motion` transforms. 
- **Squash & Stretch**: Applied via `scaleY` with a `transformOrigin: "50% 100%"`. This ensures the face squashes down toward the "chin" rather than into the center, making it feel grounded.

## 🎞️ Video Export (`src/utils/Recorder.js`)

The recorder uses `html2canvas` to capture frames of the SVG area and feeds them into a `MediaRecorder` instance. This allows for high-quality MP4/WebM export without a backend server.

---

## 🔊 Text-to-Speech (`src/hooks/useTTS.js`)

ProtoFace includes built-in TTS using [Piper](https://github.com/rhasspy/piper), running entirely in the browser via WebAssembly.

### Segmented Speech Generation

The TTS system supports script tags through segment-based generation (`generateSegmentedSpeech`):

1. **Script Parsing** (`parseScriptSegments.js`): Splits script into typed segments:
   - `{ type: 'text', text: string, speed: number }`
   - `{ type: 'pause', duration: number }`
   - `{ type: 'emotion', name: string }`

2. **Per-Segment Synthesis**: Each text segment is synthesized separately with Piper's `lengthScale` parameter (`lengthScale = 1/speed`).

3. **Chunked Output**: Synthesis returns a list of chunks —
   `{ type: 'audio', audio }` per text segment and
   `{ type: 'pause', duration }` per pause. Nothing is concatenated and no
   silence buffers are allocated.

4. **Gapless Scheduling**: The player creates one `AudioBufferSource` per
   speech chunk and schedules them back-to-back on the AudioContext clock
   with `source.start(when)`; pauses are gaps in the schedule. Each chunk's
   raw array is released as soon as its AudioBuffer copy exists, keeping
   peak memory at ~1x the speech audio (the old concatenate-then-copy
   pipeline peaked at ~3x, which crashed iOS Safari on long scripts).

### Audio-Animation Sync

The animation player (`useAnimationPlayer.js`) calculates a `scaleFactor` to sync animation with audio:
- Pause durations are **excluded** from scaling (they use exact timing and match the schedule gaps).
- Speech frames are scaled: `scaleFactor = speechAudioDuration / speechAnimDuration`, where `speechAudioDuration` is the summed duration of the scheduled speech chunks.

---

## ⚙️ Configuration (`src/constants.js`)

All magic numbers and configurable values are centralized in `constants.js`:

| Category | Constants |
|----------|----------|
| Animation | `BASE_PHONEME_DURATION_MS`, `EXPRESSIVENESS_DURATION_MODIFIER`, `ANTICIPATION_DURATION_RATIO` |
| Face | `DEFAULT_EYE_SIZE`, `DEFAULT_EYE_SPACING`, `MOUTH_SCALE`, `BROW_JUMP_INTENSITY` |
| Recording | `RECORDING_FPS`, `STOP_TIMEOUT_MS` |
| TTS | `VOICE_CATALOG_URL`, `CACHE_EXPIRY_MS` |
| Styling | `DEFAULT_BACKGROUND_COLOR` |

---

## 🛠️ How to Extend

### Adding an Emotion
1. Open `src/utils/emotions.js`.
2. Add a new key with parameters: `[m, p, q, r, s, skew, rotate, browLift, browAngle]`.
3. Use it in text: `<my_new_emotion> Hello!`.

### Adding a Phoneme
1. Open `src/utils/AnimationEngine.js`.
2. Add a mapping to `phonemeMap` (e.g., `'ng': 'narrow'`).
3. If it requires a new visual shape, update `Face.jsx` to handle the new state.

### Adding a Script Tag
1. Open `src/utils/AnimationEngine.js`.
2. Add handling in the tag parsing switch statement.
3. For TTS-aware tags, update `parseScriptSegments.js` as well.

---

## 📲 Progressive Web App (`public/sw.js`)

ProtoFace is a fully installable PWA with offline support.

### Service Worker Strategy

The service worker uses a hybrid caching approach:

| Resource Type | Strategy | Rationale |
|--------------|----------|-----------|
| Navigation (HTML) | Network first, cache fallback | Fresh content when online |
| Static assets (JS/CSS) | Cache first | Fast loading |
| TTS engine (WASM) | Precached on install | Large files, rarely change |
| Voice models | Handled by worker Cache API | User-initiated downloads |

### Cached Asset Categories

**Precached on Install (~45MB):**
- App shell: `index.html`, JS bundles, CSS
- TTS engine: `/piper/*.wasm`, `/piper/*.data`, `/piper/*.js`
- Icons and manifest

**Cached on Demand:**
- Voice models from HuggingFace (cached via `caches` API in worker)

### Install Prompt Hook (`src/hooks/useInstallPrompt.js`)

Custom hook that:
1. Captures `beforeinstallprompt` event
2. Exposes `canInstall`, `isInstalled`, `promptInstall()` to components
3. Listens for `appinstalled` event to update state

### Version Management

Cache version is controlled via `CACHE_NAME` in `sw.js`. On activation:
- Old cache versions are automatically deleted
- New assets are precached
- `skipWaiting()` and `clients.claim()` ensure immediate activation

---

## 🌐 Platform Compatibility

### Pinned Library Versions

The TTS worker (`src/utils/piperWorker.js`) uses pinned CDN versions for stability:

| Library | Version | Purpose |
|---------|---------|---------|
| `onnxruntime-web` | 1.23.2 | ONNX model inference (WASM) |
| `espeak-ng` | 1.0.2 | Phoneme generation |

### iOS Safari Limitations

> ⚠️ **Memory Constraints**: iOS Safari has stricter WASM memory limits compared to desktop browsers. On older iOS devices (e.g., iPhone SE 2nd gen), Neural TTS may crash during audio preparation due to memory duplication.

**Mitigations Applied:**
- Single-threaded WASM execution (`numThreads = 1`)
- Transferable audio buffers to reduce memory copying
- Per-segment audio scheduling: no full-length concatenated buffer ever exists (see Gapless Scheduling above)

**User Workaround**: Use **Native TTS** on iOS devices if Neural TTS crashes.

### Video Recording Formats

iOS Safari's `MediaRecorder` only encodes fragmented MP4 (H.264/AAC) and
throws `NotSupportedError` for WebM. The recorder probes
`MediaRecorder.isTypeSupported()` and picks the first supported format
(MP4 preferred, WebM fallback); the download extension follows the actual
container.

### Debug Logging

Detailed play/synthesis tracing is disabled by default. Enable it on any
device with `localStorage.setItem('protoface-debug', '1')` in the console,
then reload.
