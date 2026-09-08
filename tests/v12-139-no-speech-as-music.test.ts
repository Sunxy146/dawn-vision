/**
 * v12.139 — 用户实测抓获:BGM 失败兜底曾用 TTS 朗读 prompt 冒充音乐(speech-02 念
 * 「诗意水墨风格背景音乐 第一幕…」),与旁白叠成重叠人声。回归锁:该兜底彻底废除。
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('v12.139 · 禁止 TTS 念稿冒充 BGM', () => {
  const src = fs.readFileSync('services/minimax.service.ts', 'utf-8');
  it('generateSpeechMusic 已彻底删除(定义与调用零残留)', () => {
    expect(src.includes('generateSpeechMusic')).toBe(false);
    expect(src.includes('[ambient music]')).toBe(false);
  });
  it('music 失败路径为抛错(上游落无 BGM + audioWarnings 诚实降级)', () => {
    expect(src).toContain('不再回退「TTS 念 prompt」');
    // 上游诚实降级路径存在
    const orch = (fs.readFileSync('services/hybrid-orchestrator.ts','utf-8')+fs.readFileSync('services/agents/writer-agent.ts','utf-8')+fs.readFileSync('services/agents/editor-agent.ts','utf-8'));
    expect(orch).toContain('BGM 生成失败, 成片为无配乐版本');
  });
});
