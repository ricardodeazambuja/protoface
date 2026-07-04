import { useState, useRef, useEffect, useCallback } from 'react';
import {
    TTS_ENGINE_PIPER,
    TTS_ENGINE_NATIVE
} from '../constants';
import { parseScriptSegments } from '../utils/parseScriptSegments';
import { debug, isDebugEnabled } from '../utils/debug';
import localVoiceCatalog from '../data/voices.json';

// Module-level singleton worker to prevent StrictMode from creating duplicates
let sharedWorker = null;
let workerRefCount = 0;

function getSharedWorker() {
    if (!sharedWorker) {
        debug('[useTTS] Creating shared worker (singleton)');
        sharedWorker = new Worker(new URL('../utils/piperWorker.js', import.meta.url), { type: 'module' });
        // Workers can't read localStorage; forward the debug flag.
        sharedWorker.postMessage({ type: 'setDebug', enabled: isDebugEnabled() });
    }
    workerRefCount++;
    return sharedWorker;
}

function releaseSharedWorker() {
    workerRefCount--;
    if (workerRefCount <= 0 && sharedWorker) {
        debug('[useTTS] Terminating shared worker');
        sharedWorker.terminate();
        sharedWorker = null;
        workerRefCount = 0;
    }
}

/**
 * useTTS - Custom hook for managing TTS.
 * Supports the Piper Web Worker and the browser's native speechSynthesis.
 */
export const useTTS = (onError) => {
    const [useTTS, setUseTTS] = useState(false);
    const [ttsReady, setTtsReady] = useState(false);
    const [ttsLoading, setTtsLoading] = useState(false);
    const [ttsProgress, setTtsProgress] = useState(0);
    const [voice, setVoice] = useState('');
    const voiceCatalog = localVoiceCatalog;
    const [downloadedVoices, setDownloadedVoices] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('protoface-downloaded-voices') || '[]');
        } catch (e) { return []; }
    });

    const [ttsEngine, setTtsEngine] = useState(TTS_ENGINE_PIPER);
    const [nativeVoices, setNativeVoices] = useState([]);

    const workerRef = useRef(null);
    const abortControllerRef = useRef(null);
    const requestIdRef = useRef(0);

    // Initialize Native Voices
    useEffect(() => {
        const updateVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            setNativeVoices(voices);
        };
        updateVoices();
        window.speechSynthesis.onvoiceschanged = updateVoices;
        return () => { window.speechSynthesis.onvoiceschanged = null; };
    }, []);

    // Initialize Piper Worker (singleton to prevent StrictMode double-init).
    // onmessage goes through a ref so it always sees the latest handler
    // (and its latest onError) without re-subscribing on every render.
    const handleBackendMessageRef = useRef(null);
    useEffect(() => {
        workerRef.current = getSharedWorker();
        workerRef.current.onmessage = (e) => handleBackendMessageRef.current?.(e.data);

        return () => {
            releaseSharedWorker();
        };
    }, []);

    const handleBackendMessage = (data) => {
        const { type, progress, error } = data;

        if (type === 'progress') {
            setTtsProgress(progress);
        } else if (type === 'loaded') {
            setTtsReady(true);
            setTtsLoading(false);
            localStorage.setItem('protoface-tts-consented', 'true');
        } else if (type === 'result') {
            setTtsLoading(false);
        } else if (type === 'error') {
            console.error('TTS Error:', error);
            setTtsLoading(false);
            if (onError) onError(error);
        }
    };
    handleBackendMessageRef.current = handleBackendMessage;

    const postToBackend = (message) => {
        if (workerRef.current) {
            workerRef.current.postMessage(message);
        }
    };

    // Update the 'loaded' voice tracker
    useEffect(() => {
        if (ttsReady && voice && !downloadedVoices.includes(voice)) {
            setDownloadedVoices(prev => {
                if (prev.includes(voice)) return prev;
                const next = [...prev, voice];
                localStorage.setItem('protoface-downloaded-voices', JSON.stringify(next));
                return next;
            });
        }
    }, [ttsReady, voice, downloadedVoices]);

    const loadVoice = useCallback((voiceId) => {
        setVoice(voiceId);

        if (!voiceId) {
            setTtsReady(false);
            setTtsLoading(false);
            return;
        }

        if (ttsEngine === TTS_ENGINE_NATIVE) {
            setTtsReady(true);
            setTtsLoading(false);
            return;
        }

        const voiceInfo = voiceCatalog[voiceId];
        setTtsLoading(true);
        setTtsReady(false);

        if (voiceInfo) {
            const baseUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
            // Priority: Quantized then high quality
            const modelPath = Object.keys(voiceInfo.files).find(f => f.endsWith('_q.onnx')) ||
                Object.keys(voiceInfo.files).find(f => f.endsWith('.onnx'));
            const configPath = Object.keys(voiceInfo.files).find(f => f.endsWith('.onnx.json'));
            postToBackend({
                type: 'load',
                requestId: ++requestIdRef.current,
                voiceId: voiceId,
                modelUrl: baseUrl + modelPath,
                configUrl: baseUrl + configPath
            });
        } else {
            postToBackend({
                type: 'load',
                requestId: ++requestIdRef.current,
                modelId: voiceId
            });
        }
    }, [voiceCatalog, ttsEngine]);

    const generateSegmentedSpeech = useCallback(async (script, baseSettings = {}) => {
        if (!ttsReady && ttsEngine !== TTS_ENGINE_NATIVE) throw new Error('TTS not ready');

        // Cancel any pending generation
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;

        if (ttsEngine === TTS_ENGINE_NATIVE) {
            // Native mode: trigger utterances sequentially with proper speed/pause support
            const segments = parseScriptSegments(script);
            window.speechSynthesis.cancel();

            // Use nativeRate directly from settings (user controls this via Voice Speed slider)
            const baseRate = baseSettings?.nativeRate ?? 1.0;

            // Helper to speak one utterance and wait for completion
            const speakSegment = (text, rate, voiceObj, pitch, volume) => {
                return new Promise((resolve) => {
                    const utterance = new SpeechSynthesisUtterance(text);
                    if (voiceObj) utterance.voice = voiceObj;
                    utterance.rate = Math.max(0.1, Math.min(10, rate));
                    utterance.pitch = Math.max(0, Math.min(2, pitch));
                    utterance.volume = Math.max(0, Math.min(1, volume));
                    utterance.onend = () => resolve();
                    utterance.onerror = () => resolve(); // Continue even on error
                    window.speechSynthesis.speak(utterance);
                });
            };

            // Helper to wait for a duration
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            // Get pitch and volume from settings
            const pitch = baseSettings?.pitch ?? 1.0;
            const volume = baseSettings?.volume ?? 1.0;

            // Process segments sequentially (don't await here, just fire and forget for animation sync)
            (async () => {
                const selectedNativeVoice = nativeVoices.find(v => v.name === voice);
                for (const segment of segments) {
                    // speechSynthesis.cancel() only kills the current utterance
                    // (resolving speakSegment via onend/onerror); without this
                    // check the loop would immediately speak the next segment.
                    if (signal.aborted) break;
                    if (segment.type === 'text' && segment.text.trim()) {
                        const segmentRate = baseRate * (segment.speed || 1.0);
                        await speakSegment(segment.text, segmentRate, selectedNativeVoice, pitch, volume);
                    } else if (segment.type === 'pause' && segment.duration > 0) {
                        await delay(segment.duration);
                    }
                }
            })();

            return { audio: null, sampling_rate: 0 };
        }

        const segments = parseScriptSegments(script);
        const audioChunks = [];
        let sampleRate = 22050;

        const currentRequestId = ++requestIdRef.current;
        setTtsLoading(true);
        debug('[useTTS] Starting segmented speech generation, segments:', segments.length);

        try {
            let segmentIndex = 0;
            for (const segment of segments) {
                if (signal.aborted) throw new DOMException('Speech generation aborted', 'AbortError');

                if (segment.type === 'text' && segment.text.trim()) {
                    debug('[useTTS] Processing segment', segmentIndex, '/', segments.length, '- text:', segment.text.substring(0, 20) + '...');
                    // Compose the caller's base rate with the segment's <speed:x>
                    // tag; spreading baseSettings below would otherwise discard
                    // the base lengthScale entirely.
                    const lengthScale = (baseSettings.lengthScale || 1) / segment.speed;

                    const audio = await new Promise((resolve, reject) => {
                        let cleanup;
                        const handler = (data) => {
                            const { type, audio, sampling_rate, error, requestId } = data;
                            if (requestId !== currentRequestId) return; // Skip old request results

                            if (type === 'result') {
                                debug('[useTTS] Segment', segmentIndex, 'complete, audio samples:', audio?.length);
                                cleanup();
                                sampleRate = sampling_rate;
                                resolve(audio);
                            } else if (type === 'error') {
                                debug('[useTTS] Segment', segmentIndex, 'ERROR:', error);
                                cleanup();
                                reject(new Error(error));
                            }
                        };

                        const listener = (e) => handler(e.data);

                        // Add abort listener to clean up if aborted while waiting
                        const onAbort = () => {
                            cleanup();
                            reject(new DOMException('Speech generation aborted', 'AbortError'));
                        };
                        signal.addEventListener('abort', onAbort);

                        workerRef.current.addEventListener('message', listener);
                        cleanup = () => {
                            workerRef.current.removeEventListener('message', listener);
                            signal.removeEventListener('abort', onAbort);
                        };

                        debug('[useTTS] Sending segment', segmentIndex, 'to worker...');
                        postToBackend({
                            type: 'speak',
                            requestId: currentRequestId,
                            text: segment.text,
                            settings: { ...baseSettings, lengthScale }
                        });
                    });

                    audioChunks.push(audio);
                } else if (segment.type === 'pause') {
                    debug('[useTTS] Processing pause segment:', segment.duration, 'ms');
                    const silenceSamples = Math.floor((segment.duration / 1000) * sampleRate);
                    const silence = new Float32Array(silenceSamples);
                    audioChunks.push(silence);
                }
                segmentIndex++;
            }

            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combinedAudio = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
                combinedAudio.set(chunk, offset);
                offset += chunk.length;
            }
            // Clear chunks to allow garbage collection - critical for iOS memory
            audioChunks.length = 0;

            debug('[useTTS] Speech generation complete, audio length:', combinedAudio.length, 'samples');

            setTtsLoading(false);
            abortControllerRef.current = null;
            return { audio: combinedAudio, sampling_rate: sampleRate };
        } catch (error) {
            setTtsLoading(false);
            abortControllerRef.current = null;
            throw error;
        }
    }, [ttsReady, ttsEngine, voice, nativeVoices]);

    const stopSpeech = useCallback(() => {
        if (ttsEngine === TTS_ENGINE_NATIVE) {
            window.speechSynthesis.cancel();
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, [ttsEngine]);

    return {
        useTTS, setUseTTS,
        ttsEngine, setTtsEngine,
        nativeVoices,
        ttsReady, ttsLoading, ttsProgress,
        voice, voiceCatalog, downloadedVoices,
        loadVoice, generateSegmentedSpeech, stopSpeech
    };
};
