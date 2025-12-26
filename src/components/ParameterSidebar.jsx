import React from 'react';
import { motion } from 'framer-motion';
import { Move } from 'lucide-react';
import BackgroundManager from './BackgroundManager';
import { emotionParams } from '../utils/emotions';

/**
 * ParameterSidebar - Controls for face customization, background, and movement.
 */
const ParameterSidebar = ({
    backgroundImage,
    setBackgroundImage,
    backgroundColor,
    setBackgroundColor,
    isManualMode,
    setIsManualMode,
    expression,
    setExpression,
    manualParams,
    setManualParams,
    eyeSpacing,
    setEyeSpacing,
    eyeSize,
    setEyeSize,
    mouthScale,
    setMouthScale,
    teethGap,
    setTeethGap,
    faceTransform,
    handleTransformChange,
    animationSpeed,
    setAnimationSpeed,
    expressiveness,
    setExpressiveness
}) => {
    return (
        <aside className="sidebar">
            <BackgroundManager
                backgroundImage={backgroundImage}
                backgroundColor={backgroundColor}
                onImageUpload={setBackgroundImage}
                onColorChange={setBackgroundColor}
                onClear={() => setBackgroundImage(null)}
            />

            <div className="input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label className="input-label">Emotion Presets</label>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={isManualMode}
                            onChange={(e) => {
                                setIsManualMode(e.target.checked);
                                if (e.target.checked) {
                                    setManualParams([...(emotionParams[expression] || emotionParams.neutral)]);
                                }
                            }}
                        />
                        Manual Mode
                    </label>
                </div>

                {!isManualMode ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        {['neutral', 'joy', 'glee', 'surprised', 'shock', 'worried', 'sad', 'angry', 'fear'].map((exp) => (
                            <button
                                key={exp}
                                onClick={() => setExpression(exp)}
                                style={{
                                    padding: '6px',
                                    borderRadius: '4px',
                                    border: `1px solid ${expression === exp ? 'var(--accent)' : 'var(--border)'}`,
                                    background: expression === exp ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-dark)',
                                    color: 'white',
                                    fontSize: '11px',
                                    textTransform: 'capitalize',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {exp}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                            { label: 'Mouth Open (m)', index: 0, min: 0, max: 1 },
                            { label: 'Upper Lip (p)', index: 1, min: 0, max: 1 },
                            { label: 'Lower Lip (q)', index: 2, min: 0, max: 1 },
                            { label: 'Rounded (r)', index: 3, min: 0, max: 1 },
                            { label: 'Smile (s)', index: 4, min: 0, max: 1 },
                            { label: 'Skew', index: 5, min: -1, max: 1 },
                            { label: 'Rotate', index: 6, min: -1, max: 1 },
                            { label: 'Brow Lift', index: 7, min: -1, max: 1 },
                            { label: 'Brow Angle', index: 8, min: -1, max: 1 },
                        ].map((param) => (
                            <div key={param.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <label style={{ fontSize: '10px', color: 'var(--text-muted)', width: '70px' }}>{param.label}</label>
                                <input
                                    type="range"
                                    min={param.min}
                                    max={param.max}
                                    step="0.1"
                                    value={manualParams[param.index]}
                                    onChange={(e) => {
                                        const newParams = [...manualParams];
                                        newParams[param.index] = parseFloat(e.target.value);
                                        setManualParams(newParams);
                                    }}
                                    style={{ flex: 1, height: '4px' }}
                                />
                                <span style={{ fontSize: '10px', width: '24px', textAlign: 'right' }}>{manualParams[param.index].toFixed(1)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="input-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="input-label">Eye Spacing</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{eyeSpacing}px</span>
                </div>
                <input
                    type="range"
                    min="20"
                    max="70"
                    step="1"
                    value={eyeSpacing}
                    onChange={(e) => setEyeSpacing(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div className="input-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="input-label">Eye Size</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{eyeSize}px</span>
                </div>
                <input
                    type="range"
                    min="5"
                    max="30"
                    step="1"
                    value={eyeSize}
                    onChange={(e) => setEyeSize(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div className="input-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="input-label">Mouth Width</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{mouthScale}x</span>
                </div>
                <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={mouthScale}
                    onChange={(e) => setMouthScale(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div className="input-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="input-label">Teeth Gap (Speech)</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{teethGap.toFixed(1)}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={teethGap}
                    onChange={(e) => setTeethGap(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '-0.5rem' }}>
                    <Move size={16} style={{ color: 'var(--accent)' }} />
                    <label className="input-label" style={{ color: 'var(--text-main)', fontWeight: '600' }}>Face Position</label>
                </div>
                <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="input-label">Left / Right</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{faceTransform.x}px</span>
                    </div>
                    <input type="range" min="-300" max="300" value={faceTransform.x} onChange={(e) => handleTransformChange('x', parseInt(e.target.value))} />
                </div>
                <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="input-label">Up / Down</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{faceTransform.y}px</span>
                    </div>
                    <input type="range" min="-200" max="200" value={faceTransform.y} onChange={(e) => handleTransformChange('y', parseInt(e.target.value))} />
                </div>
                <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="input-label">Scale</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{faceTransform.scale.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="0.2" max="3" step="0.1" value={faceTransform.scale} onChange={(e) => handleTransformChange('scale', parseFloat(e.target.value))} />
                </div>
                <div className="input-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="input-label">Rotation</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{faceTransform.rotate}°</span>
                    </div>
                    <input type="range" min="-180" max="180" value={faceTransform.rotate} onChange={(e) => handleTransformChange('rotate', parseInt(e.target.value))} />
                </div>
            </div>

            <div className="input-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <label className="input-label">Animation Speed ({animationSpeed}x)</label>
                <input
                    type="range"
                    min="0.2"
                    max="3"
                    step="0.1"
                    value={animationSpeed}
                    onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>

            <div className="input-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <label className="input-label">Cartoon Level ({expressiveness})</label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={expressiveness}
                    onChange={(e) => setExpressiveness(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                />
            </div>
        </aside>
    );
};

export default ParameterSidebar;
