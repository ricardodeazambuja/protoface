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
                    // Use actual rendered dimensions from the DOM to match UI display
                    const svgWidth = svg.clientWidth || parseFloat(svg.getAttribute('width')) || 200;
                    const svgHeight = svg.clientHeight || parseFloat(svg.getAttribute('height')) || 200;

                    const clone = svg.cloneNode(true);
                    clone.setAttribute('style', ''); // Remove all inline styles (position, transform, etc)

                    // Keep the original dimensions and viewBox to match UI display
                    clone.setAttribute('width', svgWidth);
                    clone.setAttribute('height', svgHeight);

                    // Ensure overflow is visible to capture the full face including mouth
                    clone.style.overflow = 'visible';

                    const xml = new XMLSerializer().serializeToString(clone);
                    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(svgBlob);

                    const img = new Image();
                    await new Promise((resolve) => {
                        img.onload = () => {
                            // Get the computed transform from the DOM element
                            const style = window.getComputedStyle(svg);
                            const matrix = new DOMMatrix(style.transform);

                            // Get Transform Origin (in pixels) - usually center of the SVG
                            const transformOrigin = style.transformOrigin || '50% 50%';
                            let [ox, oy] = transformOrigin.split(' ').map(parseFloat);
                            if (isNaN(ox)) ox = svgWidth / 2;
                            if (isNaN(oy)) oy = svgHeight / 2;

                            this.offscreenCtx.save();

                            // The SVG in the DOM is positioned using:
                            // position: absolute; top: 50%; left: 50%;
                            // This means the SVG's top-left corner is at the container's center.
                            // Then Framer Motion applies: x: calc(-50% + Xpx), y: calc(-50% + Ypx)
                            // which shifts it left/up by half its size (centering it) plus user offset.
                            //
                            // The matrix already contains these translations (matrix.e ≈ -100 + user.x).
                            // So we start at canvas center (matching CSS top/left: 50%)
                            // and apply the matrix which handles the centering.

                            this.offscreenCtx.translate(this.offscreenCanvas.width / 2, this.offscreenCanvas.height / 2);

                            // Apply transform around the pivot point (for rotation/scaling)
                            this.offscreenCtx.translate(ox, oy);
                            this.offscreenCtx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
                            this.offscreenCtx.translate(-ox, -oy);

                            // Draw the SVG image at 0,0 (matrix positions it correctly)
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
