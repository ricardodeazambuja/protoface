// Polyfill for document to prevent ReferenceError in onnxruntime-web 1.20+
if (typeof document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ setAttribute: () => { }, style: {} }),
        getElementsByTagName: () => [],
        currentScript: { src: '' }
    };
}

/**
 * piperWorker.js - Native Piper TTS Worker
 * 
 * Uses:
 * - espeak-ng for phonemization (loaded from CDN)
 * - onnxruntime-web for running the Piper ONNX model (loaded from CDN)
 * - Voice models from HuggingFace (rhasspy/piper-voices)
 */

// Load ONNX Runtime from CDN as ES Module
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/ort.min.mjs';

// Configure ONNX Runtime to load WASM/MJS from CDN
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
ort.env.wasm.numThreads = 1; // Limit threads to reduce memory pressure
ort.env.wasm.proxy = false;  // Ensure it runs in the current worker context

// Constants for phoneme processing
const BOS = "^";
const EOS = "$";
const PAD = "_";

let espeakModule = null;
let voiceModel = null;
let voiceConfig = null;

const ESPEAK_NG_JS_URL = 'https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.js';
const ESPEAK_NG_WASM_URL = 'https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeak-ng.wasm';
const ESPEAK_NG_DATA_URL = 'https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/espeakng.worker.data';

/**
 * Helper to load legacy eSpeak-ng script in a module worker
 * 
 * NOTE: The script contains `import.meta.url` and `export default`, which cause
 * SyntaxErrors when executed via `new Function`. We strip/replace them.
 */
async function loadESpeakNGScript() {
    if (globalThis.ESpeakNG) return;
    console.log('[Worker] Loading eSpeak-ng from CDN...');
    const res = await fetch(ESPEAK_NG_JS_URL);
    let code = await res.text();

    // Replace import.meta.url with a hardcoded string
    code = code.replace(/import\.meta\.url/g, `'${ESPEAK_NG_JS_URL}'`);

    // Strip "export default ESpeakNG;" to allow evaluation as plain script
    code = code.replace(/export\s+default\s+ESpeakNG\s*;/g, '');

    // Wrap and execute to expose the global
    (new Function(code + '\nglobalThis.ESpeakNG = ESpeakNG;'))();
}

/**
 * Initialize espeak-ng module
 */
async function initEspeak() {
    if (espeakModule) return espeakModule;

    await loadESpeakNGScript();

    if (typeof globalThis.ESpeakNG === 'undefined') {
        throw new Error('ESpeakNG not found after script execution.');
    }

    espeakModule = await globalThis.ESpeakNG({
        locateFile: (path) => {
            if (path.endsWith('.wasm')) return ESPEAK_NG_WASM_URL;
            if (path.endsWith('.data')) return ESPEAK_NG_DATA_URL;
            return path;
        }
    });

    return espeakModule;
}

/**
 * Convert text to phonemes using espeak-ng
 */
async function textToPhonemes(text, voice = 'en-us') {
    await loadESpeakNGScript();

    if (typeof globalThis.ESpeakNG === 'undefined') {
        throw new Error('ESpeakNG not found for phoneme generation.');
    }

    const outFile = 'phonemes.txt';

    try {
        const espeak = await globalThis.ESpeakNG({
            arguments: [
                '--phonout', outFile,
                '--sep=""',
                '-q',
                '-b=1',
                '--ipa=3',
                '-v', voice,
                `"${text}"`
            ],
            locateFile: (path) => {
                if (path.endsWith('.wasm')) return ESPEAK_NG_WASM_URL;
                if (path.endsWith('.data')) return ESPEAK_NG_DATA_URL;
                return path;
            }
        });

        // Read the phoneme output from the virtual filesystem
        const phonemes = espeak.FS.readFile(outFile, { encoding: 'utf8' });
        return Array.from(phonemes.trim().normalize('NFD'));
    } catch (e) {
        console.error('Phoneme generation error:', e);
        return [];
    }
}

/**
 * Convert phonemes to IDs using the voice config's phoneme_id_map
 */
function phonemesToIds(idMap, phonemes) {
    let phonemeIds = [];

    // Add beginning of sequence
    if (idMap[BOS] !== undefined) {
        phonemeIds.push(...(Array.isArray(idMap[BOS]) ? idMap[BOS] : [idMap[BOS]]));
    }
    if (idMap[PAD] !== undefined) {
        phonemeIds.push(...(Array.isArray(idMap[PAD]) ? idMap[PAD] : [idMap[PAD]]));
    }

    // Add phonemes
    for (const phoneme of phonemes) {
        if (phoneme in idMap) {
            const ids = Array.isArray(idMap[phoneme]) ? idMap[phoneme] : [idMap[phoneme]];
            phonemeIds.push(...ids);
            if (idMap[PAD] !== undefined) {
                phonemeIds.push(...(Array.isArray(idMap[PAD]) ? idMap[PAD] : [idMap[PAD]]));
            }
        }
    }

    // Add end of sequence
    if (idMap[EOS] !== undefined) {
        phonemeIds.push(...(Array.isArray(idMap[EOS]) ? idMap[EOS] : [idMap[EOS]]));
    }

    return phonemeIds;
}

/**
 * Run the ONNX model to generate audio
 */
async function runModel(phonemeIds, config, settings = {}) {
    const lengthScale = settings.lengthScale ?? config.inference?.length_scale ?? 1.0;
    const noiseScale = settings.noiseScale ?? config.inference?.noise_scale ?? 0.667;
    const noiseWScale = settings.noiseWScale ?? config.inference?.noise_w ?? 0.8;
    const speakerId = settings.speakerId ?? 0;

    // Create tensors
    const phonemeIdsTensor = new ort.Tensor(
        'int64',
        new BigInt64Array(phonemeIds.map(x => BigInt(x))),
        [1, phonemeIds.length]
    );
    const phonemeLengthsTensor = new ort.Tensor(
        'int64',
        BigInt64Array.from([BigInt(phonemeIds.length)]),
        [1]
    );
    const scalesTensor = new ort.Tensor(
        'float32',
        Float32Array.from([noiseScale, lengthScale, noiseWScale]),
        [3]
    );

    let feeds = {
        input: phonemeIdsTensor,
        input_lengths: phonemeLengthsTensor,
        scales: scalesTensor
    };

    // Add speaker ID for multi-speaker models
    if (config.num_speakers > 1) {
        feeds['sid'] = new ort.Tensor(
            'int64',
            BigInt64Array.from([BigInt(speakerId)])
        );
    }

    const results = await voiceModel.run(feeds);
    return results.output.data;
}

/**
 * Main synthesis function
 */
async function synthesize(text, settings = {}) {
    if (!voiceConfig || !voiceModel) {
        throw new Error('Voice not loaded');
    }

    const espeakVoice = voiceConfig.espeak?.voice || 'en-us';
    const phonemes = await textToPhonemes(text, espeakVoice);

    if (phonemes.length === 0) {
        throw new Error('Failed to generate phonemes');
    }

    const phonemeIds = phonemesToIds(voiceConfig.phoneme_id_map, phonemes);
    const audioData = await runModel(phonemeIds, voiceConfig, settings);

    // Debug: Check audio amplitude
    let max = 0;
    for (let i = 0; i < Math.min(audioData.length, 5000); i++) {
        const abs = Math.abs(audioData[i]);
        if (abs > max) max = abs;
    }
    console.log("Synthesis complete. Max amplitude (first 5k samples):", max);

    return {
        audio: audioData,
        sampling_rate: voiceConfig.audio?.sample_rate || 22050
    };
}

// Message handler
self.onmessage = async (event) => {
    const { type, text, voiceId, modelId } = event.data;

    try {
        if (type === 'load') {
            const { modelUrl: customModelUrl, configUrl: customConfigUrl, voiceId } = event.data;

            let modelUrl = customModelUrl;
            let configUrl = customConfigUrl;

            if (!modelUrl || !configUrl) {
                const voice = voiceId || modelId;
                modelUrl = `${import.meta.env.BASE_URL}piper/voices/${voice}/model.onnx`;
                configUrl = `${import.meta.env.BASE_URL}piper/voices/${voice}/model.json`;
            }

            self.postMessage({ type: 'progress', progress: 0.1 });

            const fetchAndCache = async (url) => {
                const cache = await caches.open('protoface-piper-models');
                const cachedResponse = await cache.match(url);
                if (cachedResponse) return cachedResponse;

                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to load ${url} (Status: ${response.status})`);
                cache.put(url, response.clone());
                return response;
            };

            const configResponse = await fetchAndCache(configUrl);
            voiceConfig = await configResponse.json();

            self.postMessage({ type: 'progress', progress: 0.3 });

            await initEspeak();

            self.postMessage({ type: 'progress', progress: 0.6 });

            const modelResponse = await fetchAndCache(modelUrl);
            const modelBuffer = await modelResponse.arrayBuffer();

            if (voiceModel) {
                try { await voiceModel.release(); } catch (e) { }
                voiceModel = null;
            }

            voiceModel = await ort.InferenceSession.create(modelBuffer, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all'
            });

            self.postMessage({ type: 'loaded' });
        }
        else if (type === 'speak') {
            const result = await synthesize(text, event.data.settings);
            self.postMessage({
                type: 'result',
                audio: result.audio,
                sampling_rate: result.sampling_rate
            });
        }
    } catch (error) {
        console.error('Piper Worker Error:', error);
        self.postMessage({ type: 'error', error: error.message });
    }
};
