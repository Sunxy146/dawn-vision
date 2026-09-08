import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDashscopeFreeTierExhausted,
  isDashscopeQuotaError,
  markDashscopeFreeTierExhausted,
  parseModelList,
  prioritizeDashscopePool,
  resolveDashscopeImagePool,
  resolveDashscopeVideoPool,
  runWithModelPool,
} from '@/lib/dashscope-model-pool';

describe('dashscope-model-pool', () => {
  afterEach(() => {
    clearDashscopeFreeTierExhausted();
  });

  it('parses and dedupes model lists', () => {
    expect(parseModelList('a,b', 'b, c')).toEqual(['a', 'b', 'c']);
  });

  it('resolves image pool with primary first and appends defaults', () => {
    const pool = resolveDashscopeImagePool({
      DASHSCOPE_IMAGE_MODEL: 'qwen-image-3.0-pro',
      DASHSCOPE_IMAGE_MODELS: 'qwen-image-2.0-pro-2026-06-22,qwen-image-3.0-pro',
    } as NodeJS.ProcessEnv);
    expect(pool[0]).toBe('qwen-image-3.0-pro');
    expect(pool).toContain('qwen-image-2.0-pro-2026-06-22');
    expect(pool).toContain('wan2.7-image-pro');
    expect(pool).toContain('qwen-image-max');
  });

  it('resolves video i2v pool and appends defaults', () => {
    const pool = resolveDashscopeVideoPool({
      DASHSCOPE_VIDEO_MODEL: 'wan2.7-i2v',
      DASHSCOPE_VIDEO_MODELS: 'wan2.6-i2v-flash,wan3.0-video',
    } as NodeJS.ProcessEnv);
    expect(pool[0]).toBe('wan2.7-i2v');
    expect(pool).toContain('wan2.6-i2v-flash');
    expect(pool).toContain('wan2.7-i2v-2026-04-25');
  });

  it('detects FreeTierOnly', () => {
    expect(isDashscopeQuotaError(new Error('403 AllocationQuota.FreeTierOnly'))).toBe(true);
  });

  it('falls through retryable models and remembers FreeTier exhaustion', async () => {
    const tried: string[] = [];
    const out = await runWithModelPool(['dead', 'alive'], async (m) => {
      tried.push(m);
      if (m === 'dead') throw new Error('403 FreeTierOnly');
      return m;
    });
    expect(out).toBe('alive');
    expect(tried).toEqual(['dead', 'alive']);
    expect(prioritizeDashscopePool(['dead', 'alive'])[0]).toBe('alive');
  });

  it('skips previously exhausted models first on next call', async () => {
    markDashscopeFreeTierExhausted('dead');
    const tried: string[] = [];
    const out = await runWithModelPool(['dead', 'alive'], async (m) => {
      tried.push(m);
      return m;
    });
    expect(out).toBe('alive');
    expect(tried).toEqual(['alive']);
  });
});
