// Camera lifecycle. Preview stays low-res/smooth on purpose — it's only used
// for framing and live decoding. Full resolution is pulled separately (via
// ImageCapture) only when we actually need a high-quality still, i.e. for OCR.

export async function startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
        }
    });

    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {
        /* Autoplay can reject before user gesture settles on some browsers;
           the click that triggered startCamera() already counts as the gesture. */
    });

    const track = stream.getVideoTracks()[0];

    // Continuous autofocus only — no automatic zoom. On most phones zoom is
    // digital (crop + upscale) and introduces rolling-shutter wobble rather
    // than helping; let the user physically move closer instead.
    try {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
    } catch (e) {
        console.warn('Could not enable continuous autofocus:', e);
    }

    return { stream, track };
}

export function stopCamera(stream) {
    if (!stream) return;
    stream.getTracks().forEach(t => t.stop());
}

// Reports which focus controls this device/browser actually exposes, so the
// UI can decide whether to show a manual focus slider, a tap-to-focus hint,
// or neither. Support varies a lot: most desktop webcams offer nothing here,
// most Android/Chrome phones offer at least single-shot + pointsOfInterest,
// some also offer a real focusDistance range.
export function getFocusCapabilities(track) {
    if (!track || !track.getCapabilities) return {};
    const caps = track.getCapabilities();
    return {
        hasManualDistance: !!caps.focusDistance,
        distanceMin: caps.focusDistance ? caps.focusDistance.min : null,
        distanceMax: caps.focusDistance ? caps.focusDistance.max : null,
        distanceStep: caps.focusDistance ? caps.focusDistance.step : null,
        hasTapToFocus: !!(caps.focusMode && caps.focusMode.includes('single-shot')),
        hasPointsOfInterest: !!caps.pointsOfInterest
    };
}

// Sets an explicit focus distance (0 = infinity/far, 1 = closest/macro on most
// implementations, but always read min/max from getFocusCapabilities rather
// than assuming that range). This is the most reliable fix for close-up
// DataMatrix scanning — it bypasses autofocus hunting entirely.
export async function setFocusDistance(track, distance) {
    try {
        await track.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: distance }] });
        return true;
    } catch (e) {
        console.warn('Manual focus distance not supported:', e);
        return false;
    }
}

// Triggers a single-shot autofocus pass centered on a specific point in the
// frame (normalized 0-1 coordinates), then returns to continuous mode. This
// is what a "tap the label to focus" gesture should call.
export async function focusAtPoint(track, xNorm, yNorm) {
    try {
        const advanced = [{ focusMode: 'single-shot' }];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.pointsOfInterest) {
            advanced[0].pointsOfInterest = [{ x: xNorm, y: yNorm }];
        }
        await track.applyConstraints({ advanced });

        // Give the single-shot focus a moment to settle, then hand back to
        // continuous AF so it doesn't stay locked on an old point forever.
        setTimeout(() => {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }, 1500);

        return true;
    } catch (e) {
        console.warn('Tap-to-focus not supported:', e);
        return false;
    }
}

// Grabs the highest-resolution still the device can produce, for the OCR
// fallback path (OCR benefits from real resolution; live barcode scanning
// does not, since it works off small cropped regions instead).
export async function captureFullResPhoto(track, video, canvas) {
    const context = canvas.getContext('2d');

    if (track && 'ImageCapture' in window) {
        try {
            const imageCapture = new ImageCapture(track);
            const blob = await imageCapture.takePhoto();
            const bitmap = await createImageBitmap(blob);
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            return canvas;
        } catch (e) {
            console.warn('ImageCapture.takePhoto() failed, falling back to video frame:', e);
        }
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
}