/**
 * v12.203 — prosody 角色纠偏(纯函数)+ music BGM API 接线锁。
 */
import { describe, it, expect } from 'vitest';
import { characterProsodyBias, deriveProsody } from '@/lib/tts-prosody';
import fs from 'fs';

describe('v12.203 · prosody 角色纠偏 + AI 作曲', () => {
  it('性别线索:男角压低音高降速,女角提亮', () => {
    const male = characterProsodyBias('老陈大爷');
    expect(male.pitchDelta).toBeLessThan(0);
    const female = characterProsodyBias('林舒小姐');
    expect(female.pitchDelta).toBeGreaterThan(0);
    expect(characterProsodyBias('').pitchDelta).toBe(0); // 无名零偏
  });
  it('年龄线索:老者慢、孩童快而高', () => {
    expect(characterProsodyBias('王爷爷').speedMul).toBeLessThanOrEqual(0.92);
    const kid = characterProsodyBias('小娃娃');
    expect(kid.speedMul).toBeGreaterThanOrEqual(1.02);
    expect(kid.pitchDelta).toBeGreaterThan(0);
  });
  it('deriveProsody 叠加 character 后仍在合法区间', () => {
    const p = deriveProsody({ emotion: '激动', emotionTemperature: 8, character: '暴躁大叔' });
    expect(p.pitch).toBeGreaterThanOrEqual(-12);
    expect(p.pitch).toBeLessThanOrEqual(12);
    expect(p.speed).toBeGreaterThanOrEqual(0.5);
    expect(p.speed).toBeLessThanOrEqual(2.0);
    // 不传 character 行为不变(向后兼容)
    const noChar = deriveProsody({ emotion: '激动', emotionTemperature: 8 });
    expect(typeof noChar.pitch).toBe('number');
  });
  it('接线锁:orchestrator 传 speaker + music API 存 music 资产', () => {
    const orch = (fs.readFileSync('services/hybrid-orchestrator.ts','utf-8')+fs.readFileSync('services/agents/writer-agent.ts','utf-8')+fs.readFileSync('services/agents/editor-agent.ts','utf-8'));
    expect(orch).toContain('character: (t as any).speaker');
    expect(orch).toContain('speaker: (shot as any)?.characters?.[0]');
    const music = fs.readFileSync('app/api/projects/[id]/music/route.ts', 'utf-8');
    expect(music).toContain('generateMusic');
    expect(music).toContain("type: 'music'");
    const page = fs.readFileSync('app/projects/[id]/page.tsx', 'utf-8');
    expect(page).toContain('MusicGenPanel');
  });
});
