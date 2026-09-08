/**
 * v12.168 — TTS 语种直达:registry 不再滤多语、builtins 透传、service language_boost。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('v12.168 · TTS 语种链', () => {
  it('builtins:supportedLanguages=[](任意)+ 透传 language', () => {
    const t = fs.readFileSync('lib/tts-providers/builtins.ts', 'utf-8');
    expect(t).toContain('supportedLanguages: []');
    expect(t).toContain('language: input.language');
  });
  it('tts.service:LANGUAGE_BOOST 覆盖 9 语种,body 带 language_boost,日志可见', () => {
    const s = fs.readFileSync('services/tts.service.ts', 'utf-8');
    for (const code of ['ja-JP', 'ko-KR', 'ru-RU', 'zh-CN', 'en-US']) expect(s).toContain(`'${code}'`);
    expect(s).toContain('body.language_boost = boost');
    expect(s).toContain('lang=${boost');
  });
  it('orchestrator 配音调用带 ttsLangCode(已有,回归锁)', () => {
    expect((fs.readFileSync('services/hybrid-orchestrator.ts','utf-8')+fs.readFileSync('services/agents/writer-agent.ts','utf-8')+fs.readFileSync('services/agents/editor-agent.ts','utf-8'))).toContain('language: ttsLangCode(ctx.targetLanguage())');
  });
});
