/** Capture one frame from the surface the user chooses, then release it immediately. */
export async function captureScreen(): Promise<Blob> {
  if (
    !('mediaDevices' in navigator) ||
    typeof navigator.mediaDevices.getDisplayMedia !== 'function'
  ) {
    throw new Error(
      'Screen capture is unavailable here. Take a screenshot and paste it onto the canvas.',
    );
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  try {
    video.srcObject = stream;
    await video.play();
    const frame = document.createElement('canvas');
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    const context = frame.getContext('2d');
    if (!context || !frame.width || !frame.height)
      throw new Error('No screen image was available.');
    context.drawImage(video, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      frame.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the screenshot.'));
      }, 'image/png');
    });
  } finally {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    video.srcObject = null;
  }
}

export const imageExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};
