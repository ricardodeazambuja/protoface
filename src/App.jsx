import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Face from './components/Face';
import ErrorBoundary from './components/ErrorBoundary';
import { useTTS } from './hooks/useTTS';
import { useAnimationPlayer } from './hooks/useAnimationPlayer';
import { useRecorder } from './hooks/useRecorder';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { emotionParams } from './utils/emotions';
import { DEFAULT_BACKGROUND_COLOR, DEFAULT_EYE_SIZE, DEFAULT_EYE_SPACING } from './constants';
import ParameterSidebar from './components/ParameterSidebar';
import ScriptPanel from './components/ScriptPanel';

function App() {
    const [text, setText] = useState("Hello! <joy> I am happy now! <sad> But now I am sad... <shock> Oh my god! <neutral> Back to normal.");
    const [targetLook, setTargetLook] = useState(null);

    // Initial manual params (based on neutral)
    const [manualParams, setManualParams] = useState([0.5, 0.0, 0.0, 0.5, 0.8, 0.0, 0.0, 0.0, 0.0]);
    const [isManualMode, setIsManualMode] = useState(false);

    const [backgroundImage, setBackgroundImage] = useState(null);
    const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
    const [faceTransform, setFaceTransform] = useState({ x: 0, y: 0, scale: 1, rotate: 0 });
    const [teethGap, setTeethGap] = useState(0.5);
    const [eyeSpacing, setEyeSpacing] = useState(DEFAULT_EYE_SPACING);
    const [eyeSize, setEyeSize] = useState(DEFAULT_EYE_SIZE);
    const [mouthScale, setMouthScale] = useState(1); // Default scale X 1
    const [expressiveness, setExpressiveness] = useState(0.5); // 0 (Realistic) to 1 (Pixar)
    const [animationSpeed, setAnimationSpeed] = useState(1);
    const [pendingVoice, setPendingVoice] = useState(null);
    const [voiceSearch, setVoiceSearch] = useState('');
    const [showVoicePicker, setShowVoicePicker] = useState(false);

    const canvasRef = useRef(null);
    const audioBufferRef = useRef(null);
    const pendingPlayRef = useRef(null);

    // Animation & Recording Hooks
    const {
        isAnimating, currentPhoneme, expression,
        currentSquash, browJump, ttsVolume,
        playAnimation, stopAnimation, setExpression
    } = useAnimationPlayer();

    const {
        isRecording, lastVideoUrl,
        startRecording, stopRecording
    } = useRecorder('face-capture-area');

    const {
        useTTS: useTTS_enabled, setUseTTS,
        ttsReady, ttsLoading, ttsProgress,
        voice, voiceCatalog, downloadedVoices, catalogLoading,
        loadVoice, generateSpeech, generateSegmentedSpeech
    } = useTTS(
        (audio, sampling_rate) => {
            audioBufferRef.current = { audio, sampling_rate };
            if (pendingPlayRef.current) {
                const { record } = pendingPlayRef.current;
                pendingPlayRef.current = null;
                handlePlay(record); // Re-trigger play with audio
            }
        },
        (error) => alert('TTS Error: ' + error)
    );

    const [showConsent, setShowConsent] = useState(false);
    const [ttsRate, setTtsRate] = useState(1.0);
    const [ttsVolatility, setTtsVolatility] = useState(0.667);
    const [ttsVariation, setTtsVariation] = useState(0.8);
    const [speakerId, setSpeakerId] = useState(0);

    // PWA Install Prompt
    const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

    // Helper functions defined before they are used in startPlayback/useEffect
    const handlePlay = async (record = false) => {
        const shouldRecord = record === true;
        if (isAnimating || ttsLoading) return;

        if (useTTS_enabled && !audioBufferRef.current) {
            if (!ttsReady) {
                alert("Please wait for the voice model to finish loading.");
                return;
            }
            // Use segmented speech generation for script tag support
            try {
                const result = await generateSegmentedSpeech(text, {
                    noiseScale: ttsVolatility,
                    noiseWScale: ttsVariation,
                    speakerId: speakerId
                });
                audioBufferRef.current = result;
            } catch (error) {
                alert('TTS Error: ' + error.message);
                return;
            }
        }

        const stream = await playAnimation({
            text,
            speed: animationSpeed,
            expressiveness,
            audioBuffer: audioBufferRef.current,
            shouldRecord,
            onComplete: async () => {
                if (shouldRecord) {
                    await stopRecording();
                }
            }
        });

        if (shouldRecord) {
            await startRecording(stream);
        }

        // Reset audio buffer after start
        audioBufferRef.current = null;
    };

    const handleStop = async () => {
        stopAnimation();
        await stopRecording();
    };


    const handleTtsToggle = useCallback((checked) => {
        if (checked) {
            setUseTTS(true);
        } else {
            setUseTTS(false);
        }
    }, []);

    const confirmConsent = () => {
        setShowConsent(false);
        const targetVoice = pendingVoice || voice;
        loadVoice(targetVoice);
        setPendingVoice(null);
    };

    const handleCanvasClick = (e) => {
        if (!canvasRef.current || isAnimating) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        setTargetLook({ x: x * 1.5, y: y * 0.8 });
    };

    const handleTransformChange = (key, value) => {
        setFaceTransform(prev => ({ ...prev, [key]: value }));
    };

    const resetLook = () => setTargetLook(null);


    return (
        <div className="container">
            <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 style={{ fontSize: '3.5rem', marginBottom: '0.5rem', background: 'linear-gradient(to right, #60a5fa, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        ProtoFace
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem' }}>
                        Create animated characters that speak your words.
                    </p>
                    {/* PWA Install Button */}
                    {canInstall && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={promptInstall}
                            style={{
                                marginTop: '1rem',
                                padding: '0.5rem 1.5rem',
                                background: 'linear-gradient(135deg, #60a5fa, #a855f7)',
                                border: 'none',
                                borderRadius: '25px',
                                color: 'white',
                                fontWeight: '600',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                boxShadow: '0 4px 15px rgba(96, 165, 250, 0.3)'
                            }}
                        >
                            📲 Install App
                        </motion.button>
                    )}
                    {isInstalled && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                display: 'inline-block',
                                marginTop: '1rem',
                                padding: '0.4rem 1rem',
                                background: 'rgba(34, 197, 94, 0.2)',
                                border: '1px solid rgba(34, 197, 94, 0.5)',
                                borderRadius: '20px',
                                color: '#22c55e',
                                fontSize: '0.85rem'
                            }}
                        >
                            ✓ Installed
                        </motion.span>
                    )}
                </motion.div>
            </header>

            <main className="main-layout">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div
                        className="face-canvas-container"
                        id="face-capture-area"
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        style={{
                            cursor: 'crosshair',
                            backgroundColor: backgroundColor,
                            backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        <ErrorBoundary>
                            <Face
                                phoneme={currentPhoneme}
                                isAnimating={isAnimating}
                                expression={expression}
                                targetLook={targetLook}
                                transform={faceTransform}
                                teethGap={teethGap}
                                eyeSpacing={eyeSpacing}
                                eyeSize={eyeSize}
                                mouthScale={mouthScale}
                                squash={currentSquash}
                                browJump={browJump}
                                ttsVolume={useTTS_enabled ? ttsVolume : 0}
                                customParams={isManualMode ? manualParams : null}
                            />
                        </ErrorBoundary>

                        {/* Interactive Hint */}
                        {!targetLook && !isAnimating && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.6 }}
                                style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', pointerEvents: 'none', whiteSpace: 'nowrap' }}
                            >
                                Click anywhere to set eyes look direction
                            </motion.div>
                        )}

                        {targetLook && (
                            <button
                                onClick={(e) => { e.stopPropagation(); resetLook(); }}
                                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border)', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', zIndex: 10 }}
                            >
                                Reset Look
                            </button>
                        )}
                    </div>

                    <ScriptPanel
                        text={text}
                        setText={setText}
                        isAnimating={isAnimating}
                        ttsLoading={ttsLoading}
                        useTTS_enabled={useTTS_enabled}
                        setUseTTS={setUseTTS}
                        handlePlay={handlePlay}
                        handleStop={handleStop}
                        isRecording={isRecording}
                        lastVideoUrl={lastVideoUrl}
                        ttsReady={ttsReady}
                        voice={voice}
                        voiceCatalog={voiceCatalog}
                        downloadedVoices={downloadedVoices}
                        voiceSearch={voiceSearch}
                        setVoiceSearch={setVoiceSearch}
                        showVoicePicker={showVoicePicker}
                        setShowVoicePicker={setShowVoicePicker}
                        onVoiceSelect={(voiceKey) => {
                            if (downloadedVoices.includes(voiceKey)) {
                                loadVoice(voiceKey);
                                setShowVoicePicker(false);
                            } else {
                                setPendingVoice(voiceKey);
                                setShowConsent(true);
                                setShowVoicePicker(false);
                            }
                        }}
                        ttsRate={ttsRate}
                        setTtsRate={setTtsRate}
                        ttsVolatility={ttsVolatility}
                        setTtsVolatility={setTtsVolatility}
                        ttsVariation={ttsVariation}
                    />
                </div>

                <ParameterSidebar
                    backgroundImage={backgroundImage}
                    setBackgroundImage={setBackgroundImage}
                    backgroundColor={backgroundColor}
                    setBackgroundColor={setBackgroundColor}
                    isManualMode={isManualMode}
                    setIsManualMode={setIsManualMode}
                    expression={expression}
                    setExpression={setExpression}
                    manualParams={manualParams}
                    setManualParams={setManualParams}
                    eyeSpacing={eyeSpacing}
                    setEyeSpacing={setEyeSpacing}
                    eyeSize={eyeSize}
                    setEyeSize={setEyeSize}
                    mouthScale={mouthScale}
                    setMouthScale={setMouthScale}
                    teethGap={teethGap}
                    setTeethGap={setTeethGap}
                    faceTransform={faceTransform}
                    handleTransformChange={handleTransformChange}
                    animationSpeed={animationSpeed}
                    setAnimationSpeed={setAnimationSpeed}
                    expressiveness={expressiveness}
                    setExpressiveness={setExpressiveness}
                />
            </main>

            <footer style={{ marginTop: 'auto', padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <p>© 2025 ProtoFace.</p>
                <p style={{ marginTop: '0.5rem' }}>
                    Inspired by <a href="https://www.redblobgames.com/x/1845-face-generator/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Amit Patel's Face Generator</a> at <a href="https://www.redblobgames.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Red Blob Games</a>.
                </p>
            </footer>

            <AnimatePresence>
                {showConsent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '2rem' }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="glass-panel"
                            style={{ maxWidth: '500px', padding: '2.5rem', textAlign: 'center' }}
                        >
                            <h2 style={{ marginBottom: '1rem', color: 'white' }}>Download Voice Model?</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                                {pendingVoice ? (
                                    <>
                                        You selected <strong>{voiceCatalog[pendingVoice]?.language?.name_english} - {voiceCatalog[pendingVoice]?.name}</strong>.
                                        <br />
                                        Size: ~{(Object.values(voiceCatalog[pendingVoice]?.files || {}).reduce((acc, f) => acc + f.size_bytes, 0) / (1024 * 1024)).toFixed(1)} MB.
                                    </>
                                ) : (
                                    "To use Neural TTS, we need to download the voice model files (~50MB)."
                                )}
                            </p>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '13px' }}>
                                Files will be stored in your browser's persistent cache.
                            </p>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                <button className="btn-secondary" onClick={() => { setShowConsent(false); setPendingVoice(null); }}>Cancel</button>
                                <button className="btn-primary" onClick={confirmConsent}>Download & Use</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {ttsLoading && (
                <div style={{ position: 'fixed', bottom: '2rem', left: '2rem', zIndex: 90 }}>
                    <div className="glass-panel" style={{ padding: '1rem 1.5rem', minWidth: '250px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '13px', color: 'white' }}>
                                {ttsReady ? 'Synthesizing...' : (downloadedVoices.includes(voice) ? 'Loading Voice...' : 'Downloading Model...')}
                            </span>
                            <span style={{ fontSize: '13px', color: 'var(--accent)' }}>{(ttsProgress * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <motion.div
                                animate={{ width: `${ttsProgress * 100}%` }}
                                style={{ height: '100%', background: 'var(--accent)' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Version badge for deployment verification */}
            <div style={{
                position: 'fixed',
                bottom: '0.5rem',
                right: '0.5rem',
                fontSize: '10px',
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'monospace'
            }}>
                v1.18.0
            </div>
        </div >
    );
}

export default App;
