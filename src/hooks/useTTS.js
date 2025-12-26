import { useState, useRef, useEffect, useCallback } from 'react';
import { VOICE_CATALOG_URL, CACHE_EXPIRY_MS } from '../constants';
import { parseScriptSegments } from '../utils/parseScriptSegments';

/**
 * useTTS - Custom hook for managing the Piper TTS Web Worker,
 * voice catalog, and model downloads.
 */
export const useTTS = (onAudioResult, onError) => {
    const [useTTS, setUseTTS] = useState(false);
    const [ttsReady, setTtsReady] = useState(false);
    const [ttsLoading, setTtsLoading] = useState(false);
    const [ttsProgress, setTtsProgress] = useState(0);
    const [voice, setVoice] = useState('');
    const [voiceCatalog, setVoiceCatalog] = useState({});
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [downloadedVoices, setDownloadedVoices] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('protoface-downloaded-voices') || '[]');
        } catch (e) { return []; }
    });

    const workerRef = useRef(null);

    // Initialize worker
    useEffect(() => {
        workerRef.current = new Worker(new URL('../utils/piperWorker.js', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e) => {
            const { type, progress, audio, sampling_rate, error } = e.data;
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

        const fetchCatalog = async () => {
            const CACHE_KEY = 'protoface-voice-catalog';
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { data, timestamp } = JSON.parse(cached);
                    if (Date.now() - timestamp < CACHE_EXPIRY_MS) {
                        setVoiceCatalog(data);
                        return;
                    }
                }
                setCatalogLoading(true);
                const response = await fetch(VOICE_CATALOG_URL);
                const data = await response.json();
                setVoiceCatalog(data);
                localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
            } catch (e) {
                console.error("Failed to fetch voice catalog:", e);
            } finally {
                setCatalogLoading(false);
            }
        };
        fetchCatalog();

        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []); // Initial load

    // Update the 'loaded' voice tracker when voice changes and ttsReady becomes true
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
        const voiceInfo = voiceCatalog[voiceId];
        setTtsLoading(true);
        setTtsReady(false);
        setVoice(voiceId);

        if (voiceInfo) {
            const baseUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
            const modelPath = Object.keys(voiceInfo.files).find(f => f.endsWith('.onnx'));
            const configPath = Object.keys(voiceInfo.files).find(f => f.endsWith('.onnx.json'));
            workerRef.current.postMessage({
                type: 'load',
                voiceId: voiceId,
                modelUrl: baseUrl + modelPath,
                configUrl: baseUrl + configPath
            });
        } else {
            workerRef.current.postMessage({ type: 'load', modelId: voiceId });
        }
    }, [voiceCatalog]);

    const generateSpeech = useCallback((text, settings) => {
        if (!ttsReady || !workerRef.current) return;
        setTtsLoading(true);
        const cleanText = text.replace(/<[^>]*>/g, '');
        workerRef.current.postMessage({
            type: 'speak',
            text: cleanText,
            settings
        });
    }, [ttsReady]);

    /**
     * Generate speech from script with support for pause and speed tags
     * Returns a Promise that resolves with the concatenated audio buffer
     */
    const generateSegmentedSpeech = useCallback(async (script, baseSettings = {}) => {
        if (!ttsReady || !workerRef.current) {
            throw new Error('TTS not ready');
        }

        const segments = parseScriptSegments(script);
        const audioChunks = [];
        let sampleRate = 22050; // Default, will be updated from first result

        setTtsLoading(true);

        try {
            for (const segment of segments) {
                if (segment.type === 'text' && segment.text.trim()) {
                    // Generate speech for this text segment
                    // Speed maps to lengthScale: lengthScale = 1 / speed
                    const lengthScale = 1 / segment.speed;

                    const audio = await new Promise((resolve, reject) => {
                        const handler = (e) => {
                            const { type, audio, sampling_rate, error } = e.data;
                            if (type === 'result') {
                                workerRef.current.removeEventListener('message', handler);
                                sampleRate = sampling_rate;
                                resolve(audio);
                            } else if (type === 'error') {
                                workerRef.current.removeEventListener('message', handler);
                                reject(new Error(error));
                            }
                        };
                        workerRef.current.addEventListener('message', handler);
                        workerRef.current.postMessage({
                            type: 'speak',
                            text: segment.text,
                            settings: { ...baseSettings, lengthScale }
                        });
                    });

                    audioChunks.push(audio);
                } else if (segment.type === 'pause') {
                    // Create silence buffer
                    const silenceSamples = Math.floor((segment.duration / 1000) * sampleRate);
                    const silence = new Float32Array(silenceSamples);
                    audioChunks.push(silence);
                }
                // Emotion segments are visual-only, skip for audio
            }

            // Concatenate all audio chunks
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
    }, [ttsReady]);

    return {
        useTTS, setUseTTS,
        ttsReady, ttsLoading, ttsProgress,
        voice, voiceCatalog, downloadedVoices, catalogLoading,
        loadVoice, generateSpeech, generateSegmentedSpeech
    };
};
