import { startCamera, stopCamera, captureFullResPhoto, getFocusCapabilities, setFocusDistance, focusAtPoint, getZoomCapabilities, setZoom } from '../camera.js';
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
const zoomControls = document.getElementById('zoom-controls');
const zoomSlider = document.getElementById('zoom-slider');

const startBtn = document.getElementById('startcam');
const stopBtn = document.getElementById('stopcam');
const ocrBtn = document.getElementById('ocr-fallback');
const submitBtn = document.getElementById('submit');
const ReviewBtn = document.getElementById('Review-Submitions');

let cameraStream = null;
let cameraTrack = null;
let scanLoop = null;
let currentFocusCaps = {};

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
    if (!currentFocusCaps.hasTapToFocus && !currentFocusCaps.hasPointsOfInterest) return;
    showFocusRing(clientX, clientY);

    const rect = video.getBoundingClientRect();
    const xNorm = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const yNorm = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));

    const ok = await focusAtPoint(cameraTrack, xNorm, yNorm);
    if (ok) setStatus('Focusing...');
}

cameraContainer.addEventListener('click', (e) => {
    if (Date.now() < suppressTapUntil) return; // just finished a pinch, not a real tap
    handleTapToFocus(e.clientX, e.clientY);
});

// ---------- Pinch-to-zoom ----------
let suppressTapUntil = 0;
let pinchState = null; // { startDist, startZoom, min, max }

function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

cameraContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2 || !cameraTrack) return;

    const zoomCaps = getZoomCapabilities(cameraTrack);
    if (!zoomCaps.hasZoom) return;

    e.preventDefault();
    pinchState = {
        startDist: touchDistance(e.touches),
        startZoom: parseFloat(zoomSlider.value) || zoomCaps.zoomMin,
        min: zoomCaps.zoomMin,
        max: zoomCaps.zoomMax
    };
}, { passive: false });

cameraContainer.addEventListener('touchmove', (e) => {
    if (!pinchState || e.touches.length !== 2) return;
    e.preventDefault();

    const ratio = touchDistance(e.touches) / pinchState.startDist;
    const newZoom = Math.min(pinchState.max, Math.max(pinchState.min, pinchState.startZoom * ratio));

    zoomSlider.value = newZoom;
    setZoom(cameraTrack, newZoom);
}, { passive: false });

cameraContainer.addEventListener('touchend', () => {
    if (pinchState) {
        suppressTapUntil = Date.now() + 400;
        pinchState = null;
    }
});

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
        currentFocusCaps = focusCaps;
        if (focusCaps.hasManualDistance) {
            focusSlider.min = focusCaps.distanceMin;
            focusSlider.max = focusCaps.distanceMax;
            focusSlider.step = focusCaps.distanceStep || 0.01;
            focusSlider.value = focusCaps.distanceMin; // start near the macro end
            focusControls.hidden = false;
        } else {
            focusControls.hidden = true;
        }

        // Safari/iOS exposes none of the focus-control APIs at all (no
        // focusMode, focusDistance, or pointsOfInterest via getCapabilities).
        // Tapping does nothing there, so hide the hint instead of showing
        // guidance for a gesture that silently no-ops on that platform.
        const scanHint = document.getElementById('scan-hint');
        if (scanHint) {
            scanHint.hidden = !(focusCaps.hasTapToFocus || focusCaps.hasPointsOfInterest);
        }

        // Zoom slider — reliable control everywhere zoom is supported (mostly
        // Chrome/Android). Pinch-to-zoom (wired above) works alongside it and
        // keeps the slider in sync as the user pinches.
        const zoomCaps = getZoomCapabilities(track);
        if (zoomCaps.hasZoom) {
            zoomSlider.min = zoomCaps.zoomMin;
            zoomSlider.max = zoomCaps.zoomMax;
            zoomSlider.step = zoomCaps.zoomStep;
            zoomSlider.value = zoomCaps.zoomMin;
            zoomControls.hidden = false;
        } else {
            zoomControls.hidden = true;
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
    currentFocusCaps = {};

    startBtn.disabled = false;
    stopBtn.disabled = true;
    ocrBtn.disabled = true;
    focusControls.hidden = true;
    zoomControls.hidden = true;
    setStatus('Camera stopped.');
});

focusSlider.addEventListener('input', () => {
    if (!cameraTrack) return;
    setFocusDistance(cameraTrack, parseFloat(focusSlider.value));
});

zoomSlider.addEventListener('input', () => {
    if (!cameraTrack) return;
    setZoom(cameraTrack, parseFloat(zoomSlider.value));
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

    const inventoryInput = document.getElementById('inventory-sticker');
    const serviceTagInput = document.getElementById('service-tag');
    const modelInput = document.getElementById('model');
    const assignedToInput = document.getElementById('assigned-to');

    // Validate against the pattern/maxlength/required rules set in the HTML
    // (inventory sticker: E + 4-6 digits, service tag: 5-12 alphanumeric,
    // etc). reportValidity() shows the browser's native inline error bubble
    // on whichever field is invalid and focuses it, so nothing bad reaches
    // the server and the user sees exactly what to fix.
    const fieldsToValidate = [inventoryInput, serviceTagInput, modelInput, assignedToInput];
    const firstInvalid = fieldsToValidate.find(input => !input.checkValidity());
    if (firstInvalid) {
        firstInvalid.reportValidity();
        setStatus('Please fix the highlighted field before submitting.');
        return;
    }

    const data = {
        InventoryNumber: inventoryInput.value,
        SerialNumber: serviceTagInput.value,
        Model: modelInput.value,
        Brand: document.getElementById('brand').value,
        ItemType: document.getElementById('item-type').value,
        AssignedTo: assignedToInput.value
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

            // Clear just the scan-derived fields so the form is ready for the
            // next device — Brand/Item type/Model/Assigned to are left as-is
            // since batches of the same item type often repeat those values.
            inventoryInput.value = '';
            serviceTagInput.value = '';
            inventoryInput.focus();
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