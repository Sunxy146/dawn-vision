/**
 * 阿里云百炼 DashScope — 图生视频 (HappyHorse I2V / wan3.0 等同端点)。
 *
 * 异步:
 *   POST /api/v1/services/aigc/video-generation/video-synthesis
 *   Header: X-DashScope-Async: enable
 *   GET  /api/v1/tasks/{task_id}
 *
 * env:
 *   DASHSCOPE_API_KEY 或 OPENAI_API_KEY
 *   DASHSCOPE_VIDEO_ENABLED=1
 *   DASHSCOPE_VIDEO_MODEL=wan2.7-i2v
 *   DASHSCOPE_VIDEO_MODELS=wan2.7-i2v,wan2.7-i2v-2026-04-25,wan2.6-i2v-flash,...
 *   DASHSCOPE_VIDEO_RESOLUTION=720P|1080P
 *   DASHSCOPE_BASE_URL 默认 https://dashscope.aliyuncs.com
 */
import { registerVideoProvider } from './registry';
import type { VideoGenerateInput, VideoGenerateResult } from './types';
import { resolveDashscopeVideoPool, runWithModelPool } from '@/lib/dashscope-model-pool';

const DEFAULT_HOST = 'https://dashscope.aliyuncs.com';
const DEFAULT_MODEL = 'wan2.7-i2v';

export function hasDashscopeVideo(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DASHSCOPE_VIDEO_ENABLED !== '1') return false;
  return !!(env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY);
}

export function dashscopeVideoModel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.DASHSCOPE_VIDEO_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function host(env: NodeJS.ProcessEnv = process.env): string {
  return (env.DASHSCOPE_BASE_URL || DEFAULT_HOST).replace(/\/+$/, '');
}

function key(env: NodeJS.ProcessEnv = process.env): string {
  return env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY || '';
}

function mapResolution(input?: string, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = (env.DASHSCOPE_VIDEO_RESOLUTION || '').toUpperCase();
  if (fromEnv === '720P' || fromEnv === '1080P') return fromEnv;
  if (input) {
    const n = parseInt(input, 10);
    if (n >= 1080) return '1080P';
  }
  return '1080P';
}

function clipDuration(sec?: number, model?: string): number {
  const n = Math.round(sec || 5);
  // wan2.7-i2v: 2–15s；wan3.0 可更长；旧 r2v 常见上限约 10s
  let max = 15;
  if (model && /wan3\.0/.test(model)) max = Math.min(30, Number(process.env.DASHSCOPE_VIDEO_MAX_SEC || 15));
  else if (model && /wan2\.7-i2v/i.test(model)) max = Math.min(15, Number(process.env.DASHSCOPE_VIDEO_MAX_SEC || 15));
  else if (model && /wan2\.7|r2v/i.test(model)) max = Math.min(10, Number(process.env.DASHSCOPE_VIDEO_MAX_SEC || 10));
  return Math.max(3, Math.min(max, n));
}

export function buildDashscopeI2vBody(
  input: VideoGenerateInput,
  env: NodeJS.ProcessEnv = process.env,
  modelOverride?: string,
): {
  model: string;
  input: { prompt: string; media: Array<{ type: string; url: string }> };
  parameters: { resolution: string; duration: number; watermark: boolean };
} {
  const frame = input.firstFrameUrl || '';
  if (!frame) throw new Error('dashscope-i2v requires firstFrameUrl');
  const model = modelOverride || dashscopeVideoModel(env);
  // wan2.7-r2v / happyhorse-r2v：禁止「仅 first_frame」→ InvalidParameter
  // Only first frame provided is not allowed。至少要一张 reference_image。
  // i2v 模型继续只用 first_frame。
  const media: Array<{ type: string; url: string }> = /r2v/i.test(model)
    ? [
        { type: 'reference_image', url: frame },
        { type: 'first_frame', url: frame },
      ]
    : [{ type: 'first_frame', url: frame }];
  return {
    model,
    input: {
      prompt: (input.prompt || '').slice(0, 2400),
      media,
    },
    parameters: {
      resolution: mapResolution(input.resolution, env),
      duration: clipDuration(input.durationSec, model),
      watermark: env.DASHSCOPE_VIDEO_WATERMARK === '1',
    },
  };
}

function extractTaskId(data: any): string {
  return data?.output?.task_id || data?.task_id || '';
}

function extractVideoUrl(data: any): string {
  const u =
    data?.output?.video_url ||
    data?.output?.results?.[0]?.url ||
    data?.output?.videoUrl ||
    '';
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : '';
}

async function pollTask(
  taskId: string,
  env: NodeJS.ProcessEnv,
  onProgress?: VideoGenerateInput['onProgress'],
  modelLabel?: string,
): Promise<{ videoUrl: string; upstreamId: string; durationSec?: number }> {
  const apiKey = key(env);
  const base = host(env);
  const timeoutMs = Number(env.DASHSCOPE_VIDEO_POLL_TIMEOUT_MS || 10 * 60 * 1000);
  const intervalMs = Number(env.DASHSCOPE_VIDEO_POLL_MS || 8000);
  const start = Date.now();
  let lastStatus = 'PENDING';
  const tag = modelLabel || 'dashscope-i2v';

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const r = await fetch(`${base}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    const txt = await r.text();
    let data: any = {};
    try { data = JSON.parse(txt); } catch { /* ignore */ }
    if (!r.ok) {
      throw new Error(`dashscope-i2v poll ${r.status}: ${txt.slice(0, 200)}`);
    }
    const status = String(data?.output?.task_status || data?.task_status || '').toUpperCase();
    lastStatus = status || lastStatus;
    const pct = Math.min(0.92, (Date.now() - start) / timeoutMs);
    onProgress?.(pct, `${tag}: ${lastStatus}`);

    if (status === 'SUCCEEDED') {
      const videoUrl = extractVideoUrl(data);
      if (!videoUrl) throw new Error('dashscope-i2v succeeded but no video_url');
      const durationSec = data?.usage?.output_video_duration || data?.usage?.duration;
      onProgress?.(1, `${tag}: done`);
      return { videoUrl, upstreamId: taskId, durationSec };
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      const msg = data?.output?.message || data?.message || status;
      const code = data?.output?.code || data?.code || '';
      throw new Error(`dashscope-i2v ${status}${code ? ` [${code}]` : ''}: ${msg}`);
    }
  }
  throw new Error(`dashscope-i2v poll timeout (last=${lastStatus})`);
}

async function createAndPollOnce(
  input: VideoGenerateInput,
  model: string,
  env: NodeJS.ProcessEnv,
): Promise<VideoGenerateResult> {
  const apiKey = key(env);
  const base = host(env);
  const body = buildDashscopeI2vBody(input, env, model);
  input.onProgress?.(0.05, `dashscope-i2v: create ${model}`);

  const createRes = await fetch(`${base}/api/v1/services/aigc/video-generation/video-synthesis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const createTxt = await createRes.text();
  let createJson: any = {};
  try { createJson = JSON.parse(createTxt); } catch { /* ignore */ }
  if (!createRes.ok) {
    throw new Error(`dashscope-i2v create ${createRes.status}: ${createTxt.slice(0, 240)}`);
  }
  const taskId = extractTaskId(createJson);
  if (!taskId) throw new Error(`dashscope-i2v: no task_id (${createTxt.slice(0, 160)})`);

  const polled = await pollTask(taskId, env, input.onProgress, model);
  return {
    videoUrl: polled.videoUrl,
    provider: `dashscope-i2v:${model}`,
    upstreamId: polled.upstreamId,
    durationSec: polled.durationSec,
  };
}

/** 直连调用（不经 plugin registry）；FreeTierOnly 时按 VIDEO_MODELS 回退。 */
export async function generateDashscopeI2v(
  input: VideoGenerateInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VideoGenerateResult> {
  if (!hasDashscopeVideo(env)) throw new Error('dashscope-video not enabled');
  if (!input.firstFrameUrl) throw new Error('dashscope-i2v requires firstFrameUrl');

  const pool = resolveDashscopeVideoPool(env);
  return runWithModelPool(
    pool,
    (model) => createAndPollOnce(input, model, env),
    { label: input.label || 'i2v' },
  );
}

registerVideoProvider({
  id: 'dashscope-i2v',
  name: '阿里云百炼图生视频 (HappyHorse / wan3)',
  priority: 40,
  supportsImage2Video: true,
  supportsText2Video: false,
  supportsLastFrame: false,
  supportsSubjectReference: false,
  maxDurationSec: 30,
  available: () => hasDashscopeVideo(),
  async generate(input: VideoGenerateInput) {
    return generateDashscopeI2v(input);
  },
});
