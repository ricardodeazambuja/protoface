import html2canvas from 'html2canvas';
import { RECORDING_FPS, STOP_TIMEOUT_MS, DEFAULT_BACKGROUND_COLOR } from '../constants';

export class AnimationRecorder {
    constructor(elementId) {
        this.elementId = elementId;
        this.stream = null;
        this.mediaRecorder = null;
        this.chunks = [];
        this.isRecording = false;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        // Offscreen canvas for double buffering
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }

    async start(audioStream = null) {
        const element = document.getElementById(this.elementId);
        if (!element) return;

        const rect = element.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.offscreenCanvas.width = rect.width;
        this.offscreenCanvas.height = rect.height;

        this.chunks = [];
        this.stream = this.canvas.captureStream(RECORDING_FPS);

        if (audioStream) {
            audioStream.getAudioTracks().forEach(track => {
                this.stream.addTrack(track);
            });
        }

        this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType: 'video/webm;codecs=vp9'
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };

        this.mediaRecorder.start();
        this.isRecording = true;

        // Start the capture loop
        this.captureFrame();
    }

    async captureFrame() {
        if (!this.isRecording) return;
        const fps = RECORDING_FPS;
        const frameInterval = 1000 / fps;
        const startTime = performance.now();

        const element = document.getElementById(this.elementId);
        if (element) {
            try {
                const elementRect = element.getBoundingClientRect();
                this.offscreenCtx.save();

                // 1. Draw the Background Color
                const style = window.getComputedStyle(element);
                this.offscreenCtx.fillStyle = style.backgroundColor || DEFAULT_BACKGROUND_COLOR;
                this.offscreenCtx.fillRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

                // 2. Draw Background Image (if exists)
                const bgImage = style.backgroundImage;
                if (bgImage && bgImage !== 'none') {
                    const url = bgImage.slice(4, -1).replace(/"/g, "");
                    const img = new Image();
                    await new Promise((resolve) => {
                        img.onload = () => {
                            // Simple 'cover' logic
                            const canvasAspect = this.offscreenCanvas.width / this.offscreenCanvas.height;
                            const imageAspect = img.width / img.height;
                            let drawW, drawH, drawX, drawY;

                            if (imageAspect > canvasAspect) {
                                drawH = this.offscreenCanvas.height;
                                drawW = drawH * imageAspect;
                                drawX = (this.offscreenCanvas.width - drawW) / 2;
                                drawY = 0;
                            } else {
                                drawW = this.offscreenCanvas.width;
                                drawH = drawW / imageAspect;
                                drawX = 0;
                                drawY = (this.offscreenCanvas.height - drawH) / 2;
                            }
                            this.offscreenCtx.drawImage(img, drawX, drawY, drawW, drawH);
                            resolve();
                        };
                        img.onerror = () => resolve();
                        img.src = url;
                    });
                }

                // 3. Capture and Draw the SVG Face using Transform Matrix
                const svg = element.querySelector('svg');
                if (svg) {
                    // Clone and clean the SVG to remove styles that cause internal shifting/clipping
                    // Dynamic Dimension Detection (Refactor: Remove Magic Numbers)
                    const svgWidth = svg.clientWidth || parseFloat(svg.getAttribute('width')) || 200;
                    const svgHeight = svg.clientHeight || parseFloat(svg.getAttribute('height')) || 200;

                    const clone = svg.cloneNode(true);
                    clone.setAttribute('style', ''); // Remove all inline styles (position, transform, etc)

                    // Original viewBox is "0 0 100 200", mapped to 200x200px.
                    // We DO NOT extend it anymore to avoid aspect ratio distortion (shrinking).
                    // Clone setup using dynamic dimensions
                    clone.setAttribute('width', svgWidth);
                    clone.setAttribute('height', svgHeight); // Revert to original height
                    // clone.setAttribute('viewBox', '0 0 100 300'); // REMOVED extended viewBox

                    // Ensure overflow is visible just in case, though standard viewBox usually handles it
                    clone.style.overflow = 'visible';

                    const xml = new XMLSerializer().serializeToString(clone);
                    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(svgBlob);

                    const img = new Image();
                    await new Promise((resolve) => {
                        img.onload = () => {
                            // Apply the computed transform matrix from the actual DOM element
                            const style = window.getComputedStyle(svg);
                            const matrix = new DOMMatrix(style.transform);

                            // 4a. Get Transform Origin (CRITICAL FIX for Scaling/Rotation)
                            const transformOrigin = style.transformOrigin || '50% 50%';
                            // Parse origin (usually "xpx ypx")
                            let [ox, oy] = transformOrigin.split(' ').map(parseFloat);
                            // Handle cases where only one value is given or it's keywords (simplified fallback)
                            if (isNaN(ox)) ox = svgWidth / 2; // Default to center
                            if (isNaN(oy)) oy = svgHeight / 2; // Default to center

                            // Apply the "Sandwich" Transform: Translate(Origin) -> Matrix -> Translate(-Origin)

                            this.offscreenCtx.save();

                            // Step 1: Move Context to Layout Center (Canvas Center)
                            // CSS Layout places the element at top: 50%, left: 50%.
                            // The matrix includes the translateX(-50%) logic implicitly (from Framer Motion or Manual calculation).
                            // We start at the absolute center of the canvas.
                            this.offscreenCtx.translate(this.offscreenCanvas.width / 2, this.offscreenCanvas.height / 2);

                            // Step 2 & 3: Apply Matrix around the Pivot (ox, oy)
                            // Standard pivot rotation: translate(ox, oy) * matrix * translate(-ox, -oy)
                            // This rotates/scales the element around its own pivot point (ox, oy).
                            // Note: If ox,oy are (Center,Center), this effectively does nothing relative to center IF the matrix is identity,
                            // but crucial for rotation/scaling.
                            this.offscreenCtx.translate(ox, oy);
                            this.offscreenCtx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
                            this.offscreenCtx.translate(-ox, -oy);

                            // Draw the image at (0,0). The matrix includes centering logic.
                            this.offscreenCtx.drawImage(img, 0, 0, svgWidth, svgHeight);

                            this.offscreenCtx.restore();

                            URL.revokeObjectURL(url);

                            // 4. Update main canvas only when the frame is COMPLETE
                            this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.canvas.width, this.canvas.height);
                            resolve();
                        };
                        img.onerror = (e) => {
                            console.error("Failed to load SVG into image for recording", e);
                            URL.revokeObjectURL(url);
                            resolve();
                        };
                        img.src = url;
                    });
                } else {
                    // Fallback to html2canvas if no SVG is found
                    const canvas = await html2canvas(element, {
                        backgroundColor: null,
                        scale: 1,
                        logging: false
                    });
                    this.offscreenCtx.drawImage(canvas, 0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

                    // Copy to main canvas
                    this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.canvas.width, this.canvas.height);
                }
                this.offscreenCtx.restore();
            } catch (err) {
                console.error("Recording frame capture error:", err);
            }
        }

        if (this.isRecording) {
            const elapsed = performance.now() - startTime;
            const waitTime = Math.max(0, frameInterval - elapsed);
            setTimeout(() => {
                requestAnimationFrame(() => this.captureFrame());
            }, waitTime);
        }
    }

    stop() {
        return new Promise((resolve) => {
            this.isRecording = false;

            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve(null);
                return;
            }

            const timeout = setTimeout(() => {
                console.warn("MediaRecorder stop timed out, forcing resolution");
                const blob = new Blob(this.chunks, { type: 'video/webm' });
                this.cleanup();
                resolve(blob);
            }, STOP_TIMEOUT_MS);

            this.mediaRecorder.onstop = () => {
                clearTimeout(timeout);
                const blob = new Blob(this.chunks, { type: 'video/webm' });
                this.cleanup();
                resolve(blob);
            };

            try {
                if (this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                } else {
                    this.mediaRecorder.onstop();
                }
            } catch (e) {
                console.error("Error stopping MediaRecorder:", e);
                clearTimeout(timeout);
                this.cleanup();
                resolve(null);
            }
        });
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                this.stream.removeTrack(track);
            });
            this.stream = null;
        }
        this.mediaRecorder = null;
    }
}
