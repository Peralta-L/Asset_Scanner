// Converts the on-screen target box (CSS/percentage position over the video
// element) into native pixel coordinates on the actual video frame. This is
// the piece that has to stay correct or the box will look right on screen
// while cropping the wrong region internally. Assumes `object-fit: cover`
// on the <video> element (see style.css) — if that changes, this math needs
// to change too.
export function getTargetBoxInVideoCoords(video, targetBoxEl) {
    if (!video.videoWidth || !video.videoHeight) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    const videoRect = video.getBoundingClientRect();
    const boxRect = targetBoxEl.getBoundingClientRect();

    const boxLeftFrac = (boxRect.left - videoRect.left) / videoRect.width;
    const boxTopFrac = (boxRect.top - videoRect.top) / videoRect.height;
    const boxWidthFrac = boxRect.width / videoRect.width;
    const boxHeightFrac = boxRect.height / videoRect.height;

    const videoNativeRatio = video.videoWidth / video.videoHeight;
    const displayRatio = videoRect.width / videoRect.height;

    let scale, offsetXNative = 0, offsetYNative = 0;

    if (videoNativeRatio > displayRatio) {
        // Native frame is relatively wider than the display box -> cropped on the sides
        scale = video.videoHeight / videoRect.height;
        offsetXNative = (video.videoWidth - videoRect.width * scale) / 2;
    } else {
        // Native frame is relatively taller -> cropped top/bottom
        scale = video.videoWidth / videoRect.width;
        offsetYNative = (video.videoHeight - videoRect.height * scale) / 2;
    }

    return {
        x: Math.max(0, Math.round(boxLeftFrac * videoRect.width * scale + offsetXNative)),
        y: Math.max(0, Math.round(boxTopFrac * videoRect.height * scale + offsetYNative)),
        width: Math.round(boxWidthFrac * videoRect.width * scale),
        height: Math.round(boxHeightFrac * videoRect.height * scale)
    };
}

export function setStatus(msg) {
    const el = document.getElementById('status');
    if (el) el.textContent = msg;
    console.log(msg);
}

export function setFields({ serviceTag, inventorySticker }) {
    if (serviceTag) document.getElementById('service-tag').value = serviceTag;
    if (inventorySticker) document.getElementById('inventory-sticker').value = inventorySticker;
}

export function flashTargetBox() {
    const box = document.getElementById('target-box');
    box.classList.add('found');
    setTimeout(() => box.classList.remove('found'), 600);
}