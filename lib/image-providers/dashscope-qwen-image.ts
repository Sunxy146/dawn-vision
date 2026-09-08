/**
 * 阿里云百炼 DashScope — 文生图 / 图生图 (wan2.7-image / qwen-image 同端点)。
 *
 * 原生端点(非 OpenAI images/generations):
 *   POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 *
 * - wan2.7-image*：写实/五官更强，thinking_mode 提质；支持参考图编辑
 * - qwen-image*：I2I 锁脸稳；文排版强
 *
 * env:
 *   DASHSCOPE_API_KEY 或 OPENAI_API_KEY(同 key 即可)
 *   DASHSCOPE_IMAGE_ENABLED=1  显式开启(默认关,避免误打)
 *   DASHSCOPE_IMAGE_MODEL      主模型(默认 wan2.7-image-pro)
 *   DASHSCOPE_IMAGE_MODELS     回退池(逗号分隔);额度耗尽自动换下一个
 *   DASHSCOPE_IMAGE_THINKING=1 wan2.7 thinking_mode（默认开）
 *   DASHSCOPE_BASE_URL         默认北京区 dashscope.aliyuncs.com
 */
import { registerImageProvider } from './registry';
import type { ImageGenerateInput, AspectRatio } from './types';
import { resolveDashscopeImagePool, runWithModelPool } from '@/lib/dashscope-model-pool';
import { collectUsableImageRefs, materializeImageRefs } from '@/lib/image-refs';

const DEFAULT_HOST = 'https://dashscope.aliyuncs.com';
const DEFAULT_MODEL = 'wan2.7-image-pro';

type ContentPart = { text: string } | { image: string };

/** 是否走 wan2.6 及更早 t2i 尺寸约束(总像素约 1280²–1440²) */
export function isWan26ImageModel(model?: string): boolean {
  const m = (model || '').toLowerCase();
  return /wan2\.[1-6].*t2i|wanx.*t2i|wanx-v1/.test(m);
}

/** wan2.7-image / wan2.7-image-pro：2K 写实档 */
export function isWan27ImageModel(model?: string): boolean {
  return /wan2\.7-image/i.test(model || '');
}

/** 支持 multimodal 参考图：qwen-image*、wan2.7-image* */
export function isDashscopeI2iModel(model?: string): boolean {
  return /qwen-image|wan2\.7-image/i.test(model || '');
}

/**
 * 按模型选 size。
 * - wan2.7-image* : 官方 2K 推荐分辨率
 * - qwen-image-*  : 官方固定档
 * - wan2.6-t2i    : 总像素 [1280*1280, 1440*1440]
 */
export function dashscopeImageSize(
  aspect?: AspectRatio,
  model: string = process.env.DASHSCOPE_IMAGE_MODEL || DEFAULT_MODEL,
): string {
  if (isWan27ImageModel(model)) {
    switch (aspect) {
      case '9:16':
        return '1536*2688';
      case '3:4':
        return '1728*2368';
      case '1:1':
        return '2048*2048';
      case '4:3':
        return '2368*1728';
      default:
        return '2688*1536'; // 16:9 / scope
    }
  }
  if (isWan26ImageModel(model)) {
    switch (aspect) {
      case '9:16':
        return '960*1696';
      case '3:4':
        return '1104*1472';
      case '1:1':
        return '1280*1280';
      case '4:3':
        return '1472*1104';
      default:
        return '1696*960';
    }
  }
  // qwen-image-max / plus / 3.0 固定档
  switch (aspect) {
    case '9:16':
      return '928*1664';
    case '3:4':
      return '1104*1472';
    case '1:1':
      return '1328*1328';
    case '4:3':
      return '1472*1104';
    default:
      return '1664*928';
  }
}

/** 有参考图时优先 I2I 模型（wan2.7-image / qwen-image）。 */
export function resolveDashscopePoolForInput(
  input: ImageGenerateInput,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const pool = resolveDashscopeImagePool(env);
  const refCount = collectUsableImageRefs(input, 3).length;
  if (refCount === 0) return pool;
  const i2i = pool.filter(isDashscopeI2iModel);
  return i2i.length ? i2i : pool;
}

export function buildCameoI2iPrompt(prompt: string, nRefs: number): string {
  if (nRefs <= 0) return prompt;
  const head =
    nRefs === 1
      ? 'Image 1 is the locked character identity (face/age/hair). Keep strong facial likeness. Generate a NEW shot composition, not a collage. '
      : `Images 1-${Math.min(nRefs, 3)} are locked character/style references (image 1 = primary face identity). Keep facial likeness for each matched character. Generate a NEW shot composition, not a collage. `;
  return head + prompt;
}

export function buildDashscopeImageBody(
  input: ImageGenerateInput,
  env: NodeJS.ProcessEnv = process.env,
  modelOverride?: string,
  /** 已 materialize 的参考图（http 或 data:），最多 3 张 */
  refImages: string[] = [],
): {
  model: string;
  input: { messages: Array<{ role: string; content: ContentPart[] }> };
  parameters: Record<string, string | number | boolean>;
} {
  const model = modelOverride || env.DASHSCOPE_IMAGE_MODEL || DEFAULT_MODEL;
  const refs = refImages.filter((u) => u.startsWith('http') || u.startsWith('data:')).slice(0, 3);
  const content: ContentPart[] = [];
  for (const img of refs) content.push({ image: img });
  content.push({ text: buildCameoI2iPrompt(input.prompt, refs.length) });

  const parameters: Record<string, string | number | boolean> = {
    size: dashscopeImageSize(input.aspectRatio, model),
    n: 1,
    watermark: env.DASHSCOPE_IMAGE_WATERMARK === '1',
  };
  // wan2.7-image 不支持 prompt_extend，改用 thinking_mode 提质
  if (isWan27ImageModel(model)) {
    parameters.thinking_mode = env.DASHSCOPE_IMAGE_THINKING !== '0';
  } else {
    parameters.prompt_extend = env.DASHSCOPE_IMAGE_PROMPT_EXTEND === '1';
  }

  return {
    model,
    input: {
      messages: [{ role: 'user', content }],
    },
    parameters,
  };
}

export function extractDashscopeImageUrl(data: unknown): string {
  const d = data as {
    output?: {
      choices?: Array<{ message?: { content?: Array<{ image?: string }> } }>;
      results?: Array<{ url?: string }>;
    };
  };
  const choiceImg = d?.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (choiceImg && /^https?:\/\//.test(choiceImg)) return choiceImg;
  const resultUrl = d?.output?.results?.[0]?.url;
  if (resultUrl && /^https?:\/\//.test(resultUrl)) return resultUrl;
  return '';
}

export function hasDashscopeImage(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DASHSCOPE_IMAGE_ENABLED !== '1') return false;
  return !!(env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY);
}

async function callDashscopeImageOnce(
  input: ImageGenerateInput,
  model: string,
  env: NodeJS.ProcessEnv,
  refImages: string[],
): Promise<{ imageUrl: string; provider: string; model: string }> {
  const useRefs = refImages.length > 0 && isDashscopeI2iModel(model) ? refImages.slice(0, 3) : [];
  if (refImages.length > 0 && useRefs.length === 0) {
    console.warn(`[DashScopeImage] ${model} 不支持 I2I，本轮退回纯 t2i（锁脸可能弱）`);
  }

  const key = env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY || '';
  const host = (env.DASHSCOPE_BASE_URL || DEFAULT_HOST).replace(/\/+$/, '');
  const url = `${host}/api/v1/services/aigc/multimodal-generation/generation`;
  const body = buildDashscopeImageBody(input, env, model, useRefs);

  const controller = new AbortController();
  // wan2.7 thinking_mode 更慢
  const timeoutMs = isWan27ImageModel(model) ? 240_000 : 120_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`dashscope-image ${r.status}: ${txt.slice(0, 200)}`);
    }
    const imageUrl = extractDashscopeImageUrl(await r.json());
    if (!imageUrl) throw new Error('dashscope-image 响应里没有 image url');
    return { imageUrl, provider: 'dashscope-qwen-image', model };
  } finally {
    clearTimeout(timer);
  }
}

/** 直接调用百炼文生图/图生图(不经 plugin registry)。额度耗尽按池回退。 */
export async function generateDashscopeImage(
  input: ImageGenerateInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ imageUrl: string; provider: string; model?: string }> {
  if (!hasDashscopeImage(env)) throw new Error('dashscope-image not enabled');
  const rawRefs = collectUsableImageRefs(input, 3);
  const refImages = rawRefs.length ? await materializeImageRefs(rawRefs) : [];
  if (rawRefs.length && refImages.length === 0) {
    console.warn('[DashScopeImage] 有锁脸/参考 URL 但全部 materialize 失败，退回纯 t2i');
  } else if (refImages.length > 0) {
    console.log(`[DashScopeImage] I2I with ${refImages.length} ref(s) for: ${input.label || 'image'}`);
  }
  const pool = resolveDashscopePoolForInput(input, env);
  return runWithModelPool(
    pool,
    (model) => callDashscopeImageOnce(input, model, env, refImages),
    { label: input.label || 'image' },
  );
}

registerImageProvider({
  id: 'dashscope-qwen-image',
  name: '阿里云百炼文生图 (wan2.7 / qwen-image)',
  supportsRefs: true,
  maxRefImages: 3,
  priority: 40,
  available: () => hasDashscopeImage(),
  async generate(input: ImageGenerateInput) {
    return generateDashscopeImage(input);
  },
});
