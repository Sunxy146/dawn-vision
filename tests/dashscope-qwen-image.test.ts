import { describe, expect, it } from 'vitest';
import {
  buildDashscopeImageBody,
  dashscopeImageSize,
  extractDashscopeImageUrl,
  hasDashscopeImage,
  isWan26ImageModel,
  resolveDashscopePoolForInput,
} from '@/lib/image-providers/dashscope-qwen-image';

describe('dashscope-qwen-image', () => {
  it('maps aspect to fixed qwen-image sizes', () => {
    expect(dashscopeImageSize('9:16', 'qwen-image-plus')).toBe('928*1664');
    expect(dashscopeImageSize('1:1', 'qwen-image-plus')).toBe('1328*1328');
    expect(dashscopeImageSize('16:9', 'qwen-image-plus')).toBe('1664*928');
  });

  it('maps aspect to wan2.7-image 2K sizes', () => {
    expect(dashscopeImageSize('16:9', 'wan2.7-image-pro')).toBe('2688*1536');
    expect(dashscopeImageSize('9:16', 'wan2.7-image')).toBe('1536*2688');
    expect(dashscopeImageSize('1:1', 'wan2.7-image-pro')).toBe('2048*2048');
  });

  it('maps aspect to wan2.6-t2i sizes', () => {
    expect(isWan26ImageModel('wan2.6-t2i')).toBe(true);
    expect(dashscopeImageSize('9:16', 'wan2.6-t2i')).toBe('960*1696');
    expect(dashscopeImageSize('1:1', 'wan2.6-t2i')).toBe('1280*1280');
    expect(dashscopeImageSize('16:9', 'wan2.6-t2i')).toBe('1696*960');
  });

  it('builds multimodal-generation body', () => {
    const body = buildDashscopeImageBody(
      { prompt: 'cat', aspectRatio: '9:16' },
      { DASHSCOPE_IMAGE_MODEL: 'wan2.6-t2i' } as NodeJS.ProcessEnv,
    );
    expect(body.model).toBe('wan2.6-t2i');
    expect(body.parameters.size).toBe('960*1696');
    expect(body.input.messages[0].content[0]).toEqual({ text: 'cat' });
  });

  it('builds I2I body with reference images first', () => {
    const body = buildDashscopeImageBody(
      { prompt: 'boy in park', aspectRatio: '16:9', cref: 'https://face.png' },
      { DASHSCOPE_IMAGE_MODEL: 'qwen-image-3.0-pro' } as NodeJS.ProcessEnv,
      'qwen-image-3.0-pro',
      ['https://face.png', 'data:image/png;base64,xxx'],
    );
    const content = body.input.messages[0].content;
    expect(content[0]).toEqual({ image: 'https://face.png' });
    expect(content[1]).toEqual({ image: 'data:image/png;base64,xxx' });
    expect((content[2] as { text: string }).text).toMatch(/facial likeness/);
    expect((content[2] as { text: string }).text).toContain('boy in park');
  });

  it('prefers I2I-capable pool when refs present', () => {
    const pool = resolveDashscopePoolForInput(
      { prompt: 'x', cref: 'https://a.png' },
      {
        DASHSCOPE_IMAGE_MODEL: 'wan2.7-image-pro',
        DASHSCOPE_IMAGE_MODELS: 'wan2.7-image-pro,wan2.6-t2i,qwen-image-plus',
      } as NodeJS.ProcessEnv,
    );
    expect(pool).toContain('wan2.7-image-pro');
    expect(pool).toContain('qwen-image-plus');
    expect(pool).not.toContain('wan2.6-t2i');
  });

  it('uses thinking_mode for wan2.7-image (no prompt_extend)', () => {
    const body = buildDashscopeImageBody(
      { prompt: 'cinematic portrait', aspectRatio: '16:9' },
      { DASHSCOPE_IMAGE_MODEL: 'wan2.7-image-pro', DASHSCOPE_IMAGE_THINKING: '1' } as NodeJS.ProcessEnv,
    );
    expect(body.model).toBe('wan2.7-image-pro');
    expect(body.parameters.thinking_mode).toBe(true);
    expect(body.parameters.prompt_extend).toBeUndefined();
    expect(body.parameters.size).toBe('2688*1536');
  });

  it('extracts image url from choices', () => {
    const url = extractDashscopeImageUrl({
      output: { choices: [{ message: { content: [{ image: 'https://cdn.example/a.png' }] } }] },
    });
    expect(url).toBe('https://cdn.example/a.png');
  });

  it('available only when enabled + key', () => {
    expect(hasDashscopeImage({} as NodeJS.ProcessEnv)).toBe(false);
    expect(hasDashscopeImage({ DASHSCOPE_IMAGE_ENABLED: '1' } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      hasDashscopeImage({
        DASHSCOPE_IMAGE_ENABLED: '1',
        DASHSCOPE_API_KEY: 'sk-x',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('generateDashscopeImage is exported for direct orchestrator calls', async () => {
    expect(typeof (await import('@/lib/image-providers/dashscope-qwen-image')).generateDashscopeImage).toBe('function');
  });
});
