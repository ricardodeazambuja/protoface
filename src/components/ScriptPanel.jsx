import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Download, Settings2, HelpCircle, X } from 'lucide-react';
import VoicePicker from './VoicePicker';

/**
 * ScriptPanel - The primary interface for entering text and controlling playback.
 */
const ScriptPanel = ({
    text,
    setText,
    isAnimating,
    ttsLoading,
    useTTS_enabled,
    setUseTTS,
    handlePlay,
    handleStop,
    isRecording,
    lastVideoUrl,
    ttsReady,
    voice,
    voiceCatalog,
    downloadedVoices,
    voiceSearch,
    setVoiceSearch,
    showVoicePicker,
    setShowVoicePicker,
    onVoiceSelect,
    ttsRate,
    setTtsRate,
    ttsVolatility,
    setTtsVolatility,
    ttsVariation,
    setTtsVariation
}) => {
    const [showHelp, setShowHelp] = useState(false);

    return (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
            {/* Script Tags Help Modal */}
            <AnimatePresence>
                {showHelp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000
                        }}
                        onClick={() => setShowHelp(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'var(--bg-card)',
                                borderRadius: '16px',
                                padding: '1.5rem',
                                maxWidth: '500px',
                                width: '90%',
                                maxHeight: '80vh',
                                overflow: 'auto',
                                border: '1px solid var(--border)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0 }}>Script Tags Reference</h3>
                                <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 0' }}>Tag</th>
                                        <th style={{ textAlign: 'left', padding: '8px 0' }}>Effect</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--accent)' }}>&lt;joy&gt;</td>
                                        <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>Switch emotion (joy, sad, angry, etc.)</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--accent)' }}>&lt;pause:500&gt;</td>
                                        <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>Insert pause (milliseconds)</td>
                                    </tr>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--accent)' }}>&lt;speed:1.5&gt;</td>
                                        <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>Change animation speed (0.1-5x)</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '8px 0', fontFamily: 'monospace', color: 'var(--accent)' }}>&lt;emphasis&gt;...&lt;/emphasis&gt;</td>
                                        <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>Add visual emphasis</td>
                                    </tr>
                                </tbody>
                            </table>
                            <p style={{ marginTop: '1rem', fontSize: '12px', color: 'var(--text-muted)' }}>
                                Example: Hello! &lt;pause:500&gt; I am &lt;joy&gt;&lt;emphasis&gt;happy&lt;/emphasis&gt;!
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="input-label">Script</label>
                    <button
                        onClick={() => setShowHelp(true)}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            color: 'var(--text-muted)'
                        }}
                    >
                        <HelpCircle size={14} />
                        Tag Reference
                    </button>
                </div>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter speech text..."
                    rows={4}
                    style={{ minHeight: '120px' }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings2 size={16} style={{ color: 'var(--accent)' }} />
                            <label className="input-label" style={{ marginBottom: 0 }}>Voice Settings</label>
                        </div>
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={useTTS_enabled}
                                onChange={(e) => setUseTTS(e.target.checked)}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>

                    {useTTS_enabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ position: 'relative' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowVoicePicker(!showVoicePicker)}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        border: voice ? '1px solid var(--border)' : '1px dashed var(--accent)',
                                        background: voice ? 'rgba(255,255,255,0.05)' : 'rgba(59, 130, 246, 0.1)',
                                        fontSize: '12px'
                                    }}
                                >
                                    <span>{voice ? (voiceCatalog[voice]?.language?.name_english + " - " + voiceCatalog[voice]?.name) : "Select a voice..."}</span>
                                    <motion.span animate={{ rotate: showVoicePicker ? 180 : 0 }}>▼</motion.span>
                                </button>

                                <AnimatePresence>
                                    {showVoicePicker && (
                                        <VoicePicker
                                            voiceCatalog={voiceCatalog}
                                            downloadedVoices={downloadedVoices}
                                            voiceSearch={voiceSearch}
                                            setVoiceSearch={setVoiceSearch}
                                            voice={voice}
                                            onSelect={onVoiceSelect}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>

                            {ttsReady && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Speaking Rate</label>
                                        <span style={{ fontSize: '10px' }}>{ttsRate.toFixed(1)}x</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.2"
                                        max="3"
                                        step="0.1"
                                        value={ttsRate}
                                        onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                                        style={{ height: '4px' }}
                                    />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Voice Volatility</label>
                                        <span style={{ fontSize: '10px' }}>{ttsVolatility.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1.5"
                                        step="0.01"
                                        value={ttsVolatility}
                                        onChange={(e) => setTtsVolatility(parseFloat(e.target.value))}
                                        style={{ height: '4px' }}
                                    />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Cadence Variation</label>
                                        <span style={{ fontSize: '10px' }}>{ttsVariation.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1.5"
                                        step="0.01"
                                        value={ttsVariation}
                                        onChange={(e) => setTtsVariation(parseFloat(e.target.value))}
                                        style={{ height: '4px' }}
                                    />
                                </motion.div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    {!isAnimating ? (
                        <button className="btn-primary" onClick={() => handlePlay(false)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }} disabled={ttsLoading}>
                            <Play size={20} /> Preview Animation
                        </button>
                    ) : (
                        <button className="btn-secondary" onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, color: '#ef4444' }}>
                            <Square size={20} /> Stop
                        </button>
                    )}
                    <button
                        className="btn-secondary"
                        onClick={() => handlePlay(true)}
                        disabled={isAnimating}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isAnimating ? 0.5 : 1, flex: 1 }}
                    >
                        <Download size={20} /> {isRecording ? 'Recording...' : 'Export Video'}
                    </button>
                </div>

                {lastVideoUrl && !isAnimating && (
                    <motion.a
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        href={lastVideoUrl}
                        download={`protoface-${Date.now()}.webm`}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'rgba(34, 197, 94, 0.1)', borderColor: '#22c55e', color: '#4ade80', textDecoration: 'none' }}
                    >
                        <Download size={18} /> Download Last Recording
                    </motion.a>
                )}
            </div>
        </div>
    );
};

export default ScriptPanel;
