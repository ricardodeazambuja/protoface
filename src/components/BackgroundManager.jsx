import React, { useRef } from 'react';
import { Upload, X } from 'lucide-react';

const BackgroundManager = ({ onImageUpload, onClear, backgroundImage, backgroundColor, onColorChange }) => {
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                onImageUpload(event.target.result);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="input-group">
            <label className="input-label">Background</label>

            <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => onColorChange(e.target.value)}
                    style={{
                        width: '40px',
                        height: '40px',
                        padding: '0',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Solid Color</span>
            </div>

            {backgroundImage ? (
                <div style={{ position: 'relative', width: '100%', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={backgroundImage} alt="Background" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                        onClick={onClear}
                        style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => fileInputRef.current.click()}
                    className="btn-secondary"
                    style={{ width: '100%', borderStyle: 'dashed', padding: '0.8rem' }}
                >
                    <Upload size={18} style={{ marginRight: '8px' }} /> Upload Image
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        style={{ display: 'none' }}
                    />
                </button>
            )}
        </div>
    );
};

export default BackgroundManager;
