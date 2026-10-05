export interface CompressionResult {
  file: File;
  originalSize: number;
  finalSize: number;
  compressed: boolean;
}

export const compressImage = async (
  file: File,
  maxMB: number,
  maxWidthOrHeight: number = 1920
): Promise<CompressionResult> => {
  const originalSize = file.size;
  // If it's not an image (e.g. video) or it's a type we shouldn't compress (like gif or svg), just return it
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return { file, originalSize, finalSize: originalSize, compressed: false };
  }

  // If it's small enough, we might still want to resize/webp it to save space, but let's say we only do it if we need to or to normalize to webp.
  // Actually, "Convertir a WEBP cuando sea compatible" and "Redimensionar imágenes muy grandes".

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
        if (width > height) {
          height = Math.round((height * maxWidthOrHeight) / width);
          width = maxWidthOrHeight;
        } else {
          width = Math.round((width * maxWidthOrHeight) / height);
          height = maxWidthOrHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback if canvas fails
        resolve({ file, originalSize, finalSize: originalSize, compressed: false });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // We use webp for better compression, with a 0.85 quality
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ file, originalSize, finalSize: originalSize, compressed: false });
            return;
          }
          
          const finalSize = blob.size;
          // If the compressed size is somehow larger, use original unless original exceeds limit
          if (finalSize > originalSize && originalSize <= maxMB * 1024 * 1024) {
             resolve({ file, originalSize, finalSize: originalSize, compressed: false });
             return;
          }

          const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
            type: 'image/webp',
            lastModified: Date.now(),
          });

          resolve({
            file: newFile,
            originalSize,
            finalSize,
            compressed: true
          });
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ file, originalSize, finalSize: originalSize, compressed: false });
    };

    img.src = url;
  });
};
