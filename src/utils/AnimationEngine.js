import {
    BASE_PHONEME_DURATION_MS,
    EXPRESSIVENESS_DURATION_MODIFIER,
    SPACE_PAUSE_MULTIPLIER,
    PUNCTUATION_DURATION_MULTIPLIER,
    PUNCTUATION_SQUASH_MULTIPLIER,
    PUNCTUATION_BROW_JUMP,
    ANTICIPATION_DURATION_RATIO,
    OVERSHOOT_THRESHOLD
} from '../constants';

export const parseTextToAnimation = (text, speed = 1, expressiveness = 0.5) => {
    const sequence = [];
    // Base duration scales with speed; expressiveness speeds up the "snap" of the mouth
    const baseDuration = (BASE_PHONEME_DURATION_MS - (expressiveness * EXPRESSIVENESS_DURATION_MODIFIER)) / speed;

    const phonemeMap = {
        'a': 'open', 'ai': 'wide', 'au': 'narrow',
        'e': 'wide', 'ee': 'wide',
        'i': 'wide',
        'o': 'narrow', 'oo': 'narrow',
        'u': 'narrow',
        'b': 'closed', 'm': 'closed', 'p': 'closed',
        'f': 'narrow', 'v': 'narrow',
        's': 'smile', 'z': 'smile',
        'sh': 'wide', 'ch': 'wide', 'j': 'wide',
        'th': 'narrow',
        'l': 'wide',
        'r': 'narrow',
        'default': 'open'
    };

    // Helper to find multi-char phonemes
    const getPhoneme = (chars, index) => {
        const twoChar = chars[index] + (chars[index + 1] || '');
        if (phonemeMap[twoChar]) return { phoneme: phonemeMap[twoChar], size: 2 };
        const oneChar = chars[index];
        if (phonemeMap[oneChar]) return { phoneme: phonemeMap[oneChar], size: 1 };
        return { phoneme: /[a-z]/.test(oneChar) ? phonemeMap.default : null, size: 1 };
    };

    const parts = text.split(/(<[^>]+>)/g);

    let currentSpeedModifier = 1.0; // For <speed:x> tags
    let isEmphasis = false; // For <emphasis> blocks

    parts.forEach(part => {
        if (part.startsWith('<') && part.endsWith('>')) {
            const tagContent = part.slice(1, -1).toLowerCase().trim();

            // Check for parameterized tags: <pause:500>, <speed:1.5>
            const paramMatch = tagContent.match(/^(\w+):([\d.]+)$/);

            if (paramMatch) {
                const [, tagName, tagValue] = paramMatch;
                const value = parseFloat(tagValue);

                switch (tagName) {
                    case 'pause':
                        // Insert a silent pause (closed mouth)
                        sequence.push({
                            phoneme: 'closed',
                            duration: value,
                            squash: 1.0,
                            isPause: true // Mark as pause for sync handling
                        });
                        break;
                    case 'speed':
                        // Modify speed for subsequent text
                        currentSpeedModifier = Math.max(0.1, Math.min(5, value));
                        break;
                }
            } else if (tagContent === 'emphasis') {
                isEmphasis = true;
            } else if (tagContent === '/emphasis') {
                isEmphasis = false;
            } else {
                // Standard emotion tag
                const emotion = tagContent;
                // Anticipation frame
                if (expressiveness > 0.1) {
                    sequence.push({
                        phoneme: 'closed',
                        duration: 40 * expressiveness,
                        expression: emotion,
                        squash: 1 - (0.15 * expressiveness),
                        browJump: -0.1 * expressiveness
                    });
                }
                sequence.push({ phoneme: 'closed', duration: 10, expression: emotion });
            }
        } else {
            const characters = part.toLowerCase().split('');
            for (let i = 0; i < characters.length;) {
                const char = characters[i];
                if (char === ' ') {
                    sequence.push({ phoneme: 'closed', duration: (baseDuration * SPACE_PAUSE_MULTIPLIER) / currentSpeedModifier, squash: 1.0 });
                    i++;
                } else {
                    const { phoneme, size } = getPhoneme(characters, i);
                    if (phoneme) {
                        const isPunctuation = /[!.?]/.test(characters[i + size] || '');

                        let duration = baseDuration / currentSpeedModifier;
                        let squash = 1.0;
                        let intensity = 1.0;
                        let browJump = 0;

                        // Emphasis modifier
                        if (isEmphasis) {
                            squash = 1 + (0.15 * expressiveness);
                            browJump = 0.2 * expressiveness;
                            intensity = 1.3;
                        }

                        // Expressive modifiers
                        if (isPunctuation) {
                            duration *= (1 + PUNCTUATION_DURATION_MULTIPLIER * expressiveness);
                            squash = 1 + (PUNCTUATION_SQUASH_MULTIPLIER * expressiveness);
                            browJump = PUNCTUATION_BROW_JUMP * expressiveness;
                        } else {
                            // Standard bounce
                            squash = 1 + (0.05 * expressiveness);
                        }

                        // Anticipation for big letters (exaggerated vowels)
                        if (expressiveness > 0.6 && ['a', 'o', 'u'].includes(char)) {
                            sequence.push({ phoneme: 'closed', duration: baseDuration * ANTICIPATION_DURATION_RATIO, squash: 1 - (0.1 * expressiveness) });
                        }

                        sequence.push({
                            phoneme,
                            duration,
                            squash,
                            intensity,
                            browJump
                        });

                        // Overshoot/Settle for expressive mode
                        if (expressiveness > OVERSHOOT_THRESHOLD && isPunctuation) {
                            sequence.push({ phoneme: 'closed', duration: baseDuration * 0.5, squash: 0.95 });
                        }
                    }
                    i += size;
                }
            }
        }
    });

    sequence.push({ phoneme: 'closed', duration: baseDuration * 2, squash: 1.0 });

    return { sequence };
};
