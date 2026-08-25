import { applyOtsuContrast } from './scanner.js';

let ocrWorker = null;
let ocrWorkerLoading = null;

// Exported so app.js can call this early (e.g. when the camera starts) to
// warm up the worker in the background, instead of paying the multi-MB
// download + WASM init cost on the user's first OCR click.
export async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    if (ocrWorkerLoading) return ocrWorkerLoading; // avoid double-init if called twice quickly

    ocrWorkerLoading = (async () => {
        const worker = await Tesseract.createWorker('eng');
        await worker.setParameters({ tessedit_pageseg_mode: '6' });
        ocrWorker = worker;
        return worker;
    })();

    return ocrWorkerLoading;
}

const MAX_OCR_DIMENSION = 1000;

function capDimension(canvas, maxDim = MAX_OCR_DIMENSION) {
    const longest = Math.max(canvas.width, canvas.height);
    if (longest <= maxDim) return canvas;

    const factor = maxDim / longest;
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * factor);
    c.height = Math.round(canvas.height * factor);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c;
}

export async function runOcr(canvas) {
    // Cap size first (cheaper to threshold a smaller image), then binarize
    // with the same Otsu logic scanner.js uses for barcodes — better for
    // OCR convergence/accuracy than plain grayscale.
    const sized = capDimension(canvas);
    const processed = applyOtsuContrast(sized);

    const worker = await getOcrWorker();
    // Pass the canvas directly — avoids the toDataURL() encode + Tesseract
    // re-decode round trip.
    const result = await worker.recognize(processed);
    const fullText = result.data.text;
    console.log('Full OCR text:', fullText);

    const assetMatch = fullText.match(/E\d{4,6}/);
    const assetNumber = assetMatch ? assetMatch[0] : null;

    const serialMatch = fullText.match(/(?:Service Tag|Serial(?:\s*Number|\s*No)?|S\/N|ST)[:\s]*([A-Z0-9]{5,12})/i);
    const serialNumber = serialMatch ? serialMatch[1] : null;

    return { fullText, assetNumber, serialNumber };
}