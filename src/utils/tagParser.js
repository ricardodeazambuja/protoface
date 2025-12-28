/**
 * Shared utility for script tag extraction and parsing.
 * Supports standard tags <emotion> and parameterized tags <pause:500>.
 */

/**
 * Splits text into segments by script tags, preserving the tags.
 * @param {string} text - The script text to split.
 * @returns {string[]} An array of strings where every other element is a tag.
 */
export const splitTags = (text) => {
    if (!text) return [];
    return text.split(/(<[^>]+>)/g);
};

/**
 * Parses a single tag string into its components.
 * @param {string} tagStr - String starting with < and ending with >.
 * @returns {Object|null} The parsed tag info or null if invalid.
 */
export const parseTag = (tagStr) => {
    if (!tagStr || !tagStr.startsWith('<') || !tagStr.endsWith('>')) {
        return null;
    }

    const content = tagStr.slice(1, -1).toLowerCase().trim();
    const isClosing = content.startsWith('/');
    const cleanContent = isClosing ? content.slice(1) : content;

    // Check for parameterized tags: <tag:value>
    const paramMatch = cleanContent.match(/^(\w+):([\d.]+)$/);

    return {
        name: paramMatch ? paramMatch[1] : cleanContent,
        value: paramMatch ? parseFloat(paramMatch[2]) : null,
        isClosing,
        isParam: !!paramMatch,
        raw: content
    };
};
