/**
 * Centralized Constants for ProtoFace
 * 
 * This file consolidates magic numbers and configurable values
 * to improve maintainability and readability.
 */

// ============================================
// Animation Timing
// ============================================
export const BASE_PHONEME_DURATION_MS = 140;
export const EXPRESSIVENESS_DURATION_MODIFIER = 40;
export const SPACE_PAUSE_MULTIPLIER = 1.5;
export const PUNCTUATION_DURATION_MULTIPLIER = 0.5;
export const PUNCTUATION_SQUASH_MULTIPLIER = 0.2;
export const PUNCTUATION_BROW_JUMP = 0.4;
export const ANTICIPATION_DURATION_RATIO = 0.3;
export const OVERSHOOT_THRESHOLD = 0.8;

// ============================================
// Face Geometry
// ============================================
export const DEFAULT_EYE_SIZE = 22;
export const DEFAULT_EYE_SPACING = 44;
export const MOUTH_SCALE = 15;
export const BROW_JUMP_INTENSITY = 20;

// ============================================
// Recording
// ============================================
export const RECORDING_FPS = 30;
export const STOP_TIMEOUT_MS = 2000;

// ============================================
// Styling
// ============================================
export const DEFAULT_BACKGROUND_COLOR = '#cc4444';

// ============================================
// TTS / Voice
// ============================================
export const VOICE_CATALOG_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json';
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// TTS Execution Modes
export const TTS_MODE_LOCAL = 'local';   // Runs Piper in a local Web Worker
export const TTS_MODE_REMOTE = 'remote'; // Requests audio from a remote Host
export const TTS_MODE_HOST = 'host';     // Acts as a TTS engine for remote clients

// Communication
export const TTS_BRIDGE_CHANNEL = 'protoface-tts-bridge';

// TTS Engines
export const TTS_ENGINE_PIPER = 'piper';
export const TTS_ENGINE_NATIVE = 'native';

// ============================================
// Audio Analysis
// ============================================
export const ANALYSER_FFT_SIZE = 256;
export const VOLUME_NORMALIZATION_FACTOR = 40;
