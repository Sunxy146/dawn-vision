/**
 * 出图参考图归一化：站内 /api/serve-file、data:、http(s) 都算有效锚点。
 * 外部引擎（fal/minimax/百炼 I2I）读不到相对 serve-file 时，转成 data: URI。
 */
import { toVisionImageInput } from '@/lib/cameo-vision';

export function isUsableImageRef(u?: string | null): boolean {
  if (!u || typeof u !== 'string') return false;
  return (
    /^https?:\/\//i.test(u)
    || u.startsWith('data:')
    || u.startsWith('/api/serve-file')
  );
}

/** 去重保序，最多 max 张；保留 serve-file / data: / http。 */
export function collectUsableImageRefs(
  opts: { cref?: string; sref?: string; referenceImages?: string[] },
  max = 8,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string) => {
    if (!isUsableImageRef(u) || !u || seen.has(u) || out.length >= max) return;
    seen.add(u);
    out.push(u);
  };
  // 身份优先：cref → referenceImages → sref（画风）
  push(opts.cref);
  if (Array.isArray(opts.referenceImages)) {
    for (const u of opts.referenceImages) push(u);
  }
  push(opts.sref);
  return out;
}

/** 把 serve-file 等转成外部 API 可消费的 http / data:；失败则跳过该条。 */
export async function materializeImageRefs(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const u of urls) {
    if (!isUsableImageRef(u)) continue;
    try {
      const m = await toVisionImageInput(u);
      if (m && (m.startsWith('http') || m.startsWith('data:'))) out.push(m);
    } catch {
      /* 单张失败不挡整池 */
    }
  }
  return out;
}
