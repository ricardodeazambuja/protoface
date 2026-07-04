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
    const audioSourceRef = useRef(null);
    const analyserRef = useRef(null);
    const audioDestinationRef = useRef(null);
    const stopRef = useRef(false);

    const stopAnimation = useCallback(() => {
        stopRef.current = true;
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
        stopRef.current = false;
        setIsAnimating(true);

        let audioSource = null;
        let analyser = null;

        if (audioBuffer && audioBuffer.audio) {
            debug('[AnimPlayer] Creating AudioContext, audio length:', audioBuffer.audio.length);
            debug('[AnimPlayer] Step 1: Checking AudioContext...');
            if (!audioContextRef.current) {
                debug('[AnimPlayer] Step 2: Creating new AudioContext...');
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                debug('[AnimPlayer] Step 2: AudioContext created');
            }
            debug('[AnimPlayer] Step 3: Checking if suspended...');
            if (audioContextRef.current.state === 'suspended') {
                debug('[AnimPlayer] Step 3: Resuming AudioContext...');
                await audioContextRef.current.resume();
                debug('[AnimPlayer] Step 3: AudioContext resumed');
            }
            if (stopRef.current) return;

            const { audio, sampling_rate } = audioBuffer;
            debug('[AnimPlayer] Step 4: Creating audio buffer, samples:', audio.length, 'rate:', sampling_rate);
            const buffer = audioContextRef.current.createBuffer(1, audio.length, sampling_rate);
            debug('[AnimPlayer] Step 5: Copying audio data to buffer...');
            buffer.getChannelData(0).set(audio);
            debug('[AnimPlayer] Step 6: Audio buffer ready');

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

        const audioDuration = (audioBuffer && audioBuffer.audio) ? (audioBuffer.audio.length / audioBuffer.sampling_rate) * 1000 : 0;
        // Audio also includes pauses, so subtract them for speech-only comparison
        const speechAudioDuration = audioDuration - totalPauseDuration;
        const scaleFactor = speechAudioDuration > 0 && speechAnimDuration > 0
            ? speechAudioDuration / speechAnimDuration
            : 1.0;

        if (audioSource) {
            debug('[AnimPlayer] Starting audio playback...');
            audioSource.start();
            debug('[AnimPlayer] Audio started');
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
