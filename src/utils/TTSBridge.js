import { TTS_BRIDGE_CHANNEL } from '../constants';

/**
 * TTSBridge - Handles cross-process/cross-tab communication for TTS.
 * 
 * It abstracts the underlying IPC mechanism:
 * - BroadcastChannel for modern browsers (tabs/frames)
 * - window.webkit.messageHandlers for iOS AUv3 extensions
 */
export class TTSBridge {
    constructor(role = 'client') {
        this.role = role;
        this.channel = null;
        this.onMessageCallback = null;

        // Initialize BroadcastChannel if available
        if (typeof BroadcastChannel !== 'undefined') {
            this.channel = new BroadcastChannel(TTS_BRIDGE_CHANNEL);
            this.channel.onmessage = (event) => this.handleMessage(event.data);
        }

        // Detect iOS WebKit bridge
        this.isIOS = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ttsBridge);
    }

    /**
     * Set a callback for incoming messages
     */
    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    /**
     * Send a message to the other side
     */
    postMessage(message) {
        // 1. Try iOS Native Bridge if available
        if (this.isIOS) {
            window.webkit.messageHandlers.ttsBridge.postMessage(message);
        }

        // 2. Always try BroadcastChannel for web compatibility
        if (this.channel) {
            this.channel.postMessage(message);
        }
    }

    /**
     * Internal handler for incoming messages
     */
    handleMessage(message) {
        if (this.onMessageCallback) {
            this.onMessageCallback(message);
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.channel) {
            this.channel.close();
        }
    }
}
