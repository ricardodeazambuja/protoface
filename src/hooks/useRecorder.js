import { useState, useRef, useCallback } from 'react';
import { AnimationRecorder } from '../utils/Recorder';

/**
 * useRecorder - Custom hook for managing the AnimationRecorder lifecycle.
 */
export const useRecorder = (elementId) => {
    const [isRecording, setIsRecording] = useState(false);
    const [lastVideoUrl, setLastVideoUrl] = useState(null);
    const recorderRef = useRef(null);

    const startRecording = useCallback(async (audioStream = null) => {
        setIsRecording(true);
        setLastVideoUrl(null);
        recorderRef.current = new AnimationRecorder(elementId);
        await recorderRef.current.start(audioStream);
    }, [elementId]);

    const stopRecording = useCallback(async () => {
        if (recorderRef.current && recorderRef.current.isRecording) {
            const blob = await recorderRef.current.stop();
            setIsRecording(false);
            if (blob) {
                const url = URL.createObjectURL(blob);
                setLastVideoUrl(url);
                return url;
            }
        }
        setIsRecording(false);
        return null;
    }, []);

    return {
        isRecording,
        lastVideoUrl,
        startRecording,
        stopRecording
    };
};
