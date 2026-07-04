import { useState, useRef, useCallback, useEffect } from 'react';
import { parseTextToAnimation } from '../utils/AnimationEngine';
import { ANALYSER_FFT_SIZE, VOLUME_NORMALIZATION_FACTOR } from '../constants';
import { debug } from '../utils/debug';

/**
 * useAnimationPlayer - Custom hook for managing the face animation loop
 * and optional audio-sync (TTS).
 */
export const useAnimationPlayer = () => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [currentPhoneme, setCurrentPhoneme] = useState('closed');
    const [expression, setExpression] = useState('neutral');
    const [currentSquash, setCurrentSquash] = useState(1.0);
    const [browJump, setBrowJump] = useState(0);
    const [ttsVolume, setTtsVolume] = useState(0);

    const animationRef = useRef(null);
    const audioContextRef = useRef(null);
    const audioSourcesRef = useRef([]);
    const analyserRef = useRef(null);
    const audioDestinationRef = useRef(null);
    const stopRef = useRef(false);

    const stopAllSources = useCallback(() => {
        for (const source of audioSourcesRef.current) {
            try { source.stop(); } catch (e) { /* already stopped */ }
        }
        audioSourcesRef.current = [];
    }, []);

    const stopAnimation = useCallback(() => {
        stopRef.current = true;
        setIsAnimating(false);
        setCurrentPhoneme('closed');
        setTtsVolume(0);
        if (animationRef.current) clearTimeout(animationRef.current);
        stopAllSources();
    }, [stopAllSources]);

    const playAnimation = useCallback(async ({
        text,
        speed = 1,
        expressiveness = 0.5,
        audioBuffer = null,
        shouldRecord = false,
        onComplete = null
    }) => {
        stopRef.current = false;
        setIsAnimating(true);

        let analyser = null;
        let speechAudioDuration = 0; // ms of actual speech audio (no pauses)

        const chunks = audioBuffer?.chunks;
        if (chunks && chunks.length > 0) {
            const { sampling_rate } = audioBuffer;
            debug('[AnimPlayer] Scheduling', chunks.length, 'audio chunks, rate:', sampling_rate);
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            if (stopRef.current) return null;

            analyser = ctx.createAnalyser();
            analyser.fftSize = ANALYSER_FFT_SIZE;
            analyserRef.current = analyser;

            if (shouldRecord) {
                if (!audioDestinationRef.current || audioDestinationRef.current.context !== ctx) {
                    audioDestinationRef.current = ctx.createMediaStreamDestination();
                }
            }

            // Schedule each segment on the AudioContext clock. Pauses are
            // gaps in the schedule instead of zero-filled buffers, and each
            // chunk's source array is released as soon as its AudioBuffer
            // copy exists — so peak memory is ~1x the speech audio instead
            // of ~3x (chunk list + concatenated array + full AudioBuffer),
            // which is what crashed iOS Safari on long scripts.
            audioSourcesRef.current = [];
            let when = ctx.currentTime + 0.05;
            for (const chunk of chunks) {
                if (chunk.type === 'pause') {
                    when += chunk.duration / 1000;
                    continue;
                }
                const buffer = ctx.createBuffer(1, chunk.audio.length, sampling_rate);
                buffer.getChannelData(0).set(chunk.audio);
                chunk.audio = null; // release the raw array for GC
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(analyser);
                if (shouldRecord) source.connect(audioDestinationRef.current);
                source.connect(ctx.destination);
                source.start(when);
                when += buffer.duration;
                speechAudioDuration += buffer.duration * 1000;
                audioSourcesRef.current.push(source);
            }
            chunks.length = 0;
            debug('[AnimPlayer] Scheduled', audioSourcesRef.current.length, 'sources, speech:', Math.round(speechAudioDuration), 'ms');
        }

        const { sequence } = parseTextToAnimation(text, speed, expressiveness);

        // Scale speech frames so the animation tracks the audio; pause
        // frames keep exact timing and match the schedule gaps above.
        const speechAnimDuration = sequence
            .filter(item => !item.isPause)
            .reduce((acc, curr) => acc + curr.duration, 0);

        const scaleFactor = speechAudioDuration > 0 && speechAnimDuration > 0
            ? speechAudioDuration / speechAnimDuration
            : 1.0;

        // Volume analysis loop
        const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
        const updateVolume = () => {
            if (!analyser || audioSourcesRef.current.length === 0) return;
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
            setTtsVolume(Math.min(1, average / VOLUME_NORMALIZATION_FACTOR));
            requestAnimationFrame(updateVolume);
        };
        if (analyser) updateVolume();

        let index = 0;
        const playNext = () => {
            if (stopRef.current) return;

            if (index >= sequence.length) {
                stopAnimation();
                if (onComplete) onComplete();
                return;
            }

            const item = sequence[index];
            if (item.expression) setExpression(item.expression);
            setCurrentPhoneme(item.phoneme);
            setCurrentSquash(item.squash || 1.0);
            setBrowJump(item.browJump || 0);

            index++;
            // Pause frames keep their exact duration (audio has matching silence)
            // Other frames scale to match audio duration
            const frameDuration = item.isPause ? item.duration : item.duration * scaleFactor;
            animationRef.current = setTimeout(playNext, frameDuration);
        };

        playNext();

        return audioDestinationRef.current?.stream || null;
    }, [stopAnimation]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (animationRef.current) clearTimeout(animationRef.current);
            stopAllSources();
        };
    }, [stopAllSources]);

    return {
        isAnimating,
        currentPhoneme,
        expression,
        currentSquash,
        browJump,
        ttsVolume,
        playAnimation,
        stopAnimation,
        setExpression // Allow manual overrides
    };
};
