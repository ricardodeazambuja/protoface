import { useState, useRef, useCallback } from 'react';
import { AnimationRecorder } from '../utils/Recorder';

/**
 * useRecorder - Custom hook for managing the AnimationRecorder lifecycle.
 */
export const useRecorder = (elementId) => {
    const [isRecording, setIsRecording] = useState(false);
    const [lastVideoUrl, setLastVideoUrl] = useState(null);
    const [lastVideoExt, setLastVideoExt] = useState('webm');
    const recorderRef = useRef(null);

    const startRecording = useCallback(async (audioStream = null) => {
        setIsRecording(true);
        setLastVideoUrl(null);
        recorderRef.current = new AnimationRecorder(elementId);
        try {
            await recorderRef.current.start(audioStream);
        } catch (err) {
            setIsRecording(false);
            recorderRef.current = null;
            throw err;
        }
    }, [elementId]);

    const stopRecording = useCallback(async () => {
        if (recorderRef.current && recorderRef.current.isRecording) {
            const blob = await recorderRef.current.stop();
            setIsRecording(false);
            if (blob) {
                const url = URL.createObjectURL(blob);
                setLastVideoUrl(url);
                setLastVideoExt(blob.type.includes('mp4') ? 'mp4' : 'webm');
                return url;
            }
        }
        setIsRecording(false);
        return null;
    }, []);

    return {
        isRecording,
        lastVideoUrl,
        lastVideoExt,
        startRecording,
        stopRecording
    };
};
