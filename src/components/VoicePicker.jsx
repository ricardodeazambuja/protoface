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
    onSelect
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
                {Object.values(voiceCatalog)
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
                    .map(v => (
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
                                justifyContent: 'space-between',
                                gap: '8px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                {downloadedVoices.includes(v.key) && (
                                    <span style={{ fontSize: '8px', padding: '2px 4px', background: 'var(--accent)', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold', flexShrink: 0 }}>Local</span>
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.language.name_english} ({v.language.region})</span>
                            </div>
                            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{v.name}</span>
                        </button>
                    ))
                }
            </div>
        </motion.div>
    );
};

export default VoicePicker;
