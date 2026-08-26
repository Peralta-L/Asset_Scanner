// Two decode paths:
//   1. Native BarcodeDetector (Chrome/Android) — hardware/OS-accelerated,
//      fast enough to run every tick with no canvas involved at all.
//   2. ZXing on canvas (Safari/Firefox fallback) — needs pixel access, so it's
//      the only place canvas still shows up, and it's capped/timeboxed so a
//      slow device can never make the loop hang.
// Both only ever look at the cropped target-box region, never the full frame —
// that's what replaced the old blind 9-tile search.

const PER_ATTEMPT_TIMEOUT_MS = 1200;
const MAX_CANDIDATE_DIMENSION = 1000; // cap for any canvas fed to ZXing

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(null), ms))
    ]);
}

function cropCanvas(sourceCanvas, x, y, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
    return c;
}

function scaleCanvas(sourceCanvas, factor) {
    const c = document.createElement('canvas');
    c.width = Math.round(sourceCanvas.width * factor);
    c.height = Math.round(sourceCanvas.height * factor);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false; // nearest-neighbor keeps module edges sharp
    ctx.drawImage(sourceCanvas, 0, 0, c.width, c.height);
    return c;
}

function scaleCanvasCapped(sourceCanvas, factor) {
    const longest = Math.max(sourceCanvas.width, sourceCanvas.height);
    const cappedFactor = Math.min(factor, MAX_CANDIDATE_DIMENSION / longest);
    if (cappedFactor <= 1) return sourceCanvas;
    return scaleCanvas(sourceCanvas, cappedFactor);
}

function otsuThreshold(grayData) {
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < grayData.length; i++) histogram[grayData[i]]++;

    const total = grayData.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * histogram[t];

    let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 128;

    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;
        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > maxVar) {
            maxVar = varBetween;
            threshold = t;
        }
    }
    return threshold;
}

export function applyOtsuContrast(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const gray = new Uint8Array(data.length / 4);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }
    const threshold = otsuThreshold(gray);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const value = gray[j] > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

// ---------- Primary path: native BarcodeDetector ----------
let nativeDetector = null;
let nativeSupportChecked = false;
let nativeSupported = false;

export async function nativeDetectorAvailable() {
    if (nativeSupportChecked) return nativeSupported;
    nativeSupportChecked = true;

    if (!('BarcodeDetector' in window)) {
        nativeSupported = false;
        return false;
    }
    try {
        const formats = await BarcodeDetector.getSupportedFormats();
        nativeSupported = formats.includes('data_matrix');
    } catch (e) {
        nativeSupported = false;
    }
    return nativeSupported;
}

async function detectNative(source) {
    if (!nativeDetector) {
        nativeDetector = new BarcodeDetector({ formats: ['data_matrix'] });
    }
    try {
        const results = await withTimeout(nativeDetector.detect(source), PER_ATTEMPT_TIMEOUT_MS);
        return results && results.length ? results[0].rawValue : null;
    } catch (e) {
        return null;
    }
}

// ---------- Fallback path: ZXing on canvas ----------
let zxingReader = null;

function getZxingReader() {
    if (!zxingReader) {
        // BrowserDatamatrixCodeReader's constructor only accepts a scan-interval
        // number (ms between scan attempts), not a hints map — passing a Map
        // here was silently ignored, so TRY_HARDER was never actually applied.
        zxingReader = new ZXing.BrowserDatamatrixCodeReader(500);
    }
    return zxingReader;
}

async function tryDecodeCanvasZXing(canvas) {
    const reader = getZxingReader();
    try {
        const img = new Image();
        img.src = canvas.toDataURL('image/png');
        await img.decode();
        const result = await withTimeout(reader.decodeFromImageElement(img), PER_ATTEMPT_TIMEOUT_MS);
        return result ? result.text : null;
    } catch (e) {
        return null;
    }
}

async function detectZXing(canvas) {
    // As-is, then upscaled, then upscaled+contrast. Kept short since this can
    // run on every scan tick.
    let result = await tryDecodeCanvasZXing(canvas);
    if (result) return result;

    const upscaled = scaleCanvasCapped(canvas, 3);
    if (upscaled !== canvas) {
        result = await tryDecodeCanvasZXing(upscaled);
        if (result) return result;

        const contrastCopy = cropCanvas(upscaled, 0, 0, upscaled.width, upscaled.height);
        result = await tryDecodeCanvasZXing(applyOtsuContrast(contrastCopy));
        if (result) return result;
    }
    return null;
}

// ---------- Public: decode whatever is inside `box` right now ----------
export async function decodeRegion(video, box, scratchCanvas) {
    const useNative = await nativeDetectorAvailable();

    if (useNative) {
        let bitmap;
        try {
            bitmap = await createImageBitmap(video, box.x, box.y, box.width, box.height);
            const result = await detectNative(bitmap);
            bitmap.close();
            if (result) return result;
        } catch (e) {
            if (bitmap) bitmap.close();
            console.warn('Native BarcodeDetector crop failed, falling back to ZXing:', e);
        }
    }

    // ZXing fallback needs canvas pixel access
    const bitmap = await createImageBitmap(video, box.x, box.y, box.width, box.height);
    scratchCanvas.width = bitmap.width;
    scratchCanvas.height = bitmap.height;
    scratchCanvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();

    return await detectZXing(scratchCanvas);
}

// ---------- Public: continuous scan loop ----------
// Polls decodeRegion() on an interval until it gets a hit or is stopped.
// This is what replaced the old single-shot "click photo, hope it decodes" flow.
export class ScanLoop {
    constructor({ video, targetBoxEl, scratchCanvas, getBox, intervalMs = 300 }) {
        this.video = video;
        this.targetBoxEl = targetBoxEl;
        this.scratchCanvas = scratchCanvas;
        this.getBox = getBox;
        this.intervalMs = intervalMs;
        this._running = false;
        this._timer = null;
    }

    start(onResult, onTick) {
        if (this._running) return;
        this._running = true;

        const tick = async () => {
            if (!this._running) return;

            try {
                const box = this.getBox(this.video, this.targetBoxEl);
                if (box.width > 0 && box.height > 0) {
                    const result = await decodeRegion(this.video, box, this.scratchCanvas);
                    if (onTick) onTick();
                    if (result) {
                        this.stop();
                        onResult(result);
                        return;
                    }
                }
            } catch (e) {
                console.warn('Scan tick failed:', e);
            }

            if (this._running) {
                this._timer = setTimeout(tick, this.intervalMs);
            }
        };

        tick();
    }

    stop() {
        this._running = false;
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
    }

    get running() {
        return this._running;
    }
}