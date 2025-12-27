import { useState, useRef, useEffect, useCallback } from 'react';
import {
    VOICE_CATALOG_URL,
    CACHE_EXPIRY_MS,
    TTS_MODE_LOCAL,
    TTS_MODE_REMOTE,
    TTS_ENGINE_PIPER,
    TTS_ENGINE_NATIVE
} from '../constants';
import { parseScriptSegments } from '../utils/parseScriptSegments';
import localVoiceCatalog from '../data/voices.json';

/**
 * useTTS - Custom hook for managing TTS.
 * Supports Local (Web Worker) and Remote (Bridge) backends.
 */
export const useTTS = (onAudioResult, onError, options = {}) => {
    const { mode = TTS_MODE_LOCAL } = options;

    const [useTTS, setUseTTS] = useState(false);
    const [ttsReady, setTtsReady] = useState(false);
    const [ttsLoading, setTtsLoading] = useState(false);
    const [ttsProgress, setTtsProgress] = useState(0);
    const [voice, setVoice] = useState('');
    const [voiceCatalog, setVoiceCatalog] = useState(localVoiceCatalog);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [downloadedVoices, setDownloadedVoices] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('protoface-downloaded-voices') || '[]');
        } catch (e) { return []; }
    });

    const [ttsEngine, setTtsEngine] = useState(TTS_ENGINE_PIPER);
    const [nativeVoices, setNativeVoices] = useState([]);

    const workerRef = useRef(null);

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

    // Initialize Piper Worker
    useEffect(() => {
        console.log('[useTTS] Initializing Local Worker Backend');
        workerRef.current = new Worker(new URL('../utils/piperWorker.js', import.meta.url), { type: 'module' });
        workerRef.current.onmessage = (e) => handleBackendMessage(e.data);

        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    const handleBackendMessage = (data) => {
        const { type, progress, audio, sampling_rate, error } = data;

        if (type === 'progress') {
            setTtsProgress(progress);
        } else if (type === 'loaded') {
            setTtsReady(true);
            setTtsLoading(false);
            localStorage.setItem('protoface-tts-consented', 'true');
        } else if (type === 'result') {
            setTtsLoading(false);
            if (onAudioResult) onAudioResult(audio, sampling_rate);
        } else if (type === 'error') {
            console.error('TTS Error:', error);
            setTtsLoading(false);
            if (onError) onError(error);
        }
    };

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
                voiceId: voiceId,
                modelUrl: baseUrl + modelPath,
                configUrl: baseUrl + configPath
            });
        } else {
            postToBackend({ type: 'load', modelId: voiceId });
        }
    }, [voiceCatalog, ttsEngine]);

    const generateSpeech = useCallback((text, settings) => {
        if (!ttsReady) return;

        if (ttsEngine === TTS_ENGINE_NATIVE) {
            const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]*>/g, ''));
            const selectedNativeVoice = nativeVoices.find(v => v.name === voice);
            if (selectedNativeVoice) utterance.voice = selectedNativeVoice;
            window.speechSynthesis.speak(utterance);
            if (onAudioResult) onAudioResult(null, 0); // Trigger animation without buffer
            return;
        }

        setTtsLoading(true);
        const cleanText = text.replace(/<[^>]*>/g, '');
        postToBackend({
            type: 'speak',
            text: cleanText,
            settings
        });
    }, [ttsReady, ttsEngine, voice, nativeVoices, onAudioResult]);

    const generateSegmentedSpeech = useCallback(async (script, baseSettings = {}) => {
        if (!ttsReady) throw new Error('TTS not ready');

        if (ttsEngine === TTS_ENGINE_NATIVE) {
            // Native mode: just trigger the utterances and return null buffer
            const segments = parseScriptSegments(script);
            window.speechSynthesis.cancel();
            for (const segment of segments) {
                if (segment.type === 'text') {
                    const utterance = new SpeechSynthesisUtterance(segment.text);
                    const selectedNativeVoice = nativeVoices.find(v => v.name === voice);
                    if (selectedNativeVoice) utterance.voice = selectedNativeVoice;
                    window.speechSynthesis.speak(utterance);
                }
            }
            return { audio: null, sampling_rate: 0 };
        }

        const segments = parseScriptSegments(script);
        const audioChunks = [];
        let sampleRate = 22050;

        setTtsLoading(true);

        try {
            for (const segment of segments) {
                if (segment.type === 'text' && segment.text.trim()) {
                    const lengthScale = 1 / segment.speed;

                    const audio = await new Promise((resolve, reject) => {
                        const handler = (data) => {
                            const { type, audio, sampling_rate, error } = data;
                            if (type === 'result') {
                                cleanup();
                                sampleRate = sampling_rate;
                                resolve(audio);
                            } else if (type === 'error') {
                                cleanup();
                                reject(new Error(error));
                            }
                        };

                        let cleanup;
                        const listener = (e) => handler(e.data);
                        workerRef.current.addEventListener('message', listener);
                        cleanup = () => workerRef.current.removeEventListener('message', listener);

                        postToBackend({
                            type: 'speak',
                            text: segment.text,
                            settings: { ...baseSettings, lengthScale }
                        });
                    });

                    audioChunks.push(audio);
                } else if (segment.type === 'pause') {
                    const silenceSamples = Math.floor((segment.duration / 1000) * sampleRate);
                    const silence = new Float32Array(silenceSamples);
                    audioChunks.push(silence);
                }
            }

            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combinedAudio = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
                combinedAudio.set(chunk, offset);
                offset += chunk.length;
            }

            setTtsLoading(false);
            return { audio: combinedAudio, sampling_rate: sampleRate };
        } catch (error) {
            setTtsLoading(false);
            throw error;
        }
    }, [ttsReady, ttsEngine, voice, nativeVoices]);

    return {
        useTTS, setUseTTS,
        ttsEngine, setTtsEngine,
        nativeVoices,
        ttsReady, ttsLoading, ttsProgress,
        voice, voiceCatalog, downloadedVoices, catalogLoading,
        loadVoice, generateSpeech, generateSegmentedSpeech
    };
};
