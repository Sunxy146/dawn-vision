/**
 * 浏览器端压图：手机原图常 >10MB，锁脸/Cameo 上传前压到可接受体积。
 * 仅客户端使用（依赖 document/canvas）。
 */

const MAX_EDGE = 2048;
const TARGET_BYTES = 8 * 1024 * 1024;
const ABS_INPUT_MAX = 40 * 1024 * 1024; // 原图硬上限，再大请先手动压缩

export async function compressImageForUpload(
  file: File,
  opts?: { maxEdge?: number; targetBytes?: number; inputMaxBytes?: number },
): Promise<File> {
  const maxEdge = opts?.maxEdge ?? MAX_EDGE;
  const targetBytes = opts?.targetBytes ?? TARGET_BYTES;
  const inputMax = opts?.inputMaxBytes ?? ABS_INPUT_MAX;

  if (!file.type.startsWith('image/')) {
    throw new Error('只能上传图片');
  }
  if (file.size > inputMax) {
    throw new Error(`图片过大(原图上限 ${Math.round(inputMax / 1024 / 1024)}MB)，请先压缩后再传`);
  }
  // 已够小且非超大边：直接传（避免无谓重编码）
  if (file.size <= targetBytes && file.type !== 'image/heic' && file.type !== 'image/heif') {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法压缩图片');
    ctx.drawImage(bitmap, 0, 0, w, h);

    let quality = 0.88;
    let blob: Blob | null = null;
    for (let i = 0; i < 6; i++) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
      );
      if (!blob) break;
      if (blob.size <= targetBytes || quality <= 0.5) break;
      quality -= 0.08;
    }
    if (!blob) throw new Error('图片压缩失败');

    const base = file.name.replace(/\.[^.]+$/, '') || 'face';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
