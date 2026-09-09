// Client-side logo normalization: arbitrary client logos (any aspect ratio,
// any format, usually with their own opaque background rather than
// transparent) are resized down to fit one bounding box and re-encoded as a
// single consistent PNG. This keeps the stored payload small and predictable
// without needing a server-side image library (no persistent disk / sharp on
// this Netlify Functions deployment).

const MAX_SOURCE_BYTES = 2 * 1024 * 1024; // 2MB
const BOX_WIDTH = 480;
const BOX_HEIGHT = 160;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export class LogoUploadError extends Error {}

export async function normalizeLogoFile(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new LogoUploadError('Please upload a PNG, JPG, WebP or SVG image.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new LogoUploadError('Image is too large — please use a file under 2MB.');
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(sourceUrl);
    const scale = Math.min(BOX_WIDTH / img.width, BOX_HEIGHT / img.height, 1);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new LogoUploadError('Could not process this image.');
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LogoUploadError('Could not read this image.'));
    img.src = src;
  });
}
