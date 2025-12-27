import { useState, useRef, useEffect, useCallback } from 'react';
import {
    VOICE_CATALOG_URL,
    CACHE_EXPIRY_MS,
    TTS_MODE_LOCAL,
    TTS_MODE_REMOTE
} from '../constants';
import { parseScriptSegments } from '../utils/parseScriptSegments';
import localVoiceCatalog from '../data/voices.json';
import { TTSBridge } from '../utils/TTSBridge';

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

    const workerRef = useRef(null);
    const bridgeRef = useRef(null);

    // Initialize Backend (Worker or Bridge)
    useEffect(() => {
        if (mode === TTS_MODE_LOCAL) {
            console.log('[useTTS] Initializing Local Worker Backend');
            workerRef.current = new Worker(new URL('../utils/piperWorker.js', import.meta.url), { type: 'module' });

            workerRef.current.onmessage = (e) => handleBackendMessage(e.data);
        } else if (mode === TTS_MODE_REMOTE) {
            console.log('[useTTS] Initializing Remote Bridge Backend');
            bridgeRef.current = new TTSBridge('client');

            bridgeRef.current.onMessage((message) => {
                const { type, payload } = message;
                if (type && type.startsWith('response:')) {
                    handleBackendMessage({ type: type.replace('response:', ''), ...payload });
                }
            });
        }

        return () => {
            if (workerRef.current) workerRef.current.terminate();
            if (bridgeRef.current) bridgeRef.current.destroy();
        };
    }, [mode]);

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
        if (mode === TTS_MODE_LOCAL && workerRef.current) {
            workerRef.current.postMessage(message);
        } else if (mode === TTS_MODE_REMOTE && bridgeRef.current) {
            bridgeRef.current.postMessage({
                type: `request:${message.type}`,
                payload: message
            });
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
        const voiceInfo = voiceCatalog[voiceId];
        setTtsLoading(true);
        setTtsReady(false);
        setVoice(voiceId);

        if (voiceInfo) {
            const baseUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
            const modelPath = Object.keys(voiceInfo.files).find(f => f.endsWith('.onnx'));
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
    }, [voiceCatalog, mode]);

    const generateSpeech = useCallback((text, settings) => {
        if (!ttsReady) return;
        setTtsLoading(true);
        const cleanText = text.replace(/<[^>]*>/g, '');
        postToBackend({
            type: 'speak',
            text: cleanText,
            settings
        });
    }, [ttsReady, mode]);

    const generateSegmentedSpeech = useCallback(async (script, baseSettings = {}) => {
        if (!ttsReady) {
            throw new Error('TTS not ready');
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
                        if (mode === TTS_MODE_LOCAL) {
                            const listener = (e) => handler(e.data);
                            workerRef.current.addEventListener('message', listener);
                            cleanup = () => workerRef.current.removeEventListener('message', listener);
                        } else {
                            // For remote, we listen through the bridge temporarily
                            const originalOnMessage = bridgeRef.current.onMessageCallback;
                            bridgeRef.current.onMessage((msg) => {
                                if (msg.type && msg.type.startsWith('response:')) {
                                    handler({ type: msg.type.replace('response:', ''), ...msg.payload });
                                }
                            });
                            cleanup = () => bridgeRef.current.onMessage(originalOnMessage);
                        }

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
    }, [ttsReady, mode]);

    return {
        useTTS, setUseTTS,
        ttsReady, ttsLoading, ttsProgress,
        voice, voiceCatalog, downloadedVoices, catalogLoading,
        loadVoice, generateSpeech, generateSegmentedSpeech
    };
};
