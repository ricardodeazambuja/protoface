/**
 * Gated debug logger.
 *
 * The detailed play/synthesis tracing is invaluable when debugging on a
 * device (e.g. iOS memory investigations) but is pure noise for users.
 * Enable it from the browser console with:
 *
 *   localStorage.setItem('protoface-debug', '1')
 *
 * and reload. Remove the key (or set anything else) to disable.
 */
export const isDebugEnabled = () => {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('protoface-debug') === '1';
    } catch {
        // localStorage can throw in some privacy modes; treat as disabled.
        return false;
    }
};

const enabled = isDebugEnabled();

export const debug = (...args) => {
    if (enabled) console.log(...args);
};
