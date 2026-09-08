'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PipelineNodeData } from '@/types/agents';
import { NodeShell } from './node-shell';
import { FilmStrip as Film, CircleNotch as Loader2, CheckCircle as CheckCircle2, Clock, Camera, Sun, Palette, ArrowRight as MoveRight, ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';
import { useProjectWorkspaceStore } from '@/lib/store';
import { getToken } from '@/lib/auth';
import { dedupeAssetsByShotNumber } from '@/lib/dedupe-shot-assets';

// Runway-style camera icon mapping
const CAMERA_ICONS: Record<string, string> = {
  '远景': '🔭', '全景': '🏔️', '中景': '🎥', '近景': '👤', '特写': '🔍',
  '大特写': '🔬', '俯拍': '⬇️', '仰拍': '⬆️', '平拍': '➡️', '跟拍': '🏃',
};

function StoryboardNodeComponent({ data }: NodeProps) {
  const d = data as unknown as PipelineNodeData;
  const storyboards = dedupeAssetsByShotNumber(
    (d.assets?.filter(a => a.type === 'storyboard') || []) as any[],
  );
  const sketchByShot = new Map<number, string>(
    (d.assets?.filter(a => a.type === 'storyboard-sketch') || [])
      .map(a => [a.shotNumber as number, a.mediaUrls?.[0] || ''])
      .filter(([, u]) => !!u) as Array<[number, string]>,
  );
  const scriptShots: any[] = (d.assets?.find(a => a.type === 'script')?.data as any)?.shots || [];
  const beatsByShot = new Map<number, any[]>(
    scriptShots.filter(s => Array.isArray(s?.beats) && s.beats.length).map(s => [s.shotNumber, s.beats]),
  );
  const projectId = useProjectWorkspaceStore((s) => s.currentProject?.id);
  const updateAsset = useProjectWorkspaceStore((s) => s.updateAsset);
  const [regenBusy, setRegenBusy] = useState<number | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  const regenShot = async (shotNumber: number, assetId: string, prompt: string) => {
    if (!projectId || regenBusy !== null) return;
    setRegenBusy(shotNumber);
    setRegenError(null);
    try {
      const token = getToken();
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/regenerate-storyboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          shotNumber,
          customPrompt: prompt || `Shot ${shotNumber}`,
          useStyleBible: true,
          useCref: true,
          aspectRatio: '9:16',
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        let err: any = {};
        try { err = text ? JSON.parse(text) : {}; } catch { err = { message: text }; }
        throw new Error(err.error || err.message || `失败 ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let imageUrl = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'complete' && ev.imageUrl) imageUrl = ev.imageUrl;
            if (ev.type === 'error') throw new Error(ev.message || '重生失败');
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }
      if (!imageUrl) throw new Error('未返回新图');
      updateAsset(assetId, { mediaUrls: [imageUrl] });
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : '重生失败');
    } finally {
      setRegenBusy(null);
    }
  };

  return (
    <NodeShell status={d.status} color="cyan" className="min-w-[360px] max-w-[460px]" agentRole={d.agentRole}>
      <Handle type="target" position={Position.Left} className="!w-4 !h-4 !bg-cyan-500 !border-2 !border-[#141414] !rounded-full hover:!scale-125 !transition-transform" />

      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/20 grid place-items-center">
          <Film className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            分镜师
            {d.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-green-400 animate-spin" />}
            {d.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
            {d.status === 'pending' && <Clock className="w-3.5 h-3.5 text-gray-500" />}
          </div>
          <div className="text-[11px] text-gray-400">分镜脚本 · 镜头语言设计</div>
        </div>
        {d.status === 'running' && <span className="text-[10px] text-green-400 font-medium">{d.progress}%</span>}
      </div>

      {storyboards.length > 0 ? (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
          {storyboards.map((sb) => {
            const planData = sb.data?.planData || {};
            const cameraIcon = CAMERA_ICONS[planData.cameraAngle] || '🎥';
            const prompt = sb.data?.description || sb.data?.prompt || sb.data?.visualPrompt || sb.name || '';

            return (
              <div key={sb.id} className="bg-black/20 rounded-xl p-2.5 group border border-transparent hover:border-cyan-500/20 transition-all relative">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">
                    S{sb.shotNumber || '?'}
                  </span>
                  {planData.cameraAngle && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-cyan-300/80 bg-cyan-500/10 px-1.5 py-0.5 rounded-md">
                      <Camera className="w-2.5 h-2.5" />{cameraIcon} {planData.cameraAngle}
                    </span>
                  )}
                  {planData.lighting && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-amber-300/80 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                      <Sun className="w-2.5 h-2.5" />{planData.lighting}
                    </span>
                  )}
                  {planData.colorTone && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-pink-300/80 bg-[#D4A830]/08 px-1.5 py-0.5 rounded-md">
                      <Palette className="w-2.5 h-2.5" />{planData.colorTone}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!projectId || regenBusy !== null || !sb.shotNumber}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (sb.shotNumber) regenShot(sb.shotNumber, sb.id, prompt);
                    }}
                    title="重新生成这一镜分镜图"
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/10 disabled:opacity-30"
                  >
                    {regenBusy === sb.shotNumber
                      ? <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                      : <RefreshCw className="w-3 h-3 text-gray-400 hover:text-cyan-300" />}
                  </button>
                </div>

                {(sb.mediaUrls?.[0] || sketchByShot.get(sb.shotNumber as number)) ? (
                  <div className="flex gap-1.5 mb-1.5">
                    {sb.mediaUrls?.[0] && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={sb.mediaUrls[0]} alt={`Shot ${sb.shotNumber}`} className="h-20 rounded-lg border border-white/10 object-cover flex-1 min-w-0" />
                    )}
                    {sketchByShot.get(sb.shotNumber as number) && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={sketchByShot.get(sb.shotNumber as number)} alt="构图草图" title="构图草图(草图锁)" className="h-20 w-14 rounded-lg border border-cyan-500/30 object-cover shrink-0 opacity-80" />
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!projectId || regenBusy !== null || !sb.shotNumber}
                    onClick={() => sb.shotNumber && regenShot(sb.shotNumber, sb.id, prompt)}
                    className="mb-1.5 w-full h-16 rounded-lg border border-dashed border-cyan-500/30 text-[10px] text-cyan-300/80 hover:bg-cyan-500/10 disabled:opacity-40"
                  >
                    {regenBusy === sb.shotNumber ? '生成中…' : '无图 · 点击重新生成'}
                  </button>
                )}

                <div className="text-[11px] text-gray-300 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                  {sb.data?.description || sb.name}
                </div>

                {beatsByShot.get(sb.shotNumber as number)?.length ? (
                  <div className="mt-2 space-y-1 border-l-2 border-cyan-500/30 pl-2">
                    {beatsByShot.get(sb.shotNumber as number)!.map((b: any, bi: number) => (
                      <div key={bi} className="flex gap-1.5 text-[10px] leading-snug">
                        <span className="shrink-0 font-mono text-cyan-400/90 tabular-nums">{b.ts}</span>
                        <span className="text-gray-300 min-w-0">
                          {Array.isArray(b.characters) && b.characters.length ? <span className="text-emerald-300/80">👤{b.characters.join('/')} </span> : null}
                          {b.scene ? <span className="text-cyan-200/70">🏞{b.scene} </span> : null}
                          {b.action}
                          {b.camera ? <span className="text-gray-500"> · 🎥{b.camera}</span> : null}
                          {b.microExpression ? <span className="text-violet-300/80"> · 😶{b.microExpression}</span> : null}
                          {b.speedRamp ? <span className="text-amber-300/80"> · ⏱{b.speedRamp}</span> : null}
                          {b.mood ? <span className="text-rose-300/70"> · {b.mood}</span> : null}
                          {b.dialogue ? <span className="text-cyan-300/80"> · 💬{b.dialogue}</span> : null}
                        </span>
                      </div>
                    ))}
                    {(() => {
                      const ms = scriptShots.find((s) => s.shotNumber === sb.shotNumber)?.mustShow;
                      return Array.isArray(ms) && ms.length ? (
                        <div className="flex gap-1.5 text-[10px] leading-snug pt-0.5">
                          <span className="shrink-0 text-yellow-400/90">必现</span>
                          <span className="text-yellow-200/70 min-w-0">{ms.join(' · ')}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : null}

                {planData.transitionNote && (
                  <div className="flex items-center gap-1 mt-1.5 text-[9px] text-gray-500">
                    <MoveRight className="w-2.5 h-2.5" />
                    <span>{planData.transitionNote}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-500 text-xs">
          {d.status === 'pending' ? '等待场景设计完成...' : d.status === 'running' ? '分镜脚本编写中...' : ''}
        </div>
      )}

      {d.status === 'running' && (
        <div className="mt-3">
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full transition-all duration-500" style={{ width: `${d.progress}%` }} />
          </div>
        </div>
      )}

      {regenError && (
        <div className="mt-2 text-[10px] text-red-300/80 bg-red-900/20 border border-red-500/20 rounded px-2 py-1">
          重生失败: {regenError}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-4 !h-4 !bg-cyan-500 !border-2 !border-[#141414] !rounded-full hover:!scale-125 !transition-transform" />
    </NodeShell>
  );
}

export const StoryboardNode = memo(StoryboardNodeComponent);
