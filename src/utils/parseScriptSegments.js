/**
 * parseScriptSegments - Parse script text into typed segments for TTS generation
 * 
 * Segments are either:
 * - { type: 'text', text: string, speed: number } - Audio to synthesize
 * - { type: 'pause', duration: number } - Silence to insert
 * - { type: 'emotion', name: string } - Emotion change (visual only)
 */

/**
 * @typedef {'text' | 'pause' | 'emotion'} SegmentType
 * @typedef {{ type: 'text', text: string, speed: number }} TextSegment
 * @typedef {{ type: 'pause', duration: number }} PauseSegment
 * @typedef {{ type: 'emotion', name: string }} EmotionSegment
 * @typedef {TextSegment | PauseSegment | EmotionSegment} Segment
 */

/**
 * Parse script text into segments
 * @param {string} script - The raw script with tags
 * @returns {Segment[]} Array of parsed segments
 */
export function parseScriptSegments(script) {
    const segments = [];
    let currentSpeed = 1.0;
    let currentText = '';

    // Split on tags while preserving them
    const parts = script.split(/(<[^>]+>)/g);

    const flushText = () => {
        if (currentText.trim()) {
            segments.push({
                type: 'text',
                text: currentText,
                speed: currentSpeed
            });
        }
        currentText = '';
    };

    for (const part of parts) {
        if (!part) continue;

        if (part.startsWith('<') && part.endsWith('>')) {
            const tagContent = part.slice(1, -1).toLowerCase().trim();

            // Check for parameterized tags: <pause:500>, <speed:1.5>
            const paramMatch = tagContent.match(/^(\w+):([\d.]+)$/);

            if (paramMatch) {
                const [, tagName, tagValue] = paramMatch;
                const value = parseFloat(tagValue);

                switch (tagName) {
                    case 'pause':
                        flushText();
                        segments.push({ type: 'pause', duration: value });
                        break;
                    case 'speed':
                        flushText();
                        currentSpeed = Math.max(0.1, Math.min(5, value));
                        break;
                }
            } else if (tagContent === 'emphasis' || tagContent === '/emphasis') {
                // Visual-only tags, don't affect TTS segments
                // But we still need to flush text to preserve order
            } else {
                // Emotion tag
                flushText();
                segments.push({ type: 'emotion', name: tagContent });
            }
        } else {
            // Regular text - accumulate
            currentText += part;
        }
    }

    // Flush any remaining text
    flushText();

    return segments;
}

/**
 * Calculate total expected duration from segments
 * @param {Segment[]} segments 
 * @param {number} baseDurationPerChar - Approximate ms per character at speed 1.0
 * @returns {number} Total duration in ms
 */
export function estimateSegmentsDuration(segments, baseDurationPerChar = 60) {
    let total = 0;
    for (const seg of segments) {
        if (seg.type === 'text') {
            // Estimate: characters * base duration / speed
            total += (seg.text.length * baseDurationPerChar) / seg.speed;
        } else if (seg.type === 'pause') {
            total += seg.duration;
        }
    }
    return total;
}
