import { useState, useRef, useCallback, useEffect } from 'react';
import { parseTextToAnimation } from '../utils/AnimationEngine';
import { ANALYSER_FFT_SIZE, VOLUME_NORMALIZATION_FACTOR } from '../constants';

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
    const audioSourceRef = useRef(null);
    const analyserRef = useRef(null);
    const audioDestinationRef = useRef(null);

    const stopAnimation = useCallback(() => {
        setIsAnimating(false);
        setCurrentPhoneme('closed');
        setTtsVolume(0);
        if (animationRef.current) clearTimeout(animationRef.current);
        if (audioSourceRef.current) {
            try { audioSourceRef.current.stop(); } catch (e) { }
            audioSourceRef.current = null;
        }
    }, []);

    const playAnimation = useCallback(async ({
        text,
        speed = 1,
        expressiveness = 0.5,
        audioBuffer = null,
        shouldRecord = false,
        onComplete = null
    }) => {
        setIsAnimating(true);

        let audioSource = null;
        let analyser = null;

        if (audioBuffer) {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            const { audio, sampling_rate } = audioBuffer;
            const buffer = audioContextRef.current.createBuffer(1, audio.length, sampling_rate);
            buffer.getChannelData(0).set(audio);

            audioSource = audioContextRef.current.createBufferSource();
            audioSource.buffer = buffer;
            audioSourceRef.current = audioSource;

            analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = ANALYSER_FFT_SIZE;
            analyserRef.current = analyser;
            audioSource.connect(analyser);

            if (shouldRecord) {
                if (!audioDestinationRef.current || audioDestinationRef.current.context !== audioContextRef.current) {
                    audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
                }
                audioSource.connect(audioDestinationRef.current);
            }
            audioSource.connect(audioContextRef.current.destination);
        }

        const { sequence } = parseTextToAnimation(text, speed, expressiveness);

        // Calculate durations excluding pauses (which have fixed timing)
        const totalPauseDuration = sequence
            .filter(item => item.isPause)
            .reduce((acc, curr) => acc + curr.duration, 0);
        const speechAnimDuration = sequence
            .filter(item => !item.isPause)
            .reduce((acc, curr) => acc + curr.duration, 0);

        const audioDuration = audioBuffer ? (audioBuffer.audio.length / audioBuffer.sampling_rate) * 1000 : 0;
        // Audio also includes pauses, so subtract them for speech-only comparison
        const speechAudioDuration = audioDuration - totalPauseDuration;
        const scaleFactor = speechAudioDuration > 0 && speechAnimDuration > 0
            ? speechAudioDuration / speechAnimDuration
            : 1.0;

        if (audioSource) {
            audioSource.start();
        }

        // Volume analysis loop
        const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
        const updateVolume = () => {
            if (!analyser || !audioSourceRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
            setTtsVolume(Math.min(1, average / VOLUME_NORMALIZATION_FACTOR));
            requestAnimationFrame(updateVolume);
        };
        if (analyser) updateVolume();

        let index = 0;
        const playNext = () => {
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
            if (audioSourceRef.current) audioSourceRef.current.stop();
        };
    }, []);

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
