import { TTSBridge } from './TTSBridge';
import { TTS_MODE_HOST } from '../constants';

/**
 * RemoteTTSService - The "Host" side of the Remote TTS system.
 * 
 * This service runs in the background (Host context).
 * It initializes the Piper worker and listens for requests from "Clients" (Remote mode).
 */
export class RemoteTTSService {
    constructor(onWorkerMessage) {
        this.bridge = new TTSBridge('host');
        this.worker = null;
        this.onWorkerMessage = onWorkerMessage; // Track progress/events for Host UI

        // Bind bridge listener
        this.bridge.onMessage(this.handleRemoteRequest.bind(this));
    }

    /**
     * Initialize the Piper worker
     */
    init() {
        if (this.worker) return;

        console.log('[RemoteTTSService] Initializing Piper worker...');
        this.worker = new Worker(new URL('./piperWorker.js', import.meta.url), { type: 'module' });

        this.worker.onmessage = (e) => {
            const { type, audio, sampling_rate, id, error, progress } = e.data;

            // 1. Notify Host UI if needed
            if (this.onWorkerMessage) {
                this.onWorkerMessage(e.data);
            }

            // 2. Route results back to the requesting Client via Bridge
            if (type === 'result' || type === 'error' || type === 'loaded' || type === 'progress') {
                this.bridge.postMessage({
                    type: `response:${type}`,
                    payload: { audio, sampling_rate, error, progress },
                    requestId: id // If we add request tracking later
                });
            }
        };
    }

    /**
     * Handle incoming requests from Remote Clients
     */
    handleRemoteRequest(message) {
        const { type, payload } = message;

        if (!type || !type.startsWith('request:')) return;

        const action = type.replace('request:', '');
        console.log(`[RemoteTTSService] Received request: ${action}`, payload);

        if (!this.worker) {
            this.init();
        }

        // Forward to worker
        this.worker.postMessage({
            type: action,
            ...payload
        });
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
        }
        if (this.bridge) {
            this.bridge.destroy();
        }
    }
}
