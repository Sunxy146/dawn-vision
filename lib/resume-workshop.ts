import type { Node } from '@xyflow/react';
import { AgentRole, type ChatMessage, type PipelineNodeData, type ProjectAsset } from '@/types/agents';

/** 资产类型 → 对应画布节点 */
const ASSET_NODE: Array<{ types: string[]; nodeId: string }> = [
  { types: ['plan'], nodeId: 'node-director' },
  { types: ['script'], nodeId: 'node-writer' },
  { types: ['character'], nodeId: 'node-character' },
  { types: ['scene', 'scene-anchor'], nodeId: 'node-scene' },
  { types: ['storyboard', 'storyboard-sketch'], nodeId: 'node-storyboard' },
  { types: ['video'], nodeId: 'node-video' },
  { types: ['timeline', 'final_video', 'music'], nodeId: 'node-editor' },
  { types: ['quality_report'], nodeId: 'node-producer' },
];

/** 全局指示条阶段名 → 画布节点（用于标记 running） */
export const PHASE_TO_NODE: Record<string, string> = {
  构思中: 'node-director',
  导演规划: 'node-director',
  编写剧本: 'node-writer',
  设计角色: 'node-character',
  构建场景: 'node-scene',
  分镜规划: 'node-storyboard',
  渲染分镜: 'node-storyboard',
  生成视频: 'node-video',
  节奏审计: 'node-editor',
  剪辑合成: 'node-editor',
  导演审核: 'node-producer',
};

/** 从落库 timeline + final_video 还原剪辑师节点所需的 editResult（含成片 URL） */
export function buildEditResultFromAssets(assets: ProjectAsset[]): Record<string, unknown> | null {
  const byUpdated = (a: ProjectAsset, b: ProjectAsset) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));

  const timelines = assets.filter((a) => a.type === 'timeline').sort(byUpdated);
  const finals = assets.filter((a) => a.type === 'final_video').sort(byUpdated);
  const finalUrl =
    finals[0]?.persistentUrl ||
    (Array.isArray(finals[0]?.mediaUrls) ? finals[0]!.mediaUrls[0] : '') ||
    '';

  let edit: Record<string, unknown> | null = null;
  const raw = timelines[0]?.data;
  if (raw && typeof raw === 'object') {
    edit = { ...(raw as Record<string, unknown>) };
  }

  if (finalUrl) {
    if (!edit) {
      const videos = assets
        .filter((a) => a.type === 'video')
        .map((a) => ({
          shotNumber: a.shotNumber ?? 0,
          videoUrl: a.persistentUrl || a.mediaUrls?.[0] || '',
          duration: (a.data as any)?.duration ?? 5,
        }))
        .filter((v) => !!v.videoUrl)
        .sort((a, b) => a.shotNumber - b.shotNumber);
      edit = {
        timeline: videos,
        totalDuration: videos.reduce((s, v) => s + (v.duration || 0), 0),
        videoCount: videos.length,
        finalVideoUrl: finalUrl,
      };
    } else if (!edit.finalVideoUrl) {
      edit.finalVideoUrl = finalUrl;
    } else {
      // 成片资产优先（脚本补渲/重合成后比旧 timeline 里的 URL 更新）
      edit.finalVideoUrl = finalUrl;
    }
  }

  if (!edit) return null;
  if (!edit.timeline && !edit.finalVideoUrl) return null;
  return edit;
}

/** 按已落库资产给节点打 completed / running，并为剪辑师注入 editResult */
export function applyProgressToNodes(
  nodes: Node<PipelineNodeData>[],
  assets: ProjectAsset[],
  runningPhase?: string | null,
): Node<PipelineNodeData>[] {
  const types = new Set(assets.map((a) => a.type));
  const completed = new Set<string>();
  for (const { types: ts, nodeId } of ASSET_NODE) {
    if (ts.some((t) => types.has(t))) completed.add(nodeId);
  }
  // 有剧本时，导演计划视为已过（即使 plan 资产缺失）
  if (types.has('script')) completed.add('node-director');

  const runningId = runningPhase ? PHASE_TO_NODE[runningPhase] : undefined;
  const editResult = buildEditResultFromAssets(assets);
  const editorAssets = assets.filter((a) =>
    ['timeline', 'final_video', 'music', 'video'].includes(a.type),
  );

  return nodes.map((n) => {
    if (n.id === 'node-editor' && editResult) {
      return {
        ...n,
        data: {
          ...n.data,
          status: 'completed',
          progress: 100,
          editResult,
          assets: editorAssets,
        } as any,
      };
    }
    if (completed.has(n.id)) {
      return { ...n, data: { ...n.data, status: 'completed', progress: 100 } };
    }
    if (runningId && n.id === runningId) {
      return { ...n, data: { ...n.data, status: 'running', progress: Math.max(n.data.progress || 15, 15) } };
    }
    return n;
  });
}

/** 根据资产拼几条可读的对话气泡（原 SSE 对话不落库） */
export function buildResumeChatMessages(
  projectId: string,
  assets: ProjectAsset[],
  idea?: string,
): Array<{ role: AgentRole; message: ChatMessage }> {
  const ts = new Date().toISOString();
  const out: Array<{ role: AgentRole; message: ChatMessage }> = [];
  const push = (role: AgentRole, id: string, content: string) => {
    out.push({
      role,
      message: { id, projectId, agentRole: role, role: 'assistant', content, createdAt: ts },
    });
  };

  push(
    AgentRole.WRITER,
    `msg-resume-${projectId}`,
    `已从项目恢复工坊工作区。${idea ? `\n\n创意：「${idea.slice(0, 120)}${idea.length > 120 ? '…' : ''}」` : ''}\n\n以下按已落库资产还原进度（历史对话气泡不持久化）。`,
  );

  const plan = assets.find((a) => a.type === 'plan');
  if (plan) {
    const d = plan.data || {};
    push(
      AgentRole.WRITER,
      `msg-resume-plan-${projectId}`,
      `导演计划已落库：${(d as any).genre || '风格'} · 角色 ${(d as any).characters?.length ?? '—'} · 场景 ${(d as any).scenes?.length ?? '—'}。`,
    );
  }

  const script = assets.find((a) => a.type === 'script');
  if (script) {
    const d = script.data || {};
    push(
      AgentRole.WRITER,
      `msg-resume-script-${projectId}`,
      `剧本「${(d as any).title || script.name || '未命名'}」已落库，共 ${(d as any).shots?.length ?? 0} 个镜头。`,
    );
  }

  const chars = assets.filter((a) => a.type === 'character');
  if (chars.length) {
    push(AgentRole.CHARACTER_DESIGNER, `msg-resume-chars-${projectId}`, `${chars.length} 个角色资产已落库。`);
  }

  const scenes = assets.filter((a) => a.type === 'scene' || a.type === 'scene-anchor');
  if (scenes.length) {
    push(AgentRole.SCENE_DESIGNER, `msg-resume-scenes-${projectId}`, `${scenes.length} 个场景资产已落库。`);
  }

  const boards = assets.filter((a) => a.type === 'storyboard' || a.type === 'storyboard-sketch');
  if (boards.length) {
    push(AgentRole.STORYBOARD, `msg-resume-sb-${projectId}`, `${boards.length} 个分镜资产已落库。`);
  }

  const videos = assets.filter((a) => a.type === 'video');
  if (videos.length) {
    push(AgentRole.VIDEO_PRODUCER, `msg-resume-vid-${projectId}`, `${videos.length} 个视频片段已落库。`);
  }

  const final = assets.find((a) => a.type === 'final_video');
  if (final) {
    push(
      AgentRole.EDITOR,
      `msg-resume-final-${projectId}`,
      '最终成片已落库。可在剪辑师节点点击「播放成片」预览。',
    );
  }

  return out;
}

/** 根据资产推断当前阶段中文名（无进行中记录时用） */
export function inferPhaseFromAssets(assets: ProjectAsset[]): string {
  const types = new Set(assets.map((a) => a.type));
  // 仅有 quality_report/timeline、没有视频时，不能算完成（早期失败落库会误判）
  if (types.has('final_video')) return '完成';
  if (types.has('video') && types.has('quality_report')) return '完成';
  if (types.has('video') && (types.has('timeline') || types.has('music'))) return '剪辑合成';
  if (types.has('video')) return '生成视频';
  if (types.has('storyboard') || types.has('storyboard-sketch')) return '生成视频';
  if (types.has('scene') || types.has('scene-anchor')) return '构建场景';
  if (types.has('character')) return '设计角色';
  if (types.has('script')) return '编写剧本';
  if (types.has('plan')) return '编写剧本';
  return '导演规划';
}
