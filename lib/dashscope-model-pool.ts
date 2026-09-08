/**
 * 百炼「额度充沛」模型池：主模型 FreeTierOnly / 403 时按序回退。
 *
 * 百炼规则：每个模型免费额度独立；用完不会自动切，需换 model 参数。
 * 本模块在进程内记住 FreeTierOnly 已耗尽的模型，后续调用直接跳过。
 *
 * env:
 *   DASHSCOPE_IMAGE_MODEL        主生图模型
 *   DASHSCOPE_IMAGE_MODELS       逗号分隔回退池（含主模型也可，会去重）
 *   DASHSCOPE_VIDEO_MODEL        主图生视频模型
 *   DASHSCOPE_VIDEO_MODELS       逗号分隔回退池
 */

export function parseModelList(...chunks: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const part of chunk.split(/[,，\s]+/)) {
      const m = part.trim();
      if (!m || seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/**
 * 默认生图池：优先 wan2.7-image（写实/五官/色彩更强），再 qwen / 旧 wan 兜底。
 */
export const DEFAULT_DASHSCOPE_IMAGE_POOL = [
  'wan2.7-image-pro',
  'wan2.7-image',
  'qwen-image-max',
  'qwen-image-3.0-pro',
  'qwen-image-3.0',
  'qwen-image-2.0-pro',
  'qwen-image-plus',
  'wan2.6-t2i',
] as const;

/**
 * 默认视频池：优先官方推荐 wan2.7-i2v（有声、表演强），再 flash / 旧 r2v 兜底。
 */
export const DEFAULT_DASHSCOPE_VIDEO_POOL = [
  'wan2.7-i2v',
  'wan2.7-i2v-2026-04-25',
  'wan2.6-i2v-flash',
  'wan2.7-r2v-2026-06-12',
  'happyhorse-1.1-i2v',
  'wan3.0-video',
] as const;

/** 进程内：FreeTierOnly 已耗尽的模型（换进程/重启会清空） */
const freeTierExhaustedModels = new Set<string>();

export function markDashscopeFreeTierExhausted(model: string): void {
  if (!model) return;
  freeTierExhaustedModels.add(model);
}

export function isDashscopeFreeTierExhausted(model: string): boolean {
  return freeTierExhaustedModels.has(model);
}

/** 测试用 */
export function clearDashscopeFreeTierExhausted(): void {
  freeTierExhaustedModels.clear();
}

/**
 * 把已记为 FreeTier 耗尽的模型挪到队尾（仍保留，以防额度刷新）；
 * 优先打还有机会的模型。
 */
export function prioritizeDashscopePool(models: string[]): string[] {
  if (!models.length) return models;
  const fresh: string[] = [];
  const exhausted: string[] = [];
  for (const m of models) {
    if (freeTierExhaustedModels.has(m)) exhausted.push(m);
    else fresh.push(m);
  }
  return fresh.length ? [...fresh, ...exhausted] : models;
}

export function resolveDashscopeImagePool(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = env.DASHSCOPE_IMAGE_MODEL || DEFAULT_DASHSCOPE_IMAGE_POOL[0];
  // 显式池优先，再拼默认池补齐 —— 额度用尽仍能自动切到下一个免费档
  const list = parseModelList(
    primary,
    env.DASHSCOPE_IMAGE_MODELS,
    DEFAULT_DASHSCOPE_IMAGE_POOL.join(','),
  );
  const base = list.length ? list : [...DEFAULT_DASHSCOPE_IMAGE_POOL];
  return prioritizeDashscopePool(base);
}

export function resolveDashscopeVideoPool(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = env.DASHSCOPE_VIDEO_MODEL || DEFAULT_DASHSCOPE_VIDEO_POOL[0];
  const list = parseModelList(
    primary,
    env.DASHSCOPE_VIDEO_MODELS,
    DEFAULT_DASHSCOPE_VIDEO_POOL.join(','),
  );
  const base = list.length ? list : [...DEFAULT_DASHSCOPE_VIDEO_POOL];
  return prioritizeDashscopePool(base);
}

export function isDashscopeQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /FreeTierOnly|AllocationQuota|Throttling\.Allocation|quota exhausted|免费额度/i.test(msg);
}

/** 明确「该模型免费额度用尽」——可记入跳过表；限流 429 不永久跳过。 */
export function isDashscopeFreeTierOnlyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /FreeTierOnly|AllocationQuota\.FreeTierOnly|quota exhausted|免费额度/i.test(msg);
}

/** 可回退错误：额度、限流、模型不可用；参数错误不回退（换模型也大概率挂）。 */
export function isDashscopeRetryableModelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  // r2v 拒「仅 first_frame」→ 应换下一个模型（如 i2v），不要整池停死
  if (/Only first frame provided is not allowed/i.test(msg)) return true;
  if (/InvalidParameter|customPrompt|requires firstFrame/i.test(msg)) return false;
  return (
    isDashscopeQuotaError(err)
    || /\b403\b|\b429\b|\b503\b|Throttling\.RateQuota|ModelNotExist|model not exist|AccessDenied|unavailable/i.test(msg)
  );
}

export async function runWithModelPool<T>(
  models: string[],
  run: (model: string) => Promise<T>,
  opts?: { label?: string; onSkip?: (model: string, err: unknown) => void },
): Promise<T> {
  const ordered = prioritizeDashscopePool(models);
  if (!ordered.length) throw new Error('dashscope model pool empty');
  let last: unknown;
  for (let i = 0; i < ordered.length; i++) {
    const model = ordered[i];
    try {
      return await run(model);
    } catch (e) {
      last = e;
      if (isDashscopeFreeTierOnlyError(e)) {
        markDashscopeFreeTierExhausted(model);
        console.warn(`[DashScopePool] ${model} FreeTier 已记为耗尽，后续优先跳过`);
      }
      const retryable = isDashscopeRetryableModelError(e);
      const hasNext = i < ordered.length - 1;
      opts?.onSkip?.(model, e);
      if (!retryable || !hasNext) throw e;
      console.warn(
        `[DashScopePool] ${opts?.label || 'call'} skip ${model}: ${e instanceof Error ? e.message.slice(0, 120) : e} → try next ${ordered[i + 1]}`,
      );
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
