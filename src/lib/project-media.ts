export const MEDIA_LIMITS = {
  image: 15_000_000,
  video: 30_000_000,
  gallery: 150_000_000,
  images: 40,
  videos: 6,
  duration: 90,
};
export function validateUpload(file: { type: string; size: number }, duration?: number) {
  const video = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
  if (!video && !file.type.startsWith('image/'))
    throw new Error('Choose a photo or an MP4, WebM or MOV video.');
  if (file.size > (video ? MEDIA_LIMITS.video : MEDIA_LIMITS.image))
    throw new Error(
      video ? 'Videos must be 30 MB or smaller.' : 'Original photos must be 15 MB or smaller.',
    );
  if (
    video &&
    duration !== undefined &&
    (!Number.isFinite(duration) || duration <= 0 || duration > 90)
  )
    throw new Error('Videos must be 90 seconds or shorter.');
  return video ? 'video' : 'image';
}
export function validateGallery(
  existing: { kind: string; bytes: number }[],
  addition: { kind: string; bytes: number },
) {
  if (
    existing.filter((m) => m.kind === addition.kind).length >= (addition.kind === 'image' ? 40 : 6)
  )
    throw new Error('Gallery limit: 40 photos and 6 videos.');
  if (existing.reduce((n, m) => n + m.bytes, 0) + addition.bytes > MEDIA_LIMITS.gallery)
    throw new Error('Gallery limit: 150 MB.');
}
async function jpeg(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing unavailable.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Export as JPEG and try again.'))),
      'image/jpeg',
      0.82,
    ),
  );
  return { blob, width: canvas.width, height: canvas.height };
}
export async function prepareMedia(file: File) {
  const kind = validateUpload(file),
    url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
      } catch {
        throw new Error('This photo cannot be decoded. Export as JPEG and try again.');
      }
      return {
        kind,
        ...(await jpeg(image, image.naturalWidth, image.naturalHeight)),
        duration: 0,
        extension: 'jpg',
        poster: undefined,
      };
    }
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Video could not be decoded. Export as MP4 and try again.')),
          20000,
        );
        video.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Video could not be decoded. Export as MP4 and try again.'));
        };
        video.src = url;
      });
      validateUpload(file, video.duration);
      const poster = await jpeg(video, video.videoWidth, video.videoHeight);
      return {
        kind,
        blob: file as Blob,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        extension:
          file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4',
        poster: poster.blob,
      };
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
