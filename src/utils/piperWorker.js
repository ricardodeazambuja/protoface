/**
 * piperWorker.js - Native Piper TTS Worker
 * 
 * Uses:
 * - espeak-ng for phonemization (loaded from public/)
 * - onnxruntime-web for running the Piper ONNX model
 * - Voice models from HuggingFace (rhasspy/piper-voices)
 */

import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime to load WASM files from the public directory
ort.env.wasm.wasmPaths = import.meta.env.BASE_URL;

// Constants for phoneme processing
const BOS = "^";
const EOS = "$";
const PAD = "_";

let espeakModule = null;
let voiceModel = null;
let voiceConfig = null;

/**
 * Initialize espeak-ng module
 */
async function initEspeak() {
    if (espeakModule) return espeakModule;

    // Import espeak-ng from local src directory
    const ESpeakNG = (await import('./espeak/espeak-ng.js')).default;

    espeakModule = await ESpeakNG({
        locateFile: (path) => {
            // Ensure WASM files are loaded from the same directory
            if (path.endsWith('.wasm')) {
                return new URL('./espeak/espeak-ng.wasm', import.meta.url).href;
            }
            return path;
        }
    });

    return espeakModule;
}

/**
 * Convert text to phonemes using espeak-ng
 * The npm espeak-ng package requires creating a new instance with arguments
 */
async function textToPhonemes(text, voice = 'en-us') {
    // Import ESpeakNG fresh for each conversion
    // The npm package expects arguments passed to the constructor
    const ESpeakNG = (await import('./espeak/espeak-ng.js')).default;

    const outFile = 'phonemes.txt';

    try {
        // Create an instance with espeak arguments
        const espeak = await ESpeakNG({
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
                if (path.endsWith('.wasm')) {
                    return new URL('./espeak/espeak-ng.wasm', import.meta.url).href;
                }
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
    return results.output.cpuData;
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
    const voice = voiceId || modelId;

    try {
        if (type === 'load') {
            const { modelUrl: customModelUrl, configUrl: customConfigUrl, voiceId } = event.data;

            // Priority:
            // 1. Explicitly passed custom URLs
            // 2. Local fallback (/piper/voices/...)
            // 3. Remote fallback (Hugging Face)

            let modelUrl = customModelUrl;
            let configUrl = customConfigUrl;

            if (!modelUrl || !configUrl) {
                const voice = voiceId || modelId;
                // Try local first
                modelUrl = `${import.meta.env.BASE_URL}piper/voices/${voice}/model.onnx`;
                configUrl = `${import.meta.env.BASE_URL}piper/voices/${voice}/model.json`;
            }

            self.postMessage({ type: 'progress', progress: 0.1 });

            // Helper: Fetch with Cache API
            const fetchAndCache = async (url) => {
                const cache = await caches.open('protoface-piper-models');
                const cachedResponse = await cache.match(url);

                if (cachedResponse) {
                    console.log(`[Worker] Serving from cache: ${url}`);
                    return cachedResponse;
                }

                console.log(`[Worker] Fetching remote: ${url}`);

                // Try fetching
                let response;
                try {
                    response = await fetch(url);
                } catch (e) {
                    // If simple fetch fails, try fallback for relative paths
                    if (url.startsWith(`${import.meta.env.BASE_URL}piper/voices/`)) {
                        console.warn(`[Worker] Local fetch failed for ${url}, trying remote fallback...`);
                        // Fallback logic: Assuming we can construct a remote URL
                        // This is tricky because the worker doesn't strictly know the mapping.
                        throw e;
                    }
                    throw e;
                }

                if (!response.ok) {
                    // Attempt remote fallback if local 404s
                    if (url.startsWith(`${import.meta.env.BASE_URL}piper/voices/`)) {
                        const remoteUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${url.replace(`${import.meta.env.BASE_URL}piper/voices/`, '')}`;
                        console.log(`[Worker] Falling back to: ${remoteUrl}`);
                        response = await fetch(remoteUrl);
                    }
                }

                if (!response.ok) throw new Error(`Failed to load ${url}`);

                // Cache the successful response
                cache.put(url, response.clone());
                return response;
            };

            // 1. Load Config
            const configResponse = await fetchAndCache(configUrl);
            voiceConfig = await configResponse.json();

            self.postMessage({ type: 'progress', progress: 0.3 });

            // Initialize espeak
            await initEspeak();

            self.postMessage({ type: 'progress', progress: 0.6 });

            // 2. Load Model
            // ONNX Runtime Web needs a URL or Blob. Blob URL is best.
            const modelResponse = await fetchAndCache(modelUrl);
            const modelBlob = await modelResponse.blob();
            const modelBlobUrl = URL.createObjectURL(modelBlob);

            try {
                voiceModel = await ort.InferenceSession.create(modelBlobUrl);
            } finally {
                // TODO: Implement proper Blob URL cleanup with tracked revocations
                // Currently relying on browser garbage collection
            }

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
