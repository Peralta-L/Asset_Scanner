import { startCamera, stopCamera, captureFullResPhoto, getFocusCapabilities, setFocusDistance, focusAtPoint } from '../camera.js';
import { getTargetBoxInVideoCoords, setStatus, setFields, flashTargetBox } from '../ui.js';
import { ScanLoop } from '../scanner.js';
import { runOcr, getOcrWorker } from '../ocr.js';

const video = document.getElementById('video');
const cameraContainer = document.getElementById('camera-container');
const targetBox = document.getElementById('target-box');
const scratchCanvas = document.getElementById('scratch-canvas');
const photoCanvas = document.getElementById('photo-canvas');
const photoPreview = document.getElementById('photo-preview');
const focusControls = document.getElementById('focus-controls');
const focusSlider = document.getElementById('focus-slider');

const startBtn = document.getElementById('startcam');
const stopBtn = document.getElementById('stopcam');
const ocrBtn = document.getElementById('ocr-fallback');
const submitBtn = document.getElementById('submit');
const ReviewBtn = document.getElementById('Review-Submitions');

let cameraStream = null;
let cameraTrack = null;
let scanLoop = null;

// Shows a brief pulsing ring where the user tapped, as feedback that the tap
// registered (even on devices where tap-to-focus itself isn't supported).
function showFocusRing(clientX, clientY) {
    const rect = cameraContainer.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.className = 'focus-ring';
    ring.style.left = `${clientX - rect.left}px`;
    ring.style.top = `${clientY - rect.top}px`;
    cameraContainer.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
}

async function handleTapToFocus(clientX, clientY) {
    if (!cameraTrack) return;
    showFocusRing(clientX, clientY);

    const rect = video.getBoundingClientRect();
    const xNorm = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const yNorm = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));

    const ok = await focusAtPoint(cameraTrack, xNorm, yNorm);
    if (ok) setStatus('Focusing...');
}

cameraContainer.addEventListener('click', (e) => handleTapToFocus(e.clientX, e.clientY));

function onScanResult(result) {
    setFields({ serviceTag: result });
    setStatus(`Found service tag: ${result}`);
    flashTargetBox();
}

function resumeScanning() {
    if (!scanLoop || scanLoop.running) return;
    setStatus('Line up the label in the box...');
    scanLoop.start(onScanResult);
}

startBtn.addEventListener('click', async () => {
    try {
        setStatus('Starting camera...');
        const { stream, track } = await startCamera(video);
        cameraStream = stream;
        cameraTrack = track;

        startBtn.disabled = true;
        stopBtn.disabled = false;
        ocrBtn.disabled = false;
        photoPreview.hidden = true;

        scanLoop = new ScanLoop({
            video,
            targetBoxEl: targetBox,
            scratchCanvas,
            getBox: getTargetBoxInVideoCoords,
            intervalMs: 300
        });

        // Only show the manual slider when the device genuinely exposes a
        // focus-distance range — otherwise tap-to-focus (always wired above)
        // is the only control available, which is normal and fine.
        const focusCaps = getFocusCapabilities(track);
        if (focusCaps.hasManualDistance) {
            focusSlider.min = focusCaps.distanceMin;
            focusSlider.max = focusCaps.distanceMax;
            focusSlider.step = focusCaps.distanceStep || 0.01;
            focusSlider.value = focusCaps.distanceMin; // start near the macro end
            focusControls.hidden = false;
        } else {
            focusControls.hidden = true;
        }

        resumeScanning();

        // Fire-and-forget: downloads/inits the OCR worker in the background
        // now, so the first tap of "scan text instead" isn't stuck waiting
        // on a multi-MB download + WASM init.
        getOcrWorker().catch((e) => console.warn('OCR worker warm-up failed:', e));
    } catch (error) {
        console.error('Error accessing camera:', error);
        setStatus('Could not access camera. Check permissions.');
    }
});

stopBtn.addEventListener('click', () => {
    if (scanLoop) scanLoop.stop();
    stopCamera(cameraStream);
    cameraStream = null;
    cameraTrack = null;
    scanLoop = null;

    startBtn.disabled = false;
    stopBtn.disabled = true;
    ocrBtn.disabled = true;
    focusControls.hidden = true;
    setStatus('Camera stopped.');
});

focusSlider.addEventListener('input', () => {
    if (!cameraTrack) return;
    setFocusDistance(cameraTrack, parseFloat(focusSlider.value));
});

ocrBtn.addEventListener('click', async () => {
    if (!cameraStream) {
        setStatus('Start the camera first.');
        return;
    }

    // Pause live DataMatrix scanning while we take and process the OCR still —
    // no point burning cycles on both at once.
    if (scanLoop) scanLoop.stop();
    ocrBtn.disabled = true;

    setStatus('Capturing photo for text scan...');
    await captureFullResPhoto(cameraTrack, video, photoCanvas);
    photoPreview.src = photoCanvas.toDataURL('image/png');
    photoPreview.hidden = false;

    // Crop down to just the target-box region before OCR — running Tesseract
    // on the full frame (background, hands, desk, etc.) is the single biggest
    // reason OCR feels slow. photoCanvas may be a different resolution than
    // the live video preview (ImageCapture can return full sensor res), so
    // scale the box coordinates into photoCanvas's own pixel space first.
    const box = getTargetBoxInVideoCoords(video, targetBox);
    const scaleX = photoCanvas.width / video.videoWidth;
    const scaleY = photoCanvas.height / video.videoHeight;

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = Math.max(1, Math.round(box.width * scaleX));
    croppedCanvas.height = Math.max(1, Math.round(box.height * scaleY));
    croppedCanvas.getContext('2d').drawImage(
        photoCanvas,
        Math.round(box.x * scaleX), Math.round(box.y * scaleY),
        Math.round(box.width * scaleX), Math.round(box.height * scaleY),
        0, 0,
        croppedCanvas.width, croppedCanvas.height
    );

    setStatus('Scanning photo with OCR...');
    const { assetNumber, serialNumber } = await runOcr(croppedCanvas);

    setFields({ serviceTag: serialNumber, inventorySticker: assetNumber });

    if (!assetNumber && !serialNumber) {
        setStatus('Nothing detected — try getting closer and retaking.');
    } else {
        setStatus(`Inventory sticker: ${assetNumber || 'not found'} | Service tag: ${serialNumber || 'not found'}`);
    }

    ocrBtn.disabled = false;
    resumeScanning();
});

submitBtn.addEventListener('click', async () => {

    const data = {
        InventoryNumber: document.getElementById('inventory-sticker').value,
        SerialNumber: document.getElementById('service-tag').value,
        Model: document.getElementById('model').value,
        Brand: document.getElementById('brand').value,
        ItemType: document.getElementById('item-type').value,
        AssignedTo: document.getElementById('assigned-to').value
    }

    const statusEl = document.getElementById('status');
    
    try{
        const response = await fetch('/assets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            statusEl.textContent = 'Asset submitted successfully!';
        } else {
            statusEl.textContent = `Error submitting asset: ${result.error}`;
        }
    }
    catch (err) {
        statusEl.textContent = `Error submitting asset: ${err.message}`;
    }
});

ReviewBtn.addEventListener('click', async () => {
    try{
        window.location.href = '/reviewdata.html';
    }
    catch (err) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = `Error navigating to review page: ${err.message}`;
    }
});