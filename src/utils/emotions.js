// Red Blob emotion parameters (m, p, q, r, s, browLift, browAngle)
export const emotionParams = {
    neutral: [0.5, 0.0, 0.0, 0.5, 0.8, 0.0, 0.0, 0.0, 0.0], // Friendly neutral (slight smile)
    joy: [2.8, 0.1, 0.3, 0.9, 1.0, 0.0, 0.0, 0.3, 0.3], // Max U-shape (high s, high m, high q/r)
    glee: [0.0, 0.5, 0.9, 0.7, 1.0, 0.0, 0.0, 0.4, -0.4],
    surprised: [3.0, 0.0, 0.0, 1.0, 0.5, 0.0, 0.0, 0.8, 0.8], // Perfect vertical oval (high m, high r for roundness)
    shock: [3.0, 0.0, 0.0, 0.9, 0.3, 0.0, 0.0, 0.9, 0.9], // Wide "O" mouth (high r for roundness, slight s for shape), very raised brows
    worried: [1.0, 1.0, 0.75, 0.7, 0.1, 0.0, 0.0, 0.0, 0.3],
    sad: [2.0, -0.2, -0.8, 0.6, 0.0, 0.0, 0.0, 0.4, 0.5], // Deep inverted frown (low s, high m)
    angry: [0.8, 0.3, 0.5, 0.9, 0.1, 0.0, 0.0, -0.6, -1.0], // Squared-off gritted teeth (high r, low s)
    fear: [2.5, 0.2, 0.2, 0.7, 0.1, 0.0, 0.0, 0.5, 0.5], // Wide open mouth (high m), raised brows
};
