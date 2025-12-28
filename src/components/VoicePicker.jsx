import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * VoicePicker - Dropdown for selecting Piper voices.
 */
const VoicePicker = ({
    voiceCatalog,
    downloadedVoices,
    voiceSearch,
    setVoiceSearch,
    voice,
    onSelect,
    ttsEngine,
    nativeVoices
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-dark)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                zIndex: 110,
                marginBottom: '8px',
                maxHeight: '300px',
                overflowY: 'auto',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
            }}
        >
            <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
                <input
                    type="text"
                    placeholder="Search languages/voices..."
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    style={{ width: '100%', padding: '6px', fontSize: '12px' }}
                    autoFocus
                />
            </div>
            <div style={{ padding: '4px' }}>
                {ttsEngine === 'native' ? (
                    nativeVoices
                        .filter(v =>
                            v.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
                            v.lang.toLowerCase().includes(voiceSearch.toLowerCase())
                        )
                        .map(v => (
                            <button
                                key={v.name}
                                onClick={() => onSelect(v.name)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    textAlign: 'left',
                                    background: voice === v.name ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '8px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                                </div>
                                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{v.lang}</span>
                            </button>
                        ))
                ) : (
                    Object.values(voiceCatalog)
                        .filter(v =>
                            v.language.name_english.toLowerCase().includes(voiceSearch.toLowerCase()) ||
                            v.name.toLowerCase().includes(voiceSearch.toLowerCase())
                        )
                        .sort((a, b) => {
                            const aDL = downloadedVoices.includes(a.key);
                            const bDL = downloadedVoices.includes(b.key);
                            if (aDL && !bDL) return -1;
                            if (!aDL && bDL) return 1;
                            return a.language.name_english.localeCompare(b.language.name_english);
                        })
                        .slice(0, 50)
                        .map(v => {
                            const getVoiceSize = (voice) => {
                                const onnxFile = Object.values(voice.files).find(f => f.size_bytes > 1000000); // Usually the .onnx is large
                                if (onnxFile) {
                                    return (onnxFile.size_bytes / 1024 / 1024).toFixed(1) + ' MB';
                                }
                                // Fallback: try to find key ending in .onnx
                                const onnxKey = Object.keys(voice.files).find(k => k.endsWith('.onnx'));
                                if (onnxKey) {
                                    return (voice.files[onnxKey].size_bytes / 1024 / 1024).toFixed(1) + ' MB';
                                }
                                return '';
                            };

                            const getQualityColor = (quality) => {
                                switch (quality) {
                                    case 'high': return 'var(--accent)'; // Usually green/blue
                                    case 'medium': return '#fbbf24'; // Amber/Yellow
                                    case 'low': return '#9ca3af'; // Gray
                                    case 'x_low': return '#ef4444'; // Red
                                    default: return 'var(--text-muted)';
                                }
                            };

                            const qualityColor = getQualityColor(v.quality);

                            return (
                                <button
                                    key={v.key}
                                    onClick={() => onSelect(v.key)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        textAlign: 'left',
                                        background: voice === v.key ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                        border: 'none',
                                        color: 'white',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            {downloadedVoices.includes(v.key) && (
                                                <span style={{ fontSize: '8px', padding: '2px 4px', background: 'var(--accent)', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold', flexShrink: 0 }}>Local</span>
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{v.language.name_english} ({v.language.region})</span>
                                        </div>
                                        <span style={{
                                            fontSize: '9px',
                                            padding: '1px 4px',
                                            border: `1px solid ${qualityColor}`,
                                            color: qualityColor,
                                            borderRadius: '4px',
                                            textTransform: 'uppercase',
                                            flexShrink: 0
                                        }}>
                                            {v.quality.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', color: 'var(--text-muted)', fontSize: '10px' }}>
                                        <span>{v.name}</span>
                                        <span>{getVoiceSize(v)}</span>
                                    </div>
                                </button>
                            );
                        })
                )}
            </div>
        </motion.div>
    );
};

export default VoicePicker;
